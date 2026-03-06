/**
 * SearchChip Component
 *
 * A chip that represents a search context filter (e.g., "Notes", "Project X").
 * Displayed in the search bar when focused. Can be removed by clicking the X button.
 */

import type { MouseEvent } from "react"
import { X } from "lucide-react"
import * as styles from "../styles/search.css"

/**
 * Props for the SearchChip component.
 */
interface SearchChipProps {
  /**
   * Unique identifier for the chip.
   */
  id: string
  /**
   * Display label for the chip (e.g., "Notes", "Project Name").
   */
  label: string
  /**
   * Callback when the chip's remove button is clicked.
   */
  onRemove: () => void
  /**
   * Optional test ID for testing.
   */
  testId?: string
}

/**
 * SearchChip renders a removable filter chip in the search bar.
 * Used to show the current search context (tool or parent entity).
 */
export function SearchChip({ id, label, onRemove, testId }: SearchChipProps) {
  // Generate test IDs based on label
  const normalizedLabel = label.toLowerCase().replace(/\s+/g, "-")
  const chipTestId = testId || `search-chip-${normalizedLabel}`
  const removeTestId = `search-chip-remove-${normalizedLabel}`

  const handleRemoveClick = (e: MouseEvent) => {
    // Prevent the click from focusing the search input
    e.stopPropagation()
    e.preventDefault()
    onRemove()
  }

  return (
    <span className={styles.searchChip} data-testid={chipTestId} data-chip-id={id}>
      {label}
      <button
        type="button"
        className={styles.searchChipRemove}
        onClick={handleRemoveClick}
        data-testid={removeTestId}
        aria-label={`Remove ${label} filter`}
      >
        <X size={10} />
      </button>
    </span>
  )
}

/**
 * Type for a search chip definition.
 */
export interface SearchChipDefinition {
  /**
   * Unique identifier for the chip.
   */
  id: string
  /**
   * Display label for the chip.
   */
  label: string
  /**
   * Type of context: 'tool' (e.g., Notes) or 'parent' (e.g., Project Name).
   */
  type: "tool" | "parent"
}
