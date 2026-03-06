import { ReactNodeViewRenderer } from "@tiptap/react"
import type { ImageOptions } from "@tiptap/extension-image"
import { Image as TiptapImage } from "@tiptap/extension-image"
import { ImageNodeView } from "@/components/tiptap-node/image-node/image-node-view"
import type { Node } from "@tiptap/pm/model"
import { TextSelection } from "@tiptap/pm/state"

interface ImageAttributes {
  src: string | null
  alt?: string | null
  title?: string | null
  width?: string | null
  height?: string | null
  "data-align"?: string | null
  // File ID for encrypted images - used to fetch/decrypt the actual image data
  fileId?: string | null
}

const parseImageAttributes = (img: Element): Partial<ImageAttributes> => ({
  src: img.getAttribute("src"),
  alt: img.getAttribute("alt"),
  title: img.getAttribute("title"),
  width: img.getAttribute("width"),
  height: img.getAttribute("height"),
  fileId: img.getAttribute("data-file-id"),
})

function buildImageHTMLAttributes(attrs: ImageAttributes): Record<string, string> {
  const result: Record<string, string> = {}

  // Only set src if it's not a blob URL (blob URLs are session-specific)
  if (attrs.src && !attrs.src.startsWith("blob:")) {
    result.src = attrs.src
  }

  if (attrs.alt) result.alt = attrs.alt
  if (attrs.title) result.title = attrs.title
  // Use data-width for persistence (survives Yjs sync)
  if (attrs.width) result["data-width"] = attrs.width
  if (attrs.height) result.height = attrs.height
  // Include fileId as data-file-id for encrypted image persistence
  if (attrs.fileId) result["data-file-id"] = attrs.fileId

  return result
}

export const Image = TiptapImage.extend<ImageOptions>({
  content: "inline*",

  addAttributes() {
    return {
      ...this.parent?.(),
      // Width attribute for resizing - stored as data attribute for Yjs sync
      width: {
        default: null,
        parseHTML: element => {
          // Try data-width first (preferred for persistence), then fall back to width attr
          const dataWidth = element.getAttribute("data-width")
          if (dataWidth) return parseInt(dataWidth, 10) || null
          const width = element.getAttribute("width")
          if (width) return parseInt(width, 10) || null
          return null
        },
        renderHTML: attributes => {
          if (!attributes.width) return {}
          return { "data-width": String(attributes.width) }
        },
      },
      "data-align": {
        default: null,
      },
      // File ID for encrypted images - this is the persistent reference
      // The actual image is fetched and decrypted using this ID
      fileId: {
        default: null,
        parseHTML: element => element.getAttribute("data-file-id"),
        renderHTML: attributes => {
          if (!attributes.fileId) return {}
          return { "data-file-id": attributes.fileId }
        },
      },
      // Override src to not persist blob URLs - they are session-specific
      // Images with fileId will have src set dynamically after decryption
      src: {
        default: null,
        parseHTML: element => {
          const src = element.getAttribute("src")
          // Don't restore blob URLs - they're invalid after page refresh
          if (src?.startsWith("blob:")) return null
          return src
        },
        renderHTML: attributes => {
          // Don't render blob URLs to HTML - they won't work after refresh
          if (!attributes.src || attributes.src.startsWith("blob:")) {
            return {}
          }
          return { src: attributes.src }
        },
      },
      showCaption: {
        default: false,
        parseHTML: element => {
          return element.tagName === "FIGURE" || element.getAttribute("data-show-caption") === "true"
        },
        renderHTML: attributes => {
          if (!attributes.showCaption) return {}
          return { "data-show-caption": "true" }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "figure",
        getAttrs: node => {
          const img = node.querySelector("img")
          if (!img) return false

          // Get width from data-width on figure or img
          const dataWidth = node.getAttribute("data-width") || img.getAttribute("data-width")
          const width = dataWidth ? parseInt(dataWidth, 10) || null : null

          return {
            ...parseImageAttributes(img),
            width,
            "data-align": node.getAttribute("data-align"),
            showCaption: true,
          }
        },
        contentElement: "figcaption",
      },
      {
        tag: "img[src]",
        getAttrs: node => {
          if (node.closest("figure")) return false

          // Get width from data-width attribute
          const dataWidth = node.getAttribute("data-width")
          const width = dataWidth ? parseInt(dataWidth, 10) || null : null

          return {
            ...parseImageAttributes(node),
            width,
            "data-align": node.getAttribute("data-align"),
            showCaption: false,
          }
        },
      },
    ]
  },

  renderHTML({ node }) {
    const { src, alt, title, width, height, showCaption, fileId } = node.attrs
    const align = node.attrs["data-align"]

    const imgAttrs = buildImageHTMLAttributes({
      src,
      alt,
      title,
      width,
      height,
      fileId,
    })

    const hasContent = node.content.size > 0

    if (showCaption || hasContent) {
      const figureAttrs: Record<string, string> = {
        "data-url": src || "",
      }
      if (showCaption) figureAttrs["data-show-caption"] = "true"
      if (align) figureAttrs["data-align"] = align
      if (width) figureAttrs["data-width"] = String(width)

      return ["figure", figureAttrs, ["img", imgAttrs], ["figcaption", {}, 0]]
    }

    if (align) imgAttrs["data-align"] = align
    return ["img", imgAttrs]
  },

  addKeyboardShortcuts() {
    return {
      // Handle Enter at the beginning of the image node to insert a paragraph before it.
      // Since this node has content: "inline*" for captions, pressing Enter at position 0
      // would normally split the content. Instead, we want to insert a new paragraph above.
      Enter: ({ editor }) => {
        const { state, view } = editor
        const { selection } = state
        const { $from, empty } = selection

        // Only handle collapsed cursor
        if (!empty) return false

        // Find if we're inside an image node
        let imageDepth: number | null = null
        for (let depth = $from.depth; depth >= 0; depth--) {
          if ($from.node(depth).type === this.type) {
            imageDepth = depth
            break
          }
        }

        if (imageDepth === null) return false

        // Check if cursor is at the very start of the image's content (position 0 within the node).
        // $from.parentOffset gives the offset within the immediate parent.
        // We need to check if cursor is at start of the image's content area.
        const offsetInImage = $from.pos - $from.start(imageDepth)
        if (offsetInImage !== 0) return false

        // Cursor is at the start of the image content - insert paragraph before the image
        const imagePos = $from.before(imageDepth)
        const paragraphType = state.schema.nodes.paragraph
        if (!paragraphType) return false

        const tr = state.tr.insert(imagePos, paragraphType.create())
        // Position cursor in the new paragraph (at imagePos + 1, inside the new paragraph)
        tr.setSelection(TextSelection.create(tr.doc, imagePos + 1))
        view.dispatch(tr)

        return true
      },

      "Mod-a": ({ editor }) => {
        const { state, view } = editor
        const { selection } = state
        const { $from } = selection

        let imagePos: number | null = null
        let imageNode: Node | null = null

        for (let depth = $from.depth; depth >= 0; depth--) {
          const nodeAtDepth = $from.node(depth)
          if (nodeAtDepth.type === this.type) {
            imageNode = nodeAtDepth
            // posBefore is the resolved position *before* this node
            imagePos = depth === 0 ? 0 : $from.before(depth)
            break
          }
        }

        // Not inside an Image → let default behavior happen
        if (!imageNode || imagePos == null) {
          return false
        }

        // If the caption/content is empty, allow the default progressive select-all
        const contentIsEmpty = imageNode.content.size === 0 || imageNode.textContent.length === 0

        if (contentIsEmpty) {
          return false
        }

        // Compute the content range of the image node:
        // content starts at (nodePos + 1) and ends at (nodePos + node.nodeSize - 1)
        const start = imagePos + 1
        const end = imagePos + imageNode.nodeSize - 1

        const tr = state.tr.setSelection(TextSelection.create(state.doc, start, end))
        view.dispatch(tr)

        return true
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView)
  },
})

export default Image
