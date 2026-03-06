import { buildAuthenticatedAPIHeaders } from "../../utils/api-headers"
import { AccountStoreContainer } from "../../store/account-store-container"
import { Logger } from "../../utils/logger"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"

interface AcceptWorkspaceInviteResponse {
  message: string
}

/**
 * Accepts a token invite for an authenticated account.
 */
export class AcceptWorkspaceInviteForAccount
  implements UseCaseInterface<AcceptWorkspaceInviteResponse>
{
  constructor(
    private readonly accountStoreContainer: AccountStoreContainer,
    private readonly logger: Logger
  ) {}

  public async execute(params: {
    accountId: string
    token: string
  }): Promise<Result<AcceptWorkspaceInviteResponse>> {
    const { accountId, token } = params
    const accountStore = this.accountStoreContainer.getSureAccountStore(accountId)

    try {
      const headers = buildAuthenticatedAPIHeaders(accountId, accountStore.getAppToken() ?? undefined)
      const response = await accountStore
        .getHttpClient()
        .post<AcceptWorkspaceInviteResponse>(`/invites/${token}/accept`, JSON.stringify({}), headers)
      return Result.ok(response)
    } catch (error) {
      this.logger.warn("Failed to accept workspace invite", error)
      return Result.fail(error instanceof Error ? error.message : "Unknown error")
    }
  }
}
