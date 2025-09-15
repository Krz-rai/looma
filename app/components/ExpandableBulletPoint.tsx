"use client";

import { Id } from "../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { BulletPointExpandedModal } from "./BulletPointExpandedModal";

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
          <div className="text-[15px] leading-relaxed text-foreground relative">
            <span>{bulletPoint.content}</span>
            {/* Modal trigger inline after text */}
            {connectedPageId && !isEditable && projectTitle && resumeId && (
              <BulletPointExpandedModal
                bulletPoint={bulletPoint}
                projectTitle={projectTitle}
                connectedPageId={connectedPageId}
                resumeId={resumeId}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}