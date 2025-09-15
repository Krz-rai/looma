import { z } from 'zod';
import { validateUIMessages, UIMessage, Tool } from 'ai';
import {
  webSearchToolSchema,
  scrapePortfolioToolSchema,
  searchContentToolSchema,
  searchPageContentToolSchema
} from '@/types/tools';
import { tool } from 'ai';

/**
 * Metadata schema for message validation
 * Tracks message metrics and source information
 */
export const messageMetadataSchema = z.object({
  startTime: z.number().optional(),
  endTime: z.number().optional(),
  tokenEstimate: z.number().optional(),
  source: z.enum(['user', 'ai', 'system']).optional(),
  resumeId: z.string().optional(),
}).passthrough(); // Allow additional properties

/**
 * Custom data part schemas for different content types
 */
export const dataSchemas = {
  citation: z.object({
    type: z.string(),
    text: z.string(),
    id: z.string(),
    simpleId: z.string().optional(),
    convexId: z.string().optional(),
    timestamp: z.number().optional(),
    audioFileName: z.string().optional(),
  }),
  idMapping: z.object({
    forward: z.record(z.string()),
    reverse: z.record(z.string()),
  }),
  bulletAnalysis: z.object({
    bulletPointId: z.string(),
    projectTitle: z.string(),
    analysisBlocks: z.array(z.object({
      type: z.enum(['ai', 'citation']),
      content: z.string(),
      pageTitle: z.string().optional(),
      lineNumber: z.number().optional(),
    })),
  }),
};

// Define tools for validation
const validationTools = {
  web_search: tool(webSearchToolSchema),
  scrape_portfolio: tool(scrapePortfolioToolSchema),
  search_content: tool(searchContentToolSchema),
  search_page_content: tool(searchPageContentToolSchema),
} as const;

/**
 * Validate messages before sending to AI
 */
export async function validateOutgoingMessage(message: UIMessage) {
  try {
    const validated = await validateUIMessages({
      messages: [message],
      metadataSchema: messageMetadataSchema,
      dataSchemas,
      tools: validationTools as Record<string, Tool<unknown, unknown>>,
    });
    return validated[0];
  } catch (error) {
    console.warn('Message validation warning:', error);
    // Return original message if validation fails (non-blocking)
    return message;
  }
}

/**
 * Validate incoming messages from AI
 */
export async function validateIncomingMessages(messages: UIMessage[]) {
  try {
    return await validateUIMessages({
      messages,
      metadataSchema: messageMetadataSchema,
      dataSchemas,
      tools: validationTools as Record<string, Tool<unknown, unknown>>,
    });
  } catch (error) {
    console.warn('Incoming messages validation warning:', error);
    // Return original messages if validation fails (non-blocking)
    return messages;
  }
}