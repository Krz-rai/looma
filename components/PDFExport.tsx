"use client";

import React, { useState } from 'react';
import { Document, Page, Text, View, StyleSheet, pdf, Link } from '@react-pdf/renderer';
import { FileText } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { Id } from '../convex/_generated/dataModel';

// 4-point grid spacing system
// Base unit: 4px
// Scale: 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64
const spacing = {
  xs: 4,    // 4px
  sm: 8,    // 8px
  md: 12,   // 12px
  lg: 16,   // 16px
  xl: 20,   // 20px
  '2xl': 24,  // 24px
  '3xl': 32,  // 32px
  '4xl': 40,  // 40px
  '5xl': 48,  // 48px
  '6xl': 56,  // 56px
  '7xl': 64,  // 64px
};

// Typography scale based on 4-point system
const fontSize = {
  xs: 8,     // Small meta text
  sm: 10,    // Body text
  base: 12,  // Default text
  lg: 14,    // Subheadings
  xl: 16,    // Small headings
  '2xl': 20, // Section headings
  '3xl': 24, // Main heading
  '4xl': 28, // Large heading
};

// Consistent line heights
const lineHeight = {
  tight: 1.2,
  snug: 1.4,
  normal: 1.5,
  relaxed: 1.6,
  loose: 1.8,
};

// Clean, minimal Notion-like styles with proper spacing system
const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: fontSize.sm,
    lineHeight: lineHeight.relaxed,
    color: '#1f2937',
    paddingTop: spacing['5xl'],    // 48px
    paddingBottom: spacing['7xl'],  // 64px for footer space
    paddingHorizontal: spacing['6xl'], // 56px
    backgroundColor: 'white',
  },
  
  // Header section
  header: {
  },
  name: {
    fontSize: fontSize['3xl'],    // 24px
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: spacing.sm,     // 8px
    letterSpacing: -0.5,
    lineHeight: lineHeight.tight,
  },
  role: {
    fontSize: fontSize.lg,        // 14px
    fontWeight: 'normal',
    color: '#6b7280',
    lineHeight: lineHeight.snug,
  },
  summary: {
    fontSize: fontSize.sm,        // 10px
    lineHeight: lineHeight.relaxed,
    color: '#4b5563',
    marginTop: spacing.sm,        // 4px
  },
  
  // Live resume link (at top)
  liveResumeContainer: {
    marginTop: spacing.lg,        // 16px
    backgroundColor: '#f9fafb',
    padding: spacing.sm,          // 8px
    borderRadius: 3,
    alignItems: 'center',
  },
  liveResumeLink: {
    fontSize: fontSize.sm,        // 10px
    color: '#2563eb',
    textDecoration: 'none',
    fontWeight: 'medium',
  },
  
  // Divider
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginBottom: spacing.lg, 
    marginTop: spacing.lg,    // 16px - reduced from 24px
  },
  
  // Section styles
  section: {
    marginBottom: spacing['3xl'], // 32px
  },
  sectionTitle: {
    fontSize: fontSize.base,      // 12px
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: spacing.lg,     // 16px
    textTransform: 'uppercase',
    letterSpacing: 1,
    lineHeight: lineHeight.snug,
  },
  
  // Project styles
  projectContainer: {
    marginBottom: spacing.md,
  },
  projectHeader: {
    marginBottom: spacing.sm,     // 8px
  },
  projectTitle: {
    fontSize: fontSize.base,      // 12px
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: spacing.xs,     // 4px
    lineHeight: lineHeight.snug,
  },
  projectDescription: {
    fontSize: fontSize.sm,        // 10px
    color: '#6b7280',
    lineHeight: lineHeight.normal,
    marginBottom: spacing.xs,     // 4px
  },
  
  // Bullet points
  bulletList: {
    marginTop: spacing.sm,        // 8px
    marginLeft: 0,
  },
  bulletPoint: {
    flexDirection: 'row',
    marginBottom: spacing.xs,     // 4px
    paddingLeft: 0,
  },
  bulletSymbol: {
    fontSize: fontSize.xs,        // 8px
    color: '#6b7280',
    marginRight: spacing.sm,      // 8px
    marginTop: 2,
  },
  bulletText: {
    fontSize: fontSize.sm,        // 10px
    color: '#374151',
    lineHeight: lineHeight.normal,
    flex: 1,
  },
  
  // Skills section (at bottom)
  skillsSection: {
    marginTop: spacing.md,
  },
  skillsTitle: {
    fontSize: fontSize.base,      // 12px
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: spacing.md,     // 12px
    textTransform: 'uppercase',
    letterSpacing: 1,
    lineHeight: lineHeight.snug,
  },
  skillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: -spacing.xs,       // -4px to offset first row
    marginLeft: -spacing.xs,      // -4px to offset first item
  },
  skillTag: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: spacing.sm, // 8px
    paddingVertical: spacing.xs,   // 4px
    borderRadius: 3,
    marginLeft: spacing.xs,        // 4px
    marginTop: spacing.xs,         // 4px
  },
  skillText: {
    fontSize: fontSize.xs,         // 8px
    color: '#374151',
    fontWeight: 'normal',
    lineHeight: lineHeight.snug,
  },
  
  // Footer
  footer: {
    position: 'absolute',
    bottom: spacing['3xl'],        // 32px
    left: spacing['6xl'],          // 56px
    right: spacing['6xl'],         // 56px
    borderTop: '1px solid #e5e7eb',
    paddingTop: spacing.sm,        // 8px
  },
  footerContent: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    fontSize: fontSize.xs,         // 8px
    color: '#9ca3af',
    lineHeight: lineHeight.snug,
  },
  footerLink: {
    fontSize: fontSize.xs,         // 8px
    color: '#3b82f6',
    textDecoration: 'none',
    lineHeight: lineHeight.snug,
  },
});

// PDF Document Component
const ResumePDFDocument = ({ resume, projects, bulletPointsByProject, resumeUrl }: {
  resume: {
    _id: Id<"resumes">;
    title: string;
    description?: string;
    name?: string;
    role?: string;
    skills?: string[];
    isPublic: boolean;
    updatedAt: number;
  };
  projects: {
    _id: Id<"projects">;
    resumeId: Id<"resumes">;
    title: string;
    description?: string;
    position: number;
  }[];
  bulletPointsByProject: { [key: string]: {
    _id: Id<"bulletPoints">;
    projectId: Id<"projects">;
    content: string;
    position: number;
    hasBranches: boolean;
  }[] };
  resumeUrl: string;
}) => {
  const liveResumeUrl = resumeUrl || (typeof window !== 'undefined' ? window.location.href : '');
  
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.name}>{resume.name || resume.title}</Text>
          {resume.role && (
            <Text style={styles.role}>{resume.role}</Text>
          )}
          {resume.description && (
            <Text style={styles.summary}>{resume.description}</Text>
          )}
          
          {/* Live Resume Link - Notion-like minimal style */}
          {liveResumeUrl && (
            <View style={styles.liveResumeContainer}>
              <Link style={styles.liveResumeLink} src={liveResumeUrl}>
                View interactive resume →
              </Link>
            </View>
          )}
        </View>

        {/* Divider after header */}
        <View style={styles.divider} />

        {/* Experience & Projects Section */}
        {projects && projects.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Experience & Projects</Text>
            
            {projects.map((project, index) => {
              const bulletPoints = bulletPointsByProject[project._id] || [];
              
              return (
                <View key={index} style={styles.projectContainer}>
                  <View style={styles.projectHeader}>
                    <Text style={styles.projectTitle}>{project.title}</Text>
                    {project.description && (
                      <Text style={styles.projectDescription}>
                        {project.description}
                      </Text>
                    )}
                  </View>
                  
                  {/* Bullet points */}
                  {bulletPoints.length > 0 && (
                    <View style={styles.bulletList}>
                      {bulletPoints.map((bulletPoint, bIndex) => (
                        <View key={bIndex} style={styles.bulletPoint}>
                          <Text style={styles.bulletSymbol}>•</Text>
                          <Text style={styles.bulletText}>
                            {bulletPoint.content}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Skills Section - At bottom */}
        {resume.skills && resume.skills.length > 0 && (
          <View style={styles.skillsSection}>
            <Text style={styles.skillsTitle}>Skills</Text>
            <View style={styles.skillsContainer}>
              {resume.skills.map((skill, index) => (
                <View key={index} style={styles.skillTag}>
                  <Text style={styles.skillText}>{skill}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        
        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerContent}>
            <Text style={styles.footerText}>
              {new Date().toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
};

// Export button component
export function PDFExportButton({ 
  resume, 
  projects, 
  bulletPointsByProject 
}: {
  resume: {
    _id: Id<"resumes">;
    title: string;
    description?: string;
    name?: string;
    role?: string;
    skills?: string[];
    isPublic: boolean;
    updatedAt: number;
  };
  projects: {
    _id: Id<"projects">;
    resumeId: Id<"resumes">;
    title: string;
    description?: string;
    position: number;
  }[];
  bulletPointsByProject: { [key: string]: {
    _id: Id<"bulletPoints">;
    projectId: Id<"projects">;
    content: string;
    position: number;
    hasBranches: boolean;
  }[] };
}) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleExport = async () => {
    try {
      setIsGenerating(true);
      
      // Get the current URL for the live resume link
      const resumeUrl = typeof window !== 'undefined' 
        ? `${window.location.origin}/resumes/${resume._id}` 
        : '';
      
      const doc = (
        <ResumePDFDocument 
          resume={resume} 
          projects={projects} 
          bulletPointsByProject={bulletPointsByProject}
          resumeUrl={resumeUrl}
        />
      );
      
      const blob = await pdf(doc).toBlob();
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${resume?.name || resume?.title || 'resume'}.pdf`
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase();
      link.click();
      
      // Clean up
      URL.revokeObjectURL(url);
      
      toast.success('Resume exported as PDF');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <DropdownMenuItem 
      className="cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        handleExport();
      }}
      disabled={isGenerating}
    >
      <FileText className="mr-2 h-3.5 w-3.5" />
      <span className="text-sm">
        {isGenerating ? 'Generating PDF...' : 'Export as PDF'}
      </span>
    </DropdownMenuItem>
  );
}