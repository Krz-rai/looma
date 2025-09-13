"use client";

import * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface CitationTooltipProps {
  children: React.ReactNode;
  source?: string;
  line?: number | string;
  content: string;
  className?: string;
}

export function CitationTooltip({ 
  children, 
  source = "Source", 
  line, 
  content
}: CitationTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent className="max-w-[500px] px-4 py-3">
        <div className="space-y-2">
          {/* Header section */}
          <div className="space-y-0.5 pb-1.5 border-b border-gray-200">
            <div className="text-[11px] font-semibold text-gray-900 uppercase tracking-wider">
              {source}
            </div>
            {line && (
              <div className="text-[10px] text-gray-500">
                Line {line}
              </div>
            )}
          </div>
          
          {/* Content section */}
          <div className="text-xs leading-relaxed text-gray-700 whitespace-pre-wrap">
            {content}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}