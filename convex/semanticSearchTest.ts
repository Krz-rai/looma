import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import { generateEmbeddings } from "../lib/embedding";

export const insertTestChunk = internalMutation({
  args: {
    resumeId: v.id("resumes"),
    sourceType: v.literal("page"),
    sourceId: v.string(),
    text: v.string(),
    model: v.string(),
    dim: v.number(),
    embedding: v.array(v.float64()),
  },
  returns: v.id("knowledgeChunks"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const chunkId = await ctx.db.insert("knowledgeChunks", {
      resumeId: args.resumeId,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      text: args.text,
      chunkIndex: 0,
      hash: `${args.sourceId}:0`,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("vectors", {
      resumeId: args.resumeId,
      chunkId,
      model: args.model,
      dim: args.dim,
      embedding: args.embedding,
      createdAt: now,
      updatedAt: now,
    });

    return chunkId;
  },
});

export const deleteTestData = internalMutation({
  args: {
    chunkIds: v.array(v.id("knowledgeChunks")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const chunkId of args.chunkIds) {
      const vectors = await ctx.db
        .query("vectors")
        .withIndex("by_chunk", (q) => q.eq("chunkId", chunkId))
        .collect();
      for (const vec of vectors) {
        await ctx.db.delete(vec._id);
      }
      await ctx.db.delete(chunkId);
    }
    return null;
  },
});

export const runSemanticSearchTest = action({
  args: {
    resumeId: v.optional(v.id("resumes")),
    paragraphs: v.array(v.object({ id: v.string(), text: v.string() })),
    queries: v.optional(v.array(v.object({ id: v.string(), query: v.string() }))),
    k: v.optional(v.number()),
    cleanup: v.optional(v.boolean()),
    embeddingModel: v.optional(v.string()),
  },
  returns: v.object({
    numItems: v.number(),
    kUsed: v.number(),
    top1Acc: v.number(),
    hitAtK: v.number(),
    mrr: v.number(),
    results: v.array(v.object({
      id: v.string(),
      expectedChunkId: v.string(),
      rank: v.union(v.number(), v.null()),
      found: v.boolean(),
      topPrediction: v.optional(v.object({ id: v.string(), score: v.number() })),
      scores: v.array(v.number()),
    })),
  }),
  handler: async (ctx, args) => {
    const model = args.embeddingModel; // if undefined, lib default is used
    const k = args.k ?? 5;
    const cleanup = args.cleanup ?? true;
    let resumeId: Id<"resumes"> = (args.resumeId as Id<"resumes">) || (await ctx.runMutation(internal.semanticSearchTest.createTestResume, {
      title: "Semantic Search Test Resume",
      userId: "test-user",
      isPublic: true,
    }));

    // 1) Embed paragraphs with large chunk size to force single-chunk per paragraph
    const insertedChunkIds: Array<Id<"knowledgeChunks">> = [];
    const idToChunkId: Record<string, string> = {};

    for (const p of args.paragraphs) {
      const emb = await generateEmbeddings(p.text, { model, chunkSize: 8192, overlap: 0 });
      if (emb.length === 0) {
        continue;
      }
      const e0 = emb[0];
      const sourceId = `test:${String(p.id)}`;
      const chunkId = await ctx.runMutation(internal.semanticSearchTest.insertTestChunk, {
        resumeId,
        sourceType: "page",
        sourceId,
        text: p.text,
        model: e0.model,
        dim: e0.dim,
        embedding: e0.embedding,
      });
      insertedChunkIds.push(chunkId);
      idToChunkId[p.id] = chunkId as any as string;
    }

    // 2) Build queries (default to the paragraph text itself)
    const testQueries = (args.queries && args.queries.length > 0)
      ? args.queries
      : args.paragraphs.map((p) => ({ id: p.id, query: p.text }));

    // 3) Run semantic search for each query and evaluate
    const results: Array<{
      id: string;
      expectedChunkId: string;
      rank: number | null;
      found: boolean;
      topPrediction?: { id: string; score: number };
      scores: Array<number>;
    }> = [];

    let hitsAt1 = 0;
    let hitsAtK = 0;
    let mrrSum = 0;

    for (const q of testQueries) {
      const expectedChunkId = idToChunkId[q.id];
      const response = await ctx.runAction((api as any).semanticSearch.searchKnowledgeAdvanced, {
        query: q.query,
        resumeId,
        limit: k,
      });

      const items: Array<{ id: string; score: number }> = (response?.results || []).map((r: any) => ({ id: r.id, score: r.score }));
      const top = items[0];
      const rank = items.findIndex((x) => x.id === expectedChunkId);
      const found = rank >= 0 && rank < k;
      if (rank === 0) hitsAt1 += 1;
      if (found) hitsAtK += 1;
      if (rank >= 0) mrrSum += 1 / (rank + 1);

      results.push({
        id: q.id,
        expectedChunkId,
        rank: rank >= 0 ? rank : null,
        found,
        topPrediction: top ? { id: top.id, score: top.score } : undefined,
        scores: items.map((i) => i.score),
      });
    }

    const numItems = testQueries.length;
    const top1Acc = numItems > 0 ? hitsAt1 / numItems : 0;
    const hitAtK = numItems > 0 ? hitsAtK / numItems : 0;
    const mrr = numItems > 0 ? mrrSum / numItems : 0;

    // 4) Cleanup test data if requested
    if (cleanup && insertedChunkIds.length > 0) {
      await ctx.runMutation(internal.semanticSearchTest.deleteTestData, { chunkIds: insertedChunkIds });
      // If we created the resume in this run, delete it as well
      if (!args.resumeId) {
        // Use an internal mutation to delete the resume (actions don't have db access)
        await ctx.runMutation(internal.semanticSearchTest.deleteResume, { resumeId });
      }
    }

    return {
      numItems,
      kUsed: k,
      top1Acc,
      hitAtK,
      mrr,
      results,
    };
  },
});

export const createTestResume = internalMutation({
  args: {
    title: v.string(),
    userId: v.string(),
    isPublic: v.boolean(),
  },
  returns: v.id("resumes"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const resumeId = await ctx.db.insert("resumes", {
      userId: args.userId,
      title: args.title,
      description: undefined,
      name: undefined,
      role: undefined,
      email: undefined,
      phone: undefined,
      location: undefined,
      linkedIn: undefined,
      github: undefined,
      portfolio: undefined,
      university: undefined,
      degree: undefined,
      major: undefined,
      gpa: undefined,
      graduationDate: undefined,
      skills: undefined,
      isPublic: args.isPublic,
      createdAt: now,
      updatedAt: now,
    } as any);
    return resumeId;
  },
});

export const deleteResume = internalMutation({
  args: { resumeId: v.id("resumes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      await ctx.db.delete(args.resumeId);
    } catch (_) {
      // ignore
    }
    return null;
  },
});


