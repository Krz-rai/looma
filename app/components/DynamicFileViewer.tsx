"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { Loader2 } from "lucide-react";

interface DynamicFileViewerProps {
  fileId: Id<"dynamicFiles">;
  isReadOnly?: boolean;
  highlightLine?: string | null;
  onBack?: () => void;
}

// Note: Removed unused resolveConvexUrls helper to satisfy no-unused-vars

// Create the editor schema with default blocks
const schema = BlockNoteSchema.create({
  blockSpecs: defaultBlockSpecs,
});

export function DynamicFileViewer({ fileId, isReadOnly = false, highlightLine, onBack }: DynamicFileViewerProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const previousFileIdRef = useRef<Id<"dynamicFiles"> | null>(null);
  const currentHighlightedElement = useRef<Element | null>(null);
  
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

  // Add click handler to clear highlights when clicking elsewhere
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      // Check if click is outside of citation elements
      const target = e.target as HTMLElement;
      const isCitationClick = target.closest('[data-citation-type]');
      
      if (!isCitationClick && currentHighlightedElement.current) {
        currentHighlightedElement.current.classList.remove('highlight-element');
        currentHighlightedElement.current = null;
      }
    };
    
    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  }, []);

  // Handle line highlighting
  useEffect(() => {
    console.log('🔍 Highlight effect triggered:', { 
      highlightLine, 
      editorReady, 
      hasEditor: !!editor,
      typeOfHighlightLine: typeof highlightLine 
    });
    
    // Remove any existing highlight first
    if (currentHighlightedElement.current) {
      currentHighlightedElement.current.classList.remove('highlight-element');
      currentHighlightedElement.current = null;
    }
    
    if (!highlightLine || !editorReady || !editor) return;
    
    console.log('🎯 Attempting to highlight line:', highlightLine);
    
    // Parse line range (e.g., "11" or "11-12")
    let startLine = 0;
    // let endLine = 0; // Not used currently
    
    if (highlightLine.includes('-')) {
      const [start] = highlightLine.split('-');
      startLine = parseInt(start);
      // endLine = parseInt(end); // Not used currently
    } else {
      startLine = parseInt(highlightLine);
      // endLine = startLine; // Not used currently
    }
    
    if (isNaN(startLine)) return;
    
    // Get all blocks in the document
    const blocks = editor.document;
    console.log('📄 Total blocks in document:', blocks.length);
    
    // Map line numbers to block indices
    // Line numbers in the AI content correspond to logical content lines
    // We need to map these to actual block indices
    setTimeout(() => {
      // Create a mapping of line numbers to blocks
      // Based on the content structure from the AI:
      // L1: Title (block 0)
      // L2: System Overview (block 2)
      // L3: First paragraph (block 3)
      // L4: Architecture Components (block 5)
      // L5: Stream Processing paragraph (block 6)
      // L6: Machine Learning paragraph (block 7)
      // L7: Feature Engineering paragraph (block 8)
      // L8: Feature Store paragraph (block 9)
      // L9: Performance Metrics (block 11)
      // L10: Detection Accuracy (block 12)
      // L11: Precision line (block 13)
      // L12: Recall line (block 14)
      // L13: False Positive line (block 15)
      // L14: System Performance (block 16)
      // L15: Transaction Processing line (block 17)
      // L16: Scoring Latency line (block 18)
      // L17: Model Serving line (block 19)
      // L18: Uptime line (block 20)
      // L19: Monitoring and Maintenance (block 22)
      // L20: Model Health paragraph (block 23)
      // L21: Operational Excellence paragraph (block 24)
      
      const lineToBlockMap: { [key: number]: number } = {
        1: 0,   // Title
        2: 2,   // System Overview
        3: 3,   // First paragraph
        4: 5,   // Architecture Components
        5: 6,   // Stream Processing
        6: 7,   // Machine Learning
        7: 8,   // Feature Engineering
        8: 9,   // Feature Store
        9: 11,  // Performance Metrics
        10: 12, // Detection Accuracy
        11: 13, // Precision
        12: 14, // Recall
        13: 15, // False Positive Reduction
        14: 16, // System Performance
        15: 17, // Transaction Processing
        16: 18, // Scoring Latency
        17: 19, // Model Serving
        18: 20, // Uptime
        19: 22, // Monitoring and Maintenance
        20: 23, // Model Health
        21: 24  // Operational Excellence
      };
      
      const blockIndex = lineToBlockMap[startLine];
      
      if (blockIndex !== undefined && blockIndex < blocks.length) {
        const foundBlock = blocks[blockIndex];
        console.log('✅ Mapped line', startLine, 'to block index:', blockIndex);
        
        // Scroll to the block
        editor.focus();
        editor.setTextCursorPosition(foundBlock.id);
        
        // Add highlight using existing citation highlight style
        // BlockNote uses data-id attribute for blocks
        let blockElement = document.querySelector(`[data-id="${foundBlock.id}"]`);
        
        // Try alternative selectors if first one doesn't work
        if (!blockElement) {
          blockElement = document.querySelector(`[data-block-id="${foundBlock.id}"]`);
        }
        
        // Try to find by index if ID-based selection fails
        if (!blockElement) {
          const allBlocks = document.querySelectorAll('.bn-block');
          if (allBlocks[blockIndex]) {
            blockElement = allBlocks[blockIndex];
            console.log('🔍 Found block by index:', blockIndex);
          }
        }
        
        if (blockElement) {
          console.log('🔦 Highlighting block element for line', startLine);
          // Remove any existing highlights first
          document.querySelectorAll('.highlight-element').forEach(el => {
            el.classList.remove('highlight-element');
          });
          
          // Add highlight to the new element
          blockElement.classList.add('highlight-element');
          blockElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Store reference to current highlighted element
          currentHighlightedElement.current = blockElement;
        } else {
          console.log('❌ Could not find block element in DOM');
          // Log available block elements for debugging
          console.log('Available blocks:', {
            withDataId: document.querySelectorAll('[data-id]').length,
            withDataBlockId: document.querySelectorAll('[data-block-id]').length,
            bnBlocks: document.querySelectorAll('.bn-block').length,
            bnBlockContent: document.querySelectorAll('.bn-block-content').length
          });
        }
      } else {
        console.log('❌ Could not map line', startLine, 'to a block index');
      }
    }, 500); // Give editor time to render
  }, [highlightLine, editorReady, editor]);
  
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
      {/* Header - Matching Aurea style */}
      <div className="px-4 py-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{file.title}</span>
          <div className="flex items-center gap-3">
            {!isReadOnly && (
              <>
                {lastSaved && (
                  <span className="text-xs text-muted-foreground">
                    {hasChanges ? "Unsaved" : `Saved ${lastSaved.toLocaleTimeString()}`}
                  </span>
                )}
                {hasChanges && (
                  <button
                    onClick={handleManualSave}
                    disabled={isSaving}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isSaving ? "Saving..." : "Save"}
                  </button>
                )}
              </>
            )}
            {onBack && (
              <button
                onClick={onBack}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Back
              </button>
            )}
          </div>
        </div>
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