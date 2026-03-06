/**
 * CommandPaletteContext
 *
 * Provides global state for the command palette (Cmd+K).
 * Allows any component to open/close the palette.
 */

import { createContext, useContext, useState, useCallback, ReactNode } from "react"

/**
 * Context value for command palette state and controls.
 */
interface CommandPaletteContextValue {
  /** Whether the command palette is currently open */
  isOpen: boolean
  /** Open the command palette */
  open: () => void
  /** Close the command palette */
  close: () => void
  /** Toggle the command palette open/closed */
  toggle: () => void
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null)

/**
 * Hook to access command palette controls.
 * Must be used within a CommandPaletteProvider.
 *
 * @example
 * ```tsx
 * const { isOpen, open, close, toggle } = useCommandPalette()
 *
 * // Open palette programmatically
 * const handleClick = () => open()
 *
 * // Toggle with keyboard shortcut
 * useEffect(() => {
 *   const handleKeyDown = (e: KeyboardEvent) => {
 *     if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
 *       e.preventDefault()
 *       toggle()
 *     }
 *   }
 *   window.addEventListener('keydown', handleKeyDown)
 *   return () => window.removeEventListener('keydown', handleKeyDown)
 * }, [toggle])
 * ```
 */
export function useCommandPalette(): CommandPaletteContextValue {
  const context = useContext(CommandPaletteContext)
  if (!context) {
    throw new Error("useCommandPalette must be used within a CommandPaletteProvider")
  }
  return context
}

/**
 * Props for the CommandPaletteProvider component.
 */
interface CommandPaletteProviderProps {
  children: ReactNode
}

/**
 * Provider component for command palette state.
 * Wrap your app (or workspace layout) with this provider.
 */
export function CommandPaletteProvider({ children }: CommandPaletteProviderProps) {
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => {
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  const toggle = useCallback(() => {
    setIsOpen(prev => !prev)
  }, [])

  const value: CommandPaletteContextValue = {
    isOpen,
    open,
    close,
    toggle,
  }

  return <CommandPaletteContext.Provider value={value}>{children}</CommandPaletteContext.Provider>
}
