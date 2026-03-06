import { LOCAL_ANONYMOUS_WORKSPACE_USER_ID, Workspace } from "../../models/workspace"
import { WorkspaceStore, buildWorkspaceEntryKey } from "../../store/workspace-store"
import { Result } from "../../utils/Result"
import { SyncUseCaseInterface } from "../../utils/UseCase/SyncUseCaseInterface"

/**
 * Renames a local-only workspace without touching the server.
 *
 * This use case only operates on workspaces with the anonymous user ID,
 * which are local-only workspaces created before signup.
 */
export class RenameLocalWorkspace implements SyncUseCaseInterface<Workspace | undefined> {
  constructor(private readonly workspaceStore: WorkspaceStore) {}

  execute(workspaceId: string, name: string): Result<Workspace | undefined> {
    const existingWorkspace = this.workspaceStore.getWorkspaceByUuid(
      workspaceId,
      LOCAL_ANONYMOUS_WORKSPACE_USER_ID
    )
    if (!existingWorkspace) {
      return Result.ok(undefined)
    }

    const updatedWorkspace = existingWorkspace.withName(name, new Date().toISOString())
    const workspaceEntryKey = buildWorkspaceEntryKey(updatedWorkspace.uuid, updatedWorkspace.userId)
    this.workspaceStore.setWorkspaceByEntryKey(workspaceEntryKey, updatedWorkspace)

    const currentEntryKey = this.workspaceStore.getCurrentWorkspaceEntryKey()
    if (currentEntryKey === workspaceEntryKey) {
      this.workspaceStore.setCurrentWorkspace(updatedWorkspace)
    }

    void this.workspaceStore.persistWorkspaces()
    return Result.ok(updatedWorkspace)
  }
}
