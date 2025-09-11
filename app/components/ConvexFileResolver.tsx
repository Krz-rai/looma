"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Loader2 } from "lucide-react";
import Image from "next/image";

interface ConvexFileResolverProps {
  url: string;
  type?: "image" | "video" | "audio" | "file";
  alt?: string;
  className?: string;
}

export function ConvexFileResolver({ url, type = "file", alt, className }: ConvexFileResolverProps) {
  // Check if this is a Convex file URL
  const isConvexFile = url?.startsWith("convex://");
  const storageId = isConvexFile ? url.replace("convex://", "") as Id<"_storage"> : null;
  
  // Get the actual URL from Convex storage
  const fileUrl = useQuery(
    api.fileUploads.getFileUrl, 
    storageId ? { storageId } : "skip"
  );
  
  // If it's not a Convex file, just render the URL directly
  if (!isConvexFile) {
    switch (type) {
      case "image":
        return (
          <Image 
            src={url} 
            alt={alt || ""} 
            className={className} 
            width={1200}
            height={800}
          />
        );
      case "video":
        return <video src={url} controls className={className} />;
      case "audio":
        return <audio src={url} controls className={className} />;
      default:
        return <a href={url} target="_blank" rel="noopener noreferrer" className={className}>{alt || url}</a>;
    }
  }
  
  // Loading state for Convex files
  if (!fileUrl) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  // Render the resolved Convex file
  switch (type) {
    case "image":
      return (
        <Image 
          src={fileUrl} 
          alt={alt || ""} 
          className={className} 
          width={1200}
          height={800}
        />
      );
    case "video":
      return <video src={fileUrl} controls className={className} />;
    case "audio":
      return <audio src={fileUrl} controls className={className} />;
    default:
      return <a href={fileUrl} target="_blank" rel="noopener noreferrer" className={className}>{alt || "Download File"}</a>;
  }
}