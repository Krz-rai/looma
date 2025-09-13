"use client";

import React, { useState, useEffect } from "react";
import { PDFExportButton } from "@/components/PDFExport";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { ExpandableBulletPoint } from "../../components/ExpandableBulletPoint";
import { ResumeChatV2 } from "../../components/ResumeChatV2";
import { FileSidebar } from "../../components/FileSidebar";
import { DynamicFileViewer } from "../../components/DynamicFileViewer";
import { Button } from "@/components/ui/button";
import { 
  Share2, 
  Copy, 
  Check, 
  ExternalLink,
  MoreHorizontal
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { cn } from "@/lib/utils";
import { Mail, Phone, MapPin, Globe as GlobeIcon, SidebarOpen, X } from "lucide-react";
import { LinkedinIcon, GithubIcon } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

export default function PublicResumePage() {
  const params = useParams();
  const resumeId = params.id as Id<"resumes">;
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [highlightedItem, setHighlightedItem] = useState<{ type: string; id: string } | null>(null);
  // const [isAnimating, setIsAnimating] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<Id<"dynamicFiles"> | null>(null);
  const [highlightedLine, setHighlightedLine] = useState<string | null>(null);
  const [bulletPointsByProject, setBulletPointsByProject] = useState<{ [key: string]: {
    _id: Id<"bulletPoints">;
    projectId: Id<"projects">;
    content: string;
    position: number;
    hasBranches: boolean;
  }[] }>({});
  
  const resume = useQuery(api.resumes.get, { id: resumeId });
  const projects = useQuery(api.projects.list, resume ? { resumeId } : "skip");
  const dynamicFiles = useQuery(api.dynamicFiles.listPublic, resume ? { resumeId } : "skip");
  
  
  // Clear highlight when clicking elsewhere on the page
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Check if clicking on a citation button
      const isCitation = target.closest('[data-citation-type]');
      if (isCitation) return;
      
      // Check if clicking on a highlighted element
      const isHighlightedElement = target.closest('.highlight-element, .highlight-bullet, .highlight-branch');
      if (isHighlightedElement) return;
      
      // Clear highlight for any other click
      setHighlightedItem(null);
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };


  if (!resume) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Loading resume...</h1>
          <p className="text-muted-foreground">Please wait</p>
        </div>
      </div>
    );
  }

  if (!resume.isPublic) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Resume Not Found</h1>
          <p className="text-muted-foreground mb-4">
            This resume is private or doesn&apos;t exist.
          </p>
          <Link href="/">
            <Button variant="ghost">
              Go to Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-background overflow-hidden flex flex-col" style={{ maxWidth: '100vw' }}>
      <Navbar 
        className="no-print"
        breadcrumbs={[
          { label: resume.title }
        ]}
        actions={
          <>
            {/* Share dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 px-2 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Share2 className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem 
                  onClick={handleCopyLink}
                  className="cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="mr-2 h-3.5 w-3.5" />
                      <span className="text-sm">Link copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-3.5 w-3.5" />
                      <span className="text-sm">Copy link</span>
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => window.open(window.location.href, '_blank')}
                  className="cursor-pointer"
                >
                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                  <span className="text-sm">Open in new tab</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* More options */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 px-2 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {resume && projects && (
                  <PDFExportButton 
                    resume={resume} 
                    projects={projects} 
                    bulletPointsByProject={bulletPointsByProject}
                  />
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer text-muted-foreground">
                  <span className="text-sm">Version 1.0</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="flex-1 relative overflow-hidden pt-12">
        {/* Main Content Area with AI Chat in Center */}
        <div className="h-full flex relative overflow-hidden">
          {/* Left Sidebar Overlay */}
          <div 
            className={cn(
              "absolute left-0 top-0 h-full z-20 transition-all duration-300 ease-in-out",
              leftSidebarOpen ? "w-80 shadow-xl" : "w-0"
            )}
          >
            <div className="h-full bg-background border-r border-border/40 relative">
              {leftSidebarOpen && (
                <>
                  <Button
                    onClick={() => setLeftSidebarOpen(false)}
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2 z-10 h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <FileSidebar
                    resumeId={resumeId}
                    dynamicFiles={dynamicFiles || []}
                    selectedFileId={selectedFileId}
                    onSelectFile={setSelectedFileId}
                    isEditable={false}
                  />
                </>
              )}
            </div>
          </div>

          {/* Toggle Button for Left Sidebar */}
          {!leftSidebarOpen && (
            <button
              onClick={() => setLeftSidebarOpen(true)}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-1.5 px-2 py-3 bg-background/95 backdrop-blur-sm hover:bg-muted/80 rounded-r-lg border border-l-0 border-border/50 shadow-sm transition-all group"
            >
              <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors" style={{ writingMode: 'vertical-lr' }}>Files</span>
              <SidebarOpen className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
            </button>
          )}

          {/* Main Content with Resizable Panels */}
          <ResizablePanelGroup 
            direction="horizontal" 
            className="h-full w-full"
          >
            {/* Center AI Chat Panel */}
            <ResizablePanel defaultSize={100} minSize={30}>
              <div className="h-full bg-background relative">
                <ResumeChatV2
                  resumeId={resumeId}
                  className="h-full overflow-hidden"
                  projects={projects}
                  bulletPointsByProject={bulletPointsByProject}
                  dynamicFiles={dynamicFiles}
                  onCitationClick={(type: string, id: string, text: string) => {
                // Handle GitHub citation clicks
                if (type === 'github' && resume?.github) {
                  // Extract username from github field (e.g., "Krz-rai" or "github.com/Krz-rai")
                  const githubUrlMatch = resume.github.match(/(?:github\.com\/)?([a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38})\/?$/);
                  if (githubUrlMatch) {
                    const username = githubUrlMatch[1];
                    // Check if id contains a specific repo name (format: "github:reponame")
                    if (id && id.startsWith('github:')) {
                      const repoName = id.substring(7); // Remove "github:" prefix
                      window.open(`https://github.com/${username}/${repoName}`, '_blank');
                    } else {
                      // Just open the main profile
                      window.open(`https://github.com/${username}`, '_blank');
                    }
                  }
                  return;
                }
                
                // Handle Portfolio citation clicks
                if (type === 'portfolio' && resume?.portfolio) {
                  const portfolioUrl = resume.portfolio.startsWith('http') 
                    ? resume.portfolio 
                    : `https://${resume.portfolio}`;
                  
                  // Check if id contains a specific page (format: "portfolio:/projects/name")
                  if (id && id.startsWith('portfolio:')) {
                    const path = id.substring(10); // Remove "portfolio:" prefix
                    window.open(`${portfolioUrl}${path}`, '_blank');
                  } else {
                    // Just open the main portfolio
                    window.open(portfolioUrl, '_blank');
                  }
                  return;
                }
                
                // Handle Page citation clicks - show page content on right
                if (type === 'page') {
                  // Extract line number from text: "Page Title L#"
                  const lineMatch = text.match(/\s+L([\d\-]+)$/);
                  const lineNumber = lineMatch ? lineMatch[1] : null;
                  
                  console.log('📄 Page citation clicked:', { 
                    type, 
                    id, 
                    text, 
                    lineNumber,
                    fullText: JSON.stringify(text)
                  });
                  
                  setSelectedFileId(id as Id<"dynamicFiles">);
                  setHighlightedLine(lineNumber);
                  
                  // Open right panel if not already open
                  if (!rightPanelOpen) {
                    setRightPanelOpen(true);
                  }
                  return;
                }
                
                // Check if we need to switch from page view to resume view
                const wasInPageView = selectedFileId !== null;
                
                // Clear page view to show resume content
                if (selectedFileId) {
                  setSelectedFileId(null);
                  setHighlightedLine(null);
                }
                
                // Open right panel to show resume content and scroll to citation
                if (!rightPanelOpen) {
                  setRightPanelOpen(true);
                  // Panel will expand via the defaultSize prop change
                }
                
                // If same item is clicked, just scroll to it
                if (highlightedItem?.type === type && highlightedItem?.id === id) {
                  setTimeout(() => {
                    const element = document.getElementById(`${type}-${id}`);
                    if (element) {
                      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }, 100);
                  return;
                }
                
                // Clear previous highlight
                setHighlightedItem(null);
                
                // Set new highlight after a brief delay to ensure clean transition
                // Use longer delay if switching from page view to ensure DOM updates
                const delay = wasInPageView ? 300 : 100;
                setTimeout(() => {
                  setHighlightedItem({ type, id });
                  
                  // Scroll to element
                  const element = document.getElementById(`${type}-${id}`);
                  if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }, delay);
                  }}
                  />
              </div>
            </ResizablePanel>
            
            {/* Always render handle and panel to preserve state */}
            <ResizableHandle 
              withHandle 
              className={cn(
                "transition-opacity duration-200",
                !rightPanelOpen && "opacity-0 pointer-events-none"
              )}
            />
            
            {/* Right Panel with Resume Content - Always rendered to preserve state */}
            <ResizablePanel 
              defaultSize={50}
              collapsible={true}
              minSize={rightPanelOpen ? 20 : 0}
              maxSize={70}
              collapsedSize={rightPanelOpen ? undefined : 0}
              onCollapse={() => setRightPanelOpen(false)}
              onExpand={() => setRightPanelOpen(true)}
            >
              <div className={cn(
                "h-full bg-background relative",
                !rightPanelOpen && "hidden"
              )}>
                {selectedFileId ? (
                  <div className="h-full border-l border-border/40">
                    <DynamicFileViewer 
                      fileId={selectedFileId} 
                      isReadOnly={true}
                      highlightLine={highlightedLine}
                      onBack={() => {
                        setSelectedFileId(null);
                        setHighlightedLine(null);
                      }}
                    />
                  </div>
                ) : (
                  <div className="h-full overflow-y-auto border-l border-border/40">
                    <main
                      id="resume-content" 
                      className="max-w-3xl mx-auto px-6 py-8"
                    >
                  {/* Resume Header - Notion-like hierarchy */}
                  <div className="mb-12 space-y-6">
                    {/* Name and Role */}
                    <div className="space-y-2">
                      <h1 className="text-3xl font-normal tracking-tight">
                        {resume.name || resume.title}
                      </h1>
                      {resume.role && (
                        <p className="text-base text-muted-foreground">
                          {resume.role}
                        </p>
                      )}
                    </div>
                    
                    {/* Contact Information - Compact inline style with icons */}
                    {(resume.email || resume.phone || resume.location) && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        {resume.email && (
                          <div className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5" strokeWidth={1.5} />
                            <span>{resume.email}</span>
                          </div>
                        )}
                        {resume.phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5" strokeWidth={1.5} />
                            <span>{resume.phone}</span>
                          </div>
                        )}
                        {resume.location && (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5" strokeWidth={1.5} />
                            <span>{resume.location}</span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Links - Clean inline style with icons */}
                    {(resume.linkedIn || resume.github || resume.portfolio) && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        {resume.linkedIn && (
                          <a href={resume.linkedIn.startsWith('http') ? resume.linkedIn : `https://linkedin.com/in/${resume.linkedIn}`} 
                             target="_blank" 
                             rel="noopener noreferrer"
                             className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                            <LinkedinIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                            <span>{resume.linkedIn.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, '')}</span>
                          </a>
                        )}
                        {resume.github && (
                          <a href={resume.github.startsWith('http') ? resume.github : `https://github.com/${resume.github}`}
                             target="_blank"
                             rel="noopener noreferrer"
                             className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                            <GithubIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                            <span>{resume.github.replace(/^https?:\/\/(www\.)?github\.com\//, '')}</span>
                          </a>
                        )}
                        {resume.portfolio && (
                          <a href={resume.portfolio.startsWith('http') ? resume.portfolio : `https://${resume.portfolio}`}
                             target="_blank"
                             rel="noopener noreferrer"
                             className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                            <GlobeIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                            <span>{resume.portfolio.replace(/^https?:\/\/(www\.)?/, '')}</span>
                          </a>
                        )}
                      </div>
                    )}
                    
                    {/* Education - Compact style */}
                    {(resume.university || resume.degree || resume.major || resume.gpa || resume.graduationDate) && (
                      <div className="py-3 border-y border-border/20">
                        <div className="text-xs font-medium text-muted-foreground/70 mb-1.5">EDUCATION</div>
                        <div className="text-sm">
                          <div className="font-medium">{resume.university}</div>
                          {(resume.degree || resume.major) && (
                            <div className="text-muted-foreground">
                              {resume.degree}
                              {resume.degree && resume.major && ' in '}
                              {resume.major}
                            </div>
                          )}
                          {(resume.graduationDate || resume.gpa) && (
                            <div className="text-muted-foreground text-xs mt-0.5">
                              {resume.graduationDate}
                              {resume.gpa && resume.graduationDate && ' • '}
                              {resume.gpa && `GPA: ${resume.gpa}`}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Professional Summary */}
                    {resume.description && (
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {resume.description}
                      </p>
                    )}
                    
                    {/* Skills */}
                    {resume.skills && resume.skills.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-xs font-medium text-muted-foreground/70">SKILLS</div>
                        <div className="flex flex-wrap gap-1.5">
                          {resume.skills.map((skill, index) => (
                            <span
                              key={index}
                              className="px-2.5 py-1 bg-muted/50 rounded-md text-xs"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Divider */}
                    <div className="border-b border-border/40" />
                  </div>

                  {projects && projects.length > 0 ? (
                    <div className="space-y-8">
                      {projects.map((project, index) => (
                        <ProjectView 
                          key={project._id} 
                          project={project} 
                          highlightedItem={highlightedItem}
                          index={index}
                          setBulletPointsByProject={setBulletPointsByProject}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="py-16 text-center">
                      <p className="text-sm text-muted-foreground">
                        No projects added to this resume yet.
                      </p>
                    </div>
                  )}
                    </main>
                  </div>
                )}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
          
          {/* Toggle Button for Right Panel when collapsed */}
          {!rightPanelOpen && (
            <button
              onClick={() => setRightPanelOpen(true)}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-1.5 px-2 py-3 bg-background/95 backdrop-blur-sm hover:bg-muted/80 rounded-l-lg border border-r-0 border-border/50 shadow-sm transition-all group"
            >
              <SidebarOpen className="h-4 w-4 text-muted-foreground group-hover:text-foreground rotate-180" />
              <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors leading-none" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Resume</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectView({ project, highlightedItem, index, setBulletPointsByProject }: { 
  project: {
    _id: Id<"projects">;
    resumeId: Id<"resumes">;
    title: string;
    description?: string;
    position: number;
  };
  highlightedItem: { type: string; id: string } | null;
  index: number;
  setBulletPointsByProject?: React.Dispatch<React.SetStateAction<{ [key: string]: {
    _id: Id<"bulletPoints">;
    projectId: Id<"projects">;
    content: string;
    position: number;
    hasBranches: boolean;
  }[] }>>;
}) {
  const bulletPoints = useQuery(api.bulletPoints.list, { 
    projectId: project._id 
  });
  
  React.useEffect(() => {
    if (bulletPoints && setBulletPointsByProject) {
      setBulletPointsByProject(prev => {
        // Only update if the bullet points have changed
        if (JSON.stringify(prev[project._id]) !== JSON.stringify(bulletPoints)) {
          return {
            ...prev,
            [project._id]: bulletPoints
          };
        }
        return prev;
      });
    }
  }, [bulletPoints, project._id, setBulletPointsByProject]);
  
  const isHighlighted = highlightedItem?.type === 'project' && highlightedItem?.id === project._id;

  return (
    <div 
      id={`project-${project._id}`}
      className={cn(
        "relative transition-all duration-300 ease-out",
        isHighlighted && "highlight-element animate-highlight"
      )}
    >
      <div className="space-y-3">
        {/* Project Header - Notion style with number */}
        <div className="flex gap-8">
          <span className="text-3xl text-muted-foreground/20 font-medium leading-none mt-1">
            {String(index + 1).padStart(2, '0')}
          </span>
          <div className="space-y-1 flex-1">
            <h2 className="text-lg font-medium">{project.title}</h2>
            {project.description && (
              <p className="text-sm text-muted-foreground">
                {project.description}
              </p>
            )}
          </div>
        </div>
        
        {/* Bullet Points */}
        {bulletPoints && bulletPoints.length > 0 && (
          <div className="space-y-1 ml-20">
            {bulletPoints.map((bulletPoint) => (
              <ExpandableBulletPoint
                key={bulletPoint._id}
                bulletPoint={bulletPoint}
                isEditable={false}
                highlightedItem={highlightedItem}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}