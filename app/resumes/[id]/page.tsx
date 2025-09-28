"use client";

import React, { useState, useEffect } from "react";
import { PDFExportButton } from "@/components/PDFExport";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id, Doc } from "../../../convex/_generated/dataModel";
import { ExpandableBulletPoint } from "../../components/ExpandableBulletPoint";
import { ResumeChatV2 } from "../../components/ResumeChatV2";
// import { FileSidebar } from "../../components/FileSidebar";
import { FileSidebar } from "../../components/FileSidebar";
import { DynamicFileViewer } from "../../components/DynamicFileViewer";
import { Button } from "@/components/ui/button";
import {
  Share2,
  Copy,
  Check,
  ExternalLink,
  MoreHorizontal,
  X,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { cn } from "@/lib/utils";
import { Mail, Phone, MapPin, Globe as GlobeIcon, SidebarOpen } from "lucide-react";
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
import { SidebarProvider, Sidebar, SidebarInset, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

export default function PublicResumePage() {
  const params = useParams();
  const resumeId = params.id as Id<"resumes">;
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [highlightedItem, setHighlightedItem] = useState<{ type: string; id: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<Id<"dynamicFiles"> | null>(null);
  const [highlightedLine, setHighlightedLine] = useState<string | null>(null);
  const [audioPlayRequest, setAudioPlayRequest] = useState<{
    fileName: string;
    timestamp: number;
  } | undefined>(undefined);
  const [pendingEchoHighlight, setPendingEchoHighlight] = useState<{
    pageId: Id<"dynamicFiles">;
    pointNumber: number;
  } | null>(null);
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
  const branchesByBulletPoint = useQuery(api.branches.listByResume, resume ? { resumeId } : "skip");

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

  useEffect(() => {
    if (!pendingEchoHighlight) {
      return;
    }

    if (selectedFileId !== pendingEchoHighlight.pageId) {
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let animationFrame: number | null = null;
    const maxAttempts = 12;

    const clearExistingHighlights = () => {
      document
        .querySelectorAll('.highlight-persistent')
        .forEach((el) => el.classList.remove('highlight-persistent'));
    };

    const tryHighlight = () => {
      if (cancelled) {
        return;
      }

      const summaryElements = document.querySelectorAll(
        '[id^="echo-point-"], [id^="audio-summary-point-"]'
      );

      for (const element of Array.from(summaryElements)) {
        const match = element.id.match(/(?:echo|audio-summary)-point-.*-(\d+)$/);
        if (match && parseInt(match[1], 10) === pendingEchoHighlight.pointNumber) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('highlight-persistent');
          setPendingEchoHighlight(null);
          return;
        }
      }

      if (attempts < maxAttempts) {
        attempts += 1;
        animationFrame = requestAnimationFrame(tryHighlight);
      }
    };

    const timeoutId = window.setTimeout(() => {
      clearExistingHighlights();
      tryHighlight();
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [pendingEchoHighlight, selectedFileId]);

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCitationClick = (
    type: string,
    id: string,
    text: string,
    options?: { echoPointNumber?: number }
  ) => {
    // Handle GitHub citation clicks
    if (type === 'github' && resume?.github) {
      // Extract username from github field
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

    // Handle Audio citation clicks - open page and play audio at timestamp
    if (type === 'audio') {
      // Parse audio data from id format: "audio:<pageConvexId>:<filename>:<timestamp>"
      const [, pageId, fileName, timestampStr] = id.split(':');
      const timestamp = parseInt(timestampStr) || 0;

      // Open the page
      setSelectedFileId(pageId as Id<"dynamicFiles">);
      setHighlightedLine(null);
      setPendingEchoHighlight(null);

      // Set the audio play request
      setAudioPlayRequest({ fileName, timestamp });

      // Open right panel if not already open
      if (!rightPanelOpen) {
        setRightPanelOpen(true);
      }
      return;
    }

    // Handle Page citation clicks - show page content on right
    if (type === 'page') {
      const lineMatch = text.match(/\bL(\d+)(?:-L\d+)?/);
      const lineNumber = lineMatch ? lineMatch[1] : null;

      // Clear any audio play request when switching to a different page
      setAudioPlayRequest(undefined);

      // Check if clicking the same page citation that's already highlighted
      const isAlreadyHighlighted = selectedFileId === id && highlightedLine === lineNumber;

      if (!options?.echoPointNumber && isAlreadyHighlighted) {
        // Force re-highlight by clearing and re-setting
        setHighlightedLine(null);
        setTimeout(() => {
          setHighlightedLine(lineNumber);
        }, 50);
      } else {
        // Normal highlight for different citation
        setSelectedFileId(id as Id<"dynamicFiles">);
        if (options?.echoPointNumber) {
          setHighlightedLine(null);
          setPendingEchoHighlight({
            pageId: id as Id<"dynamicFiles">,
            pointNumber: options.echoPointNumber,
          });
        } else {
          setHighlightedLine(lineNumber);
          setPendingEchoHighlight(null);
        }
      }

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
    setPendingEchoHighlight(null);

    // Set new highlight after a brief delay to ensure clean transition
    // Use longer delay if switching from page view to ensure DOM updates
    const delay = wasInPageView ? 300 : 100;
    setTimeout(() => {
      setHighlightedItem({ type, id });

      // For branches, we need additional delay to ensure the bullet point expands
      const scrollDelay = type === 'branch' ? 200 : 0;

      setTimeout(() => {
        // Scroll to element
        const element = document.getElementById(`${type}-${id}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, scrollDelay);
    }, delay);
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
    <SidebarProvider defaultOpen={false} className="overlay-sidebar">
      <div className="h-screen w-screen bg-background overflow-hidden flex flex-col">
        <Navbar
          className="no-print"
          breadcrumbs={[
            { label: resume.title }
          ]}
          actions={
            <>
              {/* Sidebar toggle */}
              <SidebarTrigger className="h-8 w-8 rounded-lg" />
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

      {/* Sidebar + Content */}
      <Sidebar side="left" variant="floating" collapsible="offcanvas" className="top-12 h-[calc(100vh-3rem)]">
        <FileSidebar
          resumeId={resumeId}
          dynamicFiles={dynamicFiles || []}
          selectedFileId={selectedFileId}
          onSelectFile={(fileId) => {
            setSelectedFileId(fileId);
            setAudioPlayRequest(undefined);
          }}
          isEditable={false}
        />
      </Sidebar>

      <SidebarInset className="pt-12 h-[calc(100vh-3rem)] min-h-0">
        <SidebarClickToCollapse className="h-full min-h-0 flex relative overflow-hidden">
          <SidebarFloatingToggle />
          {/* Main Content with Resizable Panels */}
          <ResizablePanelGroup direction="horizontal" className="h-full w-full min-h-0">
            {/* Left Panel with Resume Content */}
            <ResizablePanel
              defaultSize={50}
              collapsible={true}
              minSize={rightPanelOpen ? 30 : 0}
              maxSize={70}
              collapsedSize={rightPanelOpen ? undefined : 0}
              onCollapse={() => setRightPanelOpen(false)}
              onExpand={() => setRightPanelOpen(true)}
            >
              <div className={cn(
                "h-full min-h-0 bg-background relative flex flex-col overflow-hidden",
                !rightPanelOpen && "hidden"
              )}>
                {selectedFileId ? (
                  <div className="h-full min-h-0 border-r border-border/40 overflow-hidden">
                    <DynamicFileViewer
                      fileId={selectedFileId}
                      isReadOnly={true}
                      autoPlayRequest={audioPlayRequest}
                      highlightLine={highlightedLine}
                      onBack={() => {
                        setSelectedFileId(null);
                        setHighlightedLine(null);
                      }}
                    />
                  </div>
                ) : (
                  <div className="h-full overflow-y-auto border-r border-border/40">
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
                              {resume.skills.map((skill: string, index: number) => (
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
                          {projects.map((project: Doc<"projects">, index: number) => (
                            <ProjectView
                              key={project._id}
                              project={project}
                              highlightedItem={highlightedItem}
                              index={index}
                              setBulletPointsByProject={setBulletPointsByProject}
                              branchesByBulletPoint={branchesByBulletPoint}
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

            {/* Always render handle and panel to preserve state */}
            <ResizableHandle withHandle className={cn(
              "transition-opacity duration-200",
              !rightPanelOpen && "opacity-0 pointer-events-none"
            )} />

            {/* Right Panel with AI Chat */}
            <ResizablePanel defaultSize={50} minSize={30}>
              <div className="h-full min-h-0 bg-background relative border-l border-border/40 overflow-hidden">
                <div className="h-full overflow-y-auto">
                  <ResumeChatV2
                    resumeId={resumeId}
                    className="min-h-full"
                    projects={projects}
                    bulletPointsByProject={bulletPointsByProject}
                    dynamicFiles={dynamicFiles}
                    branchesByBulletPoint={branchesByBulletPoint}
                    onCitationClick={handleCitationClick}
                  />
                </div>
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
        </SidebarClickToCollapse>
      </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function SidebarFloatingToggle() {
  const { state, toggleSidebar } = useSidebar();

  if (state !== "collapsed") return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        toggleSidebar();
      }}
      className="absolute left-0 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-1.5 px-2 py-3 bg-background/95 backdrop-blur-sm hover:bg-muted/80 rounded-r-lg border border-l-0 border-border/50 shadow-sm transition-all group"
      aria-label="Open Files Sidebar"
    >
      <span
        className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground transition-colors leading-none"
        style={{ writingMode: 'vertical-lr' }}
      >
        Files
      </span>
      <SidebarOpen className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
    </button>
  );
}

function SidebarClickToCollapse({ children, className }: { children: React.ReactNode; className?: string }) {
  const { setOpen, setOpenMobile, openMobile, isMobile, state } = useSidebar();
  return (
    <div
      className={className}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-slot="sidebar"]')) return;
        // Only close if sidebar is expanded
        if (state === "expanded") {
          if (isMobile) {
            if (openMobile) setOpenMobile(false);
          } else {
            setOpen(false);
          }
        }
      }}
    >
      {children}
    </div>
  );
}

function ProjectView({ project, highlightedItem, index, setBulletPointsByProject, branchesByBulletPoint }: {
  project: {
    _id: Id<"projects">;
    resumeId: Id<"resumes">;
    title: string;
    description?: string;
    position: number;
    connectedPageId?: Id<"dynamicFiles">;
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
  branchesByBulletPoint?: { [key: string]: Array<{
    _id: Id<"branches">;
    content: string;
    type: "text" | "audio" | "video";
    position: number;
  }> };
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
            {bulletPoints.map((bulletPoint: Doc<"bulletPoints">) => (
              <ExpandableBulletPoint
                key={bulletPoint._id}
                bulletPoint={bulletPoint}
                isEditable={false}
                highlightedItem={highlightedItem}
                connectedPageId={project.connectedPageId}
                projectTitle={project.title}
                resumeId={project.resumeId}
                branches={branchesByBulletPoint?.[bulletPoint._id] || []}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}