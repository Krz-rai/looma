import { v } from "convex/values";
import { internalAction, action } from "./_generated/server";
import { generateEmbeddings, ChunkEmbedding } from "../lib/embedding";
import { internal } from "./_generated/api";

// Batch size for processing to avoid timeouts
const BATCH_SIZE = 10;

// Public action that can be called from the script
export const runBackfillEmbeddings: any = action({
  args: {
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    processedBullets: v.number(),
    processedProjects: v.number(),
    processedBranches: v.number(),
    processedPages: v.number(),
    processedAudioSummaries: v.number(),
    totalProcessed: v.number(),
    errors: v.array(v.string()),
  }),
  handler: async (ctx, args): Promise<any> => {
    // This is a public action, so we don't need authentication for the migration script
    return await ctx.runAction(internal.migrations.backfillEmbeddings, args);
  },
});

// Internal action that does the actual work
export const backfillEmbeddings = internalAction({
  args: {
    batchSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    processedBullets: v.number(),
    processedProjects: v.number(),
    processedBranches: v.number(),
    processedPages: v.number(),
    processedAudioSummaries: v.number(),
    totalProcessed: v.number(),
    errors: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const batchSize = args.batchSize || BATCH_SIZE;
    const dryRun = args.dryRun || false;
    
    console.log(`🚀 Starting embedding backfill (${dryRun ? 'DRY RUN' : 'LIVE'}, batch size: ${batchSize})`);
    
    const results = {
      processedBullets: 0,
      processedProjects: 0,
      processedBranches: 0,
      processedPages: 0,
      processedAudioSummaries: 0,
      totalProcessed: 0,
      errors: [] as string[],
    };

    try {
      // Process bullet points
      console.log("📝 Processing bullet points...");
      const bulletsResult = await ctx.runAction(internal.migrations.backfillBulletEmbeddings, {
        batchSize,
        dryRun,
      });
      results.processedBullets = bulletsResult.processed;
      results.errors.push(...bulletsResult.errors);

      // Process projects
      console.log("📁 Processing projects...");
      const projectsResult = await ctx.runAction(internal.migrations.backfillProjectEmbeddings, {
        batchSize,
        dryRun,
      });
      results.processedProjects = projectsResult.processed;
      results.errors.push(...projectsResult.errors);

      // Process branches
      console.log("🌿 Processing branches...");
      const branchesResult = await ctx.runAction(internal.migrations.backfillBranchEmbeddings, {
        batchSize,
        dryRun,
      });
      results.processedBranches = branchesResult.processed;
      results.errors.push(...branchesResult.errors);

      // Process pages
      console.log("📄 Processing pages...");
      const pagesResult = await ctx.runAction(internal.migrations.backfillPageEmbeddings, {
        batchSize,
        dryRun,
      });
      results.processedPages = pagesResult.processed;
      results.errors.push(...pagesResult.errors);

      // Process audio summaries
      console.log("🎵 Processing audio summaries...");
      const audioResult = await ctx.runAction(internal.migrations.backfillAudioSummaryEmbeddings, {
        batchSize,
        dryRun,
      });
      results.processedAudioSummaries = audioResult.processed;
      results.errors.push(...audioResult.errors);

      results.totalProcessed = 
        results.processedBullets +
        results.processedProjects +
        results.processedBranches +
        results.processedPages +
        results.processedAudioSummaries;

      console.log(`✅ Backfill complete! Processed ${results.totalProcessed} items`);
      console.log(`📊 Breakdown: ${results.processedBullets} bullets, ${results.processedProjects} projects, ${results.processedBranches} branches, ${results.processedPages} pages, ${results.processedAudioSummaries} audio summaries`);
      
      if (results.errors.length > 0) {
        console.warn(`⚠️ ${results.errors.length} errors occurred:`, results.errors);
      }

      return results;
    } catch (error) {
      console.error("❌ Backfill failed:", error);
      results.errors.push(`Backfill failed: ${error}`);
      return results;
    }
  },
});

// Helper function to extract text from BlockNote content
function extractTextFromBlockNote(content: any): string {
  if (!content) return '';

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((block: any) => {
      if (block.content && Array.isArray(block.content)) {
        return block.content.map((item: any) => {
          if (typeof item === 'string') return item;
          if (item.text) return item.text;
          return '';
        }).join('');
      }
      return '';
    }).filter(Boolean).join('\n');
  }

  return '';
}

export const backfillBulletEmbeddings = internalAction({
  args: {
    batchSize: v.number(),
    dryRun: v.boolean(),
  },
  returns: v.object({
    processed: v.number(),
    errors: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
      const bullets = await ctx.runQuery(internal.migrationQueries.getBulletsWithoutEmbeddings, {
      limit: args.batchSize,
    });

    let processed = 0;
    const errors: string[] = [];

    for (const bullet of bullets) {
      try {
        if (args.dryRun) {
          console.log(`[DRY RUN] Would process bullet: ${bullet._id} - "${bullet.content.substring(0, 50)}..."`);
          processed++;
          continue;
        }

        console.log(`Processing bullet: ${bullet._id}`);
        
        if (!bullet.content || bullet.content.trim().length === 0) {
          console.log(`Skipping bullet ${bullet._id} - no content`);
          continue;
        }

        const embeddings: Array<ChunkEmbedding> = await generateEmbeddings(bullet.content);
        
        await ctx.runMutation(internal.migrationQueries.saveBulletEmbeddings, {
          bulletId: bullet._id,
          projectId: bullet.projectId,
          embeddings: embeddings.map((e) => ({
            content: e.content,
            chunkIndex: e.chunkIndex,
            hash: e.hash,
            model: e.model,
            dim: e.dim,
            embedding: e.embedding,
          })),
        });

        processed++;
        console.log(`✅ Processed bullet: ${bullet._id}`);
      } catch (error) {
        const errorMsg = `Failed to process bullet ${bullet._id}: ${error}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    return { processed, errors };
  },
});

export const backfillProjectEmbeddings = internalAction({
  args: {
    batchSize: v.number(),
    dryRun: v.boolean(),
  },
  returns: v.object({
    processed: v.number(),
    errors: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const projects = await ctx.runQuery(internal.migrationQueries.getProjectsWithoutEmbeddings, {
      limit: args.batchSize,
    });

    let processed = 0;
    const errors: string[] = [];

    for (const project of projects) {
      try {
        if (args.dryRun) {
          console.log(`[DRY RUN] Would process project: ${project._id} - "${project.title}"`);
          processed++;
          continue;
        }

        console.log(`Processing project: ${project._id} - ${project.title}`);
        
        // Build content for embeddings - combine title and description
        const contentParts = [project.title];
        if (project.description) {
          contentParts.push(project.description);
        }
        const content = contentParts.join('\n\n');

        if (content.trim().length === 0) {
          console.log(`Skipping project ${project._id} - no content`);
          continue;
        }

        const embeddings: Array<ChunkEmbedding> = await generateEmbeddings(content);
        
        await ctx.runMutation(internal.migrationQueries.saveProjectEmbeddings, {
          projectId: project._id,
          resumeId: project.resumeId,
          embeddings: embeddings.map((e) => ({
            content: e.content,
            chunkIndex: e.chunkIndex,
            hash: e.hash,
            model: e.model,
            dim: e.dim,
            embedding: e.embedding,
          })),
        });

        processed++;
        console.log(`✅ Processed project: ${project._id}`);
      } catch (error) {
        const errorMsg = `Failed to process project ${project._id}: ${error}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    return { processed, errors };
  },
});

export const backfillBranchEmbeddings = internalAction({
  args: {
    batchSize: v.number(),
    dryRun: v.boolean(),
  },
  returns: v.object({
    processed: v.number(),
    errors: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const branches = await ctx.runQuery(internal.migrationQueries.getBranchesWithoutEmbeddings, {
      limit: args.batchSize,
    });

    let processed = 0;
    const errors: string[] = [];

    for (const branch of branches) {
      try {
        if (args.dryRun) {
          console.log(`[DRY RUN] Would process branch: ${branch._id} - "${branch.content.substring(0, 50)}..."`);
          processed++;
          continue;
        }

        console.log(`Processing branch: ${branch._id}`);
        
        if (!branch.content || branch.content.trim().length === 0) {
          console.log(`Skipping branch ${branch._id} - no content`);
          continue;
        }

        const embeddings: Array<ChunkEmbedding> = await generateEmbeddings(branch.content);
        
        await ctx.runMutation(internal.migrationQueries.saveBranchEmbeddings, {
          branchId: branch._id,
          bulletPointId: branch.bulletPointId,
          embeddings: embeddings.map((e) => ({
            content: e.content,
            chunkIndex: e.chunkIndex,
            hash: e.hash,
            model: e.model,
            dim: e.dim,
            embedding: e.embedding,
          })),
        });

        processed++;
        console.log(`✅ Processed branch: ${branch._id}`);
      } catch (error) {
        const errorMsg = `Failed to process branch ${branch._id}: ${error}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    return { processed, errors };
  },
});

export const backfillPageEmbeddings = internalAction({
  args: {
    batchSize: v.number(),
    dryRun: v.boolean(),
  },
  returns: v.object({
    processed: v.number(),
    errors: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const pages = await ctx.runQuery(internal.migrationQueries.getPagesWithoutEmbeddings, {
      limit: args.batchSize,
    });

    let processed = 0;
    const errors: string[] = [];

    for (const page of pages) {
      try {
        if (args.dryRun) {
          console.log(`[DRY RUN] Would process page: ${page._id} - "${page.title}"`);
          processed++;
          continue;
        }

        console.log(`Processing page: ${page._id} - ${page.title}`);
        
        if (!page.content) {
          console.log(`Skipping page ${page._id} - no content`);
          continue;
        }

        // Extract text from BlockNote content
        const textContent = extractTextFromBlockNote(page.content);
        
        if (textContent.trim().length === 0) {
          console.log(`Skipping page ${page._id} - no meaningful text content`);
          continue;
        }

        const embeddings: Array<ChunkEmbedding> = await generateEmbeddings(textContent);
        
        await ctx.runMutation(internal.migrationQueries.savePageEmbeddings, {
          pageId: page._id,
          resumeId: page.resumeId,
          embeddings: embeddings.map((e) => ({
            content: e.content,
            chunkIndex: e.chunkIndex,
            hash: e.hash,
            model: e.model,
            dim: e.dim,
            embedding: e.embedding,
          })),
        });

        processed++;
        console.log(`✅ Processed page: ${page._id}`);
      } catch (error) {
        const errorMsg = `Failed to process page ${page._id}: ${error}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    return { processed, errors };
  },
});

export const backfillAudioSummaryEmbeddings = internalAction({
  args: {
    batchSize: v.number(),
    dryRun: v.boolean(),
  },
  returns: v.object({
    processed: v.number(),
    errors: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const audioSummaries = await ctx.runQuery(internal.migrationQueries.getAudioSummariesWithoutEmbeddings, {
      limit: args.batchSize,
    });

    let processed = 0;
    const errors: string[] = [];

    for (const audio of audioSummaries) {
      try {
        if (args.dryRun) {
          console.log(`[DRY RUN] Would process audio summary: ${audio._id} - "${audio.fileName}"`);
          processed++;
          continue;
        }

        console.log(`Processing audio summary: ${audio._id} - ${audio.fileName}`);
        
        if (!audio.summary || !audio.summary.points || audio.summary.points.length === 0) {
          console.log(`Skipping audio ${audio._id} - no summary points`);
          continue;
        }

        const summaryText = audio.summary.points.map((point: any) => point.text).join('\n\n');
        
        if (summaryText.trim().length === 0) {
          console.log(`Skipping audio ${audio._id} - no meaningful summary text`);
          continue;
        }

        const embeddings: Array<ChunkEmbedding> = await generateEmbeddings(summaryText);
        
        await ctx.runMutation(internal.migrationQueries.saveAudioSummaryEmbeddings, {
          audioId: audio._id,
          dynamicFileId: audio.dynamicFileId,
          embeddings: embeddings.map((e) => ({
            content: e.content,
            chunkIndex: e.chunkIndex,
            hash: e.hash,
            model: e.model,
            dim: e.dim,
            embedding: e.embedding,
          })),
        });

        processed++;
        console.log(`✅ Processed audio summary: ${audio._id}`);
      } catch (error) {
        const errorMsg = `Failed to process audio summary ${audio._id}: ${error}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    return { processed, errors };
  },
});