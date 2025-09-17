import { v } from "convex/values";
import { action, query, internalQuery } from "./_generated/server";
import { generateEmbeddings } from "../lib/embedding";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

// Public action for semantic search that can be called by AI
export const searchKnowledge: any = action({
  args: {
    query: v.string(),
    resumeId: v.id("resumes"),
    limit: v.optional(v.number()),
    embeddingModel: v.optional(v.string()),
  },
  returns: v.object({
    results: v.array(v.object({
      id: v.string(),
      sourceType: v.string(),
      sourceId: v.string(),
      text: v.string(),
      chunkIndex: v.number(),
      score: v.number(),
      metadata: v.optional(v.any()),
    })),
    totalResults: v.number(),
    queryEmbeddingTime: v.number(),
    searchTime: v.number(),
  }),
  handler: async (ctx, args): Promise<any> => {
    const startTime = Date.now();
    
    // Generate embedding for the search query
    const embeddingStart = Date.now();
    const queryEmbeddings = await generateEmbeddings(args.query);
    const queryEmbeddingTime = Date.now() - embeddingStart;
    
    if (queryEmbeddings.length === 0) {
      return {
        results: [],
        totalResults: 0,
        queryEmbeddingTime,
        searchTime: 0,
      };
    }

    // Use the first (and typically only) embedding chunk for search
    const queryVector = queryEmbeddings[0].embedding;
    
    // Perform vector search
    const searchStart = Date.now();
    const searchResults = await ctx.runQuery(internal.semanticSearch.vectorSearch, {
      resumeId: args.resumeId,
      queryVector,
      limit: args.limit || 10,
      embeddingModel: queryEmbeddings[0].model,
    });
    const searchTime = Date.now() - searchStart;

    // Enrich results with metadata
    const enrichedResults = await Promise.all(
      searchResults.map(async (result: any) => {
        const metadata = await ctx.runQuery(internal.semanticSearch.getSourceMetadata, {
          sourceType: result.sourceType as any,
          sourceId: result.sourceId,
        });
        
        return {
          ...result,
          metadata,
        };
      })
    );

    return {
      results: enrichedResults,
      totalResults: searchResults.length,
      queryEmbeddingTime,
      searchTime,
    };
  },
});

// Internal query for vector search
export const vectorSearch = internalQuery({
  args: {
    resumeId: v.id("resumes"),
    queryVector: v.array(v.float64()),
    limit: v.number(),
    embeddingModel: v.string(),
  },
  returns: v.array(v.object({
    id: v.string(),
    sourceType: v.string(),
    sourceId: v.string(),
    text: v.string(),
    chunkIndex: v.number(),
    score: v.number(),
  })),
  handler: async (ctx, args) => {
    // Perform vector similarity search
    const results = await ctx.db
      .query("vectors")
      .withIndex("by_resume_and_model", (q) => 
        q.eq("resumeId", args.resumeId).eq("model", args.embeddingModel)
      )
      .filter((q) => q.eq(q.field("dim"), args.queryVector.length))
      .collect();

    // Calculate cosine similarity and sort by relevance
    const scoredResults = results.map((vector) => {
      const similarity = cosineSimilarity(args.queryVector, vector.embedding);
      return {
        vectorId: vector._id,
        chunkId: vector.chunkId,
        similarity,
      };
    }).sort((a, b) => b.similarity - a.similarity).slice(0, args.limit);

    // Get the corresponding knowledge chunks
    const enrichedResults = [];
    for (const result of scoredResults) {
      const chunk = await ctx.db.get(result.chunkId);
      if (chunk) {
        enrichedResults.push({
          id: chunk._id,
          sourceType: chunk.sourceType,
          sourceId: chunk.sourceId,
          text: chunk.text,
          chunkIndex: chunk.chunkIndex,
          score: result.similarity,
        });
      }
    }

    return enrichedResults;
  },
});

// Get metadata for different source types
export const getSourceMetadata = internalQuery({
  args: {
    sourceType: v.union(
      v.literal("bullet_point"),
      v.literal("project"),
      v.literal("branch"),
      v.literal("page"),
      v.literal("audio_summary")
    ),
    sourceId: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    try {
      switch (args.sourceType) {
        case "bullet_point": {
          const bullet = await ctx.db.get(args.sourceId as Id<"bulletPoints">);
          if (!bullet) return null;
          
          const project = await ctx.db.get(bullet.projectId);
          return {
            type: "bullet_point",
            content: bullet.content,
            position: bullet.position,
            projectTitle: project?.title,
            projectId: bullet.projectId,
          };
        }
        
        case "project": {
          const project = await ctx.db.get(args.sourceId as Id<"projects">);
          return project ? {
            type: "project",
            title: project.title,
            description: project.description,
            position: project.position,
          } : null;
        }
        
        case "branch": {
          const branch = await ctx.db.get(args.sourceId as Id<"branches">);
          if (!branch) return null;
          
          const bullet = await ctx.db.get(branch.bulletPointId);
          const project = bullet ? await ctx.db.get(bullet.projectId) : null;
          
          return {
            type: "branch",
            content: branch.content,
            branchType: branch.type,
            position: branch.position,
            bulletContent: bullet?.content,
            projectTitle: project?.title,
          };
        }
        
        case "page": {
          const page = await ctx.db.get(args.sourceId as Id<"dynamicFiles">);
          return page ? {
            type: "page",
            title: page.title,
            icon: page.icon,
            isPublic: page.isPublic,
            position: page.position,
            pageId: page._id,
          } : null;
        }
        
        case "audio_summary": {
          const audio = await ctx.db.get(args.sourceId as Id<"audioTranscriptions">);
          if (!audio) return null;
          
          const page = await ctx.db.get(audio.dynamicFileId);
          return {
            type: "audio_summary",
            fileName: audio.fileName,
            language: audio.language,
            duration: audio.duration,
            pageTitle: page?.title,
            pageId: audio.dynamicFileId,
            summaryPointsCount: audio.summary?.points?.length || 0,
          };
        }
        
        default:
          return null;
      }
    } catch (error) {
      console.error(`Error getting metadata for ${args.sourceType}:`, error);
      return null;
    }
  },
});

// Enhanced search with filtering options
export const searchKnowledgeAdvanced: any = action({
  args: {
    query: v.string(),
    resumeId: v.id("resumes"),
    limit: v.optional(v.number()),
    embeddingModel: v.optional(v.string()),
    sourceTypes: v.optional(v.array(v.string())),
    minScore: v.optional(v.number()),
  },
  returns: v.object({
    results: v.array(v.object({
      id: v.string(),
      sourceType: v.string(),
      sourceId: v.string(),
      text: v.string(),
      chunkIndex: v.number(),
      score: v.number(),
      metadata: v.optional(v.any()),
    })),
    totalResults: v.number(),
    queryEmbeddingTime: v.number(),
    searchTime: v.number(),
    filteredByScore: v.number(),
    filteredByType: v.number(),
  }),
  handler: async (ctx, args): Promise<any> => {
    const startTime = Date.now();
    
    // Generate embedding for the search query
    const embeddingStart = Date.now();
    const queryEmbeddings = await generateEmbeddings(args.query);
    const queryEmbeddingTime = Date.now() - embeddingStart;
    
    if (queryEmbeddings.length === 0) {
      return {
        results: [],
        totalResults: 0,
        queryEmbeddingTime,
        searchTime: 0,
        filteredByScore: 0,
        filteredByType: 0,
      };
    }

    // Use the first embedding chunk for search
    const queryVector = queryEmbeddings[0].embedding;
    
    // Perform vector search with filtering
    const searchStart = Date.now();
    const searchResults = await ctx.runQuery(internal.semanticSearch.vectorSearchAdvanced, {
      resumeId: args.resumeId,
      queryVector,
      limit: args.limit || 10,
      embeddingModel: queryEmbeddings[0].model,
      sourceTypes: args.sourceTypes,
      minScore: args.minScore || 0.1,
    });
    const searchTime = Date.now() - searchStart;

    // Enrich results with metadata
    const enrichedResults = await Promise.all(
      searchResults.results.map(async (result: any) => {
        const metadata = await ctx.runQuery(internal.semanticSearch.getSourceMetadata, {
          sourceType: result.sourceType as any,
          sourceId: result.sourceId,
        });
        
        return {
          ...result,
          metadata,
        };
      })
    );

    return {
      results: enrichedResults,
      totalResults: searchResults.results.length,
      queryEmbeddingTime,
      searchTime,
      filteredByScore: searchResults.filteredByScore,
      filteredByType: searchResults.filteredByType,
    };
  },
});

// Advanced vector search with filtering
export const vectorSearchAdvanced = internalQuery({
  args: {
    resumeId: v.id("resumes"),
    queryVector: v.array(v.float64()),
    limit: v.number(),
    embeddingModel: v.string(),
    sourceTypes: v.optional(v.array(v.string())),
    minScore: v.number(),
  },
  returns: v.object({
    results: v.array(v.object({
      id: v.string(),
      sourceType: v.string(),
      sourceId: v.string(),
      text: v.string(),
      chunkIndex: v.number(),
      score: v.number(),
    })),
    filteredByScore: v.number(),
    filteredByType: v.number(),
  }),
  handler: async (ctx, args) => {
    // Get all vectors for the resume and model
    const vectors = await ctx.db
      .query("vectors")
      .withIndex("by_resume_and_model", (q) => 
        q.eq("resumeId", args.resumeId).eq("model", args.embeddingModel)
      )
      .filter((q) => q.eq(q.field("dim"), args.queryVector.length))
      .collect();

    // Get corresponding knowledge chunks
    const chunks = await Promise.all(
      vectors.map(async (vector) => {
        const chunk = await ctx.db.get(vector.chunkId);
        return chunk ? { vector, chunk } : null;
      })
    );

    const validChunks = chunks.filter((item): item is NonNullable<typeof item> => item !== null);

    // Filter by source type if specified
    let filteredByType = 0;
    const typeFilteredChunks = args.sourceTypes 
      ? validChunks.filter((item) => {
          const included = args.sourceTypes!.includes(item.chunk.sourceType);
          if (!included) filteredByType++;
          return included;
        })
      : validChunks;

    // Calculate similarities and filter by score
    let filteredByScore = 0;
    const scoredResults = typeFilteredChunks.map((item) => {
      const similarity = cosineSimilarity(args.queryVector, item.vector.embedding);
      return {
        vector: item.vector,
        chunk: item.chunk,
        similarity,
      };
    }).filter((result) => {
      const passesScore = result.similarity >= args.minScore;
      if (!passesScore) filteredByScore++;
      return passesScore;
    }).sort((a, b) => b.similarity - a.similarity).slice(0, args.limit);

    // Format results
    const results = scoredResults.map((result) => ({
      id: result.chunk._id,
      sourceType: result.chunk.sourceType,
      sourceId: result.chunk.sourceId,
      text: result.chunk.text,
      chunkIndex: result.chunk.chunkIndex,
      score: result.similarity,
    }));

    return {
      results,
      filteredByScore,
      filteredByType,
    };
  },
});

// Utility function to calculate cosine similarity
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}
