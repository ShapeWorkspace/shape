/**
 * Text Utilities
 *
 * Functions for text processing, HTML stripping, and truncation.
 */

/**
 * Normalize HTML into plaintext for UI display.
 * Decodes common entities, strips markup, and collapses whitespace.
 *
 * This is UI-facing; search indexing has its own engine-layer normalization.
 */
export function normalizeHtmlStringForPlaintextDisplay(html: string): string {
  const decodedHtml = html
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

  return decodedHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

/**
 * Truncate text to a maximum length, adding ellipsis if needed.
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength).trim() + "..."
}

/**
 * Strip HTML and truncate text for preview display.
 * Combines normalizeHtmlStringForPlaintextDisplay and truncateText for common use case.
 */
export function getPlainTextPreview(html: string, maxLength: number): string {
  return truncateText(normalizeHtmlStringForPlaintextDisplay(html), maxLength)
}
