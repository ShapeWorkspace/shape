/**
 * TipTap extension for file attachments in the editor.
 *
 * This node stores fileId as the primary identifier. Download URLs are
 * fetched dynamically when rendering since presigned URLs expire after 15 minutes.
 *
 * States:
 * - Uploading: shows spinner + filename (tempId set, fileId null)
 * - Complete: fetches fresh URL and displays (fileId set)
 * - Error: shows error state with filename
 *
 * Attachments are E2EE encrypted and uploaded in chunks via the FileService.
 */

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { AttachmentNodeView } from "../tiptap-node-views/AttachmentNodeView"

/**
 * Status of the attachment upload process.
 */
export type AttachmentStatus = "uploading" | "complete" | "error"

/**
 * Attributes stored on the attachment node.
 * Note: Only fileId, fileName, fileType, fileSize are persisted.
 * tempId and status are transient (for upload tracking).
 */
export interface AttachmentAttributes {
  /** File ID from the server - primary identifier for fetching download URLs */
  fileId: string | null
  /** Original filename for display */
  fileName: string
  /** MIME type of the file */
  fileType: string
  /** File size in bytes */
  fileSize: number
  /** Current upload status (transient, defaults to 'complete' on load) */
  status: AttachmentStatus
  /** Unique temporary ID for tracking uploads (transient, not persisted) */
  tempId: string
}

/**
 * Declare module augmentation for TipTap commands.
 */
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    attachment: {
      /**
       * Insert an attachment node at the current selection.
       */
      insertAttachment: (attrs: Partial<AttachmentAttributes>) => ReturnType
      /**
       * Update an attachment node by its tempId.
       */
      updateAttachmentByTempId: (tempId: string, attrs: Partial<AttachmentAttributes>) => ReturnType
    }
  }
}

/**
 * TipTap node extension for file attachments.
 * Renders via ReactNodeViewRenderer for rich UI with upload progress.
 */
export const AttachmentNode = Node.create({
  name: "attachment",

  // Inline atom node that appears inline with text
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      // Primary identifier - persisted
      fileId: {
        default: null,
        parseHTML: element => element.getAttribute("data-file-id"),
        renderHTML: attributes => {
          if (!attributes.fileId) return {}
          return { "data-file-id": attributes.fileId }
        },
      },
      // Metadata - persisted
      fileName: {
        default: "",
        parseHTML: element => element.getAttribute("data-file-name") || "",
        renderHTML: attributes => ({ "data-file-name": attributes.fileName }),
      },
      fileType: {
        default: "",
        parseHTML: element => element.getAttribute("data-file-type") || "",
        renderHTML: attributes => ({ "data-file-type": attributes.fileType }),
      },
      fileSize: {
        default: 0,
        parseHTML: element => {
          const size = element.getAttribute("data-file-size")
          return size ? parseInt(size, 10) : 0
        },
        renderHTML: attributes => ({
          "data-file-size": String(attributes.fileSize),
        }),
      },
      // Transient attributes - not persisted (no renderHTML)
      status: {
        default: "complete",
        parseHTML: () => "complete", // Always defaults to complete on load
        renderHTML: () => ({}), // Not persisted
      },
      tempId: {
        default: "",
        parseHTML: () => "", // Never persisted
        renderHTML: () => ({}), // Not persisted
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "span[data-attachment]",
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-attachment": "true" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(AttachmentNodeView)
  },

  addCommands() {
    return {
      insertAttachment:
        attrs =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          })
        },

      updateAttachmentByTempId:
        (tempId, attrs) =>
        ({ tr, state, dispatch }) => {
          if (!dispatch) return false

          let found = false
          state.doc.descendants((node, pos) => {
            if (node.type.name === this.name && node.attrs.tempId === tempId) {
              // Merge existing attributes with new ones
              const newAttrs = { ...node.attrs, ...attrs }
              tr.setNodeMarkup(pos, undefined, newAttrs)
              found = true
              return false // Stop iteration
            }
            return true
          })

          if (found) {
            dispatch(tr)
            return true
          }
          return false
        },
    }
  },
})
