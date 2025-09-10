"use client";

import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { ChevronRight, ChevronDown, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExpandableBulletPointProps {
  bulletPoint: {
    _id: Id<"bulletPoints">;
    content: string;
    hasBranches: boolean;
  };
  isEditable?: boolean;
  highlightedItem?: { type: string; id: string } | null;
}

export function ExpandableBulletPoint({ 
  bulletPoint, 
  isEditable = false,
  highlightedItem
}: ExpandableBulletPointProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const isBulletHighlighted = highlightedItem?.type === 'bullet' && highlightedItem?.id === bulletPoint._id;
  
  // Always fetch branches if hasBranches is true to show count
  const branches = useQuery(
    api.branches.list, 
    bulletPoint.hasBranches ? { bulletPointId: bulletPoint._id } : "skip"
  );
  
  // Auto-expand if a branch within this bullet is highlighted
  useEffect(() => {
    if (highlightedItem?.type === 'branch' && branches) {
      const hasBranch = branches.some(b => b._id === highlightedItem.id);
      if (hasBranch && !isExpanded) {
        setIsExpanded(true);
      }
    }
  }, [highlightedItem, branches, isExpanded]);

  const handleClick = () => {
    if (bulletPoint.hasBranches && !isEditable) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <div 
      className={cn(
        "group",
        isBulletHighlighted && "highlight-bullet animate-highlight"
      )}
      id={`bullet-${bulletPoint._id}`}
    >
      <div 
        className={cn(
          "flex items-start gap-3 py-2 px-3 rounded-xl transition-all duration-300",
          bulletPoint.hasBranches && !isEditable && "cursor-pointer hover:bg-muted/50"
        )}
        onClick={handleClick}
      >
        {/* Bullet or Chevron */}
        <div className="mt-1 flex-shrink-0">
          {bulletPoint.hasBranches && !isEditable ? (
            <div className="flex items-center justify-center w-5 h-5 rounded-md hover:bg-muted transition-colors">
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
              )}
            </div>
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 mt-2" />
          )}
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-[15px] leading-relaxed text-foreground">
            {bulletPoint.content}
          </p>
          
          {/* Branch indicator - always visible */}
          {bulletPoint.hasBranches && !isEditable && branches && (
            <div className="flex items-center gap-2 mt-1.5">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted text-xs font-medium text-muted-foreground">
                <GitBranch className="h-3 w-3" strokeWidth={2} />
                {branches.length} {branches.length === 1 ? 'branch' : 'branches'}
              </span>
              {!isExpanded && (
                <span className="text-xs text-muted-foreground">
                  Click to explore
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      
      {isExpanded && branches && branches.length > 0 && (
        <div className="ml-8 mt-3 space-y-2 animate-in slide-in-from-top-1 duration-200">
          {branches.map((branch) => (
            <div key={branch._id} className="relative">
              {/* Vertical connector line */}
              <div className="absolute left-[-22px] top-0 bottom-0 w-px bg-border/50" />
              {/* Horizontal connector */}
              <div className="absolute left-[-22px] top-5 w-5 h-px bg-border/50" />
              {/* Node dot */}
              <div className="absolute left-[-25px] top-[18px] w-1.5 h-1.5 rounded-full bg-border" />
              
              <div 
                id={`branch-${branch._id}`}
                className={cn(
                  "p-4 rounded-xl bg-muted/30 border border-border/50 transition-all duration-300 hover:bg-muted/50 hover:border-border",
                  (highlightedItem?.type === 'branch' && highlightedItem?.id === branch._id) && "highlight-branch animate-highlight"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 p-1 rounded-md bg-background">
                    <GitBranch className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/90 flex-1">
                    {branch.content}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}