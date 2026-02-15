/**
 * Utility for robust text matching and finding location.
 * Helps locate findings in text content when offsets might be unreliable (e.g. edited text, different wrapping).
 */

/**
 * Normalizes text for comparison:
 * - Unicode Normalization (NFC)
 * - Collapses multiple whitespaces to single space
 * - Trims whitespace
 * - Optional: case folding
 */
export function normalizeText(text: string, options: { caseSensitive?: boolean } = {}): string {
    if (!text) return '';
    let norm = text.normalize('NFC');
    if (!options.caseSensitive) {
        norm = norm.toLowerCase();
    }
    return norm.replace(/\s+/g, ' ').trim();
}

/**
 * Result of a text search
 */
export interface TextMatch {
    start: number;
    end: number;
    text: string;
    confidence: number; // 0-1
}

/**
 * Find all occurrences of a snippet in content.
 * Strategies:
 * 1. Exact match
 * 2. Normalized match (whitespace insensitive)
 * 3. Fuzzy match (future enhancement)
 */
export function findTextOccurrences(
    content: string,
    snippet: string,
    options: {
        caseSensitive?: boolean;
        minConfidence?: number;
    } = {}
): TextMatch[] {
    if (!content || !snippet) return [];

    const matches: TextMatch[] = [];
    const minConfidence = options.minConfidence ?? 1.0;

    // Strategy 1: Exact Match (Fastest)
    let pos = 0;
    while (pos < content.length) {
        const idx = options.caseSensitive
            ? content.indexOf(snippet, pos)
            : content.toLowerCase().indexOf(snippet.toLowerCase(), pos);

        if (idx === -1) break;

        matches.push({
            start: idx,
            end: idx + snippet.length,
            text: content.slice(idx, idx + snippet.length),
            confidence: 1.0
        });
        pos = idx + 1;
    }

    if (matches.length > 0) return matches;

    // Strategy 2: Normalized Match (Handles whitespace diffs)
    // This is more complex because we need to map back to original offsets.
    // We'll traverse the content and snippet token by token.

    // Quick check: if normalized snippet isn't in normalized content, give up early
    const normContent = normalizeText(content, options);
    const normSnippet = normalizeText(snippet, options);

    if (!normContent.includes(normSnippet)) {
        // If loose match fails, exact match definitely failed.
        return [];
    }

    // Implementation of token-based search could go here for "Strategy 2",
    // but for now, if exact match failed but normalized passed, it usually means 
    // whitespace differences (newlines vs spaces).

    // Simple heuristic backup for whitespace differences:
    // Regex escape snippet but replace spaces with \s+
    try {
        const escaped = snippet.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\s+/g, '\\s+');
        const flags = options.caseSensitive ? 'g' : 'gi';
        const regex = new RegExp(escaped, flags);

        let match;
        while ((match = regex.exec(content)) !== null) {
            matches.push({
                start: match.index,
                end: match.index + match[0].length,
                text: match[0],
                confidence: 0.9 // Slightly lower confidence due to whitespace variance
            });
        }
    } catch (e) {
        console.warn('Regex matching failed', e);
    }

    return matches.filter(m => m.confidence >= minConfidence);
}

/**
 * Disambiguates multiple matches to find the "best" one based on original offsets.
 * If we have a hint (original offset), prefer the match closest to it.
 */
export function findBestMatch(
    matches: TextMatch[],
    hintStartOffset?: number
): TextMatch | null {
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];
    if (hintStartOffset === undefined) return matches[0]; // First occurrence default

    // Sort by distance to hint
    return matches.sort((a, b) => {
        const distA = Math.abs(a.start - hintStartOffset);
        const distB = Math.abs(b.start - hintStartOffset);
        return distA - distB;
    })[0];
}
