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

export const getPublicPageContent = query({
  args: {
    resumeId: v.id("resumes"),
    pageQuery: v.string() // Can be page title or page ID
  },
  handler: async (ctx, args) => {
    // First try to find by exact title match
    let page = await ctx.db
      .query("dynamicFiles")
      .withIndex("by_resume", (q) => q.eq("resumeId", args.resumeId))
      .filter((q) => q.and(
        q.eq(q.field("isPublic"), true),
        q.eq(q.field("title"), args.pageQuery)
      ))
      .first();

    // If not found by title, try case-insensitive partial match
    if (!page) {
      const allPublicPages = await ctx.db
        .query("dynamicFiles")
        .withIndex("by_resume", (q) => q.eq("resumeId", args.resumeId))
        .filter((q) => q.eq(q.field("isPublic"), true))
        .collect();

      const queryLower = args.pageQuery.toLowerCase();
      page = allPublicPages.find(p =>
        p.title.toLowerCase().includes(queryLower) ||
        p._id.includes(args.pageQuery)
      ) || null;
    }

    if (!page) {
      return {
        success: false,
        error: `No public page found matching "${args.pageQuery}"`,
        availablePages: await ctx.db
          .query("dynamicFiles")
          .withIndex("by_resume", (q) => q.eq("resumeId", args.resumeId))
          .filter((q) => q.eq(q.field("isPublic"), true))
          .collect()
          .then(pages => pages.map(p => p.title))
      };
    }

    // Get the page content
    const content = await ctx.db
      .query("dynamicFileContent")
      .withIndex("by_file", (q) => q.eq("fileId", page._id))
      .first();

    // Get audio transcriptions for this page
    const transcriptions = await ctx.db
      .query("audioTranscriptions")
      .withIndex("by_dynamic_file", (q) => q.eq("dynamicFileId", page._id))
      .filter((q) => q.eq(q.field("status"), "completed"))
      .collect();

    // Format content with transcriptions included
    let enhancedContent = content?.content || null;

    // If there are transcriptions, append them to the content for AI visibility
    if (transcriptions.length > 0 && enhancedContent) {
      // Add transcriptions as a special section that the AI can see
      const transcriptionSection = transcriptions.map((t, index) => {
        // If segments exist, format with timestamps for each segment
        if (t.segments && t.segments.length > 0) {
          const segmentContent = t.segments.map((seg: any, segIdx: number) => ({
            type: "text",
            text: `\n[TS${segIdx+1}:${Math.floor(seg.start)}s] ${seg.text}`,
            styles: {}
          }));

          return {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: `\n[Audio Transcription ${index + 1}: ${t.fileName} AudioID:${t._id}]`,
                styles: { bold: true }
              },
              ...segmentContent,
              ...(t.language ? [{
                type: "text",
                text: `\n(Language: ${t.language}${t.duration ? `, Duration: ${Math.round(t.duration)}s` : ''})`,
                styles: { italic: true }
              }] : [])
            ]
          };
        } else {
          // Fallback to full transcription without timestamps
          return {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: `\n[Audio Transcription ${index + 1}: ${t.fileName} AudioID:${t._id}]`,
                styles: { bold: true }
              },
              {
                type: "text",
                text: `\n${t.transcription}`,
                styles: {}
              },
              ...(t.language ? [{
                type: "text",
                text: `\n(Language: ${t.language}${t.duration ? `, Duration: ${Math.round(t.duration)}s` : ''})`,
                styles: { italic: true }
              }] : [])
            ]
          };
        }
      });

      // If content is an array (BlockNote format), append transcriptions
      if (Array.isArray(enhancedContent)) {
        enhancedContent = [...enhancedContent, ...transcriptionSection];
      } else if (typeof enhancedContent === 'string') {
        // If content is a string, append as text with timestamps
        const transcriptionText = transcriptions.map((t, index) => {
          if (t.segments && t.segments.length > 0) {
            const segmentText = t.segments.map((seg: any, segIdx: number) =>
              `[T${segIdx+1}:${Math.floor(seg.start)}s] ${seg.text}`
            ).join('\n');
            return `\n\n[Audio Transcription ${index + 1}: ${t.fileName} AudioID:${t._id}]\n${segmentText}${
              t.language ? `\n(Language: ${t.language}${t.duration ? `, Duration: ${Math.round(t.duration)}s` : ''})` : ''
            }`;
          } else {
            return `\n\n[Audio Transcription ${index + 1}: ${t.fileName} AudioID:${t._id}]\n${t.transcription}${
              t.language ? `\n(Language: ${t.language}${t.duration ? `, Duration: ${Math.round(t.duration)}s` : ''})` : ''
            }`;
          }
        }).join('');
        enhancedContent = enhancedContent + transcriptionText;
      }
    }

    return {
      success: true,
      page: {
        id: page._id,
        title: page.title,
        icon: page.icon,
        content: enhancedContent,
        transcriptions: transcriptions.map(t => ({
          id: t._id,
          fileName: t.fileName,
          transcription: t.transcription,
          language: t.language,
          duration: t.duration
        }))
      }
    };
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