import { InferUITools } from 'ai';
import { tool } from 'ai';
import { z } from 'zod';

/**
 * Tool schemas for type inference
 */

// Web search tool schema
export const webSearchToolSchema = {
  description: "Search the web for current information, news, and real-time data",
  inputSchema: z.object({
    query: z.string().describe("The search query to find information on the web"),
    maxResults: z.number().optional().default(3).describe("Maximum number of results to return"),
  }),
  execute: async ({ query, maxResults = 3 }: { query: string; maxResults?: number }) => {
    return {
      results: [] as Array<{
        title: string;
        url: string;
        snippet: string;
      }>,
      query,
      totalResults: 0
    };
  },
};

// Portfolio scraping tool schema
export const scrapePortfolioToolSchema = {
  description: "Scrapes portfolio websites to extract projects, skills, and detailed information",
  inputSchema: z.object({
    url: z.string().describe("The portfolio website URL to scrape"),
  }),
  execute: async ({ url }: { url: string }) => {
    return {
      success: true,
      title: '',
      url: '',
      markdown: '',
      error: null as string | null,
    };
  },
};

// Content search tool schema
export const searchContentToolSchema = {
  description: "Search for specific text within pages and audio transcriptions",
  inputSchema: z.object({
    query: z.string().describe("The text to search for"),
    searchIn: z.enum(["all", "pages", "audio"]).optional().default("all"),
    limit: z.number().optional().default(5),
  }),
  execute: async ({ query, searchIn = "all", limit = 5 }: {
    query: string;
    searchIn?: "all" | "pages" | "audio";
    limit?: number;
  }) => {
    return {
      results: [] as Array<{
        type: 'page' | 'audio';
        pageId: string;
        title: string;
        content: string;
        lineNumber?: number;
        timestamp?: number;
        fileName?: string;
      }>,
      totalCount: 0,
      searchQuery: query,
    };
  },
};

// Page content search tool schema
export const searchPageContentToolSchema = {
  description: "Search and retrieve content from a documentation page",
  inputSchema: z.object({
    pageQuery: z.string().describe("The page title or ID to search for"),
  }),
  execute: async ({ pageQuery }: { pageQuery: string }) => {
    return {
      success: true,
      pageId: '',
      pageTitle: '',
      content: '',
      pageContentWithNumbers: '',
      audioInfo: '',
    };
  },
};

// Create tool instances for type inference
const resumeChatTools = {
  web_search: tool(webSearchToolSchema),
  scrape_portfolio: tool(scrapePortfolioToolSchema),
  search_content: tool(searchContentToolSchema),
  search_page_content: tool(searchPageContentToolSchema),
};

// Page chat tool schema (different endpoint)
const pageChatTools = {
  search_page_content: tool({
    description: "Retrieve content from a public documentation page based on the query",
    inputSchema: z.object({
      pageQuery: z.string().describe("The page title or ID to search for"),
    }),
    execute: async ({ pageQuery }: { pageQuery: string }) => {
      return {
        success: false as boolean,
        error: '' as string | undefined,
      };
    },
  }),
};

// Export inferred types
export type ResumeChatTools = InferUITools<typeof resumeChatTools>;
export type PageChatTools = InferUITools<typeof pageChatTools>;

// Combined type for all tools
export type AllTools = ResumeChatTools & PageChatTools;

// Export individual tool types for convenience
export type WebSearchTool = ResumeChatTools['web_search'];
export type ScrapePortfolioTool = ResumeChatTools['scrape_portfolio'];
export type SearchContentTool = ResumeChatTools['search_content'];
export type SearchPageContentTool = ResumeChatTools['search_page_content'];

// Type guards for tool parts in messages
export function isWebSearchToolPart(part: any): part is {
  type: 'tool-web_search';
  toolCallId: string;
  state: 'pending' | 'streaming' | 'output-available' | 'output-error';
  input: WebSearchTool['input'];
  output?: WebSearchTool['output'];
} {
  return part?.type === 'tool-web_search';
}

export function isScrapePortfolioToolPart(part: any): part is {
  type: 'tool-scrape_portfolio';
  toolCallId: string;
  state: 'pending' | 'streaming' | 'output-available' | 'output-error';
  input: ScrapePortfolioTool['input'];
  output?: ScrapePortfolioTool['output'];
} {
  return part?.type === 'tool-scrape_portfolio';
}

export function isSearchContentToolPart(part: any): part is {
  type: 'tool-search_content';
  toolCallId: string;
  state: 'pending' | 'streaming' | 'output-available' | 'output-error';
  input: SearchContentTool['input'];
  output?: SearchContentTool['output'];
} {
  return part?.type === 'tool-search_content';
}

export function isSearchPageContentToolPart(part: any): part is {
  type: 'tool-search_page_content';
  toolCallId: string;
  state: 'pending' | 'streaming' | 'output-available' | 'output-error';
  input: SearchPageContentTool['input'];
  output?: SearchPageContentTool['output'];
} {
  return part?.type === 'tool-search_page_content';
}