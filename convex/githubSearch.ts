import { v } from "convex/values";
import { action } from "./_generated/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const searchGithubProject = action({
  args: {
    repoUrl: v.string(),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      // Get API key from environment
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not configured");
      }

      // Initialize Gemini
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
        }
      });

      // Create a focused prompt for searching the GitHub repository
      const prompt = `Visit this GitHub repository: ${args.repoUrl}

Please analyze and answer this specific question: ${args.query}

Focus on:
1. README content and documentation
2. Code structure and technologies used
3. Project purpose and features
4. Technical implementation details
5. Any relevant information to answer the query

Provide a concise, factual response based on what you find in the repository.`;

      // Generate response using Gemini's web browsing capability
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      return {
        success: true,
        response: text,
        repoUrl: args.repoUrl
      };

    } catch (error: any) {
      console.error("GitHub search error:", error);
      return {
        success: false,
        response: "Unable to search the GitHub repository at this time.",
        error: error.message
      };
    }
  },
});