"use client";

import { useState } from "react";
import Link from "next/link";
// import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id, Doc } from "../../convex/_generated/dataModel";
import { Authenticated, Unauthenticated } from "convex/react";
import { SignInButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { 
  FileText, 
  Plus, 
  MoreHorizontal, 
  Globe, 
  Lock, 
  Trash2, 
  Edit, 
  Eye, 
  // ArrowLeft,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export default function ResumesPage() {
  
  return (
    <div className="min-h-screen bg-background">
      <Navbar 
        breadcrumbs={[
          { label: "My Resumes" }
        ]}
      />

      <main className="pt-12">
        <Authenticated>
          <ResumesList />
        </Authenticated>
        <Unauthenticated>
          <div className="max-w-md mx-auto text-center space-y-6 py-32">
            <h1 className="text-2xl font-light">Sign in to manage your resumes</h1>
            <SignInButton mode="modal">
              <Button size="lg">
                Sign in
              </Button>
            </SignInButton>
          </div>
        </Unauthenticated>
      </main>
    </div>
  );
}

function ResumesList() {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resumeToDelete, setResumeToDelete] = useState<{
    _id: Id<"resumes">;
    title: string;
    description?: string;
    name?: string;
    role?: string;
    isPublic: boolean;
    updatedAt: number;
  } | null>(null);
  
  const resumes = useQuery(api.resumes.list, {});
  const deleteResume = useMutation(api.resumes.remove);

  const handleDeleteResume = async () => {
    if (resumeToDelete) {
      try {
        await deleteResume({ id: resumeToDelete._id });
        toast.success("Resume deleted successfully");
        setDeleteDialogOpen(false);
        setResumeToDelete(null);
      } catch {
        toast.error("Failed to delete resume");
      }
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      {/* Header with actions - Notion style */}
      <div className="mb-8">
        <h1 className="text-3xl font-light mb-2">Resumes</h1>
        <p className="text-sm text-muted-foreground">
          Create and manage your interactive resumes
        </p>
      </div>
      
      {/* Action bar */}
      <div className="flex items-center justify-between mb-6">
        <Link href="/resumes/new">
          <Button
            size="sm"
            className="h-8 px-3 gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            New Resume
          </Button>
        </Link>
      </div>

      {/* Resumes list */}
      {resumes === undefined ? (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      ) : resumes.length === 0 ? (
        <div className="py-16 text-center">
          <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">
            No resumes yet. Create your first resume to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {resumes.map((resume: Doc<"resumes">) => (
            <div
              key={resume._id}
              className="group relative border border-border/50 rounded-lg p-4 hover:bg-muted/30 transition-all cursor-pointer"
              onClick={() => window.location.href = `/resumes/${resume._id}/edit`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-medium truncate">{resume.title}</h3>
                    {resume.isPublic ? (
                      <Globe className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <Lock className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                  {resume.description && (
                    <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                      {resume.description}
                    </p>
                  )}
                  <div className="text-xs text-muted-foreground">
                    Updated {new Date(resume.updatedAt).toLocaleDateString()}
                  </div>
                </div>
                
                <div className="flex items-center gap-1 ml-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.stopPropagation();
                          window.location.href = `/resumes/${resume._id}/edit`;
                        }}
                      >
                        <Edit className="mr-2 h-3.5 w-3.5" />
                        <span className="text-sm">Edit</span>
                      </DropdownMenuItem>
                      {resume.isPublic && (
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(`/resumes/${resume._id}`, '_blank');
                          }}
                        >
                          <Eye className="mr-2 h-3.5 w-3.5" />
                          <span className="text-sm">View public</span>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.stopPropagation();
                          setResumeToDelete(resume);
                          setDeleteDialogOpen(true);
                        }}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        <span className="text-sm">Delete</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Resume</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{resumeToDelete?.title}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteResume}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}