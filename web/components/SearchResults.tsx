/**
 * SearchResults Component
 *
 * Displays search results grouped by entity type.
 * Each result is clickable and navigates to the corresponding entity.
 */

import type { ReactNode } from "react"
import { useMemo } from "react"
import {
  FileText,
  MessageCircle,
  CheckSquare,
  File,
  Folder,
  MessagesSquare,
  FolderKanban,
  User,
  ScrollText,
  Tag,
} from "lucide-react"
import type { SearchableEntityType } from "../../engine/search/search-types"
import type { EnrichedSearchResult } from "../hooks/use-search"
import * as styles from "../styles/search.css"
import { TOOL_LABELS } from "../constants/tool-labels"

/**
 * Props for the SearchResults component.
 */
interface SearchResultsProps {
  /**
   * Array of enriched search results to display.
   */
  results: EnrichedSearchResult[]
  /**
   * Callback when a result is clicked.
   */
  onResultClick: (result: EnrichedSearchResult) => void
  /**
   * Whether to group results by entity type.
   */
  groupByType?: boolean
  /**
   * Currently selected result index.
   */
  selectedIndex?: number
}

/**
 * Mapping of entity types to display names.
 * Uses TOOL_LABELS where applicable for consistency.
 */
const ENTITY_TYPE_LABELS: Record<SearchableEntityType, string> = {
  note: TOOL_LABELS.memos,
  paper: TOOL_LABELS.papers,
  project: TOOL_LABELS.projects,
  "task": TOOL_LABELS.tasks,
  "project-tag": "Tags",
  "task-comment": "Task Comments",
  file: TOOL_LABELS.files,
  folder: "Folders",
  "forum-channel": "Forum Channels",
  "forum-discussion": "Forum Discussions",
  "forum-reply": "Forum Replies",
  "paper-comment": "Paper Comments",
  "paper-comment-reply": "Comment Replies",
  "group-chat": TOOL_LABELS.groups,
  "group-message": "Messages",
  "direct-message": "Direct Messages",
  "workspace-member": TOOL_LABELS.contacts,
}

/**
 * Mapping of entity types to icons.
 */
const ENTITY_TYPE_ICONS: Record<SearchableEntityType, ReactNode> = {
  note: <FileText size={14} />,
  paper: <ScrollText size={14} />,
  project: <FolderKanban size={14} />,
  "task": <CheckSquare size={14} />,
  "project-tag": <Tag size={14} />,
  "task-comment": <MessageCircle size={14} />,
  file: <File size={14} />,
  folder: <Folder size={14} />,
  "forum-channel": <MessagesSquare size={14} />,
  "forum-discussion": <MessagesSquare size={14} />,
  "forum-reply": <MessagesSquare size={14} />,
  "paper-comment": <MessageCircle size={14} />,
  "paper-comment-reply": <MessageCircle size={14} />,
  "group-chat": <MessageCircle size={14} />,
  "group-message": <MessageCircle size={14} />,
  "direct-message": <MessageCircle size={14} />,
  "workspace-member": <User size={14} />,
}

/**
 * Group results by entity type.
 */
function groupResultsByType(
  results: EnrichedSearchResult[]
): Map<SearchableEntityType, EnrichedSearchResult[]> {
  const groups = new Map<SearchableEntityType, EnrichedSearchResult[]>()

  for (const result of results) {
    const type = result.entityType
    if (!groups.has(type)) {
      groups.set(type, [])
    }
    groups.get(type)!.push(result)
  }

  return groups
}

/**
 * SearchResults renders search results with optional grouping by type.
 */
export function SearchResults({
  results,
  onResultClick,
  groupByType = true,
  selectedIndex = -1,
}: SearchResultsProps) {
  // Group results by type if requested
  const groupedResults = useMemo(() => {
    if (!groupByType) {
      return null
    }
    return groupResultsByType(results)
  }, [results, groupByType])

  // Empty state
  if (results.length === 0) {
    return (
      <div className={styles.searchResultsList} data-testid="search-results-list">
        <div className={styles.searchResultItem}>
          <span className={styles.searchResultTitle}>No results found</span>
        </div>
      </div>
    )
  }

  // Render grouped results
  if (groupByType && groupedResults) {
    let flatIndex = 0
    return (
      <div className={styles.searchResultsList} data-testid="search-results-list">
        {Array.from(groupedResults.entries()).map(([type, typeResults]) => (
          <div key={type}>
            <div className={styles.searchResultsSectionHeader} data-testid="search-results-section-header">
              {ENTITY_TYPE_LABELS[type]}
            </div>
            {typeResults.map(result => {
              const currentIndex = flatIndex++
              return (
                <SearchResultItem
                  key={`${result.entityType}:${result.entityId}`}
                  result={result}
                  onClick={() => onResultClick(result)}
                  isSelected={currentIndex === selectedIndex}
                />
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  // Render flat list
  return (
    <div className={styles.searchResultsList} data-testid="search-results-list">
      {results.map((result, index) => (
        <SearchResultItem
          key={`${result.entityType}:${result.entityId}`}
          result={result}
          onClick={() => onResultClick(result)}
          isSelected={index === selectedIndex}
        />
      ))}
    </div>
  )
}

/**
 * Props for a single search result item.
 */
interface SearchResultItemProps {
  result: EnrichedSearchResult
  onClick: () => void
  isSelected: boolean
}

/**
 * Renders a single search result item.
 */
function SearchResultItem({ result, onClick, isSelected }: SearchResultItemProps) {
  const icon = ENTITY_TYPE_ICONS[result.entityType]

  return (
    <div
      className={styles.searchResultItem}
      onClick={onClick}
      data-testid="search-result-item"
      data-selected={isSelected}
    >
      <span className={styles.searchResultIcon}>{icon}</span>
      <span className={styles.searchResultTitle}>{result.title}</span>
      {result.subtitle && <span className={styles.searchResultMeta}>{result.subtitle}</span>}
    </div>
  )
}
