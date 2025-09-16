"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, UIMessage, ToolUIPart, TextUIPart, ReasoningUIPart } from 'ai';
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { MarkdownRenderer } from './MarkdownRenderer';
import { Button } from "@/components/ui/button";
// AI elements UI kit
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Loader } from "@/components/ai-elements/loader";
import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources";
// Using custom markdown renderer instead of Response component
import { Reasoning, ReasoningTrigger, ReasoningContent } from "@/components/ai-elements/reasoning";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from '@/components/ai-elements/task';
import { CopyIcon, RefreshCwIcon, Edit2Icon, CheckIcon, BotIcon, UserIcon, XIcon, ArrowUpIcon, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { CitationTooltip } from "@/components/ui/citation-tooltip";
import { EchoCitationTooltip } from "@/components/ui/echo-citation-tooltip";
import { parseCitations } from '@/lib/citation-parser';
import { postProcessResponse } from '@/lib/response-formatter';
import { validateAndCleanCitations } from '@/lib/citation-validator';
import { IdMapping } from '@/types/chat';
import type { Citation } from '@/types/chat';

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

interface ResumeChatProps {
  resumeId: Id<"resumes">;
  className?: string;
  onCitationClick?: (type: string, id: string, text: string) => void;
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
  onCitationClick?: (type: string, id: string, text: string) => void;
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
              if (onCitationClick) {
                // Navigate to the page
                onCitationClick('page', citation.convexId, citation.text);
                // After navigation, find and highlight the specific audio summary point
                setTimeout(() => {
                  // Remove any existing persistent highlights first
                  document.querySelectorAll('.highlight-persistent').forEach(el => {
                    el.classList.remove('highlight-persistent');
                  });

                  // Find all echo elements on the page
                  const summaryElements = document.querySelectorAll(`[id^="echo-point-"], [id^="audio-summary-point-"]`);

                  // Look for the element with the matching point number
                  summaryElements.forEach((element) => {
                    const elementId = element.id;
                    // Extract point number from ID (format: echo-point-{audioId}-{pointNumber} or audio-summary-point-{audioId}-{pointNumber})
                    const match = elementId.match(/(?:echo|audio-summary)-point-.*-(\d+)$/);
                    if (match && parseInt(match[1]) === pointNumber) {
                      // Found the matching element
                      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      // Add persistent highlight
                      element.classList.add('highlight-persistent');
                    }
                  });
                }, 800); // Slightly longer delay to ensure page loads
              }
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
  message: UIMessage;
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
  _onCitationClick?: (type: string, id: string, text: string) => void;
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
  onCitationClick?: (type: string, id: string, text: string) => void;
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
    console.log('💬 MessageContent: Processing content:', content);
    console.log('💬 MessageContent: idMapping:', idMapping);

    // First post-process the response for consistent formatting
    const formattedContent = postProcessResponse(content);
    console.log('💬 MessageContent: Formatted content:', formattedContent);

    // Validate and clean citations before parsing
    const cleanedContent = validateAndCleanCitations(formattedContent, idMapping || { forward: {}, reverse: {} });
    if (cleanedContent !== formattedContent) {
      console.warn('💬 MessageContent: Citations were cleaned/validated');
    }

    // Then parse citations
    const result = parseCitations(cleanedContent, idMapping || { forward: {}, reverse: {} });
    console.log('💬 MessageContent: Parse result:', result);

    return result;
  }, [content, idMapping]);

  // Notify parent about citations
  useEffect(() => {
    if (onCitationsParsed && citations.length > 0) {
      onCitationsParsed(citations);
    }
  }, [citations, onCitationsParsed]);

  // Use our custom markdown renderer with all necessary props for tooltips
  return (
    <CustomMarkdownRenderer
      content={text}
      citations={citations}
      onCitationClick={onCitationClick}
      projects={projects}
      bulletPointsByProject={bulletPointsByProject}
      dynamicFiles={dynamicFiles}
      audioTranscriptions={audioTranscriptions}
    />
  );
}

// TextFragment component removed - now using Response component directly


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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Track message metrics
  const [messageMetrics, setMessageMetrics] = useState<Record<string, { startTime: number; endTime?: number; tokenEstimate?: number }>>({});

  // Build ID mapping including branches
  const idMapping = useMemo(() => {
    const mapping: IdMapping = { forward: {}, reverse: {} };
    let projectCounter = 0;
    let bulletCounter = 0;
    let pageCounter = 0;
    let branchCounter = 0;

    // Map dynamic files (pages)
    if (dynamicFiles) {
      dynamicFiles.forEach((page) => {
        pageCounter++;
        const simpleId = `PG${pageCounter}`;
        mapping.forward[page._id] = simpleId;
        mapping.reverse[simpleId] = page._id;
      });
    }

    // Map projects and their items
    if (projects) {
      projects.forEach((project) => {
        projectCounter++;
        const projectSimpleId = `P${projectCounter}`;
        mapping.forward[project._id] = projectSimpleId;
        mapping.reverse[projectSimpleId] = project._id;

        // Map bullet points for this project
        const projectBullets = bulletPointsByProject?.[project._id] || [];
        projectBullets.forEach((bullet) => {
          bulletCounter++;
          const bulletSimpleId = `B${bulletCounter}`;
          mapping.forward[bullet._id] = bulletSimpleId;
          mapping.reverse[bulletSimpleId] = bullet._id;

          // Map branches for this bullet point
          const bulletBranches = branchesByBulletPoint?.[bullet._id] || [];
          bulletBranches.forEach((branch) => {
            branchCounter++;
            const branchSimpleId = `BR${branchCounter}`;
            mapping.forward[branch._id] = branchSimpleId;
            mapping.reverse[branchSimpleId] = branch._id;
          });
        });
      });
    }

    return mapping;
  }, [projects, bulletPointsByProject, dynamicFiles, branchesByBulletPoint]);

  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Always use GPT-OSS-120B for all chats
  // Web search is always enabled
  const webSearch = true;


  const initialMessages: UIMessage[] = [];

  // Models available
  // GPT-OSS-120B is the only model we use

  // Use the useChat hook with DefaultChatTransport
  // Create transport with current model - use key to force reinit on model change
  const transport = useMemo(
    () => new DefaultChatTransport({
      api: `${convexSiteUrl}/api/resume-chat`,
      body: { resumeId, searchEnabled: webSearch },
    }),
    [resumeId, webSearch]
  );

  const { messages, sendMessage, status, setMessages, error } = useChat({
    id: `chat-${webSearch}`, // Use id to separate chats by web search
    transport,
    messages: initialMessages,
    onError: (error) => {
      console.error('[CLIENT] useChat error:', error);
      console.error('[CLIENT] Error stack:', error.stack);
    },
    onToolCall: async ({ toolCall }) => {
      console.log('[CLIENT] Tool call received:', toolCall);
    },
    onFinish: async ({ message }) => {
      console.log('[CLIENT] Message finished:', {
        messageId: message?.id,
        messageLength: message?.parts?.reduce((acc, part) => {
          if (part.type === 'text' && part.text) {
            return acc + part.text.length;
          }
          return acc;
        }, 0) || 0
      });

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

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Track start time for streaming messages separately
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'assistant' && status === 'streaming' && !messageMetrics[lastMessage.id]?.startTime) {
      console.log('[CLIENT] Starting to stream assistant message:', lastMessage.id);
      setMessageMetrics(prev => ({
        ...prev,
        [lastMessage.id]: { startTime: Date.now() }
      }));
    }

    // Log status changes
    console.log('[CLIENT] Chat status:', status, 'Messages count:', messages.length);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, status]); // Only depend on messages.length and status, not messageMetrics

  // Log errors if any
  useEffect(() => {
    if (error) {
      console.error('[CLIENT] Chat error detected:', error);
    }
  }, [error]);

  // For now, we'll need to handle ID mapping extraction through a different approach
  // The backend will need to send the mapping as part of the streamed message

  const suggestedQuestions = [
    "Give me an overview of this candidate",
    "What are their key technical skills?",
    "What's their work experience like?",
    "What are their main achievements?"
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    console.log('[CLIENT] Sending message:', input);
    // sendMessage handles message creation internally
    sendMessage({ text: input });
    setInput('');
    // Reset textarea height after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = '48px';
    }
  };

  const handleSuggestedQuestion = async (question: string) => {
    if (status !== 'submitted' && status !== 'streaming') {
      // sendMessage handles message creation internally
      sendMessage({ text: question });
    }
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
    // Clear all messages
    setMessages([]);
    setMessageMetrics({});
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = '48px';
    }
  };

  return (
    <div className={cn("flex h-full flex-col bg-white dark:bg-neutral-950", className)}>
      {/* AI Header */}
      <div className="border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
        <div className="flex items-center justify-between px-8 py-3">
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
      <Conversation className="flex-1 bg-white dark:bg-neutral-950 overflow-hidden min-h-0">
        <ConversationContent className="px-8 py-6 h-full overflow-y-auto">
          {/* Notion-style greeting when no messages */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full max-w-3xl mx-auto px-4">
              {/* Simple greeting */}
              <div className="text-center mb-12">
                <h1 className="text-3xl font-light text-neutral-800 dark:text-neutral-200 mb-3" style={{
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
                  letterSpacing: '-0.02em'
                }}>
                  How can I help with this resume?
                </h1>
                <p className="text-neutral-500 dark:text-neutral-400 text-base font-light">
                  Ask me anything about the candidate&apos;s experience, skills, or qualifications
                </p>
              </div>

              {/* Notion-style suggestions */}
              <div className="grid grid-cols-2 gap-3 w-full max-w-xl">
                {suggestedQuestions.map((question, index) => (
                  <button
                    key={question}
                    onClick={() => handleSuggestedQuestion(question)}
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
                        {question}
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
          )}
          {messages.map((message) => {
            const parts = message.parts || [];

            // Check if we have multiple reasoning/tool parts that should be grouped
            const toolParts = parts.filter((p): p is ToolUIPart => p.type?.startsWith("tool-") || false);
            const reasoningParts = parts.filter((p): p is ReasoningUIPart => p.type === "reasoning");
            const hasMultipleSteps = (toolParts.length + reasoningParts.length) > 1;

            return (
              <div key={message.id}>
                {/* Task list for tool steps */}
                {hasMultipleSteps ? (
                  <Task className="mb-4" defaultOpen={false}>
                    <TaskTrigger title={`Tasks (${toolParts.length + reasoningParts.length} steps)`} />
                    <TaskContent>
                      {/* Tools as steps */}
                      {toolParts.map((toolPart, i: number) => {
                        // Extract tool name for display
                        let displayName = '';
                        const typeStr = toolPart.type || '';

                        if (typeStr.includes('web_search')) {
                          displayName = 'Searching web';
                        } else if (typeStr.includes('search_content')) {
                          displayName = 'Searching content';
                        } else if (typeStr.includes('search_page_content')) {
                          displayName = 'Reading documentation';
                        } else if (typeStr.includes('scrape_portfolio')) {
                          displayName = 'Fetching portfolio';
                        } else if (typeStr.includes('fetch_resume_data')) {
                          displayName = 'Getting resume data';
                        }

                        if (!displayName) return null;

                        return (
                          <TaskItem key={`${message.id}-tool-${i}`}>
                            {displayName}
                          </TaskItem>
                        );
                      })}

                      {/* Reasoning as steps */}
                      {reasoningParts.map((reasoningPart, i: number) => {
                        // Check if this is just a duration message like "Thought for 1 seconds"
                        const isDurationOnly = reasoningPart.text?.match(/^Thought for \d+\s*(seconds?|s)?$/i);

                        // Extract duration if present
                        const durationMatch = reasoningPart.text?.match(/Thought for (\d+)\s*(seconds?|s)?/i);
                        const duration = durationMatch ? `${durationMatch[1]}s` : null;

                        // Check if still streaming
                        const hasTextPart = parts.some(p => p.type === 'text' && p.text && p.text.trim());
                        const isReasoningStreaming = status === 'streaming' &&
                                                     message.id === messages.at(-1)?.id &&
                                                     !hasTextPart;

                        // Simple description based on what we have
                        let description: string | undefined;
                        if (isDurationOnly && duration) {
                          description = `Thought for ${duration}`;
                        } else if (isReasoningStreaming) {
                          description = 'Processing...';
                        } else {
                          description = 'Complete';
                        }

                        return (
                          <TaskItem key={`${message.id}-reasoning-${i}`}>
                            Processing{description && description !== 'Complete' ? ` - ${description}` : ''}
                            {/* Show reasoning text if available and not just duration */}
                            {reasoningPart.text && !isDurationOnly && (
                              <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {reasoningPart.text.substring(0, 100)}...
                              </div>
                            )}
                          </TaskItem>
                        );
                      })}
                    </TaskContent>
                  </Task>
                ) : (
                  <>
                    {/* Single tool display */}
                    {toolParts.map((toolPart, i: number) => {
                      // Extract tool name for display
                      let displayName = '';
                      const typeStr = toolPart.type || '';

                      if (typeStr.includes('web_search')) {
                        displayName = 'Searching web';
                      } else if (typeStr.includes('search_content')) {
                        displayName = 'Searching content';
                      } else if (typeStr.includes('search_page_content')) {
                        displayName = 'Reading documentation';
                      } else if (typeStr.includes('scrape_portfolio')) {
                        displayName = 'Fetching portfolio';
                      } else if (typeStr.includes('fetch_resume_data')) {
                        displayName = 'Getting resume data';
                      }

                      if (!displayName) return null;

                      const isComplete = toolPart.state === 'output-available';
                      const hasError = toolPart.state === 'output-error';

                      return (
                        <div key={`${message.id}-tool-${i}`} className="mb-2 px-8">
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-400">
                            {!isComplete && !hasError && (
                              <Loader className="h-3 w-3" />
                            )}
                            {isComplete && !hasError && (
                              <CheckIcon className="h-3 w-3 text-green-600 dark:text-green-400" />
                            )}
                            {hasError && (
                              <XIcon className="h-3 w-3 text-red-600 dark:text-red-400" />
                            )}
                            <span className="font-medium">{displayName}</span>
                          </div>
                        </div>
                      );
                    })}

                    {/* Single reasoning display */}
                    {reasoningParts.map((reasoningPart, i: number) => {
                      const hasTextPart = parts.some(p => p.type === 'text' && p.text && p.text.trim());
                      const isReasoningStreaming = status === 'streaming' &&
                                                   message.id === messages.at(-1)?.id &&
                                                   !hasTextPart;

                      return (
                        <Reasoning
                          key={`${message.id}-reasoning-${i}`}
                          isStreaming={isReasoningStreaming}
                          defaultOpen={false}
                        >
                          <ReasoningTrigger />
                          <ReasoningContent>{reasoningPart.text}</ReasoningContent>
                        </Reasoning>
                      );
                    })}
                  </>
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
            <div className="px-8 py-4">
              <Loader />
            </div>
          )}

          <div ref={messagesEndRef} />
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Modern chat input - ChatGPT/Claude style */}
      <div className="border-t border-neutral-200/50 dark:border-neutral-800/50 bg-white dark:bg-neutral-950">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <form onSubmit={handleSubmit} className="relative">
            <div className="relative flex items-end">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  // Auto-resize textarea
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                placeholder="Ask about this resume..."
                rows={1}
                className="w-full resize-none bg-neutral-50 dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 pl-4 pr-12 py-3 text-sm placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white focus:border-transparent transition-all"
                style={{
                  minHeight: '48px',
                  maxHeight: '200px'
                }}
              />
              {/* Send button inside input */}
              <button
                type="submit"
                disabled={!input.trim() || status === 'streaming'}
                className={cn(
                  "absolute right-2 bottom-2 p-1.5 rounded-lg transition-all",
                  input.trim() && status !== 'streaming'
                    ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100"
                    : "bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 cursor-not-allowed"
                )}
              >
                <ArrowUpIcon className="w-5 h-5" />
              </button>
            </div>
            {/* Helper text */}
            <div className="mt-2 px-1 flex items-center justify-between">
              <span className="text-xs text-neutral-400 dark:text-neutral-500">
                Press Enter to send, Shift+Enter for new line
              </span>
              <span className="text-xs text-neutral-400 dark:text-neutral-500">
                Powered by Cerebras
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}