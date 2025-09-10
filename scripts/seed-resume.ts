import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!CONVEX_URL) {
  console.error("NEXT_PUBLIC_CONVEX_URL is not set");
  process.exit(1);
}

async function seedResume() {
  const client = new ConvexHttpClient(CONVEX_URL!);
  
  try {
    console.log("Creating mock resume for karanraihp@gmail.com...");
    
    const result = await client.mutation(api.seed.createMockResume, {
      userEmail: "karanraihp@gmail.com"
    });
    
    console.log("✅ Mock resume created successfully!");
    console.log(`Resume ID: ${result.resumeId}`);
    console.log(`Projects: ${result.projectCount}`);
    console.log(`Bullet Points: ${result.bulletPointCount}`);
    console.log(`Branches: ${result.branchCount}`);
    console.log(`\nView the resume at: http://localhost:3001/resumes/${result.resumeId}`);
  } catch (error) {
    console.error("Error creating mock resume:", error);
  }
}

seedResume();