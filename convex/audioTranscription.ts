import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { api } from "./_generated/api";
import { experimental_transcribe as transcribe } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

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