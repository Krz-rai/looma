"use client";

import React, { useMemo } from "react";
import { Id } from "../../convex/_generated/dataModel";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { FileText, Briefcase, Award, Users, MessageSquare, Calendar, File, BarChart, FileUser } from "lucide-react";

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

interface PublicResumeSidebarProps {
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
}

export function PublicResumeSidebar({
  dynamicFiles,
  selectedFileId,
  onSelectFile,
}: PublicResumeSidebarProps) {
  const sortedFiles = useMemo(() => {
    return [...(dynamicFiles || [])].sort((a, b) => a.position - b.position);
  }, [dynamicFiles]);

  return (
    <>
      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Resume"
                  isActive={selectedFileId === null}
                  onClick={() => onSelectFile(null)}
                  className="text-sm"
                >
                  <FileUser className="h-4 w-4" />
                  <span className="flex-1 truncate">Resume</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {sortedFiles.length > 0 && <SidebarSeparator className="my-2" />}

              {sortedFiles.map((file) => {
                const Icon = file.icon ? iconMap[file.icon] || FileText : FileText;
                const isSelected = selectedFileId === file._id;

                return (
                  <SidebarMenuItem key={file._id}>
                    <SidebarMenuButton
                      tooltip={file.title}
                      isActive={isSelected}
                      onClick={() => onSelectFile(file._id)}
                      className="text-sm"
                    >
                      <Icon className="h-4 w-4" />
                      <span className="flex-1 truncate">{file.title}</span>
                    </SidebarMenuButton>
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

      <SidebarFooter className="px-4 py-3 border-t border-border/40">
        <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Project docs
        </div>
      </SidebarFooter>
    </>
  );
}

export default PublicResumeSidebar;


