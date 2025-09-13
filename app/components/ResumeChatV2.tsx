"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Send, 
  Bot, 
  Copy, 
  Check,
  ArrowDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { CitationTooltip } from "@/components/ui/citation-tooltip";

interface Message {
  id: string;
  role: "user" | "assistant" | "error" | "system";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

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
}

interface ChatResponse {
  response: string;
  references?: Array<{
    type: string;
    text: string;
    simpleId: string;
    convexId: string;
  }>;
  idMapping?: {
    forward: Record<string, string>;
    reverse: Record<string, string>;
  };
  idMappingArrays?: {
    forward: Array<[string, string]>;
    reverse: Array<[string, string]>;
  };
  success: boolean;
  error?: string;
}

// Simple Message Content Component
function MessageContent({ content, onCitationClick, idMapping, projects, bulletPointsByProject, dynamicFiles }: { 
  content: string; 
  onCitationClick?: (type: string, id: string, text: string) => void;
  idMapping?: { reverse: Record<string, string> };
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
}) {
  // Parse citations and create elements
  const parts = [];
  let lastIndex = 0;
  
  // Track citation numbers - sequential across all types
  let citationCounter = 0;
  
  // Find all citations - both valid and fallback
  const citationRegex = /\[([^:]+):\s*"([^"]+?)(?:\.\.\.)?"\]\s*\{([^}]*)\}/g;
  let match;
  
  console.log('📝 Processing content for citations:', content.substring(0, 200));
  
  // Valid citation types
  const validTypes = ['project', 'bullet', 'branch', 'github', 'portfolio', 'page'];
  
  while ((match = citationRegex.exec(content)) !== null) {
    // Add text before citation
    if (match.index > lastIndex) {
      parts.push(content.substring(lastIndex, match.index));
    }
    
    const type = match[1].toLowerCase();
    const text = match[2];
    const simpleId = match[3];
    
    // Check if this is a valid citation type
    if (!validTypes.includes(type)) {
      // For invalid types (like "Resume Owner"), show as a numbered citation that links to resume
      citationCounter++;
      const num = citationCounter;
      
      parts.push(
        <CitationTooltip
          key={`fallback-${citationCounter}-${match.index}`}
          source="Resume"
          content={text}
        >
          <span
            className="inline-flex items-center justify-center cursor-pointer ml-0.5 px-1.5 min-w-[18px] h-[18px] rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-[10px] font-medium text-gray-700 dark:text-gray-300 transition-all duration-200 hover:scale-105 align-baseline relative -top-[1px]"
            onClick={(e) => {
              e.stopPropagation();
              // Scroll to top of resume
              const resumeContent = document.getElementById('resume-content');
              if (resumeContent) {
                resumeContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }}
          >
            {num}
          </span>
        </CitationTooltip>
      );
      
      lastIndex = match.index + match[0].length;
      continue;
    }
    
    // For GitHub citations with repo names (format: github:reponame) and Portfolio citations, preserve the full ID
    let id;
    if ((type === 'github' && simpleId.startsWith('github:')) || 
        (type === 'portfolio' && simpleId.startsWith('portfolio:'))) {
      id = simpleId; // Keep the full format for specific references
    } else {
      const convexId = idMapping?.reverse?.[simpleId] || simpleId;
      id = convexId;
    }
    
    console.log('🎯 Citation found:', { type, text, simpleId, id });
    
    // Generate citation number - always increment for each citation
    citationCounter++;
    const num = citationCounter;
    
    // Generate unique ID for key
    const uniqueId = `${id}-${citationCounter}`;
    
    // Add citation element - use PageCitation for pages
    if (type === 'page') {
      const page = dynamicFiles?.find(f => f._id === id);
      parts.push(
        <PageCitation
          key={`${type}-${uniqueId}-${match.index}`}
          text={text}
          id={id}
          num={num}
          page={page}
          onClick={() => {
            if (onCitationClick) {
              onCitationClick(type, id, text);
            }
          }}
        />
      );
    } else {
      parts.push(
        <Citation
          key={`${type}-${uniqueId}-${match.index}`}  // Use uniqueId to ensure uniqueness
          type={type}
          text={text}
          id={id}
          num={num}
          projects={projects}
          bulletPointsByProject={bulletPointsByProject}
          onClick={() => {
            if (onCitationClick) {
              onCitationClick(type, id, text);
            }
          }}
        />
      );
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(content.substring(lastIndex));
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
          // Format markdown in each paragraph
          const formatted = p.replace(/\n/g, ' ') // Single newlines become spaces
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
  const pageContent = useQuery(api.dynamicFileContent.get, page ? { fileId: id as Id<"dynamicFiles"> } : "skip");
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick();
  };
  
  // Parse line number from text
  const lineMatch = text.match(/\s+L([\d\-]+)$/);
  const lineNum = lineMatch ? parseInt(lineMatch[1]) : null;
  
  let tooltipContent = page?.title || text;
  // let lineIndicator = ""; // Not used currently
  
  if (lineNum && pageContent?.content) {
    // Extract the actual line content from BlockNote content
    // BlockNote stores content as blocks
    const blocks = pageContent.content || [];
    
    // Map line numbers to blocks (same mapping as in DynamicFileViewer)
    const lineToBlockMap: { [key: number]: number } = {
      1: 0, 2: 2, 3: 3, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9,
      9: 11, 10: 12, 11: 13, 12: 14, 13: 15, 14: 16,
      15: 17, 16: 18, 17: 19, 18: 20, 19: 22, 20: 23, 21: 24
    };
    
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
        tooltipContent = blockText || tooltipContent;
      }
    }
    
    // lineIndicator = `${page?.title || 'Page'} • Line ${lineNum}`; // Not used currently
  }
  
  return (
    <CitationTooltip
      source={page?.title || 'Page'}
      line={lineNum || undefined}
      content={tooltipContent}
    >
      <span
        className="inline-flex items-center justify-center cursor-pointer ml-0.5 px-1.5 min-w-[18px] h-[18px] rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-[10px] font-medium text-gray-700 dark:text-gray-300 transition-all duration-200 hover:scale-105 align-baseline relative -top-[1px]"
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
  // Fetch branch content if needed
  const branch = useQuery(api.branches.get, type === 'branch' ? { id: id as Id<"branches"> } : "skip");
  
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
        className="inline-flex items-center justify-center cursor-pointer ml-0.5 px-1.5 min-w-[18px] h-[18px] rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-[10px] font-medium text-gray-700 dark:text-gray-300 transition-all duration-200 hover:scale-105 align-baseline relative -top-[1px]"
        onClick={handleClick}
        data-citation-type={type}
        data-citation-id={id}
      >
        {num}
      </span>
    </CitationTooltip>
  );
}


export function ResumeChatV2({ resumeId, className, onCitationClick, projects, bulletPointsByProject, dynamicFiles }: ResumeChatProps) {
  const [idMapping, setIdMapping] = useState<{
    reverse: Record<string, string>; // simpleId -> convexId
  }>({ reverse: {} });
  
  
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "system",
      content: "Ask me about this resume.",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const chatWithResume = useAction(api.ai.chatWithResume);
  // const resume = useQuery(api.resumes.get, { id: resumeId });

  // Auto-scroll to bottom
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ 
      behavior: smooth ? "smooth" : "auto",
      block: "end" 
    });
  }, []);

  // Check scroll position
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
    setShowScrollButton(!isNearBottom);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Copy message to clipboard
  const copyToClipboard = useCallback(async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  // Retry last message
  const retryLastMessage = useCallback(() => {
    const lastUserMessage = [...messages].reverse().find(m => m.role === "user");
    if (lastUserMessage) {
      setInput(lastUserMessage.content);
      // Remove the last assistant/error message if exists
      setMessages(prev => {
        const lastIndex = prev.findIndex(m => m.id === lastUserMessage.id);
        return prev.slice(0, lastIndex + 1);
      });
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    
    // Focus back to input
    inputRef.current?.focus();

    try {
      const history = messages.slice(-5).map(msg => ({
        role: msg.role === "system" ? "assistant" : msg.role,
        content: msg.content
      }));

      const response = await chatWithResume({
        resumeId,
        message: input,
        conversationHistory: history
      }) as ChatResponse;
      
      
      // Handle array format (new) or object format (fallback)
      if (response.idMappingArrays?.reverse) {
        // Convert arrays back to object
        const reverseMap = Object.fromEntries(response.idMappingArrays.reverse);
        setIdMapping(prev => ({
          reverse: { ...prev.reverse, ...reverseMap }
        }));
      } else if (response.idMapping?.reverse) {
        setIdMapping(prev => ({
          reverse: { ...prev.reverse, ...response.idMapping!.reverse }
        }));
      } else {
      }

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: response.success ? "assistant" : "error",
        content: response.response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: "error",
        content: "Sorry, I couldn't process your request. Please try again.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };


  const suggestedQuestions = [
    "Summarize this resume",
    "What technologies are used?",
    "Key achievements?"
  ];


  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Aurea</span>
          {isLoading && (
            <button
              onClick={() => setIsLoading(false)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea 
        ref={scrollAreaRef}
        className="flex-1 px-4"
        onScroll={handleScroll}
      >
        <div className="py-4 space-y-4">
          <AnimatePresence mode="popLayout">
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "flex gap-3",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {/* Bot Avatar for AI messages */}
                {message.role !== "user" && (
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-7 h-7 rounded-lg bg-muted/50 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                )}
                
                <div className={cn(
                  "group relative max-w-[85%]",
                  message.role === "user" && "flex flex-col items-end"
                )}>
                  <div
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm",
                      message.role === "user" 
                        ? "bg-foreground text-background" 
                        : message.role === "error"
                        ? "bg-destructive/10 text-destructive border border-destructive/20"
                        : "bg-muted/60 text-foreground"
                    )}
                  >
                    {message.role === "user" ? (
                      <p className="text-sm">{message.content}</p>
                    ) : (
                      <div className="text-sm">
                        <MessageContent 
                          content={message.content}
                          onCitationClick={onCitationClick}
                          idMapping={idMapping}
                          projects={projects}
                          bulletPointsByProject={bulletPointsByProject}
                          dynamicFiles={dynamicFiles}
                        />
                      </div>
                    )}
                  </div>
                  
                  {/* Message Actions and Timestamp */}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground">
                      {message.timestamp.toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </span>
                    {message.role !== "user" && message.role !== "error" && (
                      <button
                        onClick={() => copyToClipboard(message.content, message.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        {copiedMessageId === message.id ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
                
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Loading State */}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3"
            >
              <div className="flex-shrink-0 mt-0.5">
                <div className="w-7 h-7 rounded-lg bg-muted/50 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
              <div className="bg-muted/60 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {[0, 150, 300].map((delay) => (
                      <motion.div
                        key={delay}
                        className="w-1 h-1 rounded-full bg-muted-foreground/50"
                        animate={{
                          opacity: [0.3, 1, 0.3],
                        }}
                        transition={{
                          duration: 1.2,
                          repeat: Infinity,
                          delay: delay / 1000,
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">Thinking...</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* Suggested Questions */}
          {messages.length === 1 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-6 space-y-3"
            >
              <p className="text-xs text-muted-foreground text-center">Try asking:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {suggestedQuestions.map((question) => (
                  <button
                    key={question}
                    onClick={async () => {
                      // Instantly send the message without waiting
                      const userMessage: Message = {
                        id: `user-${Date.now()}`,
                        role: "user",
                        content: question,
                        timestamp: new Date()
                      };
                      setMessages(prev => [...prev, userMessage]);
                      setInput("");
                      setIsLoading(true);
                      
                      try {
                        const history = messages.slice(-5).map(msg => ({
                          role: msg.role === "system" ? "assistant" : msg.role,
                          content: msg.content
                        }));

                        const response = await chatWithResume({
                          resumeId,
                          message: question,
                          conversationHistory: history
                        }) as ChatResponse;
                        
                        // Handle array format (new) or object format (fallback) - SAME AS MAIN HANDLER
                        if (response.idMappingArrays?.reverse) {
                          const reverseMap = Object.fromEntries(response.idMappingArrays.reverse);
                          setIdMapping(prev => ({
                            reverse: { ...prev.reverse, ...reverseMap }
                          }));
                        } else if (response.idMapping?.reverse) {
                          setIdMapping(prev => ({
                            reverse: { ...prev.reverse, ...response.idMapping!.reverse }
                          }));
                        } else {
                        }

                        const assistantMessage: Message = {
                          id: `assistant-${Date.now()}`,
                          role: response.success ? "assistant" : "error",
                          content: response.response,
                          timestamp: new Date()
                        };

                        setMessages(prev => [...prev, assistantMessage]);
                      } catch {
                        const errorMessage: Message = {
                          id: `error-${Date.now()}`,
                          role: "error",
                          content: "Sorry, I couldn't process your request. Please try again.",
                          timestamp: new Date()
                        };
                        setMessages(prev => [...prev, errorMessage]);
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                    className="px-3 py-1.5 rounded-full border border-border/50 hover:bg-muted/50 transition-colors text-xs"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Scroll to Bottom Button */}
      {showScrollButton && (
        <div className="absolute bottom-16 right-4">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm border border-border/50 hover:bg-muted/50"
            onClick={() => scrollToBottom()}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Input Area */}
      <div className="p-3 border-t border-border/40">
        {/* Retry Button */}
        {messages.length > 1 && messages[messages.length - 1].role === "error" && (
          <button
            onClick={retryLastMessage}
            className="mb-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Retry last message
          </button>
        )}
        
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="relative"
        >
          <Input
            ref={inputRef}
            placeholder="Ask about this resume..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            className="pr-10 bg-muted/20 border-0 focus:bg-muted/30 transition-colors rounded-lg text-sm h-10"
          />
          <Button 
            type="submit" 
            disabled={isLoading || !input.trim()}
            size="icon"
            className="absolute right-1 top-1 h-8 w-8 rounded-md"
            variant="ghost"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>

    </div>
  );
}