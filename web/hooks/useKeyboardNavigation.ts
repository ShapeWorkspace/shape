import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useWindowStore } from "../store/window-store"
import { useSidecar } from "../contexts/SidecarContext"
import { useCommandPalette } from "../contexts/CommandPaletteContext"
import { useEngineStore } from "../store/engine-store"

/**
 * Hook for global keyboard navigation shortcuts.
 * Currently handles:
 * - Cmd+K / Ctrl+K: Open command palette
 * - Backspace: Navigate back in the current window's stack (when not in an input, and sidecar not focused)
 * - H: Navigate to home/root (when not in an input)
 */
export function useKeyboardNavigation() {
  const navigate = useNavigate()
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const { windows, activeWindowId, navigateBack, navigateHome } = useWindowStore()
  const { isFocused: sidecarIsFocused } = useSidecar()
  const { toggle: toggleCommandPalette } = useCommandPalette()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable

      // Cmd+K / Ctrl+K to toggle command palette (works even in inputs)
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        toggleCommandPalette()
        return
      }

      // Skip remaining shortcuts if focused on an input
      if (isInput) return

      const activeWindow = windows.find(w => w.id === activeWindowId)

      // Backspace to go back (when not in an input, and sidecar not focused)
      // When sidecar is focused, it handles its own Backspace navigation
      if (e.key === "Backspace" && !sidecarIsFocused && activeWindow && activeWindow.stack.length >= 1) {
        e.preventDefault()
        navigateBack()
      }

      // H to go home (when not in an input)
      if (e.key === "h" || e.key === "H") {
        e.preventDefault()
        navigateHome()
        if (workspaceId) {
          navigate(`/w/${workspaceId}`)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    windows,
    activeWindowId,
    navigateBack,
    navigateHome,
    navigate,
    workspaceId,
    sidecarIsFocused,
    toggleCommandPalette,
  ])
}
