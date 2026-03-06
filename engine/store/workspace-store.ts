import { Workspace, WorkspaceClientDto } from "../models/workspace"
import { GlobalStorage, GlobalStorageKeys } from "../storage/global-storage"
import { Logger } from "../utils/logger"
import { Store } from "./store"
import { WorkspaceStorage } from "../storage/workspace-storage"
import { StorageProvider } from "../storage/storage-provider"

const WORKSPACE_ENTRY_KEY_DELIMITER = "::"

export const buildWorkspaceEntryKey = (workspaceId: string, userId: string): string => {
  return `${workspaceId}${WORKSPACE_ENTRY_KEY_DELIMITER}${userId}`
}

export const parseWorkspaceEntryKey = (entryKey: string): { workspaceId: string; userId: string } | null => {
  const [workspaceId, userId] = entryKey.split(WORKSPACE_ENTRY_KEY_DELIMITER)
  if (!workspaceId || !userId) {
    return null
  }
  return { workspaceId, userId }
}

export type WorkspaceChangeCallback = (workspace: Workspace | undefined) => void
export type WorkspaceModelCallback = (workspace: Workspace | undefined) => void

/**
 * WorkspaceStore manages all workspace-related state with typed accessors and observer support.
 *
 * State managed:
 * - Current workspace selection
 * - All workspace entries (keyed by "workspaceId::userId" for multi-account support)
 * - Workspace entry selections (which account is preferred for each workspace)
 *
 * Observers:
 * - onCurrentWorkspaceChange: fires when current workspace changes
 * - onWorkspaceModelChange: fires when any workspace is added/updated/removed
 */
export class WorkspaceStore extends Store {
  private readonly KEYS = {
    CurrentWorkspace: Symbol("CurrentWorkspace"),
    CurrentWorkspaceEntryKey: Symbol("CurrentWorkspaceEntryKey"),
    Workspaces: Symbol("Workspaces"),
    WorkspaceEntrySelections: Symbol("WorkspaceEntrySelections"),
  }

  // Observers (matches NotificationService pattern: Set + returns unsubscribe fn)
  private currentWorkspaceObservers: Set<WorkspaceChangeCallback> = new Set()
  private workspaceModelObservers: Set<WorkspaceModelCallback> = new Set()
  private workspaceStorages: Map<string, WorkspaceStorage> = new Map()

  constructor(
    private readonly globalStorage: GlobalStorage,
    private readonly workspaceStorageProvider: StorageProvider,
    private readonly logger: Logger
  ) {
    super()
  }

  async initialize(): Promise<void> {
    await this.loadWorkspaceEntrySelectionsFromStorage()
    await this.loadWorkspacesFromStorage()
    await this.loadCurrentWorkspaceFromStorage()
  }

  public getWorkspaceStorage(workspaceId: string): WorkspaceStorage {
    if (!this.workspaceStorages.has(workspaceId)) {
      this.workspaceStorages.set(
        workspaceId,
        new WorkspaceStorage(this.workspaceStorageProvider, workspaceId)
      )
    }
    return this.workspaceStorages.get(workspaceId)!
  }

  getCurrentWorkspace(): Workspace | undefined {
    return this.get<Workspace>(this.KEYS.CurrentWorkspace)
  }

  getCurrentWorkspaceEntryKey(): string | undefined {
    return this.get<string>(this.KEYS.CurrentWorkspaceEntryKey)
  }

  setCurrentWorkspace(workspace: Workspace | undefined): void {
    this.logger.debug(`workspace_store: Setting current workspace to: ${workspace?.uuid}`)
    this.set(this.KEYS.CurrentWorkspace, workspace)
    const entryKey = workspace ? buildWorkspaceEntryKey(workspace.uuid, workspace.userId) : undefined
    this.set(this.KEYS.CurrentWorkspaceEntryKey, entryKey)

    if (workspace && entryKey) {
      this.setWorkspaceEntrySelection(workspace.uuid, entryKey)
    }

    this.notifyCurrentWorkspaceObservers(workspace)

    // Fire-and-forget persistence when workspace is set
    if (workspace) {
      void this.persistWorkspaceEntrySelections()
      void this.persistCurrentWorkspace()
    }
  }

  clearCurrentWorkspace(): void {
    this.set(this.KEYS.CurrentWorkspace, undefined)
    this.set(this.KEYS.CurrentWorkspaceEntryKey, undefined)
    this.notifyCurrentWorkspaceObservers(undefined)
  }

  // ========================================
  // Workspaces Map
  // ========================================

  getWorkspaces(): Map<string, Workspace> {
    return this.get<Map<string, Workspace>>(this.KEYS.Workspaces) ?? new Map()
  }

  getWorkspaceByEntryKey(entryKey: string): Workspace | undefined {
    return this.getWorkspaces().get(entryKey)
  }

  /**
   * Get workspace by UUID.
   * If userId is provided, returns the exact entry.
   * Otherwise, returns the preferred entry based on workspace entry selection,
   * falling back to the first matching entry.
   */
  getWorkspaceByUuid(workspaceId: string, userId?: string): Workspace | undefined {
    const trimmedWorkspaceId = workspaceId.trim()
    if (!trimmedWorkspaceId) {
      return undefined
    }

    if (userId) {
      return this.getWorkspaceByEntryKey(buildWorkspaceEntryKey(trimmedWorkspaceId, userId))
    }

    // Try the selected entry for this workspace
    const selectedEntryKey = this.getWorkspaceEntrySelection(trimmedWorkspaceId)
    if (selectedEntryKey) {
      const selectedWorkspace = this.getWorkspaceByEntryKey(selectedEntryKey)
      if (selectedWorkspace) {
        return selectedWorkspace
      }
    }

    // Fallback to first matching entry
    const matchingWorkspaces = this.getWorkspacesByWorkspaceId(trimmedWorkspaceId)
    return matchingWorkspaces[0]
  }

  setWorkspace(workspace: Workspace): void {
    const entryKey = buildWorkspaceEntryKey(workspace.uuid, workspace.userId)
    const workspaces = new Map(this.getWorkspaces())
    workspaces.set(entryKey, workspace)
    this.set(this.KEYS.Workspaces, workspaces)
    this.notifyWorkspaceModelObservers(workspace)
  }

  /**
   * Sets a workspace by explicit entry key, useful when the workspace's userId
   * may not match the desired entry key (e.g., during updates where userId is missing).
   */
  setWorkspaceByEntryKey(entryKey: string, workspace: Workspace): void {
    const workspaces = new Map(this.getWorkspaces())
    workspaces.set(entryKey, workspace)
    this.set(this.KEYS.Workspaces, workspaces)
    this.notifyWorkspaceModelObservers(workspace)
  }

  removeWorkspace(entryKey: string): Workspace | undefined {
    const workspaces = new Map(this.getWorkspaces())
    const removed = workspaces.get(entryKey)
    if (removed) {
      workspaces.delete(entryKey)
      this.set(this.KEYS.Workspaces, workspaces)
      this.notifyWorkspaceModelObservers(removed)
    }
    return removed
  }

  clearWorkspaces(): void {
    this.set(this.KEYS.Workspaces, new Map())
  }

  /**
   * Clear all workspace state and storage (used on logout or account switch)
   */
  async clearAllWorkspaces(): Promise<void> {
    const previousWorkspaces = this.getAllWorkspaces()

    // Clear per-workspace storage for known workspaces
    for (const ws of previousWorkspaces) {
      await this.getWorkspaceStorage(ws.uuid).clear()
    }

    // Clear global workspace listings and current selection
    await this.removeWorkspacesFromStorage()
    await this.removeCurrentWorkspaceFromStorage()
    await this.removeWorkspaceEntrySelectionsFromStorage()

    // Clear in-memory state
    this.clearWorkspaces()
    this.clearWorkspaceEntrySelections()
    this.setCurrentWorkspace(undefined)
  }

  getAllWorkspaces(): Workspace[] {
    return Array.from(this.getWorkspaces().values())
  }

  /**
   * Returns all workspace entries that match a workspace ID.
   */
  getWorkspacesByWorkspaceId(workspaceId: string): Workspace[] {
    const trimmed = workspaceId.trim()
    if (!trimmed) {
      return []
    }
    return this.getAllWorkspaces().filter(workspace => workspace.uuid === trimmed)
  }

  /**
   * Clear all workspace entries for a specific user.
   * Preserves workspace storage when other accounts still reference the workspace.
   */
  async clearWorkspacesForUser(userId: string): Promise<void> {
    const trimmedUserId = userId.trim()
    if (!trimmedUserId) {
      return
    }

    const allWorkspaces = this.getAllWorkspaces()
    const entriesToRemove = allWorkspaces.filter(workspace => workspace.userId === trimmedUserId)

    if (entriesToRemove.length === 0) {
      return
    }

    const affectedWorkspaceIds = new Set(entriesToRemove.map(workspace => workspace.uuid))

    // Remove entries for this user
    for (const workspace of entriesToRemove) {
      const entryKey = buildWorkspaceEntryKey(workspace.uuid, workspace.userId)
      this.removeWorkspace(entryKey)
    }

    // Handle cleanup and fallback selection for affected workspaces
    for (const workspaceId of affectedWorkspaceIds) {
      const remainingEntries = this.getWorkspacesByWorkspaceId(workspaceId)
      if (remainingEntries.length === 0) {
        await this.getWorkspaceStorage(workspaceId).clear()
      }

      const selectedEntryKey = this.getWorkspaceEntrySelection(workspaceId)
      const selectedEntry = selectedEntryKey ? parseWorkspaceEntryKey(selectedEntryKey) : null
      if (selectedEntry && selectedEntry.userId === trimmedUserId) {
        if (remainingEntries.length > 0) {
          const fallbackEntryKey = buildWorkspaceEntryKey(
            remainingEntries[0].uuid,
            remainingEntries[0].userId
          )
          this.setWorkspaceEntrySelection(workspaceId, fallbackEntryKey)
        } else {
          this.removeWorkspaceEntrySelection(workspaceId)
        }
      }
    }

    // Clear current workspace if it belonged to this user
    const currentWorkspace = this.getCurrentWorkspace()
    if (currentWorkspace?.userId === trimmedUserId) {
      this.clearCurrentWorkspace()
      await this.removeCurrentWorkspaceFromStorage()
    }

    await this.persistWorkspaces()
    await this.persistWorkspaceEntrySelections()
  }

  // ========================================
  // Workspace Entry Selections
  // ========================================

  /**
   * Tracks which user account's entry is "selected" for each workspace in multi-account scenarios.
   *
   * A single workspace can be accessed by multiple logged-in accounts (e.g., alice@example.com
   * and bob@example.com both have access to "Acme Corp"). The workspaces Map stores separate
   * entries keyed by "workspaceId::userId". This map remembers which account was last used
   * to access each workspace, so lookups by workspaceId alone return the preferred entry.
   */
  getWorkspaceEntrySelections(): Map<string, string> {
    return this.get<Map<string, string>>(this.KEYS.WorkspaceEntrySelections) ?? new Map()
  }

  getWorkspaceEntrySelection(workspaceId: string): string | undefined {
    return this.getWorkspaceEntrySelections().get(workspaceId)
  }

  setWorkspaceEntrySelection(workspaceId: string, entryKey: string): void {
    const selections = new Map(this.getWorkspaceEntrySelections())
    selections.set(workspaceId, entryKey)
    this.set(this.KEYS.WorkspaceEntrySelections, selections)
  }

  removeWorkspaceEntrySelection(workspaceId: string): void {
    const selections = new Map(this.getWorkspaceEntrySelections())
    selections.delete(workspaceId)
    this.set(this.KEYS.WorkspaceEntrySelections, selections)
  }

  clearWorkspaceEntrySelections(): void {
    this.set(this.KEYS.WorkspaceEntrySelections, new Map())
  }

  // ========================================
  // Observers
  // ========================================

  onCurrentWorkspaceChange(callback: WorkspaceChangeCallback): () => void {
    this.currentWorkspaceObservers.add(callback)
    return () => this.currentWorkspaceObservers.delete(callback)
  }

  onWorkspaceModelChange(callback: WorkspaceModelCallback): () => void {
    this.workspaceModelObservers.add(callback)
    return () => this.workspaceModelObservers.delete(callback)
  }

  clearCurrentWorkspaceObservers(): void {
    this.currentWorkspaceObservers.clear()
  }

  clearWorkspaceModelObservers(): void {
    this.workspaceModelObservers.clear()
  }

  private notifyCurrentWorkspaceObservers(workspace: Workspace | undefined): void {
    this.logger.debug(
      `workspace_store: Notifying ${this.currentWorkspaceObservers.size} current workspace observers`
    )
    for (const callback of this.currentWorkspaceObservers) {
      try {
        callback(workspace)
      } catch (error) {
        this.logger.error("Error in current workspace observer:", error)
      }
    }
  }

  private notifyWorkspaceModelObservers(workspace: Workspace | undefined): void {
    this.logger.debug(
      `workspace_store: Notifying ${this.workspaceModelObservers.size} workspace model observers`
    )
    for (const callback of this.workspaceModelObservers) {
      try {
        callback(workspace)
      } catch (error) {
        this.logger.error("Error in workspace model observer:", error)
      }
    }
  }

  // ========================================
  // Persistence
  // ========================================

  async persistCurrentWorkspace(): Promise<void> {
    try {
      const workspace = this.getCurrentWorkspace()
      if (workspace) {
        const json = JSON.stringify(workspace.toClientDto())
        await this.globalStorage.set(GlobalStorageKeys.CurrentWorkspace, json)
      } else {
        await this.globalStorage.remove(GlobalStorageKeys.CurrentWorkspace)
      }
    } catch (error) {
      this.logger.error("Failed to persist current workspace:", error)
    }
  }

  async persistWorkspaces(): Promise<void> {
    try {
      const workspaces = Array.from(this.getWorkspaces().values())
      const dtos = workspaces.map(w => w.toClientDto())
      await this.globalStorage.set(GlobalStorageKeys.Workspaces, JSON.stringify(dtos))
    } catch (error) {
      this.logger.error("Failed to persist workspaces:", error)
    }
  }

  async persistWorkspaceEntrySelections(): Promise<void> {
    try {
      const selections = Object.fromEntries(this.getWorkspaceEntrySelections())
      await this.globalStorage.set(GlobalStorageKeys.WorkspaceEntrySelections, JSON.stringify(selections))
    } catch (error) {
      this.logger.error("Failed to persist workspace entry selections:", error)
    }
  }

  /**
   * Persist all workspace state synchronously (awaited).
   * This is used by UI flows that need deterministic persistence before reloads.
   */
  async persistWorkspaceSnapshot(workspace?: Workspace): Promise<void> {
    const currentWorkspace = this.getCurrentWorkspace()
    const workspaceToPersist = workspace ?? currentWorkspace
    if (workspaceToPersist) {
      // Temporarily set it as current to trigger persistence
      if (workspace && workspace !== currentWorkspace) {
        this.setCurrentWorkspace(workspace)
      }
      await this.persistCurrentWorkspace()
    }

    await Promise.all([this.persistWorkspaces(), this.persistWorkspaceEntrySelections()])
  }

  async removeCurrentWorkspaceFromStorage(): Promise<void> {
    await this.globalStorage.remove(GlobalStorageKeys.CurrentWorkspace)
  }

  async removeWorkspacesFromStorage(): Promise<void> {
    await this.globalStorage.remove(GlobalStorageKeys.Workspaces)
  }

  async removeWorkspaceEntrySelectionsFromStorage(): Promise<void> {
    await this.globalStorage.remove(GlobalStorageKeys.WorkspaceEntrySelections)
  }

  // ========================================
  // Hydration (private)
  // ========================================

  private async loadCurrentWorkspaceFromStorage(): Promise<void> {
    try {
      const json = await this.globalStorage.get(GlobalStorageKeys.CurrentWorkspace)
      if (!json) {
        return
      }

      const dto = JSON.parse(json) as WorkspaceClientDto
      const workspace = new Workspace(dto)

      // Store the workspace in the map as well
      const entryKey = buildWorkspaceEntryKey(workspace.uuid, workspace.userId)
      const workspaces = new Map(this.getWorkspaces())
      workspaces.set(entryKey, workspace)
      this.set(this.KEYS.Workspaces, workspaces)
      this.notifyWorkspaceModelObservers(workspace)

      this.logger.debug("Loaded current workspace from storage")
      this.setCurrentWorkspace(workspace)
    } catch (error) {
      this.logger.error("Failed to load current workspace from storage:", error)
    }
  }

  private async loadWorkspacesFromStorage(): Promise<void> {
    try {
      const json = await this.globalStorage.get(GlobalStorageKeys.Workspaces)
      if (!json) {
        return
      }

      const dtos = JSON.parse(json) as WorkspaceClientDto[]
      this.logger.debug(`Loaded ${dtos.length} workspaces from storage`)

      const workspaces = new Map<string, Workspace>()

      for (const [index, dto] of dtos.entries()) {
        try {
          // Validate required fields before creating workspace
          if (!dto || typeof dto !== "object") {
            this.logger.warn(`Skipping invalid workspace data at index ${index}: not an object`)
            continue
          }

          if (!dto.uuid) {
            this.logger.warn(`Skipping workspace data at index ${index}: missing uuid`)
            continue
          }

          if (!dto.name) {
            this.logger.warn(`Skipping workspace data at index ${index}: missing name`)
            continue
          }

          if (!dto.userId) {
            this.logger.warn(`Skipping workspace data at index ${index}: missing userId`)
            continue
          }

          const workspace = new Workspace(dto)
          const entryKey = buildWorkspaceEntryKey(workspace.uuid, workspace.userId)
          workspaces.set(entryKey, workspace)
          this.notifyWorkspaceModelObservers(workspace)
        } catch (workspaceError) {
          this.logger.error(`Failed to load workspace at index ${index}:`, workspaceError)
        }
      }

      this.set(this.KEYS.Workspaces, workspaces)
    } catch (error) {
      this.logger.error("Failed to load workspaces from storage:", error)
      // Clear corrupted storage and continue
      try {
        await this.globalStorage.remove(GlobalStorageKeys.Workspaces)
        this.logger.info("Cleared corrupted workspace storage")
      } catch (clearError) {
        this.logger.error("Failed to clear corrupted workspace storage:", clearError)
      }
    }
  }

  private async loadWorkspaceEntrySelectionsFromStorage(): Promise<void> {
    try {
      const json = await this.globalStorage.get(GlobalStorageKeys.WorkspaceEntrySelections)
      if (!json) {
        return
      }

      const data = JSON.parse(json) as Record<string, string>
      const selections = new Map<string, string>()

      for (const [workspaceId, entryKey] of Object.entries(data)) {
        const parsed = parseWorkspaceEntryKey(entryKey)
        if (!parsed || parsed.workspaceId !== workspaceId) {
          continue
        }
        selections.set(workspaceId, entryKey)
      }

      this.set(this.KEYS.WorkspaceEntrySelections, selections)
    } catch (error) {
      this.logger.error("Failed to load workspace entry selections from storage:", error)
    }
  }
}
