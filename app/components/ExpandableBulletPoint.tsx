"use client";

import { Id } from "../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import BulletPointExpandedModal from "./BulletPointExpandedModal";
import ShinyText from "@/components/ShinyText";
import { useState } from "react";

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
}

export function ExpandableBulletPoint({
  bulletPoint,
  isEditable = false,
  highlightedItem,
  connectedPageId,
  projectTitle,
  resumeId
}: ExpandableBulletPointProps) {
  const isBulletHighlighted = highlightedItem?.type === 'bullet' && highlightedItem?.id === bulletPoint._id;
  const [isHovered, setIsHovered] = useState(false);

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
      </div>
    </div>
  );
}