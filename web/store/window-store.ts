import { create } from "zustand"
import { WindowTab, BreadcrumbItem, ToolType } from "./types"
import { parseWindowLocationFromUrl, type ParsedWindowLocation } from "../utils/window-navigation"
import { encodeSidecarRouteForQueryParam } from "../router/sidecar-routing"
import { TOOL_LABELS } from "../constants/tool-labels"

const generateId = () => Math.random().toString(36).substring(2, 11)

// localStorage key pattern for workspace-scoped window state
const getWindowsStorageKey = (workspaceId: string) => `shape_windows_${workspaceId}`

const WINDOW_STATE_SAVE_DEBOUNCE_MS = 150
const windowStateSaveDebounceTimersByWorkspaceId = new Map<string, ReturnType<typeof setTimeout>>()

const scheduleWindowStatePersistence = (
  workspaceId: string,
  persistedState: PersistedWindowState
): void => {
  const existingTimer = windowStateSaveDebounceTimersByWorkspaceId.get(workspaceId)
  if (existingTimer) {
    clearTimeout(existingTimer)
  }

  const nextTimer = setTimeout(() => {
    windowStateSaveDebounceTimersByWorkspaceId.delete(workspaceId)

    try {
      // Persist after the navigation state update so UI transitions are not blocked by localStorage.
      localStorage.setItem(getWindowsStorageKey(workspaceId), JSON.stringify(persistedState))
    } catch (error) {
      console.warn("Failed to save windows to localStorage:", error)
    }
  }, WINDOW_STATE_SAVE_DEBOUNCE_MS)

  windowStateSaveDebounceTimersByWorkspaceId.set(workspaceId, nextTimer)
}

/**
 * Serializable window state for persistence.
 * We store a simplified version without transient state.
 */
interface PersistedWindowState {
  windows: WindowTab[]
  activeWindowId: string | null
}

/**
 * WindowStore manages multi-window navigation and URL synchronization.
 * Each window has its own navigation stack (breadcrumbs).
 * Windows are workspace-scoped and persist to localStorage.
 */
interface WindowState {
  windows: WindowTab[]
  activeWindowId: string | null
  currentWorkspaceId: string | null
}

interface WindowActions {
  // Create a new window, optionally with an initial tool
  createWindow: (tool?: ToolType, itemId?: string, locationState?: ParsedWindowLocation) => string
  // Create a new window from a URL path (e.g., /w/{workspaceId}/projects/{projectId}/tasks/{taskId})
  createWindowFromPath: (path: string) => string
  // Close a window by ID
  closeWindow: (windowId: string) => void
  // Set a window as active
  setActiveWindow: (windowId: string) => void
  // Navigate to an item within the active window (push to stack)
  navigateTo: (item: BreadcrumbItem) => void
  // Navigate to an item, replacing the last item if both are at the same terminus level
  // (e.g., both have taskId set with same itemId). Used for selecting different items at leaf level.
  navigateToOrReplace: (item: BreadcrumbItem) => void
  // Navigate back within the active window (pop from stack)
  navigateBack: () => void
  // Navigate to home (clear the stack for the active window)
  navigateHome: () => void
  // Get the active window
  getActiveWindow: () => WindowTab | undefined
  // Get the current breadcrumb item for the active window
  getCurrentItem: () => BreadcrumbItem | undefined
  // Update the label of the current breadcrumb item (e.g., when note title changes)
  updateCurrentItemLabel: (label: string) => void
  // Update contextual fields on the current breadcrumb item (e.g., commentId for deep links)
  updateCurrentItemContext: (updates: { commentId?: string | null }) => void
  // Sync window state from URL (called when URL changes externally)
  syncFromUrl: (locationState: ParsedWindowLocation | null) => void
  // Build URL path for the active window
  buildUrlPath: (workspaceId: string, sidecarRoute?: string | null) => string
  // Save windows for a workspace to localStorage
  saveWindowsForWorkspace: (workspaceId: string) => void
  // Load windows for a workspace from localStorage
  loadWindowsForWorkspace: (workspaceId: string) => void
  // Reset windows for a workspace (discard persisted state and start at root)
  resetWindowsForWorkspace: (workspaceId: string) => void
  // Clear all windows (used when switching workspaces)
  clearWindows: () => void
  // Set current workspace ID (tracks which workspace windows belong to)
  setCurrentWorkspaceId: (workspaceId: string | null) => void
}

export type WindowStore = WindowState & WindowActions

export const useWindowStore = create<WindowStore>((set, get) => ({
  windows: [],
  activeWindowId: null,
  currentWorkspaceId: null,

  createWindow: (tool?: ToolType, itemId?: string, locationState?: ParsedWindowLocation) => {
    const windowId = generateId()
    // Normalize initial window state so deep links (tasks/discussions) preserve extra fields.
    const effectiveLocationState = locationState ?? (tool ? { tool, itemId } : null)
    const stack: BreadcrumbItem[] = effectiveLocationState
      ? [
          {
            id: generateId(),
            label: TOOL_LABELS[effectiveLocationState.tool],
          tool: effectiveLocationState.tool,
          itemId: effectiveLocationState.itemId,
          taskId: effectiveLocationState.taskId,
          commentId: effectiveLocationState.commentId,
          discussionId: effectiveLocationState.discussionId,
          folderId: effectiveLocationState.folderId,
          itemType: effectiveLocationState.itemType,
        },
        ]
      : []

    const newWindow: WindowTab = {
      id: windowId,
      tool: effectiveLocationState?.tool ?? null,
      stack,
      isActive: true,
    }

    set(state => ({
      windows: [newWindow, ...state.windows.map(w => ({ ...w, isActive: false }))],
      activeWindowId: windowId,
    }))

    // Save immediately
    const { currentWorkspaceId, saveWindowsForWorkspace } = get()
    if (currentWorkspaceId) {
      saveWindowsForWorkspace(currentWorkspaceId)
    }

    return windowId
  },

  /**
   * Create a new window from a URL path.
   * Parses paths like:
   * - /w/{workspaceId}/projects/{projectId}/tasks/{taskId}
   * - /w/{workspaceId}/forum/{channelId}/{discussionId}
   * - /w/{workspaceId}/{tool}/{itemId}
   */
  createWindowFromPath: (path: string) => {
    const [pathname, search = ""] = path.split("?")
    const normalizedSearch = search ? `?${search}` : ""
    const parsedLocation = parseWindowLocationFromUrl(pathname, normalizedSearch)
    if (!parsedLocation) {
      return get().createWindow()
    }

    return get().createWindow(parsedLocation.tool, parsedLocation.itemId, parsedLocation)
  },

  closeWindow: (windowId: string) => {
    set(state => {
      const filtered = state.windows.filter(w => w.id !== windowId)
      const newActiveId = filtered.length > 0 ? filtered[filtered.length - 1].id : null
      return {
        windows: filtered.map(w => ({ ...w, isActive: w.id === newActiveId })),
        activeWindowId: newActiveId,
      }
    })

    // Save immediately
    const { currentWorkspaceId, saveWindowsForWorkspace } = get()
    if (currentWorkspaceId) {
      saveWindowsForWorkspace(currentWorkspaceId)
    }
  },

  setActiveWindow: (windowId: string) => {
    set(state => ({
      windows: state.windows.map(w => ({ ...w, isActive: w.id === windowId })),
      activeWindowId: windowId,
    }))

    // Save immediately
    const { currentWorkspaceId, saveWindowsForWorkspace } = get()
    if (currentWorkspaceId) {
      saveWindowsForWorkspace(currentWorkspaceId)
    }
  },

  // Navigate to an item within the active window (push to stack)
  navigateTo: (item: BreadcrumbItem) => {
    const { activeWindowId } = get()
    if (!activeWindowId) return

    set(state => ({
      windows: state.windows.map(w =>
        w.id === activeWindowId ? { ...w, stack: [...w.stack, item], tool: item.tool } : w
      ),
    }))

    // Save immediately
    const { currentWorkspaceId, saveWindowsForWorkspace } = get()
    if (currentWorkspaceId) {
      saveWindowsForWorkspace(currentWorkspaceId)
    }
  },

  // Navigate to an item, replacing the last item if both are at the same terminus level.
  // This prevents stacking multiple sibling selections (e.g., selecting task A then task B
  // should result in [Tasks, Project, Task B], not [Tasks, Project, Task A, Task B]).
  navigateToOrReplace: (item: BreadcrumbItem) => {
    const { activeWindowId } = get()
    if (!activeWindowId) return

    set(state => ({
      windows: state.windows.map(w => {
        if (w.id !== activeWindowId) return w

        const lastItem = w.stack[w.stack.length - 1]

        // Check if both items are at the same terminus level (e.g., both have taskId with same itemId).
        // If so, replace the last item instead of pushing.
        const shouldReplace =
          lastItem &&
          item.taskId &&
          lastItem.taskId &&
          item.itemId === lastItem.itemId &&
          item.tool === lastItem.tool

        if (shouldReplace) {
          // Replace the last item
          const newStack = [...w.stack.slice(0, -1), item]
          return { ...w, stack: newStack, tool: item.tool }
        } else {
          // Push as normal
          return { ...w, stack: [...w.stack, item], tool: item.tool }
        }
      }),
    }))

    // Save immediately
    const { currentWorkspaceId, saveWindowsForWorkspace } = get()
    if (currentWorkspaceId) {
      saveWindowsForWorkspace(currentWorkspaceId)
    }
  },

  // Navigate back within the active window (pop from stack)
  navigateBack: () => {
    const { activeWindowId } = get()
    if (!activeWindowId) return

    set(state => ({
      windows: state.windows.map(w => {
        if (w.id !== activeWindowId || w.stack.length === 0) return w
        const newStack = w.stack.slice(0, -1)
        return { ...w, stack: newStack, tool: newStack[newStack.length - 1]?.tool || null }
      }),
    }))

    // Save immediately
    const { currentWorkspaceId, saveWindowsForWorkspace } = get()
    if (currentWorkspaceId) {
      saveWindowsForWorkspace(currentWorkspaceId)
    }
  },

  // Navigate to home (clear the stack for the active window)
  navigateHome: () => {
    const { activeWindowId } = get()
    if (!activeWindowId) return

    set(state => ({
      windows: state.windows.map(w => {
        if (w.id !== activeWindowId) return w
        return { ...w, stack: [], tool: null }
      }),
    }))

    // Save immediately
    const { currentWorkspaceId, saveWindowsForWorkspace } = get()
    if (currentWorkspaceId) {
      saveWindowsForWorkspace(currentWorkspaceId)
    }
  },

  getActiveWindow: () => {
    const { windows, activeWindowId } = get()
    return windows.find(w => w.id === activeWindowId)
  },

  getCurrentItem: () => {
    const activeWindow = get().getActiveWindow()
    if (!activeWindow || activeWindow.stack.length === 0) {
      return undefined
    }
    return activeWindow.stack[activeWindow.stack.length - 1]
  },

  updateCurrentItemLabel: (label: string) => {
    const { activeWindowId } = get()
    if (!activeWindowId) return

    set(state => ({
      windows: state.windows.map(w => {
        if (w.id !== activeWindowId || w.stack.length === 0) return w
        // Update the label of the last item in the stack (current item)
        const newStack = [...w.stack]
        const lastIndex = newStack.length - 1
        newStack[lastIndex] = { ...newStack[lastIndex], label }
        return { ...w, stack: newStack }
      }),
    }))

    // Save immediately
    const { currentWorkspaceId, saveWindowsForWorkspace } = get()
    if (currentWorkspaceId) {
      saveWindowsForWorkspace(currentWorkspaceId)
    }
  },

  updateCurrentItemContext: updates => {
    const { activeWindowId } = get()
    if (!activeWindowId) return

    set(state => ({
      windows: state.windows.map(window => {
        if (window.id !== activeWindowId || window.stack.length === 0) {
          return window
        }

        const currentItem = window.stack[window.stack.length - 1]
        const updatedCommentId =
          updates.commentId === null || updates.commentId === undefined ? undefined : updates.commentId

        const updatedItem = {
          ...currentItem,
          commentId: updatedCommentId,
        }

        return {
          ...window,
          stack: [...window.stack.slice(0, -1), updatedItem],
        }
      }),
    }))

    const { currentWorkspaceId, saveWindowsForWorkspace } = get()
    if (currentWorkspaceId) {
      saveWindowsForWorkspace(currentWorkspaceId)
    }
  },

  syncFromUrl: (locationState: ParsedWindowLocation | null) => {
    const { windows, activeWindowId, createWindow, navigateTo, setActiveWindow } = get()

    // If no windows exist, create one from the URL state
    if (windows.length === 0) {
      if (locationState) {
        createWindow(locationState.tool, locationState.itemId, locationState)
      }
      return
    }

    // Find active window
    const activeWindow = windows.find(w => w.id === activeWindowId)
    if (!activeWindow) {
      // No active window - activate first one and sync
      if (windows.length > 0) {
        setActiveWindow(windows[0].id)
      }
      return
    }

    // Get current state of active window
    const currentItem = activeWindow.stack[activeWindow.stack.length - 1]
    const currentTool = currentItem?.tool
    const currentItemId = currentItem?.itemId
    const currentTaskId = currentItem?.taskId
    const currentCommentId = currentItem?.commentId
    const currentDiscussionId = currentItem?.discussionId
    const currentFolderId = currentItem?.folderId
    const currentItemType = currentItem?.itemType

    if (!locationState) {
      return
    }

    // If URL state matches current state, do nothing
    if (
      currentTool === locationState.tool &&
      currentItemId === locationState.itemId &&
      currentTaskId === locationState.taskId &&
      currentCommentId === locationState.commentId &&
      currentDiscussionId === locationState.discussionId &&
      currentFolderId === locationState.folderId &&
      currentItemType === locationState.itemType
    ) {
      return
    }

    // URL differs from current state - update window to match
    // If navigating to a different tool or item, push to stack
    navigateTo({
      id: generateId(),
      label: TOOL_LABELS[locationState.tool],
      tool: locationState.tool,
      itemId: locationState.itemId,
      taskId: locationState.taskId,
      commentId: locationState.commentId,
      discussionId: locationState.discussionId,
      folderId: locationState.folderId,
      itemType: locationState.itemType,
    })
  },

  buildUrlPath: (workspaceId: string, sidecarRoute?: string | null) => {
    const activeWindow = get().getActiveWindow()
    if (!activeWindow || activeWindow.stack.length === 0) {
      const basePath = `/w/${workspaceId}`
      if (!sidecarRoute) {
        return basePath
      }
      const encodedSidecarRoute = encodeSidecarRouteForQueryParam(sidecarRoute)
      return `${basePath}?sidecar=${encodedSidecarRoute}`
    }

    const currentItem = activeWindow.stack[activeWindow.stack.length - 1]
    const tool = currentItem.tool
    const itemId = currentItem.itemId
    const taskId = currentItem.taskId
    const commentId = currentItem.commentId
    const discussionId = currentItem.discussionId
    const folderId = currentItem.folderId
    const itemType = currentItem.itemType

    // Build base path
    let path = `/w/${workspaceId}/${tool}`
    if (itemId) {
      path += `/${itemId}`
    }

    // For projects tool with taskId, append /tasks/{taskId}
    if (tool === "projects" && taskId) {
      path += `/tasks/${taskId}`
    }

    // For forum tool with discussionId, append /discussions/{discussionId}
    if (tool === "forum" && discussionId) {
      path += `/discussions/${discussionId}`
    }

    // Build query params
    const queryParams: string[] = []
    if (tool === "files" && itemType) {
      queryParams.push(`type=${itemType}`)
    }
    if (folderId) {
      queryParams.push(`folder=${folderId}`)
    }
    if (commentId) {
      queryParams.push(`commentId=${commentId}`)
    }
    if (sidecarRoute) {
      const encodedSidecarRoute = encodeSidecarRouteForQueryParam(sidecarRoute)
      queryParams.push(`sidecar=${encodedSidecarRoute}`)
    }

    if (queryParams.length > 0) {
      path += `?${queryParams.join("&")}`
    }

    return path
  },

  saveWindowsForWorkspace: (workspaceId: string) => {
    const { windows, activeWindowId } = get()

    const persistedState: PersistedWindowState = {
      windows,
      activeWindowId,
    }

    // Defer persistence to avoid blocking mobile back navigation.
    scheduleWindowStatePersistence(workspaceId, persistedState)
  },

  loadWindowsForWorkspace: (workspaceId: string) => {
    try {
      const stored = localStorage.getItem(getWindowsStorageKey(workspaceId))
      if (!stored) {
        // No saved windows - start fresh
        set({ windows: [], activeWindowId: null, currentWorkspaceId: workspaceId })
        return
      }

      const persistedState: PersistedWindowState = JSON.parse(stored)

      // Validate and restore windows
      const validWindows = persistedState.windows.filter(w => w.id && Array.isArray(w.stack))

      // Ensure activeWindowId is valid
      const activeWindowId = validWindows.find(w => w.id === persistedState.activeWindowId)
        ? persistedState.activeWindowId
        : validWindows.length > 0
          ? validWindows[0].id
          : null

      // Ensure isActive flags are correct
      const windowsWithCorrectActive = validWindows.map(w => ({
        ...w,
        isActive: w.id === activeWindowId,
      }))

      set({
        windows: windowsWithCorrectActive,
        activeWindowId,
        currentWorkspaceId: workspaceId,
      })
    } catch (error) {
      console.warn("Failed to load windows from localStorage:", error)
      set({ windows: [], activeWindowId: null, currentWorkspaceId: workspaceId })
    }
  },

  resetWindowsForWorkspace: (workspaceId: string) => {
    const pendingTimer = windowStateSaveDebounceTimersByWorkspaceId.get(workspaceId)
    if (pendingTimer) {
      clearTimeout(pendingTimer)
      windowStateSaveDebounceTimersByWorkspaceId.delete(workspaceId)
    }

    try {
      localStorage.removeItem(getWindowsStorageKey(workspaceId))
    } catch (error) {
      console.warn("Failed to clear windows from localStorage:", error)
    }

    set({ windows: [], activeWindowId: null, currentWorkspaceId: workspaceId })
  },

  clearWindows: () => {
    set({ windows: [], activeWindowId: null })
  },

  setCurrentWorkspaceId: (workspaceId: string | null) => {
    set({ currentWorkspaceId: workspaceId })
  },
}))
