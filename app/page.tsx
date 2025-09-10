"use client";

import { Authenticated, Unauthenticated } from "convex/react";
import Link from "next/link";
import { SignInButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { 
  ArrowRight, 
  Bot,
  FileText,
  Layers3,
  MousePointerClick
} from "lucide-react";
import { Navbar } from "@/components/navbar";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Use the same Navbar component */}
      <Navbar />

      {/* Main content */}
      <main className="pt-12">
        <Authenticated>
          <AuthenticatedHome />
        </Authenticated>
        <Unauthenticated>
          <UnauthenticatedHome />
        </Unauthenticated>
      </main>
    </div>
  );
}

function UnauthenticatedHome() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-20">
      {/* Hero */}
      <div className="space-y-4 mb-20 text-center">
        <h1 className="text-4xl sm:text-5xl font-light tracking-tight">
          Interactive resumes that <br className="hidden sm:block" />
          <span className="text-muted-foreground">adapt to your audience</span>
        </h1>
        <p className="text-base text-muted-foreground max-w-xl mx-auto">
          Create living documents where viewers can explore your experience in depth. 
          AI-powered insights help them find exactly what they&apos;re looking for.
        </p>
        
        <div className="pt-6">
          <SignInButton mode="modal">
            <Button size="lg" className="h-10 px-6">
              Get started free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </SignInButton>
          <p className="text-xs text-muted-foreground mt-3">
            No credit card required
          </p>
        </div>
      </div>

      {/* Features Grid - Notion style */}
      <div className="grid gap-1 border border-border/40 rounded-lg overflow-hidden mb-20">
        <div className="grid sm:grid-cols-3 gap-1">
          <div className="bg-muted/20 p-6 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center">
              <Layers3 className="h-4 w-4 text-foreground/70" />
            </div>
            <h3 className="text-sm font-medium">Progressive detail</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Surface key points, let viewers dive deeper when interested
            </p>
          </div>
          
          <div className="bg-muted/20 p-6 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center">
              <Bot className="h-4 w-4 text-foreground/70" />
            </div>
            <h3 className="text-sm font-medium">AI assistant</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Aurea answers questions about your experience instantly
            </p>
          </div>
          
          <div className="bg-muted/20 p-6 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center">
              <MousePointerClick className="h-4 w-4 text-foreground/70" />
            </div>
            <h3 className="text-sm font-medium">Live editing</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Updates appear instantly for all viewers in real-time
            </p>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="space-y-8">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          How it works
        </h2>
        
        <div className="space-y-6">
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
              1
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Build your narrative</p>
              <p className="text-sm text-muted-foreground">
                Add projects and achievements with expandable detail branches
              </p>
            </div>
          </div>
          
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
              2
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Share intelligently</p>
              <p className="text-sm text-muted-foreground">
                Viewers see highlights first, explore details on demand
              </p>
            </div>
          </div>
          
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
              3
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Let AI guide discovery</p>
              <p className="text-sm text-muted-foreground">
                Aurea helps viewers find relevant experience through conversation
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthenticatedHome() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      {/* Welcome back section */}
      <div className="mb-12">
        <h1 className="text-2xl font-light mb-2">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Continue where you left off or start something new
        </p>
      </div>

      {/* Quick actions */}
      <div className="grid gap-1 border border-border/40 rounded-lg overflow-hidden mb-12">
        <Link href="/resumes" className="block">
          <div className="p-4 hover:bg-muted/30 transition-colors group cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">View resumes</p>
                  <p className="text-xs text-muted-foreground">Manage and edit your collection</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </Link>
        
        <div className="h-px bg-border/40" />
        
        <Link href="/resumes/new" className="block">
          <div className="p-4 hover:bg-muted/30 transition-colors group cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 flex items-center justify-center text-muted-foreground">
                  +
                </div>
                <div>
                  <p className="text-sm font-medium">Create new resume</p>
                  <p className="text-xs text-muted-foreground">Start from scratch or use a template</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </Link>
      </div>

      {/* Tips section */}
      <div className="space-y-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Tips
        </h3>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>• Use branches to add context without cluttering the main view</p>
          <p>• Keep bullet points concise - let branches tell the full story</p>
          <p>• Test Aurea AI with questions recruiters might ask</p>
        </div>
      </div>
    </div>
  );
}