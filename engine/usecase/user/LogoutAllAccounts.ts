import { buildAuthenticatedAPIHeaders } from "../../utils/api-headers"
import { AccountStoreContainer } from "../../store/account-store-container"
import { UsersStore } from "../../store/users-store"
import { WorkspaceStore } from "../../store/workspace-store"
import { Logger } from "../../utils/logger"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"

/**
 * Logs out all authenticated accounts by clearing credentials and removing all user data.
 * Also notifies the server to invalidate all session tokens.
 */
export class LogoutAllAccounts implements UseCaseInterface<void> {
  constructor(
    private readonly accountStoreContainer: AccountStoreContainer,
    private readonly usersStore: UsersStore,
    private readonly workspaceStore: WorkspaceStore,
    private readonly logger: Logger
  ) {}

  public async execute(): Promise<Result<void>> {
    // Pick an account to use for the logout-all request.
    // Prefer the current workspace's account, fallback to first user.
    const accountIdForRequest =
      this.workspaceStore.getCurrentWorkspace()?.userId ?? this.usersStore.getUsers()[0]?.uuid ?? null

    // Notify the server to invalidate all session tokens.
    // This is best-effort - we proceed with local cleanup even if it fails.
    if (accountIdForRequest) {
      try {
        const accountStore = this.accountStoreContainer.getAccountStore(accountIdForRequest)
        if (accountStore) {
          const appToken = accountStore.getAppToken()
          const headers = buildAuthenticatedAPIHeaders(accountIdForRequest, appToken ?? undefined)
          await accountStore.getHttpClient().post("/auth/logout-all", "{}", headers)
        }
      } catch (error) {
        this.logger.warn("Logout-all request failed, continuing with local cleanup", error)
      }
    }

    // Clear all local credentials, user data, and workspaces.
    await this.accountStoreContainer.clearAllAccountStores()
    await this.usersStore.clearUsers()
    await this.workspaceStore.clearAllWorkspaces()

    return Result.ok()
  }
}
