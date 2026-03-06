import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react"

/**
 * MobileDrawerContext manages the open/close state of mobile drawers (sidebar and sidecar).
 *
 * Key behaviors:
 * - Only one drawer can be open at a time (opening one closes the other)
 * - Closing animations are handled via `closing` flags before unmounting
 * - Escape key closes any open drawer
 * - Timeout synced with CSS animation duration (280ms)
 */

// Animation duration must match CSS keyframe duration in mobile-drawer.css.ts
const DRAWER_ANIMATION_DURATION_MS = 280

interface MobileDrawerContextValue {
  // Sidebar drawer state
  isSidebarDrawerOpen: boolean
  sidebarClosing: boolean
  openSidebarDrawer: () => void
  closeSidebarDrawer: () => void

  // Sidecar drawer state
  isSidecarDrawerOpen: boolean
  sidecarClosing: boolean
  openSidecarDrawer: () => void
  closeSidecarDrawer: () => void

  // Close all drawers (for overlay tap or navigation)
  closeAllDrawers: () => void
}

const MobileDrawerContext = createContext<MobileDrawerContextValue | null>(null)

interface MobileDrawerProviderProps {
  children: ReactNode
}

export function MobileDrawerProvider({ children }: MobileDrawerProviderProps) {
  const [isSidebarDrawerOpen, setIsSidebarDrawerOpen] = useState(false)
  const [isSidecarDrawerOpen, setIsSidecarDrawerOpen] = useState(false)
  const [sidebarClosing, setSidebarClosing] = useState(false)
  const [sidecarClosing, setSidecarClosing] = useState(false)

  // Refs to track animation timeouts for cleanup
  const sidebarTimeoutRef = useRef<number | null>(null)
  const sidecarTimeoutRef = useRef<number | null>(null)

  // Clear timeout helper
  const clearSidebarTimeout = useCallback(() => {
    if (sidebarTimeoutRef.current !== null) {
      window.clearTimeout(sidebarTimeoutRef.current)
      sidebarTimeoutRef.current = null
    }
  }, [])

  const clearSidecarTimeout = useCallback(() => {
    if (sidecarTimeoutRef.current !== null) {
      window.clearTimeout(sidecarTimeoutRef.current)
      sidecarTimeoutRef.current = null
    }
  }, [])

  // Close sidebar drawer with animation
  const closeSidebarDrawer = useCallback(() => {
    if (!isSidebarDrawerOpen || sidebarClosing) return

    setSidebarClosing(true)
    clearSidebarTimeout()

    sidebarTimeoutRef.current = window.setTimeout(() => {
      setIsSidebarDrawerOpen(false)
      setSidebarClosing(false)
    }, DRAWER_ANIMATION_DURATION_MS)
  }, [isSidebarDrawerOpen, sidebarClosing, clearSidebarTimeout])

  // Close sidecar drawer with animation
  const closeSidecarDrawer = useCallback(() => {
    if (!isSidecarDrawerOpen || sidecarClosing) return

    setSidecarClosing(true)
    clearSidecarTimeout()

    sidecarTimeoutRef.current = window.setTimeout(() => {
      setIsSidecarDrawerOpen(false)
      setSidecarClosing(false)
    }, DRAWER_ANIMATION_DURATION_MS)
  }, [isSidecarDrawerOpen, sidecarClosing, clearSidecarTimeout])

  // Open sidebar drawer (closes sidecar if open)
  const openSidebarDrawer = useCallback(() => {
    // Close sidecar immediately without animation if switching
    if (isSidecarDrawerOpen) {
      clearSidecarTimeout()
      setIsSidecarDrawerOpen(false)
      setSidecarClosing(false)
    }

    clearSidebarTimeout()
    setSidebarClosing(false)
    setIsSidebarDrawerOpen(true)
  }, [isSidecarDrawerOpen, clearSidebarTimeout, clearSidecarTimeout])

  // Open sidecar drawer (closes sidebar if open)
  const openSidecarDrawer = useCallback(() => {
    // Close sidebar immediately without animation if switching
    if (isSidebarDrawerOpen) {
      clearSidebarTimeout()
      setIsSidebarDrawerOpen(false)
      setSidebarClosing(false)
    }

    clearSidecarTimeout()
    setSidecarClosing(false)
    setIsSidecarDrawerOpen(true)
  }, [isSidebarDrawerOpen, clearSidebarTimeout, clearSidecarTimeout])

  // Close all drawers
  const closeAllDrawers = useCallback(() => {
    if (isSidebarDrawerOpen) {
      closeSidebarDrawer()
    }
    if (isSidecarDrawerOpen) {
      closeSidecarDrawer()
    }
  }, [isSidebarDrawerOpen, isSidecarDrawerOpen, closeSidebarDrawer, closeSidecarDrawer])

  // Handle Escape key to close drawers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isSidebarDrawerOpen || isSidecarDrawerOpen) {
          e.preventDefault()
          closeAllDrawers()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isSidebarDrawerOpen, isSidecarDrawerOpen, closeAllDrawers])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      clearSidebarTimeout()
      clearSidecarTimeout()
    }
  }, [clearSidebarTimeout, clearSidecarTimeout])

  const value: MobileDrawerContextValue = {
    isSidebarDrawerOpen,
    sidebarClosing,
    openSidebarDrawer,
    closeSidebarDrawer,
    isSidecarDrawerOpen,
    sidecarClosing,
    openSidecarDrawer,
    closeSidecarDrawer,
    closeAllDrawers,
  }

  return <MobileDrawerContext.Provider value={value}>{children}</MobileDrawerContext.Provider>
}

/**
 * Hook to access mobile drawer state and controls.
 * Must be used within a MobileDrawerProvider.
 */
export function useMobileDrawer(): MobileDrawerContextValue {
  const context = useContext(MobileDrawerContext)
  if (!context) {
    throw new Error("useMobileDrawer must be used within a MobileDrawerProvider")
  }
  return context
}
