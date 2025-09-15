"use client";

import React, { useState, useEffect } from "react";
import { useCompletion } from '@ai-sdk/react';
import { Button } from "./ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import { Loader2, X, AudioLines } from "lucide-react";
import { Id } from "../convex/_generated/dataModel";
import { cn } from "../lib/utils";

interface SegmentReference {
  segmentIndex: number;
  start: number;
  end: number;
  originalText: string;
}

interface ContentBlock {
  type: 'ai' | 'source';
  content: string;
  timestamp?: string;
}

interface AudioTranscriptionSourceModalProps {
  children: React.ReactNode;
  summaryPoint: string;
  segmentReferences: SegmentReference[];
  transcriptionId: Id<"audioTranscriptions">;
  fileName: string;
}

export function AudioTranscriptionSourceModal({
  children,
  summaryPoint,
  segmentReferences,
  transcriptionId,
}: AudioTranscriptionSourceModalProps) {
  const [open, setOpen] = useState(false);
  const [contentBlocks, setContentBlocks] = useState<ContentBlock[]>([]);

  const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.replace(
    /.cloud$/,
    ".site"
  );

  // Use useCompletion for AI context generation
  const {
    completion,
    complete,
    isLoading,
    error
  } = useCompletion({
    api: `${convexSiteUrl}/api/echo-analysis`,
    body: {
      transcriptionId,
      summaryPoint,
      segmentReferences,
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
        // Check if it's a source marker
        if (line.includes('[SOURCE]')) {
          if (currentBlock && currentBlock.type === 'ai') {
            blocks.push(currentBlock);
          }
          // Extract timestamp and content from source
          const sourceMatch = line.match(/\[SOURCE\]\s*(\d+:\d+)\s*\|\s*(.*)/);
          if (sourceMatch) {
            currentBlock = {
              type: 'source',
              content: sourceMatch[2].trim(),
              timestamp: sourceMatch[1].trim()
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
        if (line.includes('[SOURCE]')) {
          if (currentBlock && currentBlock.type === 'ai') {
            blocks.push(currentBlock);
          }
          const sourceMatch = line.match(/\[SOURCE\]\s*(\d+:\d+)\s*\|\s*(.*)/);
          if (sourceMatch) {
            currentBlock = {
              type: 'source',
              content: sourceMatch[2].trim(),
              timestamp: sourceMatch[1].trim()
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
    console.log('🚀 Starting echo analysis with:', {
      api: `${convexSiteUrl}/api/echo-analysis`,
      prompt: `Analyze: "${summaryPoint}"`,
      body: {
        transcriptionId,
        summaryPoint,
        segmentReferences,
      }
    });

    setContentBlocks([]);
    // Simple prompt for fast response
    const analysisPrompt = `Analyze: "${summaryPoint}"`;
    complete(analysisPrompt);
  };

  // Handle opening
  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && contentBlocks.length === 0) {
      generateAnalysis();
    }
  };


  // Popover handles escape key and click outside automatically

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>

      <PopoverContent
        className="w-[520px] p-0 bg-background rounded-xl border border-border/50 shadow-2xl"
        side="left"
        align="start"
        sideOffset={8}
        alignOffset={0}
        collisionPadding={16}
        avoidCollisions={true}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <h3 className="text-sm font-medium text-muted-foreground">Echo Analysis</h3>
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
              <p className="text-sm text-muted-foreground animate-pulse">Analyzing transcription...</p>
            </div>
          ) : contentBlocks.length > 0 ? (
            <div className="space-y-2">
              {contentBlocks.map((block, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "text-sm leading-snug",
                    "animate-in fade-in-0 slide-in-from-top-1",
                    `animation-delay-${idx * 50}`
                  )}
                >
                  {block.type === 'source' ? (
                    <div className="bg-muted/20 rounded-md px-2.5 py-1.5 border-l-2 border-primary/20 hover:bg-muted/30 transition-colors">
                      <span className="text-xs font-medium text-muted-foreground">
                        {block.timestamp}:
                      </span>
                      <span className="text-foreground/70 ml-1 text-sm italic">
                        &quot;{block.content}&quot;
                      </span>
                    </div>
                  ) : (
                    <div className="text-foreground/90 font-medium text-sm">
                      {block.content}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-muted mb-3">
                <AudioLines className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                No analysis available
              </p>
            </div>
          )}
        </div>

      </PopoverContent>
    </Popover>
  );
}