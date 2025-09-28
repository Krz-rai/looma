import type { UIMessage, UITool } from 'ai';
import { tool, InferUITools } from 'ai';
import { z } from 'zod';

export const webResultSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  content: z.string(),
  score: z.number().optional(),
});

export const resumeWebSearchInputSchema = z.object({
  query: z.string(),
  maxResults: z.number().optional(),
});

export const resumeWebSearchOutputSchema = z.object({
  success: z.boolean(),
  answer: z.string().nullable().optional(),
  results: z.array(webResultSchema).optional(),
  error: z.string().optional(),
}).passthrough();

export const scrapePortfolioInputSchema = z.object({
  url: z.string(),
});

export const scrapePortfolioOutputSchema = z.object({
  success: z.boolean(),
  url: z.string(),
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  summary: z.string().optional(),
  links: z.array(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
  error: z.string().optional(),
}).passthrough();

export const exactMatchSchema = z.object({
  type: z.string(),
  pageTitle: z.string().optional(),
  pageId: z.string().optional(),
  matchedText: z.string().optional(),
  context: z.string().optional(),
  citation: z.string().optional(),
  lineNumber: z.number().optional(),
  fileName: z.string().optional(),
  timestamp: z.number().optional(),
  note: z.string().optional(),
  variantUsed: z.string().optional(),
  variantReason: z.string().optional(),
}).passthrough();

export const variantSummarySchema = z.object({
  value: z.string(),
  reason: z.string(),
  totalFound: z.number(),
});

export const searchExactInputSchema = z.object({
  query: z.string(),
  searchIn: z.enum(['all', 'pages', 'echoes', 'resume']).optional(),
  limit: z.number().optional(),
});

export const searchExactOutputSchema = z.object({
  query: z.string(),
  scope: z.enum(['all', 'pages', 'echoes', 'resume']),
  totalFound: z.number(),
  results: z.array(exactMatchSchema),
  hasCitations: z.boolean(),
  variantSearches: z.array(variantSummarySchema),
  guidance: z.string(),
});

export const semanticResultSchema = z.object({
  sourceType: z.string(),
  sourceId: z.string().optional(),
  text: z.string(),
  score: z.number().optional(),
  chunkIndex: z.number().optional(),
  metadata: z.record(z.any()).optional(),
  citation: z.string().optional(),
});

export const searchSemanticInputSchema = z.object({
  query: z.string(),
  limit: z.number().optional(),
  minScore: z.number().optional(),
});

export const searchSemanticOutputSchema = z.object({
  query: z.string(),
  totalFound: z.number(),
  filteredByScore: z.number().optional(),
  filteredByType: z.any().optional(),
  results: z.array(semanticResultSchema),
  verification: z.object({
    candidateQueries: z.array(z.string()),
    attempts: z.array(searchExactOutputSchema).optional(),
    verifiedResults: z.array(exactMatchSchema),
    hasCitations: z.boolean(),
  }),
  timings: z.object({
    embeddingMs: z.number().optional(),
    searchMs: z.number().optional(),
  }).optional(),
  guidance: z.string(),
});

export const searchPageContentInputSchema = z.object({
  pageQuery: z.string(),
});

export const searchPageContentOutputSchema = z.object({
  success: z.boolean(),
  pageTitle: z.string().optional(),
  pageId: z.string().optional(),
  content: z.string().optional(),
  availablePages: z.array(z.any()).optional(),
  error: z.string().optional(),
});

export const resumeProjectSchema = z.object({
  _id: z.any(),
  title: z.string(),
  description: z.string().nullable().optional(),
  position: z.number().optional(),
  simpleId: z.string(),
  hasConnectedPage: z.boolean().optional(),
  connectedPageId: z.string().nullable().optional(),
  connectedPageInfo: z
    .object({
      _id: z.any(),
      title: z.string(),
      isPublic: z.boolean().optional(),
      simpleId: z.string().optional(),
    })
    .nullable()
    .optional(),
  bulletPoints: z.array(
    z.object({
      _id: z.any(),
      content: z.string(),
      position: z.number().optional(),
      simpleId: z.string().optional(),
      branches: z.array(
        z.object({
          _id: z.any(),
          content: z.string(),
          simpleId: z.string().optional(),
        })
      ),
    })
  ),
});

export const fetchResumeDataInputSchema = z.object({
  dataType: z.enum(['overview', 'projects', 'full']).optional(),
});

export const fetchResumeDataOutputSchema = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
  projects: z.array(z.any()).optional(),
  projectCount: z.number().optional(),
  projectTitles: z.array(z.string()).optional(),
}).passthrough();

export type ResumeWebSearchInput = z.infer<typeof resumeWebSearchInputSchema>;
export type ResumeWebSearchOutput = z.infer<typeof resumeWebSearchOutputSchema>;
export type ScrapePortfolioInput = z.infer<typeof scrapePortfolioInputSchema>;
export type ScrapePortfolioOutput = z.infer<typeof scrapePortfolioOutputSchema>;
export type SearchExactInput = z.infer<typeof searchExactInputSchema>;
export type SearchExactOutput = z.infer<typeof searchExactOutputSchema>;
export type SearchSemanticInput = z.infer<typeof searchSemanticInputSchema>;
export type SearchSemanticOutput = z.infer<typeof searchSemanticOutputSchema>;
export type SearchPageContentInput = z.infer<typeof searchPageContentInputSchema>;
export type SearchPageContentOutput = z.infer<typeof searchPageContentOutputSchema>;
export type FetchResumeDataInput = z.infer<typeof fetchResumeDataInputSchema>;
export type FetchResumeDataOutput = z.infer<typeof fetchResumeDataOutputSchema>;

export const resumeChatToolSchemas = {
  resume_web_search: tool<ResumeWebSearchInput, ResumeWebSearchOutput>({
    description: 'Search curated sources and saved snippets.',
    inputSchema: resumeWebSearchInputSchema,
    outputSchema: resumeWebSearchOutputSchema,
    execute: async () => ({ success: false })
  }),
  scrape_portfolio: tool<ScrapePortfolioInput, ScrapePortfolioOutput>({
    description: 'Scrape portfolio details for additional context.',
    inputSchema: scrapePortfolioInputSchema,
    outputSchema: scrapePortfolioOutputSchema,
    execute: async () => ({ success: false, url: '' })
  }),
  search_exact: tool<SearchExactInput, SearchExactOutput>({
    description: 'Exact match retrieval across resume artifacts.',
    inputSchema: searchExactInputSchema,
    outputSchema: searchExactOutputSchema,
    execute: async () => ({
      query: '',
      scope: 'all',
      totalFound: 0,
      results: [],
      hasCitations: false,
      variantSearches: [],
      guidance: '',
    })
  }),
  search_semantic: tool<SearchSemanticInput, SearchSemanticOutput>({
    description: 'Semantic retrieval with verification.',
    inputSchema: searchSemanticInputSchema,
    outputSchema: searchSemanticOutputSchema,
    execute: async () => ({
      query: '',
      totalFound: 0,
      results: [],
      verification: {
        candidateQueries: [],
        attempts: [],
        verifiedResults: [],
        hasCitations: false,
      },
      guidance: '',
    })
  }),
  search_page_content: tool<SearchPageContentInput, SearchPageContentOutput>({
    description: 'Retrieve page content with line numbers.',
    inputSchema: searchPageContentInputSchema,
    outputSchema: searchPageContentOutputSchema,
    execute: async () => ({ success: false })
  }),
  fetch_resume_data: tool<FetchResumeDataInput, FetchResumeDataOutput>({
    description: 'Fetch structured resume data.',
    inputSchema: fetchResumeDataInputSchema,
    outputSchema: fetchResumeDataOutputSchema,
    execute: async () => ({
      title: '',
      projects: [],
    })
  }),
};

export type ResumeChatTools = InferUITools<typeof resumeChatToolSchemas> & {
  web_search?: UITool;
};

export type ResumeChatDataParts = {
  status: {
    message: string;
    tone: 'info' | 'success' | 'warning' | 'error';
    step?: string;
  };
  variant: {
    toolCallId: string;
    variants: Array<{ value: string; reason: string; totalFound: number }>;
  };
};

export type ResumeChatMetadata = {
  model?: string;
  totalTokens?: number;
  reasoningTokens?: number;
  responseId?: string;
  cachedPromptTokens?: number;
};

export type ResumeChatMessage = UIMessage<ResumeChatMetadata, ResumeChatDataParts, ResumeChatTools>;
