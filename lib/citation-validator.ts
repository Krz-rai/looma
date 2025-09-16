import { IdMapping } from '@/types/chat';

/**
 * Citation validation module for real-time validation during streaming
 */

// Valid citation ID patterns
const CITATION_ID_PATTERNS = [
  /^P\d+$/,           // Project: P1, P2
  /^B\d+$/,           // Bullet: B1, B2
  /^BR\d+$/,          // Branch: BR1, BR2
  /^PG\d+$/,          // Page: PG1, PG2
  /^PG\d+:.+$/,       // Audio: PG1:filename
  /^portfolio$/,      // Portfolio
  /^github.*$/,       // GitHub
  /^web$/            // Web
];

// Main citation pattern: [text]{ID}
const CITATION_REGEX = /\[([^\]]+)\]\{([^}]+)\}/g;

/**
 * Validates a single citation format
 */
export function isValidCitation(citation: string): boolean {
  const match = citation.match(/^\[([^\]]+)\]\{([^}]+)\}$/);
  if (!match) return false;

  const [, text, id] = match;

  // Validate text is not empty
  if (!text || text.trim().length === 0) {
    console.warn('Citation validation failed: empty text');
    return false;
  }

  // Validate ID format
  if (!isValidCitationId(id)) {
    console.warn(`Citation validation failed: invalid ID format "${id}"`);
    return false;
  }

  return true;
}

/**
 * Validates a citation ID against known patterns
 */
export function isValidCitationId(id: string): boolean {
  return CITATION_ID_PATTERNS.some(pattern => pattern.test(id));
}

/**
 * Validates all citations in a text string
 */
export function validateAllCitations(
  text: string,
  idMapping?: IdMapping
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  let match;

  CITATION_REGEX.lastIndex = 0;
  while ((match = CITATION_REGEX.exec(text)) !== null) {
    const [fullMatch, citationText, id] = match;

    // Check format
    if (!citationText || citationText.trim().length === 0) {
      errors.push(`Empty citation text in: ${fullMatch}`);
      continue;
    }

    // Check ID format
    if (!isValidCitationId(id)) {
      errors.push(`Invalid ID format "${id}" in: ${fullMatch}`);
      continue;
    }

    // If ID mapping provided, check if ID exists
    if (idMapping) {
      const needsMapping = /^(P|B|BR|PG)\d+$/.test(id);
      if (needsMapping && !idMapping.reverse[id]) {
        console.warn(`Citation ID "${id}" not found in mapping`);
        // Don't treat as error - ID might be valid but not in current context
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Real-time citation validation for streaming responses
 * Returns cleaned text with invalid citations removed
 */
export function validateAndCleanCitations(
  text: string,
  idMapping?: IdMapping,
  logErrors: boolean = true
): string {
  const validation = validateAllCitations(text, idMapping);

  if (validation.valid) {
    return text;
  }

  if (logErrors) {
    console.warn('Citation validation errors:', validation.errors);
  }

  // Remove invalid citations
  let cleanedText = text;
  validation.errors.forEach(error => {
    const match = error.match(/in: (\[.*?\]\{.*?\})/);
    if (match) {
      const invalidCitation = match[1];
      cleanedText = cleanedText.replace(invalidCitation, '');
    }
  });

  return cleanedText;
}

/**
 * Monitors streaming text for citation issues
 * Can be used to track citation quality metrics
 */
export class CitationMonitor {
  private totalCitations = 0;
  private validCitations = 0;
  private invalidPatterns: Map<string, number> = new Map();

  processChunk(chunk: string, idMapping?: IdMapping): void {
    const validation = validateAllCitations(chunk, idMapping);

    // Count citations
    const citationMatches = chunk.match(CITATION_REGEX);
    if (citationMatches) {
      this.totalCitations += citationMatches.length;
      this.validCitations += citationMatches.length - validation.errors.length;
    }

    // Track invalid patterns
    validation.errors.forEach(error => {
      const pattern = this.extractErrorPattern(error);
      this.invalidPatterns.set(
        pattern,
        (this.invalidPatterns.get(pattern) || 0) + 1
      );
    });
  }

  private extractErrorPattern(error: string): string {
    if (error.includes('Empty citation text')) return 'empty_text';
    if (error.includes('Invalid ID format')) return 'invalid_id';
    if (error.includes('not found in mapping')) return 'missing_mapping';
    return 'unknown';
  }

  getMetrics() {
    return {
      totalCitations: this.totalCitations,
      validCitations: this.validCitations,
      invalidCitations: this.totalCitations - this.validCitations,
      accuracy: this.totalCitations > 0
        ? (this.validCitations / this.totalCitations * 100).toFixed(2) + '%'
        : '100%',
      invalidPatterns: Object.fromEntries(this.invalidPatterns),
    };
  }

  reset(): void {
    this.totalCitations = 0;
    this.validCitations = 0;
    this.invalidPatterns.clear();
  }
}

/**
 * Suggests corrections for common citation errors
 */
export function suggestCitationFix(invalidCitation: string): string | null {
  // Check for common issues

  // Missing brackets
  const missingBrackets = invalidCitation.match(/^([^[]+)\{([^}]+)\}$/);
  if (missingBrackets) {
    return `[${missingBrackets[1]}]{${missingBrackets[2]}}`;
  }

  // Space between brackets and braces
  const spacedCitation = invalidCitation.match(/^\[([^\]]+)\]\s+\{([^}]+)\}$/);
  if (spacedCitation) {
    return `[${spacedCitation[1]}]{${spacedCitation[2]}}`;
  }

  // Wrong bracket type (parentheses instead of square brackets)
  const wrongBrackets = invalidCitation.match(/^\(([^)]+)\)\{([^}]+)\}$/);
  if (wrongBrackets) {
    return `[${wrongBrackets[1]}]{${wrongBrackets[2]}}`;
  }

  // Old format with Type:"text"
  const oldFormat = invalidCitation.match(/^\[(\w+):\s*"([^"]+)"\]\{([^}]+)\}$/);
  if (oldFormat) {
    return `[${oldFormat[2]}]{${oldFormat[3]}}`;
  }

  return null;
}