"use client";

import React, { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  FileText,
  Plus,
  MoreVertical,
  Lock,
  Globe,
  Trash2,
  Edit2,
  ChevronRight,
  Briefcase,
  Award,
  Users,
  MessageSquare,
  Calendar,
  File,
  BarChart,
  GripVertical,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const iconMap: { [key: string]: React.ElementType } = {
  FileText,
  Briefcase,
  Award,
  Users,
  MessageSquare,
  Calendar,
  File,
  BarChart,
};

interface FileSidebarProps {
  resumeId: Id<"resumes">;
  dynamicFiles: Array<{
    _id: Id<"dynamicFiles">;
    title: string;
    icon?: string;
    isPublic: boolean;
  }>;
  selectedFileId: Id<"dynamicFiles"> | null;
  onSelectFile: (fileId: Id<"dynamicFiles"> | null) => void;
  isEditable?: boolean;
}

interface SortableFileItemProps {
  file: {
    _id: Id<"dynamicFiles">;
    title: string;
    icon?: string;
    isPublic: boolean;
  };
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublic: () => void;
  isEditable: boolean;
}

function SortableFileItem({ 
  file, 
  isSelected, 
  onSelect, 
  onEdit, 
  onDelete,
  onTogglePublic,
  isEditable 
}: SortableFileItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: file._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = file.icon ? (iconMap[file.icon] || FileText) : FileText;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors",
        isSelected 
          ? "bg-muted text-foreground" 
          : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
      )}
    >
      {isEditable && (
        <div {...attributes} {...listeners} className="cursor-grab">
          <GripVertical className="h-3.5 w-3.5 opacity-0 group-hover:opacity-50" />
        </div>
      )}
      <div className="flex items-center gap-2 flex-1" onClick={onSelect}>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="text-sm truncate flex-1">{file.title}</span>
        {file.isPublic ? (
          <Globe className="h-3 w-3 text-muted-foreground" />
        ) : (
          <Lock className="h-3 w-3 text-muted-foreground" />
        )}
      </div>
      {isEditable && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={onEdit}>
              <Edit2 className="mr-2 h-3.5 w-3.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onTogglePublic}>
              {file.isPublic ? (
                <>
                  <Lock className="mr-2 h-3.5 w-3.5" />
                  Make Private
                </>
              ) : (
                <>
                  <Globe className="mr-2 h-3.5 w-3.5" />
                  Make Public
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

export function FileSidebar({ 
  resumeId, 
  dynamicFiles, 
  selectedFileId, 
  onSelectFile,
  isEditable = false 
}: FileSidebarProps) {
  const [isAddingFile, setIsAddingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [editingFile, setEditingFile] = useState<{
    _id: Id<"dynamicFiles">;
    title: string;
  } | null>(null);
  
  const templates = useQuery(api.fileTemplates.list);
  const createFile = useMutation(api.dynamicFiles.create);
  const updateFile = useMutation(api.dynamicFiles.update);
  const deleteFile = useMutation(api.dynamicFiles.remove);
  const reorderFiles = useMutation(api.dynamicFiles.reorder);
  const seedTemplates = useMutation(api.fileTemplates.seed);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  React.useEffect(() => {
    if (templates && templates.length === 0) {
      seedTemplates();
    }
  }, [templates, seedTemplates]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = dynamicFiles.findIndex((f) => f._id === active.id);
      const newIndex = dynamicFiles.findIndex((f) => f._id === over?.id);
      
      const newOrder = arrayMove(dynamicFiles, oldIndex, newIndex);
      const fileIds = newOrder.map(f => f._id);
      
      await reorderFiles({ resumeId, fileIds });
    }
  };

  const handleCreateFile = async () => {
    if (!newFileName.trim()) return;
    
    const templateId = selectedTemplate ? 
      templates?.find(t => t.name === selectedTemplate)?._id : 
      undefined;
    
    const fileId = await createFile({
      resumeId,
      title: newFileName,
      icon: templates?.find(t => t._id === templateId)?.icon || "File",
      isPublic: false,
      templateId,
    });
    
    setNewFileName("");
    setSelectedTemplate(null);
    setIsAddingFile(false);
    onSelectFile(fileId);
  };

  const handleUpdateFile = async () => {
    if (!editingFile || !editingFile.title.trim()) return;
    
    await updateFile({
      id: editingFile._id,
      title: editingFile.title,
    });
    
    setEditingFile(null);
  };

  const handleTogglePublic = async (file: {
    _id: Id<"dynamicFiles">;
    isPublic: boolean;
  }) => {
    await updateFile({
      id: file._id,
      isPublic: !file.isPublic,
    });
  };

  const handleDeleteFile = async (fileId: Id<"dynamicFiles">) => {
    await deleteFile({ id: fileId });
    if (selectedFileId === fileId) {
      onSelectFile(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-muted/30 border-r border-border/40">
      <div className="p-4 border-b border-border/40">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">Files</h3>
          {isEditable && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsAddingFile(true)}
              className="h-7 px-2"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        
        {/* Resume File (Always Present) */}
        <div
          onClick={() => onSelectFile(null)}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors mb-2",
            !selectedFileId 
              ? "bg-muted text-foreground" 
              : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
          )}
        >
          <FileText className="h-4 w-4" />
          <span className="text-sm font-medium">Resume</span>
          <ChevronRight className="h-3 w-3 ml-auto" />
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={dynamicFiles.map(f => f._id)}
              strategy={verticalListSortingStrategy}
            >
              {dynamicFiles.map((file) => (
                <SortableFileItem
                  key={file._id}
                  file={file}
                  isSelected={selectedFileId === file._id}
                  onSelect={() => onSelectFile(file._id)}
                  onEdit={() => setEditingFile(file)}
                  onDelete={() => handleDeleteFile(file._id)}
                  onTogglePublic={() => handleTogglePublic(file)}
                  isEditable={isEditable}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </ScrollArea>

      {/* Add File Dialog */}
      <Dialog open={isAddingFile} onOpenChange={setIsAddingFile}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New File</DialogTitle>
            <DialogDescription>
              Choose a template or start with a blank file
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template</Label>
              <div className="grid grid-cols-2 gap-2">
                {templates?.map((template) => {
                  const Icon = iconMap[template.icon] || File;
                  return (
                    <button
                      key={template._id}
                      onClick={() => setSelectedTemplate(template.name)}
                      className={cn(
                        "flex items-center gap-2 p-3 rounded-md border text-left transition-colors",
                        selectedTemplate === template.name
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      )}
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{template.name}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {template.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="filename">File Name</Label>
              <Input
                id="filename"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="Enter file name..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddingFile(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFile} disabled={!newFileName.trim()}>
              Create File
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit File Dialog */}
      <Dialog open={!!editingFile} onOpenChange={(open) => !open && setEditingFile(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit File</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-filename">File Name</Label>
              <Input
                id="edit-filename"
                value={editingFile?.title || ""}
                onChange={(e) =>
                  setEditingFile((prev) => (prev ? { ...prev, title: e.target.value } : prev))
                }
                placeholder="Enter file name..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingFile(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateFile}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}