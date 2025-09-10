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

      // Format resume data for context with simple IDs
      const resumeContext = `
Resume Owner: ${resume.name || resumeData.title}
${resume.role ? `Role: ${resume.role}` : ''}
Resume Title: ${resumeData.title}
${resumeData.description ? `Description: ${resumeData.description}` : ''}

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

      // Initialize Gemini with 2.5 Flash
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        generationConfig: {
          temperature: 0.3,  // Lower temperature for more focused, concise responses
          maxOutputTokens: 8192,
          topK: 40,
          topP: 0.95,
        }
      });

      // Build conversation context
      const conversationContext = args.conversationHistory 
        ? args.conversationHistory.map(msg => 
            `${msg.role.toUpperCase()}: ${msg.content}`
          ).join('\n\n')
        : '';

      // Create the prompt
      const prompt = `ROLE
      You are **Aurea**, an AI assistant reviewing a resume. You are NOT the resume owner.
      
      REFERENTS
      Call the candidate "${resume.name || 'the candidate'}"; use they/them. Never say "I" for their experience.
      
      DATA
      ${resumeContext}
      
      ${conversationContext ? `HISTORY\n${conversationContext}\n` : ''}QUESTION
      ${args.message}
      
      OBJECTIVE
      Answer the question using the DATA (and HISTORY if present). Be correct, brief, and helpful.
      
      RULES
      1) Use HISTORY to resolve pronouns/ellipsis ("so no?", "that one?", etc.).
      2) Start with **Yes/No** when applicable, then 1–2 short sentences of support.
      3) Cite only *specific* achievements from bullets/branches; never cite title/description.
         • Format inline after the sentence: [Bullet:"text"]{B1} or [Branch:"text"]{BR1}; project names inline as [Project:"Title"]{P1}.
         • Use the simple IDs provided (P1, B1, BR1 format), NOT long alphanumeric strings.
      4) Keep under **500 words**. Prefer 5-6 sentences per paragraph; blank line between topics.
      5) Avoid walls of text, exhaustive lists, and nested bullets. Use at most 3–5 simple bullets when useful.
      6) Summarize; group similar items; offer to expand on request.
      7) Tone: concise, professional, conversational. End with a helpful question when appropriate.
      
      PATTERNS
      • Summary (good): "${resume.name || 'The candidate'} led real-time fraud detection and built an ML pipeline [Bullet:"Built end-to-end ML pipeline"]{B1}, reaching 99.2% precision [Bullet:"Trained ensemble model"]{B2}."
      • Tech breadth (good): "Strong full-stack experience (Python, Java, TypeScript) and cloud-native tools (Docker, Kubernetes, Kafka)."
      
      TASK-SPECIFIC TIPS
      • "What are the branches?": Don’t list all. Say: "Branches cover X, Y, Z—which project should I open?"
      • "Tell me about the experience": Give a 2–3 sentence overview + 1–2 key highlights with citations.
      • "What projects are there?": List project names with 5–10 word descriptors; no bullets/branches by default.
      
      OUTPUT
      Short, skimmable paragraphs or a brief list (no sub-bullets). Offer deeper detail on request.`;

      // Generate response
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

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