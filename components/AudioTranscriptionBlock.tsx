"use client";

import React, { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { Upload, Mic, Loader2, Play, Pause, Trash2, Clock } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Progress } from "./ui/progress";
import { cn } from "../lib/utils";

interface AudioTranscriptionBlockProps {
  dynamicFileId: Id<"dynamicFiles">;
  isReadOnly?: boolean;
  autoPlayRequest?: {
    fileName: string;
    timestamp: number;
  };
}

// TranscriptionItem interface removed - using inline types from Convex query

// Helper function to format seconds to MM:SS
const formatTimestamp = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export function AudioTranscriptionBlock({ dynamicFileId, isReadOnly = false, autoPlayRequest }: AudioTranscriptionBlockProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const showTimestamps = true; // Always show timestamps
  const [expandedTranscriptions, setExpandedTranscriptions] = useState<Set<string>>(new Set()); // Track which transcriptions are expanded
  const [currentTime, setCurrentTime] = useState<{ [key: string]: number }>({});
  const [hasProcessedAutoPlay, setHasProcessedAutoPlay] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});

  // Mutations and Actions
  const generateUploadUrl = useMutation(api.audioTranscription.generateAudioUploadUrl);
  const saveMetadata = useMutation(api.audioTranscription.saveAudioMetadata);
  const transcribeAudio = useAction(api.audioTranscription.transcribeAudio);
  const deleteTranscription = useMutation(api.audioTranscription.deleteTranscription);

  // Query transcriptions
  const transcriptions = useQuery(api.audioTranscription.getTranscriptionsByPage, {
    dynamicFileId,
  });

  // Handle auto-play request from parent
  useEffect(() => {
    if (autoPlayRequest && transcriptions && !hasProcessedAutoPlay) {
      // Find the transcription with matching filename
      const transcription = transcriptions.find(t =>
        t.fileName === autoPlayRequest.fileName &&
        t.status === 'completed' &&
        t.audioUrl
      );

      if (transcription) {
        console.log('🎵 Auto-playing audio:', autoPlayRequest);
        // Trigger playback at the specified timestamp
        toggleAudioPlayback(transcription._id, transcription.audioUrl || undefined, autoPlayRequest.timestamp).catch(console.log);

        // Mark as processed to prevent re-triggering
        setHasProcessedAutoPlay(true);

        // Expand this transcription
        setExpandedTranscriptions(prev => new Set(prev).add(transcription._id));

        // Scroll to the specific segment being played
        setTimeout(() => {
          // Find the segment that contains the timestamp
          let targetSegmentStart = 0;
          if (transcription.segments) {
            for (const segment of transcription.segments) {
              if (autoPlayRequest.timestamp >= segment.start && autoPlayRequest.timestamp <= segment.end) {
                targetSegmentStart = segment.start;
                break;
              }
              // Also check if timestamp exactly matches start
              if (autoPlayRequest.timestamp === segment.start) {
                targetSegmentStart = segment.start;
                break;
              }
            }
          }

          // Find the segment element with the matching start time
          const segmentElement = document.querySelector(
            `[data-transcription-id="${transcription._id}"] [data-segment-start="${targetSegmentStart}"]`
          );

          if (segmentElement) {
            segmentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Add a temporary pulse effect to draw attention
            segmentElement.classList.add('animate-pulse');
            setTimeout(() => {
              segmentElement.classList.remove('animate-pulse');
            }, 2000);
          } else {
            // Fallback: scroll to the transcription block if specific segment not found
            const transcriptionCard = document.querySelector(`[data-transcription-id="${transcription._id}"]`);
            if (transcriptionCard) {
              transcriptionCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
        }, 200); // Give time for timestamps to show
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlayRequest, transcriptions, hasProcessedAutoPlay]);

  // Reset the processed flag when autoPlayRequest changes
  useEffect(() => {
    if (autoPlayRequest) {
      setHasProcessedAutoPlay(false);
    }
  }, [autoPlayRequest]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isReadOnly) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isReadOnly) return;

    const files = Array.from(e.dataTransfer.files);
    const audioFiles = files.filter(file =>
      file.type.startsWith("audio/") ||
      file.name.match(/\.(mp3|wav|m4a|webm|ogg|flac)$/i)
    );

    if (audioFiles.length > 0) {
      await handleFileUpload(audioFiles[0]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await handleFileUpload(files[0]);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (isReadOnly) return;

    try {
      setIsUploading(true);
      setUploadProgress(10);

      // Step 1: Generate upload URL
      const uploadUrl = await generateUploadUrl();
      setUploadProgress(20);

      // Step 2: Upload the file
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!result.ok) {
        throw new Error("Failed to upload audio file");
      }

      setUploadProgress(50);

      // Step 3: Get storage ID
      const { storageId } = await result.json();
      setUploadProgress(70);

      // Step 4: Save metadata and create transcription record
      const transcriptionId = await saveMetadata({
        storageId,
        fileName: file.name,
        dynamicFileId,
      });

      setUploadProgress(80);

      // Step 5: Trigger transcription
      await transcribeAudio({
        transcriptionId,
        storageId,
      });

      setUploadProgress(100);

      // Reset after a short delay
      setTimeout(() => {
        setUploadProgress(0);
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }, 500);

    } catch (error) {
      console.error("Error uploading audio:", error);
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const toggleAudioPlayback = async (audioId: string, audioUrl?: string, startTime?: number) => {
    if (!audioUrl) return;

    let audio = audioRefs.current[audioId];

    // If audio doesn't exist, create it
    if (!audio) {
      audio = new Audio(audioUrl);
      audioRefs.current[audioId] = audio;

      audio.addEventListener("ended", () => {
        setPlayingAudio(null);
      });

      // Track current time for highlighting active segment
      audio.addEventListener("timeupdate", () => {
        setCurrentTime(prev => ({ ...prev, [audioId]: audio.currentTime }));
      });
    }

    // Pause any other playing audio first
    for (const [id, a] of Object.entries(audioRefs.current)) {
      if (id !== audioId && a && !a.paused) {
        a.pause();
      }
    }

    // If a specific start time is provided, seek to it
    if (startTime !== undefined) {
      audio.currentTime = startTime;
      try {
        await audio.play();
        setPlayingAudio(audioId);
      } catch (error) {
        // Ignore play promise rejection errors
        console.log('Audio play interrupted:', error);
      }
    } else {
      // Toggle play/pause
      if (playingAudio === audioId && !audio.paused) {
        audio.pause();
        setPlayingAudio(null);
      } else {
        try {
          await audio.play();
          setPlayingAudio(audioId);
        } catch (error) {
          // Ignore play promise rejection errors
          console.log('Audio play interrupted:', error);
        }
      }
    }
  };

  const seekToTimestamp = async (audioId: string, audioUrl: string | undefined, timestamp: number) => {
    if (!audioUrl) return;
    await toggleAudioPlayback(audioId, audioUrl, timestamp);
  };

  const handleDelete = async (id: Id<"audioTranscriptions">, fileName: string) => {
    if (isReadOnly) return;

    // Confirm deletion
    if (!window.confirm(`Are you sure you want to delete "${fileName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      // Clean up audio ref if exists
      const audioRef = audioRefs.current[id];
      if (audioRef) {
        audioRef.pause();
        delete audioRefs.current[id];
      }
      if (playingAudio === id) {
        setPlayingAudio(null);
      }

      // Delete from backend
      await deleteTranscription({ id });

      // Show success feedback (optional - you can add a toast here if you have a toast library)
      console.log(`Successfully deleted ${fileName}`);
    } catch (error) {
      console.error("Error deleting transcription:", error);
      alert(`Failed to delete ${fileName}. Please try again.`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      {!isReadOnly && (
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-8 transition-colors",
            isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25",
            isUploading && "opacity-50 pointer-events-none"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="p-4 bg-primary/10 rounded-full">
              <Mic className="h-8 w-8 text-primary" />
            </div>

            <div className="text-center">
              <p className="text-lg font-medium">Upload Audio for Transcription</p>
              <p className="text-sm text-muted-foreground mt-1">
                Drag and drop or click to upload audio files
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Supports MP3, WAV, M4A, WebM, OGG, FLAC
              </p>
            </div>

            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              variant="outline"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Choose File
                </>
              )}
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg,.flac"
              onChange={handleFileSelect}
              className="hidden"
            />

            {isUploading && uploadProgress > 0 && (
              <div className="w-full max-w-xs">
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-xs text-center mt-1 text-muted-foreground">
                  {uploadProgress < 50 ? "Uploading..." :
                   uploadProgress < 80 ? "Processing..." :
                   "Transcribing..."}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transcriptions List */}
      {transcriptions === undefined ? (
        <div className="flex items-center justify-center p-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : transcriptions.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">
              Audio Transcriptions ({transcriptions.length})
            </h3>
          </div>

          {transcriptions.map((item) => (
            <Card key={item._id} className="overflow-hidden" data-transcription-id={item._id} data-filename={item.fileName}>
              <CardContent className="p-4">
                <div className="space-y-3">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 flex-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleAudioPlayback(item._id, item.audioUrl || undefined).catch(console.log)}
                        disabled={item.status !== "completed" || !item.audioUrl}
                      >
                        {playingAudio === item._id ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>

                      <div className="flex-1">
                        <p className="font-medium text-sm">{item.fileName}</p>
                        <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                          {item.language && <span>Language: {item.language}</span>}
                          {item.duration && (
                            <span>
                              {playingAudio === item._id && currentTime[item._id] ?
                                `${formatTimestamp(currentTime[item._id])} / ${formatTimestamp(item.duration)}` :
                                `${Math.round(item.duration)}s`
                              }
                            </span>
                          )}
                        </div>
                        {/* Progress bar */}
                        {playingAudio === item._id && item.duration && (
                          <div className="mt-2">
                            <Progress
                              value={(currentTime[item._id] || 0) / item.duration * 100}
                              className="h-1"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {!isReadOnly && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(item._id, item.fileName)}
                        className="hover:bg-destructive hover:text-destructive-foreground"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    )}
                  </div>

                  {/* Status or Transcription */}
                  {item.status === "completed" ? (
                    <div className="space-y-2">
                      {/* Toggle to expand/collapse transcription in read-only mode */}
                      {isReadOnly && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const newExpanded = new Set(expandedTranscriptions);
                            if (newExpanded.has(item._id)) {
                              newExpanded.delete(item._id);
                            } else {
                              newExpanded.add(item._id);
                            }
                            setExpandedTranscriptions(newExpanded);
                          }}
                          className="text-xs"
                        >
                          <Clock className="h-3 w-3 mr-1" />
                          {expandedTranscriptions.has(item._id) ? "Hide Transcription" : "Show Transcription"}
                        </Button>
                      )}

                      {/* Show transcription content only if expanded (or always in edit mode) */}
                      {(!isReadOnly || expandedTranscriptions.has(item._id)) && (
                        <div className="bg-muted/50 rounded-md p-3">
                          {/* Show segments with timestamps if available and enabled */}
                          {showTimestamps && item.segments && item.segments.length > 0 ? (
                          <div className="space-y-2">
                            {item.segments.map((segment, idx) => {
                              const isActive = playingAudio === item._id &&
                                currentTime[item._id] >= segment.start &&
                                currentTime[item._id] < segment.end;

                              return (
                                <div
                                  key={idx}
                                  data-segment-start={segment.start}
                                  onClick={() => seekToTimestamp(item._id, item.audioUrl || undefined, segment.start).catch(console.log)}
                                  className={cn(
                                    "flex gap-2 group transition-all cursor-pointer hover:bg-muted/30 rounded px-2 py-1 -mx-2",
                                    isActive && "bg-primary/10 hover:bg-primary/15"
                                  )}
                                  title={`Jump to ${formatTimestamp(segment.start)}`}
                                >
                                  <span
                                    className={cn(
                                      "text-xs font-mono whitespace-nowrap transition-colors",
                                      isActive ? "text-primary font-semibold" : "text-muted-foreground group-hover:text-primary"
                                    )}
                                  >
                                    [{formatTimestamp(segment.start)}]
                                  </span>
                                  <p className={cn(
                                    "text-sm flex-1",
                                    isActive && "text-foreground font-medium"
                                  )}>
                                    {segment.text}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                          ) : (
                            <p className="text-sm whitespace-pre-wrap">{item.transcription}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : item.status === "processing" ? (
                    <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Transcribing audio...</span>
                    </div>
                  ) : item.status === "failed" ? (
                    <div className="text-sm text-destructive">
                      Error: {item.error || "Transcription failed"}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      Pending transcription...
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}