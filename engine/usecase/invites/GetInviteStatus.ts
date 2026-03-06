import type { InviteStatusResponse } from "../../models/invite-status"
import { buildAPIHeaders } from "../../utils/api-headers"
import { AccountStore } from "../../store/account-store"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"

/**
 * Gets generic invite status by token (workspace/email invite tokens).
 * Public endpoint used before an authenticated workspace runtime exists.
 */
export class GetInviteStatus implements UseCaseInterface<InviteStatusResponse> {
  public async execute(params: {
    token: string
    accountStore: AccountStore
  }): Promise<Result<InviteStatusResponse>> {
    const { token, accountStore } = params

    try {
      const response = await accountStore.getHttpClient().get<InviteStatusResponse>(
        `/invites/${token}`,
        buildAPIHeaders()
      )
      return Result.ok(response)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return Result.fail(`Failed to get invite status: ${message}`)
    }
  }
}
