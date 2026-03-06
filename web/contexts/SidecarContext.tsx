import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react"
import { useEngineStore } from "../store/engine-store"
import { LocalPreferencesService } from "../setup/local-preferences"

/**
 * SidecarStackItem represents a single level in the sidecar navigation stack.
 * Each item stores both the title (for breadcrumb display) and the content
 * (for rendering when navigating back).
 */
export interface SidecarStackItem {
  id: string
  title: string
  content: ReactNode
  route?: string
}

/**
 * LayoutMode determines how the main content area and sidecar are displayed.
 * - 'compact': Default mode with floating content container and sidecar
 * - 'full': Edge-to-edge mode where content and sidecar stretch to fill available space
 * - 'mobile': Mobile layout with single content panel and slide-out drawers
 */
export type LayoutMode = "full" | "compact" | "mobile"

/**
 * SidecarProviderValue is the shape of the context provided to tools and layout.
 *
 * The sidecar uses a stack-based navigation system similar to the main content
 * breadcrumbs. Tools push content onto the stack, and the layout automatically
 * renders breadcrumbs from the stack. Clicking a breadcrumb navigates back to
 * that level, restoring the previous content.
 */
interface SidecarProviderValue {
  // Navigation stack - each item contains title and content
  stack: SidecarStackItem[]
  // Push new content onto the stack (navigate deeper)
  pushSidecar: (content: ReactNode, title: string, options?: { route?: string }) => void
  // Pop the last item from stack (navigate back one level)
  popSidecar: () => void
  // Navigate to a specific stack index (for breadcrumb clicks)
  navigateToStackIndex: (index: number) => void
  // Set sidecar content - clears stack and pushes single item (backwards compatible)
  setSidecar: (content: ReactNode | null, title?: string, options?: { route?: string }) => void
  // Clear the sidecar entirely (empties stack)
  clearSidecar: () => void
  // Replace the entire stack (used for URL-driven sidecar routing)
  replaceSidecarStack: (items: Array<{ title: string; content: ReactNode; route?: string }>) => void
  // Update the title of the current (last) sidecar item
  updateSidecarTitle: (title: string) => void
  // Whether the sidecar is focused (for keyboard navigation)
  isFocused: boolean
  // Set focus state
  setFocused: (focused: boolean) => void
  // Whether the sidecar is manually collapsed (hidden but content preserved)
  isCollapsed: boolean
  // Whether collapse is disabled (e.g., onboarding auth sidecar)
  isCollapseDisabled: boolean
  // Enable/disable collapse behavior
  setCollapseDisabled: (disabled: boolean) => void
  // Toggle sidecar visibility (collapse/expand)
  toggleSidecarVisibility: () => void
  // Layout mode: 'full' (edge-to-edge) or 'compact' (floating containers)
  layoutMode: LayoutMode
  // Set the layout mode
  setLayoutMode: (mode: LayoutMode) => void
}

const SidecarProviderContext = createContext<SidecarProviderValue | null>(null)

/**
 * Hook for tools to access sidecar context.
 * Returns methods to manage sidecar content and focus state.
 *
 * Usage in a tool:
 * ```tsx
 * const { setSidecar, pushSidecar, clearSidecar } = useSidecar()
 *
 * // Set initial sidecar when user selects an item
 * const handleSelectItem = (item: Item) => {
 *   setSidecar(<ItemSidecar item={item} />, 'Info')
 * }
 *
 * // Navigate deeper (inside the sidecar component)
 * const handleViewDetails = () => {
 *   pushSidecar(<DetailsSidecar item={item} />, 'Details')
 * }
 *
 * // Clear on unmount
 * useEffect(() => {
 *   return () => clearSidecar()
 * }, [clearSidecar])
 * ```
 */
export function useSidecar(): Omit<SidecarProviderValue, "stack"> {
  const context = useContext(SidecarProviderContext)
  if (!context) {
    throw new Error("useSidecar must be used within SidecarProvider")
  }
  return {
    pushSidecar: context.pushSidecar,
    popSidecar: context.popSidecar,
    navigateToStackIndex: context.navigateToStackIndex,
    setSidecar: context.setSidecar,
    clearSidecar: context.clearSidecar,
    replaceSidecarStack: context.replaceSidecarStack,
    updateSidecarTitle: context.updateSidecarTitle,
    isFocused: context.isFocused,
    setFocused: context.setFocused,
    isCollapsed: context.isCollapsed,
    isCollapseDisabled: context.isCollapseDisabled,
    setCollapseDisabled: context.setCollapseDisabled,
    toggleSidecarVisibility: context.toggleSidecarVisibility,
    layoutMode: context.layoutMode,
    setLayoutMode: context.setLayoutMode,
  }
}

/**
 * Hook for layout to access full sidecar context including stack.
 * This is separate from useSidecar to make it clear that only the layout
 * should be reading the stack for rendering breadcrumbs and content.
 *
 * Usage in WorkspaceLayout:
 * ```tsx
 * const { stack, navigateToStackIndex, isFocused } = useSidecarLayout()
 *
 * // Render sidecar when stack has items
 * {stack.length > 0 && (
 *   <div className={sidecarStyles.sidecarWrapper}>
 *     <SidecarBreadcrumb stack={stack} onNavigate={navigateToStackIndex} />
 *     <div className={sidecarStyles.sidecar} data-focused={isFocused}>
 *       {stack[stack.length - 1].content}
 *     </div>
 *   </div>
 * )}
 * ```
 */
export function useSidecarLayout(): SidecarProviderValue {
  const context = useContext(SidecarProviderContext)
  if (!context) {
    throw new Error("useSidecarLayout must be used within SidecarProvider")
  }
  return context
}

/**
 * Props for SidecarProvider component.
 */
interface SidecarProviderProps {
  children: ReactNode
}

/**
 * Generate a unique ID for stack items.
 */
let sidecarIdCounter = 0
function generateSidecarId(): string {
  return `sidecar-${++sidecarIdCounter}`
}

/**
 * SidecarProvider wraps the layout and provides context for tools to pass
 * sidecar content up to the layout level.
 *
 * Place this at the layout level, wrapping the content area and sidecar:
 * ```tsx
 * <SidecarProvider>
 *   <ContentArea>
 *     <Outlet />
 *   </ContentArea>
 *   <SidecarRenderer />
 * </SidecarProvider>
 * ```
 */
export function SidecarProvider({ children }: SidecarProviderProps) {
  const [stack, setStack] = useState<SidecarStackItem[]>([])
  const [isFocused, setIsFocused] = useState(false)
  // Track whether the sidecar is manually collapsed (hidden but content preserved)
  const [isCollapsed, setIsCollapsed] = useState(false)
  // Allow tools to disable collapse (onboarding auth sidecar).
  const [isCollapseDisabled, setIsCollapseDisabled] = useState(false)
  // Layout mode: 'compact' (default floating containers) or 'full' (edge-to-edge)
  const [layoutMode, setLayoutModeState] = useState<LayoutMode>("compact")
  // Reference to LocalPreferencesService for persisting preferences
  const [preferencesService, setPreferencesService] = useState<LocalPreferencesService | null>(null)

  // Get GlobalClient from engine store
  const globalClient = useEngineStore(
    (state: { globalClient: ReturnType<typeof useEngineStore.getState>["globalClient"] }) =>
      state.globalClient
  )

  // Initialize LocalPreferencesService when GlobalClient becomes available
  useEffect(() => {
    if (globalClient && !preferencesService) {
      const service = new LocalPreferencesService(globalClient.getDeviceStorage())
      setPreferencesService(service)

      // Load saved layout mode preference
      service.getLayoutMode().then(savedMode => {
        setLayoutModeState(savedMode)
      })
    }
  }, [globalClient, preferencesService])

  // Push new content onto the stack (navigate deeper)
  // Also expands the sidecar if it was collapsed
  const pushSidecar = useCallback(
    (content: ReactNode, title: string, options?: { route?: string }) => {
      setStack(currentStack => [
        ...currentStack,
        { id: generateSidecarId(), title, content, route: options?.route },
      ])
      setIsCollapsed(false)
    },
    []
  )

  // Pop the last item from stack (navigate back one level)
  const popSidecar = useCallback(() => {
    setStack(currentStack => {
      if (currentStack.length <= 1) {
        // If only one item, clear the stack entirely
        return []
      }
      return currentStack.slice(0, -1)
    })
  }, [])

  // Navigate to a specific stack index (for breadcrumb clicks)
  // Keeps items up to and including the clicked index
  const navigateToStackIndex = useCallback((index: number) => {
    setStack(currentStack => {
      if (index < 0 || index >= currentStack.length) {
        return currentStack
      }
      return currentStack.slice(0, index + 1)
    })
  }, [])

  // Set sidecar content - clears stack and pushes single item (backwards compatible)
  // Pass null content to hide the sidecar
  // Also expands the sidecar if it was collapsed when setting new content
  // Skips update if the title matches the current single-item stack to prevent infinite loops
  const setSidecar = useCallback((content: ReactNode | null, title?: string, options?: { route?: string }) => {
    if (content === null) {
      // Use functional update to avoid re-render if already empty
      setStack(currentStack => (currentStack.length === 0 ? currentStack : []))
      setIsFocused(focused => (focused ? false : focused))
    } else {
      setStack(currentStack => {
        // Skip update if the base (first) item already has the same title.
        // This prevents useEffect-driven setSidecar calls from wiping
        // pushed content (e.g. export sidecar pushed on top of Info).
        if (currentStack.length >= 1 && currentStack[0].title === (title ?? "")) {
          // Update the base item content in-place, preserving pushed items
          const updated = [...currentStack]
          updated[0] = { ...updated[0], content, route: options?.route }
          return updated
        }
        return [
          {
            id: generateSidecarId(),
            title: title ?? "",
            content,
            route: options?.route,
          },
        ]
      })
      setIsCollapsed(false)
    }
  }, [])

  // Clear the sidecar entirely (empties stack)
  // Uses functional update to avoid re-render if already empty
  const clearSidecar = useCallback(() => {
    setStack(currentStack => (currentStack.length === 0 ? currentStack : []))
    setIsFocused(focused => (focused ? false : focused))
  }, [])

  const replaceSidecarStack = useCallback(
    (items: Array<{ title: string; content: ReactNode; route?: string }>) => {
      setStack(items.map(item => ({ id: generateSidecarId(), ...item })))
      setIsCollapsed(false)
    },
    []
  )

  // Update the title of the current (last) sidecar item
  const updateSidecarTitle = useCallback((title: string) => {
    setStack(currentStack => {
      if (currentStack.length === 0) return currentStack
      const newStack = [...currentStack]
      const lastIndex = newStack.length - 1
      newStack[lastIndex] = { ...newStack[lastIndex], title }
      return newStack
    })
  }, [])

  const setFocused = useCallback((focused: boolean) => {
    setIsFocused(focused)
  }, [])

  // Toggle sidecar visibility (collapse/expand)
  const toggleSidecarVisibility = useCallback(() => {
    if (isCollapseDisabled) {
      return
    }
    setIsCollapsed(collapsed => !collapsed)
  }, [isCollapseDisabled])

  const setCollapseDisabled = useCallback((disabled: boolean) => {
    setIsCollapseDisabled(disabled)
    if (disabled) {
      setIsCollapsed(false)
    }
  }, [])

  // Set layout mode and persist to local preferences
  const setLayoutMode = useCallback(
    (mode: LayoutMode) => {
      setLayoutModeState(mode)
      // Persist to local preferences if service is available
      if (preferencesService) {
        preferencesService.setLayoutMode(mode)
      }
    },
    [preferencesService]
  )

  const value: SidecarProviderValue = {
    stack,
    pushSidecar,
    popSidecar,
    navigateToStackIndex,
    setSidecar,
    clearSidecar,
    replaceSidecarStack,
    updateSidecarTitle,
    isFocused,
    setFocused,
    isCollapsed,
    isCollapseDisabled,
    setCollapseDisabled,
    toggleSidecarVisibility,
    layoutMode,
    setLayoutMode,
  }

  return <SidecarProviderContext.Provider value={value}>{children}</SidecarProviderContext.Provider>
}
