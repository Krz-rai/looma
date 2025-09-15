"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import Firecrawl from "@mendable/firecrawl-js";

export const scrapePortfolio = action({
  args: {
    url: v.string(),
    formats: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;

    if (!firecrawlApiKey) {
      console.error("❌ Firecrawl API key not configured");
      return {
        success: false,
        error: "Firecrawl not configured (API key missing)"
      };
    }

    console.log("🔥 Scraping portfolio:", args.url);

    try {
      // Create Firecrawl client
      const app = new Firecrawl({ apiKey: firecrawlApiKey });

      // Scrape the portfolio website
      const scrapeResponse = await app.scrape(args.url, {
        formats: ['markdown' as any],
        onlyMainContent: true,
        waitFor: 2000, // Wait for dynamic content
      });

      console.log("✅ Successfully scraped portfolio");

      // The scrapeResponse is a Document object with the scraped data
      return {
        success: true,
        url: args.url,
        title: scrapeResponse.metadata?.title || "Portfolio",
        description: scrapeResponse.metadata?.description || null,
        content: scrapeResponse.markdown || "",
        links: scrapeResponse.links || [],
        metadata: {
          ogTitle: scrapeResponse.metadata?.ogTitle,
          ogDescription: scrapeResponse.metadata?.ogDescription,
          ogImage: scrapeResponse.metadata?.ogImage,
          sourceURL: scrapeResponse.metadata?.sourceURL || args.url
        }
      };
    } catch (error) {
      console.error("❌ Firecrawl error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to scrape portfolio"
      };
    }
  },
});