import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Generate an upload URL for file storage
export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    // TODO: Add authentication check here if needed
    // const identity = await ctx.auth.getUserIdentity();
    // if (!identity) {
    //   throw new Error("Unauthenticated");
    // }
    
    // Generate and return the upload URL
    return await ctx.storage.generateUploadUrl();
  },
});

// Save file metadata after successful upload and return the URL
export const saveFileMetadata = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
    dynamicFileId: v.id("dynamicFiles"),
  },
  handler: async (ctx, args) => {
    const fileId = await ctx.db.insert("fileUploads", {
      storageId: args.storageId,
      fileName: args.fileName,
      fileType: args.fileType,
      fileSize: args.fileSize,
      dynamicFileId: args.dynamicFileId,
      uploadedAt: Date.now(),
    });
    
    // Get the URL for the uploaded file
    const url = await ctx.storage.getUrl(args.storageId);
    
    return { fileId, url };
  },
});

// Get file URL from storage ID
export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

// Get all files for a dynamic file
export const getFilesByDynamicFile = query({
  args: { dynamicFileId: v.id("dynamicFiles") },
  handler: async (ctx, args) => {
    const files = await ctx.db
      .query("fileUploads")
      .withIndex("by_dynamic_file", (q) => q.eq("dynamicFileId", args.dynamicFileId))
      .collect();
    
    // Get URLs for all files
    const filesWithUrls = await Promise.all(
      files.map(async (file) => ({
        ...file,
        url: await ctx.storage.getUrl(file.storageId),
      }))
    );
    
    return filesWithUrls;
  },
});

// Delete a file
export const deleteFile = mutation({
  args: { fileId: v.id("fileUploads") },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) {
      throw new Error("File not found");
    }
    
    // Delete from storage
    await ctx.storage.delete(file.storageId);
    
    // Delete metadata
    await ctx.db.delete(args.fileId);
  },
});