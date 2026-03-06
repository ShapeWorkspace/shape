import { Workspace } from "../../models/workspace"
import { WorkspaceSubscription } from "../../models/workspace-subscription"
import { WorkspaceStore, buildWorkspaceEntryKey } from "../../store/workspace-store"
import { Result } from "../../utils/Result"
import { SyncUseCaseInterface } from "../../utils/UseCase/SyncUseCaseInterface"

/**
 * Updates the subscription for all entries of a workspace.
 *
 * This use case handles multi-account scenarios where the same workspace
 * may have multiple entries (one per account). It updates the subscription
 * on all matching entries and persists the changes.
 */
export class UpdateWorkspaceSubscription implements SyncUseCaseInterface<Workspace | undefined> {
  constructor(private readonly workspaceStore: WorkspaceStore) {}

  execute(workspaceId: string, subscription?: WorkspaceSubscription | null): Result<Workspace | undefined> {
    const matchingEntries = this.workspaceStore.getWorkspacesByWorkspaceId(workspaceId)
    if (matchingEntries.length === 0) {
      return Result.ok(undefined)
    }

    let updatedCurrentWorkspace: Workspace | undefined
    const currentEntryKey = this.workspaceStore.getCurrentWorkspaceEntryKey()

    for (const entry of matchingEntries) {
      const updatedWorkspace = entry.withSubscription(subscription ?? undefined)
      const entryKey = buildWorkspaceEntryKey(updatedWorkspace.uuid, updatedWorkspace.userId)
      this.workspaceStore.setWorkspaceByEntryKey(entryKey, updatedWorkspace)
      if (currentEntryKey === entryKey) {
        updatedCurrentWorkspace = updatedWorkspace
      }
    }

    if (updatedCurrentWorkspace) {
      this.workspaceStore.setCurrentWorkspace(updatedCurrentWorkspace)
    }

    void this.workspaceStore.persistWorkspaces()
    return Result.ok(updatedCurrentWorkspace ?? matchingEntries[0])
  }
}
