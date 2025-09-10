"use client";

import { useState, useRef, useEffect } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  timestamp: Date;
}

interface ResumeChatProps {
  resumeId: Id<"resumes">;
  className?: string;
  onCitationClick?: (type: string, id: string, text: string) => void;
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
  success: boolean;
  error?: string;
}

export function ResumeChat({ resumeId, className, onCitationClick }: ResumeChatProps) {
  // Store the ID mapping from AI responses
  const [idMapping, setIdMapping] = useState<{
    reverse: Record<string, string>; // simpleId -> convexId
  }>({ reverse: {} });
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Ask me about this resume.",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatWithResume = useAction(api.ai.chatWithResume);
  // const resume = useQuery(api.resumes.get, { id: resumeId });

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Build conversation history (last 5 messages for context)
      const history = messages.slice(-5).map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const response = await chatWithResume({
        resumeId,
        message: input,
        conversationHistory: history
      }) as ChatResponse;

      console.log('🔵 CHAT RESPONSE RECEIVED:', {
        hasIdMapping: !!response.idMapping,
        reverseMapSize: response.idMapping?.reverse ? Object.keys(response.idMapping.reverse).length : 0,
        reverseMap: response.idMapping?.reverse,
        references: response.references,
        fullResponse: response
      });

      // Update ID mapping if provided
      if (response.idMapping?.reverse) {
        console.log('🟢 UPDATING ID MAPPING:', response.idMapping.reverse);
        setIdMapping(prev => {
          const newMapping = {
            reverse: { ...prev.reverse, ...response.idMapping!.reverse }
          };
          console.log('🟡 NEW MAPPING STATE:', newMapping);
          return newMapping;
        });
      } else {
        console.log('🔴 NO ID MAPPING IN RESPONSE');
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: response.success ? "assistant" : "error",
        content: response.response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "error",
        content: "Sorry, I couldn't process your request. Please try again.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const formatMessage = (content: string) => {
    // Parse and make citations clickable
    let formatted = content;
    console.log('📝 FORMATTING MESSAGE START');
    console.log('📋 Original content:', content);
    console.log('🗺️ Current ID mapping:', idMapping);
    console.log('🔑 Mapping keys:', Object.keys(idMapping.reverse));
    
    // Pre-process to fix common citation issues
    // Fix citations that have context in parentheses
    formatted = formatted.replace(
      /\[([^:]+): "([^"]+)"\s*\([^)]+\)\]\{([^}]+)\}/g,
      '[$1: "$2"]{$3}'
    );
    
    // Fix citations split across lines
    formatted = formatted.replace(
      /\[([^:]+): "([^"]+)"\]\s*\n\s*\{([^}]+)\}/g,
      '[$1: "$2"]{$3}'
    );
    
    // First, escape HTML to prevent XSS (but preserve our own HTML tags)
    formatted = formatted.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Clean up special characters that might be in the response
    formatted = formatted.replace(/↳/g, '→');
    
    // Format markdown-style formatting
    // Bold text
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // Headers
    formatted = formatted.replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold mt-3 mb-1">$1</h3>');
    formatted = formatted.replace(/^## (.+)$/gm, '<h2 class="text-base font-semibold mt-3 mb-2">$1</h2>');
    formatted = formatted.replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold mt-3 mb-2">$1</h1>');
    
    // Lists - Handle both dash and bullet symbols
    formatted = formatted.replace(/^[-•] (.+)$/gm, '<li class="ml-4 flex gap-2"><span class="text-muted-foreground">•</span><span>$1</span></li>');
    formatted = formatted.replace(/^\* (.+)$/gm, '<li class="ml-4 flex gap-2"><span class="text-muted-foreground">•</span><span>$1</span></li>');
    formatted = formatted.replace(/^\d+\. (.+)$/gm, '<li class="ml-4 flex gap-2"><span class="text-muted-foreground">$&</span></li>');
    
    // Wrap consecutive list items in ul tags
    formatted = formatted.replace(/(<li[^>]*>.*?<\/li>\s*)+/g, (match) => {
      return `<ul class="space-y-1 my-2">${match}</ul>`;
    });
    
    // Paragraphs and line breaks
    const paragraphs = formatted.split(/\n\n+/);
    formatted = paragraphs.map(p => {
      if (p.startsWith('<h') || p.startsWith('<ul') || p.includes('<li')) {
        return p;
      }
      // Replace single line breaks with spaces within paragraphs
      p = p.replace(/\n/g, ' ');
      return `<p class="mb-3 leading-relaxed">${p}</p>`;
    }).join('');
    
    // Format Project citations with IDs (handle multiple formats)
    formatted = formatted.replace(
      /\[Project:\s*"([^"]+)"\]\s*\{([^}]+)\}/g, 
      (match, text, simpleId) => {
        const convexId = idMapping.reverse[simpleId] || simpleId;
        console.log('🏗️ PROJECT CITATION FOUND:', {
          match,
          text,
          simpleId,
          convexId,
          isInMapping: !!idMapping.reverse[simpleId],
          mappingHasKey: simpleId in idMapping.reverse
        });
        const displayText = text.substring(0, 50).trim();
        return `<span class="inline-flex items-center gap-0.5 px-2 py-1 rounded-md bg-foreground/5 hover:bg-foreground/10 border border-border/50 transition-all text-xs font-medium cursor-pointer" data-type="project" data-text="${text}" data-id="${convexId}">
          ${displayText}
        </span>`;
      }
    );
    
    
    // Format Bullet citations with IDs (handle multiple formats)
    formatted = formatted.replace(
      /\[Bullet:\s*"([^"]+?)(?:\.\.\.)?"\]\s*\{([^}]+)\}/g,
      (match, text, simpleId) => {
        const convexId = idMapping.reverse[simpleId] || simpleId;
        console.log('🔹 BULLET CITATION FOUND:', {
          match,
          text,
          simpleId,
          convexId,
          isInMapping: !!idMapping.reverse[simpleId],
          mappingHasKey: simpleId in idMapping.reverse,
          fullMapping: idMapping.reverse
        });
        // Clean up the text - remove trailing dots and trim
        let displayText = text.replace(/\.+$/, '').trim();
        displayText = displayText.substring(0, 50) + (displayText.length > 50 ? '...' : '');
        return `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted/60 hover:bg-muted transition-all text-xs cursor-pointer" data-type="bullet" data-text="${text}" data-id="${convexId}">
          <span class="opacity-50">•</span> ${displayText}
        </span>`;
      }
    );
    
    // Fallback for old format including bullet symbols
    formatted = formatted.replace(
      /[•↳]\s*([^\n]{10,60})\.\.\.(?!\{)/g,
      (match, text) => {
        return `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted/60 hover:bg-muted transition-all text-xs cursor-pointer" data-type="bullet" data-text="${text}" data-id="">
          <span class="opacity-50">•</span> ${text}...
        </span>`;
      }
    );
    
    // Format Branch citations with IDs (handle multiple formats)
    formatted = formatted.replace(
      /\[Branch:\s*"([^"]+?)(?:\.\.\.)?"\]\s*\{([^}]+)\}/g,
      (match, text, simpleId) => {
        const convexId = idMapping.reverse[simpleId] || simpleId;
        console.log('🌿 BRANCH CITATION FOUND:', {
          match,
          text,
          simpleId,
          convexId,
          isInMapping: !!idMapping.reverse[simpleId],
          mappingHasKey: simpleId in idMapping.reverse
        });
        let displayText = text.replace(/\.+$/, '').trim();
        displayText = displayText.substring(0, 40) + (displayText.length > 40 ? '...' : '');
        return `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-foreground/[0.03] hover:bg-foreground/[0.06] transition-all text-xs text-muted-foreground cursor-pointer" data-type="branch" data-text="${text}" data-id="${convexId}">
          <span class="opacity-50">↪</span> ${displayText}
        </span>`;
      }
    );
    
    // Fallback for old format
    formatted = formatted.replace(
      /\[Branch under "([^"]+)": "([^"]+)"\](?!\{)/g,
      (match, bulletText, branchText) => {
        const displayText = branchText.substring(0, 40) + (branchText.length > 40 ? '...' : '');
        return `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-foreground/[0.03] hover:bg-foreground/[0.06] transition-all text-xs text-muted-foreground cursor-pointer" data-type="branch" data-text="${branchText}" data-id="">
          <span class="opacity-50">↪</span> ${displayText}
        </span>`;
      }
    );
    
    // Final fallback: Clean up any broken citations where ID appears after text
    // Example: [Bullet: "text"] {id} or [Bullet: "text"](context){id}
    formatted = formatted.replace(
      /\[(Project|Bullet|Branch):\s*"([^"]+)"[^\{]*\]\s*\{([PBR]+\d+)\}/gi,
      (match, type, text, simpleId) => {
        const lowerType = type.toLowerCase();
        const cleanText = text.replace(/\.+$/, '').trim();
        const displayText = cleanText.substring(0, 40) + (cleanText.length > 40 ? '...' : '');
        const convexId = idMapping.reverse[simpleId] || simpleId;
        
        console.log(`⚠️ FALLBACK CITATION:`, {
          type: lowerType,
          text,
          simpleId,
          convexId,
          isInMapping: !!idMapping.reverse[simpleId]
        });
        
        if (lowerType === 'project') {
          return `<span class="inline-flex items-center gap-0.5 px-2 py-1 rounded-md bg-foreground/5 hover:bg-foreground/10 border border-border/50 transition-all text-xs font-medium cursor-pointer group/citation relative" data-type="project" data-text="${cleanText}" data-id="${convexId}">
            ${displayText}
          </span>`;
        } else if (lowerType === 'bullet') {
          return `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted/60 hover:bg-muted transition-all text-xs cursor-pointer group/citation relative" data-type="bullet" data-text="${cleanText}" data-id="${convexId}">
            <span class="opacity-50">•</span> ${displayText}
          </span>`;
        } else if (lowerType === 'branch') {
          return `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-foreground/[0.03] hover:bg-foreground/[0.06] transition-all text-xs text-muted-foreground cursor-pointer group/citation relative" data-type="branch" data-text="${cleanText}" data-id="${convexId}">
            <span class="opacity-50">↪</span> ${displayText}
          </span>`;
        }
        return match;
      }
    );

    console.log('✅ FORMATTING COMPLETE');
    console.log('📄 Final formatted HTML (first 500 chars):', formatted.substring(0, 500));
    return formatted;
  };


  const handleCitationClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const citation = target.closest('span[data-type]') || target.closest('button[data-type]');
    
    console.log('🖱️ CLICK EVENT:', {
      target: target.tagName,
      citation: citation?.outerHTML?.substring(0, 200),
      hasCitation: !!citation
    });
    
    if (citation) {
      const type = citation.getAttribute('data-type');
      const text = citation.getAttribute('data-text');
      const id = citation.getAttribute('data-id');
      
      console.log('🎯 CITATION CLICKED:', {
        type,
        text,
        id,
        hasOnCitationClick: !!onCitationClick,
        idLength: id?.length,
        isSimpleId: id && /^[PBR]+\d+$/.test(id),
        isConvexId: id && /^[a-z0-9]{30,}$/.test(id)
      });
      
      if (type && text && onCitationClick) {
        console.log('📤 CALLING onCitationClick with:', { type, id, text });
        onCitationClick(type, id || '', text);
      } else {
        console.log('❌ NOT CALLING onCitationClick:', {
          hasType: !!type,
          hasText: !!text,
          hasCallback: !!onCitationClick
        });
      }
    } else {
      console.log('⚠️ NO CITATION ELEMENT FOUND');
    }
  };

  const suggestedQuestions = [
    "What are the main projects?",
    "Key technical skills?",
    "Tell me about the experience"
  ];

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Insight</span>
          <span className="text-[10px] text-muted-foreground">
            Aurea
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 overscroll-contain">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex",
              message.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-3.5 py-2.5",
                message.role === "user" 
                  ? "bg-foreground text-background ml-8" 
                  : message.role === "error"
                  ? "bg-destructive/10 text-destructive border border-destructive/20"
                  : "bg-muted/40 mr-8"
              )}
            >
              {message.role === "user" ? (
                <div className="text-sm leading-relaxed font-medium">
                  {message.content}
                </div>
              ) : (
                <div 
                  className="text-sm leading-relaxed space-y-2"
                  dangerouslySetInnerHTML={{ 
                    __html: (() => {
                      console.log('🔄 RENDERING MESSAGE:', message.id);
                      return formatMessage(message.content);
                    })()
                  }}
                  onClick={handleCitationClick}
                />
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted/40 rounded-xl px-4 py-3 mr-8">
              <div className="flex gap-1">
                <span className="h-1 w-1 bg-foreground/30 rounded-full animate-pulse" />
                <span className="h-1 w-1 bg-foreground/30 rounded-full animate-pulse" style={{ animationDelay: "150ms" }} />
                <span className="h-1 w-1 bg-foreground/30 rounded-full animate-pulse" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        {messages.length === 1 && (
          <div className="space-y-3 mt-4">
            <p className="text-xs text-muted-foreground text-center">Try asking:</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {suggestedQuestions.map((question) => (
                <button
                  key={question}
                  onClick={() => {
                    setInput(question);
                    setTimeout(() => handleSendMessage(), 100);
                  }}
                  className="px-3 py-1.5 rounded-full border border-border/50 hover:bg-muted/50 transition-colors text-xs"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border/40 bg-background">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="relative"
        >
          <Input
            placeholder="Explore this resume..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            className="pr-10 bg-muted/20 border-0 focus:bg-muted/30 transition-colors rounded-lg text-sm"
          />
          <Button 
            type="submit" 
            disabled={isLoading || !input.trim()}
            size="icon"
            className="absolute right-1 top-1 h-7 w-7 rounded-md"
            variant="ghost"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>
    </div>
  );
}