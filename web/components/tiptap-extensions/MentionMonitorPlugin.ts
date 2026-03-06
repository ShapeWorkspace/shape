/**
 * TipTap plugin for monitoring user mentions in editor content.
 *
 * Mentions are represented as EntityLink nodes that point at workspace members.
 * This plugin tracks the set of mentioned user IDs and reports changes via a callback.
 *
 * Unlike the EntityLinkMonitor, we intentionally do NOT emit an initial event on
 * editor initialization. This prevents replaying mention notifications when a
 * document is opened and existing mentions are already present.
 */

import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"

/**
 * Event emitted when mentioned user IDs change.
 */
export interface MentionedUserIdChangeEvent {
  /** User IDs that were newly mentioned. */
  addedUserIds: string[]
  /** User IDs that are no longer mentioned. */
  removedUserIds: string[]
  /** All currently mentioned user IDs. */
  allMentionedUserIds: string[]
}

/**
 * Callback invoked when mentioned user IDs change.
 */
export type MentionedUserIdChangeCallback = (event: MentionedUserIdChangeEvent) => void

/**
 * Options for the MentionedUserIdMonitor extension.
 */
export interface MentionedUserIdMonitorOptions {
  /** Callback invoked when mentions are added or removed. */
  onMentionedUserIdsChange?: MentionedUserIdChangeCallback
}

/**
 * Plugin key for the mention monitor state.
 */
const mentionMonitorPluginKey = new PluginKey<Set<string>>("mentionMonitor")

/**
 * Scan the document for mentioned user IDs.
 */
function scanDocumentForMentionedUserIds(doc: {
  descendants: (
    callback: (
      node: { type: { name: string }; attrs: Record<string, unknown> },
      _pos: number
    ) => boolean | void
  ) => void
}): Set<string> {
  const mentionedUserIds = new Set<string>()

  doc.descendants(node => {
    if (node.type.name !== "entityLink") {
      return
    }

    const entityTypeValue = node.attrs.entityType
    if (entityTypeValue !== "contact" && entityTypeValue !== "member") {
      return
    }

    const entityIdValue = node.attrs.entityId
    if (typeof entityIdValue !== "string" || entityIdValue.trim() === "") {
      return
    }

    mentionedUserIds.add(entityIdValue)
  })

  return mentionedUserIds
}

/**
 * Compute the difference between two mention sets.
 */
function diffMentionedUserIdSets(
  previousUserIds: Set<string>,
  nextUserIds: Set<string>
): { addedUserIds: string[]; removedUserIds: string[] } {
  const addedUserIds: string[] = []
  const removedUserIds: string[] = []

  for (const userId of previousUserIds) {
    if (!nextUserIds.has(userId)) {
      removedUserIds.push(userId)
    }
  }

  for (const userId of nextUserIds) {
    if (!previousUserIds.has(userId)) {
      addedUserIds.push(userId)
    }
  }

  return { addedUserIds, removedUserIds }
}

/**
 * TipTap extension for tracking mention changes.
 */
export const MentionedUserIdMonitor = Extension.create<MentionedUserIdMonitorOptions>({
  name: "mentionedUserIdMonitor",

  addOptions() {
    return {
      onMentionedUserIdsChange: undefined,
    }
  },

  addProseMirrorPlugins() {
    const options = this.options

    return [
      new Plugin({
        key: mentionMonitorPluginKey,
        state: {
          /**
           * Initialize plugin state by scanning the document for mentions.
           */
          init(_, state) {
            return scanDocumentForMentionedUserIds(state.doc)
          },

          /**
           * Handle document changes and report mention differences.
           */
          apply(tr, previousUserIds, _oldState, newState) {
            if (!tr.docChanged) {
              return previousUserIds
            }

            const nextUserIds = scanDocumentForMentionedUserIds(newState.doc)
            const { addedUserIds, removedUserIds } = diffMentionedUserIdSets(
              previousUserIds,
              nextUserIds
            )

            if (
              options.onMentionedUserIdsChange &&
              (addedUserIds.length > 0 || removedUserIds.length > 0)
            ) {
              options.onMentionedUserIdsChange({
                addedUserIds,
                removedUserIds,
                allMentionedUserIds: Array.from(nextUserIds),
              })
            }

            return nextUserIds
          },
        },
      }),
    ]
  },
})

/**
 * Get the current mentioned user IDs from an editor.
 */
export function getMentionedUserIdsFromEditor(editor: {
  state: { doc: Parameters<typeof scanDocumentForMentionedUserIds>[0] }
}): string[] {
  return Array.from(scanDocumentForMentionedUserIds(editor.state.doc))
}
