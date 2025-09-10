"use client";

import { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { SignInButton } from "@clerk/nextjs";
import { ResumeBuilder } from "../../../components/ResumeBuilder";
import { Id } from "../../../../convex/_generated/dataModel";
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

export default function EditResumePage() {
  const params = useParams();
  const router = useRouter();
  const resumeId = params.id as Id<"resumes">;
  const [saved, setSaved] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [bulletPointsByProject, setBulletPointsByProject] = useState<{ [key: string]: {
    _id: Id<"bulletPoints">;
    projectId: Id<"projects">;
    content: string;
    position: number;
    hasBranches: boolean;
  }[] }>({});
  
  const resume = useQuery(api.resumes.get, { id: resumeId });
  const projects = useQuery(api.projects.list, resume ? { resumeId } : "skip");

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
    <div className="min-h-screen bg-background">
      <Navbar 
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
      
      <main className="pt-20 p-8">
        <Authenticated>
          {/* Data fetcher for PDF export */}
          {projects && projects.map(project => (
            <ProjectDataFetcher
              key={project._id}
              project={project}
              onBulletPointsLoad={handleBulletPointsLoad}
            />
          ))}
          
          <ResumeBuilder resumeId={resumeId} />
        </Authenticated>
        <Unauthenticated>
          <div className="max-w-md mx-auto text-center space-y-4">
            <h1 className="text-2xl font-bold">Sign in to edit your resume</h1>
            <SignInButton mode="modal">
              <Button>Sign in</Button>
            </SignInButton>
          </div>
        </Unauthenticated>
      </main>
    </div>
  );
}