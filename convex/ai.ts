import { v } from "convex/values";
import { action } from "./_generated/server";
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
      
      // Build complete resume data structure first
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

          return {
            _id: project._id,
            title: project.title,
            description: project.description,
            position: project.position,
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

      // Format resume data for context with simple IDs
      const resumeContext = `
Resume Owner: ${resume.name || resumeData.title}
${resume.role ? `Role: ${resume.role}` : ''}
Resume Title: ${resumeData.title}
${resumeData.description ? `Description: ${resumeData.description}` : ''}
${resume.portfolio ? `
PORTFOLIO WEBSITE (MUST SEARCH): ${resume.portfolio}
**IMPORTANT**: This portfolio contains additional projects and details not listed below. Search it when answering about specific technologies or project types.
` : ''}
${githubContext}

Projects:
${resumeData.projects.map((project, pIndex) => `
  ${pIndex + 1}. ${project.title} (ID: ${project.simpleId})
  ${project.description ? `   Description: ${project.description}` : ''}
  
  Bullet Points:
  ${project.bulletPoints.map((bp: any) => `
    • ${bp.content} (ID: ${bp.simpleId})
    ${bp.branches.length > 0 ? `
      Branches:
      ${bp.branches.map((branch: any) => `
        - ${branch.content} (ID: ${branch.simpleId})`).join('\n')}` : ''}`).join('\n')}`).join('\n')}`;

      // Initialize Gemini with 2.5 Flash and Google Search grounding
      const genAI = new GoogleGenerativeAI(apiKey);
      
      // Enable Google Search grounding for real-time information
      // Using type assertion workaround for googleSearch field (SDK types not updated yet)
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash-preview-05-20",  // Using preview version that supports grounding
        generationConfig: {
          temperature: 1.2,  // Higher temperature for more thorough searching
          maxOutputTokens: 8192,
          topK: 64,  // Increased for broader search
          topP: 0.95,
        },
        tools: [{
          googleSearch: {}  // Simple search configuration
        } as any],  // Type assertion workaround until SDK updates
      });

      // Build conversation context
      const conversationContext = args.conversationHistory 
        ? args.conversationHistory.map(msg => 
            `${msg.role.toUpperCase()}: ${msg.content}`
          ).join('\n\n')
        : '';

      // Create the prompt
      const prompt = `ROLE & VOICE
      You are **Aurea**—a decisive, professional resume analyst. Give clear opinions and a structured answer. No small talk, no hedging, no "Let me…", no "As an AI…".
      
      IDENTITY
      You are not the candidate. Refer to them as "${resume.name || 'the candidate'}" and use they/them. Never use "I" to describe their experience.
      
      INPUTS
      DATA
      ${resumeContext}
      
      ${conversationContext ? `HISTORY
      ${conversationContext}
      ` : ''}QUESTION
      ${args.message}
      
      CRITICAL SEARCH REQUIREMENTS (MUST EXECUTE)
      • **ABSOLUTELY MANDATORY FOR EVERY QUESTION**: 
        1. ALWAYS search "${resume.portfolio ? resume.portfolio : 'portfolio'}" first
        2. When asked "Do they have any project in portfolio?" - YOU MUST SEARCH THE PORTFOLIO
        3. For ANY technology/skill question (AI, financial, mobile, etc.) - search "${resume.portfolio ? resume.portfolio : 'portfolio'} [keyword]"
        4. Search multiple times with different keywords if needed
      • **PORTFOLIO CONTAINS ADDITIONAL PROJECTS NOT IN RESUME DATA**:
        - Financial apps, AI projects, and other work NOT listed below
        - You MUST search portfolio to discover these projects
        - Never answer based only on resume data when portfolio exists
      • **SEARCH PATTERNS TO USE**:
        - "${resume.portfolio ? resume.portfolio : 'portfolio'} financial"
        - "${resume.portfolio ? resume.portfolio : 'portfolio'} AI"
        - "site:${resume.portfolio ? resume.portfolio.replace('https://', '').replace('http://', '') : 'domain'} [keyword]"
      • Portfolio URL: ${resume.portfolio ? resume.portfolio : 'Not provided'}
      • NEVER rely only on resume projects below - ALWAYS search portfolio first
      
      OUTPUT FORMAT (always follow)
      1) **Topline** — Direct answer in 1–2 sentences.
      2) **Evidence** — 2–3 bullets max with inline citations. Use • for bullets, NOT * asterisks.
      3) **Risk/Gap** — 0–1 bullet if relevant. Use • for bullets.
      4) **Next step** — Give your opinion on the question.
      End with: "Want details on X?"
      
      STYLE & LIMITS
      • ≤180 words. Skimmable. No nested bullets. Max 5 bullets total.
      • ALWAYS use • (bullet point character) for lists, NEVER use * (asterisk)
      • Prefer numbers/impact where available. Group similar items.
      • Be confident and specific; avoid hedging language ("maybe," "might").
      
      CITATIONS (strict)
      • Cite only concrete achievements/details; never cite title/description.
      • Use simple IDs from DATA:
        – Projects: [Project:"Title"]{P#}
        – Bullets:  [Bullet:"text"]{B#}
        – Branches: [Branch:"text"]{BR#}
      • External (REQUIRED when found via search):
        – Portfolio main: [Portfolio:"Portfolio website"]{portfolio}
        – Portfolio project: [Portfolio:"ProjectName"]{portfolio}
        – GitHub profile: [GitHub:"GitHub profile"]{github}
        – GitHub repo:    [GitHub:"repo-name"]{github:repo-name}
      • **ALWAYS cite portfolio when you find information there through search**
      • One citation per claim. Place immediately after the sentence.
      
      TASK TEMPLATES
      • Yes/No: Start with **Yes**/**No**, then one sentence why, then 1–2 Evidence bullets with citations.
      • "What projects?": List names + 5–10 word descriptors only (no bullets/branches).
      • "Branches?": Summarize 2–3 themes and ask which project to open.
      • "Do they have X in portfolio?": MUST search portfolio website first, then cite findings with [Portfolio:"ProjectName"]{portfolio}
      
      QUALITY BAR
      • No enumerating every skill. Choose the 2–3 strongest proofs.
      • If data conflicts, privilege resume bullets/branches; note conflict in Risk/Gap with a citation.
      
      Now answer using the format above.`;
      

      // Generate response with grounding
      const result = await model.generateContent(prompt);
      const response = result.response;
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