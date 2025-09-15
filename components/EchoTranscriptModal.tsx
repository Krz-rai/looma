"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AudioLines } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import AudioPlayer from 'react-h5-audio-player';
import 'react-h5-audio-player/lib/styles.css';

interface EchoTranscriptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  displayName?: string;
  audioUrl?: string | null;
  transcription: string;
  segments?: Array<{
    text: string;
    start: number;
    end: number;
  }>;
  duration?: number;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function EchoTranscriptModal({
  open,
  onOpenChange,
  fileName,
  displayName,
  audioUrl,
  transcription,
  segments,
}: EchoTranscriptModalProps) {
  const playerRef = useRef<AudioPlayer>(null);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Track current time and find active segment
  const handleListen = (e: Event) => {
    const audioElement = e.currentTarget as HTMLAudioElement;
    const currentTime = audioElement.currentTime;

    // Find active segment
    if (segments) {
      const activeIdx = segments.findIndex(
        (seg) => currentTime >= seg.start && currentTime < seg.end
      );
      setActiveSegmentIndex(activeIdx >= 0 ? activeIdx : null);
    }
  };

  // Auto-scroll to active segment
  useEffect(() => {
    if (activeSegmentIndex !== null && segmentRefs.current[activeSegmentIndex]) {
      segmentRefs.current[activeSegmentIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeSegmentIndex]);

  // Handle segment click to jump to timestamp
  const handleSegmentClick = (startTime: number) => {
    if (playerRef.current?.audio.current) {
      playerRef.current.audio.current.currentTime = startTime;
      playerRef.current.audio.current.play();
    }
  };

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setActiveSegmentIndex(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center gap-3">
            <AudioLines className="h-5 w-5 text-primary" />
            <DialogTitle className="text-lg font-semibold">
              {displayName || fileName}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0">
          {/* Audio Player */}
          {audioUrl && (
            <div className="px-4 py-3 border-b bg-muted/30 flex-shrink-0">
              <AudioPlayer
                ref={playerRef}
                src={audioUrl}
                onListen={handleListen}
                showJumpControls={true}
                showSkipControls={false}
                showDownloadProgress={true}
                showFilledProgress={true}
                autoPlayAfterSrcChange={false}
                layout="horizontal"
                customProgressBarSection={[
                  "CURRENT_TIME",
                  "PROGRESS_BAR",
                  "DURATION",
                ]}
                customControlsSection={[
                  "MAIN_CONTROLS",
                  "VOLUME_CONTROLS",
                ]}
                customAdditionalControls={[]}
                customVolumeControls={["VOLUME"]}
                className="shadow-none bg-transparent"
              />
            </div>
          )}

          {/* Transcript */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-6 py-4 space-y-3">
              {segments ? (
                segments.map((segment, idx) => (
                  <div
                    key={idx}
                    ref={(el) => (segmentRefs.current[idx] = el)}
                    className={cn(
                      "p-3 rounded-lg border transition-all cursor-pointer group",
                      activeSegmentIndex === idx
                        ? "bg-primary/10 border-primary/50 shadow-sm"
                        : "hover:bg-muted/50 border-transparent hover:border-border"
                    )}
                    onClick={() => handleSegmentClick(segment.start)}
                  >
                    <div className="flex items-start gap-3">
                      <span className={cn(
                        "text-xs font-medium min-w-[45px] transition-colors",
                        activeSegmentIndex === idx
                          ? "text-primary"
                          : "text-muted-foreground group-hover:text-foreground"
                      )}>
                        {formatTime(segment.start)}
                      </span>
                      <p className={cn(
                        "text-sm leading-relaxed flex-1 transition-colors",
                        activeSegmentIndex === idx
                          ? "text-foreground"
                          : "text-muted-foreground group-hover:text-foreground"
                      )}>
                        {segment.text}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {transcription}
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}