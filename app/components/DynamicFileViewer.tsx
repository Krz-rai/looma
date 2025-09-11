"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { Loader2, Save, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface DynamicFileViewerProps {
  fileId: Id<"dynamicFiles">;
  isReadOnly?: boolean;
}

// Note: Removed unused resolveConvexUrls helper to satisfy no-unused-vars

// Create the editor schema with default blocks
const schema = BlockNoteSchema.create({
  blockSpecs: defaultBlockSpecs,
});

export function DynamicFileViewer({ fileId, isReadOnly = false }: DynamicFileViewerProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const previousFileIdRef = useRef<Id<"dynamicFiles"> | null>(null);
  
  const file = useQuery(api.dynamicFiles.get, { id: fileId });
  const fileContent = useQuery(api.dynamicFileContent.get, { fileId });
  const saveContentMutation = useMutation(api.dynamicFileContent.save);
  
  // File upload mutations
  const generateUploadUrl = useMutation(api.fileUploads.generateUploadUrl);
  const saveFileMetadata = useMutation(api.fileUploads.saveFileMetadata);
  
  // Upload file function for BlockNote
  const uploadFile = async (file: File) => {
    try {
      // Step 1: Get upload URL from Convex
      const uploadUrl = await generateUploadUrl();
      
      // Step 2: Upload the file to the URL
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      
      if (!result.ok) {
        throw new Error("Failed to upload file");
      }
      
      // Step 3: Get the storage ID from the response
      const { storageId } = await result.json();
      
      // Step 4: Save file metadata to database and get URL
      const { url } = await saveFileMetadata({
        storageId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        dynamicFileId: fileId,
      });
      
      // Step 5: Return the actual URL for BlockNote to use
      if (!url) {
        throw new Error("Failed to get file URL");
      }
      
      return url;
    } catch (error) {
      console.error("Error uploading file:", error);
      throw error;
    }
  };
  
  // Create the editor instance with upload functionality
  const editor = useCreateBlockNote({
    schema,
    uploadFile: isReadOnly ? undefined : uploadFile,
  });

  // Save content function with proper error handling
  const saveContent = useCallback(async () => {
    if (!editor || isReadOnly || !editorReady) {
      console.log("Skipping save:", { editor: !!editor, isReadOnly, editorReady });
      return;
    }
    
    try {
      setIsSaving(true);
      
      // Get the document content and ensure it's properly serialized
      const blocks = editor.document;
      
      // Serialize to JSON to ensure it's properly formatted
      const serializedContent = JSON.parse(JSON.stringify(blocks));
      console.log("Saving content:", serializedContent);
      
      // Save to database
      await saveContentMutation({ 
        fileId, 
        content: serializedContent 
      });
      
      setLastSaved(new Date());
      setHasChanges(false);
      console.log("Content saved successfully");
    } catch (error) {
      console.error("Failed to save content:", error);
    } finally {
      setIsSaving(false);
    }
  }, [editor, fileId, isReadOnly, editorReady, saveContentMutation]);

  // Load content when fileId changes or content loads
  useEffect(() => {
    if (!editor) return;

    // Check if file changed
    const fileChanged = previousFileIdRef.current !== fileId;
    
    if (fileChanged) {
      // Reset editor ready state for new file
      setEditorReady(false);
      
      // If we're switching files, save the previous file's content first
      if (previousFileIdRef.current && hasChanges) {
        console.log("Switching files, saving previous content");
        saveContent();
      }
      
      previousFileIdRef.current = fileId;
    }

    // Load content for the current file
    if (fileContent !== undefined && !editorReady) {
      const contentToLoad = fileContent?.content || [];
      
      console.log("Loading content for file:", fileId, contentToLoad);
      
      // Replace blocks and mark editor as ready
      editor.replaceBlocks(editor.document, contentToLoad);
      setEditorReady(true);
      setHasChanges(false);
    }
  }, [fileId, fileContent, editor, editorReady, hasChanges, saveContent]);

  // Set up change tracking
  useEffect(() => {
    if (!editor || !editorReady || isReadOnly) return;

    const unsubscribe = editor.onEditorContentChange(() => {
      console.log("Content changed");
      setHasChanges(true);
    });

    return unsubscribe;
  }, [editor, editorReady, isReadOnly]);

  // Auto-save with debouncing
  useEffect(() => {
    if (!hasChanges || isReadOnly) return;

    // Clear existing timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // Set new timer for auto-save
    saveTimerRef.current = setTimeout(() => {
      console.log("Auto-saving...");
      saveContent();
    }, 1500); // Save after 1.5 seconds of no activity

    // Cleanup
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [hasChanges, saveContent, isReadOnly]);

  // Save on unmount or when switching away
  useEffect(() => {
    return () => {
      // Clear timer
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      
      // Force save any pending changes when unmounting
      if (hasChanges && !isReadOnly && editor && editorReady) {
        console.log("Component unmounting, saving changes");
        const blocks = editor.document;
        const serializedContent = JSON.parse(JSON.stringify(blocks));
        // Use the mutation directly since the component is unmounting
        saveContentMutation({ fileId, content: serializedContent });
      }
    };
  }, [hasChanges, fileId, editor, editorReady, isReadOnly, saveContentMutation]);

  // Manual save
  const handleManualSave = async () => {
    console.log("Manual save triggered");
    await saveContent();
  };

  // Loading state
  if (!file || fileContent === undefined) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-medium">{file.title}</h1>
          {lastSaved && !isReadOnly && (
            <span className="text-xs text-muted-foreground">
              Saved {lastSaved.toLocaleTimeString()}
            </span>
          )}
        </div>
        {!isReadOnly && (
          <div className="flex items-center gap-2">
            {hasChanges && !isSaving && (
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualSave}
              disabled={isSaving || !hasChanges}
              className={cn(
                "gap-2",
                !hasChanges && "text-green-600"
              )}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving...
                </>
              ) : hasChanges ? (
                <>
                  <Save className="h-3.5 w-3.5" />
                  Save
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Saved
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Editor */}
      <ScrollArea className="flex-1">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <BlockNoteView 
            editor={editor}
            theme="light"
            className="min-h-[500px]"
            editable={!isReadOnly}
            formattingToolbar={true}
            linkToolbar={true}
          />
        </div>
      </ScrollArea>
    </div>
  );
}