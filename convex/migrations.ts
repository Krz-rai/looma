import { mutation } from "./_generated/server";

export const clearFileTemplates = mutation({
  handler: async (ctx) => {
    // Delete all existing file templates
    const templates = await ctx.db.query("fileTemplates").collect();
    for (const template of templates) {
      await ctx.db.delete(template._id);
    }
    console.log(`Deleted ${templates.length} file templates`);
  },
});