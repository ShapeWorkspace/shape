import { Mark, mergeAttributes } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"

interface PaperCommentHighlightState {
  activeCommentId: string | null
}

const paperCommentHighlightKey = new PluginKey<PaperCommentHighlightState>("paperCommentHighlight")
const EMPTY_HIGHLIGHT_STATE: PaperCommentHighlightState = { activeCommentId: null }

export interface PaperCommentMarkOptions {
  onCommentClick?: (commentIds: string[]) => void
}

function buildActiveCommentDecorations(
  doc: ProseMirrorNode,
  markTypeName: string,
  activeCommentId: string
): DecorationSet {
  const decorations: Decoration[] = []

  doc.nodesBetween(0, doc.content.size, (node, pos) => {
    if (!node.isText) {
      return
    }

    const matchingMark = node.marks.find(mark => {
      if (!isPaperCommentMark(mark, markTypeName)) {
        return false
      }
      return mark.attrs.commentId === activeCommentId
    })

    if (!matchingMark) {
      return
    }

    if (matchingMark.attrs.resolved === true) {
      return
    }

    decorations.push(Decoration.inline(pos, pos + node.nodeSize, { class: "paper-comment-active" }))
  })

  return DecorationSet.create(doc, decorations)
}

function isPaperCommentMark(
  mark: unknown,
  markTypeName: string
): mark is { type: { name: string }; attrs: { commentId?: string; resolved?: boolean } } {
  if (!isRecord(mark)) {
    return false
  }

  const typeValue = mark.type
  if (!isRecord(typeValue) || typeof typeValue.name !== "string") {
    return false
  }

  if (typeValue.name !== markTypeName) {
    return false
  }

  const attrsValue = mark.attrs
  if (attrsValue !== undefined && attrsValue !== null && !isRecord(attrsValue)) {
    return false
  }

  return true
}

function normalizeCommentIds(rawCommentIds: string[]): string[] {
  const unique = new Set<string>()
  for (const commentId of rawCommentIds) {
    const trimmed = commentId.trim()
    if (trimmed) {
      unique.add(trimmed)
    }
  }
  return Array.from(unique.values())
}

function parseResolvedAttribute(value: string | null): boolean {
  if (!value) {
    return false
  }
  return value === "true" || value === "1"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function getEventTargetElement(target: EventTarget | null): HTMLElement | null {
  if (target instanceof HTMLElement) {
    return target
  }
  return null
}

function isPaperCommentHighlightState(value: unknown): value is PaperCommentHighlightState {
  if (!isRecord(value)) {
    return false
  }
  if (!("activeCommentId" in value)) {
    return false
  }
  const activeCommentId = value.activeCommentId
  return typeof activeCommentId === "string" || activeCommentId === null
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    paperComment: {
      setActivePaperComment: (commentId: string | null) => ReturnType
    }
  }
}

export const PaperCommentMark = Mark.create<PaperCommentMarkOptions>({
  name: "paperComment",
  inclusive: false,

  addOptions() {
    return {
      onCommentClick: undefined,
    }
  },

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: element => element.getAttribute("data-paper-comment-id"),
        renderHTML: attributes => {
          if (!attributes.commentId) {
            return {}
          }
          return { "data-paper-comment-id": String(attributes.commentId) }
        },
      },
      resolved: {
        default: false,
        parseHTML: element => parseResolvedAttribute(element.getAttribute("data-paper-comment-resolved")),
        renderHTML: attributes => ({
          "data-paper-comment-resolved": attributes.resolved ? "true" : "false",
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-paper-comment-id]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "paper-comment-highlight",
      }),
      0,
    ]
  },

  addCommands() {
    return {
      setActivePaperComment:
        (commentId: string | null) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            dispatch(tr.setMeta(paperCommentHighlightKey, { activeCommentId: commentId }))
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const markTypeName = this.name
    const onCommentClick = this.options.onCommentClick

    return [
      new Plugin({
        key: paperCommentHighlightKey,
        state: {
          init: () => EMPTY_HIGHLIGHT_STATE,
          apply: (tr, previousState: PaperCommentHighlightState) => {
            const meta = tr.getMeta(paperCommentHighlightKey)
            if (!isPaperCommentHighlightState(meta) || meta.activeCommentId === previousState.activeCommentId) {
              return previousState
            }
            return { activeCommentId: meta.activeCommentId }
          },
        },
        props: {
          decorations: state => {
            const highlightState = paperCommentHighlightKey.getState(state)
            if (!highlightState || !highlightState.activeCommentId) {
              return null
            }
            return buildActiveCommentDecorations(state.doc, markTypeName, highlightState.activeCommentId)
          },
          handleClick: (view, pos, event) => {
            if (!onCommentClick) {
              return false
            }

            const targetElement = getEventTargetElement(event?.target ?? null)
            const commentElement = targetElement?.closest("[data-paper-comment-id]") ?? null
            if (commentElement) {
              const resolvedAttribute = commentElement.getAttribute("data-paper-comment-resolved")
              if (parseResolvedAttribute(resolvedAttribute)) {
                return false
              }
              const commentId = commentElement.getAttribute("data-paper-comment-id")
              const normalizedIds = normalizeCommentIds([commentId ?? ""])
              if (normalizedIds.length > 0) {
                onCommentClick(normalizedIds)
                return false
              }
            }

            const resolvedPos = view.state.doc.resolve(pos)
            const commentMarks = resolvedPos
              .marks()
              .filter(mark => isPaperCommentMark(mark, markTypeName) && !mark.attrs?.resolved)

            if (commentMarks.length === 0) {
              return false
            }

            const commentIds = normalizeCommentIds(
              commentMarks.map(mark => String(mark.attrs.commentId ?? ""))
            )

            if (commentIds.length === 0) {
              return false
            }

            onCommentClick(commentIds)
            return false
          },
        },
      }),
    ]
  },
})
