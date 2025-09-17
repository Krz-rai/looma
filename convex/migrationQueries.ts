import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";

// Query functions to find items without embeddings
export const getBulletsWithoutEmbeddings = internalQuery({
  args: { limit: v.number() },
  returns: v.array(v.object({
    _id: v.id("bulletPoints"),
    projectId: v.id("projects"),
    content: v.string(),
  })),
  handler: async (ctx, args) => {
    const bullets = await ctx.db.query("bulletPoints").take(args.limit);
    const result = [];

    for (const bullet of bullets) {
      // Check if this bullet already has embeddings
      const existingChunk = await ctx.db
        .query("knowledgeChunks")
        .withIndex("by_source", (q) => q.eq("sourceType", "bullet_point").eq("sourceId", bullet._id as unknown as string))
        .first();

      if (!existingChunk) {
        result.push({
          _id: bullet._id,
          projectId: bullet.projectId,
          content: bullet.content,
        });
      }
    }

    return result;
  },
});

export const getProjectsWithoutEmbeddings = internalQuery({
  args: { limit: v.number() },
  returns: v.array(v.object({
    _id: v.id("projects"),
    resumeId: v.id("resumes"),
    title: v.string(),
    description: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    const projects = await ctx.db.query("projects").take(args.limit);
    const result = [];

    for (const project of projects) {
      // Check if this project already has embeddings
      const existingChunk = await ctx.db
        .query("knowledgeChunks")
        .withIndex("by_source", (q) => q.eq("sourceType", "project").eq("sourceId", project._id as unknown as string))
        .first();

      if (!existingChunk) {
        result.push({
          _id: project._id,
          resumeId: project.resumeId,
          title: project.title,
          description: project.description,
        });
      }
    }

    return result;
  },
});

export const getBranchesWithoutEmbeddings = internalQuery({
  args: { limit: v.number() },
  returns: v.array(v.object({
    _id: v.id("branches"),
    bulletPointId: v.id("bulletPoints"),
    content: v.string(),
  })),
  handler: async (ctx, args) => {
    const branches = await ctx.db.query("branches").take(args.limit);
    const result = [];

    for (const branch of branches) {
      // Check if this branch already has embeddings
      const existingChunk = await ctx.db
        .query("knowledgeChunks")
        .withIndex("by_source", (q) => q.eq("sourceType", "branch").eq("sourceId", branch._id as unknown as string))
        .first();

      if (!existingChunk) {
        result.push({
          _id: branch._id,
          bulletPointId: branch.bulletPointId,
          content: branch.content,
        });
      }
    }

    return result;
  },
});

export const getPagesWithoutEmbeddings = internalQuery({
  args: { limit: v.number() },
  returns: v.array(v.object({
    _id: v.id("dynamicFiles"),
    resumeId: v.id("resumes"),
    title: v.string(),
    content: v.any(),
  })),
  handler: async (ctx, args) => {
    const pages = await ctx.db.query("dynamicFiles").take(args.limit);
    const result = [];

    for (const page of pages) {
      // Check if this page already has embeddings
      const existingChunk = await ctx.db
        .query("knowledgeChunks")
        .withIndex("by_source", (q) => q.eq("sourceType", "page").eq("sourceId", page._id as unknown as string))
        .first();

      if (!existingChunk) {
        // Get the page content
        const content = await ctx.db
          .query("dynamicFileContent")
          .withIndex("by_file", (q) => q.eq("fileId", page._id))
          .first();

        result.push({
          _id: page._id,
          resumeId: page.resumeId,
          title: page.title,
          content: content?.content,
        });
      }
    }

    return result;
  },
});

export const getAudioSummariesWithoutEmbeddings = internalQuery({
  args: { limit: v.number() },
  returns: v.array(v.object({
    _id: v.id("audioTranscriptions"),
    dynamicFileId: v.id("dynamicFiles"),
    fileName: v.string(),
    summary: v.any(),
  })),
  handler: async (ctx, args) => {
    const audioTranscriptions = await ctx.db
      .query("audioTranscriptions")
      .filter((q) => q.neq(q.field("summary"), undefined))
      .take(args.limit);
    
    const result = [];

    for (const audio of audioTranscriptions) {
      // Check if this audio summary already has embeddings
      const existingChunk = await ctx.db
        .query("knowledgeChunks")
        .withIndex("by_source", (q) => q.eq("sourceType", "audio_summary").eq("sourceId", audio._id as unknown as string))
        .first();

      if (!existingChunk && audio.summary) {
        result.push({
          _id: audio._id,
          dynamicFileId: audio.dynamicFileId,
          fileName: audio.fileName,
          summary: audio.summary,
        });
      }
    }

    return result;
  },
});

// Mutation functions to save embeddings
export const saveBulletEmbeddings = internalMutation({
  args: {
    bulletId: v.id("bulletPoints"),
    projectId: v.id("projects"),
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
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    const now = Date.now();

    for (const e of args.embeddings) {
      const chunkId = await ctx.db.insert("knowledgeChunks", {
        resumeId: project.resumeId,
        sourceType: "bullet_point",
        sourceId: args.bulletId as unknown as string,
        text: e.content,
        chunkIndex: e.chunkIndex,
        hash: e.hash,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("vectors", {
        resumeId: project.resumeId,
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

export const saveProjectEmbeddings = internalMutation({
  args: {
    projectId: v.id("projects"),
    resumeId: v.id("resumes"),
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
    const now = Date.now();

    for (const e of args.embeddings) {
      const chunkId = await ctx.db.insert("knowledgeChunks", {
        resumeId: args.resumeId,
        sourceType: "project",
        sourceId: args.projectId as unknown as string,
        text: e.content,
        chunkIndex: e.chunkIndex,
        hash: e.hash,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("vectors", {
        resumeId: args.resumeId,
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

export const saveBranchEmbeddings = internalMutation({
  args: {
    branchId: v.id("branches"),
    bulletPointId: v.id("bulletPoints"),
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
    const bulletPoint = await ctx.db.get(args.bulletPointId);
    if (!bulletPoint) throw new Error("Bullet point not found");
    
    const project = await ctx.db.get(bulletPoint.projectId);
    if (!project) throw new Error("Project not found");

    const now = Date.now();

    for (const e of args.embeddings) {
      const chunkId = await ctx.db.insert("knowledgeChunks", {
        resumeId: project.resumeId,
        sourceType: "branch",
        sourceId: args.branchId as unknown as string,
        text: e.content,
        chunkIndex: e.chunkIndex,
        hash: e.hash,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("vectors", {
        resumeId: project.resumeId,
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

export const savePageEmbeddings = internalMutation({
  args: {
    pageId: v.id("dynamicFiles"),
    resumeId: v.id("resumes"),
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
    const now = Date.now();

    for (const e of args.embeddings) {
      const chunkId = await ctx.db.insert("knowledgeChunks", {
        resumeId: args.resumeId,
        sourceType: "page",
        sourceId: args.pageId as unknown as string,
        text: e.content,
        chunkIndex: e.chunkIndex,
        hash: e.hash,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("vectors", {
        resumeId: args.resumeId,
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

export const saveAudioSummaryEmbeddings = internalMutation({
  args: {
    audioId: v.id("audioTranscriptions"),
    dynamicFileId: v.id("dynamicFiles"),
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
    const file = await ctx.db.get(args.dynamicFileId);
    if (!file) throw new Error("File not found");

    const now = Date.now();

    for (const e of args.embeddings) {
      const chunkId = await ctx.db.insert("knowledgeChunks", {
        resumeId: file.resumeId,
        sourceType: "audio_summary",
        sourceId: args.audioId as unknown as string,
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
