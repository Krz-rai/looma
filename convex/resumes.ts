import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }
    
    const resumes = await ctx.db
      .query("resumes")
      .withIndex("by_user_updated", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();
    
    return resumes;
  },
});

export const get = query({
  args: {
    id: v.id("resumes"),
  },
  handler: async (ctx, args) => {
    const resume = await ctx.db.get(args.id);
    
    if (!resume) {
      return null;
    }
    
    const identity = await ctx.auth.getUserIdentity();
    const isOwner = identity?.subject === resume.userId;
    
    if (!resume.isPublic && !isOwner) {
      return null;
    }
    
    return resume;
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    name: v.optional(v.string()),
    role: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    location: v.optional(v.string()),
    linkedIn: v.optional(v.string()),
    github: v.optional(v.string()),
    portfolio: v.optional(v.string()),
    university: v.optional(v.string()),
    degree: v.optional(v.string()),
    major: v.optional(v.string()),
    gpa: v.optional(v.string()),
    graduationDate: v.optional(v.string()),
    skills: v.optional(v.array(v.string())),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    
    const now = Date.now();
    const resumeId = await ctx.db.insert("resumes", {
      userId: identity.subject,
      title: args.title,
      description: args.description,
      name: args.name,
      role: args.role,
      email: args.email,
      phone: args.phone,
      location: args.location,
      linkedIn: args.linkedIn,
      github: args.github,
      portfolio: args.portfolio,
      university: args.university,
      degree: args.degree,
      major: args.major,
      gpa: args.gpa,
      graduationDate: args.graduationDate,
      skills: args.skills,
      isPublic: args.isPublic ?? false,
      createdAt: now,
      updatedAt: now,
    });
    
    return resumeId;
  },
});

export const update = mutation({
  args: {
    id: v.id("resumes"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    name: v.optional(v.string()),
    role: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    location: v.optional(v.string()),
    linkedIn: v.optional(v.string()),
    github: v.optional(v.string()),
    portfolio: v.optional(v.string()),
    university: v.optional(v.string()),
    degree: v.optional(v.string()),
    major: v.optional(v.string()),
    gpa: v.optional(v.string()),
    graduationDate: v.optional(v.string()),
    skills: v.optional(v.array(v.string())),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    
    const resume = await ctx.db.get(args.id);
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
    if (args.name !== undefined) updates.name = args.name;
    if (args.role !== undefined) updates.role = args.role;
    if (args.email !== undefined) updates.email = args.email;
    if (args.phone !== undefined) updates.phone = args.phone;
    if (args.location !== undefined) updates.location = args.location;
    if (args.linkedIn !== undefined) updates.linkedIn = args.linkedIn;
    if (args.github !== undefined) updates.github = args.github;
    if (args.portfolio !== undefined) updates.portfolio = args.portfolio;
    if (args.university !== undefined) updates.university = args.university;
    if (args.degree !== undefined) updates.degree = args.degree;
    if (args.major !== undefined) updates.major = args.major;
    if (args.gpa !== undefined) updates.gpa = args.gpa;
    if (args.graduationDate !== undefined) updates.graduationDate = args.graduationDate;
    if (args.skills !== undefined) updates.skills = args.skills;
    if (args.isPublic !== undefined) updates.isPublic = args.isPublic;
    
    await ctx.db.patch(args.id, updates);
    
    return args.id;
  },
});

export const remove = mutation({
  args: {
    id: v.id("resumes"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    
    const resume = await ctx.db.get(args.id);
    if (!resume) {
      throw new Error("Resume not found");
    }
    
    if (resume.userId !== identity.subject) {
      throw new Error("Not authorized");
    }
    
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_resume", (q) => q.eq("resumeId", args.id))
      .collect();
    
    for (const project of projects) {
      const bulletPoints = await ctx.db
        .query("bulletPoints")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
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
      
      await ctx.db.delete(project._id);
    }
    
    await ctx.db.delete(args.id);
  },
});