import { Workspace, WorkspaceServerDto } from "../../models/workspace"
import { AccountStore } from "../../store/account-store"
import { WorkspaceStore } from "../../store/workspace-store"
import { Logger } from "../../utils/logger"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"
import { RefreshAuthTokens } from "../user/RefreshAuthTokens"

/**
 * Result of fetching workspaces for a single account.
 * Contains the fetched workspaces and any workspace IDs that were removed.
 */
export interface FetchWorkspacesResult {
  workspaces: Workspace[]
  removedWorkspaceIds: string[]
}

/**
 * Fetches workspaces from the server for a single account.
 *
 * This use case:
 * 1. Fetches workspaces from the server for the given account
 * 2. Binds missing userId to the account
 * 3. Returns the fetched workspaces and removed workspace IDs
 *
 * Store updates are NOT performed here to avoid race conditions when fetching
 * for multiple accounts in parallel. The caller (FetchAllWorkspaces) batches
 * all results and performs store updates synchronously.
 */
export class FetchWorkspaces implements UseCaseInterface<FetchWorkspacesResult> {
  constructor(
    private readonly workspaceStore: WorkspaceStore,
    private readonly logger: Logger
  ) {}

  async execute(
    accountStore: AccountStore,
    refreshAuthTokens: RefreshAuthTokens
  ): Promise<Result<FetchWorkspacesResult>> {
    const accountId = accountStore.getUserId()

    const executeAuthenticatedRequest = new ExecuteAuthenticatedRequest(
      accountStore.getHttpClient(),
      accountStore,
      refreshAuthTokens,
      this.logger
    )

    try {
      const serverWorkspaces =
        await executeAuthenticatedRequest.executeGet<WorkspaceServerDto[]>("/workspaces")

      // Bind missing userId to the account we fetched for
      const workspaces = serverWorkspaces.map(dto => {
        const workspace = Workspace.fromServerDto(dto)
        if (!workspace.userId?.trim()) {
          return workspace.withUserId(accountId)
        }
        return workspace
      })

      // Determine which workspaces were removed (exist locally but not on server)
      const fetchedWorkspaceIds = new Set(workspaces.map(w => w.uuid))
      const existingEntriesForAccount = this.workspaceStore
        .getAllWorkspaces()
        .filter(w => w.userId === accountId)

      const removedWorkspaceIds: string[] = []
      for (const workspace of existingEntriesForAccount) {
        if (!fetchedWorkspaceIds.has(workspace.uuid)) {
          removedWorkspaceIds.push(workspace.uuid)
        }
      }

      return Result.ok({ workspaces, removedWorkspaceIds })
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : "Unknown error")
    }
  }
}
