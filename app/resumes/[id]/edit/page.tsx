"use client";

import { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { SignInButton } from "@clerk/nextjs";
import { ResumeBuilder } from "../../../components/ResumeBuilder";
import { FileSidebar } from "../../../components/FileSidebar";
import { DynamicFileViewer } from "../../../components/DynamicFileViewer";
import { Id, Doc } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { 
  Save, 
  Eye, 
  Settings,
  Clock,
  Check,
  Trash2
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PDFExportButton } from "@/components/PDFExport";
import { ProjectDataFetcher } from "@/components/DataFetcher";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { SidebarProvider, Sidebar, SidebarInset, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { SidebarOpen } from "lucide-react";

export default function EditResumePage() {
  const params = useParams();
  const router = useRouter();
  const resumeId = params.id as Id<"resumes">;
  const [saved, setSaved] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<Id<"dynamicFiles"> | null>(null);
  const [bulletPointsByProject, setBulletPointsByProject] = useState<{ [key: string]: {
    _id: Id<"bulletPoints">;
    projectId: Id<"projects">;
    content: string;
    position: number;
    hasBranches: boolean;
  }[] }>({});
  
  const resume = useQuery(api.resumes.get, { id: resumeId });
  const projects = useQuery(api.projects.list, resume ? { resumeId } : "skip");
  const dynamicFiles = useQuery(api.dynamicFiles.list, resume ? { resumeId } : "skip");

  const handleSave = () => {
    setSaved(true);
    setLastSaved(new Date());
    setTimeout(() => setSaved(false), 2000);
  };


  // Memoize callbacks outside of conditional rendering
  const handleBulletPointsLoad = useCallback((projectId: string, bulletPoints: {
    _id: Id<"bulletPoints">;
    projectId: Id<"projects">;
    content: string;
    position: number;
    hasBranches: boolean;
  }[]) => {
    setBulletPointsByProject(prev => {
      if (JSON.stringify(prev[projectId]) !== JSON.stringify(bulletPoints)) {
        return {
          ...prev,
          [projectId]: bulletPoints
        };
      }
      return prev;
    });
  }, []);


  return (
    <SidebarProvider defaultOpen={false}>
      <div className="h-screen w-screen bg-background overflow-hidden flex flex-col">
        <Navbar 
          className="no-print"
          breadcrumbs={[
            { label: "My Resumes", href: "/resumes" },
            { label: resume?.title || "Edit Resume" }
          ]}
          actions={
            <>
              {/* Save status */}
              {lastSaved && (
                <div className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>Saved {lastSaved.toLocaleTimeString()}</span>
                </div>
              )}
              
              {/* Save button */}
              <Button 
                variant="ghost" 
                size="sm"
                onClick={handleSave}
                className={cn(
                  "h-8 px-3 gap-1.5 transition-all duration-200",
                  saved 
                    ? "bg-green-500/10 text-green-600 hover:bg-green-500/20" 
                    : "hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                )}
              >
                {saved ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span className="text-sm">Saved</span>
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" />
                    <span className="text-sm">Save</span>
                  </>
                )}
              </Button>

              {/* Preview button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/resumes/${resumeId}`)}
                className="h-8 px-3 gap-1.5 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Eye className="h-3.5 w-3.5" />
                <span className="text-sm">Preview</span>
              </Button>

              {/* Settings dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 px-2 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {/* Export as PDF */}
                  {resume && projects && (
                    <PDFExportButton 
                      resume={resume} 
                      projects={projects} 
                      bulletPointsByProject={bulletPointsByProject}
                    />
                  )}
                  
                  <DropdownMenuSeparator />
                  
                  <DropdownMenuItem className="cursor-pointer text-destructive">
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    <span className="text-sm">Delete Resume</span>
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
          onSelectFile={setSelectedFileId}
          isEditable={true}
        />
      </Sidebar>

      <SidebarInset className="pt-12 h-[calc(100vh-3rem)] min-h-0">
        <Authenticated>
          <SidebarClickToCollapse className="h-full min-h-0 flex relative overflow-hidden">
            <SidebarFloatingToggle />
            
            {/* Main Content - Always Centered */}
            <div className="flex-1 h-full overflow-y-auto">
              <div className="min-h-full flex justify-center">
                <div className="w-full max-w-3xl px-6 py-8">
                  {/* Data fetcher for PDF export */}
                  {projects && projects.map((project: Doc<"projects">) => (
                    <ProjectDataFetcher
                      key={project._id}
                      project={project}
                      onBulletPointsLoad={handleBulletPointsLoad}
                    />
                  ))}
                  
                  {selectedFileId ? (
                    <DynamicFileViewer fileId={selectedFileId} />
                  ) : (
                    <ResumeBuilder resumeId={resumeId} />
                  )}
                </div>
              </div>
            </div>
          </SidebarClickToCollapse>
        </Authenticated>
        <Unauthenticated>
          <div className="max-w-md mx-auto text-center space-y-4">
            <h1 className="text-2xl font-bold">Sign in to edit your resume</h1>
            <SignInButton mode="modal">
              <Button>Sign in</Button>
            </SignInButton>
          </div>
        </Unauthenticated>
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