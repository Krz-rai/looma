"use client";

import React, { useState, useEffect } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";

interface EchoCitationTooltipProps {
  children: React.ReactNode;
  pointNumber: number;
  content?: string;
}

export function EchoCitationTooltip({
  children,
  pointNumber,
  content: providedContent
}: EchoCitationTooltipProps) {
  const [content, setContent] = useState<string>(providedContent || `Echo Point ${pointNumber}`);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // If content is provided, use it directly
    if (providedContent) {
      setContent(providedContent);
      return;
    }

    if (!isOpen) return;

    // When tooltip opens, try to find the echo content
    const findEchoContent = () => {
      const summaryElements = document.querySelectorAll(`[id^="echo-point-"], [id^="audio-summary-point-"]`);

      for (const element of summaryElements) {
        const elementId = element.id;
        const match = elementId.match(/(?:echo|audio-summary)-point-.*-(\d+)$/);

        if (match && parseInt(match[1]) === pointNumber) {
          // Found the matching element - get its text content
          const textContent = element.textContent?.trim();
          if (textContent) {
            // Remove the bullet point if present
            const cleanedText = textContent.replace(/^[•·]\s*/, '');
            setContent(cleanedText);
            return;
          }
        }
      }
    };

    // Try immediately and after a short delay
    findEchoContent();
    const timer = setTimeout(findEchoContent, 100);

    return () => clearTimeout(timer);
  }, [isOpen, pointNumber, providedContent]);

  return (
    <TooltipProvider>
      <Tooltip open={isOpen} onOpenChange={setIsOpen}>
        <TooltipTrigger asChild>
          {children}
        </TooltipTrigger>
        <TooltipContent
          className="max-w-md p-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xl rounded-lg"
          sideOffset={5}
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 bg-blue-500 dark:bg-blue-400 rounded-full" />
              <div className="font-medium text-xs text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                Echo Point {pointNumber}
              </div>
            </div>
            <blockquote className="pl-3 border-l-2 border-neutral-200 dark:border-neutral-700">
              <p className="text-sm text-neutral-800 dark:text-neutral-200 leading-relaxed italic">
                &quot;{content}&quot;
              </p>
            </blockquote>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}