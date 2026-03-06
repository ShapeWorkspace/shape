import type { UserInviteResponse, UserInvitesListResponse } from "../../models/user-invite"
import { buildAuthenticatedAPIHeaders } from "../../utils/api-headers"
import { AccountStoreContainer } from "../../store/account-store-container"
import { Logger } from "../../utils/logger"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"

export class GetMyPendingInvites implements UseCaseInterface<UserInviteResponse[]> {
  constructor(
    private readonly accountStoreContainer: AccountStoreContainer,
    private readonly logger: Logger
  ) {}

  public async execute(accountId: string): Promise<Result<UserInviteResponse[]>> {
    const accountStore = this.accountStoreContainer.getSureAccountStore(accountId)

    try {
      const headers = buildAuthenticatedAPIHeaders(accountId, accountStore.getAppToken() ?? undefined)
      const response = await accountStore
        .getHttpClient()
        .get<UserInvitesListResponse>("/user/invites", headers)
      return Result.ok(response.invites ?? [])
    } catch (error) {
      this.logger.warn("Failed to fetch pending user invites", error)
      return Result.fail(error instanceof Error ? error.message : "Unknown error")
    }
  }
}
