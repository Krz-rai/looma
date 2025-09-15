"use client";

import React, { useState, useRef } from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { Upload, AudioLines, Loader2, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Progress } from "./ui/progress";
import { cn } from "../lib/utils";
import { AudioTranscriptionSummary } from "./AudioTranscriptionSummary";

interface AudioTranscriptionBlockProps {
  dynamicFileId: Id<"dynamicFiles">;
  isReadOnly?: boolean;
  autoPlayRequest?: {
    fileName: string;
    timestamp: number;
  };
}


export function AudioTranscriptionBlock({ dynamicFileId, isReadOnly = false }: AudioTranscriptionBlockProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mutations and Actions
  const generateUploadUrl = useMutation(api.audioTranscription.generateAudioUploadUrl);
  const saveMetadata = useMutation(api.audioTranscription.saveAudioMetadata);
  const transcribeAudio = useAction(api.audioTranscription.transcribeAudio);
  const deleteTranscription = useMutation(api.audioTranscription.deleteTranscription);

  // Query transcriptions
  const transcriptions = useQuery(api.audioTranscription.getTranscriptionsByPage, {
    dynamicFileId,
  });

  const handleDragOver = (e: React.DragEvent) => {
    if (isReadOnly) return;
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (isReadOnly) return;
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    if (isReadOnly) return;
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith("audio/")) {
        await handleFileUpload(file);
      } else {
        alert("Please upload an audio file");
      }
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

      // Step 5: Trigger transcription (summary auto-generates after)
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

  const handleDelete = async (id: Id<"audioTranscriptions">, fileName: string) => {
    if (isReadOnly) return;

    // Confirm deletion
    if (!window.confirm(`Are you sure you want to delete "${fileName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      // Delete from backend
      await deleteTranscription({ id });
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
              <AudioLines className="h-8 w-8 text-primary" />
            </div>

            <div className="text-center">
              <p className="text-lg font-medium">Upload Audio for AI Summary</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your audio will be transcribed and summarized by AI
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
                  Processing...
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
                   uploadProgress < 80 ? "Transcribing..." :
                   uploadProgress < 95 ? "Generating AI Summary..." :
                   "Almost done..."}
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
          {(() => {
            let cumulativePointCount = 0;

            return transcriptions.map((item) => {
              const currentOffset = cumulativePointCount;
              // Add the number of points in this transcription to the cumulative count
              if (item.summary && item.summary.points) {
                cumulativePointCount += item.summary.points.length;
              }

              return (
                <div key={item._id} className="space-y-3">
                  {/* Show summary if available, or processing status */}
                  {item.status === "completed" ? (
                    item.summary ? (
                      <AudioTranscriptionSummary
                        transcriptionId={item._id}
                        summary={item.summary}
                        fileName={item.fileName}
                        displayName={item.displayName}
                        onDelete={handleDelete}
                        isReadOnly={isReadOnly}
                        pointOffset={currentOffset}
                      />
                ) : (
                  <Card className="bg-gray-50">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <AudioLines className="h-5 w-5 text-gray-500" />
                          <div>
                            <p className="font-medium text-sm">{item.fileName}</p>
                            <p className="text-xs text-gray-500">Processing AI summary...</p>
                          </div>
                        </div>
                        {!isReadOnly && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(item._id, item.fileName)}
                            className="hover:bg-destructive hover:text-destructive-foreground"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              ) : item.status === "processing" ? (
                <Card className="bg-gray-50">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                        <div>
                          <p className="font-medium text-sm">{item.fileName}</p>
                          <p className="text-xs text-gray-500">Transcribing audio...</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : item.status === "failed" ? (
                <Card className="bg-red-50">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <AudioLines className="h-5 w-5 text-red-500" />
                        <div>
                          <p className="font-medium text-sm">{item.fileName}</p>
                          <p className="text-xs text-red-500">
                            Error: {item.error || "Transcription failed"}
                          </p>
                        </div>
                      </div>
                      {!isReadOnly && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(item._id, item.fileName)}
                          className="hover:bg-destructive hover:text-destructive-foreground"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-gray-50">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <AudioLines className="h-5 w-5 text-gray-500" />
                        <div>
                          <p className="font-medium text-sm">{item.fileName}</p>
                          <p className="text-xs text-gray-500">Pending...</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
                </div>
              );
            });
          })()}
        </div>
      ) : null}
    </div>
  );
}