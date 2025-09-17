import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";

export const list = query({
  args: {
    resumeId: v.id("resumes"),
  },
  handler: async (ctx, args) => {
    const resume = await ctx.db.get(args.resumeId);
    if (!resume) {
      return [];
    }
    
    const identity = await ctx.auth.getUserIdentity();
    const isOwner = identity?.subject === resume.userId;
    
    if (!resume.isPublic && !isOwner) {
      return [];
    }
    
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_resume_position", (q) => q.eq("resumeId", args.resumeId))
      .order("asc")
      .collect();
    
    return projects;
  },
});

export const get = query({
  args: {
    id: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
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
    
    return project;
  },
});

export const create = internalMutation({
  args: {
    resumeId: v.id("resumes"),
    title: v.string(),
    description: v.optional(v.string()),
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
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    const resume = await ctx.db.get(args.resumeId);
    if (!resume) {
      throw new Error("Resume not found");
    }
    
    let position = args.position;
    if (position === undefined) {
      const existingProjects = await ctx.db
        .query("projects")
        .withIndex("by_resume", (q) => q.eq("resumeId", args.resumeId))
        .collect();
      position = existingProjects.length;
    }
    
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      resumeId: args.resumeId,
      title: args.title,
      description: args.description,
      position,
      createdAt: now,
      updatedAt: now,
    });
    
    await ctx.db.patch(args.resumeId, { updatedAt: now });

    // Persist embeddings into unified knowledge base
    for (const e of args.embeddings) {
      const chunkId = await ctx.db.insert("knowledgeChunks", {
        resumeId: args.resumeId,
        sourceType: "project",
        sourceId: projectId as unknown as string,
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
    
    return projectId;
  },
});

export const createPublic = mutation({
  args: {
    resumeId: v.id("resumes"),
    title: v.string(),
    description: v.optional(v.string()),
    position: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    
    const resume = await ctx.db.get(args.resumeId);
    if (!resume) {
      throw new Error("Resume not found");
    }
    
    if (resume.userId !== identity.subject) {
      throw new Error("Not authorized");
    }
    
    let position = args.position;
    if (position === undefined) {
      const existingProjects = await ctx.db
        .query("projects")
        .withIndex("by_resume", (q) => q.eq("resumeId", args.resumeId))
        .collect();
      position = existingProjects.length;
    }
    
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      resumeId: args.resumeId,
      title: args.title,
      description: args.description,
      position,
      createdAt: now,
      updatedAt: now,
    });
    
    await ctx.db.patch(args.resumeId, { updatedAt: now });
    
    return projectId;
  },
});

export const getResume = internalQuery({
  args: {
    resumeId: v.id("resumes"),
  },
  returns: v.object({
    _id: v.id("resumes"),
    userId: v.string(),
  }),
  handler: async (ctx, args) => {
    const resume = await ctx.db.get(args.resumeId);
    if (!resume) {
      throw new Error("Resume not found");
    }
    return {
      _id: resume._id,
      userId: resume.userId,
    };
  },
});

export const update = mutation({
  args: {
    id: v.id("projects"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    position: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    
    const project = await ctx.db.get(args.id);
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
    
    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;
    if (args.position !== undefined) updates.position = args.position;
    
    await ctx.db.patch(args.id, updates);
    await ctx.db.patch(project.resumeId, { updatedAt: Date.now() });
    
    return args.id;
  },
});

export const remove = mutation({
  args: {
    id: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    
    const project = await ctx.db.get(args.id);
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
    
    const bulletPoints = await ctx.db
      .query("bulletPoints")
      .withIndex("by_project", (q) => q.eq("projectId", args.id))
      .collect();
    
    for (const bulletPoint of bulletPoints) {
      const branches = await ctx.db
        .query("branches")
        .withIndex("by_bullet_point", (q) => q.eq("bulletPointId", bulletPoint._id))
        .collect();
      
      for (const branch of branches) {
        await ctx.db.delete(branch._id);
      }
      
      await ctx.db.delete(bulletPoint._id);
    }
    
    await ctx.db.delete(args.id);
    await ctx.db.patch(project.resumeId, { updatedAt: Date.now() });
  },
});

export const reorder = mutation({
  args: {
    resumeId: v.id("resumes"),
    projectIds: v.array(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    
    const resume = await ctx.db.get(args.resumeId);
    if (!resume) {
      throw new Error("Resume not found");
    }
    
    if (resume.userId !== identity.subject) {
      throw new Error("Not authorized");
    }
    
    const now = Date.now();
    
    for (let i = 0; i < args.projectIds.length; i++) {
      await ctx.db.patch(args.projectIds[i], {
        position: i,
        updatedAt: now,
      });
    }
    
    await ctx.db.patch(args.resumeId, { updatedAt: now });
  },
});

export const connectPage = mutation({
  args: {
    projectId: v.id("projects"),
    pageId: v.optional(v.id("dynamicFiles")),
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
    
    // Verify the page exists and belongs to the same resume if pageId is provided
    if (args.pageId) {
      const page = await ctx.db.get(args.pageId);
      if (!page) {
        throw new Error("Page not found");
      }
      if (page.resumeId !== project.resumeId) {
        throw new Error("Page does not belong to the same resume");
      }
    }
    
    await ctx.db.patch(args.projectId, {
      connectedPageId: args.pageId || undefined,
      updatedAt: Date.now(),
    });
    
    await ctx.db.patch(project.resumeId, { updatedAt: Date.now() });
    
    return args.projectId;
  },
});

export const getConnectedPageContent = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    console.log("📄 Fetching connected page content for project:", args.projectId);
    
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      console.log("❌ Project not found:", args.projectId);
      return null;
    }
    
    if (!project.connectedPageId) {
      console.log("ℹ️ No connected page for project:", project.title);
      return null;
    }
    
    console.log("🔍 Fetching page:", project.connectedPageId);
    const page = await ctx.db.get(project.connectedPageId);
    if (!page) {
      console.log("❌ Connected page not found:", project.connectedPageId);
      return null;
    }
    
    console.log("📝 Fetching page content for:", page.title);
    const pageContent = await ctx.db
      .query("dynamicFileContent")
      .withIndex("by_file", (q) => q.eq("fileId", project.connectedPageId!))
      .first();
    
    console.log("✅ Successfully fetched page content:", {
      pageTitle: page.title,
      hasContent: !!pageContent?.content,
      contentSize: pageContent?.content ? JSON.stringify(pageContent.content).length : 0
    });
    
    return {
      pageId: page._id,
      pageTitle: page.title,
      content: pageContent?.content || null,
      projectTitle: project.title,
      projectId: project._id,
    };
  },
});