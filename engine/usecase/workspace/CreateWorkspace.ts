import { IdentityKeys } from "../../models/auth-types"
import { Workspace } from "../../models/workspace"
import { WorkspaceSubscription } from "../../models/workspace-subscription"
import { DecryptedWorkspaceKey } from "../../models/workspace-key"
import { WorkspaceKeyRepository } from "../../repositories"
import { AccountStore } from "../../store/account-store"
import { WorkspaceStore } from "../../store/workspace-store"
import { Logger } from "../../utils/logger"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"
import { BuildCreateWorkspaceRequest } from "./BuildCreateWorkspaceRequest"
import { GenerateInitialWorkspaceKeyParams } from "./GenerateInitialWorkspaceKeyParams"
import { NetworkCreateWorkspaceWithInitialKey } from "./NetworkCreateWorkspaceWithInitialKey"
import { RefreshAuthTokens } from "../user/RefreshAuthTokens"

/**
 * Creates a new workspace on the server and applies the response to local state.
 *
 * This use case orchestrates the full workspace creation flow:
 * 1. Generates initial workspace key params (client-side UUID, encrypted key share)
 * 2. Builds the API request payload
 * 3. Sends the request to the server
 * 4. Validates the response (security checks for workspace/key binding)
 * 5. Persists the workspace key to IndexedDB
 * 6. Updates the workspace store with the new workspace
 *
 * Security invariants enforced:
 * - The workspace ID is client-generated and cryptographically bound in the key signature
 * - The server response must echo the client-chosen workspace ID
 * - The decrypted key must be scoped to the workspace we created
 */
export class CreateWorkspace implements UseCaseInterface<Workspace> {
  constructor(
    private readonly generateInitialWorkspaceKeyParams: GenerateInitialWorkspaceKeyParams,
    private readonly buildCreateWorkspaceRequest: BuildCreateWorkspaceRequest,
    private readonly workspaceStore: WorkspaceStore,
    private readonly keyRepository: WorkspaceKeyRepository,
    private readonly logger: Logger
  ) {}

  async execute(
    name: string,
    accountStore: AccountStore,
    identityKeys: IdentityKeys
  ): Promise<Result<Workspace>> {
    // Step 1: Generate initial workspace key params
    const initialKeyResult = this.generateInitialWorkspaceKeyParams.execute(identityKeys)
    if (initialKeyResult.isFailed()) {
      return Result.fail(`Failed to generate initial workspace key: ${initialKeyResult.getError()}`)
    }

    const { workspaceId, params: initialKeyParams, decryptedKey } = initialKeyResult.getValue()

    // Step 2: Build API request
    const requestResult = this.buildCreateWorkspaceRequest.execute(workspaceId, name, initialKeyParams)
    if (requestResult.isFailed()) {
      return Result.fail(`Failed to build create workspace request: ${requestResult.getError()}`)
    }
    const request = requestResult.getValue()

    // Step 3: Construct account-scoped network dependencies and send request
    const refreshAuthTokens = new RefreshAuthTokens(accountStore)
    const executeAuthenticatedRequest = new ExecuteAuthenticatedRequest(
      accountStore.getHttpClient(),
      accountStore,
      refreshAuthTokens,
      this.logger
    )
    const networkCreateWorkspace = new NetworkCreateWorkspaceWithInitialKey(executeAuthenticatedRequest)

    const responseResult = await networkCreateWorkspace.execute(request)
    if (responseResult.isFailed()) {
      return Result.fail(`Failed to create workspace on server: ${responseResult.getError()}`)
    }
    const response = responseResult.getValue()

    // Step 4: Security validation - ensure key is scoped to correct workspace
    if (decryptedKey.workspaceId !== request.id) {
      this.logger.error(
        `Workspace key scope mismatch: key ${decryptedKey.id} belongs to ${decryptedKey.workspaceId} but request targets ${request.id}`
      )
      return Result.fail("Workspace key does not match requested workspace")
    }

    // Security validation - ensure server echoed our workspace ID
    if (response.workspace.uuid !== request.id) {
      this.logger.error(
        `Workspace ID mismatch: server returned ${response.workspace.uuid} but client requested ${request.id}`
      )
      return Result.fail("Workspace ID mismatch - aborting workspace creation")
    }

    // Step 5: Build workspace model from response
    let workspace = Workspace.fromServerDto(response.workspace)

    // Bind workspace to authenticated user if server omitted user_id
    if (!workspace.userId?.trim()) {
      workspace = workspace.withUserId(identityKeys.userId)
    }

    // Apply subscription if present
    if (!workspace.subscription && response.subscription) {
      workspace = workspace.withSubscription(WorkspaceSubscription.fromServerDto(response.subscription))
    }

    // Step 6: Persist workspace key to IndexedDB (before Application exists)
    await this.persistWorkspaceKey(decryptedKey, identityKeys)

    // Step 7: Update store and persist
    this.workspaceStore.setWorkspace(workspace)
    this.workspaceStore.setCurrentWorkspace(workspace)

    await Promise.all([
      this.workspaceStore.persistWorkspaces(),
      this.workspaceStore.persistCurrentWorkspace(),
      this.workspaceStore.persistWorkspaceEntrySelections(),
    ])

    return Result.ok(workspace)
  }

  /**
   * Persists a workspace key to IndexedDB, scoped to the user.
   */
  private async persistWorkspaceKey(key: DecryptedWorkspaceKey, identityKeys: IdentityKeys): Promise<void> {
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
