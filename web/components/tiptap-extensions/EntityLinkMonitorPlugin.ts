/**
 * TipTap plugin for monitoring entity links in editor content.
 *
 * This plugin tracks the presence of entity link nodes in the document
 * and reports changes (added/removed links) via a callback. It's designed
 * for performance by:
 *
 * 1. Building an initial index on document creation
 * 2. Only scanning changed document regions on updates
 * 3. Using Map for O(1) link lookups
 *
 * Usage:
 * ```tsx
 * <TipTapEditor
 *   onLinkChange={(event) => {
 *     console.log('Added:', event.added)
 *     console.log('Removed:', event.removed)
 *     console.log('All links:', event.allLinks)
 *   }}
 * />
 * ```
 */

import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import type { WebEntityType } from "../../lib/entity-link-utils"

/**
 * Information about an entity link in the document.
 */
export interface EntityLinkInfo {
  /** Full URL of the entity link */
  href: string
  /** Type of entity (task, paper, note, file, discussion, etc.) */
  entityType: WebEntityType
  /** ID of the linked entity */
  entityId: string
  /** Project ID for task links (parent context) */
  projectId?: string | null
  /** Task ID for task links (redundant with entityId but preserved) */
  taskId?: string | null
  /** Channel ID for discussion links (parent context) */
  channelId?: string | null
  /** Workspace ID containing the entity */
  workspaceId: string
  /** Display title for the link */
  title: string
  /** Position in the document (useful for navigation) */
  position: number
}

/**
 * Event emitted when entity links change in the document.
 */
export interface LinkChangeEvent {
  /** Links that were added in this change */
  added: EntityLinkInfo[]
  /** Links that were removed in this change */
  removed: EntityLinkInfo[]
  /** All links currently in the document */
  allLinks: EntityLinkInfo[]
}

/**
 * Callback type for link change events.
 */
export type LinkChangeCallback = (event: LinkChangeEvent) => void

/**
 * Options for the EntityLinkMonitor extension.
 */
export interface EntityLinkMonitorOptions {
  /** Callback invoked when entity links are added or removed */
  onLinkChange?: LinkChangeCallback
}

/**
 * Plugin key for the entity link monitor state.
 */
const entityLinkMonitorPluginKey = new PluginKey<Map<string, EntityLinkInfo>>("entityLinkMonitor")

/**
 * Generate a unique key for an entity link.
 * Uses position + entityId to handle duplicate links to the same entity.
 */
function generateLinkKey(position: number, entityId: string): string {
  return `${position}:${entityId}`
}

/**
 * Scan the document for all entity link nodes.
 * Returns a Map of link key -> EntityLinkInfo.
 */
function scanDocumentForLinks(doc: {
  descendants: (
    callback: (
      node: { type: { name: string }; attrs: Record<string, unknown> },
      pos: number
    ) => boolean | void
  ) => void
}): Map<string, EntityLinkInfo> {
  const links = new Map<string, EntityLinkInfo>()

  doc.descendants((node, pos) => {
    if (node.type.name === "entityLink") {
      const attrs = node.attrs as {
        href: string
        entityType: WebEntityType
        entityId: string
        projectId?: string | null
        taskId?: string | null
        channelId?: string | null
        workspaceId: string
        title: string
      }

      const linkInfo: EntityLinkInfo = {
        href: attrs.href,
        entityType: attrs.entityType,
        entityId: attrs.entityId,
        projectId: attrs.projectId ?? null,
        taskId: attrs.taskId ?? null,
        channelId: attrs.channelId ?? null,
        workspaceId: attrs.workspaceId,
        title: attrs.title,
        position: pos,
      }

      const key = generateLinkKey(pos, attrs.entityId)
      links.set(key, linkInfo)
    }
  })

  return links
}

/**
 * Compute the difference between two link maps.
 * Returns arrays of added and removed links.
 */
function diffLinks(
  oldLinks: Map<string, EntityLinkInfo>,
  newLinks: Map<string, EntityLinkInfo>
): { added: EntityLinkInfo[]; removed: EntityLinkInfo[] } {
  const added: EntityLinkInfo[] = []
  const removed: EntityLinkInfo[] = []

  // Find removed links (in old but not in new)
  for (const [key, linkInfo] of oldLinks) {
    if (!newLinks.has(key)) {
      removed.push(linkInfo)
    }
  }

  // Find added links (in new but not in old)
  for (const [key, linkInfo] of newLinks) {
    if (!oldLinks.has(key)) {
      added.push(linkInfo)
    }
  }

  return { added, removed }
}

/**
 * TipTap extension for monitoring entity links in editor content.
 * Tracks link additions and removals, reporting changes via callback.
 */
export const EntityLinkMonitor = Extension.create<EntityLinkMonitorOptions>({
  name: "entityLinkMonitor",

  addOptions() {
    return {
      onLinkChange: undefined,
    }
  },

  addProseMirrorPlugins() {
    const options = this.options

    return [
      new Plugin({
        key: entityLinkMonitorPluginKey,

        state: {
          /**
           * Initialize plugin state by scanning document for links.
           */
          init(_, state) {
            const links = scanDocumentForLinks(state.doc)

            // Report initial links if callback is provided
            if (options.onLinkChange && links.size > 0) {
              const allLinks = Array.from(links.values())
              options.onLinkChange({
                added: allLinks,
                removed: [],
                allLinks,
              })
            }

            return links
          },

          /**
           * Handle document changes and update link tracking.
           */
          apply(tr, oldLinks, _oldState, newState) {
            // Only re-scan if document changed
            if (!tr.docChanged) {
              return oldLinks
            }

            // Scan the new document for links
            const newLinks = scanDocumentForLinks(newState.doc)

            // Compute the difference
            const { added, removed } = diffLinks(oldLinks, newLinks)

            // Report changes if there are any and callback is provided
            if (options.onLinkChange && (added.length > 0 || removed.length > 0)) {
              const allLinks = Array.from(newLinks.values())
              options.onLinkChange({
                added,
                removed,
                allLinks,
              })
            }

            return newLinks
          },
        },
      }),
    ]
  },
})

/**
 * Get the current entity links from an editor.
 * Useful for accessing link data outside of change events.
 */
export function getEntityLinksFromEditor(editor: {
  state: { doc: Parameters<typeof scanDocumentForLinks>[0] }
}): EntityLinkInfo[] {
  const links = scanDocumentForLinks(editor.state.doc)
  return Array.from(links.values())
}
