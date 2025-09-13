import { v } from "convex/values";
import { action, query } from "./_generated/server";
import { api } from "./_generated/api";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const chatWithResume = action({
  args: {
    resumeId: v.id("resumes"),
    message: v.string(),
    conversationHistory: v.optional(v.array(v.object({
      role: v.string(),
      content: v.string()
    })))
  },
  handler: async (ctx, args) => {
    try {
      // Get API key from environment
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not configured");
      }

      // Get resume data
      const resume = await ctx.runQuery(api.resumes.get, { id: args.resumeId });
      if (!resume) {
        throw new Error("Resume not found");
      }

      // Fetch GitHub data if GitHub URL is provided
      let githubData = null;
      let githubUsername = null;
      
      if (resume.github) {
        // Extract username from GitHub URL (e.g., "github.com/username" or just "username")
        const githubUrlMatch = resume.github.match(/(?:github\.com\/)?([a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38})\/?$/);
        if (githubUrlMatch) {
          githubUsername = githubUrlMatch[1];
          console.log('📎 Extracted GitHub username from URL:', githubUsername, 'from', resume.github);
        }
      }
      
      console.log('🔍 Checking for GitHub username:', githubUsername);
      if (githubUsername) {
        console.log('📡 Fetching GitHub data for:', githubUsername);
        const githubResponse = await ctx.runAction(api.github.fetchGithubData, { 
          username: githubUsername 
        });
        console.log('📦 GitHub response:', {
          success: githubResponse.success,
          hasData: !!githubResponse.data,
          error: githubResponse.error
        });
        if (githubResponse.success && githubResponse.data) {
          githubData = githubResponse.data;
          console.log('✅ GitHub data loaded:', {
            repos: githubData.statistics.totalRepositories,
            stars: githubData.statistics.totalStars,
            languages: githubData.statistics.topLanguages
          });
        }
      } else {
        console.log('❌ No GitHub username extracted from:', resume.github);
      }

      // Get all projects first
      const projects = await ctx.runQuery(api.projects.list, { resumeId: args.resumeId });
      
      // Get list of all public pages for context
      const publicPages = await ctx.runQuery(api.dynamicFiles.listPublic, { resumeId: args.resumeId });
      console.log('📚 Available public pages:', publicPages.map((p: any) => p.title));
      
      // Log available pages for debugging
      console.log('📚 Public pages available for AI:', publicPages.map((p: any) => ({
        title: p.title,
        id: p._id,
        isPublic: p.isPublic
      })));
      
      // Build complete resume data structure WITHOUT pre-fetching page content
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

          // Just note if there's a connected page, don't fetch content
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

      // Now build ID mappings after all data is fetched
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

      // Create mappings and add simpleIds
      const resumeData = {
        title: resume.title,
        description: resume.description,
        projects: projectsData.map((project: any) => {
          projectCounter++;
          const projectSimpleId = `P${projectCounter}`;
          idMap.forward[project._id] = projectSimpleId;
          idMap.reverse[projectSimpleId] = project._id;

          const bulletPointsWithIds = project.bulletPoints.map((bp: any) => {
            bulletCounter++;
            const bulletSimpleId = `B${bulletCounter}`;
            idMap.forward[bp._id] = bulletSimpleId;
            idMap.reverse[bulletSimpleId] = bp._id;

            const branchesWithIds = bp.branches.map((branch: any) => {
              branchCounter++;
              const branchSimpleId = `BR${branchCounter}`;
              idMap.forward[branch._id] = branchSimpleId;
              idMap.reverse[branchSimpleId] = branch._id;
              return {
                ...branch,
                simpleId: branchSimpleId
              };
            });

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

      // Format GitHub data for context if available
      const githubContext = githubData ? `

GitHub Profile (@${githubData.profile.username}):
${githubData.profile.bio ? `Bio: ${githubData.profile.bio}` : ''}
Followers: ${githubData.profile.followers} | Public Repos: ${githubData.statistics.totalRepositories}
Total Stars: ${githubData.statistics.totalStars} | Total Forks: ${githubData.statistics.totalForks}

Top Languages: ${githubData.statistics.topLanguages.slice(0, 5).map((lang: any) => `${lang.language} (${lang.count})`).join(', ')}

GitHub Repositories (${githubData.repositories.length} public repos):
${githubData.repositories.map((repo: any, index: number) => `
${index + 1}. ${repo.name}${repo.stars > 0 ? ` (⭐ ${repo.stars})` : ''} - ${repo.description || 'No description'}
   URL: ${repo.url}
   ${repo.language ? `Language: ${repo.language}` : ''}${repo.topics && repo.topics.length > 0 ? ` | Topics: ${repo.topics.slice(0, 3).join(', ')}` : ''}`).join('\n')}

IMPORTANT: When asked about specific GitHub projects, code quality, or implementation details, the Google Search grounding will automatically search these repository URLs to provide accurate, real-time information.` : '';
      
      console.log('📄 GitHub context included:', githubContext ? 'YES' : 'NO');
      if (githubContext) {
        console.log('GitHub context preview:', githubContext.substring(0, 300) + '...');
      }

      // Format available pages list
      const availablePagesContext = publicPages.length > 0 ? `

AVAILABLE PUBLIC PAGES:
${publicPages.map((page: any, index: number) => {
  const simpleId = idMap.forward[page._id];
  return `${index + 1}. "${page.title}" (ID: ${simpleId})`;
}).join('\n')}

Note: Use the search_page_content tool to retrieve content from these pages when needed.
` : '';

      // Format resume data for context with simple IDs
      const resumeContext = `
Resume Owner: ${resume.name || resumeData.title}
${resume.role ? `Role: ${resume.role}` : ''}
Resume Title: ${resumeData.title}
${resumeData.description ? `Description: ${resumeData.description}` : ''}
${resume.portfolio ? `
PORTFOLIO WEBSITE: ${resume.portfolio}
Note: Search this portfolio when relevant to find additional projects and information.
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
  📄 Connected Page: "${project.connectedPageInfo.title}" (ID: ${project.connectedPageInfo.simpleId})
  [Use search_page_content tool to access this page's content]`;
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

      // Initialize Gemini with function calling and Google Search
      const genAI = new GoogleGenerativeAI(apiKey);
      
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",  // Using 2.5 Flash as requested
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192,
          topK: 40,
          topP: 0.95,
        }
      });
      
      // Define tools with proper typing (using any to bypass strict typing issues)
      const tools: any[] = [
        {
          functionDeclarations: [{
            name: "search_page_content",
            description: "Search and retrieve content from a public documentation page by title or ID. Use this when you need detailed information about a project.",
            parameters: {
              type: "object",
              properties: {
                pageQuery: {
                  type: "string",
                  description: "The page title or ID to search for (e.g., 'Real-Time Fraud Detection System' or 'PG1')"
                }
              },
              required: ["pageQuery"]
            }
          }]
        }
      ];

      // Build conversation context
      const conversationContext = args.conversationHistory 
        ? args.conversationHistory.map(msg => 
            `${msg.role.toUpperCase()}: ${msg.content}`
          ).join('\n\n')
        : '';

      // Create the prompt
      const prompt = `ROLE
      You are Aurea, a professional resume analyst who provides insightful, conversational assessments. Be helpful, knowledgeable, and speak naturally - like a skilled colleague sharing expertise.
      
      IDENTITY
      You're analyzing ${resume.name || 'the candidate'}'s background. Use they/them pronouns and speak about their experience from a third-person perspective.
      
      INPUTS
      DATA
      ${resumeContext}
      
      ${conversationContext ? `HISTORY
      ${conversationContext}
      ` : ''}QUESTION
      ${args.message}
      
      FUNCTION CALLING INSTRUCTIONS
      **CRITICAL**: You have access to the search_page_content function. USE IT!
      
      **WHEN TO USE search_page_content**:
      - Questions about accuracy, metrics, percentages (e.g., "What's the accuracy of their fraud detection?")
      - Questions about technical implementation or architecture
      - ANY question about a project that shows "📄 Connected Page" in the context
      - Questions with words: accuracy, precision, recall, how, what, details, explain, metrics, performance
      
      **HOW TO CALL THE FUNCTION**:
      When you see "📄 Connected Page: [Page Title]" in a project, call:
      search_page_content with arguments: {"pageQuery": "[Page Title]"}
      
      Example: For 'Connected Page: "Real-Time Fraud Detection System"'
      Call: search_page_content({"pageQuery": "Real-Time Fraud Detection System"})
      
      **FUNCTION RESPONSE FORMAT**:
      The function returns a JSON object with:
      - success: boolean
      - pageTitle: string (if found)
      - pageId: string (if found)
      - content: string (the page content with all details)
      
      Extract metrics and details from the content field in the response.
      
      **PORTFOLIO**: ${resume.portfolio ? resume.portfolio : 'Not provided'}
      - Search portfolio externally when relevant to find additional projects
      
      **REMEMBER**: Bullet points lack details. Pages have comprehensive information. ALWAYS check pages for accuracy/metrics questions.
      
      OUTPUT FORMAT
      Provide a natural, conversational response that:
      - Starts with a direct answer to the question
      - Includes supporting details when relevant (use • for bullet points if listing multiple items)
      - Sounds professional but human - like a knowledgeable colleague speaking
      - Ends with a natural follow-up question or suggestion when appropriate
      
      STYLE GUIDELINES
      • Keep responses concise (under 180 words)
      • **ALWAYS use bullet points (•) for your entire response**
      • Each bullet should make ONE clear point with ONE citation at the end
      • Be confident and specific with data and metrics
      • Example response structure:
        • Built a fraud detection system achieving 99.2% precision [Page:"Real-Time Fraud Detection System L11"]{PG1}
        • Processed over 1M transactions daily with sub-second latency [Bullet:"transaction processing"]{B5}
        • Reduced false positives by 35% using ensemble ML models [Project:"Fraud Detection"]{P1}
      • Avoid labeling sections (no "Topline:", "Evidence:", etc.)
      • Keep each bullet concise and focused on a single achievement or fact
      
      CITATIONS (strict)
      • **CITATION FORMAT (CRITICAL)**:
        – ALWAYS use format: [Type:"brief text"]{ID}
        – Keep citation text SHORT - it's just a reference label
        – Examples: [Bullet:"fraud detection"]{B2}, [Branch:"SMOTE"]{BR3}
        – For pages with line numbers: [Page:"Page Title L11"]{PG1}
        – NEVER use: [B2, BR3] or [B2] alone
        – NEVER cite metadata like "Resume Owner", "Role", or other contextual information - only cite actual resume content
      • **CITATION PLACEMENT RULES**:
        – Place EXACTLY ONE citation at the end of each bullet point
        – NEVER use multiple citations in one bullet
        – NEVER place citations in the middle of text
        – Good: "• Implemented fraud detection with 99.2% precision [Page:"System L11"]{PG1}"
        – Bad: "• They use [B1] React and [B2] Next.js"
        – Bad: "• Built multiple systems [B1, B2, B3]"
      • **WHEN TO CITE**:
        – Cite KEY achievements, metrics, and unique claims
        – DON'T cite every technology mention - group them under one source citation
        – For long lists, cite the primary source ONCE
      • Use simple IDs from DATA:
        – Projects: [Project:"title"]{P#}
        – Bullets:  [Bullet:"text"]{B#}
        – Branches: [Branch:"text"]{BR#}
        – Pages:    [Page:"Page Title L#"]{PG#}
      • External (REQUIRED when found via search):
        – Portfolio main: [Portfolio:"Portfolio website"]{portfolio}
        – Portfolio project: [Portfolio:"ProjectName"]{portfolio}
        – GitHub profile: [GitHub:"GitHub profile"]{github}
        – GitHub repo:    [GitHub:"repo-name"]{github:repo-name}
      • **IMPORTANT PAGE CITATION RULES**:
        – When citing information from a connected page, use [Page:"Page Title"]{PG#}
        – Include line number when citing specific content: [Page:"Page Title L#"]{PG#}
        – Example: "The system achieved 99.2% precision [Page:"Real-Time Fraud Detection System L11"]{PG1}"
        – NEVER use line ranges (L11-L12) - always cite a single line number only
      • **Cite portfolio when you find information there through search**
      • Maximum 3-5 citations per response for readability
      
      RESPONSE EXAMPLES
      
      Example Question: "What are their key achievements?"
      Example Response:
      • Built a real-time fraud detection system processing 1M+ daily transactions [Project:"Fraud Detection"]{P1}
      • Achieved 99.2% precision with only 8 false positives per 1000 alerts [Page:"Real-Time Fraud Detection System L11"]{PG1}
      • Reduced false positives by 35% compared to previous rule-based system [Bullet:"reduced false positives"]{B3}
      • Implemented ensemble ML models combining XGBoost, Random Forest, and Neural Networks [Branch:"ensemble models"]{BR2}
      
      IMPORTANT: Always format ALL responses as bullet points, even for simple questions
      
      • For yes/no questions: Give a clear yes or no in first bullet, then provide evidence in additional bullets
      • For "what projects": List project names with brief descriptions in a natural paragraph or bullet list
      • For technical questions: Provide specific metrics and details from documentation
      • For accuracy/metrics: Always search page content first, then present the data naturally
      • Portfolio questions: Search if needed, then describe findings conversationally
      
      QUALITY BAR
      • No enumerating every skill. Choose the 2–3 strongest proofs.
      • If data conflicts, privilege resume bullets/branches; note conflict in Risk/Gap with a citation.
      
      Now answer using the format above.`;
      

      // Generate initial response with tools
      console.log('🤖 Sending prompt to AI with function declarations');
      console.log('🔧 Tools configured:', tools[0].functionDeclarations.map((f: any) => f.name));
      
      let result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: tools as any
      });
      let response = result.response;
      console.log('📊 AI response received, checking for function calls...');
      
      // Check if the model wants to use tools
      const candidate = response.candidates?.[0];
      const functionCalls = candidate?.content?.parts?.filter((part: any) => part.functionCall) || [];
      
      console.log('🔍 Function calls check:', {
        hasFunctionCalls: functionCalls.length > 0,
        count: functionCalls.length,
        calls: functionCalls.map((fc: any) => fc.functionCall?.name).filter(Boolean)
      });
      
      if (functionCalls.length > 0) {
        console.log('🔧 AI requested tool calls:', functionCalls.map((fc: any) => fc.functionCall?.name));
        
        const functionResponses: any[] = [];
        for (const part of functionCalls) {
          const call = part.functionCall;
          if (call?.name === "search_page_content") {
            const pageQuery = (call.args as any)?.pageQuery as string;
            console.log('📚 Searching for page:', pageQuery);
            
            const pageResult = await ctx.runQuery(api.dynamicFiles.getPublicPageContent, {
              resumeId: args.resumeId,
              pageQuery: pageQuery || ""
            });
            
            let responseObject: any = {};
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
              
              responseObject = {
                success: true,
                pageTitle: pageResult.page.title,
                pageId: idMap.forward[pageResult.page.id] || pageResult.page.id,
                content: numberedContent
              };
              console.log('✅ Found page:', pageResult.page.title);
            } else {
              responseObject = {
                success: false,
                error: pageResult.error || "Page not found",
                availablePages: pageResult.availablePages || []
              };
              console.log('❌ Page not found:', pageQuery);
            }
            
            functionResponses.push({
              functionResponse: {
                name: call.name,
                response: responseObject
              }
            });
          }
        }
        
        // Continue the conversation with function results
        console.log('🔄 Sending function results back to AI');
        console.log('📦 Function responses:', JSON.stringify(functionResponses, null, 2));
        
        // Build the conversation with function results
        const contents = [
          { role: "user", parts: [{ text: prompt }] },
          { role: "model", parts: candidate?.content?.parts || [] },
          { role: "function", parts: functionResponses }
        ];
        
        // Get final response with function results
        result = await model.generateContent({
          contents: contents as any,
          tools: tools
        });
        response = result.response;
      }
      
      let text = response.text();
      
      // Check if response includes grounding metadata
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      if (groundingMetadata) {
        console.log('🌐 Response grounded with web search:', {
          queries: groundingMetadata.webSearchQueries,
          sourcesCount: groundingMetadata.groundingChunks?.length || 0
        });
        
        // Add inline citations if grounding data is available
        if (groundingMetadata.groundingSupports && groundingMetadata.groundingChunks) {
          // Sort supports by end index in descending order
          const sortedSupports = [...groundingMetadata.groundingSupports].sort(
            (a: any, b: any) => {
              const aEndIndex = a.segment?.endIndex ?? 0;
              const bEndIndex = b.segment?.endIndex ?? 0;
              return bEndIndex - aEndIndex;
            }
          );
          
          for (const support of sortedSupports) {
            const segment = support.segment as any;
            const endIndex = segment?.endIndex;
            const chunkIndices = (support as any).groundingChunkIndices || (support as any).groundingChunckIndices;
            
            if (endIndex === undefined || !chunkIndices?.length) {
              continue;
            }
            
            // Add GitHub citation for GitHub URLs
            const chunks = groundingMetadata.groundingChunks;
            const isGitHubSource = chunkIndices.some((i: number) => {
              if (!chunks || !chunks[i]) return false;
              const uri = chunks[i]?.web?.uri;
              return uri && uri.includes('github.com');
            });
            
            if (isGitHubSource) {
              // Add GitHub citation marker
              text = text.slice(0, endIndex) + ' [GitHub:"Source"]{github}' + text.slice(endIndex);
            }
          }
        }
      }

      // Parse response to extract referenced IDs and map them back
      const parseResponse = (responseText: string) => {
        // Pattern to match [Type:"text"]{simpleId}
        const pattern = /\[(Project|Bullet|Branch):"([^"]+)"\]\{([PBR]+\d+)\}/g;
        const references: Array<{
          type: string;
          text: string;
          simpleId: string;
          convexId: string;
        }> = [];

        let match;
        while ((match = pattern.exec(responseText)) !== null) {
          const [, type, text, simpleId] = match;
          const convexId = idMap.reverse[simpleId];
          if (convexId) {
            references.push({
              type,
              text,
              simpleId,
              convexId
            });
          }
        }

        return {
          text: responseText,
          references
        };
      };

      const parsedResponse = parseResponse(text);

      // Convert to arrays for serialization (Convex has issues with nested objects)
      const reverseEntries = Object.entries(idMap.reverse);
      const forwardEntries = Object.entries(idMap.forward);

      return {
        response: parsedResponse.text,
        references: parsedResponse.references,
        idMappingArrays: {
          reverse: reverseEntries,
          forward: forwardEntries
        },
        success: true
      };
    } catch (error: any) {
      console.error("AI chat error:", error);
      
      // Return user-friendly error messages
      if (error.message?.includes("GEMINI_API_KEY")) {
        return {
          response: "The AI assistant is not configured. Please contact the administrator.",
          success: false,
          error: "Configuration error"
        };
      }
      
      if (error.message?.includes("429") || error.message?.includes("quota")) {
        return {
          response: "The AI service is temporarily unavailable due to rate limiting. Please try again in a moment.",
          success: false,
          error: "Rate limit"
        };
      }
      
      return {
        response: "I encountered an error while processing your request. Please try again.",
        success: false,
        error: error.message
      };
    }
  },
});