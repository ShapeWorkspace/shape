import { Workspace } from "../../models/workspace"
import { WorkspaceStore, buildWorkspaceEntryKey, parseWorkspaceEntryKey } from "../../store/workspace-store"
import { Logger } from "../../utils/logger"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"

/**
 * Removes a workspace model and clears its storage.
 *
 * This use case handles:
 * 1. Removing workspace entries (all or for a specific user)
 * 2. Clearing workspace storage if no entries remain
 * 3. Updating entry selection with fallback
 * 4. Updating current workspace with fallback
 * 5. Persisting changes
 */
export class RemoveWorkspaceModel implements UseCaseInterface<Workspace | undefined> {
  constructor(
    private readonly workspaceStore: WorkspaceStore,
    private readonly logger: Logger
  ) {}

  async execute(workspaceId: string, userId?: string): Promise<Result<Workspace | undefined>> {
    const trimmedWorkspaceId = workspaceId.trim()
    if (!trimmedWorkspaceId) {
      return Result.ok(undefined)
    }

    try {
      const allWorkspaces = this.workspaceStore.getAllWorkspaces()
      const entriesToRemove = userId
        ? allWorkspaces.filter(ws => ws.uuid === trimmedWorkspaceId && ws.userId === userId)
        : allWorkspaces.filter(ws => ws.uuid === trimmedWorkspaceId)

      if (entriesToRemove.length === 0) {
        return Result.ok(undefined)
      }

      let removedWorkspace: Workspace | undefined
      for (const workspace of entriesToRemove) {
        const entryKey = buildWorkspaceEntryKey(workspace.uuid, workspace.userId)
        this.workspaceStore.removeWorkspace(entryKey)
        if (!removedWorkspace) {
          removedWorkspace = workspace
        }
      }

      const remainingEntries = this.workspaceStore.getWorkspacesByWorkspaceId(trimmedWorkspaceId)
      if (remainingEntries.length === 0) {
        const workspaceStorage = this.workspaceStore.getWorkspaceStorage(trimmedWorkspaceId)
        await workspaceStorage.clear()
      }

      // Update entry selection
      const selectedEntryKey = this.workspaceStore.getWorkspaceEntrySelection(trimmedWorkspaceId)
      if (selectedEntryKey) {
        const parsedSelection = parseWorkspaceEntryKey(selectedEntryKey)
        if (parsedSelection && parsedSelection.workspaceId === trimmedWorkspaceId) {
          if (userId && parsedSelection.userId !== userId) {
            // Selection still valid for another account.
          } else if (remainingEntries.length > 0) {
            const fallbackEntryKey = buildWorkspaceEntryKey(
              remainingEntries[0].uuid,
              remainingEntries[0].userId
            )
            this.workspaceStore.setWorkspaceEntrySelection(trimmedWorkspaceId, fallbackEntryKey)
          } else {
            this.workspaceStore.removeWorkspaceEntrySelection(trimmedWorkspaceId)
          }
        }
      }

      // Handle current workspace fallback
      const currentWorkspace = this.workspaceStore.getCurrentWorkspace()
      const currentEntryKey = this.workspaceStore.getCurrentWorkspaceEntryKey()
      if (currentWorkspace?.uuid === trimmedWorkspaceId) {
        if (!currentEntryKey || !this.workspaceStore.getWorkspaceByEntryKey(currentEntryKey)) {
          // Preserve a selected workspace synchronously to avoid UI redirects when a removed
          // workspace was active (e.g., local cleanup during auth).
          const fallbackForSameWorkspace = remainingEntries[0]
          const fallbackWorkspace = fallbackForSameWorkspace ?? this.workspaceStore.getAllWorkspaces()[0]
          if (fallbackWorkspace) {
            this.workspaceStore.setCurrentWorkspace(fallbackWorkspace)
            await this.workspaceStore.persistCurrentWorkspace()
          } else {
            this.workspaceStore.clearCurrentWorkspace()
            await this.workspaceStore.removeCurrentWorkspaceFromStorage()
          }
        }
      }

      void this.workspaceStore.persistWorkspaces()
      void this.workspaceStore.persistWorkspaceEntrySelections()

      return Result.ok(removedWorkspace)
    } catch (error) {
      this.logger.error("Failed to remove workspace model:", error)
      return Result.ok(undefined)
    }
  }
}
