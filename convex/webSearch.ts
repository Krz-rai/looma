"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { tavily } from "@tavily/core";

export const search = action({
  args: {
    query: v.string(),
    maxResults: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const tavilyApiKey = process.env.TAVILY_API_KEY;

    if (!tavilyApiKey) {
      console.error("❌ Tavily API key not configured");
      return {
        success: false,
        error: "Web search not configured (Tavily API key missing)"
      };
    }

    console.log("🔍 Web search for:", args.query);

    try {
      // Create Tavily client
      const tavilyClient = tavily({ apiKey: tavilyApiKey });

      // Perform search
      const searchResult = await tavilyClient.search(args.query, {
        maxResults: args.maxResults || 3,
        includeAnswer: true,
        includeRawContent: false,
      });

      console.log(`✅ Found ${searchResult.results.length} web results`);

      return {
        success: true,
        answer: searchResult.answer || null,
        results: searchResult.results.map((r: any) => ({
          title: r.title,
          url: r.url,
          content: r.content,
          score: r.score
        }))
      };
    } catch (error) {
      console.error("❌ Web search error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Web search failed"
      };
    }
  },
});