import { v } from "convex/values";
import { mutation, query, action, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { experimental_transcribe as transcribe } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

// Generate upload URL for audio files
export const generateAudioUploadUrl = mutation({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    return await ctx.storage.generateUploadUrl();
  },
});

// Save audio metadata and create pending transcription
export const saveAudioMetadata = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    dynamicFileId: v.id("dynamicFiles"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const now = Date.now();

    // Create a pending transcription record
    const transcriptionId = await ctx.db.insert("audioTranscriptions", {
      dynamicFileId: args.dynamicFileId,
      storageId: args.storageId,
      fileName: args.fileName,
      transcription: "",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    return transcriptionId;
  },
});

// Transcribe audio using OpenAI Whisper via Vercel AI SDK
export const transcribeAudio = action({
  args: {
    transcriptionId: v.id("audioTranscriptions"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    try {
      // Update status to processing
      await ctx.runMutation(api.audioTranscription.updateTranscriptionStatus, {
        id: args.transcriptionId,
        status: "processing",
      });

      // Get the audio file URL from storage
      const audioUrl = await ctx.storage.getUrl(args.storageId);
      if (!audioUrl) {
        throw new Error("Failed to get audio URL from storage");
      }

      // Fetch the audio file
      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        throw new Error("Failed to fetch audio file");
      }

      // Get audio as ArrayBuffer (Convex runtime doesn't have Buffer)
      const audioArrayBuffer = await audioResponse.arrayBuffer();
      const audioUint8Array = new Uint8Array(audioArrayBuffer);

      // Get OpenAI API key from environment
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not configured");
      }

      // Create OpenAI provider with API key
      const openai = createOpenAI({
        apiKey,
      });

      // Transcribe using OpenAI Whisper with timestamps
      const result = await transcribe({
        model: openai.transcription('whisper-1'),
        audio: audioUint8Array,
        providerOptions: {
          openai: {
            response_format: 'verbose_json',
            timestamp_granularities: ['segment'], // Request segment-level timestamps
            // Language will be auto-detected by Whisper
          }
        }
      });

      // Save successful transcription
      await ctx.runMutation(api.audioTranscription.updateTranscription, {
        id: args.transcriptionId,
        transcription: result.text,
        language: result.language,
        duration: result.durationInSeconds,
        segments: result.segments?.map(segment => ({
          text: segment.text || "",
          start: segment.startSecond || 0,
          end: segment.endSecond || 0,
        })),
        status: "completed",
      });

      // Auto-generate summary after successful transcription
      try {
        console.log("Auto-generating summary for transcription:", args.transcriptionId);
        await ctx.runAction((api as any).embedActions.generateAudioSummaryWithEmbeddings, {
          transcriptionId: args.transcriptionId,
        });
        console.log("Summary auto-generated successfully");
      } catch (summaryError) {
        console.error("Failed to auto-generate summary:", summaryError);
        // Don't fail the transcription if summary generation fails
      }

      return {
        success: true,
        transcription: result.text,
        language: result.language,
        duration: result.durationInSeconds,
      };
    } catch (error: any) {
      console.error("Transcription error:", error);

      // Update status to failed with error message
      await ctx.runMutation(api.audioTranscription.updateTranscriptionStatus, {
        id: args.transcriptionId,
        status: "failed",
        error: error.message || "Transcription failed",
      });

      return {
        success: false,
        error: error.message || "Transcription failed",
      };
    }
  },
});

// Zod schema for structured bullet point summaries
const audioSummarySchema = z.object({
  bulletPoints: z.array(
    z.object({
      text: z.string().describe("Concise bullet point capturing key information from the transcription"),
      segmentReferences: z.array(
        z.object({
          segmentIndex: z.number().describe("Index of the source segment"),
          start: z.number().describe("Start timestamp in seconds"),
          end: z.number().describe("End timestamp in seconds"),
          originalText: z.string().describe("Exact text from the segment"),
        })
      ).describe("Source segments that support this bullet point"),
    })
  ).min(10).max(30).describe("Structured bullet points summarizing the audio transcription"),
});

// Generate AI summary of transcription with segment references
export const generateTranscriptionSummary = action({
  args: {
    transcriptionId: v.id("audioTranscriptions"),
  },
  handler: async (ctx, args): Promise<any> => {
    try {
      // Get the transcription with segments
      const transcription: any = await ctx.runQuery(api.audioTranscription.getTranscriptionById, {
        id: args.transcriptionId,
      });

      if (!transcription || !transcription.segments || transcription.segments.length === 0) {
        throw new Error("Transcription not found or has no segments");
      }

      // Get OpenAI API key
      const apiKey: string | undefined = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not configured");
      }

      // Create prompt for summary generation
      const segmentsText: string = transcription.segments.map((seg: { start: number; end: number; text: string }, idx: number) =>
        `[Segment ${idx}] (${formatTimestamp(seg.start)} - ${formatTimestamp(seg.end)}): ${seg.text}`
      ).join('\n\n');

      const prompt: string = `You are creating a structured summary of an audio transcription.
The transcription is divided into segments with timestamps.

TRANSCRIPTION:
${segmentsText}

TASK:
Create a comprehensive summary as bullet points (10-30 bullets). Each bullet should:
1. Preserve ALL important details, nuances, and specific information from the transcription
2. Use "He" or "She" based on the speaker's voice/context (never use "The speaker")
3. Maintain the exact meaning and details - do not simplify or generalize
4. Be concise but complete enough to capture the essential information
5. Reference the source segments that support the point

IMPORTANT:
- Generate between 10-30 bullet points to cover ALL content comprehensively
- Preserve specific details, numbers, names, examples, and exact phrasing
- Use "He" or "She" pronouns consistently based on the speaker
- Each bullet should be standalone and informative
- Include segment references for traceability
- Capture every meaningful statement, opinion, example, or piece of information`;

      // Use generateObject for structured output
      const { generateObject } = await import("ai");

      // Create OpenAI provider
      const openai = createOpenAI({
        apiKey,
      });

      const result: any = await generateObject({
        model: openai('gpt-4o'),
        schema: audioSummarySchema,
        system: "You are a helpful assistant that creates structured bullet point summaries of audio transcriptions.",
        prompt,
        temperature: 0.3,
        maxOutputTokens: 4000,
      });

      // Validate and enhance segment references with actual segment text
      const enhancedPoints: any[] = result.object.bulletPoints.map((point: any) => ({
        text: point.text,
        segmentReferences: point.segmentReferences.map((ref: any) => {
          const segment = transcription.segments![ref.segmentIndex];
          return {
            segmentIndex: ref.segmentIndex,
            start: segment.start,
            end: segment.end,
            originalText: segment.text,
          };
        }),
      }));

      // Save summary to database
      await ctx.runMutation(api.audioTranscription.updateTranscriptionSummary, {
        id: args.transcriptionId,
        summary: {
          points: enhancedPoints,
          generatedAt: Date.now(),
        },
      });

      return {
        success: true,
        summary: {
          points: enhancedPoints,
          generatedAt: Date.now(),
        },
      };
    } catch (error: any) {
      console.error("Summary generation error:", error);
      return {
        success: false,
        error: error.message || "Failed to generate summary",
      };
    }
  },
});

// Helper function to format timestamp
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Update transcription status
export const updateTranscriptionStatus = mutation({
  args: {
    id: v.id("audioTranscriptions"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
      error: args.error,
      updatedAt: Date.now(),
    });
  },
});

// Update transcription with results
export const updateTranscription = mutation({
  args: {
    id: v.id("audioTranscriptions"),
    transcription: v.string(),
    language: v.optional(v.string()),
    duration: v.optional(v.number()),
    segments: v.optional(v.array(v.object({
      text: v.string(),
      start: v.number(),
      end: v.number(),
    }))),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      transcription: args.transcription,
      language: args.language,
      duration: args.duration,
      segments: args.segments,
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

// Get transcriptions for a page
export const getTranscriptionsByPage = query({
  args: {
    dynamicFileId: v.id("dynamicFiles"),
  },
  handler: async (ctx, args) => {
    const transcriptions = await ctx.db
      .query("audioTranscriptions")
      .withIndex("by_dynamic_file", (q) => q.eq("dynamicFileId", args.dynamicFileId))
      .collect();

    // Get URLs for audio files
    const transcriptionsWithUrls = await Promise.all(
      transcriptions.map(async (t) => ({
        ...t,
        audioUrl: await ctx.storage.getUrl(t.storageId),
      }))
    );

    return transcriptionsWithUrls;
  },
});

// Query transcriptions by resume ID (fetches all transcriptions for all pages in a resume)
export const getTranscriptionsByResume = query({
  args: {
    resumeId: v.id("resumes"),
  },
  handler: async (ctx, args) => {
    // First get all dynamic files for this resume
    const dynamicFiles = await ctx.db
      .query("dynamicFiles")
      .withIndex("by_resume", (q) => q.eq("resumeId", args.resumeId))
      .collect();

    if (!dynamicFiles.length) {
      return [];
    }

    // Get all transcriptions for these dynamic files
    const allTranscriptions = await Promise.all(
      dynamicFiles.map(async (file) => {
        const transcriptions = await ctx.db
          .query("audioTranscriptions")
          .withIndex("by_dynamic_file", (q) => q.eq("dynamicFileId", file._id))
          .filter((q) => q.eq(q.field("status"), "completed"))
          .collect();

        return transcriptions.map(t => ({
          ...t,
          dynamicFileId: file._id
        }));
      })
    );

    // Flatten the array
    return allTranscriptions.flat();
  },
});

// Get transcription by ID
export const getTranscriptionById = query({
  args: {
    id: v.id("audioTranscriptions"),
  },
  handler: async (ctx, args) => {
    const transcription = await ctx.db.get(args.id);
    if (!transcription) return null;

    // Get URL for audio file
    const audioUrl = transcription.storageId
      ? await ctx.storage.getUrl(transcription.storageId)
      : null;

    return {
      ...transcription,
      audioUrl,
    };
  },
});

// Alias for simpler API access
export const get = getTranscriptionById;

// Update transcription summary
export const updateTranscriptionSummary = mutation({
  args: {
    id: v.id("audioTranscriptions"),
    summary: v.object({
      points: v.array(v.object({
        text: v.string(),
        segmentReferences: v.array(v.object({
          segmentIndex: v.number(),
          start: v.number(),
          end: v.number(),
          originalText: v.string(),
        })),
      })),
      generatedAt: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      summary: args.summary,
      updatedAt: Date.now(),
    });
  },
});

// Update display name for a transcription
export const updateDisplayName = mutation({
  args: {
    id: v.id("audioTranscriptions"),
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const transcription = await ctx.db.get(args.id);
    if (!transcription) {
      throw new Error("Transcription not found");
    }

    await ctx.db.patch(args.id, {
      displayName: args.displayName,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// Delete a transcription
export const deleteTranscription = mutation({
  args: {
    id: v.id("audioTranscriptions"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const transcription = await ctx.db.get(args.id);
    if (!transcription) {
      throw new Error("Transcription not found");
    }

    // Delete from storage
    await ctx.storage.delete(transcription.storageId);

    // Delete transcription record
    await ctx.db.delete(args.id);
  },
});

export const getTranscriptionAndResume = internalQuery({
  args: {
    transcriptionId: v.id("audioTranscriptions"),
  },
  returns: v.object({
    transcriptionId: v.id("audioTranscriptions"),
    dynamicFileId: v.id("dynamicFiles"),
    resumeId: v.id("resumes"),
    resumeUserId: v.string(),
  }),
  handler: async (ctx, args) => {
    const transcription = await ctx.db.get(args.transcriptionId);
    if (!transcription) {
      throw new Error("Transcription not found");
    }
    const file = await ctx.db.get(transcription.dynamicFileId);
    if (!file) {
      throw new Error("File not found");
    }
    const resume = await ctx.db.get(file.resumeId);
    if (!resume) {
      throw new Error("Resume not found");
    }
    return {
      transcriptionId: transcription._id,
      dynamicFileId: transcription.dynamicFileId,
      resumeId: file.resumeId,
      resumeUserId: resume.userId,
    };
  },
});

// Re-generate summaries and embeddings for existing transcriptions using new bullet point format
export const regenerateTranscriptionSummary = action({
  args: {
    transcriptionId: v.id("audioTranscriptions"),
  },
  handler: async (ctx, args): Promise<any> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Verify ownership
    const { resumeUserId } = await ctx.runQuery(internal.audioTranscription.getTranscriptionAndResume, {
      transcriptionId: args.transcriptionId,
    });
    if (resumeUserId !== identity.subject) {
      throw new Error("Not authorized");
    }

    try {
      // Generate new bullet point summary
      const summaryResult = await ctx.runAction(api.audioTranscription.generateTranscriptionSummary, {
        transcriptionId: args.transcriptionId,
      });

      if (summaryResult.success) {
        // Generate new embeddings with bullet point approach
        await ctx.runAction("embedActions:generateAudioSummaryWithEmbeddings" as any, {
          transcriptionId: args.transcriptionId,
        });
      }

      return summaryResult;
    } catch (error: any) {
      console.error("Failed to regenerate transcription summary:", error);
      return {
        success: false,
        error: error.message || "Failed to regenerate summary",
      };
    }
  },
});

// Batch regenerate all transcription summaries and embeddings for a resume
export const regenerateAllTranscriptionSummaries = action({
  args: {
    resumeId: v.id("resumes"),
  },
  handler: async (ctx, args): Promise<any> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    try {
      // Get all transcriptions for this resume
      const transcriptions = await ctx.runQuery(api.audioTranscription.getTranscriptionsByResume, {
        resumeId: args.resumeId,
      });

      const results = [];

      for (const transcription of transcriptions) {
        if (transcription.status === "completed" && transcription.segments && transcription.segments.length > 0) {
          try {
            console.log(`Regenerating summary for transcription ${transcription._id}`);

            // Generate new bullet point summary
            const summaryResult = await ctx.runAction(api.audioTranscription.generateTranscriptionSummary, {
              transcriptionId: transcription._id,
            });

            if (summaryResult.success) {
              // Generate new embeddings with bullet point approach
              await ctx.runAction("embedActions:generateAudioSummaryWithEmbeddings" as any, {
                transcriptionId: transcription._id,
              });

              results.push({
                transcriptionId: transcription._id,
                success: true,
              });
            } else {
              results.push({
                transcriptionId: transcription._id,
                success: false,
                error: summaryResult.error,
              });
            }
          } catch (error: any) {
            console.error(`Failed to regenerate summary for ${transcription._id}:`, error);
            results.push({
              transcriptionId: transcription._id,
              success: false,
              error: error.message,
            });
          }
        }
      }

      return {
        success: true,
        processedCount: results.length,
        results,
      };
    } catch (error: any) {
      console.error("Failed to batch regenerate transcription summaries:", error);
      return {
        success: false,
        error: error.message || "Failed to batch regenerate summaries",
      };
    }
  },
});

export const saveAudioSummaryEmbeddings = internalMutation({
  args: {
    transcriptionId: v.id("audioTranscriptions"),
    embeddings: v.array(v.object({
      content: v.string(),
      chunkIndex: v.number(),
      hash: v.string(),
      model: v.string(),
      dim: v.number(),
      embedding: v.array(v.float64()),
    })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const transcription = await ctx.db.get(args.transcriptionId);
    if (!transcription) {
      throw new Error("Transcription not found");
    }
    
    const file = await ctx.db.get(transcription.dynamicFileId);
    if (!file) {
      throw new Error("File not found");
    }

    const now = Date.now();

    // Clear existing embeddings for this audio summary
    const existingChunks = await ctx.db
      .query("knowledgeChunks")
      .withIndex("by_source", (q) => q.eq("sourceType", "audio_summary").eq("sourceId", args.transcriptionId as unknown as string))
      .collect();

    for (const chunk of existingChunks) {
      // Delete associated vectors
      const vectors = await ctx.db
        .query("vectors")
        .withIndex("by_chunk", (q) => q.eq("chunkId", chunk._id))
        .collect();
      for (const vector of vectors) {
        await ctx.db.delete(vector._id);
      }
      // Delete chunk
      await ctx.db.delete(chunk._id);
    }

    // Persist new embeddings into unified knowledge base
    for (const e of args.embeddings) {
      const chunkId = await ctx.db.insert("knowledgeChunks", {
        resumeId: file.resumeId,
        sourceType: "audio_summary",
        sourceId: args.transcriptionId as unknown as string,
        text: e.content,
        chunkIndex: e.chunkIndex,
        hash: e.hash,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("vectors", {
        resumeId: file.resumeId,
        chunkId,
        model: e.model,
        dim: e.dim,
        embedding: e.embedding,
        createdAt: now,
        updatedAt: now,
      });
    }

    return null;
  },
});