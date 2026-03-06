/**
 * useDebouncedSave provides debounced persistence for batched updates.
 *
 * Features:
 * - Collects updates into a pending queue
 * - Debounces save calls by the specified delay
 * - Tracks saving state for UI feedback
 * - Flushes pending updates immediately on demand (e.g., unmount)
 */

import { useRef, useCallback, useState } from "react"

interface UseDebouncedSaveOptions<T> {
  // Delay in ms before save is triggered after last update.
  debounceMs: number
  // Function to persist the batched updates. Receives all pending items.
  onSave: (pending: T[]) => Promise<void>
}

interface UseDebouncedSaveResult<T> {
  // Call this to queue an update. Save will be scheduled after debounce delay.
  queueUpdate: (update: T) => void
  // Immediately flush all pending updates (cancels any scheduled save).
  flushNow: () => Promise<void>
  // True while a save operation is actively in progress (not during debounce).
  isSaving: boolean
  // Number of updates currently queued.
  pendingCount: number
}

export function useDebouncedSave<T>({
  debounceMs,
  onSave,
}: UseDebouncedSaveOptions<T>): UseDebouncedSaveResult<T> {
  const pendingRef = useRef<T[]>([])
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  // Store latest onSave in ref to avoid stale closure issues.
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  const executeSave = useCallback(async () => {
    if (pendingRef.current.length === 0) {
      setIsSaving(false)
      return
    }

    // Mark as saving now that debounce period is over and we're actually persisting.
    setIsSaving(true)

    // Capture and clear pending updates before async operation.
    const toSave = pendingRef.current
    pendingRef.current = []
    setPendingCount(0)

    try {
      await onSaveRef.current(toSave)
    } catch (err) {
      // Re-queue failed updates at the front so they retry.
      pendingRef.current = [...toSave, ...pendingRef.current]
      setPendingCount(pendingRef.current.length)
      console.error("Debounced save failed:", err)
    } finally {
      // Always clear isSaving after save completes. If there are pending updates,
      // they'll trigger a new debounce cycle and isSaving will be set again when
      // that save starts.
      setIsSaving(false)
    }
  }, [])

  const scheduleSave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null
      executeSave()
    }, debounceMs)
  }, [debounceMs, executeSave])

  const queueUpdate = useCallback(
    (update: T) => {
      pendingRef.current.push(update)
      setPendingCount(pendingRef.current.length)
      scheduleSave()
    },
    [scheduleSave]
  )

  const flushNow = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    await executeSave()
  }, [executeSave])

  return {
    queueUpdate,
    flushNow,
    isSaving,
    pendingCount,
  }
}
