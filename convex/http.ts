import { convertToModelMessages, streamText, generateText, tool, UIMessage, stepCountIs, smoothStream, wrapLanguageModel, defaultSettingsMiddleware } from "ai";
import { httpRouter } from "convex/server";
import { z } from "zod";
import { api } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import type { LanguageModelV2Middleware, LanguageModelV2StreamPart } from '@ai-sdk/provider';
import { createOpenAI } from '@ai-sdk/openai';
import { createCerebras } from '@ai-sdk/cerebras';

const http = httpRouter();

const RESUME_CHAT_MODEL_ID = 'qwen-3-235b-a22b-instruct-2507';

let cerebrasProvider: ReturnType<typeof createCerebras> | null = null;

function getCerebrasProvider() {
  if (!cerebrasProvider) {
    const apiKey = process.env.CEREBRAS_API_KEY;
    if (!apiKey) {
      throw new Error('CEREBRAS_API_KEY is not set');
    }
    cerebrasProvider = createCerebras({ apiKey });
    console.log('🔐 [MODEL] Initialized Cerebras provider for resume chat');
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

// Logging middleware - tracks all LLM interactions
const loggingMiddleware: LanguageModelV2Middleware = {
  wrapGenerate: async ({ doGenerate, params }) => {
    const startTime = Date.now();
    metrics.totalRequests++;

    console.log('🔍 LLM Request:', {
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
      console.log('📊 Token usage:', {
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

    console.log('🔍 LLM Stream Request:', {
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

        console.log('📊 [MIDDLEWARE-LOG-STREAM] Stream completed:', {
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
    console.log('🔄 [MIDDLEWARE-CACHE] Checking cache...');
    const cacheKey = JSON.stringify({
      prompt: params.prompt,
      temperature: params.temperature,
      maxOutputTokens: params.maxOutputTokens,
    });

    // Check cache
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      metrics.cacheHits++;
      console.log('✅ [MIDDLEWARE-CACHE] Cache hit for request');
      return cached.data;
    }

    console.log('❌ [MIDDLEWARE-CACHE] Cache miss, generating...');
    metrics.cacheMisses++;
    const result = await doGenerate();
    console.log('✅ [MIDDLEWARE-CACHE] Generation complete');

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
    console.log('🚦 [MIDDLEWARE-RATE] Checking rate limits...');
    // Simple rate limit check (you'd want a more sophisticated approach in production)
    if (metrics.totalRequests > 1000 && metrics.averageLatency < 100) {
      console.warn('⚠️ [MIDDLEWARE-RATE] Rate limit warning: High request volume detected');
    }
    console.log('✅ [MIDDLEWARE-RATE] Rate limit check passed');
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
    console.log('🌊 [MIDDLEWARE-PII] Starting stream wrapper...');
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

    console.log('🌊 [MIDDLEWARE-PII] Stream wrapper configured');
    return {
      stream: stream.pipeThrough(transformStream),
      ...rest,
    };
  },
};


// Default settings middleware - applies consistent defaults
const defaultSettings = defaultSettingsMiddleware({
  settings: {
    temperature: 1,
    maxOutputTokens: 5000,  // Reduced from 20000 to prevent token overuse
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
function createWrappedCerebrasModel(
  cerebras: ReturnType<typeof createCerebras>,
  modelName: string = RESUME_CHAT_MODEL_ID
) {
  console.log(`🚀 [MODEL] Creating wrapped Cerebras ${modelName} with middleware`);
  console.log(`🔧 [MODEL] Middleware count: ${allMiddleware.length}`);
  console.log(`🔧 [MODEL] Middleware names: defaultSettings, logging, caching, rateLimit, piiRedaction`);
  return wrapLanguageModel({
    model: cerebras(modelName),
    middleware: allMiddleware,
  });
}

// Helper function to create wrapped OpenAI model
function createWrappedOpenAIModel(openai: any, modelName: string = 'gpt-4o') {
  console.log(`🚀 [MODEL] Creating wrapped OpenAI ${modelName} with middleware`);
  console.log(`🔧 [MODEL] Middleware count: ${allMiddleware.length}`);
  console.log(`🔧 [MODEL] Middleware names: defaultSettings, logging, caching, rateLimit, piiRedaction`);
  return wrapLanguageModel({
    model: openai(modelName),
    middleware: allMiddleware,
  });
}

// Helper function to build ID mappings
function buildIdMappings(resumeData: any, publicPages: any[]) {
  const idMap = {
    forward: {} as Record<string, string>,  // convexId -> simpleId
    reverse: {} as Record<string, string>   // simpleId -> convexId
  };
  let projectCounter = 0;
  let bulletCounter = 0;
  let branchCounter = 0;
  let pageCounter = 0;

  // Map all public pages first
  publicPages.forEach((page: any) => {
    pageCounter++;
    const pageSimpleId = `PG${pageCounter}`;
    idMap.forward[page._id] = pageSimpleId;
    idMap.reverse[pageSimpleId] = page._id;
  });

  // Create mappings for projects, bullets, and branches
  resumeData.projects.forEach((project: any) => {
    projectCounter++;
    const projectSimpleId = `P${projectCounter}`;
    idMap.forward[project._id] = projectSimpleId;
    idMap.reverse[projectSimpleId] = project._id;

    project.bulletPoints.forEach((bp: any) => {
      bulletCounter++;
      const bulletSimpleId = `B${bulletCounter}`;
      idMap.forward[bp._id] = bulletSimpleId;
      idMap.reverse[bulletSimpleId] = bp._id;

      bp.branches.forEach((branch: any) => {
        branchCounter++;
        const branchSimpleId = `BR${branchCounter}`;
        idMap.forward[branch._id] = branchSimpleId;
        idMap.reverse[branchSimpleId] = branch._id;
      });
    });
  });

  return idMap;
}

// Resume chat endpoint with full citation support
http.route({
  path: "/api/resume-chat",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const { messages, resumeId, searchEnabled }: { messages: UIMessage[]; resumeId: Id<"resumes">; searchEnabled?: boolean } = await req.json();

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
        console.log('📎 Extracted GitHub username:', githubUsername);
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
    const idMap = buildIdMappings({ projects: projectsData }, publicPages);

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
    const systemPrompt = `You are ${resume.name || resumeData.title}'s second mind. You speak as the candidate in first person.

You are an **evidence-first digital twin**.  
Your role: Answer as me using only content from my resume, projects, portfolio, and documentation.  
Decline all unrelated queries unless it's a **medical or emergency situation**.  

### Instructions
- Always be proactive: run the full retrieval workflow automatically.  
- Normalize queries: silently correct typos, handle pluralization, and expand synonyms.  
- Resolve pronouns: "I/me/my" refers to the candidate, "you" refers to the recruiter asking questions.  
- For sensitive traits (personality/health), only use **my self-described, explicit statements**. Avoid speculation.  
- Be evidence-first: every factual claim about me must include an immediate citation.  
- Use the **Answer Structure Template** strictly.  
- Hide orchestration chatter (like "Searching content"). Final output must be clean.

---

### MY DATA SOURCES
- My Projects: ${resumeData.projects.length} total (fetch via fetch_resume_data)  
- My Portfolio: ${resume.portfolio ? 'Available' : 'None'}  
- My Documentation: ${publicPages.length} pages available  

---

### TOOL_SELECTION
- Query involves *my projects* or *my experience* → fetch_resume_data  
- Query involves *exact quotes*, *specific text*, *find where it says* → search_content (then fallback)  
- Query involves *related topics*, *similar to*, *meaning-based search* → semantic_search + search_content  
- Query involves *my portfolio* → scrape_portfolio  
- Query involves *specific page content* → search_page_content  
- Otherwise → fetch_resume_data  

---

### RETRIEVAL STRATEGY (Multi-Step Fallback)
1. PRIMARY → search_content for exact quotes (with citations)  
2. IF NONE → semantic_search to discover concepts and my phrasing variants  
3. IF SEMANTIC HIT → search_page_content to fetch the full page (with line numbers)  
4. ALWAYS CITE → Every claim about me must include a proper citation in {PG#} format with line numbers  

---

### SEMANTIC SEARCH WORKFLOW
1. semantic_search → discover relevant concepts about me (no citations yet)  
2. search_content → find exact quotes with proper citations  
3. Combine both → final answer with comprehensive coverage and citations  

---

### FALLBACK WORKFLOW (Example)
1. search_content("term") → No results  
2. semantic_search("related concepts") → Finds "Project Alpha" context  
3. search_page_content("Project Alpha") → Gets full page with line numbers  
4. Response: *"I mentioned [relevant content] [Project Alpha L15]{PG2}"*  

---

### CITATION RULES
- **Placement**: Inline with the claim, same line (no standalone lines)  
- **Strict formats**:  
  - Projects → [Project:"title"]{P#}  
  - Resume bullets → [Bullet:"brief text"]{B#}  
  - Branches → [Branch:"brief text"]{BR#}  
  - Page content → [PageTitle L#]{PG#}  
  - Echo points → [Echo P#]{PG#}  
  - Portfolio → [Portfolio:"context"]{portfolio}  
  - Web → [Web: domain]{web}  
- **Wrong** ❌: “in the Mobile Banking App project” (no citation)  
- **Right** ✅: “mentioned in [Mobile Banking App]{P3}”  

---

### RESPONSE REQUIREMENTS
- Format all responses in **Markdown**:
  - Headers (#, ##, ###)  
  - **bold**, *italics*, bullet lists, numbered lists  
  - inline code and fenced code blocks  
  - > blockquotes  
  - [Links](url), tables, --- separators  
  - - [ ] / - [x] for task lists  
  - $inline$ / $$block$$ math when needed  

---

### RESPONSE STYLE
- **Natural conversation**: Answer in first person as if speaking directly to the recruiter
- **Always cite**: Every factual claim must include proper citations inline
- **Be specific**: Use exact quotes and measurable details when available
- **Stay authentic**: Speak naturally while backing up claims with evidence
- **Keep it flowing**: Avoid rigid templates - just cite as you go

### CITATION REQUIREMENTS
- **Inline citations**: Place citations immediately after the claim, same line
- **No citation sections**: Don't list sources separately - cite as you speak
- **Evidence-based**: Only make claims you can back up with citations
- **Quote directly**: Use exact quotes from my materials when possible

### ERROR HANDLING
- If no evidence found → say "I don't have specific information about that in my materials"
- If uncertain → acknowledge uncertainty and suggest what might help
- If conflicting info → reconcile or note the discrepancy

### OUTPUT GUIDELINES
- **Natural flow**: Write like you're having a conversation, not filling out a form
- **Cite as you go**: [Project:"name"]{P#} or [Bullet:"text"]{B#} immediately after claims
- **Be conversational**: "I developed..." rather than "**My response:** I developed..."
- **Stay focused**: Answer the question directly without unnecessary structure  

---

    ${conversationContext || 'No previous conversation'}`;
    const lastMessages = messages.slice(-5);  // Reduced from 10 to save tokens

    // Use Cerebras Qwen 3 235B Instruct for candidate-first responses
    const cerebras = getCerebrasProvider();
    const model = createWrappedCerebrasModel(cerebras, RESUME_CHAT_MODEL_ID);
    console.log(`⚡ Using Cerebras model ${RESUME_CHAT_MODEL_ID} for resume chat`);

    // Estimate input tokens before sending
    const inputTokenEstimate = Math.ceil((systemPrompt.length +
      lastMessages.reduce((acc, msg) => {
        // UIMessage v5 uses parts array
        const textContent = msg.parts?.reduce((text, part) => {
          if (part.type === 'text' && part.text) {
            return text + part.text;
          }
          return text;
        }, '') || '';
        return acc + textContent.length;
      }, 0)) / 4); // Rough estimate: ~4 characters per token

    console.log(`📊 Input token estimate: ~${inputTokenEstimate} tokens`);

    // Web search will be handled via action

    // Try enabling tools for thinking model - may work with newer SDK versions
    // Previously disabled due to streaming incompatibility
    const shouldDisableTools = false; // Always allow tools now

    if (shouldDisableTools) {
      console.log('⚠️ Disabling tools for thinking model (streaming incompatibility)');
    }

    // Build tools object conditionally
    const tools: any = {};

    console.log(`🛠️ Tools enabled: searchEnabled=${searchEnabled}, shouldDisableTools=${shouldDisableTools}`);

    if (searchEnabled !== false && !shouldDisableTools) {
      // Add web search tool using the action
      tools.web_search = tool({
        description: "Search the web for current information, news, and real-time data",
        inputSchema: z.object({
          query: z.string().describe("The search query to find information on the web"),
          maxResults: z.number().optional().default(3).describe("Maximum number of results to return"),
        }),
        execute: async ({ query, maxResults = 3 }) => {
          // Call the webSearch action
          const result = await ctx.runAction(api.webSearch.search, {
            query,
            maxResults
          });
          return result;
        },
      });

      // Add portfolio scraping tool using Firecrawl
      tools.scrape_portfolio = tool({
        description: "ALWAYS use this to fetch portfolio website content when asked about portfolio or when portfolio URL is mentioned. Scrapes portfolio websites to extract projects, skills, and detailed information.",
        inputSchema: z.object({
          url: z.string().describe("The portfolio website URL to scrape (e.g., https://abusaid.netlify.app/)"),
        }),
        execute: async ({ url }) => {
          console.log("🔥 Scraping portfolio:", url);

          // Call the Firecrawl action with summary format only
          const result = await ctx.runAction(api.firecrawl.scrapePortfolio, {
            url,
            formats: ['summary']
          });

          if (result.success) {
            console.log(`✅ Successfully scraped: ${result.title}`);
          } else {
            console.log(`❌ Failed to scrape: ${result.error}`);
          }

          return result;
        },
      });

      // Add exact text search tool for finding specific quotes and phrases
      tools.search_content = tool({
        description: "Search for specific text, quotes, or phrases within all resume content including projects, bullets, branches, pages, and echoes. Use this when looking for exact statements, quotes, or specific information.",
        inputSchema: z.object({
          query: z.string().describe("The text to search for (e.g., 'overdramatic', 'fraud detection', 'accuracy')"),
          searchIn: z.enum(["all", "pages", "echoes", "resume"]).optional().default("all").describe("Where to search: all content, only pages, only echoes, or only resume data"),
          limit: z.number().optional().default(5).describe("Maximum number of results to return"),
        }),
        execute: async ({ query, searchIn = "all", limit = 5 }) => {
          console.log(`🔎 [EXACT] Searching for exact text: "${query}" in ${searchIn}`);
          console.log(`📋 [EXACT] Parameters: query="${query}", searchIn="${searchIn}", limit=${limit}`);

          try {
            const searchResult = await ctx.runQuery(api.contentSearch.searchContent, {
              resumeId,
              searchQuery: query,
              includePages: searchIn === "all" || searchIn === "pages",
              includeAudio: searchIn === "all" || searchIn === "echoes",
              includeResume: searchIn === "all" || searchIn === "resume",
              limit,
            });

            if (searchResult.results.length === 0) {
              return {
                success: false,
                message: `No exact matches found for "${query}"`,
                results: [],
              };
            }

            // Format results for AI consumption
            const formattedResults = searchResult.results.map((result: any) => {
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
              } else if (result.type === 'echo') {
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
              } else if (result.type === 'project') {
                const projectSimpleId = idMap.forward[result.projectId] || result.projectId;
                return {
                  type: 'project',
                  projectTitle: result.projectTitle,
                  matchedText: result.matchedText,
                  context: result.context,
                  citation: `[${result.projectTitle}]{${projectSimpleId}}`,
                };
              } else if (result.type === 'bullet') {
                const bulletSimpleId = idMap.forward[result.bulletId] || result.bulletId;
                return {
                  type: 'bullet',
                  projectTitle: result.projectTitle,
                  matchedText: result.matchedText,
                  context: result.context,
                  citation: `[${result.projectTitle} - Bullet]{${bulletSimpleId}}`,
                };
              } else if (result.type === 'branch') {
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

            return {
              success: true,
              query: searchResult.query,
              totalFound: searchResult.totalFound,
              results: formattedResults,
            };
          } catch (error) {
            console.error(`❌ [EXACT] Error in search_content:`, error);
            return {
              success: false,
              message: `Error during exact search: ${error instanceof Error ? error.message : String(error)}`,
              results: [],
            };
          }
        },
      });

      tools.search_page_content = tool({
        description: "Search and retrieve content from a public documentation page by title or ID. Use this when you need detailed information about a project.",
        inputSchema: z.object({
          pageQuery: z.string().describe("The page title or ID to search for (e.g., 'Real-Time Fraud Detection System' or 'PG1')"),
        }),
        execute: async ({ pageQuery }: { pageQuery: string }) => {
          console.log("📚 Searching for page:", pageQuery);

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
            console.log('✅ Found page:', pageResult.page.title);
            return responseObject;
          } else {
            const responseObject = {
              success: false,
              error: pageResult.error || "Page not found",
              availablePages: pageResult.availablePages || []
            };
            console.log('❌ Page not found:', pageQuery);
            return responseObject;
          }
        },
      });

      // Add semantic search tool for finding related content by meaning
      tools.semantic_search = tool({
        description: "Search for content by meaning/semantics to DISCOVER relevant topics and concepts. This tool does NOT provide citations - use it to find what to look for, then use search_content for exact quotes with proper citations.",
        inputSchema: z.object({
          query: z.string().describe("What you're looking for, described naturally (e.g., 'machine learning projects', 'leadership experience', 'technical challenges')"),
          limit: z.number().optional().default(8).describe("Maximum number of results to return"),
          sourceTypes: z.array(z.enum(["bullet_point", "project", "branch", "page", "audio_summary"])).optional().describe("Filter by content types"),
          minScore: z.number().optional().default(0.15).describe("Minimum similarity score (0-1, higher = more similar)"),
        }),
        execute: async ({ query, limit = 8, sourceTypes, minScore = 0.15 }) => {
          console.log(`🧠 [SEMANTIC] Searching for: "${query}"`);
          console.log(`📋 [SEMANTIC] Parameters: limit=${limit}, sourceTypes=${sourceTypes?.join(',') || 'all'}, minScore=${minScore}`);

          try {
            const searchResult = await ctx.runAction((api as any).semanticSearch.searchKnowledgeAdvanced, {
              query,
              resumeId,
              limit,
              sourceTypes,
              minScore,
            });

            console.log(`✅ [SEMANTIC] Found ${searchResult.results.length} results (filtered: ${searchResult.filteredByScore} by score, ${searchResult.filteredByType} by type)`);

            if (searchResult.results.length === 0) {
              return {
                success: false,
                message: `No semantically relevant content found for "${query}"`,
                results: [],
                stats: {
                  totalFound: 0,
                  filteredByScore: searchResult.filteredByScore,
                  filteredByType: searchResult.filteredByType,
                },
              };
            }

            // Format results without citations - semantic search is for discovery only
            const formattedResults = searchResult.results.map((result: any) => ({
              sourceType: result.sourceType,
              text: result.text,
              score: Math.round(result.score * 100) / 100,
              context: result.metadata?.title || result.metadata?.projectTitle || `${result.sourceType} content`,
              chunkIndex: result.chunkIndex,
            }));

            return {
              success: true,
              message: `Found ${searchResult.results.length} semantically relevant results`,
              results: formattedResults,
              stats: {
                totalFound: searchResult.results.length,
                filteredByScore: searchResult.filteredByScore,
                filteredByType: searchResult.filteredByType,
                queryTime: searchResult.queryEmbeddingTime,
                searchTime: searchResult.searchTime,
              },
            };

          } catch (error) {
            console.error(`❌ [SEMANTIC] Error:`, error);
            return {
              success: false,
              message: `Semantic search failed: ${error}`,
              results: [],
            };
          }
        },
      });

      // Add tool to fetch resume data on demand instead of embedding it all in context
      tools.fetch_resume_data = tool({
        description: "Get resume projects and structure. USE THIS FIRST for project questions.",
        inputSchema: z.object({
          dataType: z.enum(["overview", "projects", "full"]).optional().default("projects"),
        }),
        execute: async ({ dataType = "full" }) => {
          console.log(`📄 [TOOL] Fetching resume data: ${dataType}`);

          if (dataType === "overview") {
            return {
              title: resumeData.title,
              description: resumeData.description,
              projectCount: resumeData.projects.length,
              projectTitles: resumeData.projects.map((p: any) => `${p.title} (${p.simpleId})`),
            };
          }

          if (dataType === "projects") {
            return {
              projects: resumeData.projects.map((p: any) => ({
                title: p.title,
                simpleId: p.simpleId,
                description: p.description,
                bulletCount: p.bulletPoints.length,
                connectedPage: p.connectedPageInfo?.title,
              }))
            };
          }

          // Full data
          return resumeData;
        },
      });

      console.log(`📋 Total tools available: ${Object.keys(tools).length} - ${Object.keys(tools).join(', ')}`);
    }

    // Always stream responses for consistent handling
    console.log(`🎯 [STREAM] Starting streamText with ${Object.keys(tools).length} tools available`);
    console.log(`🛠️ [STREAM] Tool names: ${Object.keys(tools).join(', ')}`);
    console.log(`📝 [STREAM] Last message role:`, lastMessages[lastMessages.length - 1]?.role);
    console.log(`📝 [STREAM] Last message content:`, JSON.stringify(lastMessages[lastMessages.length - 1]?.parts).slice(0, 200));

    const result = streamText({
      model,
      system: systemPrompt,
      messages: convertToModelMessages(lastMessages),
      // Use auto instead of required to reduce unnecessary tool calls
      toolChoice: 'auto',
      temperature: 0.3,
      stopWhen: stepCountIs(20),  // Reduced from 20 to prevent excessive tool calls
      // Pass the tools object (may be empty)
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      // Add smooth streaming for better UX
      experimental_transform: smoothStreaming,
      onError({ error }) {
      console.error("💥 [STREAM] streamText error:", error);
      console.error("🔍 [STREAM] Error details:", JSON.stringify(error, null, 2));
      if (error instanceof Error) {
        console.error("🔴 [STREAM] Error name:", error.name);
        console.error("🔴 [STREAM] Error message:", error.message);
        console.error("🔴 [STREAM] Error stack:", error.stack);
      }
    },
    onFinish(event) {
      console.log('🤖 [STREAM] AI Response:', event.text || '[EMPTY RESPONSE]');
      console.log('📝 [STREAM] Response length:', event.text?.length || 0);
      // ID mapping is sent via headers instead
      console.log('✅ [STREAM] Stream finished, ID mappings sent via X-ID-Mapping header');

      // Log token usage for debugging
      console.log('📈 [STREAM] Token usage:', {
        inputTokens: event.usage?.inputTokens || 'undefined',
        outputTokens: event.usage?.outputTokens || 'undefined',
        totalTokens: event.usage?.totalTokens || 'undefined',
        reasoningTokens: event.usage?.reasoningTokens || 'undefined',
        cachedInputTokens: event.usage?.cachedInputTokens || 'undefined'
      });
      console.log(`📊 [STREAM] Input token estimate: ~${inputTokenEstimate} tokens`);

      // Log tool calls if any
      if (event.toolCalls && event.toolCalls.length > 0) {
        console.log(`🔧 [STREAM] Tool calls made: ${event.toolCalls.length}`);
        event.toolCalls.forEach((call: any, i: number) => {
          const argsStr = call.args ? JSON.stringify(call.args) : 'undefined';
          console.log(`  Tool ${i+1}: ${call.toolName} - Args: ${argsStr.slice(0, 100)}`);
        });
      } else {
        console.log('🔧 [STREAM] No tool calls made');
      }
    },
  });

    // Following convex-aisdk-rag pattern - simple response
    console.log('📡 [RESPONSE] Converting to UIMessageStreamResponse...');
    console.log('🎯 [RESPONSE] Result object exists:', result ? 'YES' : 'NO');
    console.log('🎯 [RESPONSE] Result type:', typeof result);

    const response = result.toUIMessageStreamResponse({
      headers: new Headers({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "X-ID-Mapping": JSON.stringify(idMap),
      }),
    });

    console.log('🚀 [RESPONSE] Sending response back to client');
    console.log('📊 [RESPONSE] Response object:', response ? 'Created' : 'NULL');
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
    console.log('🔍 Bullet analysis request body:', JSON.stringify(body, null, 2));

    const { prompt, resumeId, bulletPointId, connectedPageId } = body as {
      prompt?: string; // From useCompletion
      messages?: UIMessage[]; // From useChat (backwards compatibility)
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

    // Get the connected page content if available
    let pageContent = null;
    let pageTitle = null;
    let resumeContext = '';
    if (connectedPageId) {
      const pageResult = await ctx.runQuery(api.dynamicFiles.getPublicPageContent, {
        resumeId,
        pageQuery: connectedPageId
      });

      if (pageResult.success && pageResult.page) {
        pageTitle = pageResult.page.title;
        // Parse BlockNote content to readable text with line numbers
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

        // Add line numbers for precise citations
        const lines = pageContentText.split('\n');
        pageContent = lines.map((line, i) => `[L${i+1}] ${line}`).join('\n');
      }
    }

    // Optionally add broader resume context to help narrative framing
    if (resumeId) {
      try {
        const resume = await ctx.runQuery(api.resumes.get, { id: resumeId });
        if (resume) {
          const nameOrTitle = resume.name || resume.title || 'Candidate';
          const focus = resume.description || '';
          resumeContext = `\nCandidate Context: ${nameOrTitle}\nFocus: ${focus}`;
        }
      } catch (e) {
        // Non-fatal; continue without resume context
      }
    }

    // Define the schema for bullet analysis
    const bulletAnalysisSchema = z.object({
      opinion1: z.string().describe("Narrative micro-story linking context → action → outcome (≤ 18 words)"),
      citation1: z.string().describe("Short supporting quote or [L#] line ref that grounds opinion1"),
      opinion2: z.string().describe("Second micro-story emphasizing measurable impact or scope (≤ 18 words)"),
      citation2: z.string().describe("Short supporting quote or [L#] line ref that grounds opinion2"),
    });

    // Simplified prompt for structured output
    const systemPrompt = `Craft a narrative analysis that situates this bullet within the broader story of the candidate's work.

Bullet: "${bulletPoint.content}"

${pageContent ? `Source content:
${pageContent.split('\n').slice(0, 20).join('\n')}` : ''}
${resumeContext}

Instructions:
- Write 2 micro-stories (not restatements) capturing context → action → outcome
- Pull context from the connected page when present; otherwise infer cautiously from the bullet
- Prioritize measurable impact, scope, and the candidate's unique contribution
- Keep each micro-story concise (≤ 18 words)
- For each micro-story, include a brief supporting citation (quote or [L#] line) from the source content
- Avoid generic summaries; be specific and narrative-driven`;

    // Use OpenAI GPT-4o for structured output support
    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });
    const model = createWrappedOpenAIModel(openai, 'gpt-4o');
    console.log('⚡ Using wrapped OpenAI GPT-4o for bullet analysis with structured output');

    try {
      // Use generateObject for structured output
      const { generateObject } = await import("ai");

      // Define the schema for bullet analysis
      const bulletAnalysisSchema = z.object({
        opinion1: z.string().describe("Narrative micro-story linking context → action → outcome (≤ 18 words)"),
        citation1: z.string().describe("Short supporting quote or [L#] line ref that grounds opinion1"),
        opinion2: z.string().describe("Second micro-story emphasizing measurable impact or scope (≤ 18 words)"),
        citation2: z.string().describe("Short supporting quote or [L#] line ref that grounds opinion2"),
      });

      // Structured prompt for better results
      const systemPrompt = `Craft a narrative analysis that situates this bullet within the broader story of the candidate's work.

Bullet: "${bulletPoint.content}"

${pageContent ? `Source content:
${pageContent.split('\n').slice(0, 20).join('\n')}` : ''}
${resumeContext}

Instructions:
- Write 2 micro-stories (not restatements) capturing context → action → outcome
- Pull context from the connected page when present; otherwise infer cautiously from the bullet
- Prioritize measurable impact, scope, and the candidate's unique contribution
- Keep each micro-story concise (≤ 18 words)
- For each micro-story, include a brief supporting citation (quote or [L#] line) from the source content
- Avoid generic summaries; be specific and narrative-driven`;

      const result = await generateObject({
        model,
        schema: bulletAnalysisSchema,
        system: systemPrompt,
        prompt: prompt || "Analyze the bullet point",
        temperature: 0.5,
        maxOutputTokens: 500,
      });

      // Format the response
      const formattedResponse = `[AI] ${result.object.opinion1}
[CITATION] ${pageTitle || 'Doc'} | ${result.object.citation1}
[AI] ${result.object.opinion2}
[CITATION] ${pageTitle || 'Doc'} | ${result.object.citation2}`;

      console.log('✅ Generated structured bullet analysis:', result.object);
      console.log('📄 Formatted response:', formattedResponse);

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
    const { messages, resumeId }: { messages: UIMessage[]; resumeId?: Id<"resumes"> } = await req.json();

    const lastMessages = messages.slice(-5);  // Reduced from 10 to save tokens

    // Use Cerebras GPT-OSS-120B for the simple chat endpoint
    const cerebras = getCerebrasProvider();

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
      messages: convertToModelMessages(lastMessages),
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
            console.log("search_page_content query:", pageQuery);

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
    console.log('🎵 Echo analysis request:', JSON.stringify(body, null, 2));

    const { prompt, transcriptionId, summaryPoint, segmentReferences, resumeId } = body as {
      prompt?: string; // From useCompletion
      messages?: UIMessage[]; // From useChat (backwards compatibility)
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
      console.log('⚡ Using wrapped OpenAI GPT-4o for echo analysis with structured output');

      // Define the schema for echo analysis - supports up to 3 insights
      const echoAnalysisSchema = z.object({
        opinion1: z.string().describe("Narrative micro-story connecting prior context → spoken point → implication (≤ 18 words)"),
        citation1: z.string().describe("Short timestamped quote that grounds opinion1 (e.g., 1:23 | text)"),
        opinion2: z.string().describe("Second micro-story highlighting skill growth or decision rationale (≤ 18 words)"),
        citation2: z.string().describe("Short timestamped quote that grounds opinion2 (e.g., 2:05 | text)"),
        opinion3: z.string().optional().describe("Optional micro-story about trajectory or future direction (≤ 18 words)"),
        citation3: z.string().optional().describe("Short timestamped quote grounding opinion3"),
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
      let formattedResponse = `[AI] ${result.object.opinion1}
[CITATION] ${formatTimestamp(segmentReferences[0])} | ${segmentReferences[0]?.originalText || result.object.citation1}
[AI] ${result.object.opinion2}
[CITATION] ${formatTimestamp(segmentReferences[1] || segmentReferences[0])} | ${segmentReferences[1]?.originalText || result.object.citation2}`;

      // Add third insight if available
      if (result.object.opinion3 && result.object.citation3) {
        formattedResponse += `
[AI] ${result.object.opinion3}
[CITATION] ${formatTimestamp(segmentReferences[2] || segmentReferences[1] || segmentReferences[0])} | ${segmentReferences[2]?.originalText || result.object.citation3}`;
      }

      console.log('✅ Generated structured echo analysis:', result.object);
      console.log('📄 Formatted response:', formattedResponse);

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
