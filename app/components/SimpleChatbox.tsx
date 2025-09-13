'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState, useMemo, Fragment } from 'react';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Message, MessageContent } from '@/components/ai-elements/message';
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputButton,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import {
  Actions,
  Action,
} from '@/components/ai-elements/actions';
import { Response } from '@/components/ai-elements/response';
import { Loader } from '@/components/ai-elements/loader';
import { Tool, ToolContent, ToolHeader } from '@/components/ai-elements/tool';
import {
  Sources,
  SourcesContent,
  SourcesTrigger,
  Source,
} from '@/components/ai-elements/sources';
import { parseCitations } from '@/lib/citation-parser';
import { IdMapping, Citation } from '@/types/chat';
import { Id } from '@/convex/_generated/dataModel';
import { Badge } from '@/components/ui/badge';
import { RefreshCcwIcon, CopyIcon, SearchIcon } from 'lucide-react';

const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.replace(
  /.cloud$/,
  ".site"
);

interface SimpleChatboxProps {
  resumeId?: Id<"resumes">;
}

interface ToolCallPart {
  type: string;
  state?: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
  args?: {
    pageQuery?: string;
  };
}

interface ToolResultPart {
  type: string;
  result?: {
    success?: boolean;
    pageTitle?: string;
    error?: string;
  };
}

function CitationSource({ citation, index }: { citation: Citation; index: number }) {
  return (
    <Source
      href={`#citation-${citation.simpleId}`}
      title={`${citation.type}: ${citation.text}`}
    >
      <Badge variant="secondary" className="text-xs">
        [{index + 1}]
      </Badge>
      <span className="block font-medium">{citation.type}: {citation.text}</span>
    </Source>
  );
}

function MessageWithCitations({
  content,
  idMapping,
  messageId
}: {
  content: string;
  idMapping?: IdMapping;
  messageId: string;
}) {
  const { text, citations } = useMemo(() =>
    parseCitations(content, idMapping),
    [content, idMapping]
  );

  if (citations.length === 0) {
    return <Response>{content}</Response>;
  }

  return (
    <Fragment>
      {/* Sources component for citations */}
      <Sources>
        <SourcesTrigger count={citations.length} />
        {citations.map((citation, index) => (
          <SourcesContent key={`${messageId}-citation-${index}`}>
            <CitationSource citation={citation} index={index} />
          </SourcesContent>
        ))}
      </Sources>
      
      {/* Main response with inline citation markers */}
      <Response>
        {text.replace(/\{\{citation:(\d+)\}\}/g, (match, index) => {
          const citationIndex = parseInt(index);
          return `[${citationIndex + 1}]`;
        })}
      </Response>
    </Fragment>
  );
}

export default function SimpleChatbox({ resumeId }: SimpleChatboxProps) {
  const [input, setInput] = useState('');
  const [idMapping] = useState<IdMapping | undefined>();
  const [searchEnabled, setSearchEnabled] = useState(true);

  const { messages, sendMessage, status, regenerate } = useChat({
    transport: new DefaultChatTransport({
      api: `${convexSiteUrl}/api/chat`,
      body: resumeId ? { resumeId } : undefined,
    }),
  });

  const handleSubmit = (message: PromptInputMessage) => {
    const hasText = Boolean(message.text);
    const hasAttachments = Boolean(message.files?.length);

    if (!(hasText || hasAttachments)) {
      return;
    }

    sendMessage(
      { 
        text: message.text || 'Sent with attachments',
        files: message.files 
      },
      {
        body: {
          searchEnabled,
        },
      },
    );
    setInput('');
  };

  return (
    <div className="max-w-4xl mx-auto p-6 relative size-full h-screen">
      <div className="flex flex-col h-full">
        <Conversation className="h-full">
          <ConversationContent>
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                {resumeId
                  ? "Ask questions about this resume and its projects"
                  : "Start a conversation with the AI assistant"}
              </div>
            )}

            {messages.map((message) => {
              return (
                <div key={message.id}>
                  {message.parts.map((part, i) => {
                    // Handle text parts
                    if (part.type === 'text') {
                      return (
                        <Fragment key={`${message.id}-${i}`}>
                          <Message from={message.role}>
                            <MessageContent>
                              {idMapping ? (
                                <MessageWithCitations
                                  content={part.text}
                                  idMapping={idMapping}
                                  messageId={message.id}
                                />
                              ) : (
                                <Response>{part.text}</Response>
                              )}
                            </MessageContent>
                          </Message>
                          
                          {/* Add action buttons for assistant messages */}
                          {message.role === 'assistant' && i === message.parts.length - 1 && (
                            <Actions className="mt-2">
                              <Action
                                onClick={() => regenerate()}
                                label="Retry"
                                tooltip="Regenerate response"
                              >
                                <RefreshCcwIcon className="size-3" />
                              </Action>
                              <Action
                                onClick={() =>
                                  navigator.clipboard.writeText(part.text)
                                }
                                label="Copy"
                                tooltip="Copy to clipboard"
                              >
                                <CopyIcon className="size-3" />
                              </Action>
                            </Actions>
                          )}
                        </Fragment>
                      );
                    }

                    // Handle tool call parts
                    if (part.type === 'tool-call') {
                      const toolPart = part as ToolCallPart;
                      return (
                        <Message key={`${message.id}-${i}`} from="assistant">
                          <MessageContent>
                            <Tool>
                              <ToolHeader
                                type="tool-call"
                                state={(toolPart.state as 'input-streaming' | 'input-available' | 'output-available' | 'output-error') || 'input-available'}
                              />
                              <ToolContent>
                                <div className="text-sm text-muted-foreground">
                                  <SearchIcon className="size-4 inline mr-2" />
                                  Searching: {toolPart.args?.pageQuery || 'Loading...'}
                                </div>
                              </ToolContent>
                            </Tool>
                          </MessageContent>
                        </Message>
                      );
                    }

                    // Handle tool result parts
                    if (part.type === 'tool-result') {
                      const resultPart = part as ToolResultPart;
                      return (
                        <Message key={`${message.id}-${i}`} from="assistant">
                          <MessageContent>
                            <Tool>
                              <ToolHeader
                                type="tool-result"
                                state="output-available"
                              />
                              <ToolContent>
                                <div className="text-sm">
                                  {resultPart.result?.success ? (
                                    <div className="text-green-600">
                                      ✓ Found: {resultPart.result.pageTitle}
                                    </div>
                                  ) : (
                                    <div className="text-red-600">
                                      ✗ Error: {resultPart.result?.error || 'Unknown error'}
                                    </div>
                                  )}
                                </div>
                              </ToolContent>
                            </Tool>
                          </MessageContent>
                        </Message>
                      );
                    }

                    return null;
                  })}
                </div>
              );
            })}

            {status === 'submitted' && <Loader />}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <PromptInput onSubmit={handleSubmit} className="mt-4" globalDrop multiple>
          <PromptInputBody>
            <PromptInputAttachments>
              {(attachment) => <PromptInputAttachment data={attachment} />}
            </PromptInputAttachments>
            <PromptInputTextarea
              onChange={(e) => setInput(e.target.value)}
              value={input}
              placeholder={resumeId
                ? "Ask about projects, skills, or experience..."
                : "Type your message..."}
            />
          </PromptInputBody>
          
          <PromptInputToolbar>
            <PromptInputTools>
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger />
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments />
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
              
              <PromptInputButton
                variant={searchEnabled ? 'default' : 'ghost'}
                onClick={() => setSearchEnabled(!searchEnabled)}
              >
                <SearchIcon size={16} />
                <span>Search</span>
              </PromptInputButton>
            </PromptInputTools>
            
            <PromptInputSubmit disabled={!input.trim()} status={status} />
          </PromptInputToolbar>
        </PromptInput>
      </div>
    </div>
  );
}
