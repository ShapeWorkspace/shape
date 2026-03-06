/**
 * Markdown export utilities shared across entity types.
 * Keeps formatting and filename rules consistent for notes, papers, and tasks.
 */

/**
 * Normalizes a title for use in Markdown output and filenames.
 * Falls back to "Untitled" when no usable title is available.
 */
export function normalizeMarkdownTitle(rawTitle: string | null | undefined): string {
  const trimmedTitle = rawTitle?.trim() ?? ""
  return trimmedTitle.length > 0 ? trimmedTitle : "Untitled"
}

/**
 * Builds a minimal Markdown document from title + body text.
 * Uses an H1 title, followed by the body when present.
 */
export function buildMarkdownDocument({
  title,
  body,
}: {
  title: string | null | undefined
  body: string | null | undefined
}): string {
  const normalizedTitle = normalizeMarkdownTitle(title)
  const normalizedBody = (body ?? "").trim()

  if (normalizedBody.length === 0) {
    return `# ${normalizedTitle}`
  }

  return `# ${normalizedTitle}\n\n${normalizedBody}`
}

/**
 * Creates a filesystem-safe Markdown filename from a title.
 * Uses .md extension and normalizes invalid characters.
 */
export function buildMarkdownFilename(rawTitle: string | null | undefined): string {
  const normalizedTitle = normalizeMarkdownTitle(rawTitle)
  const sanitizedTitle = normalizedTitle.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim()
  const finalTitle = sanitizedTitle.length > 0 ? sanitizedTitle : "Untitled"
  return `${finalTitle}.md`
}
