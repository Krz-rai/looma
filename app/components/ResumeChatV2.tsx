"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, UIMessage, ToolUIPart, TextUIPart, ReasoningUIPart } from 'ai';
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
// AI elements UI kit
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Loader } from "@/components/ai-elements/loader";
// Removed prompt-input imports since we're using custom input
import { Suggestions, Suggestion } from "@/components/ai-elements/suggestion";
import { Reasoning, ReasoningTrigger, ReasoningContent } from "@/components/ai-elements/reasoning";
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
  ChainOfThoughtContent
} from "@/components/ai-elements/chain-of-thought";
import { GlobeIcon, CopyIcon, RefreshCwIcon, Edit2Icon, CheckIcon, BotIcon, UserIcon, XIcon, SearchIcon, FileTextIcon, Globe2Icon, BrainCircuitIcon, ArrowUpIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CitationTooltip } from "@/components/ui/citation-tooltip";
import { parseCitations } from '@/lib/citation-parser';
import { postProcessResponse } from '@/lib/response-formatter';
import { IdMapping } from '@/types/chat';

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

// Simple Message Content Component (rich text + inline citations)
function RichMessageContent({
  content,
  onCitationClick,
  idMapping,
  projects,
  bulletPointsByProject,
  dynamicFiles,
  audioTranscriptions
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
  }>;
}) {
  const { text, citations } = useMemo(() => {
    console.log('💬 MessageContent: Processing content:', content);
    console.log('💬 MessageContent: idMapping:', idMapping);

    // First post-process the response for consistent formatting
    const formattedContent = postProcessResponse(content);
    console.log('💬 MessageContent: Formatted content:', formattedContent);

    // Then parse citations
    const result = parseCitations(formattedContent, idMapping || { forward: {}, reverse: {} });
    console.log('💬 MessageContent: Parse result:', result);

    return result;
  }, [content, idMapping]);

  // Parse text and create elements with citations
  const parts = [];
  let lastIndex = 0;

  // Track citation numbers
  let citationCounter = 0;

  // Process citation markers
  const citationPattern = /\{\{citation:(\d+)\}\}/g;
  let match;

  console.log('💬 Looking for citation markers in text length:', text.length);
  console.log('💬 Text preview:', text.substring(0, 200));

  while ((match = citationPattern.exec(text)) !== null) {
    // Add text before citation
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    const citationIndex = parseInt(match[1]);
    const citation = citations[citationIndex];

    console.log('💬 Processing citation:', {
      citationIndex,
      citation,
      match: match[0]
    });

    if (citation) {
      citationCounter++;
      const num = citationCounter;

      // Add citation element - use PageCitation for pages, AudioCitation for audio
      if (citation.type === 'audio') {
        // Extract filename and timestamp from text
        const fileName = citation.audioFileName || citation.text.split(' T')[0];
        const timestamp = citation.timestamp || 0;

        // Find the transcription segment for this citation
        let segmentText = '';
        if (audioTranscriptions && citation.convexId && fileName) {
          // Find the transcription for this page and file
          const transcription = audioTranscriptions.find(t =>
            t.dynamicFileId === citation.convexId &&
            t.fileName === fileName
          );

          if (transcription?.segments) {
            // Find the segment that starts at or just before this timestamp
            // Sort segments by start time to ensure proper ordering
            const sortedSegments = [...transcription.segments].sort((a, b) => a.start - b.start);

            // Find the segment that best matches this timestamp
            let bestSegment = null;
            for (let i = 0; i < sortedSegments.length; i++) {
              const segment = sortedSegments[i];
              const nextSegment = sortedSegments[i + 1];

              // If timestamp exactly matches the start, use this segment
              if (timestamp === segment.start) {
                bestSegment = segment;
                break;
              }

              // If timestamp is within this segment's range
              if (timestamp >= segment.start && timestamp < segment.end) {
                bestSegment = segment;
                break;
              }

              // If this is the last segment and timestamp is after its start
              if (!nextSegment && timestamp >= segment.start) {
                bestSegment = segment;
                break;
              }
            }

            if (bestSegment) {
              segmentText = bestSegment.text;
            }
          }
        }

        // Use segment text if found, otherwise show filename and timestamp
        const displayText = segmentText ? `"${segmentText}"` : `${fileName} at ${timestamp}s`;

        parts.push(
          <CitationTooltip
            key={`audio-${citation.simpleId}-${match.index}`}
            source="Audio"
            content={displayText}
          >
            <span
              className="inline-flex items-center justify-center cursor-pointer ml-1 mr-0.5 px-1.5 min-w-[18px] h-[18px] rounded-md bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-[10px] font-medium text-neutral-700 dark:text-neutral-300 transition-all duration-200 hover:scale-105 align-baseline relative -top-[1px]"
              onClick={(e) => {
                e.stopPropagation();
                if (onCitationClick) {
                  // For audio citations, pass page ID, filename, and timestamp
                  // Format: "audio:<pageConvexId>:<filename>:<timestamp>"
                  const audioData = `audio:${citation.convexId}:${fileName}:${timestamp}`;
                  onCitationClick('audio', audioData, citation.text);
                }
              }}
              data-citation-type="audio"
              data-citation-id={citation.simpleId}
              data-timestamp={timestamp}
            >
              {num}
            </span>
          </CitationTooltip>
        );
      } else if (citation.type === 'page') {
        const page = dynamicFiles?.find(f => f._id === citation.convexId);
        parts.push(
          <PageCitation
            key={`page-${citation.convexId}-${match.index}`}
            text={citation.text}
            id={citation.convexId}
            num={num}
            page={page}
            onClick={() => {
              if (onCitationClick) {
                onCitationClick(citation.type, citation.convexId, citation.text);
              }
            }}
          />
        );
      } else {
        parts.push(
          <Citation
            key={`${citation.type}-${citation.convexId}-${match.index}`}
            type={citation.type}
            text={citation.text}
            id={citation.convexId}
            num={num}
            projects={projects}
            bulletPointsByProject={bulletPointsByProject}
            onClick={() => {
              if (onCitationClick) {
                onCitationClick(citation.type, citation.convexId, citation.text);
              }
            }}
          />
        );
      }
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  // Format text parts - ensure everything stays inline
  const formattedParts = parts.map((part, i) => {
    if (typeof part === 'string') {
      // Wrap text in span to ensure inline display
      return <TextFragment key={i} text={part} />;
    }
    return part;
  });

  // Wrap in a single inline container
  return <span style={{ display: 'inline' }}>{formattedParts}</span>;
}

// Simple Text Fragment Component
function TextFragment({ text }: { text: string }) {
  // Check if this text contains paragraph breaks
  if (text.includes('\n\n')) {
    // Split by double newlines for paragraphs
    const paragraphs = text.split(/\n\n+/);
    return (
      <>
        {paragraphs.map((p, i) => {
          // Format markdown in each paragraph - preserve line breaks
          const formatted = p.replace(/\n/g, '<br/>') // Preserve line breaks within paragraphs
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-muted/50 text-xs font-mono text-foreground/90">$1</code>');

          if (i < paragraphs.length - 1) {
            // Add spacing between paragraphs
            return <span key={i}><span dangerouslySetInnerHTML={{ __html: formatted }} /><br /><br /></span>;
          }
          return <span key={i} dangerouslySetInnerHTML={{ __html: formatted }} />;
        })}
      </>
    );
  }

  // Handle single line breaks as <br/> for proper formatting
  const formattedText = text
    .replace(/\n/g, '<br/>')  // Keep line breaks for proper bullet formatting
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-muted/50 text-xs font-mono text-foreground/90">$1</code>');

  return <span dangerouslySetInnerHTML={{ __html: formattedText }} />;
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

export function ResumeChatV2({ resumeId, className, onCitationClick, projects, bulletPointsByProject, dynamicFiles, branchesByBulletPoint }: ResumeChatProps) {
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
  // Always use GPT-OSS-120B for all chats
  // Web search is always enabled
  const webSearch = true;


  const initialMessages: UIMessage[] = [
    {
      id: 'welcome',
      role: 'assistant',
      parts: [
        {
          type: 'text',
          text: 'Ask me about this resume.',
        },
      ],
    },
  ];

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

  const { messages, sendMessage, status, setMessages } = useChat({
    id: `chat-${webSearch}`, // Use id to separate chats by web search
    transport,
    messages: initialMessages,
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

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  // For now, we'll need to handle ID mapping extraction through a different approach
  // The backend will need to send the mapping as part of the streamed message

  const suggestedQuestions = [
    "Summarize this resume",
    "What technologies are used?",
    "Key achievements?"
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // sendMessage handles message creation internally
    sendMessage({ text: input });
    setInput('');
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
        // Remove all messages after the last user message (assistant responses)
        const messagesToKeep = messages.slice(0, lastUserMessageIndex);
        const lastUserMessage = messages[lastUserMessageIndex];
        const userTextPart = lastUserMessage.parts?.find((p): p is TextUIPart => p.type === 'text');

        if (userTextPart?.text) {
          // Clear metrics for removed messages
          const removedMessages = messages.slice(lastUserMessageIndex + 1);
          setMessageMetrics(prev => {
            const newMetrics = { ...prev };
            removedMessages.forEach(msg => delete newMetrics[msg.id]);
            return newMetrics;
          });

          // Clear the assistant messages and immediately resend
          setMessages(messagesToKeep);
          // Send the message directly without the user message in history
          sendMessage({ text: userTextPart.text });
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
      // Clear messages after this point and send edited message
      const messagesToKeep = messages.slice(0, messageIndex);
      setMessages(messagesToKeep);
      sendMessage({ text: editedText });
      setEditingMessageId(null);
      setEditedText("");
    }
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditedText("");
  };

  return (
    <div className={cn("flex h-full flex-col bg-white dark:bg-neutral-950", className)}>
      <Conversation className="flex-1 bg-white dark:bg-neutral-950 overflow-hidden min-h-0">
        <ConversationContent className="px-8 py-6 h-full overflow-y-auto">
          {messages.map((message) => {
            const parts = message.parts || [];

            // Check if we have multiple reasoning/tool parts that should be grouped
            const toolParts = parts.filter((p): p is ToolUIPart => p.type?.startsWith("tool-") || false);
            const reasoningParts = parts.filter((p): p is ReasoningUIPart => p.type === "reasoning");
            const hasMultipleSteps = (toolParts.length + reasoningParts.length) > 1;

            return (
              <div key={message.id}>
                {/* Chain of Thought for multiple steps */}
                {hasMultipleSteps ? (
                  <ChainOfThought className="mb-4" defaultOpen={false}>
                    <ChainOfThoughtHeader>
                      Chain of Thought ({toolParts.length + reasoningParts.length} steps)
                    </ChainOfThoughtHeader>
                    <ChainOfThoughtContent>
                      {/* Tools as steps */}
                      {toolParts.map((toolPart, i: number) => {
                        // Extract tool name and icon
                        let displayName = '';
                        let Icon = SearchIcon;
                        const typeStr = toolPart.type || '';

                        if (typeStr.includes('web_search')) {
                          displayName = 'Searching web';
                          Icon = Globe2Icon;
                        } else if (typeStr.includes('search_content')) {
                          displayName = 'Searching content';
                          Icon = SearchIcon;
                        } else if (typeStr.includes('search_page_content')) {
                          displayName = 'Reading documentation';
                          Icon = FileTextIcon;
                        } else if (typeStr.includes('scrape_portfolio')) {
                          displayName = 'Fetching portfolio';
                          Icon = GlobeIcon;
                        }

                        if (!displayName) return null;

                        const isComplete = toolPart.state === 'output-available';
                        const hasError = toolPart.state === 'output-error';
                        const status = hasError ? 'pending' : isComplete ? 'complete' : 'active';

                        return (
                          <ChainOfThoughtStep
                            key={`${message.id}-tool-${i}`}
                            icon={Icon}
                            label={displayName}
                            status={status}
                          />
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
                        const stepStatus = isReasoningStreaming ? 'active' : 'complete';

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
                          <ChainOfThoughtStep
                            key={`${message.id}-reasoning-${i}`}
                            icon={BrainCircuitIcon}
                            label="Reasoning"
                            description={description}
                            status={stepStatus}
                          >
                            {/* Show full reasoning text if it's not just a duration message */}
                            {reasoningPart.text && !isDurationOnly && (
                              <div className="text-xs text-muted-foreground mt-1 pl-6">
                                <details className="cursor-pointer">
                                  <summary className="hover:text-foreground">View reasoning</summary>
                                  <div className="mt-1 pl-2 border-l-2 border-border">
                                    {reasoningPart.text}
                                  </div>
                                </details>
                              </div>
                            )}
                          </ChainOfThoughtStep>
                        );
                      })}
                    </ChainOfThoughtContent>
                  </ChainOfThought>
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
                      }

                      if (!displayName) return null;

                      const isComplete = toolPart.state === 'output-available';
                      const hasError = toolPart.state === 'output-error';

                      return (
                        <div key={`${message.id}-tool-${i}`} className="mb-2">
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 text-xs text-muted-foreground">
                            {!isComplete && !hasError && (
                              <Loader className="h-3 w-3" />
                            )}
                            {isComplete && !hasError && (
                              <CheckIcon className="h-3 w-3 text-green-600" />
                            )}
                            {hasError && (
                              <XIcon className="h-3 w-3 text-red-600" />
                            )}
                            <span>{displayName}</span>
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
                  const messageIndex = messages.indexOf(message);
                  const isLastMessage = messageIndex === messages.length - 1;
                  // Strip leading empty lines/whitespace from message text
                  const messageText = textPart.text.replace(/^\s*\n+/, '').trimStart();
                  const isEditing = editingMessageId === `${messageIndex}`;

                  return (
                    <div key={`${message.id}-text-${i}`} className="flex flex-col group">
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
                            <div className="text-sm text-neutral-900 dark:text-neutral-100">
                              <RichMessageContent
                                content={messageText}
                                onCitationClick={onCitationClick}
                                idMapping={idMapping}
                                projects={projects}
                                bulletPointsByProject={bulletPointsByProject}
                                dynamicFiles={dynamicFiles}
                                audioTranscriptions={audioTranscriptions}
                              />
                            </div>
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
                })}
              </div>
            );
          })}

          {status === 'submitted' && (
            <div className="px-8 py-4">
              <Loader />
            </div>
          )}

          {messages.length === 1 && (
            <div className="mt-8 px-8">
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3 font-normal">Suggested questions</p>
              <Suggestions className="gap-2">
                {suggestedQuestions.map((q) => (
                  <Suggestion
                    key={q}
                    suggestion={q}
                    onClick={handleSuggestedQuestion}
                    className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs py-2 px-3 rounded-lg transition-all duration-200"
                  />
                ))}
              </Suggestions>
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