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
    connectedPageId: v.optional(v.id("dynamicFiles")),
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

  dynamicFiles: defineTable({
    resumeId: v.id("resumes"),
    title: v.string(),
    icon: v.optional(v.string()),
    isPublic: v.boolean(),
    position: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_resume", ["resumeId"])
    .index("by_resume_position", ["resumeId", "position"]),

  dynamicFileContent: defineTable({
    fileId: v.id("dynamicFiles"),
    content: v.optional(v.any()), // BlockNote content as JSON
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_file", ["fileId"]),

  fileTemplates: defineTable({
    name: v.string(),
    description: v.string(),
    icon: v.string(),
    initialContent: v.optional(v.any()), // BlockNote initial content
    category: v.string(),
    createdAt: v.number(),
  })
    .index("by_category", ["category"]),

  fileUploads: defineTable({
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
    dynamicFileId: v.id("dynamicFiles"),
    uploadedAt: v.number(),
  })
    .index("by_dynamic_file", ["dynamicFileId"]),

  audioTranscriptions: defineTable({
    dynamicFileId: v.id("dynamicFiles"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    displayName: v.optional(v.string()), // User-editable display name
    transcription: v.string(),
    language: v.optional(v.string()),
    duration: v.optional(v.number()),
    segments: v.optional(v.array(v.object({
      text: v.string(),
      start: v.number(),
      end: v.number(),
    }))),
    summary: v.optional(v.object({
      points: v.array(v.object({
        text: v.string(),
        segmentReferences: v.array(v.object({
          segmentIndex: v.number(),
          start: v.number(),
          end: v.number(),
          originalText: v.string(),
        })),
      })),
      generatedAt: v.number(),
    })),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_dynamic_file", ["dynamicFileId"])
    .index("by_status", ["status"]),
  // Unified knowledge base for the user's "mind"
  knowledgeChunks: defineTable({
    resumeId: v.id("resumes"),
    sourceType: v.union(
      v.literal("resume"),
      v.literal("project"),
      v.literal("bullet_point"),
      v.literal("branch"),
      v.literal("page"),
      v.literal("audio_summary"),
    ),
    sourceId: v.string(),
    text: v.string(),
    chunkIndex: v.number(),
    hash: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_resume", ["resumeId"]) 
    .index("by_source", ["sourceType", "sourceId"]) 
    .index("by_resume_and_hash", ["resumeId", "hash"]) 
    .searchIndex("search_text", {
      searchField: "text",
      filterFields: ["resumeId", "sourceType"],
    }),

  vectors: defineTable({
    resumeId: v.id("resumes"),
    chunkId: v.id("knowledgeChunks"),
    model: v.string(), 
    dim: v.number(),
    embedding: v.array(v.float64()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_resume_and_model", ["resumeId", "model"]) 
    .index("by_chunk", ["chunkId"]) 
    .vectorIndex("by_embedding_1536", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["resumeId", "model"],
      staged: false,
    })
    .vectorIndex("by_embedding_3072", {
      vectorField: "embedding",
      dimensions: 3072,
      filterFields: ["resumeId", "model"],
      staged: false,
    }),
});
