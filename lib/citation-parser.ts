import { Citation, IdMapping } from "@/types/chat";
import { ReactElement } from "react";

export function parseCitations(
  content: string,
  idMapping?: IdMapping
): { text: string; citations: Citation[] } {
  const citations: Citation[] = [];
  let processedText = content;

  // Pattern to match citations: [Type:"text"]{ID}
  const citationRegex = /\[([^:]+):\s*"([^"]+?)(?:\.\.\.)?"\]\s*\{([^}]*)\}/g;
  let match;
  let citationIndex = 0;

  while ((match = citationRegex.exec(content)) !== null) {
    const type = match[1].toLowerCase();
    const text = match[2];
    const simpleId = match[3];

    // Valid citation types
    const validTypes = ['project', 'bullet', 'branch', 'github', 'portfolio', 'page'];

    if (!validTypes.includes(type)) {
      continue;
    }

    // Map simple ID to Convex ID
    let convexId = simpleId;
    if (idMapping && idMapping.reverse[simpleId]) {
      convexId = idMapping.reverse[simpleId];
    }

    citations.push({
      type,
      text,
      simpleId,
      convexId
    });

    // Replace citation with a marker for rendering
    citationIndex++;
    const marker = `{{citation:${citationIndex - 1}}}`;
    processedText = processedText.replace(match[0], marker);
  }

  return { text: processedText, citations };
}

export function renderTextWithCitations(
  text: string,
  citations: Citation[]
): (string | ReactElement)[] {
  const parts: (string | ReactElement)[] = [];
  const citationPattern = /\{\{citation:(\d+)\}\}/g;
  let lastIndex = 0;
  let match;

  while ((match = citationPattern.exec(text)) !== null) {
    // Add text before citation
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    const citationIndex = parseInt(match[1]);
    const citation = citations[citationIndex];

    if (citation) {
      // Add citation element (will be replaced with actual component)
      parts.push(`[${citation.type}:${citation.text}]`);
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}