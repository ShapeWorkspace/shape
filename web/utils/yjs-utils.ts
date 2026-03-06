/**
 * Utility functions for working with Yjs documents.
 */

import * as Y from "yjs"

/**
 * Extracts plaintext content from a Yjs document.
 * TipTap's Collaboration extension stores content in an XmlFragment named 'content'.
 * We convert to DOM to strip HTML and preserve block-level line breaks.
 */
export function extractPlaintextFromYDoc(ydoc: Y.Doc): string {
  try {
    const xmlFragment = ydoc.getXmlFragment("content")
    const div = document.createElement("div")
    div.append(xmlFragment.toDOM())

    const blockTexts: string[] = []
    const childNodes = Array.from(div.childNodes)

    for (const node of childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? ""
        if (text.trim().length > 0) {
          blockTexts.push(text)
        }
        continue
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement
        const text = element.textContent ?? ""
        blockTexts.push(text)
      }
    }

    if (blockTexts.length === 0) {
      return div.textContent || ""
    }

    return blockTexts.join("\n\n")
  } catch {
    return ""
  }
}
