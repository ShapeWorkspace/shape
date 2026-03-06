/**
 * CommandPalette Component
 *
 * A global command palette (Cmd+K) for quick actions and entity search.
 * Renders as a centered modal overlay with search input and results list.
 *
 * Features:
 * - Fuzzy search filtering of actions
 * - Entity search (notes, projects, papers, etc.)
 * - Keyboard navigation (arrow keys, enter, escape)
 * - Grouped results by category
 */

import React, { useEffect, useRef, useCallback, useState } from "react"
import {
  FolderPlus,
  FileText,
  Folder,
  Users,
  MessageSquare,
  Settings,
  LogOut,
  Upload,
  Search,
  CheckSquare,
  MessagesSquare,
  Home,
  StickyNote,
  FilePlus,
} from "lucide-react"
import { useCommandPalette } from "../../contexts/CommandPaletteContext"
import { useCommandPaletteSearch, CommandPaletteResult } from "../../hooks/use-command-palette-search"
import * as styles from "../../styles/command-palette.css"
import { TOOL_LABELS } from "../../constants/tool-labels"

/**
 * Map action/entity categories to their display icons.
 */
function getCategoryIcon(category: CommandPaletteResult["category"], actionId?: string) {
  // For actions, use specific icons based on action ID
  if (category === "action" && actionId) {
    if (actionId.startsWith("create-note")) return <StickyNote size={16} />
    if (actionId.startsWith("create-project")) return <CheckSquare size={16} />
    if (actionId.startsWith("create-folder")) return <FolderPlus size={16} />
    if (actionId.startsWith("create-paper")) return <FilePlus size={16} />
    if (actionId.startsWith("create-group")) return <MessageSquare size={16} />
    if (actionId.startsWith("create-forum")) return <MessagesSquare size={16} />
    if (actionId.startsWith("upload")) return <Upload size={16} />
    if (actionId === "go-home") return <Home size={16} />
    if (actionId.startsWith("go-to-notes")) return <FileText size={16} />
    if (actionId.startsWith("go-to-projects")) return <CheckSquare size={16} />
    if (actionId.startsWith("go-to-files")) return <Folder size={16} />
    if (actionId.startsWith("go-to-papers")) return <FileText size={16} />
    if (actionId.startsWith("go-to-messages") || actionId.startsWith("go-to-groups"))
      return <MessageSquare size={16} />
    if (actionId.startsWith("go-to-forums")) return <MessagesSquare size={16} />
    if (actionId.startsWith("go-to-settings") || actionId === "manage-subscription")
      return <Settings size={16} />
    if (actionId === "invite-member") return <Users size={16} />
    if (actionId === "switch-workspace") return <Folder size={16} />
    if (actionId === "sign-out") return <LogOut size={16} />
    return <Search size={16} />
  }

  // For entity results, use category-based icons
  switch (category) {
    case "note":
      return <FileText size={16} />
    case "project":
      return <CheckSquare size={16} />
    case "task":
      return <CheckSquare size={16} />
    case "paper":
      return <FileText size={16} />
    case "file":
      return <FileText size={16} />
    case "folder":
      return <Folder size={16} />
    case "chat":
      return <MessageSquare size={16} />
    case "forum":
      return <MessagesSquare size={16} />
    default:
      return <Search size={16} />
  }
}

/**
 * Get display label for a category.
 * Uses TOOL_LABELS where applicable for consistency.
 */
function getCategoryLabel(category: CommandPaletteResult["category"]): string {
  switch (category) {
    case "action":
      return "Actions"
    case "note":
      return TOOL_LABELS.memos
    case "project":
      return TOOL_LABELS.projects
    case "task":
      return TOOL_LABELS.tasks
    case "paper":
      return TOOL_LABELS.papers
    case "file":
      return TOOL_LABELS.files
    case "folder":
      return "Folders"
    case "chat":
      return "Chats"
    case "forum":
      return TOOL_LABELS.forum
    default:
      return "Results"
  }
}

/**
 * Group results by category for display.
 */
function groupResultsByCategory(results: CommandPaletteResult[]): Map<string, CommandPaletteResult[]> {
  const groups = new Map<string, CommandPaletteResult[]>()

  for (const result of results) {
    const existing = groups.get(result.category) || []
    existing.push(result)
    groups.set(result.category, existing)
  }

  return groups
}

/**
 * CommandPalette component that renders the modal UI.
 * Only renders when isOpen is true from context.
 */
export function CommandPalette() {
  const { isOpen, close } = useCommandPalette()
  const { query, setQuery, results, clearSearch } = useCommandPaletteSearch()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Track the currently selected index for keyboard navigation
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Clear search and close when escape is pressed
  const handleClose = useCallback(() => {
    clearSearch()
    setSelectedIndex(0)
    close()
  }, [clearSearch, close])

  // Execute the selected result's handler
  // Execute handler first (before closing) to ensure navigation works
  // For async handlers (like create actions), we await completion before closing
  const executeResult = useCallback(
    async (result: CommandPaletteResult) => {
      try {
        // Execute handler first - this ensures navigation happens while component is mounted
        const handlerResult = result.handler()
        if (handlerResult instanceof Promise) {
          await handlerResult
        }
      } catch (error) {
        console.error("Command palette action failed:", error)
      } finally {
        handleClose()
      }
    },
    [handleClose]
  )

  // Focus input when palette opens and reset selection
  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0)
      // Small delay to ensure the element is rendered
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [isOpen])

  // Reset selection when results length changes significantly (new search)
  // Use a ref to track previous length to avoid unnecessary resets
  const prevResultsLengthRef = useRef(results.length)
  useEffect(() => {
    // Only reset if results changed significantly (not just reference change)
    if (results.length !== prevResultsLengthRef.current) {
      setSelectedIndex(0)
      prevResultsLengthRef.current = results.length
    }
  }, [results.length])

  // Handle keyboard navigation with cycling
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          e.preventDefault()
          handleClose()
          break
        case "ArrowDown":
          e.preventDefault()
          // Cycle to first item when at the end
          setSelectedIndex(i => (i >= results.length - 1 ? 0 : i + 1))
          break
        case "ArrowUp":
          e.preventDefault()
          // Cycle to last item when at the beginning
          setSelectedIndex(i => (i <= 0 ? results.length - 1 : i - 1))
          break
        case "Enter":
          e.preventDefault()
          if (results[selectedIndex]) {
            executeResult(results[selectedIndex])
          }
          break
      }
    },
    [handleClose, results, selectedIndex, executeResult]
  )

  // Handle clicking on backdrop
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        handleClose()
      }
    },
    [handleClose]
  )

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const selectedElement = listRef.current.querySelector(`[data-index="${selectedIndex}"]`)
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: "nearest" })
    }
  }, [selectedIndex])

  // Don't render anything if closed
  if (!isOpen) {
    return null
  }

  // Group results by category
  const groupedResults = groupResultsByCategory(results)

  // Track the flat index across all groups for selection
  let flatIndex = 0

  return (
    <div
      className={styles.backdrop}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className={styles.palette} data-testid="command-palette" onKeyDown={handleKeyDown}>
        {/* Search input */}
        <div className={styles.inputContainer}>
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="Search actions and content..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            data-testid="command-palette-input"
          />
        </div>

        {/* Results list */}
        <div className={styles.resultsList} ref={listRef} role="listbox">
          {results.length === 0 && query.trim() !== "" && (
            <div className={styles.emptyState}>No results found for &ldquo;{query}&rdquo;</div>
          )}

          {/* Render grouped results */}
          {Array.from(groupedResults.entries()).map(([category, categoryResults]) => (
            <div key={category}>
              <div className={styles.categoryLabel}>
                {getCategoryLabel(category as CommandPaletteResult["category"])}
              </div>
              {categoryResults.map(result => {
                const currentIndex = flatIndex
                flatIndex++
                return (
                  <div
                    key={result.id}
                    className={styles.resultItem}
                    data-selected={currentIndex === selectedIndex}
                    data-index={currentIndex}
                    data-testid={`command-palette-item-${result.id}`}
                    role="option"
                    aria-selected={currentIndex === selectedIndex}
                    onClick={() => executeResult(result)}
                    onMouseEnter={() => setSelectedIndex(currentIndex)}
                  >
                    <div className={styles.resultIcon}>{getCategoryIcon(result.category, result.id)}</div>
                    <div className={styles.resultText}>
                      <div className={styles.resultTitle}>{result.title}</div>
                      {result.subtitle && <div className={styles.resultSubtitle}>{result.subtitle}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Footer with keyboard hints */}
        <div className={styles.footer}>
          <div className={styles.shortcutHint}>
            <span className={styles.key}>↑↓</span>
            <span>Navigate</span>
          </div>
          <div className={styles.shortcutHint}>
            <span className={styles.key}>↵</span>
            <span>Select</span>
          </div>
          <div className={styles.shortcutHint}>
            <span className={styles.key}>Esc</span>
            <span>Close</span>
          </div>
        </div>
      </div>
    </div>
  )
}
