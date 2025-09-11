import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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

export const save = mutation({
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