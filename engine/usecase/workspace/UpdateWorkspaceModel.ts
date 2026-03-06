import { Workspace } from "../../models/workspace"
import { WorkspaceStore, buildWorkspaceEntryKey } from "../../store/workspace-store"
import { Result } from "../../utils/Result"
import { SyncUseCaseInterface } from "../../utils/UseCase/SyncUseCaseInterface"

/**
 * Updates a workspace model from an already-constructed Workspace instance.
 *
 * Useful for client-side mutations where we already have a Workspace model (e.g., rename).
 * Handles multi-account scenarios:
 * - If workspace has no userId, broadcasts update to all matching entries
 * - Preserves per-entry subscription data when server omits it
 * - Updates current workspace if it matches the updated entry
 */
export class UpdateWorkspaceModel implements SyncUseCaseInterface<Workspace> {
  constructor(private readonly workspaceStore: WorkspaceStore) {}

  execute(workspace: Workspace): Result<Workspace> {
    const trimmedUserId = workspace.userId?.trim() ?? ""
    const currentEntryKey = this.workspaceStore.getCurrentWorkspaceEntryKey()

    // Some server responses (ex: workspace rename) omit user_id. Preserve the
    // existing account bindings by applying the update to every matching entry.
    if (!trimmedUserId) {
      const matchingEntries = this.workspaceStore.getWorkspacesByWorkspaceId(workspace.uuid)
      if (matchingEntries.length > 0) {
        let updatedCurrentWorkspace: Workspace | undefined

        for (const entry of matchingEntries) {
          let updatedEntry = workspace.withUserId(entry.userId)
          if (!updatedEntry.subscription && entry.subscription) {
            updatedEntry = updatedEntry.withSubscription(entry.subscription)
          }
          const entryKey = buildWorkspaceEntryKey(updatedEntry.uuid, updatedEntry.userId)
          this.workspaceStore.setWorkspaceByEntryKey(entryKey, updatedEntry)
          if (currentEntryKey === entryKey) {
            updatedCurrentWorkspace = updatedEntry
          }
        }

        if (updatedCurrentWorkspace) {
          this.workspaceStore.setCurrentWorkspace(updatedCurrentWorkspace)
        }

        void this.workspaceStore.persistWorkspaces()
        return Result.ok(updatedCurrentWorkspace ?? matchingEntries[0])
      }
    }

    // Direct update with known userId
    const workspaceEntryKey = buildWorkspaceEntryKey(workspace.uuid, workspace.userId)
    this.workspaceStore.setWorkspaceByEntryKey(workspaceEntryKey, workspace)

    if (currentEntryKey === workspaceEntryKey) {
      this.workspaceStore.setCurrentWorkspace(workspace)
    }

    void this.workspaceStore.persistWorkspaces()
    return Result.ok(workspace)
  }
}
