"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileText, Link2, Link2Off, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageConnectionSelectorProps {
  projectId: Id<"projects">;
  resumeId: Id<"resumes">;
  connectedPageId?: Id<"dynamicFiles">;
  className?: string;
}

export function PageConnectionSelector({
  projectId,
  resumeId,
  connectedPageId,
  className,
}: PageConnectionSelectorProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  
  const dynamicFiles = useQuery(api.dynamicFiles.list, { resumeId });
  const connectPage = useMutation(api.projects.connectPage);
  
  const connectedPage = dynamicFiles?.find(file => file._id === connectedPageId);
  
  const handleConnect = async (pageId: Id<"dynamicFiles"> | null) => {
    setIsConnecting(true);
    try {
      await connectPage({
        projectId,
        pageId: pageId || undefined,
      });
    } catch (error) {
      console.error("Failed to connect page:", error);
    } finally {
      setIsConnecting(false);
    }
  };
  
  if (!dynamicFiles || dynamicFiles.length === 0) {
    return (
      <div className={cn("text-xs text-muted-foreground", className)}>
        No pages available
      </div>
    );
  }
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 px-2 text-xs gap-1.5",
            connectedPage && "text-primary",
            className
          )}
          disabled={isConnecting}
        >
          {connectedPage ? (
            <>
              <Link2 className="h-3 w-3" />
              <span className="truncate max-w-[150px]">{connectedPage.title}</span>
            </>
          ) : (
            <>
              <FileText className="h-3 w-3" />
              <span>Connect Page</span>
            </>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
          Connect to Page
        </div>
        
        {dynamicFiles.map((file) => (
          <DropdownMenuItem
            key={file._id}
            onClick={() => handleConnect(file._id)}
            className={cn(
              "cursor-pointer",
              file._id === connectedPageId && "bg-accent"
            )}
          >
            <FileText className="mr-2 h-3.5 w-3.5" />
            <span className="text-sm truncate">{file.title}</span>
            {file._id === connectedPageId && (
              <Link2 className="ml-auto h-3 w-3 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
        
        {connectedPage && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => handleConnect(null)}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <Link2Off className="mr-2 h-3.5 w-3.5" />
              <span className="text-sm">Disconnect Page</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}