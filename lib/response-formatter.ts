/**
 * Post-process AI responses to ensure consistent formatting
 */
export function formatAIResponse(
  content: string
): string {
  let formatted = content;

  // Convert markdown-style bullets to consistent format
  formatted = formatted.replace(/^[-*]\s+/gm, '• ');

  // Remove any [web_search] or similar tool indicators
  formatted = formatted.replace(/\[web_search\]/g, '');
  formatted = formatted.replace(/\[tool_[^\]]+\]/g, '');

  // Ensure proper spacing between bullets
  formatted = formatted.replace(/•\s*/g, '• ');

  // Remove excessive line breaks
  formatted = formatted.replace(/\n{3,}/g, '\n\n');

  // Trim whitespace
  formatted = formatted.trim();

  return formatted;
}

/**
 * Validate response length and truncate if needed
 */
export function enforceResponseLength(content: string, maxWords: number = 180): string {
  const words = content.split(/\s+/);

  if (words.length <= maxWords) {
    return content;
  }

  // Find the last complete sentence within the word limit
  const truncated = words.slice(0, maxWords).join(' ');

  // Check if we're cutting in the middle of a citation
  // Citations look like [text]{ID} and we don't want to break them
  const openBracketCount = (truncated.match(/\[/g) || []).length;
  const closeBracketCount = (truncated.match(/\]/g) || []).length;
  const openBraceCount = (truncated.match(/\{/g) || []).length;
  const closeBraceCount = (truncated.match(/\}/g) || []).length;

  // If we're in the middle of a citation, find the end of it
  if (openBracketCount > closeBracketCount || openBraceCount > closeBraceCount) {
    // Find the next closing brace after truncation point
    const remainingText = content.substring(truncated.length);
    const nextClosingBrace = remainingText.indexOf('}');

    if (nextClosingBrace !== -1 && nextClosingBrace < 20) {
      // Include the complete citation
      return truncated + remainingText.substring(0, nextClosingBrace + 1);
    }
  }

  const lastPeriod = truncated.lastIndexOf('.');
  const lastBullet = truncated.lastIndexOf('•');

  // Cut at the last complete thought
  const cutPoint = Math.max(lastPeriod, lastBullet);
  if (cutPoint > 0) {
    // Make sure we're not cutting a citation at the cut point
    const finalText = truncated.substring(0, cutPoint + 1);

    // Check again if we're breaking a citation
    const finalOpenBrackets = (finalText.match(/\[/g) || []).length;
    const finalCloseBrackets = (finalText.match(/\]/g) || []).length;

    if (finalOpenBrackets > finalCloseBrackets) {
      // We're breaking a citation, don't include the partial citation
      const lastOpenBracket = finalText.lastIndexOf('[');
      return finalText.substring(0, lastOpenBracket).trim();
    }

    return finalText;
  }

  return truncated + '...';
}

/**
 * Main post-processing function
 */
export function postProcessResponse(
  content: string
): string {
  // Only do minimal processing to preserve AI's formatting
  let processed = content;

  // Remove tool indicators
  processed = processed.replace(/\[web_search\]/g, '');
  processed = processed.replace(/\[tool_[^\]]+\]/g, '');

  // Clean up formatting after "AS:" or "------ AS:" markers
  processed = processed.replace(/------\s*AS:\s*([\s\S]*)$/, (_match, content) => {
    // Remove the AS: marker and clean up the content
    return content.trim();
  });

  // Clean up any standalone "----- No space or new lines" text
  processed = processed.replace(/-----\s*No space or new lines\s*$/i, '');

  // Do NOT enforce length limits or format bullets - preserve original formatting
  // processed = enforceResponseLength(processed);

  return processed;
}