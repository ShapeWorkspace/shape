import { buildAuthenticatedAPIHeaders } from "../../utils/api-headers"
import { AccountStoreContainer } from "../../store/account-store-container"
import { Logger } from "../../utils/logger"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"

interface AcceptUserInviteResponse {
  message: string
  workspace_id: string
}

export class AcceptUserInvite implements UseCaseInterface<AcceptUserInviteResponse> {
  constructor(
    private readonly accountStoreContainer: AccountStoreContainer,
    private readonly logger: Logger
  ) {}

  public async execute(params: {
    accountId: string
    inviteId: string
  }): Promise<Result<AcceptUserInviteResponse>> {
    const { accountId, inviteId } = params
    const accountStore = this.accountStoreContainer.getSureAccountStore(accountId)

    try {
      const headers = buildAuthenticatedAPIHeaders(accountId, accountStore.getAppToken() ?? undefined)
      const response = await accountStore
        .getHttpClient()
        .post<AcceptUserInviteResponse>(`/user/invites/${inviteId}/accept`, JSON.stringify({}), headers)
      return Result.ok(response)
    } catch (error) {
      this.logger.warn("Failed to accept user invite", error)
      return Result.fail(error instanceof Error ? error.message : "Unknown error")
    }
  }
}
