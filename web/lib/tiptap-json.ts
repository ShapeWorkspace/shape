/**
 * Utility helpers for working with TipTap/ProseMirror JSON content on the web.
 *
 * These helpers are used for paper comments (stored as JSON) and search/preview
 * behavior that needs plaintext or HTML output.
 */

import { generateHTML, type JSONContent } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import Highlight from "@tiptap/extension-highlight"
import { AttachmentNode } from "../components/tiptap-extensions/AttachmentNode"
import { EntityLinkNode } from "../components/tiptap-extensions/EntityLinkNode"
import { Image } from "../components/tiptap-node/image-node/image-node-extension"

const CONTENTFUL_NODE_TYPES = new Set(["image", "attachment", "entityLink"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === "string"
}

function isJSONContent(value: unknown): value is JSONContent {
  if (!isRecord(value)) {
    return false
  }

  const typeValue = value.type
  if (typeValue !== undefined && !isString(typeValue)) {
    return false
  }

  const textValue = value.text
  if (textValue !== undefined && !isString(textValue)) {
    return false
  }

  const attrsValue = value.attrs
  if (attrsValue !== undefined && attrsValue !== null && !isRecord(attrsValue)) {
    return false
  }

  const contentValue = value.content
  if (contentValue !== undefined && !Array.isArray(contentValue)) {
    return false
  }

  const marksValue = value.marks
  if (marksValue !== undefined && !Array.isArray(marksValue)) {
    return false
  }

  return true
}

/**
 * Normalizes arbitrary values to TipTap JSONContent, returning null if invalid.
 */
export function normalizeTipTapJsonContent(content: unknown): JSONContent | null {
  if (!isJSONContent(content)) {
    return null
  }
  return content
}

/**
 * Converts TipTap JSONContent into a plain record suitable for storage payloads.
 */
export function convertTipTapJsonContentToRecord(content: JSONContent): Record<string, unknown> {
  const serialized = JSON.stringify(content)
  const parsed: unknown = JSON.parse(serialized)
  if (isRecord(parsed)) {
    return parsed
  }
  return {}
}

function collectPlaintextFromTipTapNode(node: unknown, collectedText: string[]): void {
  if (!node) {
    return
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      collectPlaintextFromTipTapNode(child, collectedText)
    }
    return
  }

  if (!isRecord(node)) {
    return
  }

  const textValue = node.text
  if (isString(textValue) && textValue.trim()) {
    collectedText.push(textValue)
  }

  const nodeTypeValue = node.type
  if (nodeTypeValue === "entityLink") {
    const attrsValue = node.attrs
    if (isRecord(attrsValue)) {
      const titleValue = attrsValue.title
      if (isString(titleValue) && titleValue.trim()) {
        collectedText.push(titleValue)
      }
    }
  }

  const contentValue = node.content
  if (contentValue) {
    collectPlaintextFromTipTapNode(contentValue, collectedText)
  }
}

/**
 * Extracts plain text from TipTap JSON content by traversing text nodes.
 * Includes entity link titles so link-only comments still index.
 */
export function extractPlaintextFromTipTapJson(content: unknown): string {
  if (!content) {
    return ""
  }

  if (isString(content)) {
    return content
  }

  const collectedText: string[] = []
  collectPlaintextFromTipTapNode(content, collectedText)

  return collectedText.join(" ").replace(/\s+/g, " ").trim()
}

function hasMeaningfulTipTapContent(node: unknown): boolean {
  if (!node) {
    return false
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      if (hasMeaningfulTipTapContent(child)) {
        return true
      }
    }
    return false
  }

  if (!isRecord(node)) {
    return false
  }

  const textValue = node.text
  if (isString(textValue) && textValue.trim()) {
    return true
  }

  const nodeTypeValue = node.type
  if (isString(nodeTypeValue) && CONTENTFUL_NODE_TYPES.has(nodeTypeValue)) {
    return true
  }

  const contentValue = node.content
  if (contentValue) {
    return hasMeaningfulTipTapContent(contentValue)
  }

  return false
}

/**
 * Checks whether TipTap JSON content has meaningful content.
 * Treats images, attachments, and entity links as meaningful even without text.
 */
export function hasTipTapJsonContent(content: unknown): boolean {
  return hasMeaningfulTipTapContent(content)
}

/**
 * Extracts mentioned user IDs from TipTap JSON content.
 * Mentions are represented as entityLink nodes with entityType contact/member.
 */
export function extractMentionedUserIdsFromTipTapJson(content: unknown): string[] {
  const mentionedUserIds = new Set<string>()

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

    if (!isRecord(node)) {
      return
    }

    if (node.type === "entityLink") {
      const attrsValue = node.attrs
      if (isRecord(attrsValue)) {
        const entityTypeValue = attrsValue.entityType
        const entityIdValue = attrsValue.entityId
        if (
          (entityTypeValue === "contact" || entityTypeValue === "member") &&
          isString(entityIdValue) &&
          entityIdValue.trim().length > 0
        ) {
          mentionedUserIds.add(entityIdValue)
        }
      }
    }

    const contentValue = node.content
    if (contentValue) {
      visitNode(contentValue)
    }
  }

  visitNode(content)

  return Array.from(mentionedUserIds)
}

/**
 * Renders TipTap JSON to HTML using the same extensions as the editor.
 * Returns an empty string for invalid content.
 */
export function renderTipTapJsonToHtml(content: unknown): string {
  if (typeof content === "string") {
    try {
      content = JSON.parse(content)
    } catch {
      return ""
    }
  }
  if (!isJSONContent(content)) {
    return ""
  }

  try {
    return generateHTML(content, [
      StarterKit,
      Highlight.configure({
        multicolor: false,
      }),
      Image,
      EntityLinkNode,
      AttachmentNode,
    ])
  } catch {
    return ""
  }
}
