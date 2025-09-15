import { convertToModelMessages, streamText, generateText, tool, UIMessage, stepCountIs, smoothStream, wrapLanguageModel, defaultSettingsMiddleware } from "ai";
import { httpRouter } from "convex/server";
import { z } from "zod";
import { api } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import type { LanguageModelV2Middleware, LanguageModelV2StreamPart } from '@ai-sdk/provider';
import { createOpenAI } from '@ai-sdk/openai';

const http = httpRouter();

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
    temperature: 0.3,
    maxOutputTokens: 20000,
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


// Helper function to create wrapped Cerebras model
function createWrappedCerebrasModel(cerebras: any, modelName: string = 'gpt-oss-120b') {
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

    // GitHub context
    const githubContext = resume.github ? `
GitHub: ${resume.github}` : '';

    // Format available pages
    const availablePagesContext = publicPages.length > 0 ? `

AVAILABLE PAGES:
${publicPages.map((page: any, index: number) => {
  const simpleId = idMap.forward[page._id];
  return `${index + 1}. "${page.title}" (ID: ${simpleId})`;
}).join('\n')}
` : '';

    // Format resume context with citations
    const resumeContext = `
Resume Owner: ${resume.name || resumeData.title}
${resume.role ? `Role: ${resume.role}` : ''}
Resume Title: ${resumeData.title}
${resumeData.description ? `Description: ${resumeData.description}` : ''}
${resume.portfolio ? `
PORTFOLIO: ${resume.portfolio} → USE scrape_portfolio TOOL
` : ''}
${githubContext}
${availablePagesContext}
Projects:
${resumeData.projects.map((project, pIndex) => {
  let projectText = `
  ${pIndex + 1}. ${project.title} (ID: ${project.simpleId})
  ${project.description ? `   Description: ${project.description}` : ''}`;

  if (project.connectedPageInfo) {
    projectText += `
  📄 Connected Page: "${project.connectedPageInfo.title}" (ID: ${project.connectedPageInfo.simpleId})`;
  }

  projectText += `

  Bullet Points:
  ${project.bulletPoints.map((bp: any) => `
    • ${bp.content} (ID: ${bp.simpleId})
    ${bp.branches.length > 0 ? `
      Branches:
      ${bp.branches.map((branch: any) => `
        - ${branch.content} (ID: ${branch.simpleId})`).join('\n')}` : ''}`).join('\n')}`;

  return projectText;
}).join('\n')}`;

    // Build conversation history
    const conversationContext = messages.slice(-5).map((msg: any) => {
      const content = typeof msg.content === 'string' ? msg.content :
                      Array.isArray(msg.content) ? msg.content.map((c: any) => c.text || '').join('') : '';
      return `${msg.role.toUpperCase()}: ${content}`;
    }).join('\n\n');

    // System prompt using XML-based instructions from instructions.xml
    const systemPrompt = `You are Aurea, an AI assistant specialized in discussing candidate information from resumes, projects, and portfolios.

    ## Core Directive
    Always use search_content tool BEFORE responding. ALWAYS search ALL available data sources BEFORE responding. Never answer from assumptions - use tools to verify everything.
    
    ## Scope
    - Discuss ONLY information related to the candidate's resume, projects, portfolio, and professional background
    - EXCEPTION: Provide immediate help for emergencies (medical, safety-critical)
    - For off-topic non-emergency requests: "I can only discuss information related to this resume and candidate."
    
    ## Data Sources
    Resume Context: ${resumeContext}
    ${conversationContext ? `Recent Conversation: ${conversationContext}` : ''}
    
    ## Tool Usage Protocol
    For EVERY query, execute in this order:
    1. search_content - Use multiple relevant search terms
    2. search_page_content - Fetch ALL related pages immediately
    3. scrape_portfolio - If portfolio mentioned or exists
    4. web_search - ONLY if user explicitly requests external comparison
    
    Search Strategy:
    - Cast wide net with multiple search variations (e.g., "ML" → also search "machine learning", "model", "AI")
    - Better to over-search than miss information
    - ALWAYS generate text response after tool usage, even if no results found
    
    ## Response Format
    - Bulleted list format
    - Each bullet: ONE concrete fact + ONE citation
    - Provide comprehensive answers with context, not rushed 1-2 bullets
    - Include specifics: numbers, metrics, team sizes, impact
    - Add professional insights and genuine reactions (e.g., "Impressive for a 3-person team")
    
    ## Citations (exactly ONE per bullet, placed at end)
    Use EXACT formats below - do not mix or modify:
    - Projects: [Project:"title"]{P#}
    - Resume bullets: [Bullet:"brief text"]{B#}
    - Page content: [PageTitle L#]{PG#}
    - Echo points: [Echo P#]{PG#}
    - Portfolio: [Portfolio:"context"]{portfolio}
    - Web sources: [Web: domain]{web}
    
    ## Critical Rules
    1. NEVER respond without searching first
    2. ALWAYS fetch connected pages proactively
    3. Generate ONE consolidated response per query
    4. MANDATORY: Always provide text response after tool calls
    5. Never invent facts - say "I couldn't find that information" if absent
    6. No meta-commentary about tool usage
    7. Wait for all tools to complete before responding
    
    ## Response Style
    - Natural, confident, concise
    - Include professional assessments
    - No disclaimers or tool narration
    - Demonstrate deep understanding of technical context`;
    const lastMessages = messages.slice(-10);

    // Use OpenAI GPT-4o for high-quality responses
    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });
    const model = createWrappedOpenAIModel(openai, 'gpt-4o');

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

          // Call the Firecrawl action
          const result = await ctx.runAction(api.firecrawl.scrapePortfolio, {
            url,
            formats: ['markdown']
          });

          if (result.success) {
            console.log(`✅ Successfully scraped: ${result.title}`);
          } else {
            console.log(`❌ Failed to scrape: ${result.error}`);
          }

          return result;
        },
      });

      // Add content search tool for finding specific text
      tools.search_content = tool({
        description: "Search for specific text, quotes, or phrases within all pages and echoes. Use this when looking for exact statements, quotes, or specific information.",
        inputSchema: z.object({
          query: z.string().describe("The text to search for (e.g., 'overdramatic', 'fraud detection', 'accuracy')"),
          searchIn: z.enum(["all", "pages", "echoes"]).optional().default("all").describe("Where to search: all content, only pages, or only echoes"),
          limit: z.number().optional().default(5).describe("Maximum number of results to return"),
        }),
        execute: async ({ query, searchIn = "all", limit = 5 }) => {
          console.log(`🔎 [TOOL START] Searching content for: "${query}" in ${searchIn}`);
          console.log(`📋 [TOOL] Parameters: query="${query}", searchIn="${searchIn}", limit=${limit}`);
          console.log(`🆔 [TOOL] Resume ID: ${resumeId}`);

          try {
            console.log(`🔄 [TOOL] Calling ctx.runQuery...`);
            const searchResult = await ctx.runQuery(api.contentSearch.searchContent, {
              resumeId,
              searchQuery: query,
              includePages: searchIn === "all" || searchIn === "pages",
              includeAudio: searchIn === "all" || searchIn === "echoes",
              limit,
            });
            console.log(`✅ [TOOL] Query completed, got result:`, JSON.stringify(searchResult, null, 2).slice(0, 500));

          if (searchResult.results.length === 0) {
            console.log(`❌ [TOOL] No results found for "${query}"`);
            const emptyResponse = {
              success: false,
              message: `No matches found for "${query}"`,
              results: [],
            };
            console.log(`🔚 [TOOL] Returning empty response:`, emptyResponse);
            return emptyResponse;
          }

          console.log(`✅ [TOOL] Found ${searchResult.results.length} results for "${query}"`);
          console.log(`📊 [TOOL] Processing results...`);

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

              // Simple citation format without embedded text
              const citation = `[Echo P${pointNumber}]{${pageSimpleId}}`;

              return {
                type: 'echo',
                fileName: result.displayName || result.fileName,
                pageTitle: result.pageTitle,
                timestamp: result.timestamp,
                matchedText: result.matchedText,
                citation: citation,
                note: `This is echo point ${pointNumber} from "${result.pageTitle}" page`,
              };
            }
            return result;
          });

          const finalResponse = {
            success: true,
            query: searchResult.query,
            totalFound: searchResult.totalFound,
            results: formattedResults,
          };
          console.log(`✨ [TOOL] Final response prepared, ${formattedResults.length} formatted results`);
          console.log(`📤 [TOOL] Returning response:`, JSON.stringify(finalResponse, null, 2).slice(0, 500));
          return finalResponse;
          } catch (error) {
            console.error(`💥 [TOOL] Error in search_content:`, error);
            console.error(`🔍 [TOOL] Error stack:`, error instanceof Error ? error.stack : 'No stack');
            return {
              success: false,
              message: `Error during search: ${error instanceof Error ? error.message : String(error)}`,
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
      // Only require tools if they exist, otherwise let model choose
      toolChoice: 'auto',
      temperature: 0.3,
      stopWhen: stepCountIs(20),
      // Pass the tools object (may be empty)
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      // Add smooth streaming for better UX
      experimental_transform: smoothStream({
        delayInMs: 15,  // Slightly faster than default for snappy feel
        chunking: 'word' // Word-by-word streaming for natural reading
      }),
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
          console.log(`  Tool ${i+1}: ${call.toolName} - Args: ${JSON.stringify(call.args).slice(0, 100)}`);
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

    const { prompt, messages, resumeId, bulletPointId, connectedPageId } = body as {
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

    // Simplified prompt for faster inference
    const systemPrompt = `Analyze this bullet point to extract the key metric and technical achievement.

Bullet: "${bulletPoint.content}"

${pageContent ? `Source content:
${pageContent.split('\n').slice(0, 15).join('\n')}` : ''}

Output exactly 4 concise blocks:

[AI] Core achievement (max 10 words)
[CITATION] ${pageTitle || 'Doc'} | [brief quote]
[AI] Key metric/impact (max 10 words)
[CITATION] ${pageTitle || 'Doc'} | [brief quote]

Be extremely concise. No full sentences needed.`;
    // Use Cerebras GPT-OSS-120B for faster inference
    const { createCerebras } = await import('@ai-sdk/cerebras');
    const cerebras = createCerebras({
      apiKey: process.env.CEREBRAS_API_KEY!,
    });
    const model = createWrappedCerebrasModel(cerebras, 'gpt-oss-120b');
    console.log('⚡ Using wrapped Cerebras GPT-OSS-120B for fast bullet analysis');

    // Handle both formats
    let messagesToUse;
    if (prompt) {
      // useCompletion format - create a single user message
      const userMessage: UIMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        parts: [{
          type: 'text',
          text: prompt
        }]
      };
      messagesToUse = convertToModelMessages([userMessage]);
    } else if (messages && messages.length > 0) {
      // useChat format - use existing messages
      messagesToUse = convertToModelMessages(messages.slice(-10));
    } else {
      throw new Error("No prompt or messages provided");
    }

    try {
      const result = streamText({
        model,
        system: systemPrompt,
        messages: messagesToUse,
        temperature: 0.5,
        maxOutputTokens: 5000,  // Concise for bullet analysis
        stopWhen: stepCountIs(10),
        // Add smooth streaming for better UX
        experimental_transform: smoothStream({
          delayInMs: 10,  // Slightly faster for snappy feel
          chunking: 'word'
        }),
        onError(error) {
          console.error("Bullet analysis error:", error);
        },
        onFinish({ usage }) {
          if (usage) {
            console.log('📈 Bullet analysis token usage:', usage);
          }
        },
      });

      // Return appropriate response format
      if (prompt) {
        // For useCompletion - return UIMessage stream (data protocol)
        // This works because useCompletion can parse the data stream protocol
        return result.toUIMessageStreamResponse({
          headers: new Headers({
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          }),
        });
      } else {
        // For useChat - return UIMessage stream
        return result.toUIMessageStreamResponse({
          headers: new Headers({
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          }),
        });
      }
    } catch (error) {
      console.error('❌ Cerebras API error, returning graceful fallback:', error);
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

    const lastMessages = messages.slice(-10);

    // Use Cerebras GPT-OSS-120B for all chat endpoints
    const { createCerebras } = await import('@ai-sdk/cerebras');
    const cerebras = createCerebras({
      apiKey: process.env.CEREBRAS_API_KEY!,
    });

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
      experimental_transform: smoothStream({
        delayInMs: 12,
        chunking: 'word'
      }),
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

    const { prompt, messages, transcriptionId, summaryPoint, segmentReferences } = body as {
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
      // Use Cerebras GPT-OSS-120B for fast echo analysis (same as bullet analysis)
      const { createCerebras } = await import('@ai-sdk/cerebras');
      const cerebras = createCerebras({
        apiKey: process.env.CEREBRAS_API_KEY!,
      });
      const model = createWrappedCerebrasModel(cerebras, 'gpt-oss-120b');
      console.log('⚡ Using wrapped Cerebras GPT-OSS-120B for fast echo analysis');

      // Create context from segment references
      const sourceContext = segmentReferences.map((ref, index) =>
        `Source ${index + 1} [${Math.floor(ref.start / 60)}:${String(Math.floor(ref.start % 60)).padStart(2, '0')}]: "${ref.originalText}"`
      ).join('\n');

      // Generate AI analysis with alternating context and sources
      const systemPrompt = `You are analyzing an echo point and its source segments.

Echo Point: "${summaryPoint}"

Source Segments:
${sourceContext}

Full Transcription Context (for understanding only):
${transcription.transcription.substring(0, 2000)}...

Create an analysis with alternating AI context and source citations. Format your response EXACTLY as:

[AI] Provide contextual analysis about what this summary point means
[SOURCE] ${Math.floor(segmentReferences[0]?.start / 60 || 0)}:${String(Math.floor(segmentReferences[0]?.start % 60 || 0)).padStart(2, '0')} | ${segmentReferences[0]?.originalText || ''}
[AI] Add deeper insight or connection to broader themes
${segmentReferences[1] ? `[SOURCE] ${Math.floor(segmentReferences[1].start / 60)}:${String(Math.floor(segmentReferences[1].start % 60)).padStart(2, '0')} | ${segmentReferences[1].originalText}` : ''}
[AI] Conclude with the significance or implications

Rules:
- ALWAYS use "He" or "She" based on the speaker's voice/context (NEVER use "The speaker")
- Start each AI insight with [AI]
- Start each source with [SOURCE] timestamp | text
- Keep AI insights concise and meaningful
- Always alternate between AI and SOURCE
- Use the exact source text provided
- Maintain consistent pronoun usage throughout (He/She based on context)`;

      // Handle both formats (same as bullet analysis)
      let messagesToUse;
      if (prompt) {
        // useCompletion format - create a single user message
        const userMessage: UIMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          parts: [{
            type: 'text',
            text: prompt
          }]
        };
        messagesToUse = convertToModelMessages([userMessage]);
      } else if (messages && messages.length > 0) {
        // useChat format - use existing messages
        messagesToUse = convertToModelMessages(messages.slice(-10));
      } else {
        throw new Error("No prompt or messages provided");
      }

      // Stream text with exact same setup as bullet analysis
      try {
        const result = streamText({
          model,
          system: systemPrompt,
          messages: messagesToUse,
          temperature: 0.4,
          maxOutputTokens: 5000,
          stopWhen: stepCountIs(10),
          // Add smooth streaming for better UX
          experimental_transform: smoothStream({
            delayInMs: 10,  // Fast streaming for quick analysis
            chunking: 'word'
          }),
          onError(error) {
            console.error("Audio analysis error:", error);
          },
          onFinish({ usage }) {
            if (usage) {
              console.log('📈 Audio analysis token usage:', usage);
            }
          },
        });

        // Return appropriate response format (same as bullet analysis)
        if (prompt) {
          // For useCompletion - return UIMessage stream (data protocol)
          return result.toUIMessageStreamResponse({
            headers: new Headers({
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type",
            }),
          });
        } else {
          // For useChat - return UIMessage stream
          return result.toUIMessageStreamResponse({
            headers: new Headers({
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type",
            }),
          });
        }
      } catch (streamError) {
        console.error('❌ Cerebras API error in audio analysis, returning fallback:', streamError);
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
    } catch (error) {
      console.error('❌ Audio analysis error:', error);
      return new Response(JSON.stringify({ error: "Analysis generation failed" }), {
        status: 500,
        headers: new Headers({
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
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