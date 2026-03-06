import { LinkInviteResponse } from "../../models/invite-types"
import { buildAPIHeaders } from "../../utils/api-headers"
import { AccountStore } from "../../store/account-store"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"

/**
 * Gets a link invite by ID (public endpoint).
 * Used to fetch invite metadata before accepting.
 */
export class GetInvite implements UseCaseInterface<LinkInviteResponse> {
  public async execute(params: {
    inviteId: string
    accountStore: AccountStore
  }): Promise<Result<LinkInviteResponse>> {
    const { inviteId, accountStore } = params
    try {
      const response = await accountStore
        .getHttpClient()
        .get<LinkInviteResponse>(`/link-invites/${inviteId}`, buildAPIHeaders())
      return Result.ok(response)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return Result.fail(`Failed to get invite: ${message}`)
    }
  }
}
