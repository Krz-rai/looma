"use client";

import React, { useState, useEffect, useRef } from "react";
import { Button } from "./ui/button";
import { AudioLines, MoreHorizontal, Trash2, Edit2, Check, X, FileText } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { AudioTranscriptionSourceModal } from "./AudioTranscriptionSourceModal";
import { EchoTranscriptModal } from "./EchoTranscriptModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { cn } from "../lib/utils";
import { Id } from "../convex/_generated/dataModel";

interface SegmentReference {
  segmentIndex: number;
  start: number;
  end: number;
  originalText: string;
}

interface SummaryPoint {
  text: string;
  segmentReferences: SegmentReference[];
}

interface AudioTranscriptionSummaryProps {
  transcriptionId: Id<"audioTranscriptions">;
  summary: {
    points: SummaryPoint[];
    generatedAt: number;
  } | null;
  fileName?: string;
  displayName?: string;
  onDelete?: (id: Id<"audioTranscriptions">, fileName: string) => void;
  isReadOnly?: boolean;
  highlightedPoint?: number; // Point number to highlight (1-based)
  pointOffset?: number; // Global point offset for continuous numbering
}

export function AudioTranscriptionSummary({
  transcriptionId,
  summary,
  fileName = "Audio",
  displayName,
  onDelete,
  isReadOnly = false,
  highlightedPoint,
  pointOffset = 0,
}: AudioTranscriptionSummaryProps) {
  const [localHighlightedPoint, setLocalHighlightedPoint] = useState<number | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(displayName || fileName);
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const updateDisplayName = useMutation(api.audioTranscription.updateDisplayName);

  // Fetch full transcription data for modal
  const fullTranscription = useQuery(api.audioTranscription.getTranscriptionById, {
    id: transcriptionId
  });

  // Focus input when editing
  useEffect(() => {
    if (isEditingName && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingName]);

  const handleSaveName = async () => {
    if (editedName.trim() && editedName !== (displayName || fileName)) {
      try {
        await updateDisplayName({
          id: transcriptionId,
          displayName: editedName.trim(),
        });
      } catch (error) {
        console.error("Failed to update display name:", error);
        setEditedName(displayName || fileName);
      }
    }
    setIsEditingName(false);
  };

  const handleCancelEdit = () => {
    setEditedName(displayName || fileName);
    setIsEditingName(false);
  };

  // Check for highlight requests from citations
  useEffect(() => {
    const checkForHighlight = () => {
      // Look for our element being targeted for highlighting
      summary?.points.forEach((_, index) => {
        const localPointNumber = index + 1;
        const globalPointNumber = pointOffset + localPointNumber;
        const element = document.getElementById(`echo-point-${transcriptionId}-${globalPointNumber}`);
        if (element && (element.classList.contains('citation-highlight-active') || element.classList.contains('highlight-persistent'))) {
          setLocalHighlightedPoint(localPointNumber);
        }
      });
    };

    // Check on mount and after a delay
    checkForHighlight();
    const timer = setTimeout(checkForHighlight, 500);

    // Add global click handler to remove persistent highlights
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't remove highlight if clicking on citation or the highlighted element itself
      if (!target.closest('[data-citation-type="audio-summary"]') &&
          !target.closest('.highlight-persistent')) {
        document.querySelectorAll('.highlight-persistent').forEach(el => {
          el.classList.remove('highlight-persistent');
        });
        setLocalHighlightedPoint(null);
      }
    };

    document.addEventListener('click', handleGlobalClick);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleGlobalClick);
    };
  }, [summary, transcriptionId, pointOffset]);

  if (!summary || summary.points.length === 0) {
    return null;
  }

  return (
    <div className="group relative bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
      <div className="p-4">
        {/* Header - Notion-like with file icon */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 text-gray-600">
            <AudioLines className="h-4 w-4" />
            {isEditingName && !isReadOnly ? (
              <div className="flex items-center gap-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveName();
                    } else if (e.key === 'Escape') {
                      handleCancelEdit();
                    }
                  }}
                  className="text-sm font-medium bg-transparent border-b border-gray-400 outline-none focus:border-gray-600"
                  autoFocus
                />
                <button
                  onClick={handleSaveName}
                  className="p-0.5 hover:bg-gray-100 rounded"
                >
                  <Check className="h-3 w-3 text-green-600" />
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="p-0.5 hover:bg-gray-100 rounded"
                >
                  <X className="h-3 w-3 text-red-600" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group/title">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium">{displayName || fileName}</span>
                  {!isReadOnly && (
                    <button
                      onClick={() => setIsEditingName(true)}
                      className="p-0.5 opacity-0 group-hover/title:opacity-100 hover:bg-gray-100 rounded transition-opacity"
                    >
                      <Edit2 className="h-3 w-3 text-gray-500" />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setShowTranscriptModal(true)}
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 px-2 py-0.5 rounded hover:bg-gray-100 transition-colors"
                >
                  <FileText className="h-3 w-3" />
                  See full
                </button>
              </div>
            )}
          </div>
          {!isReadOnly && onDelete && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => onDelete(transcriptionId, fileName)}
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Summary Points - Clean, Notion-like list */}
        <div className="space-y-2">
          {summary.points.map((point, index) => {
            const localPointNumber = index + 1;
            const globalPointNumber = pointOffset + localPointNumber;
            const isHighlighted = highlightedPoint === localPointNumber || localHighlightedPoint === localPointNumber;

            return (
              <AudioTranscriptionSourceModal
                key={index}
                summaryPoint={point.text}
                segmentReferences={point.segmentReferences}
                transcriptionId={transcriptionId}
                fileName={displayName || fileName}
              >
                <div
                  id={`echo-point-${transcriptionId}-${globalPointNumber}`}
                  className={cn(
                    "flex gap-2.5 text-sm leading-relaxed cursor-pointer rounded-md px-2 py-1 -mx-2 transition-all hover:bg-gray-50",
                    isHighlighted && "highlight-persistent"
                  )}
                >
                  <span className="text-gray-400 select-none mt-0.5">•</span>
                  <p className="flex-1 text-gray-700 hover:text-gray-900 transition-colors">
                    {point.text}
                  </p>
                </div>
              </AudioTranscriptionSourceModal>
            );
          })}
        </div>
      </div>

      {/* Transcript Modal */}
      {fullTranscription && (
        <EchoTranscriptModal
          open={showTranscriptModal}
          onOpenChange={setShowTranscriptModal}
          fileName={fileName}
          displayName={displayName}
          audioUrl={fullTranscription.audioUrl}
          transcription={fullTranscription.transcription}
          segments={fullTranscription.segments}
          duration={fullTranscription.duration}
        />
      )}
    </div>
  );
}