"use client";

import { useState } from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { ProjectEditor } from "./ProjectEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Edit2, Globe, Lock, Copy, Check, X } from "lucide-react";
import { SkillsInput } from "@/components/SkillsInput";
import { LocationInput } from "@/components/LocationInput";
import { UniversityInput } from "@/components/UniversityInput";
import { DegreeInput, MajorInput, GraduationDatePicker } from "@/components/EducationDropdowns";
import { Mail, Phone, MapPin, Globe as GlobeIcon } from "lucide-react";
import { LinkedinIcon, GithubIcon } from "@/components/icons";
// import { cn } from "@/lib/utils";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

interface ResumeBuilderProps {
  resumeId: Id<"resumes">;
}

export function ResumeBuilder({ resumeId }: ResumeBuilderProps) {
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [copied, setCopied] = useState(false);
  const [optimisticProjects, setOptimisticProjects] = useState<{
    _id: Id<"projects">;
    resumeId: Id<"resumes">;
    title: string;
    description?: string;
    position: number;
  }[] | null>(null);
  
  const resume = useQuery(api.resumes.get, { id: resumeId });
  const projects = useQuery(api.projects.list, { resumeId });
  const updateResume = useMutation(api.resumes.update);
  const createProjectWithEmbeddings = useAction((api as any).embedActions.createProjectWithEmbeddings);
  const reorderProject = useMutation(api.projects.reorder);
  
  // Use optimistic updates if available, otherwise use real data
  const displayProjects = optimisticProjects || projects;
  
  const [isEditingResume, setIsEditingResume] = useState(false);
  const [resumeTitle, setResumeTitle] = useState("");
  const [resumeDescription, setResumeDescription] = useState("");
  const [resumeName, setResumeName] = useState("");
  const [resumeRole, setResumeRole] = useState("");
  const [resumeSkills, setResumeSkills] = useState<string[]>([]);
  const [resumeEmail, setResumeEmail] = useState("");
  const [resumePhone, setResumePhone] = useState("");
  const [resumeLocation, setResumeLocation] = useState("");
  const [resumeLinkedIn, setResumeLinkedIn] = useState("");
  const [resumeGithub, setResumeGithub] = useState("");
  const [resumePortfolio, setResumePortfolio] = useState("");
  const [resumeUniversity, setResumeUniversity] = useState("");
  const [resumeDegree, setResumeDegree] = useState("");
  const [resumeMajor, setResumeMajor] = useState("");
  const [resumeGPA, setResumeGPA] = useState("");
  const [resumeGraduationDate, setResumeGraduationDate] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  if (!resume) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Loading resume...</p>
      </div>
    );
  }

  const handleSaveResume = async () => {
    await updateResume({
      id: resumeId,
      title: resumeTitle || undefined,
      description: resumeDescription || undefined,
      name: resumeName || undefined,
      role: resumeRole || undefined,
      skills: resumeSkills.length > 0 ? resumeSkills : undefined,
      email: resumeEmail || undefined,
      phone: resumePhone || undefined,
      location: resumeLocation || undefined,
      linkedIn: resumeLinkedIn || undefined,
      github: resumeGithub || undefined,
      portfolio: resumePortfolio || undefined,
      university: resumeUniversity || undefined,
      degree: resumeDegree || undefined,
      major: resumeMajor || undefined,
      gpa: resumeGPA || undefined,
      graduationDate: resumeGraduationDate || undefined,
      isPublic,
    });
    setIsEditingResume(false);
  };

  const handleAddProject = async () => {
    if (newProjectTitle.trim()) {
      await createProjectWithEmbeddings({
        resumeId,
        title: newProjectTitle,
        description: newProjectDescription || undefined,
      });
      setNewProjectTitle("");
      setNewProjectDescription("");
      setShowProjectForm(false);
    }
  };

  const startEditingResume = () => {
    setResumeTitle(resume.title);
    setResumeDescription(resume.description || "");
    setResumeName(resume.name || "");
    setResumeRole(resume.role || "");
    setResumeSkills(resume.skills || []);
    setResumeEmail(resume.email || "");
    setResumePhone(resume.phone || "");
    setResumeLocation(resume.location || "");
    setResumeLinkedIn(resume.linkedIn || "");
    setResumeGithub(resume.github || "");
    setResumePortfolio(resume.portfolio || "");
    setResumeUniversity(resume.university || "");
    setResumeDegree(resume.degree || "");
    setResumeMajor(resume.major || "");
    setResumeGPA(resume.gpa || "");
    setResumeGraduationDate(resume.graduationDate || "");
    setIsPublic(resume.isPublic);
    setIsEditingResume(true);
  };

  const copyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(`${window.location.origin}/resumes/${resumeId}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id || !projects) return;

    const oldIndex = projects.findIndex((p) => p._id === active.id);
    const newIndex = projects.findIndex((p) => p._id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      // Create new order array for optimistic update
      const newOrder = [...projects];
      const [movedItem] = newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, movedItem);
      setOptimisticProjects(newOrder);
      
      // Call reorder with the new order
      try {
        await reorderProject({ 
          resumeId: resumeId,
          projectIds: newOrder.map(p => p._id)
        });
      } finally {
        // Clear optimistic state after server update
        setOptimisticProjects(null);
      }
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Resume Display - Clean Notion-like Design */}
      <div className="mb-8">
        {isEditingResume ? (
          // Edit Form - Clean and organized
          <div className="space-y-8 bg-background p-8 rounded-lg border border-border/40">
            {/* Form Header */}
            <div className="flex items-center justify-between pb-4 border-b border-border/20">
              <h2 className="text-lg font-medium">Edit Resume Details</h2>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingResume(false)}
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveResume}
                >
                  <Check className="h-4 w-4 mr-1" />
                  Save Changes
                </Button>
              </div>
            </div>

            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">Basic Information</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm">Full Name</Label>
                  <Input
                    id="name"
                    value={resumeName}
                    onChange={(e) => setResumeName(e.target.value)}
                    placeholder="John Smith"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role" className="text-sm">Professional Title</Label>
                  <Input
                    id="role"
                    value={resumeRole}
                    onChange={(e) => setResumeRole(e.target.value)}
                    placeholder="Software Engineer"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm">Professional Summary</Label>
                <Textarea
                  id="description"
                  value={resumeDescription}
                  onChange={(e) => setResumeDescription(e.target.value)}
                  placeholder="Brief description of your experience and expertise..."
                  rows={3}
                />
              </div>
            </div>

            {/* Contact Information */}
            <div className="space-y-4">
              <h3 className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">Contact</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={resumeEmail}
                    onChange={(e) => setResumeEmail(e.target.value)}
                    placeholder="john@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-sm">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={resumePhone}
                    onChange={(e) => setResumePhone(e.target.value)}
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="location" className="text-sm">Location</Label>
                <LocationInput
                  value={resumeLocation}
                  onChange={setResumeLocation}
                  placeholder="City, State"
                />
              </div>
            </div>

            {/* Online Profiles */}
            <div className="space-y-4">
              <h3 className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">Online Profiles</h3>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="linkedin" className="text-sm">LinkedIn</Label>
                  <Input
                    id="linkedin"
                    value={resumeLinkedIn}
                    onChange={(e) => setResumeLinkedIn(e.target.value)}
                    placeholder="linkedin.com/in/..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="github" className="text-sm">GitHub</Label>
                  <Input
                    id="github"
                    value={resumeGithub}
                    onChange={(e) => setResumeGithub(e.target.value)}
                    placeholder="github.com/..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="portfolio" className="text-sm">Portfolio</Label>
                  <Input
                    id="portfolio"
                    value={resumePortfolio}
                    onChange={(e) => setResumePortfolio(e.target.value)}
                    placeholder="yoursite.com"
                  />
                </div>
              </div>
            </div>

            {/* Education */}
            <div className="space-y-4">
              <h3 className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">Education</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="university" className="text-sm">University</Label>
                  <UniversityInput
                    value={resumeUniversity}
                    onChange={setResumeUniversity}
                    placeholder="Search universities..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="degree" className="text-sm">Degree</Label>
                  <DegreeInput
                    value={resumeDegree}
                    onChange={setResumeDegree}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="major" className="text-sm">Major</Label>
                  <MajorInput
                    value={resumeMajor}
                    onChange={setResumeMajor}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="graduation" className="text-sm">Graduation</Label>
                  <GraduationDatePicker
                    value={resumeGraduationDate}
                    onChange={setResumeGraduationDate}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="gpa" className="text-sm">GPA (Optional)</Label>
                <Input
                  id="gpa"
                  value={resumeGPA}
                  onChange={(e) => setResumeGPA(e.target.value)}
                  placeholder="3.8"
                />
              </div>
            </div>

            {/* Skills */}
            <div className="space-y-4">
              <h3 className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">Skills</h3>
              <SkillsInput
                value={resumeSkills}
                onChange={setResumeSkills}
                placeholder="Add skills..."
              />
            </div>

            {/* Settings */}
            <div className="space-y-4">
              <h3 className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">Settings</h3>
              <div className="space-y-2">
                <Label htmlFor="title" className="text-sm">Resume Title</Label>
                <Input
                  id="title"
                  value={resumeTitle}
                  onChange={(e) => setResumeTitle(e.target.value)}
                  placeholder="My Resume"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="public"
                  checked={isPublic}
                  onCheckedChange={(checked) => setIsPublic(checked as boolean)}
                />
                <Label htmlFor="public" className="text-sm cursor-pointer">
                  Make this resume public
                </Label>
              </div>
            </div>
          </div>
        ) : (
          // Resume Display View - Matches the viewing page style
          <div className="space-y-6">
            {/* Name and Role with Actions */}
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-normal tracking-tight">
                    {resume.name || resume.title}
                  </h1>
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/30">
                    {resume.isPublic ? (
                      <>
                        <Globe className="h-3.5 w-3.5 text-green-600" />
                        <span className="text-xs font-medium text-green-600">Public</span>
                      </>
                    ) : (
                      <>
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground">Private</span>
                      </>
                    )}
                  </div>
                </div>
                {resume.role && (
                  <p className="text-base text-muted-foreground">
                    {resume.role}
                  </p>
                )}
              </div>
              
              {/* Actions on top right */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startEditingResume}
                  className="h-8"
                >
                  <Edit2 className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Button>
                
                {resume.isPublic && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyLink}
                    className="h-8"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 mr-1.5 text-green-600" />
                        <span className="text-xs">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                        <span className="text-xs">Copy Link</span>
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
            
            {/* Professional Summary */}
            {resume.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {resume.description}
              </p>
            )}
            
            {/* Contact Information */}
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
            
            {/* Links */}
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
            
            {/* Education */}
            {(resume.university || resume.degree || resume.major || resume.gpa || resume.graduationDate) && (
              <div className="py-3 border-y border-border/20">
                <div className="text-xs font-medium text-muted-foreground/70 mb-1.5">EDUCATION</div>
                <div className="text-sm">
                  <div className="font-medium">{resume.university}</div>
                  {(resume.degree || resume.major) && (
                    <div className="text-muted-foreground">
                      {resume.degree}
                      {resume.degree && resume.major && ' • '}
                      {resume.major}
                    </div>
                  )}
                  {(resume.graduationDate || resume.gpa) && (
                    <div className="text-muted-foreground text-xs mt-0.5">
                      {resume.gpa && `GPA: ${resume.gpa}`}
                      {resume.gpa && resume.graduationDate && ' • '}
                      {resume.graduationDate && `Graduation: ${resume.graduationDate}`}
                    </div>
                  )}
                </div>
              </div>
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
          </div>
        )}
      </div>

      {/* Projects Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Projects & Experience</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowProjectForm(true)}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add Project
          </Button>
        </div>

        {showProjectForm && (
          <div className="p-4 border border-border/40 rounded-lg space-y-4 bg-muted/30">
            <Input
              placeholder="Project Title"
              value={newProjectTitle}
              onChange={(e) => setNewProjectTitle(e.target.value)}
              autoFocus
            />
            <Textarea
              placeholder="Project Description (optional)"
              value={newProjectDescription}
              onChange={(e) => setNewProjectDescription(e.target.value)}
              rows={2}
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowProjectForm(false);
                  setNewProjectTitle("");
                  setNewProjectDescription("");
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAddProject}
                disabled={!newProjectTitle.trim()}
              >
                Add Project
              </Button>
            </div>
          </div>
        )}

        {displayProjects && displayProjects.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={displayProjects.map(p => p._id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {displayProjects.map((project) => (
                  <ProjectEditor
                    key={project._id}
                    project={project}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No projects yet. Add your first project to get started.
          </div>
        )}
      </div>
    </div>
  );
}