/**
 * HTML Text Normalization
 *
 * Engine-layer helpers for converting HTML-backed content into stable plaintext
 * that is safe to store in the search index. This is intentionally separate
 * from UI helpers to keep search behavior deterministic and backend-consistent.
 */

/**
 * Normalize an HTML string for search indexing by decoding common entities,
 * stripping markup, and collapsing whitespace.
 *
 * This is NOT intended for UI display (no truncation, no styling concerns).
 */
export function normalizeHtmlStringForPlaintextSearchIndexing(
  html: string | null | undefined
): string {
  if (!html) {
    return ""
  }

  const decodedHtml = html
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

  return decodedHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}
