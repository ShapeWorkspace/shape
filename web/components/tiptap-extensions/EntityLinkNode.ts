/**
 * TipTap extension for entity links in the editor.
 *
 * Entity links are internal links to other entities within the app (tasks, papers,
 * notes, files, discussions, etc.). They are rendered as inline chips that, when
 * clicked, navigate to the linked entity in a new in-app window.
 *
 * The node stores:
 * - href: The full URL of the entity link (used for navigation)
 * - entityType: Type of entity (task, paper, note, file, discussion, etc.)
 * - entityId: ID of the linked entity (task ID for task links)
 * - workspaceId: Workspace containing the entity
 * - title: Display title for the chip (may be fetched asynchronously)
 * - projectId: Parent project ID for task links
 *
 * Entity links are detected during paste events when the URL host matches
 * the current app host and follows the entity URL pattern.
 */

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { EntityLinkNodeView } from "../tiptap-node-views/EntityLinkNodeView"
import {
  isInternalEntityLink,
  parseEntityUrl,
  getEntityTypeFromTool,
  type WebEntityType,
} from "../../lib/entity-link-utils"

/**
 * Attributes stored on the entity link node.
 * All attributes are persisted to ensure proper rendering across sessions.
 */
export interface EntityLinkAttributes {
  /** Full URL of the entity link */
  href: string
  /** Type of entity (task, paper, note, file, discussion, etc.) */
  entityType: WebEntityType
  /** ID of the linked entity */
  entityId: string
  /** Project ID for task links (required to navigate to the task) */
  projectId: string | null
  /** Workspace ID containing the entity */
  workspaceId: string
  /** Display title for the chip */
  title: string
  /** Task ID for task links (redundant with entityId, preserved for clarity) */
  taskId: string | null
  /** Optional channel ID (for discussion links within channels) */
  channelId: string | null
  /** Tool type (tasks, papers, notes, files, forum, etc.) */
  tool: string
}

/**
 * Declare module augmentation for TipTap commands.
 */
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    entityLink: {
      /**
       * Insert an entity link node at the current selection.
       */
      insertEntityLink: (attrs: Partial<EntityLinkAttributes>) => ReturnType
    }
  }
}

/**
 * TipTap node extension for entity links.
 * Renders via ReactNodeViewRenderer for rich UI with icon and title.
 */
export const EntityLinkNode = Node.create({
  name: "entityLink",

  // Inline atom node that appears inline with text
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      // Full URL - persisted
      href: {
        default: "",
        parseHTML: element => element.getAttribute("data-href") || "",
        renderHTML: attributes => ({ "data-href": attributes.href }),
      },
      // Entity type - persisted
      entityType: {
        default: "file",
        parseHTML: element => element.getAttribute("data-entity-type") || "file",
        renderHTML: attributes => ({ "data-entity-type": attributes.entityType }),
      },
      // Entity ID - persisted
      entityId: {
        default: "",
        parseHTML: element => element.getAttribute("data-entity-id") || "",
        renderHTML: attributes => ({ "data-entity-id": attributes.entityId }),
      },
      // Project ID (optional, for task links) - persisted
      projectId: {
        default: null,
        parseHTML: element => element.getAttribute("data-project-id") || null,
        renderHTML: attributes => {
          if (!attributes.projectId) return {}
          return { "data-project-id": attributes.projectId }
        },
      },
      // Workspace ID - persisted
      workspaceId: {
        default: "",
        parseHTML: element => element.getAttribute("data-workspace-id") || "",
        renderHTML: attributes => ({ "data-workspace-id": attributes.workspaceId }),
      },
      // Display title - persisted
      title: {
        default: "Link",
        parseHTML: element => element.getAttribute("data-title") || "Link",
        renderHTML: attributes => ({ "data-title": attributes.title }),
      },
      // Task ID (optional, for task links) - persisted
      taskId: {
        default: null,
        parseHTML: element => element.getAttribute("data-task-id") || null,
        renderHTML: attributes => {
          if (!attributes.taskId) return {}
          return { "data-task-id": attributes.taskId }
        },
      },
      // Channel ID (optional, for discussion links) - persisted
      channelId: {
        default: null,
        parseHTML: element => element.getAttribute("data-channel-id") || null,
        renderHTML: attributes => {
          if (!attributes.channelId) return {}
          return { "data-channel-id": attributes.channelId }
        },
      },
      // Tool type - persisted
      tool: {
        default: "files",
        parseHTML: element => element.getAttribute("data-tool") || "files",
        renderHTML: attributes => ({ "data-tool": attributes.tool }),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "span[data-entity-link]",
      },
    ]
  },

  renderHTML({ HTMLAttributes, node }) {
    // Include title as text content so content detection works correctly
    // (e.g., hasContent check for send button enablement)
    const title = node.attrs.title || "Link"
    return ["span", mergeAttributes(HTMLAttributes, { "data-entity-link": "true" }), title]
  },

  addNodeView() {
    return ReactNodeViewRenderer(EntityLinkNodeView)
  },

  addCommands() {
    return {
      insertEntityLink:
        attrs =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          })
        },
    }
  },

  /**
   * Add ProseMirror plugin to handle paste events.
   * When pasting a URL that matches an internal entity link pattern,
   * we convert it to an EntityLinkNode instead of inserting plain text/link.
   */
  addProseMirrorPlugins() {
    // Capture the extension name for use in the plugin's handlePaste callback
    const extensionName = this.name

    return [
      new Plugin({
        key: new PluginKey("entityLinkPaste"),
        props: {
          /**
           * Handle paste events to detect and convert internal entity URLs.
           */
          handlePaste(view, event) {
            const clipboardData = event.clipboardData
            if (!clipboardData) return false

            // Get text content from clipboard
            const text = clipboardData.getData("text/plain").trim()
            if (!text) return false

            // Check if it's a valid URL
            try {
              new URL(text)
            } catch {
              // Not a valid URL, let default handling proceed
              return false
            }

            // Check if it's an internal entity link
            if (!isInternalEntityLink(text)) {
              return false
            }

            // Parse the entity URL
            const entityInfo = parseEntityUrl(text)
            if (!entityInfo) {
              return false
            }

            // Prevent default paste behavior
            event.preventDefault()

            // Determine entity type based on tool
            const isTask = !!entityInfo.taskId
            const entityType = getEntityTypeFromTool(entityInfo.tool, isTask)

            // Generate a reasonable title based on the entity type
            // The actual title would ideally be fetched from the entity, but for now
            // we use a placeholder that will be shown until we can implement async title fetching
            const title = isTask
              ? "Task"
              : entityInfo.tool.charAt(0).toUpperCase() + entityInfo.tool.slice(1, -1)

            // Insert the entity link node
            const { tr, schema } = view.state
            const nodeType = schema.nodes[extensionName]

            if (!nodeType) {
              console.error("EntityLinkNode type not found in schema")
              return false
            }

            // For tasks: entityId is the task ID, projectId is the parent project
            // For discussions: entityId is discussionId, channelId is the channel
            // For others: entityId is the item ID
            const entityLinkNode = nodeType.create({
              href: text,
              entityType,
              entityId: entityInfo.entityId,
              workspaceId: entityInfo.workspaceId,
              title,
              projectId: entityInfo.projectId || null,
              taskId: entityInfo.taskId || null,
              channelId: entityInfo.channelId || null,
              tool: entityInfo.tool,
            })

            // Insert the node at the current cursor position
            const transaction = tr.replaceSelectionWith(entityLinkNode)
            view.dispatch(transaction)

            return true
          },
        },
      }),
    ]
  },
})
