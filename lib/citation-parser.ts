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

  // Pattern 1: New simplified format: [text]{ID} or 【text】{ID} (Chinese brackets)
  const simpleRegex = /[\[【]([^\]】]+)[\]】]\{([^}]+)\}/g;

  // Pattern 2: Old format: [Type:"text"]{ID} or 【Type:"text"】{ID}
  // Fixed to properly capture citations even when quotes aren't properly closed
  const oldRegex = /[\[【]([^:]+):\s*"([^"\]】]+)"?\s*[\]】]\s*\{([^}]*)\}/g;

  let citationIndex = 0;
  const processedCitations = new Set<string>();

  // First, process old format citations
  let match;
  while ((match = oldRegex.exec(content)) !== null) {
    const type = match[1].toLowerCase();
    const text = match[2];
    const simpleId = match[3];
    const fullMatch = match[0];

    console.log('📌 Found old format citation:', { type, text, simpleId, fullMatch });

    // Valid citation types
    const validTypes = ['project', 'bullet', 'branch', 'github', 'portfolio', 'page', 'resume', 'resume title', 'web', 'audio'];
    const normalizedType = type.toLowerCase() === 'resume title' ? 'resume' : type.toLowerCase();

    if (!validTypes.includes(normalizedType)) {
      console.log('❌ Invalid citation type:', normalizedType);
      continue;
    }

    processedCitations.add(fullMatch);

    // Map simple ID to Convex ID
    let convexId = simpleId;
    let timestamp: number | undefined;
    let audioId: string | undefined;

    // Handle audio citations with PG#:filename format
    if (normalizedType === 'audio') {
      console.log('🎵 Processing audio citation with simpleId:', simpleId);

      // Audio format is PG#:filename
      if (simpleId.includes(':')) {
        const [pageId, fileName] = simpleId.split(':');
        console.log('🎵 Split audio ID:', { pageId, fileName });

        // Map page ID to Convex ID
        if (idMapping && idMapping.reverse[pageId]) {
          convexId = idMapping.reverse[pageId];
          audioId = fileName; // Store the filename as audioId
        } else {
          convexId = pageId; // Use as-is if no mapping
          audioId = fileName;
        }
      }

      // Extract timestamp from text (e.g., "filename T123s")
      const timestampMatch = text.match(/T(\d+)s/);
      if (timestampMatch) {
        timestamp = parseInt(timestampMatch[1]);
        console.log('🎵 Found timestamp:', timestamp);
      }
    } else if (idMapping && idMapping.reverse[simpleId]) {
      convexId = idMapping.reverse[simpleId];
    }

    const citation = {
      type: normalizedType,
      text,
      simpleId,
      convexId,
      ...(timestamp !== undefined && { timestamp }),
      ...(audioId && { audioId, audioFileName: audioId }) // Add audioFileName
    };

    console.log('✅ Adding citation:', citation);
    citations.push(citation);

    // Replace citation with a marker for rendering
    const marker = `{{citation:${citationIndex}}}`;
    processedText = processedText.replace(fullMatch, marker);
    citationIndex++;
  }

  // Then, process new simplified format citations
  processedText = processedText.replace(simpleRegex, (fullMatch, text, id) => {
    // Skip if already processed as old format
    if (processedCitations.has(fullMatch)) {
      console.log('⏭️ Skipping already processed:', fullMatch);
      return fullMatch;
    }

    console.log('🔎 Found simple format citation:', { text, id, fullMatch });

    // Skip tool indicators like [web_search] but NOT audio citations
    if (!id || text === 'web_search' || (text.includes('_') && !text.startsWith('Audio:'))) {
      console.log('⏭️ Skipping tool indicator:', fullMatch);
      return fullMatch;
    }

    // Determine type from ID format
    let type = 'resume';
    if (id.includes(':') && id.startsWith('PG')) {
      // Audio citation format: PG#:filename
      type = 'audio';
      console.log('🎵 Detected audio citation from simple format');
    } else if (id.startsWith('P') && id.match(/^P\d+$/)) type = 'project';
    else if (id.startsWith('B') && id.match(/^B\d+$/)) type = 'bullet';
    else if (id.startsWith('BR') && id.match(/^BR\d+$/)) type = 'branch';
    else if (id.startsWith('PG') && id.match(/^PG\d+$/)) type = 'page';
    else if (id === 'portfolio') type = 'portfolio';
    else if (id === 'web') type = 'web';
    else if (id.includes('github')) type = 'github';

    // Handle special parsing for audio citations
    if (type === 'audio') {
      // Format: PG#:filename
      const [pageId, fileName] = id.split(':');
      console.log('🎵 Split audio citation:', { pageId, fileName });

      // Extract timestamp from text (e.g., "filename T123s")
      let timestamp: number | undefined;
      const timestampMatch = text.match(/T(\d+)s/);
      if (timestampMatch) {
        timestamp = parseInt(timestampMatch[1]);
        console.log('🎵 Extracted timestamp:', timestamp);
      }

      // Map page ID to Convex ID
      const pageConvexId = idMapping && idMapping.reverse[pageId] ? idMapping.reverse[pageId] : pageId;
      console.log('🎵 Mapped page ID:', { pageId, pageConvexId });

      const audioCitation = {
        type,
        text,
        simpleId: id,
        convexId: pageConvexId, // Use page's convex ID
        audioFileName: fileName,
        ...(timestamp !== undefined && { timestamp })
      };
      console.log('✅ Adding audio citation:', audioCitation);
      citations.push(audioCitation);
    } else {
      // Map simple ID to Convex ID for other types
      let convexId = id;
      if (idMapping && idMapping.reverse[id]) {
        convexId = idMapping.reverse[id];
      }

      const regularCitation = {
        type,
        text,
        simpleId: id,
        convexId
      };
      console.log('✅ Adding regular citation:', regularCitation);
      citations.push(regularCitation);
    }

    // Replace citation with a marker for rendering
    const marker = `{{citation:${citationIndex}}}`;
    citationIndex++;
    return marker;
  });

  console.log('🏁 parseCitations result:', {
    citationsCount: citations.length,
    citations,
    processedTextLength: processedText.length
  });

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