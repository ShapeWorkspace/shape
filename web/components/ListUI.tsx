import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react"
import { Search, ChevronRight } from "lucide-react"
import { useFocusSafe } from "../contexts/FocusContext"
import * as styles from "../styles/list.css"
import * as appStyles from "../styles/app.css"

/**
 * Props for ListContainer component.
 */
interface ListContainerProps {
  children: ReactNode
  // Optional navigation drawer element to render on the left
  navigationDrawer?: ReactNode
}

/**
 * ListContainer is the Primary UI (PUI) wrapper that provides the centered
 * CLI-like container appearance. ALL application UI must be rendered within
 * a ListContainer (aside from navigation drawer and sidecar).
 *
 * Use this to wrap List when rendering outside of WorkspaceLayout.
 * WorkspaceLayout already provides this container through its content wrappers.
 *
 * Per Book of UI: All application UI must use the centered CLI-like component.
 */
export function ListContainer({ children, navigationDrawer }: ListContainerProps) {
  return (
    <div className={appStyles.app}>
      {navigationDrawer}
      <main className={appStyles.main}>
        <div className={appStyles.mainContentArea}>
          <div className={appStyles.contentWrapper}>
            <div className={appStyles.content}>
              <div className={appStyles.contentInner}>{children}</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

/**
 * ListContext provides shared navigation state for all list components.
 * This enables keyboard navigation across List, ListRow, and other list components.
 */
interface ListContextValue {
  // Currently selected index for keyboard navigation
  selectedIndex: number
  // Function to update selected index
  setSelectedIndex: (index: number | ((prev: number) => number)) => void
  // Total number of selectable items
  totalItems: number
  // Register search input ref for focus management
  registerSearchInput: (ref: React.RefObject<HTMLInputElement>) => void
  // Focus the search input if available
  focusSearchInput: () => boolean
}

const ListContext = createContext<ListContextValue | null>(null)

/**
 * Hook to access list context. Returns null if used outside of List component.
 * This allows ListRow to work both inside and outside of List.
 */
export function useListContext(): ListContextValue | null {
  return useContext(ListContext)
}

/**
 * Props for the List component.
 */
interface ListProps {
  children: ReactNode
  // Total number of selectable items (required for keyboard navigation bounds)
  itemCount: number
  // Optional test ID for testing
  testId?: string
  // Optional callback when Enter is pressed on selected item
  onSelect?: (index: number) => void
  // Whether to disable keyboard navigation (useful when modal is open)
  disableKeyboard?: boolean
  // Optional initial selected index
  initialSelectedIndex?: number
  // Optional callback when selection changes via keyboard
  onSelectionChange?: (index: number) => void
}

/**
 * List is the container component for all list-based UI.
 * It provides keyboard navigation context and handles arrow key navigation.
 *
 * Usage:
 * ```tsx
 * <List itemCount={items.length + 1}>
 *   <ListHeader title="Section" />
 *   {items.map((item, index) => (
 *     <ListRow
 *       key={item.id}
 *       index={index}
 *       title={item.name}
 *       onClick={() => handleSelect(item)}
 *     />
 *   ))}
 *   <ListRow
 *     index={items.length}
 *     title="Create new"
 *     isCreateAction
 *     onClick={handleCreate}
 *   />
 * </List>
 * ```
 */
export function List({
  children,
  itemCount,
  testId,
  onSelect,
  disableKeyboard = false,
  initialSelectedIndex = 0,
  onSelectionChange,
}: ListProps) {
  const [selectedIndex, setSelectedIndex] = useState(initialSelectedIndex)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<React.RefObject<HTMLInputElement> | null>(null)

  // Get content focus state from focus context
  // List only handles keyboard when content area is focused
  const { isContentFocused } = useFocusSafe()

  // Register search input ref for focus management
  const registerSearchInput = (ref: React.RefObject<HTMLInputElement>) => {
    searchInputRef.current = ref
  }

  // Focus the search input if available, returns true if focused
  const focusSearchInput = (): boolean => {
    if (searchInputRef.current?.current) {
      searchInputRef.current.current.focus()
      return true
    }
    return false
  }

  // Reset selected index when item count changes
  useEffect(() => {
    if (selectedIndex >= itemCount) {
      setSelectedIndex(Math.max(0, itemCount - 1))
    }
  }, [itemCount, selectedIndex])

  // Handle keyboard navigation - only when content is focused
  useEffect(() => {
    if (disableKeyboard || !isContentFocused) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if event was already handled by another component (e.g., sidebar navigation)
      if (e.defaultPrevented) return

      // Don't handle if we're in an input field
      const target = e.target as HTMLElement
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable

      if (isInput) {
        // Allow escape to blur inputs
        if (e.key === "Escape") {
          ;(target as HTMLInputElement).blur()
        }
        return
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          // Cycle to first item if at the last, otherwise move down
          setSelectedIndex(i => (i >= itemCount - 1 ? 0 : i + 1))
          break
        case "ArrowUp":
          e.preventDefault()
          // If at the first item, try to focus the search input
          if (selectedIndex === 0) {
            focusSearchInput()
          } else {
            setSelectedIndex(i => i - 1)
          }
          break
        case "Enter":
          e.preventDefault()
          onSelect?.(selectedIndex)
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [disableKeyboard, isContentFocused, itemCount, selectedIndex, onSelect])

  // Notify parent when selection changes
  useEffect(() => {
    onSelectionChange?.(selectedIndex)
  }, [selectedIndex, onSelectionChange])

  const contextValue: ListContextValue = {
    selectedIndex,
    setSelectedIndex,
    totalItems: itemCount,
    registerSearchInput,
    focusSearchInput,
  }

  return (
    <ListContext.Provider value={contextValue}>
      <div
        className={`${appStyles.toolWindow} ${styles.list}`}
        ref={containerRef}
        data-testid={testId}
        tabIndex={0}
      >
        {children}
      </div>
    </ListContext.Provider>
  )
}

/**
 * Props for ListRow component.
 */
interface ListRowProps {
  // Index of this row in the list (required for selection tracking)
  index: number
  // Primary text for the row
  title: string
  // Optional secondary text (shown on the right)
  meta?: string
  // Optional icon to show before the title
  icon?: ReactNode
  // Optional accessory on the right (e.g., chevron, badge)
  accessory?: ReactNode
  // Click handler - navigates deeper or opens sidecar
  onClick?: () => void
  // Double-click handler - for folder navigation
  onDoubleClick?: () => void
  // Whether this row represents a "create new" action
  isCreateAction?: boolean
  // Whether this row is disabled
  disabled?: boolean
  // Optional test ID
  testId?: string
  // Optional custom content to render after title (before meta)
  children?: ReactNode
  // Controls visibility with enter/exit animations. When undefined, row is always visible.
  // When true, row animates in. When false, row animates out then unmounts.
  show?: boolean
  // External selection state (for sidecar selection). When true, shows as selected
  // regardless of keyboard navigation index.
  isSelected?: boolean
}

/**
 * ListRow is an individual row in a list.
 * Clicking/selecting always does one of two things:
 * 1. Navigates deeper into the stack
 * 2. Presents the sidecar for the selected item
 */
export function ListRow({
  index,
  title,
  meta,
  icon,
  accessory,
  onClick,
  onDoubleClick,
  isCreateAction = false,
  disabled = false,
  testId,
  children,
  show,
  isSelected: isSelectedProp,
}: ListRowProps) {
  const context = useListContext()
  // Use external isSelected prop if provided, otherwise use keyboard navigation index
  const isKeyboardSelected = context ? context.selectedIndex === index : false
  const isSelected = isSelectedProp !== undefined ? isSelectedProp : isKeyboardSelected

  // Track animation state: 'entering' | 'visible' | 'exiting' | 'hidden'
  const [animationState, setAnimationState] = useState<"entering" | "visible" | "exiting" | "hidden">(() => {
    if (show === undefined) return "visible"
    return show ? "entering" : "hidden"
  })
  const prevShowRef = useRef(show)

  // Handle show prop changes
  useEffect(() => {
    const prevShow = prevShowRef.current

    if (show === true && (prevShow === false || prevShow === undefined)) {
      // Transitioning to visible - play enter animation
      setAnimationState("entering")
    } else if (show === false && (prevShow === true || prevShow === undefined)) {
      // Transitioning to hidden - play exit animation
      setAnimationState("exiting")
    }

    prevShowRef.current = show
  }, [show])

  // Handle animation end
  const handleAnimationEnd = () => {
    if (animationState === "entering") {
      setAnimationState("visible")
    } else if (animationState === "exiting") {
      setAnimationState("hidden")
    }
  }

  const handleMouseEnter = () => {
    context?.setSelectedIndex(index)
  }

  const handleClick = () => {
    if (!disabled && animationState !== "exiting") {
      onClick?.()
    }
  }

  const handleDoubleClick = () => {
    if (!disabled && animationState !== "exiting") {
      onDoubleClick?.()
    }
  }

  // Don't render if hidden
  if (animationState === "hidden") {
    return null
  }

  // Determine class based on animation state
  let className = styles.listItem
  if (animationState === "entering") {
    className = `${styles.listItem} ${styles.listItemAnimatedEnter}`
  } else if (animationState === "exiting") {
    className = `${styles.listItem} ${styles.listItemAnimatedExit}`
  }

  return (
    <div
      className={className}
      data-selected={isSelected}
      data-create-new={isCreateAction}
      data-disabled={disabled}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={handleMouseEnter}
      onAnimationEnd={handleAnimationEnd}
      data-testid={testId}
    >
      {icon && <span className={styles.listItemIcon}>{icon}</span>}
      <span className={styles.listItemTitle}>{title}</span>
      {children}
      {meta && <span className={styles.listItemMeta}>{meta}</span>}
      {accessory}
    </div>
  )
}

/**
 * Props for ListHeader component.
 */
interface ListHeaderProps {
  // Section title
  title: string
}

/**
 * ListHeader displays a section header within a list.
 * Used to group related rows. Does not count towards selectable items.
 */
export function ListHeader({ title }: ListHeaderProps) {
  return (
    <div className={styles.listHeader}>
      <span className={styles.listTitle}>{title}</span>
    </div>
  )
}

/**
 * Props for ListStickyHeader component.
 */
interface ListStickyHeaderProps {
  children: ReactNode
}

/**
 * ListStickyHeader wraps content that should remain fixed at the top of the list
 * while the rest of the list scrolls. Use for search bars and primary actions.
 */
export function ListStickyHeader({ children }: ListStickyHeaderProps) {
  return <div className={styles.listStickyHeader}>{children}</div>
}

/**
 * Props for ListSearch component.
 */
interface ListSearchProps {
  // Current search query value
  value: string
  // Change handler for search input
  onChange: (value: string) => void
  // Placeholder text
  placeholder?: string
  // Optional test ID
  testId?: string
  // Optional callback when focus state changes
  onFocusChange?: (focused: boolean) => void
}

/**
 * ListSearch provides a search input for filtering list items.
 * Supports keyboard shortcut (/) to focus.
 */
export function ListSearch({
  value,
  onChange,
  placeholder = "Search...",
  testId,
  onFocusChange,
}: ListSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const context = useListContext()
  const [isFocused, setIsFocused] = useState(false)

  // Register input ref with context for focus management
  useEffect(() => {
    context?.registerSearchInput(inputRef)
  }, [context])

  // Handle keyboard shortcut to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA"

      if (!isInput && (e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey)))) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      context?.setSelectedIndex(0)
      inputRef.current?.blur()
    } else if (e.key === "Escape") {
      onChange("")
      inputRef.current?.blur()
    }
  }

  const handleFocus = () => {
    // Clear list selection when search is focused
    context?.setSelectedIndex(-1)
    setIsFocused(true)
    onFocusChange?.(true)
  }

  const handleBlur = () => {
    setIsFocused(false)
    onFocusChange?.(false)
  }

  // Use active icon style when focused or has input (white in dark mode)
  const searchIconClass = isFocused || value ? styles.listSearchIconActive : styles.listSearchIcon

  return (
    <div className={styles.listSearch}>
      <Search size={14} className={searchIconClass} />
      <input
        ref={inputRef}
        type="text"
        className={styles.listSearchInput}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        data-testid={testId}
      />
    </div>
  )
}

/**
 * Props for ListEmpty component.
 */
interface ListEmptyProps {
  // Message to display when list is empty
  message: string
  // Optional test id for automation
  testId?: string
}

/**
 * ListEmpty displays an empty state message.
 */
export function ListEmpty({ message, testId }: ListEmptyProps) {
  return (
    <div className={appStyles.emptyState} data-testid={testId}>
      <p className={appStyles.emptyStateText}>{message}</p>
    </div>
  )
}

/**
 * Props for ListSectionHeader component.
 */
interface ListSectionHeaderProps {
  // Optional section title
  title?: string
  // Optional count to display
  count?: number
  // Whether to show a bottom border separator
  hasSeparator?: boolean
}

/**
 * ListSectionHeader displays a section divider with an optional title.
 * Used to group related rows within a list.
 */
export function ListSectionHeader({ title, count, hasSeparator }: ListSectionHeaderProps) {
  return (
    <div className={styles.listSectionHeader} data-separator={hasSeparator}>
      {title}
      {title && count !== undefined && ` (${count})`}
    </div>
  )
}

/**
 * Props for ListToolbar component.
 */
interface ListToolbarProps {
  children: ReactNode
}

/**
 * ListToolbar provides a container for toolbar actions at the top of a list.
 * Use for primary actions like "Create" buttons.
 */
export function ListToolbar({ children }: ListToolbarProps) {
  return <div className={styles.listToolbar}>{children}</div>
}

/**
 * Props for CustomListContent component.
 */
interface CustomListContentProps {
  children: ReactNode
  // Optional test ID
  testId?: string
}

/**
 * CustomListContent wraps custom (non-list) UI at the terminus of a navigation stack.
 * Use this for editors, detail views, or any UI that isn't a standard list.
 *
 * Per Book of UI: "All application UI MUST be a list, unless it is a 'terminus'
 * or we've reached the end of the stack into an actual app tool."
 */
export function CustomListContent({ children, testId }: CustomListContentProps) {
  return (
    <div className={appStyles.toolWindow} data-testid={testId}>
      {children}
    </div>
  )
}

/**
 * Props for ListRowWithChevron - a common pattern for navigation rows.
 */
interface ListRowWithChevronProps extends Omit<ListRowProps, "accessory"> {
  // Whether to show the chevron (defaults to true)
  showChevron?: boolean
}

/**
 * ListRowWithChevron is a convenience component for rows that navigate deeper.
 * It automatically adds a chevron accessory to indicate navigation.
 */
export function ListRowWithChevron({ showChevron = true, ...props }: ListRowWithChevronProps) {
  return (
    <ListRow
      {...props}
      accessory={showChevron ? <ChevronRight size={14} className={styles.listItemMeta} /> : undefined}
    />
  )
}

/**
 * Props for ListRowWithInput - a row that contains an input field.
 */
interface ListRowWithInputProps {
  // Index of this row in the list
  index: number
  // Icon to show before the input
  icon: ReactNode
  // Input type
  type?: "text" | "email" | "password"
  // Input placeholder
  placeholder: string
  // Current value
  value: string
  // Change handler
  onChange: (value: string) => void
  // Optional test ID for the input
  testId?: string
  // Whether the input is disabled
  disabled?: boolean
  // Reference to the input element
  inputRef?: React.RefObject<HTMLInputElement>
}

/**
 * ListRowWithInput is a row that contains an input field.
 * Used for forms displayed as lists (e.g., auth forms).
 */
/**
 * Props for ListRowActions - container for action buttons in a row.
 */
interface ListRowActionsProps {
  children: ReactNode
}

/**
 * ListRowActions wraps action buttons in a row.
 * Use as the accessory prop for ListRow when you need action buttons.
 */
export function ListRowActions({ children }: ListRowActionsProps) {
  return <div className={styles.listRowActions}>{children}</div>
}

/**
 * Props for ListRowActionButton.
 */
interface ListRowActionButtonProps {
  // Button label
  label: string
  // Icon to display before label
  icon?: ReactNode
  // Click handler
  onClick: (e: React.MouseEvent) => void
  // Button variant
  variant: "primary" | "secondary"
  // Whether the button is disabled
  disabled?: boolean
  // Optional test ID
  testId?: string
}

/**
 * ListRowActionButton is a styled button for use inside ListRowActions.
 * Primary variant is for positive actions (Accept, Confirm).
 * Secondary variant is for neutral/negative actions (Decline, Cancel).
 */
export function ListRowActionButton({
  label,
  icon,
  onClick,
  variant,
  disabled = false,
  testId,
}: ListRowActionButtonProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClick(e)
  }

  return (
    <button
      className={variant === "primary" ? styles.listRowActionPrimary : styles.listRowActionSecondary}
      onClick={handleClick}
      disabled={disabled}
      data-testid={testId}
    >
      {icon}
      {label}
    </button>
  )
}

export function ListRowWithInput({
  index,
  icon,
  type = "text",
  placeholder,
  value,
  onChange,
  testId,
  disabled = false,
  inputRef,
}: ListRowWithInputProps) {
  const context = useListContext()
  const isSelected = context ? context.selectedIndex === index : false
  const localInputRef = useRef<HTMLInputElement>(null)
  const ref = inputRef || localInputRef

  const handleMouseEnter = () => {
    context?.setSelectedIndex(index)
  }

  const handleClick = () => {
    context?.setSelectedIndex(index)
    ref.current?.focus()
  }

  const handleFocus = () => {
    context?.setSelectedIndex(index)
  }

  return (
    <div
      className={styles.listItem}
      data-selected={isSelected}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
    >
      <span className={styles.listItemIcon}>{icon}</span>
      <input
        ref={ref}
        type={type}
        className={styles.listItemInput}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={handleFocus}
        disabled={disabled}
        data-testid={testId}
      />
    </div>
  )
}

// ============================================================
// Detail View Input Components
// Standardized inputs for detail/form views (terminus views)
// ============================================================

/**
 * Props for ListDetailViewInput component.
 */
interface ListDetailViewInputProps {
  // Label displayed above the input
  label: string
  // Input type
  type?: "text" | "email" | "password"
  // Placeholder text
  placeholder?: string
  // Current value
  value: string
  // Change handler
  onChange: (value: string) => void
  // Whether the input is disabled
  disabled?: boolean
  // Optional test ID
  testId?: string
  // Optional ref for focus management
  inputRef?: React.RefObject<HTMLInputElement>
  // Whether to auto-focus on mount
  autoFocus?: boolean
}

/**
 * ListDetailViewInput is a standardized text input for detail views.
 * Use for titles, names, and other single-line text inputs in terminus views.
 *
 * Features:
 * - Consistent styling across all detail views
 * - Label above input
 * - Focus management via ref
 */
export function ListDetailViewInput({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  disabled = false,
  testId,
  inputRef,
  autoFocus = false,
}: ListDetailViewInputProps) {
  const localRef = useRef<HTMLInputElement>(null)
  const ref = inputRef || localRef

  // Handle auto-focus
  useEffect(() => {
    if (autoFocus) {
      ref.current?.focus()
    }
  }, [autoFocus, ref])

  return (
    <div className={styles.detailViewInputContainer}>
      <label className={styles.detailViewInputLabel}>{label}</label>
      <input
        ref={ref}
        type={type}
        className={styles.detailViewInput}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        data-testid={testId}
      />
    </div>
  )
}

/**
 * Props for ListDetailViewTextarea component.
 */
interface ListDetailViewTextareaProps {
  // Label displayed above the textarea
  label: string
  // Placeholder text
  placeholder?: string
  // Current value
  value: string
  // Change handler
  onChange: (value: string) => void
  // Whether the textarea is disabled
  disabled?: boolean
  // Optional test ID
  testId?: string
  // Optional ref for focus management
  textareaRef?: React.RefObject<HTMLTextAreaElement>
  // Optional style overrides (e.g., for flex: 1)
  style?: React.CSSProperties
}

/**
 * ListDetailViewTextarea is a standardized textarea for detail views.
 * Use for content, descriptions, and other multi-line text inputs.
 *
 * Features:
 * - Consistent styling across all detail views
 * - Label above textarea
 * - Non-resizable by default (use flex layout instead)
 */
export function ListDetailViewTextarea({
  label,
  placeholder,
  value,
  onChange,
  disabled = false,
  testId,
  textareaRef,
  style,
}: ListDetailViewTextareaProps) {
  return (
    <div className={styles.detailViewInputContainer} style={style}>
      <label className={styles.detailViewInputLabel}>{label}</label>
      <textarea
        ref={textareaRef}
        className={styles.detailViewTextarea}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        data-testid={testId}
        style={style?.flex ? { flex: 1 } : undefined}
      />
    </div>
  )
}
