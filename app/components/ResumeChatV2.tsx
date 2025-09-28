"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, ToolUIPart, TextUIPart, ReasoningUIPart, isToolUIPart } from 'ai';
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { MarkdownRenderer } from './MarkdownRenderer';
import { Button } from "@/components/ui/button";
import Image from "next/image";
// AI elements UI kit
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Loader } from "@/components/ai-elements/loader";
import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources";
import {
  Artifact,
  ArtifactAction,
  ArtifactActions,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from "@/components/ai-elements/artifact";
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
  ChainOfThoughtSearchResults,
  ChainOfThoughtSearchResult,
} from "@/components/ai-elements/chain-of-thought";
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputSubmit,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';
import {
  CopyIcon,
  RefreshCwIcon,
  Edit2Icon,
  CheckIcon,
  BotIcon,
  UserIcon,
  Plus,
  Search as SearchIcon,
  Target as TargetIcon,
  Globe as GlobeIcon,
  FileText as FileTextIcon,
  Brain as BrainIcon,
  ListChecks as ListChecksIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CitationTooltip } from "@/components/ui/citation-tooltip";
import { EchoCitationTooltip } from "@/components/ui/echo-citation-tooltip";
import { parseCitations } from '@/lib/citation-parser';
import { postProcessResponse } from '@/lib/response-formatter';
import { validateAndCleanCitations } from '@/lib/citation-validator';
import { IdMapping } from '@/types/chat';
import type { Citation } from '@/types/chat';
import { buildIdMapping } from '@/lib/id-mapping';
import type {
  ResumeChatDataParts,
  ResumeChatMessage,
  ResumeWebSearchOutput,
  ScrapePortfolioOutput,
  SearchExactOutput,
  SearchSemanticOutput,
  SearchPageContentOutput,
  FetchResumeDataOutput,
} from '@/types/resumeChat';

const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.replace(
  /.cloud$/,
  ".site"
);

// Types for BlockNote content structure as stored in database
type InlineContentItem =
  | string
  | { type: 'text'; text: string; styles?: Record<string, unknown> }
  | { type: 'link'; href: string; content: InlineContentItem[] }
  | { type: string; [key: string]: unknown };

type ContentBlock = {
  type?: string;
  content?: InlineContentItem[];
  [key: string]: unknown;
};

interface CitationClickOptions {
  echoPointNumber?: number;
}

type CitationClickHandler = (type: string, id: string, text: string, options?: CitationClickOptions) => void;

interface ResumeChatProps {
  resumeId: Id<"resumes">;
  className?: string;
  onCitationClick?: CitationClickHandler;
  projects?: Array<{
    _id: string;
    title: string;
    description?: string;
    [key: string]: unknown;
  }>;
  bulletPointsByProject?: { [key: string]: Array<{
    _id: string;
    content: string;
    [key: string]: unknown;
  }> };
  dynamicFiles?: Array<{
    _id: string;
    title: string;
    [key: string]: unknown;
  }>;
  branchesByBulletPoint?: { [key: string]: Array<{
    _id: string;
    content: string;
    [key: string]: unknown;
  }> };
}

type PipelineTask = {
  step: string;
  label: string;
  status: 'pending' | 'complete';
  message?: string;
  tone?: ResumeChatDataParts['status']['tone'];
};

interface ArtifactAttributes {
  title?: string;
  description?: string;
  updated?: string;
  actions?: string[];
}

type MessageSegment =
  | { type: 'artifact'; content: string; attributes: ArtifactAttributes }
  | { type: 'text'; content: string };

const parseArtifactAttributes = (rawAttributes: string): ArtifactAttributes => {
  const attributes: ArtifactAttributes = {};
  const attrRegex = /(\w[\w-]*)=("([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;

  while ((match = attrRegex.exec(rawAttributes)) !== null) {
    const key = match[1]?.toLowerCase();
    const value = (match[3] ?? match[4] ?? '').trim();
    if (!key) continue;

    if (key === 'title' || key === 'description' || key === 'updated') {
      (attributes as Record<string, string>)[key] = value;
      continue;
    }

    if (key === 'timestamp') {
      attributes.updated = attributes.updated ?? value;
      continue;
    }

    if (key === 'actions') {
      attributes.actions = value
        .split(',')
        .map((action) => action.trim().toLowerCase())
        .filter(Boolean);
    }
  }

  return attributes;
};

const stripArtifactTags = (value: string) =>
  value.replace(/<\/??artifact\b[^>]*>/gi, '');

const STATUS_LABELS: Record<string, string> = {
  preflight: 'Syncing resume context',
  resume_data: 'Fetching resume data',
  search_exact: 'Searching exact matches',
  search_semantic: 'Exploring semantic evidence',
  page_lookup: 'Opening project docs',
  portfolio: 'Scraping portfolio content',
  web_search: 'Checking web updates',
  response: 'Preparing answer',
};

const PIPELINE_STEP_ORDER = Object.keys(STATUS_LABELS);

const sortPipelineTasks = (tasks: PipelineTask[]): PipelineTask[] => {
  const getOrderIndex = (step: string) => {
    const index = PIPELINE_STEP_ORDER.indexOf(step);
    return index === -1 ? PIPELINE_STEP_ORDER.length : index;
  };

  return tasks
    .map((task, originalIndex) => ({ task, originalIndex }))
    .sort((a, b) => {
      const orderDiff = getOrderIndex(a.task.step) - getOrderIndex(b.task.step);
      return orderDiff !== 0 ? orderDiff : a.originalIndex - b.originalIndex;
    })
    .map(({ task }) => task);
};

const createInitialPipelineTasks = (): PipelineTask[] =>
  sortPipelineTasks([
    { step: 'preflight', label: STATUS_LABELS.preflight, status: 'pending' },
    { step: 'response', label: STATUS_LABELS.response, status: 'pending' },
  ]);

// Enhanced Custom Markdown Renderer with Citation Support
function CustomMarkdownRenderer({
  content,
  citations,
  onCitationClick,
  projects,
  bulletPointsByProject,
  dynamicFiles,
  audioTranscriptions
}: {
  content: string;
  citations: Citation[];
  onCitationClick?: CitationClickHandler;
  projects?: Array<{
    _id: string;
    title: string;
    description?: string;
    [key: string]: unknown;
  }>;
  bulletPointsByProject?: { [key: string]: Array<{
    _id: string;
    content: string;
    [key: string]: unknown;
  }> };
  dynamicFiles?: Array<{
    _id: string;
    title: string;
    [key: string]: unknown;
  }>;
  audioTranscriptions?: Array<{
    _id: string;
    dynamicFileId: string;
    fileName: string;
    transcription: string;
    segments?: Array<{
      text: string;
      start: number;
      end: number;
    }>;
    summary?: {
      points: Array<{
        text: string;
        segmentReferences?: Array<{
          segmentIndex: number;
          start: number;
          end: number;
          originalText: string;
        }>;
      }>;
      generatedAt: number;
    };
  }>;
}) {
  // Render citation component
  const renderCitation = (match: RegExpExecArray): React.ReactNode => {
    const index = parseInt(match[1]);
    const citation = citations[index];
    if (!citation) return null;

    const citationCounter = index + 1;

    // Handle different citation types with appropriate components
    if (citation.type === 'echo' || citation.type === 'audio-summary') {
      // Handle echo/audio summary citations
      const pointNumber = citation.timestamp; // Point number is stored in timestamp field

      // Find the actual echo content from audioTranscriptions
      let echoContent = undefined;
      if (audioTranscriptions && pointNumber) {
        // Get all transcriptions for this page
        const pageTranscriptions = audioTranscriptions.filter(t => t.dynamicFileId === citation.convexId);

        // Calculate which transcription and point within that transcription
        let globalPointCounter = 0;
        for (const trans of pageTranscriptions) {
          if (trans.summary && trans.summary.points) {
            for (const point of trans.summary.points) {
              globalPointCounter++;
              if (globalPointCounter === pointNumber) {
                echoContent = point.text;
                break;
              }
            }
            if (echoContent) break;
          }
        }
      }

      // Use the found echo content, or fall back to citation text
      const tooltipContent = echoContent || citation.fullText || citation.text;

      return (
        <EchoCitationTooltip
          key={`citation-${index}`}
          pointNumber={pointNumber || 0}
          content={tooltipContent}
        >
          <span
            className="inline-flex items-center justify-center cursor-pointer ml-1 mr-0.5 px-1.5 min-w-[18px] h-[18px] rounded-md bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-[10px] font-medium text-neutral-700 dark:text-neutral-300 transition-all duration-200 hover:scale-105 align-baseline relative -top-[1px]"
            onClick={(e) => {
              e.stopPropagation();
              onCitationClick?.('page', citation.convexId, citation.text, {
                echoPointNumber: pointNumber,
              });
            }}
            data-citation-type="echo"
            data-citation-id={citation.simpleId}
            data-point-number={pointNumber}
          >
            {citationCounter}
          </span>
        </EchoCitationTooltip>
      );
    } else if (citation.type === 'page') {
      const page = dynamicFiles?.find(f => f._id === citation.convexId);
      return (
        <PageCitation
          key={`citation-${index}`}
          text={citation.text}
          id={citation.convexId}
          num={citationCounter}
          onClick={() => onCitationClick?.(citation.type, citation.convexId, citation.text)}
          page={page}
        />
      );
    } else {
      return (
        <Citation
          key={`citation-${index}`}
          type={citation.type}
          text={citation.text}
          id={citation.convexId}
          num={citationCounter}
          onClick={() => onCitationClick?.(citation.type, citation.convexId, citation.text)}
          projects={projects}
          bulletPointsByProject={bulletPointsByProject}
        />
      );
    }
  };

  return (
    <MarkdownRenderer
      content={content}
      renderCitation={renderCitation}
      className="text-sm leading-relaxed"
    />
  );
}

// Message with Sources Component
interface MessageWithSourcesProps {
  message: ResumeChatMessage;
  textPart: TextUIPart;
  messageIndex: number;
  isLastMessage: boolean;
  editingMessageId: string | null;
  editedText: string;
  setEditedText: (text: string) => void;
  handleSaveEdit: (index: number) => void;
  handleCancelEdit: () => void;
  handleCopyMessage: (id: string, content: string) => void;
  copiedMessageId: string | null;
  handleEditMessage: (index: number, text: string) => void;
  handleRegenerateResponse: () => void;
  messageMetrics: Record<string, { startTime: number; endTime?: number; tokenEstimate?: number }>;
  _onCitationClick?: CitationClickHandler;
  idMapping: IdMapping;
  projects?: Array<{ _id: string; title: string; [key: string]: unknown }>;
  bulletPointsByProject?: Record<string, Array<{ _id: string; content: string; [key: string]: unknown }>>;
  dynamicFiles?: Array<{ _id: string; title: string; [key: string]: unknown }>;
  audioTranscriptions?: Array<{
    _id: string;
    dynamicFileId: string;
    fileName: string;
    transcription: string;
    segments?: Array<{
      text: string;
      start: number;
      end: number;
    }>;
    summary?: {
      points: Array<{
        text: string;
        segmentReferences?: Array<{
          segmentIndex: number;
          start: number;
          end: number;
          originalText: string;
        }>;
      }>;
      generatedAt: number;
    };
  }>;
}

const pickStringField = (item: Record<string, unknown> | undefined, fields: string[]): string | undefined => {
  if (!item) return undefined;
  for (const field of fields) {
    const value = item[field];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

const stripInlineMarkdown = (value: string) =>
  value
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/[*_]/g, '')
    .trim();

const buildReasoningPreview = (rawText: string, title: string) => {
  const flattened = stripInlineMarkdown(rawText.replace(/\s+/g, ' ').trim());
  if (!flattened) {
    return '';
  }

  const normalizedTitle = stripInlineMarkdown(title);
  if (normalizedTitle && flattened.toLowerCase().startsWith(normalizedTitle.toLowerCase())) {
    return flattened.slice(normalizedTitle.length).trim();
  }

  return flattened;
};

type KnownToolOutput =
  | ResumeWebSearchOutput
  | ScrapePortfolioOutput
  | SearchExactOutput
  | SearchSemanticOutput
  | SearchPageContentOutput
  | FetchResumeDataOutput
  | string
  | Record<string, unknown>
  | undefined;

const isErrorResult = (value: KnownToolOutput): value is { success: false; error?: unknown } => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!('success' in value)) {
    return false;
  }
  return value.success === false;
};

function ToolOutputCard({ toolPart, inline = false }: { toolPart: ToolUIPart; inline?: boolean }) {
  if (toolPart.state !== 'output-available') {
    return null;
  }

  const toolKey = toolPart.type?.replace(/^tool-/, '') ?? 'tool';
  const output = toolPart.output as KnownToolOutput;
  const outputObject = typeof output === 'object' && output !== null ? (output as Record<string, unknown>) : null;

  if (!output) {
    return null;
  }

  const formatJSON = (value: unknown) => {
    try {
      const serialized = JSON.stringify(value, null, 2);
      return (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-neutral-50 dark:bg-neutral-900/60 p-2 text-[11px] text-neutral-500 dark:text-neutral-400">
          {serialized}
        </pre>
      );
    } catch (error) {
      console.error('Failed to stringify tool output:', error);
      return (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-neutral-50 dark:bg-neutral-900/60 p-2 text-[11px] text-neutral-500 dark:text-neutral-400">
          {String(value)}
        </pre>
      );
    }
  };

  const toTitle = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

  const containerClasses = cn(
    'mt-2 rounded-lg border border-neutral-200 bg-white p-3 text-xs text-neutral-600 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300',
    inline ? 'ml-0' : 'ml-0'
  );

  let content: React.ReactNode | null = null;

  if (toolKey === 'image_generation') {
    const imageSource = typeof output === 'string'
      ? output
      : typeof outputObject?.image === 'string'
        ? (outputObject.image as string)
        : typeof outputObject?.dataUrl === 'string'
          ? (outputObject.dataUrl as string)
          : typeof outputObject?.result === 'string'
            ? (outputObject.result as string)
            : undefined;

    if (imageSource) {
      const src = imageSource.startsWith('data:') ? imageSource : `data:image/png;base64,${imageSource}`;
      const promptText = typeof outputObject?.prompt === 'string' ? (outputObject.prompt as string) : undefined;
      const altText = promptText ? `Generated visual: ${promptText}` : 'Generated visual';
      content = (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={altText}
              className="max-h-72 w-full bg-neutral-50 object-contain dark:bg-neutral-900"
            />
          </div>
          <div className="space-y-1 text-[11px] text-neutral-500 dark:text-neutral-400">
            {promptText && (
              <p><span className="font-medium text-neutral-600 dark:text-neutral-300">Prompt:</span> {promptText}</p>
            )}
            {typeof outputObject?.size === 'string' && <p>Size: {outputObject.size as string}</p>}
            {typeof outputObject?.mediaType === 'string' && <p>Format: {outputObject.mediaType as string}</p>}
            {Array.isArray(outputObject?.warnings) && (outputObject.warnings as unknown[]).length > 0 && (
              <ul className="list-inside list-disc space-y-0.5">
                {(outputObject.warnings as unknown[]).map((warning, index) => (
                  <li key={index}>{String(warning)}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      );
    } else {
      content = formatJSON(output);
    }
  } else if (toolKey === 'code_interpreter') {
    type CodeInterpreterEntry = {
      type?: string;
      logs?: string;
      url?: string;
    };

    const outputs = Array.isArray((outputObject?.outputs as unknown[]))
      ? (outputObject?.outputs as CodeInterpreterEntry[])
      : [];
    const logEntries = outputs
      .filter((entry): entry is Required<Pick<CodeInterpreterEntry, 'logs'>> => entry.type === 'logs' && typeof entry.logs === 'string')
      .map((entry) => entry.logs);
    const imageEntries = outputs
      .filter((entry): entry is Required<Pick<CodeInterpreterEntry, 'url'>> => entry.type === 'image' && typeof entry.url === 'string')
      .map((entry) => entry.url);

    content = (
      <div className="space-y-3">
        {typeof outputObject?.code === 'string' && (
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">Executed Code</div>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-neutral-50 dark:bg-neutral-900/60 p-2 font-mono text-[11px] text-neutral-700 dark:text-neutral-200">
              {outputObject.code as string}
            </pre>
          </div>
        )}
        {logEntries.length > 0 && (
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">Logs</div>
            {logEntries.map((log: string, index: number) => (
              <pre
                key={index}
                className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-neutral-50 dark:bg-neutral-900/60 p-2 font-mono text-[11px] text-neutral-700 dark:text-neutral-200"
              >
                {log}
              </pre>
            ))}
          </div>
        )}
        {imageEntries.length > 0 && (
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">Visual Output</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {imageEntries.map((url: string, index: number) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={index} src={url} alt={`Code interpreter visual ${index + 1}`} className="max-h-48 w-full rounded-md border border-neutral-200 object-contain dark:border-neutral-800" />
              ))}
            </div>
          </div>
        )}
      </div>
    );

    if (!outputObject?.code && logEntries.length === 0 && imageEntries.length === 0) {
      content = formatJSON(output);
    }
  } else {
    const candidateResults = Array.isArray(outputObject?.results)
      ? (outputObject.results as unknown[])
      : Array.isArray((outputObject as { data?: { results?: unknown[] } })?.data?.results)
        ? ((outputObject as { data?: { results?: unknown[] } }).data?.results ?? [])
        : Array.isArray((outputObject as { verifiedResults?: unknown[] })?.verifiedResults)
          ? ((outputObject as { verifiedResults?: unknown[] }).verifiedResults ?? [])
          : undefined;

    if (Array.isArray(candidateResults) && candidateResults.length > 0) {
      content = (
        <div className="max-h-80 space-y-2 overflow-auto pr-1">
          {candidateResults.slice(0, 5).map((item, index: number) => {
            const candidate = item as Record<string, unknown>;
            const title = pickStringField(candidate, ['title', 'pageTitle', 'name', 'projectTitle', 'fileName', 'heading']);
            const url = pickStringField(candidate, ['url', 'link', 'href']);
            const snippet = pickStringField(candidate, ['snippet', 'matchedText', 'text', 'content', 'description', 'summary']);
            const citation = pickStringField(candidate, ['citation', 'citationText']);
            const rawScore = 'score' in candidate && typeof candidate.score === 'number'
              ? candidate.score
              : 'similarity' in candidate && typeof candidate.similarity === 'number'
                ? candidate.similarity
                : undefined;
            const score = rawScore;

            return (
              <div
                key={`${(candidate.pageId as string | undefined) ?? (candidate.id as string | undefined) ?? url ?? 'candidate'}-${index}`}
                className="space-y-1 rounded-md border border-neutral-200 bg-neutral-50 p-2 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-300"
              >
                {title && <div className="text-sm font-medium text-neutral-700 dark:text-neutral-100">{title}</div>}
                {snippet && <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">{snippet}</p>}
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400 dark:text-neutral-500">
                  {url && (
                    <a href={url} target="_blank" rel="noreferrer" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                      Visit source
                    </a>
                  )}
                  {typeof score === 'number' && (
                    <span>Score: {score.toFixed(2)}</span>
                  )}
                  {citation && <span className="italic text-neutral-400 dark:text-neutral-500">{citation}</span>}
                </div>
              </div>
            );
          })}
        </div>
      );
    } else if (isErrorResult(output)) {
      const errorText = typeof output.error === 'string' ? output.error : 'Unknown error retrieving tool result.';
      content = (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-600 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-400">
          {errorText}
        </div>
      );
    } else {
      content = formatJSON(output);
    }
  }

  if (!content) {
    return null;
  }

  return (
    <div className={containerClasses}>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
        {toTitle(toolKey)}
      </div>
      {content}
    </div>
  );
}

function ReasoningBox({ text, className }: { text: string; className?: string }) {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-neutral-200 bg-white p-3 text-xs text-neutral-600 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200',
        className,
      )}
    >
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
        Reasoning
      </div>
      <MarkdownRenderer
        content={trimmed}
        className="text-[13px] leading-[1.6] text-neutral-700 dark:text-neutral-200 space-y-3"
      />
    </div>
  );
}

function ArtifactBlock({
  title,
  description,
  updated,
  actions,
  children,
}: {
  title?: string;
  description?: string;
  updated?: string;
  actions?: string[];
  children: React.ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const [copied, setCopied] = useState(false);

  const copyEnabled = !actions || actions.includes('copy');

  const handleCopy = useCallback(async () => {
    if (!copyEnabled || typeof navigator === 'undefined') {
      return;
    }

    const target = contentRef.current;
    if (!target) {
      return;
    }

    const text = target.innerText.trim();
    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy artifact content:', error);
    }
  }, [copyEnabled]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const descriptor = [description, updated].filter(Boolean).join(' · ');

  return (
    <Artifact className="my-4">
      <ArtifactHeader>
        <div>
          <ArtifactTitle>{title || 'Generated Artifact'}</ArtifactTitle>
          {descriptor && (
            <ArtifactDescription>{descriptor}</ArtifactDescription>
          )}
        </div>
        {copyEnabled && (
          <ArtifactActions>
            <ArtifactAction
              icon={copied ? CheckIcon : CopyIcon}
              label={copied ? 'Copied' : 'Copy'}
              tooltip={copied ? 'Copied!' : 'Copy to clipboard'}
              onClick={handleCopy}
            />
          </ArtifactActions>
        )}
      </ArtifactHeader>
      <ArtifactContent>
        <div ref={contentRef} className="space-y-4">
          {children}
        </div>
      </ArtifactContent>
    </Artifact>
  );
}

function MessageWithSources({
  message,
  textPart,
  messageIndex,
  isLastMessage,
  editingMessageId,
  editedText,
  setEditedText,
  handleSaveEdit,
  handleCancelEdit,
  handleCopyMessage,
  copiedMessageId,
  handleEditMessage,
  handleRegenerateResponse,
  messageMetrics,
  _onCitationClick,
  idMapping,
  projects,
  bulletPointsByProject,
  dynamicFiles,
  audioTranscriptions
}: MessageWithSourcesProps) {
  const [messageCitations, setMessageCitations] = useState<Citation[]>([]);
  const messageText = textPart.text.replace(/^\s*\n+/, '').trimStart();
  const isEditing = editingMessageId === `${messageIndex}`;

  // Extract unique sources from citations
  const uniqueSources = useMemo(() => {
    const sourcesMap = new Map<string, { id: string; title: string; type: string }>();

    messageCitations.forEach(citation => {
      if (citation.type === 'page' && dynamicFiles) {
        const page = dynamicFiles.find((f) => f._id === citation.convexId);
        if (page && !sourcesMap.has(page._id)) {
          sourcesMap.set(page._id, {
            id: page._id,
            title: page.title,
            type: 'page'
          });
        }
      } else if (citation.type === 'project' && projects) {
        const project = projects.find((p) => p._id === citation.convexId);
        if (project && !sourcesMap.has(project._id)) {
          sourcesMap.set(project._id, {
            id: project._id,
            title: project.title,
            type: 'project'
          });
        }
      }
    });

    return Array.from(sourcesMap.values());
  }, [messageCitations, dynamicFiles, projects]);

  return (
    <div className="flex flex-col group">
      <Message from={message.role} className="py-4">
        <MessageContent
          variant="flat"
          className={cn(
            "relative",
            message.role === "assistant" && "bg-neutral-50 dark:bg-neutral-900/50 rounded-lg px-4 py-3"
          )}
        >
          {isEditing && message.role === "user" ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="w-full p-3 text-sm bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-neutral-900/10 dark:focus:ring-white/10"
                rows={3}
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleSaveEdit(messageIndex)}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : message.role === "user" ? (
            <p className="text-sm text-neutral-900 dark:text-neutral-100">{messageText}</p>
          ) : (
            <RichMessageContent
              content={messageText}
              onCitationClick={_onCitationClick}
              idMapping={idMapping}
              projects={projects}
              bulletPointsByProject={bulletPointsByProject}
              dynamicFiles={dynamicFiles}
              audioTranscriptions={audioTranscriptions}
              onCitationsParsed={setMessageCitations}
            />
          )}
        </MessageContent>
        <div className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-neutral-100 dark:bg-neutral-800 ring-1 ring-neutral-200 dark:ring-neutral-700">
          {message.role === "user" ? (
            <UserIcon className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
          ) : (
            <BotIcon className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
          )}
        </div>
      </Message>

      {/* Sources component for assistant messages */}
      {message.role === "assistant" && uniqueSources.length > 0 && (
        <div className="pl-[51px] -mt-2 mb-2">
          <Sources>
            <SourcesTrigger count={uniqueSources.length} />
            <SourcesContent>
              {uniqueSources.map((source) => (
                <Source
                  key={source.id}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (_onCitationClick) {
                      _onCitationClick(source.type, source.id, source.title);
                    }
                  }}
                  title={source.title}
                />
              ))}
            </SourcesContent>
          </Sources>
        </div>
      )}

      {/* Message Actions - Below message */}
      {!isEditing && (
        <div className={cn(
          "flex items-center gap-1 -mt-1 mb-2 transition-opacity duration-200",
          message.role === "assistant" ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          message.role === "user" ? "justify-end pr-[51px]" : "pl-[51px]"
        )}>
          <button
            onClick={() => handleCopyMessage(`${messageIndex}`, messageText)}
            className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors group/btn"
            title="Copy"
          >
            {copiedMessageId === `${messageIndex}` ? (
              <CheckIcon className="size-3.5 text-green-600" />
            ) : (
              <CopyIcon className="size-3.5 text-neutral-500 group-hover/btn:text-neutral-700 dark:text-neutral-400 dark:group-hover/btn:text-neutral-200" />
            )}
          </button>
          {message.role === "user" && (
            <button
              onClick={() => handleEditMessage(messageIndex, messageText)}
              className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors group/btn"
              title="Edit message"
            >
              <Edit2Icon className="size-3.5 text-neutral-500 group-hover/btn:text-neutral-700 dark:text-neutral-400 dark:group-hover/btn:text-neutral-200" />
            </button>
          )}
          {message.role === "assistant" && isLastMessage && (
            <button
              onClick={handleRegenerateResponse}
              className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors group/btn"
              title="Regenerate response"
            >
              <RefreshCwIcon className="size-3.5 text-neutral-500 group-hover/btn:text-neutral-700 dark:text-neutral-400 dark:group-hover/btn:text-neutral-200" />
            </button>
          )}
          {/* Message Metrics */}
          {message.role === "assistant" && messageMetrics[message.id] && (
            <div className="ml-auto flex items-center gap-2 text-xs text-neutral-400 dark:text-neutral-500">
              {messageMetrics[message.id].tokenEstimate && (
                <span>~{messageMetrics[message.id].tokenEstimate} tokens</span>
              )}
              {messageMetrics[message.id].startTime && messageMetrics[message.id].endTime && (
                <span>
                  {((messageMetrics[message.id].endTime! - messageMetrics[message.id].startTime) / 1000).toFixed(1)}s
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Simple Message Content Component (using our custom markdown renderer)
function RichMessageContent({
  content,
  onCitationClick,
  idMapping,
  projects,
  bulletPointsByProject,
  dynamicFiles,
  audioTranscriptions,
  onCitationsParsed
}: {
  content: string;
  onCitationClick?: CitationClickHandler;
  idMapping?: IdMapping;
  projects?: Array<{
    _id: string;
    title: string;
    description?: string;
    [key: string]: unknown;
  }>;
  bulletPointsByProject?: { [key: string]: Array<{
    _id: string;
    content: string;
    [key: string]: unknown;
  }> };
  dynamicFiles?: Array<{
    _id: string;
    title: string;
    [key: string]: unknown;
  }>;
  audioTranscriptions?: Array<{
    _id: string;
    dynamicFileId: string;
    fileName: string;
    transcription: string;
    segments?: Array<{
      text: string;
      start: number;
      end: number;
    }>;
    summary?: {
      points: Array<{
        text: string;
        segmentReferences?: Array<{
          segmentIndex: number;
          start: number;
          end: number;
          originalText: string;
        }>;
      }>;
      generatedAt: number;
    };
  }>;
  onCitationsParsed?: (citations: Citation[]) => void;
}) {
  const { text, citations } = useMemo(() => {
    // First post-process the response for consistent formatting
    const formattedContent = postProcessResponse(content);

    // Validate and clean citations before parsing
    const cleanedContent = validateAndCleanCitations(formattedContent, idMapping || { forward: {}, reverse: {} });

    // Then parse citations
    const result = parseCitations(cleanedContent, idMapping || { forward: {}, reverse: {} });

    return result;
  }, [content, idMapping]);

  const segments = useMemo<MessageSegment[]>(() => {
    if (!text) {
      return [];
    }

    const artifactRegex = /<artifact\b([^>]*)>([\s\S]*?)<\/artifact>/gi;
    const result: MessageSegment[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = artifactRegex.exec(text)) !== null) {
      const matchIndex = match.index ?? 0;

      if (matchIndex > lastIndex) {
        const preceding = stripArtifactTags(text.slice(lastIndex, matchIndex));
        if (preceding.trim()) {
          result.push({ type: 'text', content: preceding });
        }
      }

      const attributes = parseArtifactAttributes(match[1] ?? '');
      const innerContent = stripArtifactTags((match[2] ?? '').trim());

      result.push({
        type: 'artifact',
        content: innerContent,
        attributes,
      });

      lastIndex = matchIndex + match[0].length;
    }

    if (lastIndex < text.length) {
      const trailing = stripArtifactTags(text.slice(lastIndex));
      if (trailing.trim()) {
        result.push({ type: 'text', content: trailing });
      }
    }

    if (result.length === 0) {
      const sanitized = stripArtifactTags(text);
      return sanitized.trim()
        ? [{ type: 'text', content: sanitized }]
        : [];
    }

    return result;
  }, [text]);

  // Notify parent about citations
  useEffect(() => {
    if (onCitationsParsed && citations.length > 0) {
      onCitationsParsed(citations);
    }
  }, [citations, onCitationsParsed]);

  const renderedSegments = useMemo(() => {
    const nodes: React.ReactNode[] = [];

    segments.forEach((segment, index) => {
      if (segment.type === 'artifact') {
        nodes.push(
          <ArtifactBlock
            key={`artifact-${index}`}
            title={segment.attributes.title}
            description={segment.attributes.description}
            updated={segment.attributes.updated}
            actions={segment.attributes.actions}
          >
            <CustomMarkdownRenderer
              content={segment.content}
              citations={citations}
              onCitationClick={onCitationClick}
              projects={projects}
              bulletPointsByProject={bulletPointsByProject}
              dynamicFiles={dynamicFiles}
              audioTranscriptions={audioTranscriptions}
            />
          </ArtifactBlock>
        );
        return;
      }

      if (!segment.content.trim()) {
        return;
      }

      nodes.push(
        <CustomMarkdownRenderer
          key={`text-${index}`}
          content={segment.content}
          citations={citations}
          onCitationClick={onCitationClick}
          projects={projects}
          bulletPointsByProject={bulletPointsByProject}
          dynamicFiles={dynamicFiles}
          audioTranscriptions={audioTranscriptions}
        />
      );
    });

    return nodes;
  }, [segments, citations, onCitationClick, projects, bulletPointsByProject, dynamicFiles, audioTranscriptions]);

  // Use our custom markdown renderer with artifact support
  return <>{renderedSegments}</>;
}



// Page Citation Component with content fetching
function PageCitation({ text, id, num, onClick, page }: {
  text: string;
  id: string;
  num: number;
  onClick: () => void;
  page?: {
    _id: string;
    title: string;
    [key: string]: unknown;
  };
}) {
  // Only fetch page content if we have a valid Convex ID
  const isValidConvexId = id && id.length > 10 && !id.match(/^(P|B|BR|PG)\d+$/);
  const pageContent = useQuery(api.dynamicFileContent.get,
    page && isValidConvexId ? { fileId: id as Id<"dynamicFiles"> } : "skip"
  );

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick();
  };

  // Parse line number from text
  const lineMatch = text.match(/\bL(\d+)(?:-L\d+)?/);
  const lineNum = lineMatch ? parseInt(lineMatch[1]) : null;

  // Use the full text (with line number) as the source for tooltip
  const displayText = text || page?.title || 'Page';

  // Try to get actual line content if we have it
  let tooltipContent = displayText;

  if (lineNum && pageContent?.content) {
    // Extract the actual line content from BlockNote content
    const blocks = pageContent.content || [];

    // Build dynamic mapping (similar to DynamicFileViewer)
    let lineNumber = 1;
    const lineToBlockMap: { [key: number]: number } = {};

    blocks.forEach((block: ContentBlock, index: number) => {
      const hasContent = block.content &&
        Array.isArray(block.content) &&
        block.content.length > 0 &&
        block.content.some((item: InlineContentItem) => {
          if (typeof item === 'string') {
            return item.trim() !== '';
          }
          if (typeof item === 'object' && item !== null) {
            if ('text' in item && typeof item.text === 'string') {
              return item.text.trim() !== '';
            }
            if ('type' in item && item.type === 'link' && 'content' in item && Array.isArray(item.content)) {
              return item.content.some((linkItem: InlineContentItem) => {
                if (typeof linkItem === 'string') {
                  return linkItem.trim() !== '';
                }
                if (typeof linkItem === 'object' && linkItem !== null && 'text' in linkItem && typeof linkItem.text === 'string') {
                  return linkItem.text.trim() !== '';
                }
                return false;
              });
            }
          }
          return false;
        });

      const isContentBlock = hasContent ||
        block.type === 'heading' ||
        block.type === 'bulletListItem' ||
        block.type === 'numberedListItem' ||
        (block.type === 'paragraph' && hasContent);

      if (isContentBlock) {
        lineToBlockMap[lineNumber] = index;
        lineNumber++;
      }
    });

    const blockIndex = lineToBlockMap[lineNum];
    if (blockIndex !== undefined && blocks[blockIndex]) {
      const block = blocks[blockIndex];
      // Extract text from block content
      if (block.content) {
        const blockText = block.content.map((c: unknown) => {
          if (typeof c === 'string') return c;
          if (typeof c === 'object' && c !== null && 'text' in c) {
            return (c as { text?: string }).text || '';
          }
          return '';
        }).join('');
        if (blockText) {
          tooltipContent = blockText;
        }
      }
    }
  }

  return (
    <CitationTooltip
      source={displayText}
      line={lineNum || undefined}
      content={tooltipContent}
    >
      <span
        className="inline-flex items-center justify-center cursor-pointer ml-1 mr-0.5 px-1.5 min-w-[18px] h-[18px] rounded-md bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-[10px] font-medium text-neutral-700 dark:text-neutral-300 transition-all duration-200 hover:scale-105 align-baseline relative -top-[1px]"
        onClick={handleClick}
        data-citation-type="page"
        data-citation-id={id}
      >
        {num}
      </span>
    </CitationTooltip>
  );
}

// Simple Citation Component
function Citation({ type, text, id, num, onClick, projects, bulletPointsByProject }: {
  type: string;
  text: string;
  id: string;
  num: number;
  onClick: () => void;
  projects?: Array<{
    _id: string;
    title: string;
    description?: string;
    [key: string]: unknown;
  }>;
  bulletPointsByProject?: { [key: string]: Array<{
    _id: string;
    content: string;
    [key: string]: unknown;
  }> };
}) {
  // Fetch branch content if needed - only if we have a valid Convex ID
  const isValidConvexId = id && id.length > 10 && !id.match(/^(P|B|BR|PG)\d+$/);
  const branch = useQuery(api.branches.get,
    type === 'branch' && isValidConvexId ? { id: id as Id<"branches"> } : "skip"
  );

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick();
  };

  // Fetch actual content for tooltip display
  let tooltipContent = "";

  // Fetch actual content based on type
  if (type === 'project' && projects) {
    const project = projects.find(p => p._id === id);
    if (project) {
      // Show both title and description for projects
      tooltipContent = project.title;
      if (project.description) {
        tooltipContent += "\n\n" + project.description;
      }
    }
  } else if (type === 'bullet' && bulletPointsByProject) {
    // Find bullet point across all projects
    for (const bullets of Object.values(bulletPointsByProject)) {
      const bullet = bullets.find((b) => b._id === id);
      if (bullet) {
        tooltipContent = bullet.content;
        break;
      }
    }
  } else if (type === 'branch' && branch) {
    // Use fetched branch content
    tooltipContent = branch.content || text;
  } else if (type === 'portfolio' || type === 'github' || type === 'web') {
    // For portfolio, github, and web citations, use the full text which contains the URL or description
    tooltipContent = text;
  }

  // Fallback to text if no content found
  if (!tooltipContent) {
    tooltipContent = text;
  }

  // Get source type label for tooltip
  const getSourceLabel = () => {
    switch(type) {
      case 'project': return 'Project';
      case 'bullet': return 'Bullet Point';
      case 'branch': return 'Branch';
      case 'page': return 'Page';
      case 'github': return 'GitHub';
      case 'portfolio': return 'Portfolio';
      case 'web': return 'Web';
      case 'resume': return 'Resume';
      default: return 'Source';
    }
  };

  const sourceInfo = { label: getSourceLabel() };

  return (
    <CitationTooltip
      source={sourceInfo.label}
      content={tooltipContent}
    >
      <span
        className="inline-flex items-center justify-center cursor-pointer ml-1 mr-0.5 px-1.5 min-w-[18px] h-[18px] rounded-md bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-[10px] font-medium text-neutral-700 dark:text-neutral-300 transition-all duration-200 hover:scale-105 align-baseline relative -top-[1px]"
        onClick={handleClick}
        data-citation-type={type}
        data-citation-id={id}
      >
        {num}
      </span>
    </CitationTooltip>
  );
}

export function ResumeChatV2({ resumeId, className, onCitationClick: _onCitationClick, projects, bulletPointsByProject, dynamicFiles, branchesByBulletPoint }: ResumeChatProps) {
  // Fetch audio transcriptions for this resume
  const audioTranscriptions = useQuery(api.audioTranscription.getTranscriptionsByResume, {
    resumeId
  });
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editedText, setEditedText] = useState<string>("");
  const [pipelineTasks, setPipelineTasks] = useState<PipelineTask[]>([]);
  
  // Fetch resume data and owner profile
  const resume = useQuery(api.resumes.get, { id: resumeId });
  const [ownerProfile, setOwnerProfile] = useState<{
    imageUrl?: string;
    firstName?: string;
    lastName?: string;
  } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Fetch owner profile when resume loads
  useEffect(() => {
    if (resume?.userId) {
      setProfileLoading(true);
      fetch(`/api/user/${resume.userId}`)
        .then(res => res.json())
        .then(data => {
          if (!data.error) {
            setOwnerProfile(data);
          }
        })
        .catch(err => console.error('Failed to fetch owner profile:', err))
        .finally(() => setProfileLoading(false));
    }
  }, [resume?.userId]);

  // Track message metrics
  const [messageMetrics, setMessageMetrics] = useState<Record<string, { startTime: number; endTime?: number; tokenEstimate?: number }>>({});

  // Build ID mapping including branches
  const idMapping = useMemo(
    () => buildIdMapping({
      dynamicFiles: dynamicFiles ?? [],
      projects: projects ?? [],
      bulletPointsByProject: bulletPointsByProject ?? {},
      branchesByBulletPoint: branchesByBulletPoint ?? {},
    }),
    [projects, bulletPointsByProject, dynamicFiles, branchesByBulletPoint]
  );

  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Always use GPT-5 Mini with OpenAI native tools for all chats
  // Web and native search are always enabled
  const webSearch = true;


  const initialMessages: ResumeChatMessage[] = [];

  // Models available
  // GPT-5 Mini is the only model we use

  // Use the useChat hook with DefaultChatTransport
  // Create transport with current model - use key to force reinit on model change
  const transport = useMemo(
    () => new DefaultChatTransport<ResumeChatMessage>({
      api: `${convexSiteUrl}/api/resume-chat`,
      body: { resumeId, searchEnabled: webSearch },
    }),
    [resumeId, webSearch]
  );

  const { messages, sendMessage, status, setMessages, error, stop } = useChat<ResumeChatMessage>({
    id: `chat-${webSearch}`, // Use id to separate chats by web search
    transport,
    messages: initialMessages,
    experimental_throttle: 35,
    onData: ({ type, data }) => {
      if (type === 'data-status') {
        const statusData = data as ResumeChatDataParts['status'];
        const step = statusData.step ?? 'response';
        const tone = statusData.tone ?? 'info';
        const label = STATUS_LABELS[step] ?? statusData.message ?? step.replace(/_/g, ' ');

        setPipelineTasks(prev => {
          const working = prev.length ? [...prev] : createInitialPipelineTasks();
          const existingIndex = working.findIndex(task => task.step === step);
          const nextStatus: PipelineTask = {
            step,
            label,
            status: tone === 'success' ? 'complete' : working[existingIndex]?.status ?? 'pending',
            message: statusData.message,
            tone,
          };

          if (existingIndex >= 0) {
            working[existingIndex] = { ...working[existingIndex], ...nextStatus };
            return sortPipelineTasks(working);
          }

          working.push(nextStatus);
          return sortPipelineTasks(working);
        });
      }
    },
    onError: (error) => {
      console.error('[CLIENT] useChat error:', error);
      console.error('[CLIENT] Error stack:', error.stack);
    },
    onFinish: async ({ message }) => {
      // Record end time when message finishes streaming
      if (message?.id) {
        setMessageMetrics(prev => ({
          ...prev,
          [message.id]: {
            ...prev[message.id],
            endTime: Date.now(),
            // Estimate tokens (rough approximation: ~4 characters per token)
            tokenEstimate: message.parts?.reduce((acc, part) => {
              if (part.type === 'text' && part.text) {
                return acc + Math.ceil(part.text.length / 4);
              }
              return acc;
            }, 0) || 0
          }
        }));
      }
    },
  });

  // Track start time for streaming messages separately
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'assistant' && status === 'streaming' && !messageMetrics[lastMessage.id]?.startTime) {
      setMessageMetrics(prev => ({
        ...prev,
        [lastMessage.id]: { startTime: Date.now() }
      }));
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, status]); // Only depend on messages.length and status, not messageMetrics

  // Log errors if any
  useEffect(() => {
    if (error) {
      console.error('[CLIENT] Chat error detected:', error);
    }
  }, [error]);

  useEffect(() => {
    setPipelineTasks(prev => {
      if (!prev.length) {
        return prev;
      }

      const hasStatusMessages = prev.some(task => task.message);
      if (hasStatusMessages) {
        return prev;
      }

      if (status === 'streaming') {
        return prev.map((task, idx) => ({
          ...task,
          status: idx <= 1 ? 'complete' : task.status,
        }));
      }

      if (status === 'ready') {
        return prev.map(task => ({ ...task, status: 'complete' }));
      }

      return prev;
    });
  }, [status]);

  // For now, we'll need to handle ID mapping extraction through a different approach
  // The backend will need to send the mapping as part of the streamed message

  // First-person suggestions with separate prefill text for input
  const suggestedPrompts: Array<{ label: string; prefill: string }> = [
    { label: "Learn about my background and experience", prefill: "What are your background experiences?" },
    { label: "Review my strongest technical skills", prefill: "What are your strongest technical skills and areas of expertise?" },
    { label: "Summarize my top achievements", prefill: "What are your most significant achievements?" },
    { label: "What makes me unique as a candidate", prefill: "What makes you unique and valuable as a candidate?" },
  ];

  const handlePromptSubmit = (message: PromptInputMessage, formEvent: React.FormEvent<HTMLFormElement>) => {
    const text = message.text?.trim();
    if (!text || status === 'submitted' || status === 'streaming') {
      return;
    }

    setPipelineTasks(createInitialPipelineTasks());

    sendMessage({ text });
    setInput('');
    formEvent.currentTarget.reset();
  };

  const handleSuggestedSend = (text: string) => {
    if (status === 'submitted' || status === 'streaming') return;
    setPipelineTasks(createInitialPipelineTasks());
    sendMessage({ text });
    setInput('');
  };

  const handleCopyMessage = async (messageId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleRegenerateResponse = () => {
    if (status !== 'submitted' && status !== 'streaming') {
      // Find the last user message
      const lastUserMessageIndex = messages.findLastIndex(m => m.role === 'user');
      if (lastUserMessageIndex !== -1) {
        const lastUserMessage = messages[lastUserMessageIndex];
        const userTextPart = lastUserMessage.parts?.find((p): p is TextUIPart => p.type === 'text');

        if (userTextPart?.text) {
          setPipelineTasks(createInitialPipelineTasks());

          // Clear metrics for removed messages (including the user message and all after)
          const removedMessages = messages.slice(lastUserMessageIndex);
          setMessageMetrics(prev => {
            const newMetrics = { ...prev };
            removedMessages.forEach(msg => delete newMetrics[msg.id]);
            return newMetrics;
          });

          // Remove the last user message and all messages after it
          // sendMessage will add the user message back
          const messagesToKeep = messages.slice(0, lastUserMessageIndex);
          setMessages(messagesToKeep);
          // Small delay to ensure state update
          setTimeout(() => {
            sendMessage({ text: userTextPart.text });
          }, 50);
        }
      }
    }
  };

  const handleEditMessage = (messageIndex: number, text: string) => {
    setEditingMessageId(`${messageIndex}`);
    setEditedText(text);
  };

  const handleSaveEdit = (messageIndex: number) => {
    if (editedText && status !== 'submitted' && status !== 'streaming') {
      // Clear messages after this point
      const messagesToKeep = messages.slice(0, messageIndex);

      // Clear metrics for removed messages
      const removedMessages = messages.slice(messageIndex);
      setMessageMetrics(prev => {
        const newMetrics = { ...prev };
        removedMessages.forEach(msg => delete newMetrics[msg.id]);
        return newMetrics;
      });

      setMessages(messagesToKeep);
      setEditingMessageId(null);
      setEditedText("");

      // Small delay to ensure state update before sending new message
      setTimeout(() => {
        sendMessage({ text: editedText });
      }, 50);
    }
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditedText("");
  };

  const handleNewChat = () => {
    stop();
    // Clear all messages
    setMessages([]);
    setMessageMetrics({});
    setInput('');
  };

  return (
    <div className={cn("flex h-full w-full flex-col bg-white dark:bg-neutral-950 min-w-0", className)}>
      {/* AI Header */}
      <div className="border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 flex-shrink-0">
        <div className="flex items-center justify-between px-6 py-3">
          <h1 className="text-lg font-light text-neutral-900 dark:text-neutral-100" style={{
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
            letterSpacing: '-0.01em'
          }}>
            Aurea
          </h1>
          <Button
            onClick={handleNewChat}
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Chat
          </Button>
        </div>
      </div>
      <Conversation className="flex-1 w-full bg-white dark:bg-neutral-950 min-h-0 overflow-hidden">
        <ConversationContent className="px-6 py-6 h-full overflow-auto w-full min-w-0">
          {messages.length === 0
            ? (
              <ConversationEmptyState className="p-0 text-left items-stretch justify-start gap-0">
                <div className="flex flex-col items-center justify-center w-full max-w-3xl mx-auto px-4">
                  {/* Avatar with loading state */}
                  <div className="mb-6">
                    {profileLoading ? (
                      <div className="w-20 h-20 rounded-full bg-neutral-100 dark:bg-neutral-800 ring-2 ring-neutral-200 dark:ring-neutral-700 flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin"></div>
                      </div>
                    ) : ownerProfile?.imageUrl ? (
                      <div className="relative">
                        <Image
                          src={ownerProfile.imageUrl}
                          alt={`${ownerProfile.firstName || resume?.name || 'User'}'s avatar`}
                          width={80}
                          height={80}
                          className="rounded-full ring-2 ring-neutral-200 dark:ring-neutral-700"
                        />
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-neutral-100 dark:bg-neutral-800 ring-2 ring-neutral-200 dark:ring-neutral-700 flex items-center justify-center">
                        <span className="text-2xl font-medium text-neutral-600 dark:text-neutral-400">
                          {(ownerProfile?.firstName || resume?.name || 'U')[0].toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* First-person greeting with loading state */}
                  <div className="text-center mb-12">
                    <h1 className="text-3xl font-light text-neutral-800 dark:text-neutral-200 mb-3" style={{
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
                      letterSpacing: '-0.02em'
                    }}>
                      {profileLoading ? (
                        <>I&apos;m <span className="inline-block w-16 h-6 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse"></span>. How can I help?</>
                      ) : (
                        <>I&apos;m {ownerProfile?.firstName || resume?.name || 'here'}. How can I help?</>
                      )}
                    </h1>
                    <p className="text-neutral-500 dark:text-neutral-400 text-base font-light">
                      I&apos;m your second mind — ask me about my experience and projects
                    </p>
                  </div>

              {/* Notion-style suggestions (first-person) */}
                  <div className="grid grid-cols-2 gap-3 w-full max-w-xl">
                {suggestedPrompts.map((item, index) => (
                      <button
                    key={item.label}
                    onClick={() => handleSuggestedSend(item.prefill)}
                        className="text-left p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors group"
                        style={{
                          opacity: 0,
                          animation: `fadeIn 0.3s ease-out ${index * 0.1}s forwards`
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            <div className="w-5 h-5 rounded flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 group-hover:bg-neutral-200 dark:group-hover:bg-neutral-700 transition-colors">
                              <svg className="w-3 h-3 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                              </svg>
                            </div>
                          </div>
                          <span className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
                        {item.label}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Add keyframes for animation */}
                  <style jsx>{`
                    @keyframes fadeIn {
                      from {
                        opacity: 0;
                        transform: translateY(10px);
                      }
                      to {
                        opacity: 1;
                        transform: translateY(0);
                      }
                    }
                  `}</style>
                </div>
              </ConversationEmptyState>
            )
            : messages.map((message) => {
            const parts = message.parts || [];

            // Extract tool and reasoning parts
            const toolParts = parts.filter((part) => isToolUIPart(part)) as ToolUIPart[];
            const reasoningParts = parts.filter((p): p is ReasoningUIPart => p.type === "reasoning");
            
            // Check if this is the latest assistant message
            const isLatestAssistant = message.role === 'assistant' && message.id === messages.at(-1)?.id;
            
            // Use fallback tasks for latest assistant message if no tool/reasoning parts are available
            const shouldUseFallbackTasks = isLatestAssistant && toolParts.length === 0 && reasoningParts.length === 0 && pipelineTasks.length > 0;
            
            // Helper function to get tool display name
            const getToolDisplayName = (toolType: string) => {
              if (toolType.includes('web_search')) return 'Searching web';
              if (toolType.includes('search_tool')) return 'Searching sources';
              if (toolType.includes('semantic_search')) return 'Searching by meaning';
              if (toolType.includes('search_content')) return 'Searching content';
              if (toolType.includes('search_page_content')) return 'Reading documentation';
              if (toolType.includes('scrape_portfolio')) return 'Fetching portfolio';
              if (toolType.includes('fetch_resume_data')) return 'Getting resume data';
              if (toolType.includes('github_search')) return 'Searching GitHub';
              if (toolType.includes('firecrawl')) return 'Crawling website';
              if (toolType.includes('embedding')) return 'Processing embeddings';
              if (toolType.includes('audio')) return 'Processing audio';
              if (toolType.includes('transcript')) return 'Processing transcript';
              if (toolType.includes('code_interpreter')) return 'Running code';
              
              // Try to extract meaningful name from tool type
              const cleanedType = toolType
                .replace(/^tool-/, '')
                .replace(/[-_]/g, ' ')
                .replace(/\b\w/g, l => l.toUpperCase());
              
              return cleanedType || 'Processing';
            };
            const getToolIcon = (toolType: string) => {
              if (!toolType) return ListChecksIcon;
              if (toolType.includes('web_search')) return SearchIcon;
              if (toolType.includes('resume_web_search')) return SearchIcon;
              if (toolType.includes('scrape_portfolio')) return GlobeIcon;
              if (toolType.includes('search_page_content')) return FileTextIcon;
              if (toolType.includes('search_semantic')) return BrainIcon;
              if (toolType.includes('search_exact')) return TargetIcon;
              if (toolType.includes('fetch_resume_data')) return ListChecksIcon;
              if (toolType.includes('code_interpreter')) return BrainIcon;
              return ListChecksIcon;
            };

            const steps: React.ReactNode[] = [];

            const dedupedReasoningParts = reasoningParts.filter((part, index, array) => {
              const normalized = (part.text ?? '').trim();
              if (!normalized) {
                const firstBlankIndex = array.findIndex((candidate) => ((candidate.text ?? '').trim().length === 0));
                return index === firstBlankIndex;
              }
              const firstMatchIndex = array.findIndex((candidate) => ((candidate.text ?? '').trim() === normalized));
              return index === firstMatchIndex;
            });

            toolParts.forEach((toolPart, index) => {
              const displayName = getToolDisplayName(toolPart.type || '');
            const hasError = toolPart.state === 'output-error';
            const isRunning = toolPart.state === 'input-streaming' || toolPart.state === 'input-available';
            const isComplete = toolPart.state === 'output-available';
            const StepIcon = getToolIcon(toolPart.type || '');
            const toolOutput = (typeof toolPart.output === 'object' && toolPart.output !== null)
              ? (toolPart.output as { variantSearches?: Array<{ value: string; reason: string; totalFound: number }> })
              : undefined;
            const variantSummaries = Array.isArray(toolOutput?.variantSearches)
              ? toolOutput.variantSearches
              : [];
              const fallbackVariants = variantSummaries.filter((variant) => variant.reason !== 'original' && variant.totalFound > 0);

              steps.push(
                <ChainOfThoughtStep
                  key={`${message.id}-tool-${index}`}
                  icon={StepIcon}
                  label={displayName}
                  status={hasError ? 'complete' : isRunning ? 'active' : 'complete'}
                  description={fallbackVariants.length > 0 ? `Matched via ${fallbackVariants.map((variant) => `"${variant.value}"`).join(', ')}` : undefined}
                >
                  {isRunning && (
                    <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">Streaming input…</p>
                  )}
                  {hasError && toolPart.errorText && (
                    <div className="mb-2 rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-600 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-400">
                      {toolPart.errorText}
                    </div>
                  )}
                  {fallbackVariants.length > 0 && (
                    <ChainOfThoughtSearchResults className="mb-2">
                      {fallbackVariants.map((variant, idx) => (
                        <ChainOfThoughtSearchResult key={`${message.id}-tool-${index}-variant-${idx}`}>
                          {variant.value}
                        </ChainOfThoughtSearchResult>
                      ))}
                    </ChainOfThoughtSearchResults>
                  )}
                  {isComplete && !hasError && <ToolOutputCard toolPart={toolPart} />}
                </ChainOfThoughtStep>
              );
            });

            dedupedReasoningParts.forEach((reasoningPart, index) => {
              const rawReasoningText = reasoningPart.text ?? '';
              const hasTextPart = parts.some(p => p.type === 'text' && p.text && p.text.trim());
              const isReasoningStreaming = status === 'streaming' && message.id === messages.at(-1)?.id && !hasTextPart;
              const isDurationOnly = rawReasoningText.match(/^Thought for \d+\s*(seconds?|s)?$/i);
              
              // Extract a meaningful title from reasoning text
              const getReasoningTitle = (text: string) => {
                if (isDurationOnly) return text;
                if (isReasoningStreaming) return 'Thinking...';

                // Try to extract the first meaningful sentence or phrase
                const lines = text.split('\n').filter(line => line.trim());
                if (lines.length > 0) {
                  const firstLine = lines[0].trim();
                  // Remove common prefixes
                  const cleaned = firstLine
                    .replace(/^(I need to|I should|I will|Let me|I'm going to|I'll)\s*/i, '')
                    .replace(/^(Analyzing|Processing|Looking|Searching|Finding)\s*/i, (match) => match + ' ')
                    .trim();

                  return cleaned || 'Analyzing';
                }

                return 'Analyzing';
              };

              const title = getReasoningTitle(stripInlineMarkdown(rawReasoningText));
              const previewText = buildReasoningPreview(rawReasoningText, title);
              const normalizedFullText = stripInlineMarkdown(rawReasoningText).replace(/\s+/g, ' ').trim();
              const normalizedPreview = previewText.replace(/\s+/g, ' ').trim();
              const showPreview =
                !isDurationOnly &&
                normalizedPreview.length > 0 &&
                normalizedFullText.length - normalizedPreview.length > 30;

              steps.push(
                <ChainOfThoughtStep
                  key={`${message.id}-reasoning-${index}`}
                  icon={BrainIcon}
                  label={title}
                  status={isReasoningStreaming ? 'active' : 'complete'}
                  description={showPreview ? previewText : undefined}
                >
                  {isReasoningStreaming && (
                    <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">Thinking…</p>
                  )}
                  <ReasoningBox text={rawReasoningText} />
                </ChainOfThoughtStep>
              );
            });

            if (shouldUseFallbackTasks) {
              pipelineTasks.forEach((task, index) => {
                const isComplete = task.status === 'complete';
                const toneClass = task.tone === 'success'
                  ? 'text-emerald-500'
                  : task.tone === 'warning'
                    ? 'text-amber-500'
                    : task.tone === 'error'
                      ? 'text-red-500'
                      : 'text-neutral-500 dark:text-neutral-400';
                const stepStatus = isComplete ? 'complete' : task.tone === 'error' ? 'active' : 'pending';

                steps.push(
                  <ChainOfThoughtStep
                    key={`${message.id}-fallback-${index}`}
                    icon={ListChecksIcon}
                    label={task.label}
                    status={stepStatus}
                  >
                    {task.message ? (
                      <p className={`text-xs ${toneClass}`}>{task.message}</p>
                    ) : (
                      !isComplete && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">In progress…</p>
                      )
                    )}
                  </ChainOfThoughtStep>
                );
              });
            }

            return (
              <div key={message.id}>
                {steps.length > 0 && (
                  <div className="mb-4 px-8">
                    <ChainOfThought defaultOpen>
                      <ChainOfThoughtHeader />
                      <ChainOfThoughtContent>{steps}</ChainOfThoughtContent>
                    </ChainOfThought>
                  </div>
                )}

                {/* Text messages */}
                {parts
                  .filter((p): p is TextUIPart => p.type === "text")
                  .map((textPart, i: number) => {
                    const msgIndex = messages.indexOf(message);
                    const isLastMessage = msgIndex === messages.length - 1;

                    return (
                      <MessageWithSources
                        key={`${message.id}-text-${i}`}
                          message={message}
                          textPart={textPart}
                          messageIndex={msgIndex}
                          isLastMessage={isLastMessage}
                          editingMessageId={editingMessageId}
                          editedText={editedText}
                          setEditedText={setEditedText}
                          handleSaveEdit={handleSaveEdit}
                          handleCancelEdit={handleCancelEdit}
                          handleCopyMessage={handleCopyMessage}
                          copiedMessageId={copiedMessageId}
                          handleEditMessage={handleEditMessage}
                          handleRegenerateResponse={handleRegenerateResponse}
                          messageMetrics={messageMetrics}
                          _onCitationClick={_onCitationClick}
                          idMapping={idMapping}
                          projects={projects}
                          bulletPointsByProject={bulletPointsByProject}
                          dynamicFiles={dynamicFiles}
                          audioTranscriptions={audioTranscriptions}
                        />
                    );
                  })}
              </div>
            );
          })}

          {status === 'submitted' && (
            <div className="py-4">
              <Loader />
            </div>
          )}

        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Modern chat input leveraging ai-elements PromptInput */}
      <div className="border-t border-neutral-200/50 dark:border-neutral-800/50 bg-white dark:bg-neutral-950 flex-shrink-0">
        <div className="w-full px-4 py-3 space-y-2">
          <PromptInput
            className="bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 w-full"
            onSubmit={handlePromptSubmit}
          >
            <PromptInputBody>
              <PromptInputTextarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask me about my experience..."
                disabled={status === 'submitted'}
              className="w-full"
              ref={textareaRef}
              />
            </PromptInputBody>
            <PromptInputToolbar className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-neutral-400 dark:text-neutral-500">
                Press Enter to send, Shift+Enter for new line
              </span>
              <div className="flex items-center gap-3">
                <span className="hidden text-xs text-neutral-400 dark:text-neutral-500 sm:inline">
                  Powered by OpenAI
                </span>
                <PromptInputSubmit
                  status={status}
                  disabled={status === 'submitted' || (status !== 'streaming' && !input.trim())}
                  onClick={(event) => {
                    if (status === 'streaming') {
                      event.preventDefault();
                      stop();
                    }
                  }}
                />
              </div>
            </PromptInputToolbar>
          </PromptInput>
          <div className="flex items-center justify-between text-xs text-neutral-400 dark:text-neutral-500 sm:hidden">
            <span>Press Enter to send, Shift+Enter for new line</span>
            <span>Powered by OpenAI</span>
          </div>
        </div>
      </div>
    </div>
  );
}
