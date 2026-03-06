import { Workspace } from "../../models/workspace"
import { AccountStoreContainer } from "../../store/account-store-container"
import { WorkspaceStore, buildWorkspaceEntryKey, parseWorkspaceEntryKey } from "../../store/workspace-store"
import { Logger } from "../../utils/logger"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { FetchWorkspaces } from "./FetchWorkspaces"
import { RefreshAuthTokens } from "../user/RefreshAuthTokens"
import { LOCAL_ANONYMOUS_WORKSPACE_USER_ID } from "../../models/workspace"

/**
 * Fetches workspaces for all accounts and updates the workspace store atomically.
 *
 * This use case:
 * 1. Fetches workspaces for all accounts in parallel
 * 2. Batches all results
 * 3. Applies store updates synchronously (no race conditions)
 * 4. Handles cleanup for removed workspaces
 * 5. Persists changes once at the end
 */
export class FetchAllWorkspaces implements UseCaseInterface<Workspace[]> {
  constructor(
    private readonly fetchWorkspaces: FetchWorkspaces,
    private readonly accountStoreContainer: AccountStoreContainer,
    private readonly workspaceStore: WorkspaceStore,
    private readonly logger: Logger
  ) {}

  async execute(): Promise<Result<Workspace[]>> {
    const accountStores = this.accountStoreContainer
      .getAllAccountStores()
      .filter(accountStore => accountStore.getUserId() !== LOCAL_ANONYMOUS_WORKSPACE_USER_ID)

    if (accountStores.length === 0) {
      return Result.ok([])
    }

    // Fetch workspaces for all accounts in parallel
    const fetchPromises = accountStores.map(async accountStore => {
      const refreshAuthTokens = new RefreshAuthTokens(accountStore)
      const result = await this.fetchWorkspaces.execute(accountStore, refreshAuthTokens)
      return {
        accountId: accountStore.getUserId(),
        result,
      }
    })

    const fetchResults = await Promise.all(fetchPromises)

    // Collect all workspaces and removals
    const allFetchedWorkspaces: Workspace[] = []
    const allRemovedByAccount: Array<{ accountId: string; workspaceId: string }> = []

    for (const { accountId, result } of fetchResults) {
      if (result.isFailed()) {
        this.logger.error(`Failed to fetch workspaces for account ${accountId}: ${result.getError()}`)
        continue
      }

      const { workspaces, removedWorkspaceIds } = result.getValue()
      allFetchedWorkspaces.push(...workspaces)

      for (const workspaceId of removedWorkspaceIds) {
        allRemovedByAccount.push({ accountId, workspaceId })
      }
    }

    // === Synchronous store updates (no race conditions) ===

    // Remove workspaces no longer present on server
    for (const { accountId, workspaceId } of allRemovedByAccount) {
      const entryKey = buildWorkspaceEntryKey(workspaceId, accountId)
      this.workspaceStore.removeWorkspace(entryKey)
    }

    // Add/update fetched workspaces
    for (const workspace of allFetchedWorkspaces) {
      this.workspaceStore.setWorkspace(workspace)
    }

    // Clean up storage and entry selections for removed workspaces
    const processedWorkspaceIds = new Set<string>()
    for (const { accountId, workspaceId } of allRemovedByAccount) {
      if (processedWorkspaceIds.has(workspaceId)) {
        continue
      }
      processedWorkspaceIds.add(workspaceId)

      const remainingEntries = this.workspaceStore.getWorkspacesByWorkspaceId(workspaceId)
      if (remainingEntries.length === 0) {
        const workspaceStorage = this.workspaceStore.getWorkspaceStorage(workspaceId)
        await workspaceStorage.clear()
      }

      const selectedEntryKey = this.workspaceStore.getWorkspaceEntrySelection(workspaceId)
      const selectedEntry = selectedEntryKey ? parseWorkspaceEntryKey(selectedEntryKey) : null
      if (selectedEntry && selectedEntry.userId === accountId) {
        if (remainingEntries.length > 0) {
          const fallbackEntryKey = buildWorkspaceEntryKey(
            remainingEntries[0].uuid,
            remainingEntries[0].userId
          )
          this.workspaceStore.setWorkspaceEntrySelection(workspaceId, fallbackEntryKey)
        } else {
          this.workspaceStore.removeWorkspaceEntrySelection(workspaceId)
        }
      }
    }

    // Clear current workspace if it was removed
    const currentWorkspace = this.workspaceStore.getCurrentWorkspace()
    if (currentWorkspace) {
      const wasRemoved = allRemovedByAccount.some(
        r => r.workspaceId === currentWorkspace.uuid && r.accountId === currentWorkspace.userId
      )
      if (wasRemoved) {
        this.workspaceStore.clearCurrentWorkspace()
        await this.workspaceStore.removeCurrentWorkspaceFromStorage()
      }
    }

    // Persist all changes once
    await this.workspaceStore.persistWorkspaces()
    await this.workspaceStore.persistWorkspaceEntrySelections()

    return Result.ok(allFetchedWorkspaces)
  }
}
