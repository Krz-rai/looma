import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";

export const list = query({
  args: {
    bulletPointId: v.id("bulletPoints"),
  },
  handler: async (ctx, args) => {
    const bulletPoint = await ctx.db.get(args.bulletPointId);
    if (!bulletPoint) {
      return [];
    }
    
    const project = await ctx.db.get(bulletPoint.projectId);
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
    
    const branches = await ctx.db
      .query("branches")
      .withIndex("by_bullet_point_position", (q) => q.eq("bulletPointId", args.bulletPointId))
      .order("asc")
      .collect();
    
    return branches;
  },
});

export const get = query({
  args: {
    id: v.id("branches"),
  },
  handler: async (ctx, args) => {
    const branch = await ctx.db.get(args.id);
    if (!branch) {
      return null;
    }

    const bulletPoint = await ctx.db.get(branch.bulletPointId);
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

    return branch;
  },
});

export const listByResume = query({
  args: {
    resumeId: v.id("resumes"),
  },
  handler: async (ctx, args) => {
    const resume = await ctx.db.get(args.resumeId);
    if (!resume) {
      return {};
    }

    const identity = await ctx.auth.getUserIdentity();
    const isOwner = identity?.subject === resume.userId;

    if (!resume.isPublic && !isOwner) {
      return {};
    }

    // Get all projects for this resume
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_resume", (q) => q.eq("resumeId", args.resumeId))
      .collect();

    // Get all bullet points for all projects
    const allBulletPoints = await Promise.all(
      projects.map(project =>
        ctx.db
          .query("bulletPoints")
          .withIndex("by_project_position", (q) => q.eq("projectId", project._id))
          .collect()
      )
    );

    // Flatten the bullet points array
    const bulletPoints = allBulletPoints.flat();

    // Get branches for each bullet point
    const branchesByBulletPoint: Record<string, any[]> = {};

    for (const bulletPoint of bulletPoints) {
      const branches = await ctx.db
        .query("branches")
        .withIndex("by_bullet_point_position", (q) => q.eq("bulletPointId", bulletPoint._id))
        .order("asc")
        .collect();

      if (branches.length > 0) {
        branchesByBulletPoint[bulletPoint._id] = branches;
      }
    }

    return branchesByBulletPoint;
  },
});

export const create = internalMutation({
  args: {
    bulletPointId: v.id("bulletPoints"),
    content: v.string(),
    type: v.union(v.literal("text"), v.literal("audio"), v.literal("video")),
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
  returns: v.id("branches"),
  handler: async (ctx, args) => {
    const bulletPoint = await ctx.db.get(args.bulletPointId);
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
    
    let position = args.position;
    if (position === undefined) {
      const existingBranches = await ctx.db
        .query("branches")
        .withIndex("by_bullet_point", (q) => q.eq("bulletPointId", args.bulletPointId))
        .collect();
      position = existingBranches.length;
    }
    
    const now = Date.now();
    const branchId = await ctx.db.insert("branches", {
      bulletPointId: args.bulletPointId,
      content: args.content,
      type: args.type,
      position,
      createdAt: now,
      updatedAt: now,
    });
    
    await ctx.db.patch(bulletPoint._id, { hasBranches: true, updatedAt: now });
    await ctx.db.patch(project._id, { updatedAt: now });
    await ctx.db.patch(project.resumeId, { updatedAt: now });

    // Persist embeddings into unified knowledge base
    for (const e of args.embeddings) {
      const chunkId = await ctx.db.insert("knowledgeChunks", {
        resumeId: project.resumeId,
        sourceType: "branch",
        sourceId: branchId as unknown as string,
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
    
    return branchId;
  },
});

export const createPublic = mutation({
  args: {
    bulletPointId: v.id("bulletPoints"),
    content: v.string(),
    type: v.union(v.literal("text"), v.literal("audio"), v.literal("video")),
    position: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    
    const bulletPoint = await ctx.db.get(args.bulletPointId);
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
    
    let position = args.position;
    if (position === undefined) {
      const existingBranches = await ctx.db
        .query("branches")
        .withIndex("by_bullet_point", (q) => q.eq("bulletPointId", args.bulletPointId))
        .collect();
      position = existingBranches.length;
    }
    
    const now = Date.now();
    const branchId = await ctx.db.insert("branches", {
      bulletPointId: args.bulletPointId,
      content: args.content,
      type: args.type,
      position,
      createdAt: now,
      updatedAt: now,
    });
    
    await ctx.db.patch(bulletPoint._id, { hasBranches: true, updatedAt: now });
    await ctx.db.patch(project._id, { updatedAt: now });
    await ctx.db.patch(project.resumeId, { updatedAt: now });
    
    return branchId;
  },
});

export const getBulletPointAndResume = internalQuery({
  args: {
    bulletPointId: v.id("bulletPoints"),
  },
  returns: v.object({
    bulletPointId: v.id("bulletPoints"),
    projectId: v.id("projects"),
    resumeId: v.id("resumes"),
    resumeUserId: v.string(),
  }),
  handler: async (ctx, args) => {
    const bulletPoint = await ctx.db.get(args.bulletPointId);
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
    return {
      bulletPointId: bulletPoint._id,
      projectId: project._id,
      resumeId: project.resumeId,
      resumeUserId: resume.userId,
    };
  },
});

export const update = mutation({
  args: {
    id: v.id("branches"),
    content: v.optional(v.string()),
    type: v.optional(v.union(v.literal("text"), v.literal("audio"), v.literal("video"))),
    position: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    
    const branch = await ctx.db.get(args.id);
    if (!branch) {
      throw new Error("Branch not found");
    }
    
    const bulletPoint = await ctx.db.get(branch.bulletPointId);
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
    if (args.type !== undefined) updates.type = args.type;
    if (args.position !== undefined) updates.position = args.position;
    
    await ctx.db.patch(args.id, updates);
    await ctx.db.patch(bulletPoint._id, { updatedAt: Date.now() });
    await ctx.db.patch(project._id, { updatedAt: Date.now() });
    await ctx.db.patch(project.resumeId, { updatedAt: Date.now() });
    
    return args.id;
  },
});

export const remove = mutation({
  args: {
    id: v.id("branches"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    
    const branch = await ctx.db.get(args.id);
    if (!branch) {
      throw new Error("Branch not found");
    }
    
    const bulletPoint = await ctx.db.get(branch.bulletPointId);
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
    
    await ctx.db.delete(args.id);
    
    const remainingBranches = await ctx.db
      .query("branches")
      .withIndex("by_bullet_point", (q) => q.eq("bulletPointId", branch.bulletPointId))
      .collect();
    
    const now = Date.now();
    
    if (remainingBranches.length === 0) {
      await ctx.db.patch(bulletPoint._id, { hasBranches: false, updatedAt: now });
    } else {
      await ctx.db.patch(bulletPoint._id, { updatedAt: now });
    }
    
    await ctx.db.patch(project._id, { updatedAt: now });
    await ctx.db.patch(project.resumeId, { updatedAt: now });
  },
});

export const reorder = mutation({
  args: {
    bulletPointId: v.id("bulletPoints"),
    branchIds: v.array(v.id("branches")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    
    const bulletPoint = await ctx.db.get(args.bulletPointId);
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
    
    const now = Date.now();
    
    for (let i = 0; i < args.branchIds.length; i++) {
      await ctx.db.patch(args.branchIds[i], {
        position: i,
        updatedAt: now,
      });
    }
    
    await ctx.db.patch(bulletPoint._id, { updatedAt: now });
    await ctx.db.patch(project._id, { updatedAt: now });
    await ctx.db.patch(project.resumeId, { updatedAt: now });
  },
});