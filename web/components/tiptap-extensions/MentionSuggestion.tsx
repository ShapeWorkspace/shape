import { memo } from "react"
import { Extension } from "@tiptap/core"
import Suggestion, {
  exitSuggestion,
  type SuggestionKeyDownProps,
  type SuggestionOptions,
  type SuggestionProps,
} from "@tiptap/suggestion"
import { ReactRenderer } from "@tiptap/react"
import type { MentionSuggestionItem } from "../../store/queries/use-mention-suggestions"
import type { EntityLinkAttributes } from "./EntityLinkNode"
import { buildEntityUrl } from "../../lib/entity-link-utils"
import { WorkspaceMemberAvatar } from "../WorkspaceMemberAvatar"
import * as styles from "../../styles/mention-suggestion.css"

/**
 * Props for rendering the mention suggestion list.
 */
interface MentionSuggestionListProps {
  items: MentionSuggestionItem[]
  selectedIndex: number
  isLoading: boolean
  onSelectItem: (item: MentionSuggestionItem) => void
  onHoverIndex: (index: number) => void
}

/**
 * Render a simple list for mention suggestions.
 */
const MentionSuggestionList = memo(function MentionSuggestionList({
  items,
  selectedIndex,
  isLoading,
  onSelectItem,
  onHoverIndex,
}: MentionSuggestionListProps) {
  if (items.length === 0) {
    return (
      <div className={styles.mentionSuggestionEmpty} data-testid="mention-suggestion-empty">
        {isLoading ? "Loading people..." : "No matches"}
      </div>
    )
  }

  return (
    <div className={styles.mentionSuggestionList} data-testid="mention-suggestion-list">
      {items.map((item, index) => {
        const isSelected = index === selectedIndex
        const itemClassName = isSelected
          ? `${styles.mentionSuggestionItem} ${styles.mentionSuggestionItemActive}`
          : styles.mentionSuggestionItem

        return (
          <div
            key={item.userId}
            className={itemClassName}
            onClick={() => onSelectItem(item)}
            onMouseEnter={() => onHoverIndex(index)}
            data-testid={`mention-suggestion-item-${item.userId}`}
          >
            <WorkspaceMemberAvatar
              userId={item.userId}
              displayName={item.label}
              avatarDataUrl={item.avatarDataUrl}
              size={24}
              fontSize={11}
            />
            <div className={styles.mentionSuggestionText}>
              <span className={styles.mentionSuggestionName}>{item.label}</span>
              <span className={styles.mentionSuggestionEmail}>{item.email}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
})

/**
 * Extension options for mention suggestions.
 */
export interface MentionSuggestionExtensionOptions {
  workspaceId: string
  getSuggestionItems: (query: string) => MentionSuggestionItem[]
  getIsLoading?: () => boolean
}

/**
 * Creates entity link attributes for a contact mention.
 */
function buildContactEntityLinkAttributes(
  workspaceId: string,
  item: MentionSuggestionItem
): EntityLinkAttributes {
  return {
    href: buildEntityUrl(workspaceId, "contacts", item.userId),
    entityType: "mention",
    entityId: item.userId,
    projectId: null,
    workspaceId,
    title: item.label,
    taskId: null,
    channelId: null,
    tool: "contacts",
  }
}

/**
 * MentionSuggestionExtension wires the @ mention autocomplete to entity links.
 */
export const MentionSuggestionExtension = Extension.create<MentionSuggestionExtensionOptions>({
  name: "mentionSuggestion",

  addOptions() {
    return {
      workspaceId: "",
      getSuggestionItems: () => [],
      getIsLoading: () => false,
    }
  },

  addProseMirrorPlugins() {
    const suggestionOptions: SuggestionOptions<MentionSuggestionItem> = {
      editor: this.editor,
      char: "@",
      allowSpaces: false,
      startOfLine: false,
      items: ({ query }) => {
        return this.options.getSuggestionItems(query)
      },
      command: ({ editor, range, props }) => {
        const attrs = buildContactEntityLinkAttributes(this.options.workspaceId, props)

        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            {
              type: "entityLink",
              attrs,
            },
            { type: "text", text: " " },
          ])
          .run()
      },
      render: () => {
        let reactRenderer: ReactRenderer | null = null
        let popoverElement: HTMLDivElement | null = null
        let selectedIndex = 0
        let currentItems: MentionSuggestionItem[] = []
        let currentCommand: ((item: MentionSuggestionItem) => void) | null = null

        const updatePopoverPosition = (clientRect: DOMRect | null | undefined) => {
          if (!popoverElement || !clientRect) {
            return
          }
          const offset = 6
          popoverElement.style.left = `${clientRect.left}px`
          popoverElement.style.top = `${clientRect.bottom + offset}px`
        }

        const updateRendererProps = (props: SuggestionProps<MentionSuggestionItem>) => {
          if (!reactRenderer) {
            return
          }
          currentItems = props.items
          currentCommand = props.command
          const nextSelectedIndex =
            props.items.length === 0 ? 0 : Math.min(selectedIndex, props.items.length - 1)
          selectedIndex = nextSelectedIndex

          reactRenderer.updateProps({
            items: props.items,
            selectedIndex,
            isLoading: this.options.getIsLoading ? this.options.getIsLoading() : false,
            onSelectItem: (item: MentionSuggestionItem) => props.command(item),
            onHoverIndex: (index: number) => {
              selectedIndex = index
              updateRendererProps(props)
            },
          })
        }

        return {
          onStart: (props: SuggestionProps<MentionSuggestionItem>) => {
            selectedIndex = 0
            reactRenderer = new ReactRenderer(MentionSuggestionList, {
              props: {
                items: props.items,
                selectedIndex,
                isLoading: this.options.getIsLoading ? this.options.getIsLoading() : false,
                onSelectItem: (item: MentionSuggestionItem) => props.command(item),
                onHoverIndex: (index: number) => {
                  selectedIndex = index
                  updateRendererProps(props)
                },
              },
              editor: props.editor,
            })

            popoverElement = document.createElement("div")
            popoverElement.className = styles.mentionSuggestionPopover
            popoverElement.appendChild(reactRenderer.element)
            document.body.appendChild(popoverElement)

            updateRendererProps(props)
            updatePopoverPosition(props.clientRect?.())
          },

          onUpdate: (props: SuggestionProps<MentionSuggestionItem>) => {
            updateRendererProps(props)
            updatePopoverPosition(props.clientRect?.())
          },

          onKeyDown: (props: SuggestionKeyDownProps) => {
            if (props.event.key === "Escape") {
              exitSuggestion(props.view)
              return true
            }

            if (currentItems.length === 0 || !currentCommand) {
              return false
            }

            if (props.event.key === "ArrowDown") {
              selectedIndex = (selectedIndex + 1) % currentItems.length
              if (reactRenderer) {
                reactRenderer.updateProps({ selectedIndex })
              }
              return true
            }

            if (props.event.key === "ArrowUp") {
              selectedIndex = (selectedIndex - 1 + currentItems.length) % currentItems.length
              if (reactRenderer) {
                reactRenderer.updateProps({ selectedIndex })
              }
              return true
            }

            if (props.event.key === "Enter" || props.event.key === "Tab") {
              const selectedItem = currentItems[selectedIndex]
              if (selectedItem) {
                currentCommand(selectedItem)
              }
              return true
            }

            return false
          },

          onExit: () => {
            if (reactRenderer) {
              reactRenderer.destroy()
              reactRenderer = null
            }
            if (popoverElement) {
              popoverElement.remove()
              popoverElement = null
            }
          },
        }
      },
    }

    return [Suggestion(suggestionOptions)]
  },
})
