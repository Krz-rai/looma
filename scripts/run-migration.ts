#!/usr/bin/env npx tsx

/**
 * Migration script to backfill embeddings for existing data
 * 
 * Usage:
 *   npm run migration:dry-run   # Preview what would be processed
 *   npm run migration:run       # Actually run the migration
 *   npm run migration:run -- --batch-size=5  # Custom batch size
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

// Get Convex URL from environment
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!CONVEX_URL) {
  console.error("❌ NEXT_PUBLIC_CONVEX_URL environment variable is required");
  process.exit(1);
}

const client = new ConvexHttpClient(CONVEX_URL);

async function runMigration() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || process.env.DRY_RUN === 'true';
  const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
  const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : undefined;

  console.log('🚀 Starting embedding migration...');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE RUN'}`);
  if (batchSize) {
    console.log(`Batch size: ${batchSize}`);
  }

  if (dryRun) {
    console.log('🔍 This is a dry run - no changes will be made to the database');
  } else {
    console.log('⚠️  This will modify your database. Make sure you have a backup!');
    
    // Wait for confirmation in live mode
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const confirmation = await new Promise<string>((resolve) => {
      rl.question('Continue? (y/N): ', resolve);
    });
    rl.close();

    if (confirmation.toLowerCase() !== 'y' && confirmation.toLowerCase() !== 'yes') {
      console.log('Migration cancelled');
      process.exit(0);
    }
  }

  try {
    console.log('🔄 Running backfill...');
    
    const result = await client.action(api.migrations.runBackfillEmbeddings, {
      dryRun,
      ...(batchSize && { batchSize }),
    });

    console.log('\n📊 Migration Results:');
    console.log(`✅ Total processed: ${result.totalProcessed}`);
    console.log(`📝 Bullets: ${result.processedBullets}`);
    console.log(`📁 Projects: ${result.processedProjects}`);
    console.log(`🌿 Branches: ${result.processedBranches}`);
    console.log(`📄 Pages: ${result.processedPages}`);
    console.log(`🎵 Audio summaries: ${result.processedAudioSummaries}`);

    if (result.errors.length > 0) {
      console.log(`\n⚠️  Errors (${result.errors.length}):`);
      result.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`);
      });
    } else {
      console.log('\n🎉 No errors occurred!');
    }

    if (dryRun) {
      console.log('\n💡 This was a dry run. To actually run the migration, use:');
      console.log('npm run migration:run');
    } else {
      console.log('\n✅ Migration completed successfully!');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
