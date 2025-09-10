import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

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

export const create = mutation({
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