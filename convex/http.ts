import { convertToModelMessages, streamText, tool, UIMessage, stepCountIs, smoothStream, wrapLanguageModel, defaultSettingsMiddleware } from "ai";
import { httpRouter } from "convex/server";
import { z } from "zod";
import { api } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import type { LanguageModelV2Middleware, LanguageModelV2StreamPart } from '@ai-sdk/provider';

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

        console.log('📊 Stream completed:', {
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
    const cacheKey = JSON.stringify({
      prompt: params.prompt,
      temperature: params.temperature,
      maxOutputTokens: params.maxOutputTokens,
    });

    // Check cache
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      metrics.cacheHits++;
      console.log('✅ Cache hit for request');
      return cached.data;
    }

    metrics.cacheMisses++;
    const result = await doGenerate();

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
    // Simple rate limit check (you'd want a more sophisticated approach in production)
    if (metrics.totalRequests > 1000 && metrics.averageLatency < 100) {
      console.warn('⚠️ Rate limit warning: High request volume detected');
    }
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

    return {
      stream: stream.pipeThrough(transformStream),
      ...rest,
    };
  },
};

// Extract reasoning middleware - disabled for now as GPT-5 handles reasoning differently
// GPT-5 uses reasoningSummary parameter instead
// const reasoningMiddleware = extractReasoningMiddleware({
//   tagName: 'thinking',
//   separator: '\n',
//   startWithReasoning: false,
// });

// Default settings middleware - applies consistent defaults
const defaultSettings = defaultSettingsMiddleware({
  settings: {
    temperature: 0.3,
    maxOutputTokens: 2000,
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
  console.log(`🚀 Creating wrapped Cerebras ${modelName} with middleware`);
  return wrapLanguageModel({
    model: cerebras(modelName),
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
    const systemPrompt = `<SYSTEM role="Aurea" version="1.0">
  <scope>
    Discuss anything related to this candidate found in their resume, projects, pages, audio notes, and portfolio - including personal traits, characteristics, statements, and claims they make.
    Only decline truly off-topic requests unrelated to the candidate (e.g., cooking recipes, weather, general programming tutorials).
    For off-topic requests, respond: "I can only discuss information related to this resume and candidate."
  </scope>

  <objectives>
    Provide 2–5 concise bullets highlighting concrete achievements, metrics, scale, reliability, and business impact.
    Prefer specifics (numbers, throughput, latency, savings, team size) over generalities.
  </objectives>

  <data>
    <resume_context>${resumeContext}</resume_context>
    <available_pages>Projects with connected pages available for detailed information</available_pages>
    ${conversationContext ? `<recent_conversation>${conversationContext}</recent_conversation>` : ''}
  </data>

  <tools use="silently">
    <tool name="search_content">Find exact quotes in pages and audio.</tool>
    <tool name="search_page_content">Fetch a page by title or ID when details about a project/page are requested.</tool>
    <tool name="scrape_portfolio">Use when a portfolio URL is present or asked about.</tool>
    <tool name="web_search">Use only if the user explicitly asks to compare with public sources.</tool>
  </tools>

  <citations>
    <rule>Exactly one citation per bullet, placed at the end.</rule>
    <format type="project">[Project:"title"]{P#}</format>
    <format type="bullet">[Bullet:"brief text"]{B#}</format>
    <format type="branch">[Branch:"brief text"]{BR#}</format>
    <format type="page-line">[Title L#]{PG#}</format>
    <format type="audio">[Audio:"file T#s"]{PG#:filename}</format>
    <format type="portfolio">[Portfolio:"short context"]{portfolio}</format>
    <format type="web">[Web: domain]{web}</format>
  </citations>

  <output>
    <shape>Bulleted list only; each bullet = 1 concrete fact + 1 citation.</shape>
    <style>Natural, confident, concise; no tool narration or disclaimers. Include genuine reactions and opinions (e.g., "That's actually impressive", "Pretty ambitious for a 3-person team", "Solid for this use case").</style>
    <opinions>Add professional insights, assessments, and contextual reactions that show understanding of the technical landscape.</opinions>
  </output>

  <reasoning hidden_tag="thinking">
    <guidance>Place any hidden reasoning inside <thinking>...</thinking> and keep it brief.</guidance>
    <must>Always produce the final user-visible bullets after the hidden reasoning block.</must>
  </reasoning>

  <rules>
    <rule>Do not invent unsupported facts—use tools to verify before asserting.</rule>
    <rule>If a requested fact is absent in the provided data/tools, say you can't find it.</rule>
    <rule>No preambles, no meta-commentary about using tools.</rule>
    <rule>CRITICAL: Generate ONLY ONE response per user question - consolidate all findings.</rule>
    <rule>Wait for ALL tools to complete before responding.</rule>
    <rule>NEVER send partial responses or multiple messages.</rule>
  </rules>
</SYSTEM>`;

    const lastMessages = messages.slice(-10);

    // Always use GPT-OSS-120B for fast, high-quality responses
    const { createCerebras } = await import('@ai-sdk/cerebras');
    const cerebras = createCerebras({
      apiKey: process.env.CEREBRAS_API_KEY!,
    });
    const model = createWrappedCerebrasModel(cerebras, 'gpt-oss-120b');

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
        description: "Search for specific text, quotes, or phrases within all pages and audio transcriptions. Use this when looking for exact statements, quotes, or specific information.",
        inputSchema: z.object({
          query: z.string().describe("The text to search for (e.g., 'overdramatic', 'fraud detection', 'accuracy')"),
          searchIn: z.enum(["all", "pages", "audio"]).optional().default("all").describe("Where to search: all content, only pages, or only audio"),
          limit: z.number().optional().default(5).describe("Maximum number of results to return"),
        }),
        execute: async ({ query, searchIn = "all", limit = 5 }) => {
          console.log(`🔎 Searching content for: "${query}" in ${searchIn}`);

          const searchResult = await ctx.runQuery(api.contentSearch.searchContent, {
            resumeId,
            searchQuery: query,
            includePages: searchIn === "all" || searchIn === "pages",
            includeAudio: searchIn === "all" || searchIn === "audio",
            limit,
          });

          if (searchResult.results.length === 0) {
            console.log(`❌ No results found for "${query}"`);
            return {
              success: false,
              message: `No matches found for "${query}"`,
              results: [],
            };
          }

          console.log(`✅ Found ${searchResult.results.length} results for "${query}"`);

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
            } else if (result.type === 'audio') {
              const pageSimpleId = idMap.forward[result.pageId] || result.pageId;
              return {
                type: 'audio',
                fileName: result.fileName,
                pageTitle: result.pageTitle,
                timestamp: result.timestamp,
                matchedText: result.matchedText,
                citation: `[Audio:"${result.fileName} T${result.timestamp}s"]{${pageSimpleId}:${result.fileName}}`,
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

            // Get audio transcription info from the page if available
            let audioInfo = '';
            if (pageResult.page.transcriptions && pageResult.page.transcriptions.length > 0) {
              const pageSimpleId = idMap.forward[pageResult.page.id] || pageResult.page.id;
              audioInfo = '\n\nAUDIO TRANSCRIPTIONS IN THIS PAGE:\n';
              pageResult.page.transcriptions.forEach((t: any) => {
                audioInfo += `- "${t.fileName}" - Duration: ${t.duration ? Math.round(t.duration) + 's' : 'unknown'}\n`;
                audioInfo += `  To cite segments from this audio, use: [Audio:"${t.fileName} T<seconds>s"]{${pageSimpleId}:${t.fileName}}\n`;
              });
              audioInfo += '\nNote: Audio transcriptions are included in the page content above. Look for [Audio Transcription] markers and [TS<n>:<seconds>s] timestamps.\n';
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
    const result = streamText({
      model,
      system: systemPrompt,
      messages: convertToModelMessages(lastMessages),
      // Only require tools if they exist, otherwise let model choose
      toolChoice: 'auto',
      temperature: 0.3,
      stopWhen: stepCountIs(10),
      // Pass the tools object (may be empty)
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      // Add smooth streaming for better UX
      experimental_transform: smoothStream({
        delayInMs: 15,  // Slightly faster than default for snappy feel
        chunking: 'word' // Word-by-word streaming for natural reading
      }),
    onError(error) {
      console.error("streamText error:", error);
    },
    onFinish(event) {
      console.log('🤖 AI Response:', event.text);
      // ID mapping is sent via headers instead
      console.log('Stream finished, ID mappings sent via X-ID-Mapping header');

      // Log token usage for debugging
      if (event.usage) {
        console.log('📈 Token usage:', event.usage);
        console.log(`📊 Input token estimate: ~${inputTokenEstimate} tokens`);
      }
    },
  });

    // Following convex-aisdk-rag pattern - simple response
    const response = result.toUIMessageStreamResponse({
      headers: new Headers({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "X-ID-Mapping": JSON.stringify(idMap),
      }),
    });

    return response;
  }),
});

// Bullet point analysis endpoint with Gemini 2.5 Flash
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

    const result = streamText({
      model,
      system: systemPrompt,
      messages: messagesToUse,
      temperature: 0.1,
      maxOutputTokens: 500,  // Concise for bullet analysis
      stopWhen: stepCountIs(1),
      // Add smooth streaming for better UX
      experimental_transform: smoothStream({
        delayInMs: 10,  // Fast streaming for quick analysis
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
  }),
});

// Keep the original simple chat endpoint
http.route({
  path: "/api/chat",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const { messages, resumeId }: { messages: UIMessage[]; resumeId?: Id<"resumes"> } = await req.json();

    const lastMessages = messages.slice(-10);

    // Use GPT-OSS-120B for all chat endpoints
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

export default http;