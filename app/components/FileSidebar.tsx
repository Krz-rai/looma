"use client";

import React, { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
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
  isEditable = false,
}: FileSidebarProps) {
  const { setOpenMobile } = useSidebar();
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [newFileTitle, setNewFileTitle] = useState("");
  const [newFileIcon, setNewFileIcon] = useState("FileText");
  const [editingFile, setEditingFile] = useState<Id<"dynamicFiles"> | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editIcon, setEditIcon] = useState("FileText");

  const createFile = useMutation(api.dynamicFiles.create);
  const updateFile = useMutation(api.dynamicFiles.update);
  const deleteFile = useMutation(api.dynamicFiles.remove);

  const sortedFiles = useMemo(() => {
    return [...(dynamicFiles || [])].sort((a, b) => a.position - b.position);
  }, [dynamicFiles]);

  const handleSelect = (fileId: Id<"dynamicFiles"> | null) => {
    onSelectFile(fileId);
    setOpenMobile(false);
  };

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
      handleSelect(fileId);
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
        handleSelect(null);
      }
    }
  };

  const handleTogglePublic = async (
    fileId: Id<"dynamicFiles">,
    currentIsPublic: boolean
  ) => {
    await updateFile({
      id: fileId,
      isPublic: !currentIsPublic,
    });
  };

  return (
    <>
      {isEditable && (
        <SidebarHeader className="px-3 py-3">
          <Button
            onClick={() => setShowNewFileDialog(true)}
            variant="outline"
            className="w-full h-8 rounded-lg border-border/60 text-muted-foreground hover:text-foreground gap-2"
          >
            <Plus className="h-4 w-4" />
            <span className="text-sm">New Page</span>
          </Button>
        </SidebarHeader>
      )}

      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Resume"
                  isActive={selectedFileId === null}
                  onClick={() => handleSelect(null)}
                  className="text-sm"
                >
                  <FileUser className="h-4 w-4" />
                  <span className="flex-1 truncate">Resume</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {sortedFiles.map((file) => {
                const Icon = file.icon ? iconMap[file.icon] || FileText : FileText;
                const isSelected = selectedFileId === file._id;

                return (
                  <SidebarMenuItem key={file._id}>
                    <SidebarMenuButton
                      tooltip={file.title}
                      isActive={isSelected}
                      onClick={() => handleSelect(file._id)}
                      className="text-sm"
                    >
                      <Icon className="h-4 w-4" />
                      <span className="flex-1 truncate">{file.title}</span>
                      {isEditable && (
                        file.isPublic ? (
                          <Globe className="h-3.5 w-3.5 text-emerald-500/80" />
                        ) : (
                          <Lock className="h-3.5 w-3.5 opacity-70" />
                        )
                      )}
                    </SidebarMenuButton>

                    {isEditable && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <SidebarMenuAction showOnHover>
                            <MoreVertical className="h-3.5 w-3.5" />
                          </SidebarMenuAction>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-44 bg-popover"
                        >
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
                  </SidebarMenuItem>
                );
              })}

              {sortedFiles.length === 0 && (
                <SidebarMenuItem>
                  <div className="mt-4 rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">
                    No additional pages yet
                  </div>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border/40 px-4 py-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {isEditable ? "Manage project pages" : "Explore project documentation"}
      </SidebarFooter>

      <Dialog open={showNewFileDialog} onOpenChange={setShowNewFileDialog}>
        <DialogContent className="bg-background">
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
            <Button variant="outline" onClick={() => setShowNewFileDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFile}>Create Page</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingFile} onOpenChange={() => setEditingFile(null)}>
        <DialogContent className="bg-background">
          <DialogHeader>
            <DialogTitle>Edit Page</DialogTitle>
            <DialogDescription>Update the page title and icon.</DialogDescription>
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
            <Button variant="outline" onClick={() => setEditingFile(null)}>
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
    </>
  );
}
