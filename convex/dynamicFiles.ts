import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

export const list = query({
  args: { resumeId: v.id("resumes") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("dynamicFiles")
      .withIndex("by_resume_position", (q) => q.eq("resumeId", args.resumeId))
      .collect();
  },
});

export const listPublic = query({
  args: { resumeId: v.id("resumes") },
  handler: async (ctx, args) => {
    const files = await ctx.db
      .query("dynamicFiles")
      .withIndex("by_resume_position", (q) => q.eq("resumeId", args.resumeId))
      .collect();
    
    // Filter to only show public files
    return files.filter(file => file.isPublic);
  },
});

export const get = query({
  args: { id: v.id("dynamicFiles") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    resumeId: v.id("resumes"),
    title: v.string(),
    icon: v.optional(v.string()),
    isPublic: v.boolean(),
    templateId: v.optional(v.id("fileTemplates")),
  },
  handler: async (ctx, args) => {
    const existingFiles = await ctx.db
      .query("dynamicFiles")
      .withIndex("by_resume", (q) => q.eq("resumeId", args.resumeId))
      .collect();
    
    const position = existingFiles.length;
    const now = Date.now();
    
    const fileId = await ctx.db.insert("dynamicFiles", {
      resumeId: args.resumeId,
      title: args.title,
      icon: args.icon,
      isPublic: args.isPublic,
      position,
      createdAt: now,
      updatedAt: now,
    });

    // Initialize with template content if provided
    if (args.templateId) {
      const template = await ctx.db.get(args.templateId);
      if (template && template.initialContent) {
        await ctx.db.insert("dynamicFileContent", {
          fileId,
          content: template.initialContent,
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return fileId;
  },
});

export const update = mutation({
  args: {
    id: v.id("dynamicFiles"),
    title: v.optional(v.string()),
    icon: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("dynamicFiles") },
  handler: async (ctx, args) => {
    // Delete the file content
    const content = await ctx.db
      .query("dynamicFileContent")
      .withIndex("by_file", (q) => q.eq("fileId", args.id))
      .first();
    
    if (content) {
      await ctx.db.delete(content._id);
    }
    
    // Delete the file itself
    await ctx.db.delete(args.id);
  },
});

export const reorder = mutation({
  args: {
    resumeId: v.id("resumes"),
    fileIds: v.array(v.id("dynamicFiles")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (let i = 0; i < args.fileIds.length; i++) {
      await ctx.db.patch(args.fileIds[i], {
        position: i,
        updatedAt: now,
      });
    }
  },
});