import { query } from "./_generated/server";
import { v } from "convex/values";

// Helper function to extract text from BlockNote content
function extractText(content: any): string {
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

export const searchContent = query({
  args: {
    resumeId: v.id("resumes"),
    searchQuery: v.string(),
    includePages: v.boolean(),
    includeAudio: v.boolean(), // Actually searching echoes
    includeResume: v.optional(v.boolean()), // Search bullets, projects, branches
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const results: any[] = [];
    const searchLower = args.searchQuery.toLowerCase();
    const limit = args.limit || 10;

    console.log(`🔍 Searching for "${args.searchQuery}" in pages=${args.includePages}, echoes=${args.includeAudio}`);

    if (args.includePages) {
      // Get all public pages for this resume
      const pages = await ctx.db
        .query("dynamicFiles")
        .withIndex("by_resume", q => q.eq("resumeId", args.resumeId))
        .filter(q => q.eq(q.field("isPublic"), true))
        .collect();

      console.log(`📄 Searching ${pages.length} pages`);

      for (const page of pages) {
        if (results.length >= limit) break;

        // Get page content
        const contentDoc = await ctx.db
          .query("dynamicFileContent")
          .withIndex("by_file", q => q.eq("fileId", page._id))
          .first();

        if (contentDoc?.content) {
          const text = extractText(contentDoc.content);
          const textLower = text.toLowerCase();

          // Search for the query in the text
          const index = textLower.indexOf(searchLower);
          if (index !== -1) {
            // Find line number
            const lines = text.split('\n');
            let charCount = 0;
            let lineNum = 1;
            let matchedLine = '';

            for (let i = 0; i < lines.length; i++) {
              const lineLength = lines[i].length + 1; // +1 for newline
              if (charCount + lineLength > index) {
                lineNum = i + 1;
                matchedLine = lines[i];
                break;
              }
              charCount += lineLength;
            }

            // Extract context around the match (100 chars before and after)
            const contextStart = Math.max(0, index - 100);
            const contextEnd = Math.min(text.length, index + args.searchQuery.length + 100);
            const context = text.substring(contextStart, contextEnd);

            results.push({
              type: 'page',
              pageId: page._id,
              pageTitle: page.title,
              lineNumber: lineNum,
              matchedText: matchedLine.trim(),
              context: context.trim(),
              matchIndex: index,
            });

            console.log(`✅ Found in page "${page.title}" at line ${lineNum}`);
          }
        }
      }
    }

    if (args.includeAudio) {
      // Get all pages with echoes
      const pages = await ctx.db
        .query("dynamicFiles")
        .withIndex("by_resume", q => q.eq("resumeId", args.resumeId))
        .filter(q => q.eq(q.field("isPublic"), true))
        .collect();

      for (const page of pages) {
        if (results.length >= limit) break;

        // Get echoes for this page
        const transcriptions = await ctx.db
          .query("audioTranscriptions")
          .withIndex("by_dynamic_file", q => q.eq("dynamicFileId", page._id))
          .filter(q => q.eq(q.field("status"), "completed"))
          .collect();

        console.log(`🎵 Searching ${transcriptions.length} echoes for page "${page.title}"`);

        // Track global point number across all transcriptions for this page
        let globalPointNumber = 0;

        for (const trans of transcriptions) {
          if (results.length >= limit) break;

          // Only search in the summary points, not the full transcription
          if (trans.summary && trans.summary.points) {
            for (let i = 0; i < trans.summary.points.length; i++) {
              globalPointNumber++; // Increment for each point
              const point = trans.summary.points[i];
              const pointTextLower = point.text.toLowerCase();

              if (pointTextLower.includes(searchLower)) {
                results.push({
                  type: 'echo',
                  transcriptionId: trans._id,
                  fileName: trans.fileName,
                  displayName: trans.displayName,
                  timestamp: 0, // Summary points don't have timestamps
                  matchedText: point.text.trim(),
                  pageId: page._id,
                  pageTitle: page.title,
                  duration: trans.duration,
                  summaryPointIndex: i,
                  globalPointNumber: globalPointNumber, // Add the global point number
                });

                console.log(`✅ Found in echo "${trans.displayName || trans.fileName}" at global point ${globalPointNumber} (local point ${i + 1})`);
                break; // Only add first matching summary point per transcription
              }
            }
          } else {
            // Even if no summary, we still need to track that this transcription exists
            // (though we won't search in it since there's no summary)
          }
        }
      }
    }

    // Search resume content (bullets, projects, branches) if requested
    if (args.includeResume) {
      console.log(`📄 Searching resume content (bullets, projects, branches)`);
      
      // Search projects
      const projects = await ctx.db
        .query("projects")
        .withIndex("by_resume", q => q.eq("resumeId", args.resumeId))
        .collect();

      for (const project of projects) {
        // Search project title and description
        const projectText = `${project.title} ${project.description || ''}`.toLowerCase();
        if (projectText.includes(searchLower)) {
          results.push({
            type: 'project',
            projectId: project._id,
            projectTitle: project.title,
            matchedText: project.title,
            context: project.description || '',
            position: project.position,
          });
        }

        // Search bullets for this project
        const bullets = await ctx.db
          .query("bulletPoints")
          .withIndex("by_project", q => q.eq("projectId", project._id))
          .collect();

        for (const bullet of bullets) {
          if (bullet.content.toLowerCase().includes(searchLower)) {
            results.push({
              type: 'bullet',
              bulletId: bullet._id,
              projectId: project._id,
              projectTitle: project.title,
              matchedText: bullet.content,
              context: `Bullet point from ${project.title}`,
              position: bullet.position,
            });

            // Search branches for this bullet
            const branches = await ctx.db
              .query("branches")
              .withIndex("by_bullet_point", q => q.eq("bulletPointId", bullet._id))
              .collect();

            for (const branch of branches) {
              if (branch.content.toLowerCase().includes(searchLower)) {
                results.push({
                  type: 'branch',
                  branchId: branch._id,
                  bulletId: bullet._id,
                  projectId: project._id,
                  projectTitle: project.title,
                  matchedText: branch.content,
                  context: `Branch from bullet: ${bullet.content.substring(0, 50)}...`,
                  position: branch.position,
                });
              }
            }
          }
        }
      }
    }

    console.log(`🔍 Search complete. Found ${results.length} results`);

    return {
      query: args.searchQuery,
      results: results.slice(0, limit),
      totalFound: results.length,
    };
  },
});