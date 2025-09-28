"use client";

import { Id } from "../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import BulletPointExpandedModal from "./BulletPointExpandedModal";
import ShinyText from "@/components/ShinyText";
import React, { useState } from "react";
import { ChevronRight, GitBranch } from "lucide-react";

interface ExpandableBulletPointProps {
  bulletPoint: {
    _id: Id<"bulletPoints">;
    content: string;
    hasBranches: boolean;
  };
  isEditable?: boolean;
  highlightedItem?: { type: string; id: string } | null;
  connectedPageId?: Id<"dynamicFiles">;
  projectTitle?: string;
  resumeId?: Id<"resumes">;
  branches?: Array<{
    _id: Id<"branches">;
    content: string;
    type: "text" | "audio" | "video";
    position: number;
  }>;
}

export function ExpandableBulletPoint({
  bulletPoint,
  isEditable = false,
  highlightedItem,
  connectedPageId,
  projectTitle,
  resumeId,
  branches = []
}: ExpandableBulletPointProps) {
  const isBulletHighlighted = highlightedItem?.type === 'bullet' && highlightedItem?.id === bulletPoint._id;
  const [isHovered, setIsHovered] = useState(false);
  const [showBranches, setShowBranches] = useState(false);
  
  // Check if any branch is highlighted to auto-expand
  const hasBranchHighlighted = branches.some(branch => 
    highlightedItem?.type === 'branch' && highlightedItem?.id === branch._id
  );
  
  // Auto-expand if a branch is highlighted
  React.useEffect(() => {
    if (hasBranchHighlighted) {
      setShowBranches(true);
    }
  }, [hasBranchHighlighted]);

  return (
    <div
      className={cn(
        "group",
        isBulletHighlighted && "highlight-bullet animate-highlight"
      )}
      id={`bullet-${bulletPoint._id}`}
    >
      <div className="flex items-start gap-3 py-2 px-3 rounded-xl transition-all duration-300">
        {/* Simple bullet point */}
        <div className="mt-1 flex-shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 mt-2" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              {connectedPageId && !isEditable && projectTitle && resumeId ? (
                <BulletPointExpandedModal
                  bulletPoint={bulletPoint}
                  projectTitle={projectTitle}
                  connectedPageId={connectedPageId}
                  resumeId={resumeId}
                >
                  <div
                    className="cursor-pointer"
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                  >
                    <ShinyText
                      text=""
                      disabled={!isHovered}
                      speed={3}
                      className="text-[15px] leading-relaxed text-foreground hover:text-primary transition-colors"
                    >
                      {bulletPoint.content}
                    </ShinyText>
                  </div>
                </BulletPointExpandedModal>
              ) : (
                <div className="text-[15px] leading-relaxed text-foreground">
                  {bulletPoint.content}
                </div>
              )}
            </div>
            
            {/* Branch toggle button */}
            {bulletPoint.hasBranches && branches.length > 0 && (
              <button
                onClick={() => setShowBranches(!showBranches)}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all duration-200",
                  "text-muted-foreground hover:text-foreground",
                  "hover:bg-muted/50 border border-transparent hover:border-border/40",
                  "opacity-0 group-hover:opacity-100",
                  showBranches && "opacity-100 text-foreground bg-muted/30 border-border/40"
                )}
                title={`${showBranches ? 'Hide' : 'Show'} ${branches.length} branch${branches.length === 1 ? '' : 'es'}`}
              >
                <GitBranch className={cn("h-3 w-3 transition-transform", showBranches && "rotate-180")} />
                <ChevronRight className={cn("h-3 w-3 transition-transform", showBranches && "rotate-90")} />
                <span className="font-medium">{branches.length}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Branches */}
      {showBranches && branches.length > 0 && (
        <div className="ml-8 mt-2 space-y-1 animate-in slide-in-from-top-2 duration-200">
          {branches
            .sort((a, b) => a.position - b.position)
            .map((branch) => {
              const isBranchHighlighted = highlightedItem?.type === 'branch' && highlightedItem?.id === branch._id;
              
              return (
                <div
                  key={branch._id}
                  id={`branch-${branch._id}`}
                  className={cn(
                    "flex items-start gap-3 py-1.5 px-3 rounded-lg transition-all duration-300",
                    "hover:bg-muted/30",
                    isBranchHighlighted && "highlight-branch animate-highlight bg-primary/10 border border-primary/20"
                  )}
                >
                  {/* Branch connector */}
                  <div className="mt-1.5 flex-shrink-0 flex items-center">
                    <div className="w-3 h-px bg-border" />
                    <div className="w-1 h-1 rounded-full bg-muted-foreground/60" />
                  </div>
                  
                  {/* Branch content */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm leading-relaxed text-muted-foreground">
                      {branch.content}
                    </div>
                    {branch.type !== 'text' && (
                      <div className="mt-1">
                        <span className={cn(
                          "inline-block px-1.5 py-0.5 text-xs rounded font-medium",
                          branch.type === 'audio' && "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300",
                          branch.type === 'video' && "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300"
                        )}>
                          {branch.type}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}