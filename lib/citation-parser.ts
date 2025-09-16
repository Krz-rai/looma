import { Citation, IdMapping } from "@/types/chat";
import { ReactElement } from "react";

export function parseCitations(
  content: string,
  idMapping?: IdMapping
): { text: string; citations: Citation[] } {
  console.log('🔍 parseCitations called with content length:', content.length);
  console.log('🔍 idMapping provided:', !!idMapping, idMapping ? Object.keys(idMapping) : 'none');

  const citations: Citation[] = [];
  let processedText = content;

  // Single unified regex pattern for all citations: [text]{ID}
  // This matches [text]{ID} or 【text】{ID} (for internationalization)
  const citationRegex = /[\[【]([^\]】]+)[\]】]\{([^}]+)\}/g;

  let citationIndex = 0;
  let match;

  // Process all citations with the single pattern
  while ((match = citationRegex.exec(content)) !== null) {
    const [fullMatch, text, id] = match;

    console.log('📌 Found citation:', { text, id, fullMatch });

    // Skip tool indicators like [web_search]
    if (!id || text === 'web_search' || (text.includes('_') && !text.includes(':') && !text.toLowerCase().includes('echo'))) {
      console.log('⏭️ Skipping tool indicator:', fullMatch);
      continue;
    }

    // Validate ID format
    if (!isValidCitationId(id)) {
      console.warn('⚠️ Invalid citation ID format:', id);
      continue;
    }

    // Determine type from ID format
    const type = getCitationType(text, id);

    // Parse citation based on type
    const citation = createCitation(type, text, id, idMapping);

    if (citation) {
      console.log('✅ Adding citation:', citation);
      citations.push(citation);

      // Replace citation with a marker for rendering
      const marker = `{{citation:${citationIndex}}}`;
      processedText = processedText.replace(fullMatch, marker);
      citationIndex++;
    }
  }

  console.log('🏁 parseCitations result:', {
    citationsCount: citations.length,
    citations,
    processedTextLength: processedText.length
  });

  return { text: processedText, citations };
}

// Helper function to validate citation ID format
function isValidCitationId(id: string): boolean {
  // Valid formats:
  // - P1, P2, etc. (projects)
  // - B1, B2, etc. (bullets)
  // - BR1, BR2, etc. (branches)
  // - PG1, PG2, etc. (pages)
  // - PG1:filename (audio)
  // - portfolio, github, web (special types)
  const validPatterns = [
    /^P\d+$/,           // Project: P1, P2
    /^B\d+$/,           // Bullet: B1, B2
    /^BR\d+$/,          // Branch: BR1, BR2
    /^PG\d+$/,          // Page: PG1, PG2
    /^PG\d+:.+$/,       // Audio: PG1:filename
    /^portfolio$/,      // Portfolio
    /^github.*$/,       // GitHub
    /^web$/            // Web
  ];

  return validPatterns.some(pattern => pattern.test(id));
}

// Helper function to determine citation type
function getCitationType(text: string, id: string): string {
  // Check for echo/audio summary citations
  if ((text.toLowerCase().includes('echo') || text.toLowerCase().includes('audio summary')) && text.match(/P\d+/)) {
    return 'echo';
  }

  // Check for audio citations (PG#:filename format)
  if (id.includes(':') && id.startsWith('PG')) {
    return 'audio';
  }

  // Determine type from ID prefix
  if (id.startsWith('P') && id.match(/^P\d+$/)) return 'project';
  if (id.startsWith('B') && id.match(/^B\d+$/)) return 'bullet';
  if (id.startsWith('BR') && id.match(/^BR\d+$/)) return 'branch';
  if (id.startsWith('PG') && id.match(/^PG\d+$/)) return 'page';
  if (id === 'portfolio') return 'portfolio';
  if (id === 'web') return 'web';
  if (id.includes('github')) return 'github';

  // Default to resume type
  return 'resume';
}

// Helper function to create citation object
function createCitation(
  type: string,
  text: string,
  id: string,
  idMapping?: IdMapping
): Citation | null {
  // Map simple ID to Convex ID
  let convexId = id;
  let timestamp: number | undefined;

  // Handle echo citations
  if (type === 'echo') {
    console.log('🎵 Processing echo citation');

    // Extract point number from text (e.g., "Echo P1")
    const pointMatch = text.match(/P(\d+)/);
    if (pointMatch) {
      timestamp = parseInt(pointMatch[1]); // Store point number in timestamp field
      console.log('🎵 Extracted point number:', timestamp);
    }

    // Map page ID to Convex ID
    if (idMapping && idMapping.reverse[id]) {
      convexId = idMapping.reverse[id];
    }

    return {
      type: 'echo',
      text: pointMatch ? `Echo P${timestamp}` : text,
      simpleId: id,
      convexId,
      timestamp,
      fullText: undefined
    };
  }

  // Handle audio citations
  if (type === 'audio') {
    console.log('🎵 Processing audio citation');

    // Format: PG#:filename
    const [pageId, fileName] = id.split(':');
    console.log('🎵 Split audio ID:', { pageId, fileName });

    // Map page ID to Convex ID
    if (idMapping && idMapping.reverse[pageId]) {
      convexId = idMapping.reverse[pageId];
    } else {
      convexId = pageId;
    }

    // Extract timestamp from text (e.g., "filename T123s")
    const timestampMatch = text.match(/T(\d+)s/);
    if (timestampMatch) {
      timestamp = parseInt(timestampMatch[1]);
      console.log('🎵 Found timestamp:', timestamp);
    }

    return {
      type,
      text,
      simpleId: id,
      convexId,
      audioFileName: fileName,
      ...(timestamp !== undefined && { timestamp })
    };
  }

  // Handle regular citations
  if (idMapping && idMapping.reverse[id]) {
    convexId = idMapping.reverse[id];
  }

  return {
    type,
    text,
    simpleId: id,
    convexId
  };
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