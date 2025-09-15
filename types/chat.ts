import { UIMessage } from "ai";
import { Id } from "@/convex/_generated/dataModel";

export interface Citation {
  type: string;
  text: string;
  simpleId: string;
  convexId: string;
  timestamp?: number; // For audio citations - timestamp in seconds
  audioId?: string;   // For audio citations - the audio transcription ID
  audioFileName?: string; // For audio citations - the filename
}

export interface CustomUIMessage extends UIMessage {
  citations?: Citation[];
  metadata?: {
    resumeId?: Id<"resumes">;
    timestamp?: Date;
  };
}

export interface SearchPageContentTool {
  name: "search_page_content";
  description: string;
  parameters: {
    pageQuery: string;
  };
}

export interface ToolResult {
  success: boolean;
  pageTitle?: string;
  pageId?: string;
  content?: string;
  error?: string;
  availablePages?: string[];
}

export interface ResumeContext {
  resumeId: Id<"resumes">;
  title: string;
  description?: string;
  name?: string;
  role?: string;
  portfolio?: string;
  github?: string;
  projects: Array<{
    _id: string;
    simpleId: string;
    title: string;
    description?: string;
    bulletPoints: Array<{
      _id: string;
      simpleId: string;
      content: string;
      branches: Array<{
        _id: string;
        simpleId: string;
        content: string;
      }>;
    }>;
    connectedPageInfo?: {
      _id: string;
      simpleId: string;
      title: string;
    };
  }>;
  publicPages: Array<{
    _id: string;
    simpleId: string;
    title: string;
  }>;
  githubData?: any;
}

export interface IdMapping {
  forward: Record<string, string>;
  reverse: Record<string, string>;
}