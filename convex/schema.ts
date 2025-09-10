import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";


export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
  }),
  
  resumes: defineTable({
    userId: v.string(),
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
    isPublic: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_updated", ["userId", "updatedAt"]),
  
  projects: defineTable({
    resumeId: v.id("resumes"),
    title: v.string(),
    description: v.optional(v.string()),
    position: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_resume", ["resumeId"])
    .index("by_resume_position", ["resumeId", "position"]),
  
  bulletPoints: defineTable({
    projectId: v.id("projects"),
    content: v.string(),
    position: v.number(),
    hasBranches: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_position", ["projectId", "position"]),
  
  branches: defineTable({
    bulletPointId: v.id("bulletPoints"),
    content: v.string(),
    type: v.union(v.literal("text"), v.literal("audio"), v.literal("video")),
    position: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_bullet_point", ["bulletPointId"])
    .index("by_bullet_point_position", ["bulletPointId", "position"]),
});
