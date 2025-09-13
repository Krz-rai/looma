import { google } from "@ai-sdk/google";
import { convertToModelMessages, streamText, tool, UIMessage } from "ai";
import { httpRouter } from "convex/server";
import { z } from "zod";
import { api } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { Id } from "./_generated/dataModel";

const http = httpRouter();

http.route({
  path: "/api/chat",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const { messages, resumeId }: { messages: UIMessage[]; resumeId?: Id<"resumes"> } = await req.json();

    const lastMessages = messages.slice(-10);

    const result = streamText({
      model: google("gemini-2.5-flash"),
      system: `
      You are a helpful assistant that can search through pages and provide information.
      Use the search_page_content tool to retrieve detailed information about pages when needed.
      If the requested information is not available, respond with "Sorry, I can't find that information".
      You can use markdown formatting like links, bullet points, numbered lists, and bold text.
      Keep your responses concise and to the point.
      `,
      messages: convertToModelMessages(lastMessages),
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

export default http;