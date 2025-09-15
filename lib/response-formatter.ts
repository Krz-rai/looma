/**
 * Post-process AI responses to ensure consistent formatting
 */
export function formatAIResponse(
  content: string
): string {
  let formatted = content;

  // Convert markdown-style bullets to consistent format
  formatted = formatted.replace(/^[-*]\s+/gm, '• ');

  // Fix citation formats
  formatted = fixCitationFormats(formatted);

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
 * Fix various citation format issues
 */
function fixCitationFormats(content: string): string {
  let fixed = content;

  // Keep the Type:"text" format as-is, the parser handles both formats
  // Don't strip line numbers from page citations - they're important!

  // Fix citations with missing brackets
  // Only match patterns where {ID} is NOT preceded by ]
  // This handles patterns like "(0.1% fraud rate) {BR3}" but not "[text]{P1}"
  fixed = fixed.replace(/(?<!\])([^[\]]{0,50}?)\s*\{([A-Z]+\d+|portfolio|github[^}]*)\}/g, (match, text, id) => {
    // Clean up the text - remove leading punctuation/whitespace
    let cleanText = text.trim();
    // If text starts with punctuation (except parentheses), remove it
    cleanText = cleanText.replace(/^[,;:.]+\s*/, '');

    // If text is empty or just whitespace, use a generic label
    if (!cleanText) {
      cleanText = 'Reference';
    }

    return `[${cleanText}]{${id}}`;
  });

  // Don't remove citations based on ID mapping - let the parser handle validation
  // The parser will handle invalid IDs appropriately

  return fixed;
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

  // Fix citation formats
  processed = fixCitationFormats(processed);

  // Remove tool indicators
  processed = processed.replace(/\[web_search\]/g, '');
  processed = processed.replace(/\[tool_[^\]]+\]/g, '');

  // Clean up formatting after "AS:" or "------ AS:" markers
  processed = processed.replace(/------\s*AS:\s*([\s\S]*)$/, (match, content) => {
    // Remove the AS: marker and clean up the content
    return content.trim();
  });

  // Clean up any standalone "----- No space or new lines" text
  processed = processed.replace(/-----\s*No space or new lines\s*$/i, '');

  // Do NOT enforce length limits or format bullets - preserve original formatting
  // processed = enforceResponseLength(processed);

  return processed;
}