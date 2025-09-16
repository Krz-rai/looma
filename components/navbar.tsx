"use client";

// import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import dynamic from "next/dynamic";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

// Dynamically import UserButton to avoid hydration issues
const UserButton = dynamic(() => import("@clerk/nextjs").then(mod => mod.UserButton), {
  ssr: false,
  loading: () => <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
});

interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface NavbarProps {
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  className?: string;
}

export function Navbar({ breadcrumbs = [], actions, className }: NavbarProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Always start with Looma as the root
  const allBreadcrumbs: BreadcrumbItem[] = [
    { label: "Looma", href: "/" },
    ...breadcrumbs
  ];

  return (
    <header className={cn(
      "fixed top-0 left-0 right-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border/40",
      className
    )} style={{ paddingRight: 'calc(100vw - 100%)' }}>
      <div className="w-full px-6">
        <div className="flex items-center justify-between h-12">
          {/* Breadcrumb Navigation */}
          <nav className="flex items-center min-h-[32px]">
            {allBreadcrumbs.map((item, index) => {
              const isLast = index === allBreadcrumbs.length - 1;
              const isFirst = index === 0;
              
              return (
                <div
                  key={index}
                  className="flex items-center"
                  style={{
                    opacity: isMounted ? 1 : 0,
                    transform: isMounted ? 'translateX(0)' : 'translateX(-8px)',
                    transition: 'opacity 0.2s ease-out, transform 0.2s ease-out',
                    transitionDelay: isMounted ? `${index * 50}ms` : '0ms'
                  }}
                >
                  {index > 0 && (
                    <ChevronRight className="h-3 w-3 mx-1.5 text-muted-foreground/50" />
                  )}
                  
                  {/* Special handling for Looma to ensure consistent size */}
                  {isFirst ? (
                    // Looma gets special treatment
                    item.href ? (
                      <Link href={item.href} className="flex items-center">
                        <div className="px-2 py-1 hover:bg-muted/60 rounded-md transition-colors">
                          <span
                            className="inline-block font-light tracking-wider text-foreground"
                            style={{
                              fontFamily: 'Georgia, serif',
                              fontSize: '16px',
                              lineHeight: '24px',
                              minWidth: '60px'
                            }}
                          >
                            {item.label}
                          </span>
                        </div>
                      </Link>
                    ) : (
                      <div className="px-2 py-1">
                        <span
                          className="inline-block font-light tracking-wider text-foreground"
                          style={{
                            fontFamily: 'Georgia, serif',
                            fontSize: '16px',
                            lineHeight: '24px',
                            minWidth: '60px'
                          }}
                        >
                          {item.label}
                        </span>
                      </div>
                    )
                  ) : (
                    // All other breadcrumb items
                    isLast ? (
                      <span className="text-sm font-medium px-2">
                        {item.label}
                      </span>
                    ) : (
                      item.href ? (
                        <Link href={item.href}>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 px-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                          >
                            <span className="text-sm">{item.label}</span>
                          </Button>
                        </Link>
                      ) : item.onClick ? (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={item.onClick}
                          className="h-8 px-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                        >
                          <span className="text-sm">{item.label}</span>
                        </Button>
                      ) : (
                        <span className="text-sm font-medium px-2">
                          {item.label}
                        </span>
                      )
                    )
                  )}
                </div>
              );
            })}
          </nav>

          {/* Right side actions */}
          <div className="flex items-center gap-2">
            {actions}
            {actions && <div className="w-px h-5 bg-border/60 mx-1" />}
            <ThemeToggle />
            <UserButton />
          </div>
        </div>
      </div>
    </header>
  );
}