import { createContext, useContext, useState, useCallback, ReactNode } from "react"

/**
 * FocusArea represents which part of the UI currently has keyboard focus.
 * - 'sidebar': The navigation drawer on the left
 * - 'content': The main content/tool area
 * - 'sidecar': The sidecar panel on the right
 */
export type FocusArea = "sidebar" | "content" | "sidecar"

interface FocusContextValue {
  // Which area currently has focus
  focusArea: FocusArea
  // Set the focused area
  setFocusArea: (area: FocusArea) => void
  // Convenience checks
  isSidebarFocused: boolean
  isContentFocused: boolean
  isSidecarFocused: boolean
}

const FocusContext = createContext<FocusContextValue | null>(null)

/**
 * Hook to access focus context.
 * Returns the current focus area and methods to change it.
 */
export function useFocus(): FocusContextValue {
  const context = useContext(FocusContext)
  if (!context) {
    throw new Error("useFocus must be used within FocusProvider")
  }
  return context
}

/**
 * Safe version of useFocus that returns default values when outside FocusProvider.
 * Used by components that may be rendered outside of the main layout.
 */
export function useFocusSafe(): FocusContextValue {
  const context = useContext(FocusContext)
  if (!context) {
    // Default to content focused when outside provider
    return {
      focusArea: "content",
      setFocusArea: () => {},
      isSidebarFocused: false,
      isContentFocused: true,
      isSidecarFocused: false,
    }
  }
  return context
}

interface FocusProviderProps {
  children: ReactNode
}

/**
 * FocusProvider manages which area of the UI has keyboard focus.
 * Place this at the root layout level.
 */
export function FocusProvider({ children }: FocusProviderProps) {
  const [focusArea, setFocusAreaState] = useState<FocusArea>("content")

  const setFocusArea = useCallback((area: FocusArea) => {
    setFocusAreaState(area)
  }, [])

  const value: FocusContextValue = {
    focusArea,
    setFocusArea,
    isSidebarFocused: focusArea === "sidebar",
    isContentFocused: focusArea === "content",
    isSidecarFocused: focusArea === "sidecar",
  }

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>
}
