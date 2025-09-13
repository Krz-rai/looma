"use client";

import React, { useState } from "react";
import { useMutation } from "convex/react";
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
  Briefcase,
  Award,
  Users,
  MessageSquare,
  Calendar,
  File,
  BarChart,
  FileUser,
} from "lucide-react";

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
    position: number;
  }>;
  selectedFileId: Id<"dynamicFiles"> | null;
  onSelectFile: (fileId: Id<"dynamicFiles"> | null) => void;
  isEditable?: boolean;
}

export function FileSidebar({ 
  resumeId, 
  dynamicFiles, 
  selectedFileId, 
  onSelectFile,
  isEditable = false 
}: FileSidebarProps) {
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [newFileTitle, setNewFileTitle] = useState("");
  const [newFileIcon, setNewFileIcon] = useState("FileText");
  const [editingFile, setEditingFile] = useState<Id<"dynamicFiles"> | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editIcon, setEditIcon] = useState("FileText");

  const createFile = useMutation(api.dynamicFiles.create);
  const updateFile = useMutation(api.dynamicFiles.update);
  const deleteFile = useMutation(api.dynamicFiles.remove);

  const handleCreateFile = async () => {
    if (newFileTitle.trim()) {
      const fileId = await createFile({
        resumeId,
        title: newFileTitle.trim(),
        icon: newFileIcon,
        isPublic: false,
      });
      setNewFileTitle("");
      setNewFileIcon("FileText");
      setShowNewFileDialog(false);
      onSelectFile(fileId);
    }
  };

  const handleUpdateFile = async (fileId: Id<"dynamicFiles">) => {
    if (editTitle.trim()) {
      await updateFile({
        id: fileId,
        title: editTitle.trim(),
        icon: editIcon,
      });
      setEditingFile(null);
    }
  };

  const handleDeleteFile = async (fileId: Id<"dynamicFiles">) => {
    if (confirm("Are you sure you want to delete this page?")) {
      await deleteFile({ id: fileId });
      if (selectedFileId === fileId) {
        onSelectFile(null);
      }
    }
  };

  const handleTogglePublic = async (fileId: Id<"dynamicFiles">, currentIsPublic: boolean) => {
    await updateFile({
      id: fileId,
      isPublic: !currentIsPublic,
    });
  };

  const sortedFiles = [...(dynamicFiles || [])].sort((a, b) => a.position - b.position);

  return (
    <div className="h-full flex flex-col bg-sidebar border-r">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="text-sm font-semibold">Pages</h3>
        {isEditable && (
          <Button
            onClick={() => setShowNewFileDialog(true)}
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>
      
      {/* File List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {/* Resume Option */}
          <div
            className={cn(
              "group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
              selectedFileId === null
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "hover:bg-sidebar-accent/50 text-sidebar-foreground"
            )}
            onClick={() => onSelectFile(null)}
          >
            <FileUser className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">Resume</span>
          </div>
          
          {/* Separator if there are files */}
          {sortedFiles.length > 0 && (
            <div className="my-2 border-b border-sidebar-border/50" />
          )}
          
          {sortedFiles.map((file) => {
            const Icon = file.icon ? (iconMap[file.icon] || FileText) : FileText;
            const isSelected = selectedFileId === file._id;
            
            return (
              <div
                key={file._id}
                className={cn(
                  "group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
                  isSelected 
                    ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                    : "hover:bg-sidebar-accent/50 text-sidebar-foreground"
                )}
              >
                {/* File button content */}
                <div 
                  className="flex items-center gap-2 flex-1 min-w-0"
                  onClick={() => onSelectFile(file._id)}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="text-sm truncate flex-1">{file.title}</span>
                  {file.isPublic ? (
                    <Globe className="h-3 w-3 shrink-0 opacity-60" />
                  ) : (
                    <Lock className="h-3 w-3 shrink-0 opacity-60" />
                  )}
                </div>
                
                {/* Menu */}
                {isEditable && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem
                        onClick={() => {
                          setEditingFile(file._id);
                          setEditTitle(file.title);
                          setEditIcon(file.icon || "FileText");
                        }}
                      >
                        <Edit2 className="mr-2 h-3.5 w-3.5" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleTogglePublic(file._id, file.isPublic)}
                      >
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
                        onClick={() => handleDeleteFile(file._id)}
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
          })}
          
          {sortedFiles.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No additional pages
            </div>
          )}
        </div>
      </ScrollArea>

      {/* New File Dialog */}
      <Dialog open={showNewFileDialog} onOpenChange={setShowNewFileDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Page</DialogTitle>
            <DialogDescription>
              Add a new page to your resume documentation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Page Title</Label>
              <Input
                id="title"
                placeholder="Enter page title..."
                value={newFileTitle}
                onChange={(e) => setNewFileTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateFile();
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="icon">Icon</Label>
              <div className="grid grid-cols-4 gap-2">
                {Object.keys(iconMap).map((iconName) => {
                  const IconComponent = iconMap[iconName];
                  return (
                    <Button
                      key={iconName}
                      variant={newFileIcon === iconName ? "default" : "outline"}
                      size="sm"
                      onClick={() => setNewFileIcon(iconName)}
                      className="h-9"
                    >
                      <IconComponent className="h-4 w-4" />
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNewFileDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateFile}>Create Page</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit File Dialog */}
      <Dialog open={!!editingFile} onOpenChange={() => setEditingFile(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Page</DialogTitle>
            <DialogDescription>
              Update the page title and icon.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Page Title</Label>
              <Input
                id="edit-title"
                placeholder="Enter page title..."
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && editingFile) {
                    handleUpdateFile(editingFile);
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-icon">Icon</Label>
              <div className="grid grid-cols-4 gap-2">
                {Object.keys(iconMap).map((iconName) => {
                  const IconComponent = iconMap[iconName];
                  return (
                    <Button
                      key={iconName}
                      variant={editIcon === iconName ? "default" : "outline"}
                      size="sm"
                      onClick={() => setEditIcon(iconName)}
                      className="h-9"
                    >
                      <IconComponent className="h-4 w-4" />
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingFile(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingFile) {
                  handleUpdateFile(editingFile);
                }
              }}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}