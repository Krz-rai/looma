import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";

export const list = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      return [];
    }
    
    const resume = await ctx.db.get(project.resumeId);
    if (!resume) {
      return [];
    }
    
    const identity = await ctx.auth.getUserIdentity();
    const isOwner = identity?.subject === resume.userId;
    
    if (!resume.isPublic && !isOwner) {
      return [];
    }
    
    const bulletPoints = await ctx.db
      .query("bulletPoints")
      .withIndex("by_project_position", (q) => q.eq("projectId", args.projectId))
      .order("asc")
      .collect();
    
    return bulletPoints;
  },
});

export const get = query({
  args: {
    id: v.id("bulletPoints"),
  },
  handler: async (ctx, args) => {
    const bulletPoint = await ctx.db.get(args.id);
    if (!bulletPoint) {
      return null;
    }
    
    const project = await ctx.db.get(bulletPoint.projectId);
    if (!project) {
      return null;
    }
    
    const resume = await ctx.db.get(project.resumeId);
    if (!resume) {
      return null;
    }
    
    const identity = await ctx.auth.getUserIdentity();
    const isOwner = identity?.subject === resume.userId;
    
    if (!resume.isPublic && !isOwner) {
      return null;
    }
    
    return bulletPoint;
  },
});

export const create = internalMutation({
  args: {
    projectId: v.id("projects"),
    content: v.string(),
    position: v.optional(v.number()),
    embeddings: v.array(v.object({
      content: v.string(),
      chunkIndex: v.number(),
      hash: v.string(),
      model: v.string(),
      dim: v.number(),
      embedding: v.array(v.float64()),
    })),
  },
  returns: v.id("bulletPoints"),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    
    const resume = await ctx.db.get(project.resumeId);
    if (!resume) {
      throw new Error("Resume not found");
    }
    
    let position = args.position;
    if (position === undefined) {
      const existingBulletPoints = await ctx.db
        .query("bulletPoints")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
      position = existingBulletPoints.length;
    }
    
    const now = Date.now();
    const bulletPointId = await ctx.db.insert("bulletPoints", {
      projectId: args.projectId,
      content: args.content,
      position,
      hasBranches: false,
      createdAt: now,
      updatedAt: now,
    });
    
    await ctx.db.patch(project._id, { updatedAt: now });
    await ctx.db.patch(project.resumeId, { updatedAt: now });

    // Persist embeddings into unified knowledge base
    for (const e of args.embeddings) {
      const chunkId = await ctx.db.insert("knowledgeChunks", {
        resumeId: project.resumeId,
        sourceType: "bullet_point",
        sourceId: bulletPointId as unknown as string,
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

    return bulletPointId;
  },
});

export const getProjectAndResume = internalQuery({
  args: {
    projectId: v.id("projects"),
  },
  returns: v.object({
    projectId: v.id("projects"),
    resumeId: v.id("resumes"),
    resumeUserId: v.string(),
  }),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    const resume = await ctx.db.get(project.resumeId);
    if (!resume) {
      throw new Error("Resume not found");
    }
    return {
      projectId: project._id,
      resumeId: project.resumeId,
      resumeUserId: resume.userId,
    };
  },
});

export const update = mutation({
  args: {
    id: v.id("bulletPoints"),
    content: v.optional(v.string()),
    position: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    
    const bulletPoint = await ctx.db.get(args.id);
    if (!bulletPoint) {
      throw new Error("Bullet point not found");
    }
    
    const project = await ctx.db.get(bulletPoint.projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    
    const resume = await ctx.db.get(project.resumeId);
    if (!resume) {
      throw new Error("Resume not found");
    }
    
    if (resume.userId !== identity.subject) {
      throw new Error("Not authorized");
    }
    
    const updates: any = {
      updatedAt: Date.now(),
    };
    
    if (args.content !== undefined) updates.content = args.content;
    if (args.position !== undefined) updates.position = args.position;
    
    await ctx.db.patch(args.id, updates);
    await ctx.db.patch(project._id, { updatedAt: Date.now() });
    await ctx.db.patch(project.resumeId, { updatedAt: Date.now() });
    
    return args.id;
  },
});

export const remove = mutation({
  args: {
    id: v.id("bulletPoints"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    
    const bulletPoint = await ctx.db.get(args.id);
    if (!bulletPoint) {
      throw new Error("Bullet point not found");
    }
    
    const project = await ctx.db.get(bulletPoint.projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    
    const resume = await ctx.db.get(project.resumeId);
    if (!resume) {
      throw new Error("Resume not found");
    }
    
    if (resume.userId !== identity.subject) {
      throw new Error("Not authorized");
    }
    
    const branches = await ctx.db
      .query("branches")
      .withIndex("by_bullet_point", (q) => q.eq("bulletPointId", args.id))
      .collect();
    
    for (const branch of branches) {
      await ctx.db.delete(branch._id);
    }
    
    await ctx.db.delete(args.id);
    await ctx.db.patch(project._id, { updatedAt: Date.now() });
    await ctx.db.patch(project.resumeId, { updatedAt: Date.now() });
  },
});

export const reorder = mutation({
  args: {
    projectId: v.id("projects"),
    bulletPointIds: v.array(v.id("bulletPoints")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    
    const resume = await ctx.db.get(project.resumeId);
    if (!resume) {
      throw new Error("Resume not found");
    }
    
    if (resume.userId !== identity.subject) {
      throw new Error("Not authorized");
    }
    
    const now = Date.now();
    
    for (let i = 0; i < args.bulletPointIds.length; i++) {
      await ctx.db.patch(args.bulletPointIds[i], {
        position: i,
        updatedAt: now,
      });
    }
    
    await ctx.db.patch(project._id, { updatedAt: now });
    await ctx.db.patch(project.resumeId, { updatedAt: now });
  },
});