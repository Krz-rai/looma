import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

export const get = query({
  args: { fileId: v.id("dynamicFiles") },
  handler: async (ctx, args) => {
    const content = await ctx.db
      .query("dynamicFileContent")
      .withIndex("by_file", (q) => q.eq("fileId", args.fileId))
      .first();
    
    return content;
  },
});

export const save = internalMutation({
  args: {
    fileId: v.id("dynamicFiles"),
    content: v.any(),
    embeddings: v.array(v.object({
      content: v.string(),
      chunkIndex: v.number(),
      hash: v.string(),
      model: v.string(),
      dim: v.number(),
      embedding: v.array(v.float64()),
    })),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    console.log("Save mutation called with fileId:", args.fileId);
    console.log("Content to save:", JSON.stringify(args.content).substring(0, 200));
    
    const file = await ctx.db.get(args.fileId);
    if (!file) {
      throw new Error("File not found");
    }
    
    const existing = await ctx.db
      .query("dynamicFileContent")
      .withIndex("by_file", (q) => q.eq("fileId", args.fileId))
      .first();
    
    const now = Date.now();
    
    if (existing) {
      console.log("Updating existing content for file:", args.fileId);
      // Update existing content
      await ctx.db.patch(existing._id, {
        content: args.content,
        version: existing.version + 1,
        updatedAt: now,
      });
    } else {
      console.log("Creating new content for file:", args.fileId);
      // Create new content
      await ctx.db.insert("dynamicFileContent", {
        fileId: args.fileId,
        content: args.content,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
    }
    
    // Also update the file's updatedAt timestamp
    await ctx.db.patch(args.fileId, {
      updatedAt: now,
    });

    // Clear existing embeddings for this page
    const existingChunks = await ctx.db
      .query("knowledgeChunks")
      .withIndex("by_source", (q) => q.eq("sourceType", "page").eq("sourceId", args.fileId as unknown as string))
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
        sourceType: "page",
        sourceId: args.fileId as unknown as string,
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
    
    console.log("Content saved successfully");
    return { success: true };
  },
});

export const savePublic = mutation({
  args: {
    fileId: v.id("dynamicFiles"),
    content: v.any(),
  },
  handler: async (ctx, args) => {
    console.log("Save mutation called with fileId:", args.fileId);
    console.log("Content to save:", JSON.stringify(args.content).substring(0, 200));
    
    const existing = await ctx.db
      .query("dynamicFileContent")
      .withIndex("by_file", (q) => q.eq("fileId", args.fileId))
      .first();
    
    const now = Date.now();
    
    if (existing) {
      console.log("Updating existing content for file:", args.fileId);
      // Update existing content
      await ctx.db.patch(existing._id, {
        content: args.content,
        version: existing.version + 1,
        updatedAt: now,
      });
    } else {
      console.log("Creating new content for file:", args.fileId);
      // Create new content
      await ctx.db.insert("dynamicFileContent", {
        fileId: args.fileId,
        content: args.content,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
    }
    
    // Also update the file's updatedAt timestamp
    await ctx.db.patch(args.fileId, {
      updatedAt: now,
    });
    
    console.log("Content saved successfully");
    return { success: true };
  },
});

export const remove = mutation({
  args: { fileId: v.id("dynamicFiles") },
  handler: async (ctx, args) => {
    const content = await ctx.db
      .query("dynamicFileContent")
      .withIndex("by_file", (q) => q.eq("fileId", args.fileId))
      .first();
    
    if (content) {
      await ctx.db.delete(content._id);
    }
  },
});