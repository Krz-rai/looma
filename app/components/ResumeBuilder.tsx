"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { ProjectEditor } from "./ProjectEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Settings, Globe, Lock, Link as LinkIcon, Copy, Check } from "lucide-react";
import { SkillsInput } from "@/components/SkillsInput";
import { LocationInput } from "@/components/LocationInput";
import { UniversityInput } from "@/components/UniversityInput";
import { DegreeInput, MajorInput, GraduationDatePicker } from "@/components/EducationDropdowns";
import { Mail, Phone, MapPin, Globe as GlobeIcon } from "lucide-react";
import { LinkedinIcon, GithubIcon } from "@/components/icons";
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
  const createProject = useMutation(api.projects.create);
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
      skills: resumeSkills.length > 0 ? resumeSkills : undefined,
      isPublic: isPublic,
    });
    setIsEditingResume(false);
  };

  const handleAddProject = async () => {
    if (newProjectTitle.trim()) {
      await createProject({
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
    setResumeSkills(resume.skills || []);
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
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Resume header */}
      <Card className="p-6">
        {isEditingResume ? (
          <div className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground/80">Basic Information</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="resume-name" className="text-xs text-muted-foreground mb-1.5">
                    Full Name
                  </Label>
                  <Input
                    id="resume-name"
                    value={resumeName}
                    onChange={(e) => setResumeName(e.target.value)}
                    placeholder="John Smith"
                    className="h-9"
                  />
                </div>
                <div>
                  <Label htmlFor="resume-role" className="text-xs text-muted-foreground mb-1.5">
                    Professional Title
                  </Label>
                  <Input
                    id="resume-role"
                    value={resumeRole}
                    onChange={(e) => setResumeRole(e.target.value)}
                    placeholder="Software Engineer"
                    className="h-9"
                  />
                </div>
              </div>
            </div>
            {/* Contact Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground/80">Contact Information</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="resume-email" className="text-xs text-muted-foreground mb-1.5">
                    <Mail className="inline h-3 w-3 mr-1" />
                    Email
                  </Label>
                  <Input
                    id="resume-email"
                    type="email"
                    value={resumeEmail}
                    onChange={(e) => setResumeEmail(e.target.value)}
                    placeholder="john.smith@example.com"
                    className="h-9"
                  />
                </div>
                <div>
                  <Label htmlFor="resume-phone" className="text-xs text-muted-foreground mb-1.5">
                    <Phone className="inline h-3 w-3 mr-1" />
                    Phone
                  </Label>
                  <Input
                    id="resume-phone"
                    type="tel"
                    value={resumePhone}
                    onChange={(e) => setResumePhone(e.target.value)}
                    placeholder="+1 (555) 123-4567"
                    className="h-9"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="resume-location" className="text-xs text-muted-foreground mb-1.5">
                  <MapPin className="inline h-3 w-3 mr-1" />
                  Location
                </Label>
                <LocationInput
                  value={resumeLocation}
                  onChange={setResumeLocation}
                  placeholder="City, State or Remote"
                  className="h-9"
                />
              </div>
            </div>
            {/* Online Profiles */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground/80">Online Profiles</h3>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="resume-linkedin" className="text-xs text-muted-foreground mb-1.5">
                    <LinkedinIcon className="inline h-3 w-3 mr-1" />
                    LinkedIn
                  </Label>
                  <Input
                    id="resume-linkedin"
                    value={resumeLinkedIn}
                    onChange={(e) => setResumeLinkedIn(e.target.value)}
                    placeholder="linkedin.com/in/johnsmith"
                    className="h-9"
                  />
                </div>
                <div>
                  <Label htmlFor="resume-github" className="text-xs text-muted-foreground mb-1.5">
                    <GithubIcon className="inline h-3 w-3 mr-1" />
                    GitHub
                  </Label>
                  <Input
                    id="resume-github"
                    value={resumeGithub}
                    onChange={(e) => setResumeGithub(e.target.value)}
                    placeholder="github.com/johnsmith"
                    className="h-9"
                  />
                </div>
                <div>
                  <Label htmlFor="resume-portfolio" className="text-xs text-muted-foreground mb-1.5">
                    <GlobeIcon className="inline h-3 w-3 mr-1" />
                    Portfolio
                  </Label>
                  <Input
                    id="resume-portfolio"
                    value={resumePortfolio}
                    onChange={(e) => setResumePortfolio(e.target.value)}
                    placeholder="johnsmith.com"
                    className="h-9"
                  />
                </div>
              </div>
            </div>
            {/* Resume Settings */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground/80">Resume Settings</h3>
              <div>
                <Label htmlFor="resume-title" className="text-xs text-muted-foreground mb-1.5">
                  Resume Title
                </Label>
                <Input
                  id="resume-title"
                  value={resumeTitle}
                  onChange={(e) => setResumeTitle(e.target.value)}
                  placeholder="e.g., Software Engineer Resume 2024"
                  className="h-9"
                />
              </div>
            </div>
            {/* Education */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground/80">Education</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="resume-university" className="text-xs text-muted-foreground mb-1.5">
                    University
                  </Label>
                  <UniversityInput
                    value={resumeUniversity}
                    onChange={setResumeUniversity}
                    placeholder="Search universities..."
                    className="h-9"
                  />
                </div>
                <div>
                  <Label htmlFor="resume-degree" className="text-xs text-muted-foreground mb-1.5">
                    Degree
                  </Label>
                  <DegreeInput
                    value={resumeDegree}
                    onChange={setResumeDegree}
                    placeholder="Select degree..."
                    className="h-9"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="resume-major" className="text-xs text-muted-foreground mb-1.5">
                    Major / Field of Study
                  </Label>
                  <MajorInput
                    value={resumeMajor}
                    onChange={setResumeMajor}
                    placeholder="Select major..."
                    className="h-9"
                  />
                </div>
                <div className="grid grid-cols-[1fr_1.5fr] gap-4">
                  <div>
                    <Label htmlFor="resume-gpa" className="text-xs text-muted-foreground mb-1.5">
                      GPA
                    </Label>
                    <Input
                      id="resume-gpa"
                      value={resumeGPA}
                      onChange={(e) => setResumeGPA(e.target.value)}
                      placeholder="3.8/4.0"
                      className="h-9"
                    />
                  </div>
                  <div>
                    <Label htmlFor="resume-graduation" className="text-xs text-muted-foreground mb-1.5">
                      Graduation Date
                    </Label>
                    <GraduationDatePicker
                      value={resumeGraduationDate}
                      onChange={setResumeGraduationDate}
                    />
                  </div>
                </div>
              </div>
            </div>
            {/* Professional Summary */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground/80">Professional Summary</h3>
              <div>
                <Label htmlFor="resume-description" className="text-xs text-muted-foreground mb-1.5">
                  Summary (optional)
                </Label>
                <Textarea
                  id="resume-description"
                  value={resumeDescription}
                  onChange={(e) => setResumeDescription(e.target.value)}
                  className="min-h-[80px] resize-none"
                  placeholder="Brief professional summary or career objective..."
                />
              </div>
            </div>
            {/* Skills */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground/80">Skills</h3>
              <div>
                <Label htmlFor="resume-skills" className="text-xs text-muted-foreground mb-1.5">
                  Professional Skills
                </Label>
                <SkillsInput
                  value={resumeSkills}
                  onChange={setResumeSkills}
                  placeholder="Type to search and add skills..."
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Add your professional skills, tools, and competencies
                </p>
              </div>
            </div>
            {/* Privacy & Actions */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is-public"
                  checked={isPublic}
                  onCheckedChange={(checked) => setIsPublic(checked as boolean)}
                />
                <Label
                  htmlFor="is-public"
                  className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Make resume public (shareable link)
                </Label>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveResume} variant="default" size="sm">
                  Save Changes
                </Button>
                <Button onClick={() => setIsEditingResume(false)} variant="ghost" size="sm">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-start mb-4">
              <div>
                {(resume.name || resume.role) && (
                  <div className="mb-3">
                    {resume.name && (
                      <h2 className="text-xl font-medium">{resume.name}</h2>
                    )}
                    {resume.role && (
                      <p className="text-sm text-muted-foreground">{resume.role}</p>
                    )}
                  </div>
                )}
                <h1 className="text-lg font-medium text-muted-foreground">{resume.title}</h1>
                {resume.description && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {resume.description}
                  </p>
                )}
                {(resume.email || resume.phone || resume.location) && (
                  <div className="flex flex-wrap gap-3 mt-2">
                    {resume.email && (
                      <span className="text-sm text-muted-foreground">{resume.email}</span>
                    )}
                    {resume.phone && (
                      <span className="text-sm text-muted-foreground">{resume.phone}</span>
                    )}
                    {resume.location && (
                      <span className="text-sm text-muted-foreground">{resume.location}</span>
                    )}
                  </div>
                )}
                {(resume.linkedIn || resume.github || resume.portfolio) && (
                  <div className="flex flex-wrap gap-3 mt-2">
                    {resume.linkedIn && (
                      <span className="text-sm text-muted-foreground">{resume.linkedIn}</span>
                    )}
                    {resume.github && (
                      <span className="text-sm text-muted-foreground">{resume.github}</span>
                    )}
                    {resume.portfolio && (
                      <span className="text-sm text-muted-foreground">{resume.portfolio}</span>
                    )}
                  </div>
                )}
                {(resume.university || resume.degree || resume.major || resume.gpa || resume.graduationDate) && (
                  <div className="mt-3 p-2 bg-muted/30 rounded-md">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Education</p>
                    <div className="text-sm text-muted-foreground">
                      {resume.university && <span>{resume.university}</span>}
                      {resume.degree && resume.university && <span> • </span>}
                      {resume.degree && <span>{resume.degree}</span>}
                      {resume.major && (resume.university || resume.degree) && <span> • </span>}
                      {resume.major && <span>{resume.major}</span>}
                      {resume.gpa && <div className="text-xs mt-1">GPA: {resume.gpa}</div>}
                      {resume.graduationDate && <div className="text-xs">Graduation: {resume.graduationDate}</div>}
                    </div>
                  </div>
                )}
                {resume.skills && resume.skills.length > 0 && (
                  <div className="mt-3">
                    <div className="flex flex-wrap gap-1.5">
                      {resume.skills.map((skill, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 bg-muted rounded-md text-xs text-muted-foreground"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-3">
                  {resume.isPublic ? (
                    <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-xs text-muted-foreground">
                      <Globe className="h-3 w-3" strokeWidth={1.5} />
                      Public
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-xs text-muted-foreground">
                      <Lock className="h-3 w-3" strokeWidth={1.5} />
                      Private
                    </div>
                  )}
                </div>
              </div>
              <Button
                onClick={startEditingResume}
                variant="ghost"
                size="sm"
                className="gap-1"
              >
                <Settings className="h-3.5 w-3.5" strokeWidth={1.5} />
                Edit Details
              </Button>
            </div>

            {resume.isPublic && (
              <div className="p-3 bg-muted/50 rounded-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <LinkIcon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                    <p className="text-sm text-muted-foreground">
                      {typeof window !== 'undefined' && `${window.location.origin}/resumes/${resumeId}`}
                    </p>
                  </div>
                  <Button 
                    onClick={copyLink} 
                    variant="ghost" 
                    size="sm" 
                    className="gap-1 min-w-[80px]"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3 w-3" strokeWidth={1.5} />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" strokeWidth={1.5} />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Projects section */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Projects</h2>
          <Button
            onClick={() => setShowProjectForm(true)}
            size="sm"
            className="gap-1"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            Add Project
          </Button>
        </div>

        {showProjectForm && (
          <Card className="p-6">
            <div className="space-y-4">
              <h3 className="text-base font-medium">New Project</h3>
              <div>
                <Label htmlFor="project-title" className="text-sm font-medium mb-2">
                  Project Title
                </Label>
                <Input
                  id="project-title"
                  value={newProjectTitle}
                  onChange={(e) => setNewProjectTitle(e.target.value)}
                  placeholder="e.g., Senior Software Engineer at Company"
                  className="mt-1"
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="project-description" className="text-sm font-medium mb-2">
                  Description (optional)
                </Label>
                <Textarea
                  id="project-description"
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  placeholder="Brief description of the role or project"
                  className="mt-1 min-h-[60px]"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAddProject} variant="default" size="sm">
                  Add Project
                </Button>
                <Button
                  onClick={() => {
                    setNewProjectTitle("");
                    setNewProjectDescription("");
                    setShowProjectForm(false);
                  }}
                  variant="ghost"
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
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
                    isDraggable={true}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          !showProjectForm && (
            <Card className="p-12 text-center border-dashed">
              <p className="text-sm text-muted-foreground">
                No projects yet. Add your first project to get started.
              </p>
            </Card>
          )
        )}
      </div>
    </div>
  );
}