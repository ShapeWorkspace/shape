import { IdentityKeys } from "../../models/auth-types"
import { InviteBundlePlaintext } from "../../models/invite-types"
import { DecryptedWorkspaceKey } from "../../models/workspace-key"
import { Workspace } from "../../models/workspace"
import { WorkspaceKeyRepository } from "../../repositories"
import { AccountStore } from "../../store/account-store"
import { WorkspaceStore } from "../../store/workspace-store"
import { Logger } from "../../utils/logger"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { BuildAcceptLinkInviteRequestFromBundle } from "./BuildAcceptLinkInviteRequestFromBundle"
import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"
import { FetchWorkspaces } from "../workspace/FetchWorkspaces"
import { NetworkAcceptLinkInvite } from "./NetworkAcceptLinkInvite"
import { RefreshAuthTokens } from "../user/RefreshAuthTokens"

/**
 * Accepts a link invite, persists workspace keys, and refreshes the workspace list.
 *
 * This use case orchestrates the full invite acceptance flow:
 * 1. Builds the accept request from the invite bundle (decrypts keys)
 * 2. Sends the accept request to the server
 * 3. Persists the decrypted workspace keys to IndexedDB
 * 4. Fetches updated workspaces from the server
 * 5. Returns the workspace the user was invited to
 */
export class AcceptLinkInvite implements UseCaseInterface<Workspace> {
  constructor(
    private readonly buildAcceptLinkInviteRequestFromBundle: BuildAcceptLinkInviteRequestFromBundle,
    private readonly fetchWorkspaces: FetchWorkspaces,
    private readonly workspaceStore: WorkspaceStore,
    private readonly keyRepository: WorkspaceKeyRepository,
    private readonly logger: Logger
  ) {}

  async execute(
    inviteId: string,
    bundle: InviteBundlePlaintext,
    accountStore: AccountStore
  ): Promise<Result<Workspace>> {
    const identityKeys = accountStore.getIdentityKeys()
    if (!identityKeys) {
      return Result.fail("Not authenticated")
    }
    // Step 1: Build the accept request from the invite bundle
    const requestResult = this.buildAcceptLinkInviteRequestFromBundle.execute(bundle, identityKeys)
    if (requestResult.isFailed()) {
      return Result.fail(requestResult.getError())
    }

    const { request, decryptedWorkspaceKeys } = requestResult.getValue()

    // Step 2: Construct account-scoped network dependencies and send accept request
    const refreshAuthTokens = new RefreshAuthTokens(accountStore)
    const executeAuthenticatedRequest = new ExecuteAuthenticatedRequest(
      accountStore.getHttpClient(),
      accountStore,
      refreshAuthTokens,
      this.logger
    )
    const networkAcceptLinkInvite = new NetworkAcceptLinkInvite(executeAuthenticatedRequest)

    const acceptResult = await networkAcceptLinkInvite.execute(inviteId, request)
    if (acceptResult.isFailed()) {
      return Result.fail(`Failed to accept invite: ${acceptResult.getError()}`)
    }

    // Step 3: Persist workspace keys to IndexedDB
    await this.persistWorkspaceKeys(decryptedWorkspaceKeys, identityKeys)

    // Step 4: Fetch updated workspaces and update store
    const fetchResult = await this.fetchWorkspaces.execute(accountStore, refreshAuthTokens)
    if (!fetchResult.isFailed()) {
      const { workspaces } = fetchResult.getValue()
      for (const workspace of workspaces) {
        this.workspaceStore.setWorkspace(workspace)
      }
      await this.workspaceStore.persistWorkspaces()
    }

    // Step 5: Return the workspace the user was invited to
    const workspace = this.workspaceStore.getWorkspaceByUuid(bundle.workspaceId, identityKeys.userId)
    if (!workspace) {
      return Result.fail("Workspace not found after accepting invite")
    }

    return Result.ok(workspace)
  }

  /**
   * Persists workspace keys to IndexedDB, scoped to the user.
   */
  private async persistWorkspaceKeys(
    decryptedWorkspaceKeys: DecryptedWorkspaceKey[],
    identityKeys: IdentityKeys
  ): Promise<void> {
    for (const key of decryptedWorkspaceKeys) {
      const storedKey = WorkspaceKeyRepository.toStoredFormat(
        key.id,
        key.workspaceId,
        identityKeys.userId,
        key.generation,
        key.key
      )
      await this.keyRepository.saveKey(key.workspaceId, storedKey)
      this.logger.debug(`Persisted workspace key ${key.id} for workspace ${key.workspaceId}`)
    }
  }
}
