import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
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

    // Get echoes for this page
    const transcriptions = await ctx.db
      .query("audioTranscriptions")
      .withIndex("by_dynamic_file", (q) => q.eq("dynamicFileId", page._id))
      .filter((q) => q.eq(q.field("status"), "completed"))
      .collect();

    // Format content with transcriptions included
    let enhancedContent = content?.content || null;

    // If there are echoes, append them to the content for AI visibility
    if (transcriptions.length > 0 && enhancedContent) {
      // Add ONLY echo points to the content that AI can see (no full transcripts)
      let globalPointCounter = 0; // Track point numbers across all echoes

      const transcriptionSection = transcriptions.map((t, index) => {
        // Only include summary, never the full transcript
        if (t.summary && t.summary.points) {
          const summaryContent = t.summary.points.map((point: any, pIdx: number) => {
            globalPointCounter++; // Increment for each point
            return {
              type: "text",
              text: `\n[Echo P${globalPointCounter}] ${point.text}`,
              styles: {}
            };
          });

          return {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: `\n[Echo: ${t.displayName || t.fileName}]`,
                styles: { bold: true }
              },
              ...summaryContent,
              ...(t.language ? [{
                type: "text",
                text: `\n(Language: ${t.language}${t.duration ? `, Duration: ${Math.round(t.duration)}s` : ''})`,
                styles: { italic: true }
              }] : [])
            ]
          };
        } else {
          // If no summary yet, just note the file exists but is processing
          return {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: `\n[Echo Processing: ${t.displayName || t.fileName}]`,
                styles: { italic: true }
              },
              {
                type: "text",
                text: "\n(Echo being generated...)",
                styles: { italic: true }
              }
            ]
          };
        }
      });

      // If content is an array (BlockNote format), append transcriptions
      if (Array.isArray(enhancedContent)) {
        enhancedContent = [...enhancedContent, ...transcriptionSection];
      } else if (typeof enhancedContent === 'string') {
        // If content is a string, append ONLY summaries as text
        let globalPointCounter = 0; // Track point numbers across all echoes

        const transcriptionText = transcriptions.map((t, index) => {
          if (t.summary && t.summary.points) {
            let text = `\n\n[Echo: ${t.displayName || t.fileName}]`;

            // Add summary points with continuous numbering
            t.summary.points.forEach((point: any, pIdx: number) => {
              globalPointCounter++;
              text += `\n[Echo P${globalPointCounter}] ${point.text}`;
            });

            // Add language and duration
            if (t.language) {
              text += `\n(Language: ${t.language}${t.duration ? `, Duration: ${Math.round(t.duration)}s` : ''})`;
            }

            return text;
          } else {
            // If no summary yet, just note the file exists
            return `\n\n[Echo Processing: ${t.displayName || t.fileName}]\n(Echo being generated...)`;
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

export const getFileAndResume = internalQuery({
  args: {
    fileId: v.id("dynamicFiles"),
  },
  returns: v.object({
    fileId: v.id("dynamicFiles"),
    resumeId: v.id("resumes"),
    resumeUserId: v.string(),
  }),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) {
      throw new Error("File not found");
    }
    const resume = await ctx.db.get(file.resumeId);
    if (!resume) {
      throw new Error("Resume not found");
    }
    return {
      fileId: file._id,
      resumeId: file.resumeId,
      resumeUserId: resume.userId,
    };
  },
});