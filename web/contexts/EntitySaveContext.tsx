/**
 * EntitySaveContext tracks save state for any entity type (notes, papers, tasks, etc.).
 *
 * Provides a centralized way for editors to report saving state and for sidecars
 * to display "Last saved" information with a spinner during saves.
 *
 * Features:
 * - Tracks save state per entity (by type + ID)
 * - Enforces minimum spinner duration (1s) to prevent flickering
 * - Auto-cleans stale entries to prevent memory leaks
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"

// Minimum duration to show the saving spinner to prevent flickering
const SAVING_SPINNER_MIN_DURATION_MS = 1000

// Clean up entries older than 5 minutes to prevent memory leaks
const STALE_ENTRY_CLEANUP_MS = 5 * 60 * 1000

interface EntitySaveState {
  // Whether save is currently in flight (respects minimum spinner duration)
  isSaving: boolean
  // Timestamp of last successful save completion (null if never saved in this session)
  lastSavedAt: number | null
}

// Internal state stored per entity
interface InternalEntitySaveState extends EntitySaveState {
  // When saving started (for minimum duration enforcement)
  savingStartTime: number | null
  // Timer for delayed state transition
  timerId: ReturnType<typeof setTimeout> | null
}

interface EntitySaveContextValue {
  // Get current save state for an entity
  getSaveState: (entityType: string, entityId: string) => EntitySaveState
  // Report that saving has started for an entity
  reportSavingStarted: (entityType: string, entityId: string) => void
  // Report that saving has completed for an entity
  reportSavingCompleted: (entityType: string, entityId: string) => void
  // Clear save state for an entity (e.g., when navigating away)
  clearSaveState: (entityType: string, entityId: string) => void
}

const EntitySaveContext = createContext<EntitySaveContextValue | null>(null)

function createEntityKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`
}

const DEFAULT_SAVE_STATE: EntitySaveState = {
  isSaving: false,
  lastSavedAt: null,
}

export function EntitySaveProvider({ children }: { children: React.ReactNode }) {
  // Map of entity key -> save state
  const [stateMap, setStateMap] = useState<Map<string, InternalEntitySaveState>>(new Map())

  // Keep a ref to timers for cleanup
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Cleanup all timers on unmount
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer)
      }
    }
  }, [])

  // Periodic cleanup of stale entries
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now()
      setStateMap(prev => {
        const next = new Map(prev)
        let changed = false
        for (const [key, state] of next) {
          // Remove entries that haven't been saved recently and aren't saving
          if (!state.isSaving && state.lastSavedAt && now - state.lastSavedAt > STALE_ENTRY_CLEANUP_MS) {
            next.delete(key)
            changed = true
          }
        }
        return changed ? next : prev
      })
    }, STALE_ENTRY_CLEANUP_MS)

    return () => clearInterval(cleanupInterval)
  }, [])

  const getSaveState = useCallback(
    (entityType: string, entityId: string): EntitySaveState => {
      const key = createEntityKey(entityType, entityId)
      const state = stateMap.get(key)
      if (!state) {
        return DEFAULT_SAVE_STATE
      }
      return { isSaving: state.isSaving, lastSavedAt: state.lastSavedAt }
    },
    [stateMap]
  )

  const reportSavingStarted = useCallback((entityType: string, entityId: string) => {
    const key = createEntityKey(entityType, entityId)

    // Clear any pending timer for this entity
    const existingTimer = timersRef.current.get(key)
    if (existingTimer) {
      clearTimeout(existingTimer)
      timersRef.current.delete(key)
    }

    setStateMap(prev => {
      const next = new Map(prev)
      const existing = prev.get(key)
      next.set(key, {
        isSaving: true,
        lastSavedAt: existing?.lastSavedAt ?? null,
        savingStartTime: Date.now(),
        timerId: null,
      })
      return next
    })
  }, [])

  const reportSavingCompleted = useCallback((entityType: string, entityId: string) => {
    const key = createEntityKey(entityType, entityId)

    setStateMap(prev => {
      const state = prev.get(key)
      if (!state) {
        // No state exists, just set lastSavedAt
        const next = new Map(prev)
        next.set(key, {
          isSaving: false,
          lastSavedAt: Date.now(),
          savingStartTime: null,
          timerId: null,
        })
        return next
      }

      const now = Date.now()
      const startTime = state.savingStartTime ?? now
      const elapsed = now - startTime
      const remainingMinDuration = Math.max(0, SAVING_SPINNER_MIN_DURATION_MS - elapsed)

      if (remainingMinDuration > 0) {
        // Schedule delayed transition
        const timerId = setTimeout(() => {
          timersRef.current.delete(key)
          setStateMap(prevInner => {
            const next = new Map(prevInner)
            next.set(key, {
              isSaving: false,
              lastSavedAt: Date.now(),
              savingStartTime: null,
              timerId: null,
            })
            return next
          })
        }, remainingMinDuration)

        timersRef.current.set(key, timerId)

        // Keep isSaving true for now, timer will clear it
        const next = new Map(prev)
        next.set(key, {
          ...state,
          timerId,
        })
        return next
      }

      // Minimum duration passed, transition immediately
      const next = new Map(prev)
      next.set(key, {
        isSaving: false,
        lastSavedAt: now,
        savingStartTime: null,
        timerId: null,
      })
      return next
    })
  }, [])

  const clearSaveState = useCallback((entityType: string, entityId: string) => {
    const key = createEntityKey(entityType, entityId)

    // Clear any pending timer
    const existingTimer = timersRef.current.get(key)
    if (existingTimer) {
      clearTimeout(existingTimer)
      timersRef.current.delete(key)
    }

    setStateMap(prev => {
      if (!prev.has(key)) {
        return prev
      }
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }, [])

  const value = useMemo<EntitySaveContextValue>(
    () => ({
      getSaveState,
      reportSavingStarted,
      reportSavingCompleted,
      clearSaveState,
    }),
    [getSaveState, reportSavingStarted, reportSavingCompleted, clearSaveState]
  )

  return <EntitySaveContext.Provider value={value}>{children}</EntitySaveContext.Provider>
}

export function useEntitySave(): EntitySaveContextValue {
  const context = useContext(EntitySaveContext)
  if (!context) {
    throw new Error("useEntitySave must be used within EntitySaveProvider")
  }
  return context
}
