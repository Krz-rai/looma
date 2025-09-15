"use client";

import React, { useState, useEffect } from "react";
import { useCompletion } from '@ai-sdk/react';
import { Button } from "@/components/ui/button";
import "./BulletPointExpandedModal.css";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Loader2, ZoomIn, X } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface BulletPointExpandedModalProps {
  bulletPoint: {
    _id: Id<"bulletPoints">;
    content: string;
  };
  projectTitle: string;
  connectedPageId?: Id<"dynamicFiles">;
  resumeId: Id<"resumes">;
}

interface ContentBlock {
  type: 'ai' | 'citation';
  content: string;
  pageTitle?: string;
  lineNumber?: number;
}

export function BulletPointExpandedModal({
  bulletPoint,
  projectTitle,
  connectedPageId,
  resumeId,
}: BulletPointExpandedModalProps) {
  const [open, setOpen] = useState(false);
  const [contentBlocks, setContentBlocks] = useState<ContentBlock[]>([]);

  const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.replace(
    /.cloud$/,
    ".site"
  );

  // Use useCompletion for simpler single-response generation
  const {
    completion,
    complete,
    isLoading,
    error
  } = useCompletion({
    api: `${convexSiteUrl}/api/bullet-analysis`,
    body: {
      resumeId,
      bulletPointId: bulletPoint._id,
      connectedPageId,
      projectTitle,
    },
    onFinish: (prompt, completionText) => {
      console.log('✅ Completion finished:', {
        prompt,
        completionText,
        length: completionText?.length
      });

      // Parse the completion and create alternating blocks
      const blocks: ContentBlock[] = [];
      const lines = completionText.split('\n').filter(line => line.trim());
      let currentBlock: ContentBlock | null = null;

      lines.forEach(line => {
        // Check if it's a citation marker - simplified format
        if (line.includes('[CITATION]')) {
          if (currentBlock && currentBlock.type === 'ai') {
            blocks.push(currentBlock);
          }
          // Extract page title and content from citation - simplified format
          const citationMatch = line.match(/\[CITATION\]\s*([^|]+)\s*\|\s*(.*)/);
          if (citationMatch) {
            currentBlock = {
              type: 'citation',
              content: citationMatch[2].trim(),
              pageTitle: citationMatch[1].trim()
            };
            blocks.push(currentBlock);
            currentBlock = null;
          }
        } else if (line.includes('[AI]')) {
          if (currentBlock) {
            blocks.push(currentBlock);
          }
          currentBlock = {
            type: 'ai',
            content: line.replace('[AI]', '').trim()
          };
        } else if (currentBlock) {
          // Continue adding to current block
          currentBlock.content += '\n' + line;
        }
      });

      // Add any remaining block
      if (currentBlock) {
        blocks.push(currentBlock);
      }

      // If no structured format, parse as simple bullet points
      if (blocks.length === 0) {
        const aiPoints = completionText.split('•').filter(p => p.trim());
        aiPoints.forEach((point) => {
          blocks.push({
            type: 'ai',
            content: '• ' + point.trim()
          });
        });
      }

      setContentBlocks(blocks);
    },
    onError: (err) => {
      console.error("Error generating AI analysis:", err);
      console.error("Error details:", {
        message: err.message,
        stack: err.stack,
        cause: err.cause
      });
    },
  });

  // Log error if it exists
  useEffect(() => {
    if (error) {
      console.error("useCompletion error:", error);
    }
  }, [error]);

  // Parse completion as it streams to show partial results
  useEffect(() => {
    console.log('📝 Completion update:', {
      completion,
      isLoading,
      length: completion?.length
    });

    if (completion) {
      // Parse completion for live updates (both during and after loading)
      const blocks: ContentBlock[] = [];
      const lines = completion.split('\n').filter(line => line.trim());
      let currentBlock: ContentBlock | null = null;

      lines.forEach(line => {
        if (line.includes('[CITATION]')) {
          if (currentBlock && currentBlock.type === 'ai') {
            blocks.push(currentBlock);
          }
          const citationMatch = line.match(/\[CITATION\]\s*([^|]+)\s*\|\s*(.*)/);
          if (citationMatch) {
            currentBlock = {
              type: 'citation',
              content: citationMatch[2].trim(),
              pageTitle: citationMatch[1].trim()
            };
            blocks.push(currentBlock);
            currentBlock = null;
          }
        } else if (line.includes('[AI]')) {
          if (currentBlock) {
            blocks.push(currentBlock);
          }
          currentBlock = {
            type: 'ai',
            content: line.replace('[AI]', '').trim()
          };
        } else if (currentBlock) {
          currentBlock.content += '\n' + line;
        }
      });

      if (currentBlock) {
        blocks.push(currentBlock);
      }

      if (blocks.length > 0) {
        setContentBlocks(blocks);
      }
    }
  }, [completion, isLoading]); // Re-run whenever completion changes

  const generateAnalysis = () => {
    console.log('🚀 Starting analysis with:', {
      api: `${convexSiteUrl}/api/bullet-analysis`,
      prompt: `Analyze: "${bulletPoint.content}"`,
      body: {
        resumeId,
        bulletPointId: bulletPoint._id,
        connectedPageId,
        projectTitle,
      }
    });

    setContentBlocks([]);
    // Simple prompt for fast response
    const analysisPrompt = `Analyze: "${bulletPoint.content}"`;
    complete(analysisPrompt);
  };

  // Handle opening
  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && contentBlocks.length === 0 && connectedPageId) {
      generateAnalysis();
    }
  };

  // Popover handles escape key and click outside automatically

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "inline-flex h-4 w-4 p-0 ml-1 opacity-0 group-hover:opacity-100 hover:bg-muted transition-all align-middle",
            open && "opacity-100 bg-muted"
          )}
          title="View context"
        >
          <ZoomIn className="h-3 w-3 text-muted-foreground" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[520px] p-0 bg-background rounded-xl border border-border/50 shadow-2xl"
        side="bottom"
        align="start"
        sideOffset={8}
        alignOffset={-4}
        collisionPadding={16}
        avoidCollisions={true}
      >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              <h3 className="text-xs font-medium text-muted-foreground">Quick Analysis</h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              className="h-5 w-5 p-0 hover:bg-muted rounded-md transition-colors"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </Button>
          </div>

          {/* Content */}
          <div className="px-4 py-3 max-h-[280px] overflow-y-auto custom-scrollbar">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-3">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
                  <Loader2 className="h-5 w-5 animate-spin text-primary relative" />
                </div>
                <p className="text-xs text-muted-foreground animate-pulse">Analyzing context...</p>
              </div>
            ) : contentBlocks.length > 0 ? (
              <div className="space-y-2">
                {contentBlocks.map((block, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "text-xs leading-snug",
                      "animate-in fade-in-0 slide-in-from-top-1",
                      `animation-delay-${idx * 50}`
                    )}
                  >
                    {block.type === 'citation' ? (
                      <div className="bg-muted/20 rounded-md px-2.5 py-1.5 border-l-2 border-primary/20 hover:bg-muted/30 transition-colors">
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {block.pageTitle}:
                        </span>
                        <span className="text-foreground/70 ml-1 text-[11px]">
                          {block.content}
                        </span>
                      </div>
                    ) : (
                      <div className="text-foreground/90 font-medium text-[11px]">
                        {block.content}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-muted mb-3">
                  <ZoomIn className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {connectedPageId ? "No analysis available" : "No connected page"}
                </p>
              </div>
            )}
          </div>

          {/* Footer hint */}
          {contentBlocks.length > 0 && (
            <div className="px-4 py-2 border-t border-border/30">
              <p className="text-[10px] text-muted-foreground text-center">
                Press ESC to close • Click outside to dismiss
              </p>
            </div>
          )}
      </PopoverContent>
    </Popover>
  );
}