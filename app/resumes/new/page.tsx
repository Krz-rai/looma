"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  FileText,
  Code2,
  Palette,
  Briefcase,
  TrendingUp,
  GraduationCap
} from "lucide-react";
import { Navbar } from "@/components/navbar";
// import { UserButton } from "@clerk/nextjs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SkillsInput } from "@/components/SkillsInput";

// Template options - Notion-like minimal
const templates = [
  {
    id: "blank",
    name: "Blank Canvas",
    description: "Start fresh with no template",
    icon: FileText,
  },
  {
    id: "software",
    name: "Engineering",
    description: "Software developers & engineers",
    icon: Code2,
    sample: {
      title: "Software Engineer Resume",
      description: "Full-stack developer with expertise in modern web technologies",
    }
  },
  {
    id: "design",
    name: "Design",
    description: "Designers & creative roles",
    icon: Palette,
    sample: {
      title: "Product Designer Resume",
      description: "Creating user-centered designs that drive engagement",
    }
  },
  {
    id: "business",
    name: "Business",
    description: "Management & operations",
    icon: Briefcase,
    sample: {
      title: "Product Manager Resume",
      description: "Strategic leader driving product innovation and growth",
    }
  },
  {
    id: "sales",
    name: "Sales",
    description: "Sales & business development",
    icon: TrendingUp,
    sample: {
      title: "Sales Executive Resume",
      description: "Driving revenue growth through strategic partnerships",
    }
  },
  {
    id: "student",
    name: "Student",
    description: "New grads & internships",
    icon: GraduationCap,
    sample: {
      title: "Recent Graduate Resume",
      description: "Eager to apply academic knowledge in a professional setting",
    }
  }
];

export default function NewResumePage() {
  const router = useRouter();
  const [step, setStep] = useState<"template" | "details">("template");
  const [, setSelectedTemplate] = useState<string>("");
  const [resumeTitle, setResumeTitle] = useState("");
  const [resumeDescription, setResumeDescription] = useState("");
  const [yourName, setYourName] = useState("");
  const [yourRole, setYourRole] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const createResume = useMutation(api.resumes.create);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    
    // Pre-fill form based on template
    const template = templates.find(t => t.id === templateId);
    if (template && template.sample) {
      setResumeTitle(template.sample.title);
      setResumeDescription(template.sample.description);
    }
    
    setStep("details");
  };

  const handleCreateResume = async () => {
    if (!resumeTitle.trim()) {
      toast.error("Please enter a title for your resume");
      return;
    }

    setIsCreating(true);
    try {
      const resumeId = await createResume({
        title: resumeTitle,
        description: resumeDescription || undefined,
        name: yourName || undefined,
        role: yourRole || undefined,
        skills: skills.length > 0 ? skills : undefined,
        isPublic: isPublic,
      });
      
      toast.success("Resume created successfully!");
      router.push(`/resumes/${resumeId}/edit`);
    } catch {
      toast.error("Failed to create resume");
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar 
        breadcrumbs={[
          { label: "My Resumes", href: "/resumes" },
          { label: step === "template" ? "Choose Template" : "Resume Details" }
        ]}
      />

      <main className="pt-12">
        <div className="max-w-4xl mx-auto px-6 py-12">
          {step === "template" ? (
            <>
              {/* Header - Notion style */}
              <div className="mb-10">
                <h1 className="text-2xl font-light mb-2">Select a template</h1>
                <p className="text-sm text-muted-foreground">
                  Choose a starting point for your resume
                </p>
              </div>

              {/* Template Grid - Notion-like simplicity */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
                {templates.map((template) => {
                  const Icon = template.icon;
                  return (
                    <button
                      key={template.id}
                      onClick={() => handleTemplateSelect(template.id)}
                      className={cn(
                        "p-5 rounded-lg border border-border/50 text-left",
                        "hover:bg-muted/30 transition-colors"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Icon className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div className="space-y-1 flex-1">
                          <h3 className="text-sm font-medium">{template.name}</h3>
                          <p className="text-xs text-muted-foreground">
                            {template.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Back option */}
              <div className="pt-4">
                <Link href="/resumes">
                  <button className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    ← Back to my resumes
                  </button>
                </Link>
              </div>
            </>
          ) : (
            <>
              {/* Details Step - Notion style */}
              <div className="max-w-xl mx-auto">
                {/* Header with back */}
                <div className="mb-10">
                  <button
                    onClick={() => setStep("template")}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
                  >
                    ← Change template
                  </button>
                  
                  <h1 className="text-3xl font-light mb-3">Set up your resume</h1>
                  <p className="text-muted-foreground">
                    Add your information. You can always edit this later.
                  </p>
                </div>

                {/* Form - Notion style */}
                <div className="space-y-8">
                  {/* Personal Info */}
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="name" className="text-sm font-medium mb-2 block">
                        Name
                      </Label>
                      <Input
                        id="name"
                        value={yourName}
                        onChange={(e) => setYourName(e.target.value)}
                        placeholder="Your full name"
                        className="bg-transparent"
                      />
                    </div>
                    <div>
                      <Label htmlFor="role" className="text-sm font-medium mb-2 block">
                        Role
                      </Label>
                      <Input
                        id="role"
                        value={yourRole}
                        onChange={(e) => setYourRole(e.target.value)}
                        placeholder="Your current or desired position"
                        className="bg-transparent"
                      />
                    </div>
                  </div>

                  {/* Resume Details */}
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="title" className="text-sm font-medium mb-2 block">
                        Title <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="title"
                        value={resumeTitle}
                        onChange={(e) => setResumeTitle(e.target.value)}
                        placeholder="Name for this resume (e.g., 2024 Resume)"
                        className="bg-transparent"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="description" className="text-sm font-medium mb-2 block">
                        Professional Summary
                      </Label>
                      <Textarea
                        id="description"
                        value={resumeDescription}
                        onChange={(e) => setResumeDescription(e.target.value)}
                        placeholder="A brief overview of your experience and goals..."
                        className="bg-transparent min-h-[100px] resize-none"
                      />
                    </div>

                    <div>
                      <Label htmlFor="skills" className="text-sm font-medium mb-2 block">
                        Skills
                      </Label>
                      <SkillsInput
                        value={skills}
                        onChange={setSkills}
                        placeholder="Type to search and add skills..."
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Add your professional skills, tools, and competencies
                      </p>
                    </div>
                  </div>

                  {/* Visibility */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium block">
                      Visibility
                    </Label>
                    <div className="space-y-2">
                      <label
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                          isPublic 
                            ? "border-foreground/20 bg-muted/10" 
                            : "border-border/40 hover:bg-muted/5"
                        )}
                      >
                        <input
                          type="radio"
                          name="visibility"
                          checked={isPublic}
                          onChange={() => setIsPublic(true)}
                          className="sr-only"
                        />
                        <div className={cn(
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                          isPublic ? "border-foreground" : "border-muted-foreground"
                        )}>
                          {isPublic && <div className="w-2 h-2 rounded-full bg-foreground" />}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">Public</p>
                          <p className="text-xs text-muted-foreground">
                            Share with anyone via link
                          </p>
                        </div>
                      </label>
                      
                      <label
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                          !isPublic 
                            ? "border-foreground/20 bg-muted/10" 
                            : "border-border/40 hover:bg-muted/5"
                        )}
                      >
                        <input
                          type="radio"
                          name="visibility"
                          checked={!isPublic}
                          onChange={() => setIsPublic(false)}
                          className="sr-only"
                        />
                        <div className={cn(
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                          !isPublic ? "border-foreground" : "border-muted-foreground"
                        )}>
                          {!isPublic && <div className="w-2 h-2 rounded-full bg-foreground" />}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">Private</p>
                          <p className="text-xs text-muted-foreground">
                            Only visible to you
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Create button - Notion style */}
                  <div className="pt-8 border-t border-border/20">
                    <Button
                      onClick={handleCreateResume}
                      disabled={isCreating || !resumeTitle.trim()}
                      className="w-full"
                      size="lg"
                    >
                      {isCreating ? (
                        "Creating..."
                      ) : (
                        "Create Resume"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}