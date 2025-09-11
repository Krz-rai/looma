import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query("fileTemplates").collect();
  },
});

export const listByCategory = query({
  args: { category: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("fileTemplates")
      .withIndex("by_category", (q) => q.eq("category", args.category))
      .collect();
  },
});

export const seed = mutation({
  handler: async (ctx) => {
    // Clear existing templates first
    const existingTemplates = await ctx.db.query("fileTemplates").collect();
    for (const template of existingTemplates) {
      await ctx.db.delete(template._id);
    }

    const templates = [
      {
        name: "Portfolio",
        description: "Showcase your work with images, videos, and descriptions",
        icon: "Briefcase",
        category: "professional",
        initialContent: [
          {
            type: "heading",
            props: { level: 1 },
            content: "Portfolio",
          },
          {
            type: "heading",
            props: { level: 2 },
            content: "Featured Projects",
          },
          {
            type: "paragraph",
            content: "Showcase your best work here. Add images, videos, and detailed descriptions of your projects.",
          },
          {
            type: "bulletListItem",
            content: "Project 1: Add title and description",
          },
          {
            type: "bulletListItem",
            content: "Project 2: Include technologies used",
          },
          {
            type: "bulletListItem",
            content: "Project 3: Add links to live demos",
          },
        ],
      },
      {
        name: "Skills Matrix",
        description: "Display your skills with proficiency levels",
        icon: "BarChart",
        category: "professional",
        initialContent: [
          {
            type: "heading",
            props: { level: 1 },
            content: "Skills & Expertise",
          },
          {
            type: "heading",
            props: { level: 2 },
            content: "Technical Skills",
          },
          {
            type: "table",
            content: {
              type: "tableContent",
              rows: [
                { cells: ["Skill", "Proficiency", "Years"] },
                { cells: ["JavaScript", "Expert", "5+"] },
                { cells: ["React", "Advanced", "4"] },
                { cells: ["Node.js", "Intermediate", "3"] },
              ],
            },
          },
          {
            type: "heading",
            props: { level: 2 },
            content: "Soft Skills",
          },
          {
            type: "bulletListItem",
            content: "Leadership and team management",
          },
          {
            type: "bulletListItem",
            content: "Communication and presentation",
          },
        ],
      },
      {
        name: "References",
        description: "Professional references and recommendations",
        icon: "Users",
        category: "professional",
        initialContent: [
          {
            type: "heading",
            props: { level: 1 },
            content: "Professional References",
          },
          {
            type: "paragraph",
            content: "Contact information for professional references available upon request.",
          },
          {
            type: "heading",
            props: { level: 2 },
            content: "Reference 1",
          },
          {
            type: "paragraph",
            content: "Name: [Reference Name]\nTitle: [Position]\nCompany: [Company Name]\nRelationship: [How you know them]",
          },
        ],
      },
      {
        name: "Certifications",
        description: "Professional certifications and achievements",
        icon: "Award",
        category: "achievements",
        initialContent: [
          {
            type: "heading",
            props: { level: 1 },
            content: "Certifications & Achievements",
          },
          {
            type: "heading",
            props: { level: 2 },
            content: "Professional Certifications",
          },
          {
            type: "bulletListItem",
            content: "Certification Name - Issuing Organization (Year)",
          },
          {
            type: "heading",
            props: { level: 2 },
            content: "Awards & Recognition",
          },
          {
            type: "bulletListItem",
            content: "Award Name - Organization (Year)",
          },
        ],
      },
      {
        name: "Work Samples",
        description: "Documents, presentations, and other work samples",
        icon: "FileText",
        category: "professional",
        initialContent: [
          {
            type: "heading",
            props: { level: 1 },
            content: "Work Samples",
          },
          {
            type: "paragraph",
            content: "A collection of my professional work samples, including documents, presentations, and creative projects.",
          },
          {
            type: "heading",
            props: { level: 2 },
            content: "Documents",
          },
          {
            type: "paragraph",
            content: "Add links or descriptions of your work samples here.",
          },
        ],
      },
      {
        name: "Testimonials",
        description: "Client and colleague testimonials",
        icon: "MessageSquare",
        category: "social",
        initialContent: [
          {
            type: "heading",
            props: { level: 1 },
            content: "Testimonials",
          },
          {
            type: "paragraph",
            content: "What people say about working with me:",
          },
          {
            type: "paragraph",
            props: {
              backgroundColor: "blue",
              textColor: "white",
            },
            content: "\"Add a testimonial quote here...\" - Client Name, Company",
          },
        ],
      },
      {
        name: "Career Timeline",
        description: "Visual representation of your career journey",
        icon: "Calendar",
        category: "professional",
        initialContent: [
          {
            type: "heading",
            props: { level: 1 },
            content: "Career Timeline",
          },
          {
            type: "heading",
            props: { level: 2 },
            content: "2024 - Present",
          },
          {
            type: "heading",
            props: { level: 3 },
            content: "Current Position",
          },
          {
            type: "paragraph",
            content: "Company Name | Role\nDescribe your current role and key achievements.",
          },
          {
            type: "heading",
            props: { level: 2 },
            content: "2020 - 2024",
          },
          {
            type: "heading",
            props: { level: 3 },
            content: "Previous Position",
          },
          {
            type: "paragraph",
            content: "Company Name | Role\nDescribe your role and accomplishments.",
          },
        ],
      },
      {
        name: "Blank File",
        description: "Start with a blank file and add your own content",
        icon: "File",
        category: "custom",
        initialContent: [],
      },
    ];

    const now = Date.now();
    for (const template of templates) {
      await ctx.db.insert("fileTemplates", {
        ...template,
        createdAt: now,
      });
    }
  },
});