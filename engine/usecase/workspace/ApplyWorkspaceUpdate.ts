import { Workspace, WorkspaceServerDto } from "../../models/workspace"
import { WorkspaceStore, buildWorkspaceEntryKey } from "../../store/workspace-store"
import { Result } from "../../utils/Result"
import { SyncUseCaseInterface } from "../../utils/UseCase/SyncUseCaseInterface"

/**
 * Applies a server workspace DTO to local state, updating all matching entries.
 *
 * This use case handles multi-account scenarios where the same workspace may be
 * accessed by multiple logged-in accounts. It:
 * 1. Converts the server DTO to a Workspace model
 * 2. Updates all existing entries that match the workspace UUID
 * 3. Preserves per-entry userId and subscription data
 * 4. Updates the current workspace if it matches
 * 5. Persists changes (fire-and-forget)
 *
 * If no matching entries exist, creates a new entry from the DTO.
 */
export class ApplyWorkspaceUpdate implements SyncUseCaseInterface<Workspace> {
  constructor(private readonly workspaceStore: WorkspaceStore) {}

  execute(dto: WorkspaceServerDto): Result<Workspace> {
    const baseWorkspace = Workspace.fromServerDto(dto)
    const matchingEntries = this.workspaceStore.getWorkspacesByWorkspaceId(baseWorkspace.uuid)

    // No existing entries - create new entry from DTO
    if (matchingEntries.length === 0) {
      this.workspaceStore.setWorkspace(baseWorkspace)
      const currentWorkspace = this.workspaceStore.getCurrentWorkspace()
      if (currentWorkspace?.uuid === baseWorkspace.uuid) {
        this.workspaceStore.setCurrentWorkspace(baseWorkspace)
      }
      void this.workspaceStore.persistWorkspaces()
      return Result.ok(baseWorkspace)
    }

    // Update all matching entries, preserving per-entry userId and subscription
    let updatedCurrentWorkspace: Workspace | undefined
    const currentEntryKey = this.workspaceStore.getCurrentWorkspaceEntryKey()

    for (const entry of matchingEntries) {
      let updatedEntry = baseWorkspace.withUserId(entry.userId)
      // Preserve existing subscription if server didn't provide one
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
