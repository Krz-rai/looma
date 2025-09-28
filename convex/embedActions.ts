"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { generateEmbeddings, ChunkEmbedding } from "../lib/embedding";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

export const createBulletWithEmbeddings = action({
  args: {
    projectId: v.id("projects"),
    content: v.string(),
    position: v.optional(v.number()),
  },
  returns: v.id("bulletPoints"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const { resumeUserId } = await ctx.runQuery(internal.bulletPoints.getProjectAndResume, {
      projectId: args.projectId,
    });
    if (resumeUserId !== identity.subject) {
      throw new Error("Not authorized");
    }

    const embeddings: Array<ChunkEmbedding> = await generateEmbeddings(args.content);

    const bulletId: Id<"bulletPoints"> = await ctx.runMutation(internal.bulletPoints.create, {
      projectId: args.projectId,
      content: args.content,
      position: args.position,
      embeddings: embeddings.map((e) => ({
        content: e.content,
        chunkIndex: e.chunkIndex,
        hash: e.hash,
        model: e.model,
        dim: e.dim,
        embedding: e.embedding,
      })),
    });

    return bulletId;
  },
});

export const createProjectWithEmbeddings = action({
  args: {
    resumeId: v.id("resumes"),
    title: v.string(),
    description: v.optional(v.string()),
    position: v.optional(v.number()),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const resume = await ctx.runQuery(internal.projects.getResume, {
      resumeId: args.resumeId,
    });
    if (resume.userId !== identity.subject) {
      throw new Error("Not authorized");
    }

    // Build content for embeddings - combine title and description
    const contentParts = [args.title];
    if (args.description) {
      contentParts.push(args.description);
    }
    const content = contentParts.join('\n\n');

    const embeddings: Array<ChunkEmbedding> = await generateEmbeddings(content);

    const projectId: Id<"projects"> = await ctx.runMutation(internal.projects.create, {
      resumeId: args.resumeId,
      title: args.title,
      description: args.description,
      position: args.position,
      embeddings: embeddings.map((e) => ({
        content: e.content,
        chunkIndex: e.chunkIndex,
        hash: e.hash,
        model: e.model,
        dim: e.dim,
        embedding: e.embedding,
      })),
    });

    return projectId;
  },
});

export const createBranchWithEmbeddings = action({
  args: {
    bulletPointId: v.id("bulletPoints"),
    content: v.string(),
    type: v.union(v.literal("text"), v.literal("audio"), v.literal("video")),
    position: v.optional(v.number()),
  },
  returns: v.id("branches"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const { resumeUserId } = await ctx.runQuery(internal.branches.getBulletPointAndResume, {
      bulletPointId: args.bulletPointId,
    });
    if (resumeUserId !== identity.subject) {
      throw new Error("Not authorized");
    }

    const embeddings: Array<ChunkEmbedding> = await generateEmbeddings(args.content);

    const branchId: Id<"branches"> = await ctx.runMutation(internal.branches.create, {
      bulletPointId: args.bulletPointId,
      content: args.content,
      type: args.type,
      position: args.position,
      embeddings: embeddings.map((e) => ({
        content: e.content,
        chunkIndex: e.chunkIndex,
        hash: e.hash,
        model: e.model,
        dim: e.dim,
        embedding: e.embedding,
      })),
    });

    return branchId;
  },
});

export const updatePageContentWithEmbeddings = action({
  args: {
    fileId: v.id("dynamicFiles"),
    content: v.any(),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const { resumeUserId } = await ctx.runQuery(internal.dynamicFiles.getFileAndResume, {
      fileId: args.fileId,
    });
    if (resumeUserId !== identity.subject) {
      throw new Error("Not authorized");
    }

    // Extract text from BlockNote content for embedding
    const textContent = extractTextFromBlockNote(args.content);
    
    // Only generate embeddings if there's meaningful text content
    let embeddings: Array<ChunkEmbedding> = [];
    if (textContent.trim().length > 0) {
      embeddings = await generateEmbeddings(textContent);
    }

    await ctx.runMutation(internal.dynamicFileContent.save, {
      fileId: args.fileId,
      content: args.content,
      embeddings: embeddings.map((e) => ({
        content: e.content,
        chunkIndex: e.chunkIndex,
        hash: e.hash,
        model: e.model,
        dim: e.dim,
        embedding: e.embedding,
      })),
    });

    return { success: true };
  },
});

export const generateAudioSummaryWithEmbeddings: any = action({
  args: {
    transcriptionId: v.id("audioTranscriptions"),
  },
  returns: v.object({
    success: v.boolean(),
    summary: v.optional(v.object({
      points: v.array(v.any()),
      generatedAt: v.number(),
    })),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<any> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const { resumeUserId } = await ctx.runQuery(internal.audioTranscription.getTranscriptionAndResume, {
      transcriptionId: args.transcriptionId,
    });
    if (resumeUserId !== identity.subject) {
      throw new Error("Not authorized");
    }

    // Call the existing summary generation logic
    const result = await ctx.runAction(api.audioTranscription.generateTranscriptionSummary, {
      transcriptionId: args.transcriptionId,
    });

    // If summary generation was successful, generate embeddings for each bullet point
    if (result.success && result.summary) {
      const bulletPoints = result.summary.points.map((point: any) => point.text);

      if (bulletPoints.length > 0) {
        // Generate embeddings for each bullet point individually
        const allEmbeddings: Array<ChunkEmbedding> = [];

        for (let i = 0; i < bulletPoints.length; i++) {
          const bulletText = bulletPoints[i];
          if (bulletText.trim().length > 0) {
            const bulletEmbeddings = await generateEmbeddings(bulletText);
            // Update chunk index to reflect bullet point position
            bulletEmbeddings.forEach((embedding) => {
              embedding.chunkIndex = i; // Use bullet point index as chunk index
              allEmbeddings.push(embedding);
            });
          }
        }

        // Save embeddings via internal mutation
        await ctx.runMutation(internal.audioTranscription.saveAudioSummaryEmbeddings, {
          transcriptionId: args.transcriptionId,
          embeddings: allEmbeddings.map((e) => ({
            content: e.content,
            chunkIndex: e.chunkIndex,
            hash: e.hash,
            model: e.model,
            dim: e.dim,
            embedding: e.embedding,
          })),
        });
      }
    }

    return result;
  },
});

// Helper function to extract text from BlockNote content
function extractTextFromBlockNote(content: any): string {
  if (!content) return '';

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((block: any) => {
      if (block.content && Array.isArray(block.content)) {
        return block.content.map((item: any) => {
          if (typeof item === 'string') return item;
          if (item.text) return item.text;
          return '';
        }).join('');
      }
      return '';
    }).filter(Boolean).join('\n');
  }

  return '';
}
