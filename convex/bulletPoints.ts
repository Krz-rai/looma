import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

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

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    content: v.string(),
    position: v.optional(v.number()),
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
    
    return bulletPointId;
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