import { createContext, useContext, useState, useEffect, ReactNode, type KeyboardEvent as ReactKeyboardEvent } from "react"
import { useSidecar, useSidecarLayout } from "../contexts/SidecarContext"
import * as styles from "../styles/sidecar.css"

/**
 * SidecarContext provides keyboard navigation state for sidecar menu items.
 * Similar to ListContext in ListUI.tsx - enables arrow key navigation
 * across SidecarRow components.
 */
interface SidecarContextValue {
  // Currently selected index for keyboard navigation
  selectedIndex: number
  // Function to update selected index
  setSelectedIndex: (index: number | ((prev: number) => number)) => void
  // Total number of selectable items
  totalItems: number
  // Whether the sidecar is currently focused
  isFocused: boolean
}

const SidecarContext = createContext<SidecarContextValue | null>(null)

/**
 * Hook to access sidecar navigation context.
 * Returns null if used outside of Sidecar component.
 */
export function useSidecarNavigation(): SidecarContextValue | null {
  return useContext(SidecarContext)
}

/**
 * Props for the Sidecar container component.
 */
interface SidecarProps {
  children: ReactNode
  // Total number of selectable menu items (required for keyboard navigation bounds)
  itemCount?: number
  // Optional callback when Enter is pressed on selected item
  onSelect?: (index: number) => void
  // Override focus state (if not provided, reads from SidecarContext)
  isFocused?: boolean
}

/**
 * Sidecar is the container component for tool-specific contextual content.
 * It provides keyboard navigation context and visual structure.
 *
 * Focus state is automatically read from SidecarContext, so tools don't need
 * to pass isFocused - it will always reflect the current focus state.
 *
 * Per Book of UI: Each tool determines how to render its own sidecar.
 * The sidecar is passed as a prop to the layout, not managed globally.
 *
 * Usage:
 * ```tsx
 * <Sidecar itemCount={2}>
 *   <SidecarSection title="Details">
 *     <SidecarMetaList>
 *       <SidecarMetaItem icon={<Mail />} label="Email" value={email} />
 *     </SidecarMetaList>
 *   </SidecarSection>
 *   <SidecarSection title="Actions">
 *     <SidecarRow index={0} icon={<Trash />} title="Delete" onClick={onDelete} />
 *     <SidecarRow index={1} icon={<X />} title="Cancel" onClick={onCancel} />
 *   </SidecarSection>
 * </Sidecar>
 * ```
 */
export function Sidecar({ children, itemCount = 0, onSelect, isFocused: isFocusedProp }: SidecarProps) {
  // Read focus state from context - this ensures focus is always current
  // even when the sidecar content was set in a memoized callback
  const { isFocused: isFocusedFromContext, popSidecar } = useSidecar()
  // Get stack to check if we can navigate back (more than one item)
  const { stack } = useSidecarLayout()
  const isFocused = isFocusedProp ?? isFocusedFromContext

  const [selectedIndex, setSelectedIndex] = useState(0)

  // Reset selected index when item count changes
  useEffect(() => {
    if (selectedIndex >= itemCount && itemCount > 0) {
      setSelectedIndex(Math.max(0, itemCount - 1))
    }
  }, [itemCount, selectedIndex])

  // Handle keyboard navigation when focused
  useEffect(() => {
    if (!isFocused || itemCount === 0) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          // Cycle to first item when at the last
          setSelectedIndex(i => (i >= itemCount - 1 ? 0 : i + 1))
          break
        case "ArrowUp":
          e.preventDefault()
          // Cycle to last item when at the first
          setSelectedIndex(i => (i <= 0 ? itemCount - 1 : i - 1))
          break
        case "Enter":
          e.preventDefault()
          onSelect?.(selectedIndex)
          break
        case "Backspace":
          // Navigate back in sidecar stack if there's history to go back to
          if (stack.length > 1) {
            e.preventDefault()
            popSidecar()
          }
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isFocused, itemCount, selectedIndex, onSelect, stack, popSidecar])

  const contextValue: SidecarContextValue = {
    selectedIndex,
    setSelectedIndex,
    totalItems: itemCount,
    isFocused,
  }

  return <SidecarContext.Provider value={contextValue}>{children}</SidecarContext.Provider>
}

/**
 * Props for SidecarSection component.
 */
interface SidecarSectionProps {
  // Section header title (displayed in uppercase). Optional for sections without headers.
  title?: string
  children: ReactNode
}

/**
 * SidecarSection groups related content with an optional header.
 * Used to organize sidecar content into logical sections (Details, Actions, etc.).
 */
export function SidecarSection({ title, children }: SidecarSectionProps) {
  return (
    <div className={styles.sidecarSection}>
      {title && <div className={styles.sidecarSectionHeader}>{title}</div>}
      {children}
    </div>
  )
}

/**
 * Props for SidecarRow component - an actionable menu item.
 */
interface SidecarRowProps {
  // Index for keyboard navigation (required when inside Sidecar with itemCount > 0)
  index: number
  // Icon displayed before title
  icon?: ReactNode
  // Primary text for the row
  title: ReactNode
  // Optional secondary text displayed below title (e.g., entity type for backlinks)
  sublabel?: string
  // Optional meta text displayed on the right
  meta?: string
  // Click handler - triggers the row's action
  onClick?: () => void
  // Whether this row is disabled
  disabled?: boolean
  // Whether this is a destructive action (renders in red)
  isDestructive?: boolean
  // Whether this row is a nested sub-row under another action.
  isSubRow?: boolean
  // Optional test ID for testing
  testId?: string
}

/**
 * SidecarRow is a clickable menu item within a sidecar section.
 * Similar to ListRow but for sidecar actions.
 *
 * Per Book of UI: Clicking a row triggers an action (like delete, cancel, etc.)
 */
export function SidecarRow({
  index,
  icon,
  title,
  sublabel,
  meta,
  onClick,
  disabled = false,
  isDestructive = false,
  isSubRow = false,
  testId,
}: SidecarRowProps) {
  const context = useSidecarNavigation()
  // Row is selected when sidecar is focused AND this row's index matches
  const isSelected = context?.isFocused && context.selectedIndex === index

  const handleMouseEnter = () => {
    context?.setSelectedIndex(index)
  }

  const handleFocus = () => {
    context?.setSelectedIndex(index)
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) {
      return
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      event.stopPropagation()
      onClick?.()
    }
  }

  const handleClick = () => {
    if (!disabled) {
      onClick?.()
    }
  }

  return (
    <div
      className={styles.sidecarMenuItem}
      data-selected={isSelected}
      data-disabled={disabled}
      data-destructive={isDestructive}
      data-sub-row={isSubRow}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      tabIndex={disabled ? -1 : 0}
      data-testid={testId}
    >
      {isSubRow && <span className={styles.sidecarSubRowBranch} aria-hidden="true" />}
      {icon && <span className={styles.sidecarMenuIcon}>{icon}</span>}
      <div className={styles.sidecarMenuLabelContainer}>
        <span className={styles.sidecarMenuLabel}>{title}</span>
        {sublabel && <span className={styles.sidecarMenuSublabel}>{sublabel}</span>}
      </div>
      {meta && <span className={styles.sidecarMenuMeta}>{meta}</span>}
    </div>
  )
}

/**
 * Props for SidecarMenu - container for SidecarRow items.
 */
interface SidecarMenuProps {
  children: ReactNode
}

/**
 * SidecarMenu wraps multiple SidecarRow components with proper spacing.
 */
export function SidecarMenu({ children }: SidecarMenuProps) {
  return <div className={styles.sidecarMenu}>{children}</div>
}

/**
 * Props for SidecarMetaList component.
 */
interface SidecarMetaListProps {
  children: ReactNode
}

/**
 * SidecarMetaList is a container for metadata items (key-value pairs).
 * Used for displaying item details like dates, roles, counts, etc.
 */
export function SidecarMetaList({ children }: SidecarMetaListProps) {
  return <div className={styles.sidecarMetaList}>{children}</div>
}

/**
 * Props for SidecarMetaItem - displays a labeled value.
 */
interface SidecarMetaItemProps {
  // Icon displayed before the label
  icon?: ReactNode
  // Label text (e.g., "Created", "Role", "Email")
  label: string
  // Value to display (e.g., "Yesterday", "Admin", "user@example.com")
  value: string | ReactNode
  // Optional index for keyboard navigation (makes item selectable)
  index?: number
  // Optional click handler (enables interaction)
  onClick?: () => void
  // Optional test ID
  testId?: string
}

/**
 * SidecarMetaItem displays a labeled piece of metadata.
 * Layout: [icon] [label] ................ [value]
 *
 * When `index` is provided, the item participates in keyboard navigation.
 * When `onClick` is provided, the item is clickable.
 */
export function SidecarMetaItem({ icon, label, value, index, onClick, testId }: SidecarMetaItemProps) {
  const context = useSidecarNavigation()
  // Only participate in selection if index is provided
  const isNavigable = index !== undefined
  const isSelected = isNavigable && context?.isFocused && context.selectedIndex === index

  const handleMouseEnter = () => {
    if (isNavigable) {
      context?.setSelectedIndex(index)
    }
  }

  const handleClick = () => {
    onClick?.()
  }

  return (
    <div
      className={styles.sidecarMetaItem}
      data-selected={isSelected}
      data-clickable={!!onClick}
      onClick={onClick ? handleClick : undefined}
      onMouseEnter={isNavigable ? handleMouseEnter : undefined}
      style={{ cursor: onClick ? "pointer" : undefined }}
      data-testid={testId}
    >
      {icon && <span className={styles.sidecarMetaItemIcon}>{icon}</span>}
      <span className={styles.sidecarMetaLabel}>{label}</span>
      <span className={styles.sidecarMetaValue}>{value}</span>
    </div>
  )
}

/**
 * Props for SidecarEmpty component.
 */
interface SidecarEmptyProps {
  // Message to display when sidecar has no content
  message: string
}

/**
 * SidecarEmpty displays an empty state message.
 */
export function SidecarEmpty({ message }: SidecarEmptyProps) {
  return <div className={styles.sidecarEmpty}>{message}</div>
}

/**
 * Props for SidecarDescription component.
 */
interface SidecarDescriptionProps {
  children: ReactNode
}

/**
 * SidecarDescription displays descriptive text in a styled container.
 */
export function SidecarDescription({ children }: SidecarDescriptionProps) {
  return <div className={styles.sidecarDescription}>{children}</div>
}
