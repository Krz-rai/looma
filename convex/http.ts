import {
  convertToModelMessages,
  streamText,
  generateText,
  tool,
  stepCountIs,
  smoothStream,
  wrapLanguageModel,
  defaultSettingsMiddleware,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
} from "ai";
import type { ModelMessage, TextStreamPart, Tool } from "ai";
import { httpRouter } from "convex/server";
import { z } from "zod";
import { api } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import type { LanguageModelV2Middleware, LanguageModelV2StreamPart } from '@ai-sdk/provider';
import { createOpenAI } from '@ai-sdk/openai';
import { createCerebras } from '@ai-sdk/cerebras';
import { buildIdMapping } from "../lib/id-mapping";
import type { ResumeChatMessage, ResumeChatMetadata, ResumeChatDataParts } from "../types/resumeChat";
import {
  resumeWebSearchInputSchema,
  resumeWebSearchOutputSchema,
  scrapePortfolioInputSchema,
  scrapePortfolioOutputSchema,
  searchExactInputSchema,
  searchExactOutputSchema,
  searchSemanticInputSchema,
  searchSemanticOutputSchema,
  searchPageContentInputSchema,
  searchPageContentOutputSchema,
  fetchResumeDataInputSchema,
  fetchResumeDataOutputSchema,
  type ResumeWebSearchInput,
  type ResumeWebSearchOutput,
  type ScrapePortfolioInput,
  type ScrapePortfolioOutput,
  type SearchExactInput,
  type SearchExactOutput,
  type SearchSemanticInput,
  type SearchSemanticOutput,
  type SearchPageContentInput,
  type SearchPageContentOutput,
  type FetchResumeDataInput,
  type FetchResumeDataOutput,
} from "../types/resumeChat";

const http = httpRouter();

const CEREBRAS_RESUME_CHAT_MODEL_ID = 'qwen-3-coder-480b';
const OPENAI_RESUME_CHAT_MODEL_ID = 'gpt-5-mini';

let cerebrasProvider: ReturnType<typeof createCerebras> | null = null;
let openAIProvider: ReturnType<typeof createOpenAI> | null = null;

function getCerebrasProvider() {
  if (!cerebrasProvider) {
    const apiKey = process.env.CEREBRAS_API_KEY;
    if (!apiKey) {
      throw new Error('CEREBRAS_API_KEY is not set');
    }
    cerebrasProvider = createCerebras({ apiKey });
    debugLog('🔐 [MODEL] Initialized Cerebras provider for resume chat');
  }
  return cerebrasProvider;
}

// Simple in-memory cache with TTL
const responseCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Metrics tracking
const metrics = {
  totalRequests: 0,
  totalTokens: 0,
  cacheHits: 0,
  cacheMisses: 0,
  averageLatency: 0,
  requestLatencies: [] as number[],
};

const isProduction = process.env.NODE_ENV === 'production';
const debugLog = (...args: unknown[]) => {
  if (!isProduction) {
    console.log(...args);
  }
};
const debugWarn = (...args: unknown[]) => {
  if (!isProduction) {
    console.warn(...args);
  }
};

const MODEL_HISTORY_MESSAGE_LIMIT = 12;

const SANITIZED_PART_TYPES = new Set([
  'text',
  'input_text',
  'output_text',
  'file',
]);

type MessageForModel = Omit<ResumeChatMessage, 'id'>;

const MODEL_ALLOWED_CONTENT_TYPES = new Set([...SANITIZED_PART_TYPES, 'reasoning']);

const buildModelMessages = (messages: MessageForModel[]): ModelMessage[] => {
  const raw = convertToModelMessages(messages as unknown as ResumeChatMessage[]) as ModelMessage[];

  const sanitized: ModelMessage[] = [];

  for (const entry of raw as Array<Record<string, unknown>>) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const clone: Record<string, unknown> = { ...entry };

    if (Array.isArray(clone.content)) {
      const filteredContent = (clone.content as Array<Record<string, unknown>>).filter((part) => {
        if (!part || typeof part !== 'object') {
          return false;
        }
        const type = (part as { type?: unknown }).type;
        return typeof type === 'string' && MODEL_ALLOWED_CONTENT_TYPES.has(type);
      });

      if (filteredContent.length > 0) {
        clone.content = filteredContent;
      } else {
        delete clone.content;
      }
    }

    sanitized.push(clone as ModelMessage);
  }

  return sanitized;
};

const getPartType = (part: { type?: unknown }) => {
  if (!part || typeof part !== 'object') {
    return undefined;
  }
  const type = (part as { type?: unknown }).type;
  return typeof type === 'string' ? type : undefined;
};

const sanitizeMessageForModel = (message: ResumeChatMessage) => {
  const parts = Array.isArray(message.parts) ? message.parts : [];

  const hasText = parts.some(part => {
    const partType = getPartType(part as { type?: unknown });
    return partType === 'text' || partType === 'input_text' || partType === 'output_text';
  });
  if (!hasText) {
    return null;
  }

  const filteredParts: typeof parts = [];

  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    const partType = getPartType(part as { type?: unknown });
    if (!partType) {
      continue;
    }

    if (partType === 'reasoning') {
      const hasFollowingOutput = parts.slice(index + 1).some(candidate => {
        const candidateType = getPartType(candidate as { type?: unknown });
        return candidateType === 'output_text' || candidateType === 'text';
      });

      if (!hasFollowingOutput) {
        continue;
      }

      filteredParts.push(part);
      continue;
    }

    if (SANITIZED_PART_TYPES.has(partType)) {
      filteredParts.push(part);
    }
  }

  if (filteredParts.length === 0) {
    return null;
  }

  return {
    ...message,
    parts: filteredParts,
  } satisfies ResumeChatMessage;
};

const getRecentMessagesForModel = (
  messages: ResumeChatMessage[],
  limit: number = MODEL_HISTORY_MESSAGE_LIMIT,
) => {
  const recent = messages.slice(-limit);
  const result: ResumeChatMessage[] = [];

  for (const message of recent) {
    const sanitized = sanitizeMessageForModel(message);
    if (sanitized) {
      result.push(sanitized);
    }
  }

  if (result.length === 0 && messages.length > 0) {
    const fallback = sanitizeMessageForModel(messages[messages.length - 1]);
    if (fallback) {
      result.push(fallback);
    }
  }

  return result;
};

// Logging middleware - tracks all LLM interactions
const loggingMiddleware: LanguageModelV2Middleware = {
  wrapGenerate: async ({ doGenerate, params }) => {
    const startTime = Date.now();
    metrics.totalRequests++;

    debugLog('🔍 LLM Request:', {
      temperature: params.temperature,
      maxOutputTokens: params.maxOutputTokens,
      timestamp: new Date().toISOString(),
    });

    const result = await doGenerate();
    const latency = Date.now() - startTime;

    metrics.requestLatencies.push(latency);
    if (metrics.requestLatencies.length > 100) {
      metrics.requestLatencies.shift();
    }
    metrics.averageLatency = metrics.requestLatencies.reduce((a, b) => a + b, 0) / metrics.requestLatencies.length;

    if (result.usage) {
      const promptTokens = (result.usage as any).promptTokens || 0;
      const completionTokens = (result.usage as any).completionTokens || 0;
      metrics.totalTokens += promptTokens + completionTokens;
      debugLog('📊 Token usage:', {
        prompt: promptTokens,
        completion: completionTokens,
        total: promptTokens + completionTokens,
        latency: `${latency}ms`,
      });
    }

    return result;
  },

  wrapStream: async ({ doStream, params }) => {
    const startTime = Date.now();
    metrics.totalRequests++;

    debugLog('🔍 LLM Stream Request:', {
      temperature: params.temperature,
      timestamp: new Date().toISOString(),
    });

    const { stream, ...rest } = await doStream();
    let totalTokens = 0;

    const transformStream = new TransformStream<
      LanguageModelV2StreamPart,
      LanguageModelV2StreamPart
    >({
      transform(chunk, controller) {
        if ('usage' in chunk && chunk.usage) {
          const promptTokens = (chunk.usage as any).promptTokens || 0;
          const completionTokens = (chunk.usage as any).completionTokens || 0;
          totalTokens = promptTokens + completionTokens;
          metrics.totalTokens += totalTokens;
        }
        controller.enqueue(chunk);
      },

      flush() {
        const latency = Date.now() - startTime;
        metrics.requestLatencies.push(latency);
        if (metrics.requestLatencies.length > 100) {
          metrics.requestLatencies.shift();
        }
        metrics.averageLatency = metrics.requestLatencies.reduce((a, b) => a + b, 0) / metrics.requestLatencies.length;

        debugLog('📊 [MIDDLEWARE-LOG-STREAM] Stream completed:', {
          totalTokens,
          latency: `${latency}ms`,
          avgLatency: `${Math.round(metrics.averageLatency)}ms`,
        });
      },
    });

    return {
      stream: stream.pipeThrough(transformStream),
      ...rest,
    };
  },
};

// Caching middleware - caches responses for identical requests
const cachingMiddleware: LanguageModelV2Middleware = {
  wrapGenerate: async ({ doGenerate, params }) => {
    debugLog('🔄 [MIDDLEWARE-CACHE] Checking cache...');
    const cacheKey = JSON.stringify({
      prompt: params.prompt,
      temperature: params.temperature,
      maxOutputTokens: params.maxOutputTokens,
    });

    // Check cache
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      metrics.cacheHits++;
      debugLog('✅ [MIDDLEWARE-CACHE] Cache hit for request');
      return cached.data;
    }

    debugLog('❌ [MIDDLEWARE-CACHE] Cache miss, generating...');
    metrics.cacheMisses++;
    const result = await doGenerate();
    debugLog('✅ [MIDDLEWARE-CACHE] Generation complete');

    // Store in cache
    responseCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
    });

    // Clean up old cache entries
    for (const [key, value] of responseCache.entries()) {
      if (Date.now() - value.timestamp > CACHE_TTL) {
        responseCache.delete(key);
      }
    }

    return result;
  },
};

// Rate limiting middleware - prevents abuse
const rateLimitMiddleware: LanguageModelV2Middleware = {
  transformParams: async ({ params }) => {
    debugLog('🚦 [MIDDLEWARE-RATE] Checking rate limits...');
    // Simple rate limit check (you'd want a more sophisticated approach in production)
    if (metrics.totalRequests > 1000 && metrics.averageLatency < 100) {
      debugWarn('⚠️ [MIDDLEWARE-RATE] Rate limit warning: High request volume detected');
    }
    debugLog('✅ [MIDDLEWARE-RATE] Rate limit check passed');
    return params;
  },
};

// PII redaction middleware - removes sensitive information
const piiRedactionMiddleware: LanguageModelV2Middleware = {
  wrapGenerate: async ({ doGenerate }) => {
    const result = await doGenerate();

    // Process content array to redact PII
    if (result.content && Array.isArray(result.content)) {
      result.content = result.content.map(item => {
        if (item.type === 'text' && item.text) {
          return {
            ...item,
            text: item.text
              .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN-REDACTED]')
              .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL-REDACTED]')
              .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE-REDACTED]')
              .replace(/\b(?:\d{4}[-\s]?){3}\d{4}\b/g, '[CC-REDACTED]')
          };
        }
        return item;
      });
    }

    return result;
  },

  wrapStream: async ({ doStream }) => {
    debugLog('🌊 [MIDDLEWARE-PII] Starting stream wrapper...');
    const { stream, ...rest } = await doStream();

    const transformStream = new TransformStream<
      LanguageModelV2StreamPart,
      LanguageModelV2StreamPart
    >({
      transform(chunk, controller) {
        if (chunk.type === 'text-delta' && chunk.delta) {
          chunk.delta = chunk.delta
            .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN-REDACTED]')
            .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL-REDACTED]')
            .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE-REDACTED]')
            .replace(/\b(?:\d{4}[-\s]?){3}\d{4}\b/g, '[CC-REDACTED]');
        }
        controller.enqueue(chunk);
      },
    });

    debugLog('🌊 [MIDDLEWARE-PII] Stream wrapper configured');
    return {
      stream: stream.pipeThrough(transformStream),
      ...rest,
    };
  },
};


// Default settings middleware - applies consistent defaults
const defaultSettings = defaultSettingsMiddleware({
  settings: {
    maxOutputTokens: 50000,  // Reduced from 20000 to prevent token overuse
  },
});

// Combine all middleware
const allMiddleware = [
  defaultSettings,
  loggingMiddleware,
  cachingMiddleware,
  rateLimitMiddleware,
  piiRedactionMiddleware,
  // reasoningMiddleware removed - GPT-5 handles reasoning via providerOptions
];

// Shared smooth streaming transform for consistent UX across endpoints
// Apply word-based smoothing so responses stream at a conversational pace.
const smoothStreaming = smoothStream({
  chunking: 'word',
  delayInMs: 28,
});


// Helper function to create wrapped Cerebras model
function getOpenAIProvider() {
  if (!openAIProvider) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    openAIProvider = createOpenAI({ apiKey });
    debugLog('🔐 [MODEL] Initialized OpenAI provider for resume chat');
  }
  return openAIProvider;
}

function createWrappedCerebrasModel(
  cerebras: ReturnType<typeof createCerebras>,
  modelName: string = CEREBRAS_RESUME_CHAT_MODEL_ID
) {
  debugLog(`🚀 [MODEL] Creating wrapped Cerebras ${modelName} with middleware`);
  debugLog(`🔧 [MODEL] Middleware count: ${allMiddleware.length}`);
  debugLog(`🔧 [MODEL] Middleware names: defaultSettings, logging, caching, rateLimit, piiRedaction`);
  return wrapLanguageModel({
    model: cerebras(modelName),
    middleware: allMiddleware,
  });
}

// Helper function to create wrapped OpenAI model
function createWrappedOpenAIModel(openai: any, modelName: string = OPENAI_RESUME_CHAT_MODEL_ID) {
  debugLog(`🚀 [MODEL] Creating wrapped OpenAI ${modelName} with middleware`);
  debugLog(`🔧 [MODEL] Middleware count: ${allMiddleware.length}`);
  debugLog(`🔧 [MODEL] Middleware names: defaultSettings, logging, caching, rateLimit, piiRedaction`);
  return wrapLanguageModel({
    model: openai(modelName),
    middleware: allMiddleware,
  });
}

// Helper function to build ID mappings
// Resume chat endpoint with full citation support
http.route({
  path: "/api/resume-chat",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const { messages, resumeId, searchEnabled }: { messages: ResumeChatMessage[]; resumeId: Id<"resumes">; searchEnabled?: boolean } = await req.json();

    // Get resume data
    const resume = await ctx.runQuery(api.resumes.get, { id: resumeId });
    if (!resume) {
      throw new Error("Resume not found");
    }

    // Fetch GitHub data if available
    let githubUsername = null;

    if (resume.github) {
      const githubUrlMatch = resume.github.match(/(?:github\.com\/)?([a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38})\/?$/);
      if (githubUrlMatch) {
        githubUsername = githubUrlMatch[1];
        debugLog('📎 Extracted GitHub username:', githubUsername);
      }
    }


    // Get all projects and build complete data structure
    const projects = await ctx.runQuery(api.projects.list, { resumeId });
    const publicPages = await ctx.runQuery(api.dynamicFiles.listPublic, { resumeId });

    const projectsData = await Promise.all(projects.map(async (project: any) => {
      const bulletPoints = await ctx.runQuery(api.bulletPoints.list, {
        projectId: project._id
      });

      const bulletPointsWithBranches = await Promise.all(bulletPoints.map(async (bp: any) => {
        const branches = await ctx.runQuery(api.branches.list, {
          bulletPointId: bp._id
        });
        return {
          _id: bp._id,
          content: bp.content,
          position: bp.position,
          branches: branches.map((b: any) => ({
            _id: b._id,
            content: b.content,
          }))
        };
      }));

      let connectedPageInfo = null;
      if (project.connectedPageId) {
        const connectedPage = publicPages.find((p: any) => p._id === project.connectedPageId);
        if (connectedPage) {
          connectedPageInfo = {
            _id: connectedPage._id,
            title: connectedPage.title,
            isPublic: true
          };
        }
      }

      return {
        _id: project._id,
        title: project.title,
        description: project.description,
        position: project.position,
        hasConnectedPage: !!project.connectedPageId,
        connectedPageId: project.connectedPageId,
        connectedPageInfo,
        bulletPoints: bulletPointsWithBranches
      };
    }));

    // Build ID mappings
    const idMap = buildIdMapping({
      dynamicFiles: publicPages,
      projects: projectsData,
    });

    // Add simpleIds to the data structure
    const resumeData = {
      title: resume.title,
      description: resume.description,
      projects: projectsData.map((project: any) => {
        const projectSimpleId = idMap.forward[project._id];
        const bulletPointsWithIds = project.bulletPoints.map((bp: any) => {
          const bulletSimpleId = idMap.forward[bp._id];
          const branchesWithIds = bp.branches.map((branch: any) => ({
            ...branch,
            simpleId: idMap.forward[branch._id]
          }));
          return {
            ...bp,
            simpleId: bulletSimpleId,
            branches: branchesWithIds
          };
        });

        return {
          ...project,
          simpleId: projectSimpleId,
          connectedPageInfo: project.connectedPageInfo ? {
            ...project.connectedPageInfo,
            simpleId: idMap.forward[project.connectedPageInfo._id]
          } : null,
          bulletPoints: bulletPointsWithIds
        };
      })
    };

    const getSearchFlags = (scope: "all" | "pages" | "echoes" | "resume") => ({
      includePages: scope === "all" || scope === "pages",
      includeAudio: scope === "all" || scope === "echoes",
      includeResume: scope === "all" || scope === "resume",
    });

    const formatExactResults = (searchResult: any) => {
      return searchResult.results.map((result: any) => {
        if (result.type === 'page') {
          const pageSimpleId = idMap.forward[result.pageId] || result.pageId;
          return {
            type: 'page',
            pageTitle: result.pageTitle,
            pageId: pageSimpleId,
            lineNumber: result.lineNumber,
            matchedText: result.matchedText,
            context: result.context,
            citation: `[${result.pageTitle} L${result.lineNumber}]{${pageSimpleId}}`,
          };
        }

        if (result.type === 'echo') {
          const pageSimpleId = idMap.forward[result.pageId] || result.pageId;
          const pointNumber = result.globalPointNumber || 1;
          return {
            type: 'echo',
            fileName: result.displayName || result.fileName,
            pageTitle: result.pageTitle,
            timestamp: result.timestamp,
            matchedText: result.matchedText,
            citation: `[Echo P${pointNumber}]{${pageSimpleId}}`,
            note: `This is echo point ${pointNumber} from "${result.pageTitle}" page`,
          };
        }

        if (result.type === 'project') {
          const projectSimpleId = idMap.forward[result.projectId] || result.projectId;
          return {
            type: 'project',
            projectTitle: result.projectTitle,
            matchedText: result.matchedText,
            context: result.context,
            citation: `[${result.projectTitle}]{${projectSimpleId}}`,
          };
        }

        if (result.type === 'bullet') {
          const bulletSimpleId = idMap.forward[result.bulletId] || result.bulletId;
          return {
            type: 'bullet',
            projectTitle: result.projectTitle,
            matchedText: result.matchedText,
            context: result.context,
            citation: `[${result.projectTitle} - Bullet]{${bulletSimpleId}}`,
          };
        }

        if (result.type === 'branch') {
          const branchSimpleId = idMap.forward[result.branchId] || result.branchId;
          return {
            type: 'branch',
            projectTitle: result.projectTitle,
            matchedText: result.matchedText,
            context: result.context,
            citation: `[${result.projectTitle} - Branch]{${branchSimpleId}}`,
          };
        }

        return result;
      });
    };

  const buildSemanticCitation = (item: any) => {
      const simpleId = idMap.forward[item.sourceId] || item.sourceId;
      if (!simpleId) {
        return null;
      }

      if (item.sourceType === 'page') {
        return `[${item.metadata?.title || 'Page'}]{${simpleId}}`;
      }

      if (item.sourceType === 'project') {
        return `[${item.metadata?.title || 'Project'}]{${simpleId}}`;
      }

      if (item.sourceType === 'bullet_point') {
        return `[${item.metadata?.projectTitle || 'Project'} - Bullet]{${simpleId}}`;
      }

      if (item.sourceType === 'branch') {
        return `[${item.metadata?.projectTitle || 'Project'} - Branch]{${simpleId}}`;
      }

      return null;
  };

  const isTextUIPart = (part: unknown): part is { type: 'text'; text: string } => {
    return (
      !!part &&
      typeof part === 'object' &&
      (part as { type?: unknown }).type === 'text' &&
      typeof (part as { text?: unknown }).text === 'string'
    );
  };

  const STOP_WORDS = new Set([
      'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'than', 'that', 'this', 'those', 'these',
      'of', 'for', 'from', 'with', 'without', 'into', 'onto', 'about', 'around', 'through', 'over', 'under',
      'are', 'is', 'am', 'were', 'was', 'be', 'being', 'been', 'do', 'does', 'did', 'doing',
      'have', 'has', 'had', 'having', 'can', 'could', 'should', 'would', 'will', 'shall',
      'you', 'your', 'yours', 'me', 'my', 'mine', 'we', 'our', 'ours', 'they', 'their', 'theirs',
      'i', 'he', 'she', 'it', 'who', 'whom', 'what', 'when', 'where', 'why', 'how', 'which',
      'please', 'let', 'know', 'tell', 'show', 'give', 'provide', 'help', 'need', 'want', 'like'
    ]);

    const TOKEN_SYNONYMS: Record<string, string[]> = {
      dramatic: ['overdramatic', 'melodramatic', 'theatrical'],
      overdramatic: ['dramatic', 'melodramatic'],
      emotional: ['expressive', 'passionate'],
      calm: ['composed'],
      reliable: ['dependable', 'trustworthy'],
      leader: ['leadership', 'lead'],
      collaborative: ['teamwork', 'team-oriented'],
      communicative: ['communicative', 'clear communicator'],
    };

    const stripPunctuation = (value: string) => value.replace(/[.,/#!$%^&*;:{}=\-_`~()"“”‘’¿¡?]/g, ' ').replace(/\s+/g, ' ').trim();

    const deriveTokenVariants = (token: string) => {
      const variants = new Set<string>();
      variants.add(token);

      const prefixes = ['over', 'hyper', 'super', 'mega', 'ultra', 'melod'];
      const suffixes = ['ness', 'ing', 'ed', 'ly', 'ity', 'ally', 'ies', 's', 'es'];

      prefixes.forEach((prefix) => {
        if (token.startsWith(prefix) && token.length - prefix.length >= 4) {
          variants.add(token.slice(prefix.length));
        }
      });

      suffixes.forEach((suffix) => {
        if (token.endsWith(suffix) && token.length - suffix.length >= 3) {
          variants.add(token.slice(0, token.length - suffix.length));
        }
      });

      if (TOKEN_SYNONYMS[token]) {
        TOKEN_SYNONYMS[token].forEach((syn) => variants.add(syn));
      }

      return Array.from(variants).filter((variant) => variant.length >= 3);
    };

    const buildExactSearchVariants = (rawQuery: string) => {
      const variants = new Map<string, { value: string; reason: string }>();
      const addVariant = (value: string, reason: string) => {
        const normalized = value.trim();
        if (!normalized || normalized.length < 3) return;
        const key = normalized.toLowerCase();
        if (!variants.has(key)) {
          variants.set(key, { value: normalized, reason });
        }
      };

      const trimmed = rawQuery.trim();
      if (!trimmed) return [] as Array<{ value: string; reason: string }>;

      addVariant(trimmed, 'original');

      const withoutTrailingPunctuation = trimmed.replace(/[?!.]+$/g, '').trim();
      if (withoutTrailingPunctuation !== trimmed) {
        addVariant(withoutTrailingPunctuation, 'normalized');
      }

      const punctuationStripped = stripPunctuation(trimmed);
      if (punctuationStripped && punctuationStripped !== trimmed) {
        addVariant(punctuationStripped, 'normalized');
      }

      const tokens = (stripPunctuation(trimmed).toLowerCase().match(/[\w']+/g) || [])
        .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));

      const rankedTokens = Array.from(new Set(tokens)).sort((a, b) => b.length - a.length).slice(0, 3);

      rankedTokens.forEach((token) => {
        deriveTokenVariants(token).slice(0, 3).forEach((variantToken) => {
          addVariant(variantToken, variantToken === token ? 'keyword' : 'variant');
        });
      });

      return Array.from(variants.values()).slice(0, 8);
    };

    const runExactSearch = async ({
      query,
      searchIn = "all",
      limit = 5,
    }: {
      query: string;
      searchIn?: "all" | "pages" | "echoes" | "resume";
      limit?: number;
    }) => {
      const flags = getSearchFlags(searchIn);
      const variants = buildExactSearchVariants(query);

      debugLog(`🔎 [RETRIEVAL] Exact search variants:`, variants);

      const aggregatedResultsMap = new Map<string, any>();
      const variantSummaries: Array<{ value: string; reason: string; totalFound: number }> = [];

      for (const variant of variants) {
        try {
          const searchResult = await ctx.runQuery(api.contentSearch.searchContent, {
            resumeId,
            searchQuery: variant.value,
            ...flags,
            limit,
          });

          const formattedResults = formatExactResults(searchResult).map((result: any) => ({
            ...result,
            variantUsed: variant.value,
            variantReason: variant.reason,
          }));

          formattedResults.forEach((result: any) => {
            const key = JSON.stringify([
              result.type,
              result.citation,
              result.pageId,
              result.lineNumber,
              result.matchedText,
            ]);
            if (!aggregatedResultsMap.has(key)) {
              aggregatedResultsMap.set(key, result);
            }
          });

          variantSummaries.push({ value: variant.value, reason: variant.reason, totalFound: searchResult.totalFound });

          if (aggregatedResultsMap.size >= limit) {
            break;
          }
        } catch (error) {
          console.error('❌ [RETRIEVAL] Exact search variant error:', error);
        }
      }

      const combinedResults = Array.from(aggregatedResultsMap.values()).slice(0, limit);
      const successfulVariants = variantSummaries.filter((summary) => summary.totalFound > 0);

      let guidance = 'No exact matches found. Call search_semantic for related phrasing, then rerun search_exact with any suggested terms before answering.';
      if (combinedResults.length > 0) {
        const fallbackVariants = successfulVariants.filter((summary) => summary.reason !== 'original');
        guidance = fallbackVariants.length > 0
          ? `Exact matches located via fallback terms (${fallbackVariants.map((summary) => `"${summary.value}"`).join(', ')}). Cite directly from the returned snippets.`
          : 'Exact matches located. Cite directly from the returned snippets.';
      }

      return {
        query,
        scope: searchIn,
        totalFound: combinedResults.length,
        results: combinedResults,
        hasCitations: combinedResults.length > 0,
        variantSearches: variantSummaries,
        guidance,
      };
    };

    const ALL_KNOWLEDGE_SOURCE_TYPES = [
      'resume',
      'project',
      'bullet_point',
      'branch',
      'page',
      'audio_summary',
    ] as const;

    const runSemanticSearch = async ({
      query,
      limit = 8,
      minScore = 0.05,
    }: {
      query: string;
      limit?: number;
      minScore?: number;
    }) => {
      debugLog(`🧠 [RETRIEVAL] Semantic search: "${query}" (limit=${limit}, minScore=${minScore})`);
      const semanticResult = await ctx.runAction((api as any).semanticSearch.searchKnowledgeAdvanced, {
        query,
        resumeId,
        limit,
        minScore,
        sourceTypes: ALL_KNOWLEDGE_SOURCE_TYPES.slice(),
      });

      const mappedResults = semanticResult.results.map((item: any) => ({
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        text: item.text,
        score: Math.round(item.score * 100) / 100,
        chunkIndex: item.chunkIndex,
        metadata: item.metadata,
        citation: buildSemanticCitation(item),
      }));

      const candidateQueries = new Set<string>();
      const addCandidate = (value?: string | null) => {
        if (!value) return;
        let trimmed = value.trim();
        if (trimmed.length < 3) return;
        if (trimmed.length > 120) {
          trimmed = trimmed.slice(0, 120);
        }
        if (trimmed.split(/\s+/).length > 12) {
          trimmed = trimmed.split(/\s+/).slice(0, 12).join(' ');
        }
        candidateQueries.add(trimmed);
      };

      mappedResults.forEach((item: any) => {
        addCandidate(item.metadata?.title);
        addCandidate(item.metadata?.projectTitle);
        addCandidate(item.metadata?.content);
        addCandidate((item.metadata as any)?.bulletContent);
        addCandidate(item.text);
      });

      const verificationQueries = Array.from(candidateQueries)
        .filter((value) => value.toLowerCase() !== query.trim().toLowerCase())
        .slice(0, 3);

      const aggregatedResultsMap = new Map<string, any>();
      const verificationAttempts: Array<Awaited<ReturnType<typeof runExactSearch>>> = [];

      for (const phrase of verificationQueries) {
        try {
          const verification = await runExactSearch({ query: phrase, searchIn: 'all', limit: 5 });
          verificationAttempts.push(verification);
          verification.results.forEach((result: any) => {
            const key = JSON.stringify([
              result.type,
              result.citation,
              result.pageId,
              result.lineNumber,
              result.matchedText,
            ]);
            if (!aggregatedResultsMap.has(key)) {
              aggregatedResultsMap.set(key, result);
            }
          });
        } catch (error) {
          console.error('❌ [RETRIEVAL] Semantic verification error:', error);
        }
      }

      const verifiedResults = Array.from(aggregatedResultsMap.values());
      const hasVerifiedCitations = verifiedResults.length > 0;

      return {
        query,
        totalFound: semanticResult.totalResults,
        filteredByScore: semanticResult.filteredByScore,
        filteredByType: semanticResult.filteredByType,
        results: mappedResults,
        verification: {
          candidateQueries: verificationQueries,
          attempts: verificationAttempts,
          verifiedResults,
          hasCitations: hasVerifiedCitations,
        },
        timings: {
          embeddingMs: semanticResult.queryEmbeddingTime,
          searchMs: semanticResult.searchTime,
        },
        guidance: hasVerifiedCitations
          ? 'Use verification.verifiedResults for citations. If more coverage is needed, run search_exact with additional candidateQueries.'
          : verificationQueries.length > 0
            ? 'Semantic matches exist but exact verification is empty. Retry search_exact with each candidateQueries item before concluding no evidence exists.'
            : 'No strong semantic matches found; acknowledge lack of supporting evidence.',
      };
    };

    const extractTextFromMessage = (message: ResumeChatMessage): string => {
      const parts = message.parts as Array<{ type: string; text?: string }> | undefined;
      if (Array.isArray(parts)) {
        return parts
          .filter((part) => part.type === 'text' && typeof part.text === 'string')
          .map((part) => part.text as string)
          .join('');
      }
      return '';
    };

    // Remove large resume context from system prompt - now fetched via tools

    // Build conversation history - REDUCED to last 3 messages only
    const conversationContext = messages.slice(-3).map((msg: any) => {
      const content = typeof msg.content === 'string' ? msg.content :
                      Array.isArray(msg.content) ? msg.content.map((c: any) => c.text || '').join('') : '';
      // Truncate long messages to save tokens
      const truncated = content.length > 200 ? content.substring(0, 200) + '...' : content;
      return `${msg.role}: ${truncated}`;
    }).join('\n');

    // OPTIMIZED system prompt - structured for AI clarity
    // Include full resume data (projects, bullets, branches) inline per request.
    const fullResumeJson = JSON.stringify(resumeData);
    const systemPrompt = `You are ${resume.name || resumeData.title}'s second mind. You speak as the candidate in first person.
You are an **evidence-first digital twin** speaking to hiring managers on my behalf.

## Role & Scope
- **Act as me**. Use only what’s in my resume, projects, portfolio, documentation, and recorded echoes/transcripts.
- **Decline** unrelated requests unless it’s a **medical or emergency situation**.
- **Truth over polish**: Never fabricate facts, dates, metrics, affiliations, or outcomes.

## What To Use (Data Boundaries)
- Resume bullets, project writeups, portfolio entries, public documentation I’ve authored, and my echo/transcript materials.
- Public web only when explicitly asked for **market context** or **public mentions**, and never to invent resume facts.
- Privacy: Do not disclose PII (emails, phone, addresses) unless it appears in my materials and is context-appropriate.

---

## Instructions (Retrieval is Recommended, Not Forced)
- **When the hiring manager asks anything professional or personal about me** (experience, results, tools, dates, education, awards, locations, availability, preferences, compensation, background, personality), **use retrieval tools first** to ground your answer in evidence and provide inline citations.
- For **generic etiquette/logistics** (meeting times, greeting, “thanks”), you may respond without retrieval as long as you **make no new factual claims** about me.
- **Normalize queries** before searching: fix typos, pluralization, synonyms.
- **Pronoun resolution**: “I/me/my” = the candidate (me). “You” = the recruiter/hiring manager.
- **Sensitive traits** (personality/health): only use my **explicit self-described statements**; never infer.

---

## Default Retrieval Flow (When Retrieval Is Needed)
1. Start with \`search_semantic\` to find conceptually relevant content and harvest better search terms.
2. Use \`search_exact\` with the candidate terms from semantic search for citation-ready quotes.
3. If needed, try \`search_exact\` with the recruiter's original phrasing as backup.
4. If deeper context is needed, use \`search_page_content\` to read the full page.
5. **Always cite**: every factual claim about me must include an immediate inline citation.

> Hide orchestration chatter (e.g., “Searching…”). The final answer must be clean.

---

## MY DATA SOURCES
- My Projects: ${resumeData.projects.length} total  
- My Portfolio: ${resume.portfolio ? 'Available' : 'None'}  
- My Documentation: ${publicPages.length} pages available  

### FULL_RESUME_DATA_JSON
${fullResumeJson}

---

## TOOL_SELECTION (Use when relevant; do not over-call)
- Query involves *my projects* or *my experience* → \`fetch_resume_data\`
- Need exact wording or citation-ready snippets → \`search_exact\` (choose scope: all/pages/echoes/resume)
- Need related phrasing or conceptual matches → \`search_semantic\`
- Query involves *my portfolio* → \`scrape_portfolio\`
- Query involves *specific page content* → \`search_page_content\`
- Need curated public mentions about me → \`resume_web_search\`
- Need real-time public context or market insight → \`web_search\` (OpenAI native)
- Need Python-based analysis or data reshaping → \`code_interpreter\` (OpenAI native)
- Otherwise → \`fetch_resume_data\`

### OPENAI TOOL USAGE NOTES
- Summarize \`code_interpreter\` outputs in plain language and cite resume evidence if referenced.  
- Cite \`web_search\` outputs with **[Web: domain]{web}**; never treat them as resume facts without cross-verification.

---

## RETRIEVAL STRATEGY (Semantic-First Approach)
1. Start with \`search_semantic\` to discover conceptually relevant content and better search terms.
2. Use \`search_exact\` with the candidate terms from semantic search for citation-ready quotes.
3. If needed, try \`search_exact\` with original user phrasing as backup.
4. When deeper context is required, use \`search_page_content\` to read the full page.
5. **ALWAYS CITE** → Every claim about me must include a proper citation in \`{PG#}\` format with line numbers.

### SEMANTIC-FIRST WORKFLOW (Example)
1. \`search_semantic("speaking skills")\` → reveals "communication", "accent", "presentations".
2. \`search_exact("communication accent")\` → finds citation-ready bullet.
3. Response: *"I acknowledge my accent while emphasizing clear communication {A1}."*

---

## CITATION RULES
- **Placement**: Inline with the claim, same line (no standalone lines)  
- **Strict formats**:  
  - Projects → [Project:"title"]{P#}  
  - Resume bullets → [Bullet:"brief text"]{B#}  
  - Branches → [Branch:"brief text"]{BR#}  
  - Page content → [PageTitle L#]{PG#}  
  - Echo points → [Echo P#]{PG#}  
  - Portfolio → [Portfolio:"context"]{portfolio}  
  - Web → [Web: domain]{web}  
- Audio transcripts and echo summaries are **first-class evidence**. Cite them exactly like text using [Echo P#]{PG#}.  
- **Wrong** ❌: “in the Mobile Banking App project” (no citation)  
- **Right** ✅: “mentioned in [Mobile Banking App]{P3}”  

---

## Answer Structure Template (Use as appropriate)
- **Direct Q&A** (short facts): 1–3 crisp sentences, each with inline citations.
- **Experience/“Tell me about…”**: Use mini-STAR (Situation/Task, Action, Result), include **measurable outcomes** and **tools**, each supported by citations.
- **Role Fit/Why Us**: 2–3 bullets mapping my proven skills/results to the JD’s must-haves, each bullet cited.
- **Portfolio/Code Walkthrough**: Brief overview + 1–2 specific, high-impact details (metrics, scalability, security, UX), with citations.
- **Trade-offs/Design Decisions**: List 2–3 trade-offs I actually made, with citations to the relevant project or doc.

---

## Response Requirements
- **Markdown** formatting:
  - Headers (#, ##, ###), **bold**, *italics*, lists, code fences, blockquotes, tables, task lists, math ($…$).
- **Conversational first person**: speak as me; professional, succinct, confident, warm.
- **Specific & measurable**: prefer quantified outcomes, exact titles, date ranges, repos, environments—**always cited**.
- **Stay authentic**: if evidence is thin, say so plainly; don’t extrapolate.


## Hiring-Manager Scenarios (Quick Playbook)
- **“Walk me through X project.”** → Mini-STAR with 1–2 metrics, tools, decisions, and my role scope. Cite every fact.
- **“What impact did you have?”** → Lead with the outcome metric(s), then how I achieved them. Cite both.
- **“Tech stack / Why those tools?”** → Name stack components, constraints, and 1–2 trade-offs. Cite project docs/bullets.
- **“Largest challenge / failure / conflict.”** → One concrete incident + resolution + learning + follow-on improvement. Cite.
- **“Availability, location, work auth, comp.”** → Only answer from evidence. If absent, say it’s not in my materials.
- **“Write code now / solve live unrelated task.”** → If outside my materials, explain this interface is for **background on my experience**; share cited portfolio/code links instead, or propose an offline exercise.

---

## Error Handling
- If no evidence found → “I don’t have specific information about that in my materials.” (Offer nearest related, clearly labeled.)
- If uncertain → Acknowledge uncertainty and specify what evidence would resolve it.
- If conflicting info → Reconcile if possible; otherwise name the discrepancy and cite both sources.

---

## Output Guidelines
- **Natural flow**: Answer the question directly; avoid rigid boilerplate.
- **Cite as you go**: \`[Project:"name"]{P#}\`, \`[Bullet:"text"]{B#}\`, etc., on the same line as the claim.
- **No separate ‘Sources’ section**; all citations are inline.
- **No orchestration chatter**; keep tool usage invisible.



    ${conversationContext || 'No previous conversation'}`;
    const lastMessages = getRecentMessagesForModel(messages);

    // Use OpenAI GPT-5 for candidate-first responses with full tool support
    const openai = getOpenAIProvider();
    const model = createWrappedOpenAIModel(openai, OPENAI_RESUME_CHAT_MODEL_ID);
    debugLog(`⚡ Using OpenAI model ${OPENAI_RESUME_CHAT_MODEL_ID} for resume chat`);
    const selectedModelName = OPENAI_RESUME_CHAT_MODEL_ID;

    const openAIToolkit = (openai as any).tools;
    if (!openAIToolkit) {
      throw new Error('OpenAI tools interface is unavailable. Update @ai-sdk/openai to a version that supports native tools.');
    }
    const tools: Record<string, Tool<any, any>> = {};
    let streamStatusEmitter: ((
      step: string,
      message: string,
      tone: ResumeChatDataParts['status']['tone'],
    ) => void) | null = null;

    const enableSearchTools = searchEnabled !== false;

    if (process.env.OPENAI_ENABLE_CODE_INTERPRETER !== 'false') {
      const containerId = process.env.OPENAI_CODE_INTERPRETER_CONTAINER_ID;
      tools.code_interpreter = openAIToolkit.codeInterpreter(
        containerId ? { container: containerId } : undefined,
      );
    }

    if (enableSearchTools && process.env.OPENAI_ENABLE_WEB_SEARCH !== 'false') {
      tools.web_search = openAIToolkit.webSearch({
        searchContextSize: 'high',
        userLocation: process.env.OPENAI_WEB_SEARCH_CITY
          ? {
              type: 'approximate',
              city: process.env.OPENAI_WEB_SEARCH_CITY,
              region: process.env.OPENAI_WEB_SEARCH_REGION,
              country: process.env.OPENAI_WEB_SEARCH_COUNTRY,
              timezone: process.env.OPENAI_WEB_SEARCH_TIMEZONE,
            }
          : undefined,
      });
    }

    // Estimate input tokens before sending
    const inputTokenEstimate = Math.ceil((systemPrompt.length +
      lastMessages.reduce((acc, msg) => {
        const textContent = msg.parts?.reduce((text, part) => {
          if ('text' in part && typeof part.text === 'string') {
            return text + part.text;
          }
          return text;
        }, '') || '';
        return acc + textContent.length;
      }, 0)) / 4); // Rough estimate: ~4 characters per token

    debugLog(`📊 Input token estimate: ~${inputTokenEstimate} tokens`);

    // Try enabling tools for reasoning model - GPT-5 handles multi-step tool calls well
    // Previously disabled due to streaming incompatibility
    const shouldDisableTools = false; // Always allow tools now

    if (shouldDisableTools) {
      debugLog('⚠️ Disabling tools for thinking model (streaming incompatibility)');
    }

    debugLog(`🛠️ Tools enabled: searchEnabled=${searchEnabled}, shouldDisableTools=${shouldDisableTools}`);

    if (searchEnabled !== false && !shouldDisableTools) {
      // Add web search tool using the action
      tools.resume_web_search = tool<ResumeWebSearchInput, ResumeWebSearchOutput>({
        description: "Search the web for current information, news, and real-time data",
        inputSchema: resumeWebSearchInputSchema,
        outputSchema: resumeWebSearchOutputSchema,
        providerOptions: {
          openai: {
            metadata: {
              tool: 'resume_web_search',
            },
          },
        },
        execute: async ({ query, maxResults = 3 }) => {
          streamStatusEmitter?.(
            'web_search',
            `Searching curated web sources for "${query}"…`,
            'info',
          );
          const result = await ctx.runAction(api.webSearch.search, {
            query,
            maxResults,
          });
          const tone: ResumeChatDataParts['status']['tone'] = result?.success ? 'success' : 'warning';
          streamStatusEmitter?.(
            'web_search',
            result?.success
              ? `Web search returned ${result.results?.length ?? 0} result(s)`
              : 'Web search did not return usable results',
            tone,
          );
          return result as ResumeWebSearchOutput;
        },
      });

      // Add portfolio scraping tool using Firecrawl
      tools.scrape_portfolio = tool<ScrapePortfolioInput, ScrapePortfolioOutput>({
        description: "ALWAYS use this to fetch portfolio website content when asked about portfolio or when portfolio URL is mentioned. Scrapes portfolio websites to extract projects, skills, and detailed information.",
        inputSchema: scrapePortfolioInputSchema,
        outputSchema: scrapePortfolioOutputSchema,
        providerOptions: {
          openai: {
            metadata: {
              tool: 'scrape_portfolio',
            },
          },
        },
        execute: async ({ url }) => {
          debugLog("🔥 Scraping portfolio:", url);
          streamStatusEmitter?.('portfolio', `Scraping portfolio at ${url}`, 'info');

          // Call the Firecrawl action with summary format only
          const result = await ctx.runAction(api.firecrawl.scrapePortfolio, {
            url,
            formats: ['summary'],
          });

          if (result.success) {
            debugLog(`✅ Successfully scraped: ${result.title}`);
            streamStatusEmitter?.('portfolio', 'Portfolio content captured', 'success');
          } else {
            debugLog(`❌ Failed to scrape: ${result.error}`);
            streamStatusEmitter?.('portfolio', 'Portfolio scrape failed', 'warning');
          }

          return result as ScrapePortfolioOutput;
        },
      });


      tools.search_exact = tool<SearchExactInput, SearchExactOutput>({
        description: "Find direct, citation-ready matches across resume projects, bullets, branches, public pages, and echoes.",
        inputSchema: searchExactInputSchema,
        outputSchema: searchExactOutputSchema,
        providerOptions: {
          openai: {
            metadata: {
              tool: 'search_exact',
            },
            parallelToolCalls: false,
          },
        },
        execute: async ({ query, searchIn = "all", limit = 5 }) => {
          streamStatusEmitter?.(
            'search_exact',
            `Searching for "${query}" in ${searchIn} scope…`,
            'info',
          );
          const result = await runExactSearch({ query, searchIn, limit });
          const tone: ResumeChatDataParts['status']['tone'] = result.totalFound > 0 ? 'success' : 'warning';
          streamStatusEmitter?.(
            'search_exact',
            result.totalFound > 0
              ? `Found ${result.totalFound} exact match${result.totalFound === 1 ? '' : 'es'}`
              : `No exact matches for "${query}"`,
            tone,
          );
          return result as SearchExactOutput;
        },
      });

      tools.search_semantic = tool<SearchSemanticInput, SearchSemanticOutput>({
        description: "Surface semantically-related evidence when wording differs and receive candidate phrases to re-run search_exact for verified citations.",
        inputSchema: searchSemanticInputSchema,
        outputSchema: searchSemanticOutputSchema,
        providerOptions: {
          openai: {
            metadata: {
              tool: 'search_semantic',
            },
          },
        },
        execute: async ({ query, limit = 8, minScore = 0.15 }) => {
          streamStatusEmitter?.(
            'search_semantic',
            `Exploring semantic evidence for "${query}"…`,
            'info',
          );
          const result = await runSemanticSearch({
            query,
            limit,
            minScore,
          });
          const hitCount = result.results.length;
          streamStatusEmitter?.(
            'search_semantic',
            hitCount > 0
              ? `Semantic search surfaced ${hitCount} candidate${hitCount === 1 ? '' : 's'}`
              : 'No semantic evidence surfaced',
            hitCount > 0 ? 'success' : 'warning',
          );
          return result as SearchSemanticOutput;
        },
      });
      tools.search_page_content = tool<SearchPageContentInput, SearchPageContentOutput>({
        description: "Search and retrieve content from a public documentation page by title or ID. Use this when you need detailed information about a project.",
        inputSchema: searchPageContentInputSchema,
        outputSchema: searchPageContentOutputSchema,
        providerOptions: {
          openai: {
            metadata: {
              tool: 'search_page_content',
            },
            parallelToolCalls: false,
          },
        },
        execute: async ({ pageQuery }: { pageQuery: string }) => {
          debugLog("📚 Searching for page:", pageQuery);
          streamStatusEmitter?.('page_lookup', `Loading page "${pageQuery}"…`, 'info');

          const pageResult = await ctx.runQuery(api.dynamicFiles.getPublicPageContent, {
            resumeId,
            pageQuery: pageQuery || ""
          });

          if (pageResult.success && pageResult.page) {
            // Parse BlockNote content to readable text
            let pageContentText = '';
            try {
              const content = pageResult.page.content;
              if (Array.isArray(content)) {
                pageContentText = content.map((block: any) => {
                  if (block.content && Array.isArray(block.content)) {
                    return block.content.map((item: any) => {
                      if (typeof item === 'string') return item;
                      if (item.text) return item.text;
                      return '';
                    }).join('');
                  }
                  return '';
                }).filter(Boolean).join('\n');
              } else if (typeof content === 'string') {
                pageContentText = content;
              }
            } catch (e) {
              pageContentText = 'Unable to parse page content';
            }

            // Add line numbers to content for precise citations
            const lines = (pageContentText || 'No content available').split('\n');
            const numberedContent = lines.map((line, i) =>
              `[L${i+1}] ${line}`
            ).join('\n');

            // Get echo info from the page if available
            let audioInfo = '';
            if (pageResult.page.transcriptions && pageResult.page.transcriptions.length > 0) {
              const pageSimpleId = idMap.forward[pageResult.page.id] || pageResult.page.id;
              audioInfo = '\n\nECHOES IN THIS PAGE:\n';
              pageResult.page.transcriptions.forEach((t: any) => {
                audioInfo += `- "${t.displayName || t.fileName}" - Duration: ${t.duration ? Math.round(t.duration) + 's' : 'unknown'}\n`;
              });
              audioInfo += '\nNote: Echoes are included in the page content above. Look for [Echo P#] markers to cite them.\n';
              audioInfo += 'Use format: [Echo P#]{' + pageSimpleId + '} where P# matches the echo point number.\n';
            }

            const responseObject = {
              success: true,
              pageTitle: pageResult.page.title,
              pageId: idMap.forward[pageResult.page.id] || pageResult.page.id,
              content: numberedContent + audioInfo
            };
            debugLog('✅ Found page:', pageResult.page.title);
            streamStatusEmitter?.('page_lookup', `Loaded page "${pageResult.page.title}"`, 'success');
            return responseObject as SearchPageContentOutput;
          } else {
            const responseObject = {
              success: false,
              error: pageResult.error || "Page not found",
              availablePages: pageResult.availablePages || []
            };
            debugLog('❌ Page not found:', pageQuery);
            streamStatusEmitter?.('page_lookup', `No public page matched "${pageQuery}"`, 'warning');
            return responseObject as SearchPageContentOutput;
          }
        },
      });

      // Add tool to fetch resume data on demand instead of embedding it all in context
      tools.fetch_resume_data = tool<FetchResumeDataInput, FetchResumeDataOutput>({
        description: "Get resume projects and structure. USE THIS FIRST for project questions.",
        inputSchema: fetchResumeDataInputSchema,
        outputSchema: fetchResumeDataOutputSchema,
        providerOptions: {
          openai: {
            metadata: {
              tool: 'fetch_resume_data',
            },
          },
        },
        execute: async ({ dataType = "full" }) => {
          debugLog(`📄 [TOOL] Fetching resume data: ${dataType}`);
          streamStatusEmitter?.('resume_data', `Fetching resume ${dataType} view`, 'info');

          if (dataType === "overview") {
            streamStatusEmitter?.('resume_data', 'Resume overview ready', 'success');
            return {
              title: resumeData.title,
              description: resumeData.description,
              projects: resumeData.projects,
              projectCount: resumeData.projects.length,
              projectTitles: resumeData.projects.map((p: any) => `${p.title} (${p.simpleId})`),
            } as FetchResumeDataOutput;
          }

          if (dataType === "projects") {
            streamStatusEmitter?.('resume_data', 'Project index ready', 'success');
            return {
              title: resumeData.title,
              description: resumeData.description,
              projects: resumeData.projects.map((p: any) => ({
                title: p.title,
                simpleId: p.simpleId,
                description: p.description,
                bulletCount: p.bulletPoints.length,
                connectedPage: p.connectedPageInfo?.title,
              })),
            } as FetchResumeDataOutput;
          }

          // Full data
          streamStatusEmitter?.('resume_data', 'Full resume payload ready', 'success');
          return resumeData as FetchResumeDataOutput;
        },
      });
    }

    debugLog(`📋 Total tools available: ${Object.keys(tools).length} - ${Object.keys(tools).join(', ')}`);

    let augmentedMessages: ResumeChatMessage[] = [...lastMessages];

    // Retrieval context is now fetched on-demand by tools; no automatic pre-attachment.

    if (searchEnabled !== false && !shouldDisableTools) {
      const lastUserMessage = [...lastMessages].reverse().find((msg) => msg.role === 'user');
      const lastUserTextPart = lastUserMessage?.parts?.find(isTextUIPart);
      const lastUserTextValue = lastUserTextPart?.text.trim();

      if (lastUserMessage && lastUserTextValue && lastUserTextValue.length > 0) {
        const reminderText = 'Reminder: Before responding, start with "search_semantic" using the user\'s newest phrasing to discover relevant content. Then call "search_exact" with the candidate terms from semantic search for citation-ready quotes. Only skip these tools if you have already surfaced the exact cited evidence in this conversation.';

        augmentedMessages = [
          ...augmentedMessages,
          {
            id: `tool-reminder-${Date.now()}`,
            role: 'system',
            parts: [
              {
                type: 'text',
                text: reminderText,
              },
            ],
          } as ResumeChatMessage,
        ];
      }
    }

    debugLog(`🎯 [STREAM] Starting streamText with ${Object.keys(tools).length} tools available`);
    debugLog(`🛠️ [STREAM] Tool names: ${Object.keys(tools).join(', ')}`);
    debugLog(`📝 [STREAM] Last message role:`, lastMessages[lastMessages.length - 1]?.role);
    debugLog(`📝 [STREAM] Last message content:`, JSON.stringify(lastMessages[lastMessages.length - 1]?.parts).slice(0, 200));

    const openAIProviderOptions: Record<string, any> = {
      parallelToolCalls: true,
      reasoningSummary: 'auto',
      reasoningEffort: 'low',
      textVerbosity: 'medium',
      maxToolCalls: Number(process.env.OPENAI_MAX_TOOL_CALLS || 24),
    };

    const reasoningEffort = process.env.OPENAI_REASONING_EFFORT as
      | 'minimal'
      | 'low'
      | 'medium'
      | 'high'
      | undefined;
    if (reasoningEffort) {
      openAIProviderOptions.reasoningEffort = reasoningEffort;
    }

    const serviceTier = process.env.OPENAI_SERVICE_TIER as 'auto' | 'flex' | 'priority' | undefined;
    if (serviceTier) {
      openAIProviderOptions.serviceTier = serviceTier;
    }

    if (process.env.OPENAI_STORE_RESPONSES === 'false') {
      openAIProviderOptions.store = false;
    }

    if (openAIProviderOptions.store === false) {
      const include = new Set<string>(openAIProviderOptions.include ?? []);
      include.add('reasoning.encrypted_content');
      openAIProviderOptions.include = Array.from(include);
    }

    const providerOptions = { openai: openAIProviderOptions };

    const messageMetadata = ({ part }: { part: TextStreamPart<any> }) => {
      if (part.type === 'start') {
        return {
          model: selectedModelName,
        } satisfies ResumeChatMetadata;
      }

      if (part.type === 'finish') {
        const finishPart = part as any;
        const totalTokens = finishPart.totalUsage?.totalTokens;
        const reasoningTokens = finishPart.totalUsage?.reasoningTokens;
        const cachedPromptTokens = finishPart.totalUsage?.cachedInputTokens;
        const modelId = finishPart.response?.modelId ?? selectedModelName;
        return {
          model: modelId,
          totalTokens,
          reasoningTokens,
          cachedPromptTokens,
        } satisfies ResumeChatMetadata;
      }

      return undefined;
    };

    const messagesForModel: MessageForModel[] = augmentedMessages.map(({ id: _id, ...rest }) => rest);

    const stream = createUIMessageStream<ResumeChatMessage>({
      originalMessages: messages,
      async execute({ writer }) {
        const statusPartIds = new Map<string, string>();
        const ensureStatusPartId = (step: string) => {
          if (!statusPartIds.has(step)) {
            statusPartIds.set(step, `status-${generateId()}`);
          }
          return statusPartIds.get(step)!;
        };

        const sendStatus = (
          step: string,
          message: string,
          tone: ResumeChatDataParts['status']['tone'],
        ) => {
          const id = ensureStatusPartId(step);
          writer.write({
            type: 'data-status',
            id,
            data: { message, tone, step },
          });
        };

        streamStatusEmitter = (step, message, tone) => sendStatus(step, message, tone);

        sendStatus(
          'preflight',
          `Loaded ${resumeData.projects.length} projects and ${publicPages.length} docs`,
          'info',
        );
        sendStatus('response', 'Reviewing evidence and tool outputs…', 'info');

        try {
          const result = streamText({
            model,
            system: systemPrompt,
            messages: buildModelMessages(messagesForModel),
            toolChoice: 'auto',
            stopWhen: stepCountIs(48),
            tools: Object.keys(tools).length > 0 ? tools : undefined,
            providerOptions,
            experimental_transform: smoothStreaming as any,
            prepareStep: async ({ stepNumber, messages }) => {
              const adjustments: Record<string, unknown> = {};

              if (messages.length > 12) {
                adjustments.messages = messages.slice(-12);
              }

              if (stepNumber >= 6) {
                adjustments.toolChoice = stepNumber >= 10 ? { type: 'none' } : { type: 'auto' };
              }

              return Object.keys(adjustments).length ? adjustments : undefined;
            },
            onError({ error }) {
              console.error("💥 [STREAM] streamText error:", error);
              console.error("🔍 [STREAM] Error details:", JSON.stringify(error, null, 2));
              if (error instanceof Error) {
                console.error("🔴 [STREAM] Error name:", error.name);
                console.error("🔴 [STREAM] Error message:", error.message);
                console.error("🔴 [STREAM] Error stack:", error.stack);
              }
              sendStatus('response', 'Something went wrong while generating the answer.', 'error');
            },
            onFinish(event) {
              debugLog('🤖 [STREAM] AI Response:', event.text || '[EMPTY RESPONSE]');
              debugLog('📝 [STREAM] Response length:', event.text?.length || 0);
              debugLog('✅ [STREAM] Stream finished, ID mappings sent via X-ID-Mapping header');
              debugLog('📈 [STREAM] Token usage:', {
                inputTokens: event.usage?.inputTokens || 'undefined',
                outputTokens: event.usage?.outputTokens || 'undefined',
                totalTokens: event.usage?.totalTokens || 'undefined',
                reasoningTokens: event.usage?.reasoningTokens || 'undefined',
                cachedInputTokens: event.usage?.cachedInputTokens || 'undefined',
              });
              debugLog(`📊 [STREAM] Input token estimate: ~${inputTokenEstimate} tokens`);

              if (event.toolCalls && event.toolCalls.length > 0) {
                debugLog(`🔧 [STREAM] Tool calls made: ${event.toolCalls.length}`);
                event.toolCalls.forEach((call: any, i: number) => {
                  const argsStr = call.args ? JSON.stringify(call.args) : 'undefined';
                  debugLog(`  Tool ${i + 1}: ${call.toolName} - Args: ${argsStr.slice(0, 100)}`);
                });
              } else {
                debugLog('🔧 [STREAM] No tool calls made');
              }

              sendStatus('response', 'Answer ready with cited evidence.', 'success');
            },
          });

          writer.merge(
            result.toUIMessageStream<ResumeChatMessage>({
              originalMessages: messages,
              messageMetadata,
            }),
          );
        } finally {
          streamStatusEmitter = null;
        }
      },
      onError(error) {
        console.error('💥 [UI STREAM] Error encountered:', error);
        streamStatusEmitter = null;
        return 'I hit an issue retrieving resume evidence. Please try again in a moment.';
      },
      onFinish(event) {
        streamStatusEmitter = null;
        debugLog('📨 [UI STREAM] Messages returned:', event.messages.length);
      },
    });

    const response = createUIMessageStreamResponse({
      headers: new Headers({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'X-ID-Mapping': JSON.stringify(idMap),
      }),
      stream,
    });

    debugLog('🚀 [RESPONSE] Sending response back to client as UI message stream');
    return response;
  }),
});

// Bullet point analysis endpoint with Cerebras GPT-OSS-120B
http.route({
  path: "/api/bullet-analysis",
  method: "POST",
  handler: httpAction(async (ctx, req) => {

    // Handle both useChat (messages) and useCompletion (prompt) formats
    const body = await req.json();

    // Log the request body to debug
    debugLog('🔍 Bullet analysis request body:', JSON.stringify(body, null, 2));

    const { prompt, resumeId, bulletPointId, connectedPageId } = body as {
      prompt?: string; // From useCompletion
      messages?: ResumeChatMessage[]; // From useChat (backwards compatibility)
      resumeId: Id<"resumes">;
      bulletPointId: Id<"bulletPoints">;
      connectedPageId?: Id<"dynamicFiles">;
    };

    // Validate required fields
    if (!bulletPointId) {
      console.error('❌ Missing bulletPointId in request');
      return new Response(JSON.stringify({ error: "bulletPointId is required" }), {
        status: 400,
        headers: new Headers({
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        }),
      });
    }

    // Get the bullet point
    const bulletPoint = await ctx.runQuery(api.bulletPoints.get, { id: bulletPointId });
    if (!bulletPoint) {
      console.error('❌ Bullet point not found:', bulletPointId);
      return new Response(JSON.stringify({ error: "Bullet point not found" }), {
        status: 404,
        headers: new Headers({
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        }),
      });
    }

    const truncate = (value: string, max = 320) => {
      const trimmed = value.trim();
      if (trimmed.length <= max) {
        return trimmed;
      }
      return `${trimmed.slice(0, max)}…`;
    };

    // Gather supporting context: branches, project, connected page, and resume overview
    let branches: Array<{ content: string }> = [];
    let project: any = null;
    try {
      const [branchList, projectResult] = await Promise.all([
        ctx.runQuery(api.branches.list, { bulletPointId }),
        ctx.runQuery(api.projects.get, { id: bulletPoint.projectId }),
      ]);
      branches = branchList ?? [];
      project = projectResult;
    } catch (error) {
      console.error('⚠️ Failed to load branches or project context:', error);
    }

    const effectiveConnectedPageId = (connectedPageId ?? project?.connectedPageId) as Id<'dynamicFiles'> | undefined;

    let pageContent = null;
    let pageTitle = null;
    if (effectiveConnectedPageId) {
      try {
        const pageResult = await ctx.runQuery(api.dynamicFiles.getPublicPageContent, {
          resumeId,
          pageQuery: effectiveConnectedPageId,
        });

        if (pageResult.success && pageResult.page) {
          pageTitle = pageResult.page.title;
          let pageContentText = '';
          try {
            const content = pageResult.page.content;
            if (Array.isArray(content)) {
              pageContentText = content
                .map((block: any) => {
                  if (block.content && Array.isArray(block.content)) {
                    return block.content
                      .map((item: any) => {
                        if (typeof item === 'string') return item;
                        if (item.text) return item.text;
                        return '';
                      })
                      .join('');
                  }
                  return '';
                })
                .filter(Boolean)
                .join('\n');
            } else if (typeof content === 'string') {
              pageContentText = content;
            }
          } catch (error) {
            pageContentText = 'Unable to parse page content';
          }

          const lines = pageContentText.split('\n');
          pageContent = lines.map((line, i) => `[L${i + 1}] ${line}`).join('\n');
        }
      } catch (error) {
        console.error('⚠️ Failed to load connected page content:', error);
      }
    }

    let projectContext = '';
    if (project) {
      const segments: string[] = [];
      segments.push(`Title: ${project.title}`);
      if (project.description) {
        segments.push(`Summary: ${truncate(project.description, 360)}`);
      }

      try {
        const projectBullets = await ctx.runQuery(api.bulletPoints.list, { projectId: project._id });
        const siblingBullets = (projectBullets || [])
          .filter((bp: any) => bp._id !== bulletPointId)
          .slice(0, 4);
        if (siblingBullets.length > 0) {
          const siblingSummaries = siblingBullets
            .map((bp: any, index: number) => `  - Peer Bullet ${index + 1}: "${truncate(bp.content, 200)}"`)
            .join('\n');
          segments.push('Peer bullets for context:', siblingSummaries);
        }
      } catch (error) {
        console.error('⚠️ Failed to load project bullets:', error);
      }

      projectContext = segments.join('\n');
    }

    const branchDetails = branches
      .map((branch: any, index: number) => {
        const text = typeof branch?.content === 'string' ? branch.content : '';
        if (!text.trim()) {
          return null;
        }
        return `- Branch ${index + 1}: "${truncate(text, 240)}"`;
      })
      .filter(Boolean)
      .join('\n');

    let resumeContext = '';
    if (resumeId) {
      try {
        const resume = await ctx.runQuery(api.resumes.get, { id: resumeId });
        if (resume) {
          const nameOrTitle = resume.name || resume.title || 'Candidate';
          const focus = resume.description || '';
          resumeContext = `Candidate Context: ${nameOrTitle}\nFocus: ${truncate(focus, 320)}`;
        }
      } catch (error) {
        console.error('⚠️ Failed to load resume context:', error);
      }
    }

    // Define the schema for bullet analysis
    const bulletAnalysisSchema = z.object({
      opinion1: z.string().describe("Narrative micro-story linking context → action → outcome (≤ 18 words)"),
      citation1: z.string().describe("Short supporting quote or [L#] line ref that grounds opinion1"),
      opinion2: z.string().describe("Second micro-story emphasizing measurable impact or scope (≤ 18 words)"),
      citation2: z.string().describe("Short supporting quote or [L#] line ref that grounds opinion2"),
    });

    const pageExcerpt = pageContent ? pageContent.split('\n').slice(0, 24).join('\n') : '';

    const contextBlocks = [
      `Bullet (primary evidence): "${bulletPoint.content}"`,
      branchDetails ? `Branches (use alongside the bullet for the richest detail):\n${branchDetails}` : '',
      projectContext ? `Project context:\n${projectContext}` : '',
      pageExcerpt ? `Attached page excerpt (cite with [L#] if referenced):\n${pageExcerpt}` : '',
      resumeContext ? `Resume overview:\n${resumeContext}` : '',
    ].filter(Boolean).join('\n\n');

    // Simplified prompt for structured output
    const systemPrompt = `Craft a narrative analysis that situates this bullet within the broader story of the candidate's work.

${contextBlocks}

Instructions:
- Build both micro-stories around the bullet first; keep the candidate's voice and focus on their contribution.
- When branch details exist, weave them in for metrics, impact, or nuance before drawing from project/page context.
- Use project context to frame scope or stakeholders, and the attached page excerpt for supporting evidence when helpful.
- Keep each micro-story concise (≤ 18 words) and narrative in tone (context → action → outcome).
- For every micro-story, include an immediate citation (quote, branch detail, or [L#] line) supporting the claim.
- If branch information is missing, rely on the bullet plus project/page context as usual.
- Avoid generic summaries; be specific and evidence-driven.`;

    // Use OpenAI GPT-4o for structured output support
    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });
    const model = createWrappedOpenAIModel(openai, 'gpt-4o');
    debugLog('⚡ Using wrapped OpenAI GPT-4o for bullet analysis with structured output');

    try {
      // Use generateObject for structured output
      const { generateObject } = await import("ai");

      const result = await generateObject({
        model,
        schema: bulletAnalysisSchema,
        system: systemPrompt,
        prompt: prompt || "Analyze the bullet point",
        temperature: 0.5,
        maxOutputTokens: 500,
      });

      const defaultCitationLabel = pageTitle || (branchDetails ? 'Branch' : 'Bullet');
      const formatCitation = (value?: string) => {
        if (!value) {
          return '';
        }
        return value.includes('|') ? value : `${defaultCitationLabel} | ${value}`;
      };

      // Format the response
      const formattedResponse = `[AI] ${result.object.opinion1}
[CITATION] ${formatCitation(result.object.citation1)}
[AI] ${result.object.opinion2}
[CITATION] ${formatCitation(result.object.citation2)}`;

      debugLog('✅ Generated structured bullet analysis:', result.object);
      debugLog('📄 Formatted response:', formattedResponse);

      // Simply return the formatted text - useCompletion will handle it
      return new Response(formattedResponse, {
        headers: new Headers({
          "Content-Type": "text/plain; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }),
      });
    } catch (error) {
      console.error('❌ OpenAI API error, returning graceful fallback:', error);
      // Return a simple fallback response when API fails
      const fallbackResponse = `[AI] Analysis temporarily unavailable
[CITATION] ${pageTitle || 'Doc'} | Please try again
[AI] Service will resume shortly
[CITATION] ${pageTitle || 'Doc'} | Thank you for your patience`;

      return new Response(fallbackResponse, {
        headers: new Headers({
          "Content-Type": "text/plain",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }),
      });
    }
  }),
});

// Keep the original simple chat endpoint
http.route({
  path: "/api/chat",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const { messages, resumeId }: { messages: ResumeChatMessage[]; resumeId?: Id<"resumes"> } = await req.json();

    const lastMessages = getRecentMessagesForModel(messages);

    // Use Cerebras GPT-OSS-120B for the simple chat endpoint
    const cerebras = getCerebrasProvider();

    const simpleChatMessagesForModel: MessageForModel[] = lastMessages.map(({ id: _id, ...rest }) => rest);

    const result = streamText({
      model: createWrappedCerebrasModel(cerebras, 'gpt-oss-120b'),
      system: `You are a helpful assistant that can search through pages and provide information.
      Use the search_page_content tool silently when needed - do not announce tool usage.
      If the requested information is not available, respond with "Sorry, I can't find that information".
      You can use markdown formatting like links, bullet points, numbered lists, and bold text.
      Keep your responses concise and to the point.
      Never describe or narrate your tool usage - present information directly.

      Example WRONG approach: "Let me search for the API documentation..."
      Example CORRECT approach: "The API supports REST endpoints with OAuth2 authentication..."
      `,
      messages: buildModelMessages(simpleChatMessagesForModel),
      stopWhen: stepCountIs(10),
      // Add smooth streaming
      experimental_transform: smoothStreaming,
      tools: {
        search_page_content: tool({
          description:
            "Retrieve content from a public documentation page based on the query",
          inputSchema: z.object({
            pageQuery: z.string().describe("The page title or ID to search for"),
          }),
          execute: async ({ pageQuery }: { pageQuery: string }) => {
            debugLog("search_page_content query:", pageQuery);

            if (!resumeId) {
              return {
                success: false,
                error: "No resume context available"
              };
            }

            const result = await ctx.runQuery(api.dynamicFiles.getPublicPageContent, {
              resumeId,
              pageQuery
            });

            if (result.success && result.page) {
              // Parse BlockNote content
              let pageContentText = '';
              try {
                const content = result.page.content;
                if (Array.isArray(content)) {
                  pageContentText = content.map((block: any) => {
                    if (block.content && Array.isArray(block.content)) {
                      return block.content.map((item: any) => {
                        if (typeof item === 'string') return item;
                        if (item.text) return item.text;
                        return '';
                      }).join('');
                    }
                    return '';
                  }).filter(Boolean).join('\n');
                } else if (typeof content === 'string') {
                  pageContentText = content;
                }
              } catch (e) {
                pageContentText = 'Unable to parse page content';
              }

              return {
                id: result.page.id,
                title: result.page.title,
                content: pageContentText
              };
            } else {
              return {
                success: false,
                error: result.error || "Page not found"
              };
            }
          },
        }),
      },
      onError(error) {
        console.error("streamText error:", error);
      },
    });

    return result.toUIMessageStreamResponse({
      headers: new Headers({
        "Access-Control-Allow-Origin": "*",
        Vary: "origin",
      }),
    });
  }),
});

// OPTIONS handler for bullet-analysis
http.route({
  path: "/api/bullet-analysis",
  method: "OPTIONS",
  handler: httpAction(async (_, request) => {
    const headers = request.headers;
    if (
      headers.get("Origin") !== null &&
      headers.get("Access-Control-Request-Method") !== null &&
      headers.get("Access-Control-Request-Headers") !== null
    ) {
      return new Response(null, {
        headers: new Headers({
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        }),
      });
    } else {
      return new Response();
    }
  }),
});

// OPTIONS handler for resume-chat
http.route({
  path: "/api/resume-chat",
  method: "OPTIONS",
  handler: httpAction(async (_, request) => {
    const headers = request.headers;
    if (
      headers.get("Origin") !== null &&
      headers.get("Access-Control-Request-Method") !== null &&
      headers.get("Access-Control-Request-Headers") !== null
    ) {
      return new Response(null, {
        headers: new Headers({
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        }),
      });
    } else {
      return new Response();
    }
  }),
});

// OPTIONS handler for simple chat
http.route({
  path: "/api/chat",
  method: "OPTIONS",
  handler: httpAction(async (_, request) => {
    const headers = request.headers;
    if (
      headers.get("Origin") !== null &&
      headers.get("Access-Control-Request-Method") !== null &&
      headers.get("Access-Control-Request-Headers") !== null
    ) {
      return new Response(null, {
        headers: new Headers({
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        }),
      });
    } else {
      return new Response();
    }
  }),
});

// Metrics endpoint - exposes usage statistics
http.route({
  path: "/api/metrics",
  method: "GET",
  handler: httpAction(async () => {
    const cacheSize = responseCache.size;
    const cacheHitRate = metrics.totalRequests > 0
      ? ((metrics.cacheHits / metrics.totalRequests) * 100).toFixed(2)
      : '0.00';

    const metricsData = {
      totalRequests: metrics.totalRequests,
      totalTokens: metrics.totalTokens,
      cacheHits: metrics.cacheHits,
      cacheMisses: metrics.cacheMisses,
      cacheHitRate: `${cacheHitRate}%`,
      cacheSize,
      averageLatency: Math.round(metrics.averageLatency),
      recentLatencies: metrics.requestLatencies.slice(-10),
    };

    return new Response(JSON.stringify(metricsData, null, 2), {
      headers: new Headers({
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      }),
    });
  }),
});

// Echo analysis endpoint - using same pattern as bullet analysis
http.route({
  path: "/api/echo-analysis",
  method: "POST",
  handler: httpAction(async (ctx, req) => {

    const body = await req.json();
    debugLog('🎵 Echo analysis request:', JSON.stringify(body, null, 2));

    const { prompt, transcriptionId, summaryPoint, segmentReferences, resumeId } = body as {
      prompt?: string; // From useCompletion
      messages?: ResumeChatMessage[]; // From useChat (backwards compatibility)
      transcriptionId: Id<"audioTranscriptions">;
      summaryPoint: string;
      segmentReferences: Array<{
        segmentIndex: number;
        start: number;
        end: number;
        originalText: string;
      }>;
      resumeId?: Id<"resumes">; // Optional resume context
    };

    if (!transcriptionId) {
      return new Response(JSON.stringify({ error: "transcriptionId is required" }), {
        status: 400,
        headers: new Headers({
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        }),
      });
    }

    // Get the full transcription
    const transcription = await ctx.runQuery(api.audioTranscription.get, {
      id: transcriptionId
    });

    if (!transcription) {
      return new Response(JSON.stringify({ error: "Transcription not found" }), {
        status: 404,
        headers: new Headers({
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        }),
      });
    }

    try {
      // Use generateObject for structured output
      const { generateObject } = await import("ai");

      // Use OpenAI GPT-4o
      const openai = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY!,
      });
      const model = createWrappedOpenAIModel(openai, 'gpt-4o');
      debugLog('⚡ Using wrapped OpenAI GPT-4o for echo analysis with structured output');

      // Define the schema for echo analysis - supports up to 3 insights
      const echoAnalysisSchema = z.object({
        opinion1: z.string().describe("Narrative micro-story connecting prior context → spoken point → implication (≤ 18 words)"),
        citation1: z.string().describe("Exact quote from the source text (NO timestamp, just the quote text)"),
        opinion2: z.string().describe("Second micro-story highlighting skill growth or decision rationale (≤ 18 words)"),
        citation2: z.string().describe("Exact quote from the source text (NO timestamp, just the quote text)"),
        opinion3: z.string().optional().describe("Optional micro-story about trajectory or future direction (≤ 18 words)"),
        citation3: z.string().optional().describe("Exact quote from the source text (NO timestamp, just the quote text)"),
      });

      // Format timestamps properly
      const formatTimestamp = (ref: any) => {
        if (!ref) return "0:00";
        return `${Math.floor(ref.start / 60)}:${String(Math.floor(ref.start % 60)).padStart(2, '0')}`;
      };

      // Create context from segment references
      const sourceContext = segmentReferences.map((ref, index) =>
        `Source ${index + 1} [${formatTimestamp(ref)}]: "${ref.originalText}"`
      ).join('\n');

      // Get resume context if available
      let resumeContext = "";
      if (resumeId) {
        const resume = await ctx.runQuery(api.resumes.get, { id: resumeId });
        if (resume) {
          resumeContext = `\nCandidate Context: ${resume.name || resume.title}
Focus: ${resume.description || 'Technology professional'}`;
        }
      }

      // Structured prompt
      const systemPrompt = `Write narrative micro-analyses that place this echo within the larger story of the conversation/candidate.

Echo Point: "${summaryPoint}"

Source Segments:
${sourceContext}
${resumeContext}

Instructions:
- Produce 2–3 micro-stories (not restatements) capturing context → statement → implication
- Tie each story to professional growth, decision-making, or capability demonstrated
- Keep each micro-story concise (≤ 18 words) and specific
- Use a short timestamped quote to ground each story (e.g., 1:23 | exact phrase)
- Only include a third story when it adds genuine narrative value`;

      const result = await generateObject({
        model,
        schema: echoAnalysisSchema,
        system: systemPrompt,
        prompt: prompt || "Analyze the echo point",
        temperature: 0.4,
        maxOutputTokens: 500,
      });

      // Format the response using CITATION format - including optional third insight
      // Use real timestamps but AI-generated citations (without timestamps) to avoid duplication
      let formattedResponse = `[AI] ${result.object.opinion1}
[CITATION] ${formatTimestamp(segmentReferences[0])} | ${result.object.citation1}
[AI] ${result.object.opinion2}
[CITATION] ${formatTimestamp(segmentReferences[1] || segmentReferences[0])} | ${result.object.citation2}`;

      // Add third insight if available
      if (result.object.opinion3 && result.object.citation3) {
        const thirdRef = segmentReferences[2] || segmentReferences[1] || segmentReferences[0];
        formattedResponse += `
[AI] ${result.object.opinion3}
[CITATION] ${formatTimestamp(thirdRef)} | ${result.object.citation3}`;
      }

      debugLog('✅ Generated structured echo analysis:', result.object);
      debugLog('📄 Formatted response:', formattedResponse);

      // Simply return the formatted text - useCompletion will handle it
      return new Response(formattedResponse, {
        headers: new Headers({
          "Content-Type": "text/plain; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }),
      });
    } catch (error) {
      console.error('❌ OpenAI API error in echo analysis:', error);
      // Return a simple fallback with the sources
      const fallbackText = segmentReferences.map((ref) =>
        `[SOURCE] ${Math.floor(ref.start / 60)}:${String(Math.floor(ref.start % 60)).padStart(2, '0')} | ${ref.originalText}`
      ).join('\n');

      return new Response(fallbackText, {
        headers: new Headers({
          "Content-Type": "text/plain",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }),
      });
    }
  }),
});

// OPTIONS handler for echo-analysis
http.route({
  path: "/api/echo-analysis",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      headers: new Headers({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      }),
    });
  }),
});

export default http;
