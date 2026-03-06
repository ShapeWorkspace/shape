/**
 * TipTapRenderer renders TipTap-generated HTML content in read-only mode.
 *
 * Features:
 * - Parses HTML and renders to React components
 * - Supports: bold, italic, strike, code, headings, lists, blockquotes, hr
 * - Handles images via data-file-id attribute (fetches encrypted images)
 * - Handles attachment nodes (span[data-attachment])
 * - Links are rendered with proper external link handling
 * - Compact mode for reply previews (optional)
 *
 * This component is designed to be reusable across different contexts
 * (discussions, papers, etc.) for displaying rich content.
 */

import { Fragment, useMemo, ReactNode } from "react"
import * as styles from "../styles/tiptap-renderer.css"
import { AttachmentInline } from "./AttachmentInline"
import { ImageInline } from "./ImageInline"
import { EntityLinkChip } from "./EntityLinkChip"

/**
 * Props for the TipTapRenderer component.
 */
export interface TipTapRendererProps {
  /** HTML content from TipTap editor */
  content: string
  /** Optional CSS class for the container */
  className?: string
  /** Whether to show in compact/preview mode */
  compact?: boolean
  /** Test ID for the container */
  testId?: string
}

/**
 * Parses an HTML string and returns a DOM Document.
 */
function parseHtml(html: string): Document {
  const parser = new DOMParser()
  return parser.parseFromString(html, "text/html")
}

/**
 * Converts a DOM node to React elements.
 * Recursively processes child nodes and handles special node types.
 */
function domToReact(node: Node, key: string | number): ReactNode {
  // Handle text nodes
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent
  }

  // Handle element nodes
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null
  }

  const element = node as Element
  const tagName = element.tagName.toLowerCase()

  // Process children recursively
  const children: ReactNode[] = []
  element.childNodes.forEach((child, index) => {
    const childElement = domToReact(child, `${key}-${index}`)
    if (childElement !== null) {
      children.push(childElement)
    }
  })

  // Handle special node types
  switch (tagName) {
    // Span nodes: may contain entity links or attachments
    case "span": {
      // Entity link nodes: <span data-entity-link="true">
      if (element.hasAttribute("data-entity-link")) {
        const href = element.getAttribute("data-href") || ""
        const entityType = element.getAttribute("data-entity-type") || "file"
        const entityId = element.getAttribute("data-entity-id") || ""
        const workspaceId = element.getAttribute("data-workspace-id") || ""
        const title = element.getAttribute("data-title") || "Link"
        const tool = element.getAttribute("data-tool") || "files"
        const projectId = element.getAttribute("data-project-id") || null
        const taskId = element.getAttribute("data-task-id") || null
        const channelId = element.getAttribute("data-channel-id") || null

        return (
          <EntityLinkChip
            key={key}
            href={href}
            entityType={entityType}
            entityId={entityId}
            workspaceId={workspaceId}
            title={title}
            tool={tool}
            projectId={projectId}
            taskId={taskId}
            channelId={channelId}
          />
        )
      }

      // Attachment nodes: <span data-attachment="true">
      if (element.hasAttribute("data-attachment")) {
        const fileId = element.getAttribute("data-file-id")
        const fileName = element.getAttribute("data-file-name") || "Unknown file"
        const fileType = element.getAttribute("data-file-type") || "application/octet-stream"
        const fileSizeStr = element.getAttribute("data-file-size")
        const fileSize = fileSizeStr ? parseInt(fileSizeStr, 10) : 0

        if (fileId) {
          return (
            <AttachmentInline
              key={key}
              fileId={fileId}
              fileName={fileName}
              fileType={fileType}
              fileSize={fileSize}
            />
          )
        }
        // If no fileId, show as placeholder
        return (
          <span key={key} className={styles.attachmentMissing}>
            {fileName}
          </span>
        )
      }
      // Regular span - pass through
      return <span key={key}>{children}</span>
    }

    // Image nodes: <img> or <figure>
    case "img": {
      const fileId = element.getAttribute("data-file-id")
      const src = element.getAttribute("src")
      const alt = element.getAttribute("alt")
      const dataWidth = element.getAttribute("data-width")
      const width = dataWidth ? parseInt(dataWidth, 10) : null
      const align = element.getAttribute("data-align") as "left" | "center" | "right" | null

      return <ImageInline key={key} fileId={fileId} src={src} alt={alt} width={width} align={align} />
    }

    // Figure elements (images with captions)
    case "figure": {
      const img = element.querySelector("img")
      const figcaption = element.querySelector("figcaption")

      if (img) {
        const fileId = img.getAttribute("data-file-id")
        const src = img.getAttribute("src")
        const alt = img.getAttribute("alt")
        const dataWidth = element.getAttribute("data-width") || img.getAttribute("data-width")
        const width = dataWidth ? parseInt(dataWidth, 10) : null
        const align = element.getAttribute("data-align") as "left" | "center" | "right" | null

        const captionText = figcaption?.textContent

        return (
          <figure key={key} className={styles.figure}>
            <ImageInline fileId={fileId} src={src} alt={alt} width={width} align={align} />
            {captionText && <figcaption className={styles.figcaption}>{captionText}</figcaption>}
          </figure>
        )
      }
      // Fallback for figure without img
      return <figure key={key}>{children}</figure>
    }

    // Video elements
    case "video": {
      const src = element.getAttribute("src")
      return (
        <video key={key} src={src || undefined} controls className={styles.video} draggable={false}>
          Your browser does not support the video tag.
        </video>
      )
    }

    // Headings
    case "h1":
      return (
        <h1 key={key} className={styles.h1}>
          {children}
        </h1>
      )
    case "h2":
      return (
        <h2 key={key} className={styles.h2}>
          {children}
        </h2>
      )
    case "h3":
      return (
        <h3 key={key} className={styles.h3}>
          {children}
        </h3>
      )
    case "h4":
      return (
        <h4 key={key} className={styles.h4}>
          {children}
        </h4>
      )
    case "h5":
      return (
        <h5 key={key} className={styles.h5}>
          {children}
        </h5>
      )
    case "h6":
      return (
        <h6 key={key} className={styles.h6}>
          {children}
        </h6>
      )

    // Text formatting
    case "p":
      return (
        <p key={key} className={styles.paragraph}>
          {children}
        </p>
      )
    case "strong":
    case "b":
      return <strong key={key}>{children}</strong>
    case "em":
    case "i":
      return <em key={key}>{children}</em>
    case "s":
    case "strike":
    case "del":
      return <s key={key}>{children}</s>
    case "code":
      return (
        <code key={key} className={styles.inlineCode}>
          {children}
        </code>
      )
    case "mark":
      return (
        <mark key={key} className={styles.highlight}>
          {children}
        </mark>
      )

    // Lists
    case "ul":
      return (
        <ul key={key} className={styles.ul}>
          {children}
        </ul>
      )
    case "ol":
      return (
        <ol key={key} className={styles.ol}>
          {children}
        </ol>
      )
    case "li":
      return <li key={key}>{children}</li>

    // Blockquote
    case "blockquote":
      return (
        <blockquote key={key} className={styles.blockquote}>
          {children}
        </blockquote>
      )

    // Code block
    case "pre": {
      // Pre usually contains a code element
      return (
        <pre key={key} className={styles.pre}>
          {children}
        </pre>
      )
    }

    // Horizontal rule
    case "hr":
      return <hr key={key} className={styles.hr} />

    // Line break
    case "br":
      return <br key={key} />

    // Links
    case "a": {
      const href = element.getAttribute("href")
      const isExternal = href?.startsWith("http://") || href?.startsWith("https://")

      return (
        <a
          key={key}
          href={href || undefined}
          className={styles.link}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noopener noreferrer" : undefined}
        >
          {children}
        </a>
      )
    }

    // Div - pass through
    case "div":
      return <div key={key}>{children}</div>

    // Default: render children only (strip unknown tags)
    default:
      return children.length > 0 ? <Fragment key={key}>{children}</Fragment> : null
  }
}

/**
 * TipTapRenderer renders HTML content from TipTap editor in read-only mode.
 *
 * Usage:
 * ```tsx
 * <TipTapRenderer content={discussion.body} />
 * <TipTapRenderer content={reply.body} compact />
 * ```
 */
export function TipTapRenderer({
  content,
  className,
  compact = false,
  testId = "tiptap-renderer",
}: TipTapRendererProps) {
  // Parse and convert HTML to React elements
  const renderedContent = useMemo(() => {
    if (!content || content.trim() === "") {
      return null
    }

    try {
      const doc = parseHtml(content)
      const body = doc.body

      // Process all child nodes of the body
      const elements: ReactNode[] = []
      body.childNodes.forEach((child, index) => {
        const element = domToReact(child, index)
        if (element !== null) {
          elements.push(element)
        }
      })
      if (elements.length === 0) {
        return null
      }

      return elements.map((element, index) => <Fragment key={`tiptap-${index}`}>{element}</Fragment>)
    } catch (error) {
      console.error("TipTapRenderer: Failed to parse HTML content", error)
      return null
    }
  }, [content])

  // Build container class
  const containerClass = [styles.renderer, compact && styles.rendererCompact, className]
    .filter(Boolean)
    .join(" ")

  // Return null for empty content
  if (!renderedContent) {
    return null
  }

  return (
    <div className={containerClass} data-testid={testId}>
      {renderedContent}
    </div>
  )
}
