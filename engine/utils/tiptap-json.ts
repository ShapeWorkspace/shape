/**
 * Utility helpers for working with TipTap/ProseMirror JSON content.
 */

/**
 * Extracts plain text from TipTap JSON content by traversing text nodes.
 * This is used for search indexing when comment bodies are stored as JSON.
 */
export function extractPlaintextFromTipTapJson(content: unknown): string {
  if (!content) {
    return ""
  }

  if (typeof content === "string") {
    return content
  }

  const collectedText: string[] = []

  const visitNode = (node: unknown): void => {
    if (!node) {
      return
    }

    if (Array.isArray(node)) {
      for (const child of node) {
        visitNode(child)
      }
      return
    }

    if (typeof node !== "object") {
      return
    }

    const record = node as Record<string, unknown>

    const textValue = record.text
    if (typeof textValue === "string" && textValue.trim()) {
      collectedText.push(textValue)
    }

    const contentValue = record.content
    if (contentValue) {
      visitNode(contentValue)
    }
  }

  visitNode(content)

  return collectedText.join(" ").replace(/\s+/g, " ").trim()
}
