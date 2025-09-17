"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { Loader2 } from "lucide-react";
import { AudioTranscriptionBlock } from "../../components/AudioTranscriptionBlock";

// Types for BlockNote inline content items
type InlineContentItem =
  | string
  | { type: 'text'; text: string; styles?: Record<string, unknown> }
  | { type: 'link'; href: string; content: InlineContentItem[] }
  | { type: string; [key: string]: unknown };

interface DynamicFileViewerProps {
  fileId: Id<"dynamicFiles">;
  isReadOnly?: boolean;
  highlightLine?: string | null;
  onBack?: () => void;
  autoPlayRequest?: {
    fileName: string;
    timestamp: number;
  };
}

// Note: Removed unused resolveConvexUrls helper to satisfy no-unused-vars

// Create the editor schema with customized blocks - excluding audio and video
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { audio, video, ...customBlockSpecs } = defaultBlockSpecs;
// audio and video are excluded to prevent browser crashes

const schema = BlockNoteSchema.create({
  blockSpecs: customBlockSpecs,
});

export function DynamicFileViewer({ fileId, isReadOnly = false, highlightLine, onBack, autoPlayRequest }: DynamicFileViewerProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const previousFileIdRef = useRef<Id<"dynamicFiles"> | null>(null);
  const currentHighlightedElement = useRef<Element | null>(null);
  
  const file = useQuery(api.dynamicFiles.get, { id: fileId });
  const fileContent = useQuery(api.dynamicFileContent.get, { fileId });
  const saveContentWithEmbeddings = useAction((api as any).embedActions.updatePageContentWithEmbeddings);
  
  // File upload mutations
  const generateUploadUrl = useMutation(api.fileUploads.generateUploadUrl);
  const saveFileMetadata = useMutation(api.fileUploads.saveFileMetadata);
  
  // Upload file function for BlockNote - Limited to images only
  const uploadFile = async (file: File) => {
    // Only allow image uploads through BlockNote
    if (!file.type.startsWith("image/")) {
      throw new Error("Only image files can be uploaded through the editor. Use the audio transcription section above for audio files.");
    }

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

  // Create the editor instance with upload functionality (images only)
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
      await saveContentWithEmbeddings({ 
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
  }, [editor, fileId, isReadOnly, editorReady, saveContentWithEmbeddings]);

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
    
    // Dynamic line mapping - count non-empty blocks as lines
    setTimeout(() => {
      // Build a dynamic mapping by counting actual content blocks
      let lineNumber = 1;
      const lineToBlockMap: { [key: number]: number } = {};

      blocks.forEach((block, index) => {
        // Check if block has actual content (not just empty or formatting)
        const hasContent = block.content &&
          Array.isArray(block.content) &&
          block.content.length > 0 &&
          block.content.some((item: InlineContentItem) => {
            if (typeof item === 'string') {
              return item.trim() !== '';
            }
            if (typeof item === 'object' && item !== null) {
              if ('text' in item && typeof item.text === 'string') {
                return item.text.trim() !== '';
              }
              if ('type' in item && item.type === 'link' && 'content' in item && Array.isArray(item.content)) {
                return item.content.some((linkItem: InlineContentItem) => {
                  if (typeof linkItem === 'string') {
                    return linkItem.trim() !== '';
                  }
                  if (typeof linkItem === 'object' && linkItem !== null && 'text' in linkItem && typeof linkItem.text === 'string') {
                    return linkItem.text.trim() !== '';
                  }
                  return false;
                });
              }
            }
            return false;
          });

        // Also count heading blocks and list items
        const isContentBlock = hasContent ||
          block.type === 'heading' ||
          block.type === 'bulletListItem' ||
          block.type === 'numberedListItem' ||
          (block.type === 'paragraph' && hasContent);

        if (isContentBlock) {
          lineToBlockMap[lineNumber] = index;
          console.log(`📍 Line ${lineNumber} → Block ${index} (${block.type})`);
          lineNumber++;
        }
      });

      console.log('📊 Dynamic line mapping created:', lineToBlockMap);

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
        saveContentWithEmbeddings({ fileId, content: serializedContent });
      }
    };
  }, [hasChanges, fileId, editor, editorReady, isReadOnly, saveContentWithEmbeddings]);

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
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header - Matching Aurea style */}
      <div className="px-4 py-3 border-b border-border/40 flex-shrink-0">
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
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
          {/* BlockNote Editor */}
          <BlockNoteView
            editor={editor}
            theme="light"
            className="min-h-[500px]"
            editable={!isReadOnly}
            formattingToolbar={true}
            linkToolbar={true}
          />

          {/* Audio Transcription Block - always below */}
          <AudioTranscriptionBlock
            dynamicFileId={fileId}
            isReadOnly={isReadOnly}
            autoPlayRequest={autoPlayRequest}
          />
        </div>
      </div>
    </div>
  );
}