import { renderHook, act } from "@testing-library/react"
import { useDebouncedSave } from "./useDebouncedSave"

describe("useDebouncedSave", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("does not save immediately when update is queued", () => {
    const onSave = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() => useDebouncedSave({ debounceMs: 500, onSave }))

    act(() => {
      result.current.queueUpdate("update-1")
    })

    // Save should not be called immediately.
    expect(onSave).not.toHaveBeenCalled()
    // isSaving is false during debounce period - only true during actual save.
    expect(result.current.isSaving).toBe(false)
    expect(result.current.pendingCount).toBe(1)
  })

  it("saves after debounce delay", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() => useDebouncedSave({ debounceMs: 500, onSave }))

    act(() => {
      result.current.queueUpdate("update-1")
    })

    // Advance time past debounce delay.
    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith(["update-1"])
  })

  it("batches multiple rapid updates into single save", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() => useDebouncedSave({ debounceMs: 500, onSave }))

    // Queue multiple updates rapidly (within debounce window).
    act(() => {
      result.current.queueUpdate("update-1")
    })

    act(() => {
      vi.advanceTimersByTime(200)
    })

    act(() => {
      result.current.queueUpdate("update-2")
    })

    act(() => {
      vi.advanceTimersByTime(200)
    })

    act(() => {
      result.current.queueUpdate("update-3")
    })

    // Still within debounce window - no save yet.
    expect(onSave).not.toHaveBeenCalled()
    expect(result.current.pendingCount).toBe(3)

    // Advance past debounce delay from last update.
    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    // All updates batched into single save call.
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith(["update-1", "update-2", "update-3"])
  })

  it("resets debounce timer on each new update", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() => useDebouncedSave({ debounceMs: 500, onSave }))

    act(() => {
      result.current.queueUpdate("update-1")
    })

    // Advance 400ms (just under debounce).
    act(() => {
      vi.advanceTimersByTime(400)
    })

    expect(onSave).not.toHaveBeenCalled()

    // Queue another update - this should reset the timer.
    act(() => {
      result.current.queueUpdate("update-2")
    })

    // Advance another 400ms - still not enough from second update.
    act(() => {
      vi.advanceTimersByTime(400)
    })

    expect(onSave).not.toHaveBeenCalled()

    // Advance remaining 100ms to complete debounce from second update.
    await act(async () => {
      vi.advanceTimersByTime(100)
    })

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith(["update-1", "update-2"])
  })

  it("flushNow immediately persists pending updates", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() => useDebouncedSave({ debounceMs: 500, onSave }))

    act(() => {
      result.current.queueUpdate("update-1")
      result.current.queueUpdate("update-2")
    })

    expect(onSave).not.toHaveBeenCalled()

    // Flush immediately without waiting for debounce.
    await act(async () => {
      await result.current.flushNow()
    })

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith(["update-1", "update-2"])
  })

  it("flushNow cancels scheduled debounced save", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() => useDebouncedSave({ debounceMs: 500, onSave }))

    act(() => {
      result.current.queueUpdate("update-1")
    })

    // Flush immediately.
    await act(async () => {
      await result.current.flushNow()
    })

    expect(onSave).toHaveBeenCalledTimes(1)

    // Advance past original debounce time - should not trigger another save.
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it("isSaving is only true during actual save operation", async () => {
    let resolveSave: () => void
    const savePromise = new Promise<void>(resolve => {
      resolveSave = resolve
    })
    const onSave = vi.fn().mockReturnValue(savePromise)

    const { result } = renderHook(() => useDebouncedSave({ debounceMs: 500, onSave }))

    act(() => {
      result.current.queueUpdate("update-1")
    })

    // During debounce period, isSaving should be false.
    expect(result.current.isSaving).toBe(false)
    expect(result.current.pendingCount).toBe(1)

    // Trigger the save by advancing past debounce.
    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    // Now save is in progress, isSaving should be true.
    expect(result.current.isSaving).toBe(true)
    expect(onSave).toHaveBeenCalledTimes(1)

    // Complete the save.
    await act(async () => {
      resolveSave!()
    })

    // After save completes, isSaving should be false.
    expect(result.current.isSaving).toBe(false)
    expect(result.current.pendingCount).toBe(0)
  })

  it("re-queues updates on save failure", async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error("Network error")).mockResolvedValueOnce(undefined)

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const { result } = renderHook(() => useDebouncedSave({ debounceMs: 500, onSave }))

    act(() => {
      result.current.queueUpdate("update-1")
    })

    // First save attempt fails.
    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(onSave).toHaveBeenCalledTimes(1)
    // Updates should be re-queued after failure.
    expect(result.current.pendingCount).toBe(1)
    // isSaving is false after save completes (even on failure) - we're back in debounce state.
    expect(result.current.isSaving).toBe(false)

    consoleSpy.mockRestore()
  })

  it("handles concurrent updates during save operation", async () => {
    let resolveSave: () => void
    let savePromise = new Promise<void>(resolve => {
      resolveSave = resolve
    })
    const onSave = vi.fn().mockImplementation(() => savePromise)

    const { result } = renderHook(() => useDebouncedSave({ debounceMs: 500, onSave }))

    act(() => {
      result.current.queueUpdate("update-1")
    })

    // Trigger first save.
    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(result.current.isSaving).toBe(true)

    // Queue new update while save is in progress.
    act(() => {
      result.current.queueUpdate("update-2")
    })

    // Complete first save.
    await act(async () => {
      resolveSave!()
    })

    // isSaving is false after save completes - we're back in debounce state for new update.
    expect(result.current.isSaving).toBe(false)
    expect(result.current.pendingCount).toBe(1)

    // Set up new promise for second save.
    savePromise = new Promise<void>(resolve => {
      resolveSave = resolve
    })

    // Advance to trigger second save.
    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(onSave).toHaveBeenCalledTimes(2)
    expect(onSave).toHaveBeenLastCalledWith(["update-2"])
    expect(result.current.isSaving).toBe(true)

    // Complete second save.
    await act(async () => {
      resolveSave!()
    })

    expect(result.current.isSaving).toBe(false)
    expect(result.current.pendingCount).toBe(0)
  })
})
