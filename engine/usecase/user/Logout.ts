import { buildAuthenticatedAPIHeaders } from "../../utils/api-headers"
import { AccountStoreContainer } from "../../store/account-store-container"
import { UsersStore } from "../../store/users-store"
import { WorkspaceStore } from "../../store/workspace-store"
import { Logger } from "../../utils/logger"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"

/**
 * Logs out a single account by clearing its credentials and removing its data.
 * Also notifies the server to invalidate the session tokens.
 */
export class Logout implements UseCaseInterface<void> {
  constructor(
    private readonly accountStoreContainer: AccountStoreContainer,
    private readonly usersStore: UsersStore,
    private readonly workspaceStore: WorkspaceStore,
    private readonly logger: Logger
  ) {}

  public async execute(userId: string): Promise<Result<void>> {
    const accountStore = this.accountStoreContainer.getSureAccountStore(userId)
    const httpClient = accountStore.getHttpClient()

    // Notify the server to invalidate the session tokens.
    // This is best-effort - we proceed with local cleanup even if it fails.
    try {
      const accountStore = this.accountStoreContainer.getAccountStore(userId)
      if (accountStore) {
        const appToken = accountStore.getAppToken()
        const headers = buildAuthenticatedAPIHeaders(userId, appToken ?? undefined)
        await httpClient.post("/auth/logout", "{}", headers)
      }
    } catch (error) {
      this.logger.warn("Logout request failed, continuing with local cleanup", error)
    }

    // Clear local credentials and user data.
    await this.accountStoreContainer.clearAccountStore(userId)
    await this.usersStore.removeUser(userId)

    // Remove workspaces tied to the account.
    await this.workspaceStore.clearWorkspacesForUser(userId)

    return Result.ok()
  }
}
