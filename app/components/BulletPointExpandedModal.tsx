"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import "./BulletPointExpandedModal.css";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Loader2, X } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface BulletPointExpandedModalProps {
  children: React.ReactNode;
  bulletPoint: {
    _id: Id<"bulletPoints">;
    content: string;
  };
  resumeId: Id<"resumes">;
  connectedPageId?: Id<"dynamicFiles">;
  projectTitle?: string;
}

type ContentBlock = {
  type: 'ai' | 'citation';
  content: string;
  pageTitle?: string;
};

export default function BulletPointExpandedModal({
  children,
  bulletPoint,
  resumeId,
  connectedPageId,
  projectTitle,
}: BulletPointExpandedModalProps) {
  const [contentBlocks, setContentBlocks] = useState<ContentBlock[]>([]);
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get the convex site URL - fallback to hardcoded if env not available
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || "https://quirky-walrus-359.convex.cloud";
  const convexSiteUrl = convexUrl.replace(".cloud", ".site");

  // Parse the response and create content blocks
  const parseResponse = (responseText: string) => {
    console.log('📝 Parsing response:', responseText);
    const blocks: ContentBlock[] = [];
    const lines = responseText.split('\n').filter(line => line.trim());
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

    return blocks;
  };

  // Generate analysis using direct fetch
  const generateAnalysis = async () => {
    const apiUrl = `${convexSiteUrl}/api/bullet-analysis`;
    console.log('🚀 Starting analysis with:', {
      api: apiUrl,
      convexSiteUrl,
      prompt: `Analyze: "${bulletPoint.content}"`,
      body: {
        resumeId,
        bulletPointId: bulletPoint._id,
        connectedPageId,
        projectTitle,
      }
    });

    setContentBlocks([]);
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: `Analyze: "${bulletPoint.content}"`,
          resumeId,
          bulletPointId: bulletPoint._id,
          connectedPageId,
          projectTitle,
        }),
      });

      console.log('📡 Response status:', response.status);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const text = await response.text();
      console.log('✅ Response text:', text);

      // Parse the response
      const blocks = parseResponse(text);
      console.log('📦 Parsed blocks:', blocks);

      if (blocks.length > 0) {
        setContentBlocks(blocks);
      } else {
        setError('No analysis generated');
      }
    } catch (err) {
      console.error('❌ Error generating analysis:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate analysis');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle opening
  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && contentBlocks.length === 0 && connectedPageId) {
      generateAnalysis();
    }
  };

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
              <h3 className="text-sm font-medium text-muted-foreground">Quick Analysis</h3>
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
            ) : error ? (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-destructive/10 mb-3">
                  <span className="text-destructive">⚠️</span>
                </div>
                <p className="text-xs text-destructive">{error}</p>
              </div>
            ) : contentBlocks.length > 0 ? (
              <div className="space-y-2">
                {contentBlocks.map((block, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "text-xs leading-snug",
                      "animate-in",
                      `animation-delay-${Math.min(idx * 50, 300)}`
                    )}
                    style={{
                      opacity: 0,
                      animation: `animate-in 0.2s ease-out forwards`,
                      animationDelay: `${idx * 50}ms`
                    }}
                  >
                    {block.type === 'citation' ? (
                      <div className="bg-muted/20 rounded-md px-2.5 py-1.5 border-l-2 border-primary/20 hover:bg-muted/30 transition-colors">
                        <span className="text-xs font-medium text-muted-foreground">
                          {block.pageTitle}:
                        </span>
                        <span className="text-foreground/70 ml-1 text-sm">
                          {block.content}
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
                  <span className="text-muted-foreground">📊</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {connectedPageId ? "No analysis available" : "No connected page"}
                </p>
              </div>
            )}
          </div>

      </PopoverContent>
    </Popover>
  );
}