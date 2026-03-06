/**
 * useCommandPaletteSearch Hook
 *
 * Combines static quick actions with dynamic entity search results.
 * Used by the CommandPalette component to show filtered results.
 *
 * Search behavior:
 * - Empty query: Show all static actions
 * - With query: Filter actions by title + show matching entities from search
 * - Actions shown first, then entities grouped by type
 */

import { useMemo, useCallback } from "react"
import { useQuickActions, QuickAction } from "./use-quick-actions"
import { useAppSearch, EnrichedSearchResult } from "./use-search"
import { useWindowStore } from "../store/window-store"
import { ToolType, BreadcrumbItem } from "../store/types"
import { useEngineStore } from "../store/engine-store"

/**
 * Result item that can be either an action or an entity.
 * Both are unified under the QuickAction interface for rendering.
 */
export interface CommandPaletteResult extends QuickAction {
  /** For entity results, the original entity ID */
  entityId?: string
  /** For entity results, the subtitle (e.g., project name for tasks) */
  subtitle?: string
}

/**
 * Options for the command palette search hook.
 */
export interface UseCommandPaletteSearchOptions {
  /** Maximum number of entity results to show */
  maxEntityResults?: number
}

/**
 * Return type for the useCommandPaletteSearch hook.
 */
export interface UseCommandPaletteSearchResult {
  /** Current search query */
  query: string
  /** Set the search query */
  setQuery: (query: string) => void
  /** Combined results (actions + entities) */
  results: CommandPaletteResult[]
  /** Whether a search is in progress */
  isSearching: boolean
  /** Clear the search query */
  clearSearch: () => void
}

/**
 * Simple fuzzy match for filtering actions by query.
 * Matches if query characters appear in order (case-insensitive).
 */
function fuzzyMatch(query: string, text: string): boolean {
  const lowerQuery = query.toLowerCase()
  const lowerText = text.toLowerCase()

  // Check if all query characters appear in order
  let queryIndex = 0
  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      queryIndex++
    }
  }

  return queryIndex === lowerQuery.length
}

/**
 * Map entity types to display categories.
 */
const ENTITY_TYPE_TO_CATEGORY: Record<string, CommandPaletteResult["category"]> = {
  note: "note",
  project: "project",
  "task": "task",
  "project-tag": "project",
  "task-comment": "task",
  paper: "paper",
  file: "file",
  folder: "folder",
  "group-chat": "chat",
  "group-message": "chat",
  "direct-message": "chat",
  "workspace-member": "chat",
  "forum-channel": "forum",
  "forum-discussion": "forum",
  "forum-reply": "forum",
}

/**
 * Map entity types to their tool types for window store navigation.
 */
const ENTITY_TYPE_TO_TOOL: Record<string, ToolType> = {
  note: "memos",
  project: "projects",
  "task": "projects",
  "project-tag": "projects",
  "task-comment": "projects",
  paper: "papers",
  file: "files",
  folder: "files",
  "group-chat": "groups",
  "group-message": "groups",
  "direct-message": "contacts",
  "workspace-member": "contacts",
  "forum-channel": "forum",
  "forum-discussion": "forum",
  "forum-reply": "forum",
}

/**
 * Helper to generate unique IDs for breadcrumb items.
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}

/**
 * Hook that provides combined search results for the command palette.
 *
 * Combines:
 * 1. Static quick actions (filtered by query)
 * 2. Dynamic entity search results (from useAppSearch)
 */
export function useCommandPaletteSearch(
  options: UseCommandPaletteSearchOptions = {}
): UseCommandPaletteSearchResult {
  const { maxEntityResults = 10 } = options

  const { application } = useEngineStore()
  const effectiveWorkspaceId = application?.workspaceId ?? ""

  // Get window store for proper URL sync
  const { navigateTo: windowNavigateTo, navigateHome } = useWindowStore()

  // Get static actions
  const actions = useQuickActions()

  // Entity search with all entity types
  const {
    query,
    setQuery,
    results: entityResults,
    isSearching,
    clearSearch,
  } = useAppSearch({
    entityTypes: [
      "note",
      "project",
      "task",
      "task-comment",
      "paper",
      "file",
      "folder",
      "group-chat",
      "forum-channel",
      "forum-discussion",
    ],
    debounceMs: 0,
  })

  // Navigation helper for entities using window store for proper URL sync
  const navigateToEntity = useCallback(
    (result: EnrichedSearchResult) => {
      if (!effectiveWorkspaceId) return

      // Clear stack and navigate fresh
      navigateHome()

      if (result.entityType === "task-comment" && result.projectId && result.taskId) {
        const taskLabel = result.subtitle?.split("·").pop()?.trim() || result.title || "Task"
        const item: BreadcrumbItem = {
          id: generateId(),
          label: taskLabel,
          tool: "projects",
          itemId: result.projectId,
          taskId: result.taskId,
        }

        // Small delay to ensure navigateHome completes first
        setTimeout(() => {
          windowNavigateTo(item)
        }, 0)

        return
      }

      const tool = ENTITY_TYPE_TO_TOOL[result.entityType] ?? "memos"

      // Create breadcrumb item for the entity
      const item: BreadcrumbItem = {
        id: generateId(),
        label: result.title,
        tool,
        itemId: result.entityId,
      }

      // Small delay to ensure navigateHome completes first
      setTimeout(() => {
        windowNavigateTo(item)
      }, 0)
    },
    [effectiveWorkspaceId, windowNavigateTo, navigateHome]
  )

  // Convert entity search results to CommandPaletteResult format
  const entityResultsAsActions = useMemo<CommandPaletteResult[]>(() => {
    return entityResults.slice(0, maxEntityResults).map((result: EnrichedSearchResult) => ({
      id: `entity-${result.entityType}-${result.entityId}`,
      entityId: result.entityId,
      title: result.title,
      subtitle: result.subtitle,
      description: result.subtitle,
      category: ENTITY_TYPE_TO_CATEGORY[result.entityType] ?? "note",
      handler: () => navigateToEntity(result),
    }))
  }, [entityResults, maxEntityResults, navigateToEntity])

  // Filter actions by query
  const filteredActions = useMemo<CommandPaletteResult[]>(() => {
    if (!query.trim()) {
      // No query: show all actions
      return actions
    }

    // Filter actions by fuzzy match on title
    return actions.filter(action => fuzzyMatch(query, action.title))
  }, [actions, query])

  // Combine filtered actions + entity results
  const combinedResults = useMemo<CommandPaletteResult[]>(() => {
    // Actions first, then entities
    return [...filteredActions, ...entityResultsAsActions]
  }, [filteredActions, entityResultsAsActions])

  return {
    query,
    setQuery,
    results: combinedResults,
    isSearching,
    clearSearch,
  }
}
