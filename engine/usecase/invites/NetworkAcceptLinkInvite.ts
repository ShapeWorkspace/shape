import { AcceptLinkInviteRequest } from "../../models/workspace-account-requests"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"

export class NetworkAcceptLinkInvite implements UseCaseInterface<void> {
  constructor(private readonly executeAuthenticatedRequest: ExecuteAuthenticatedRequest) {}

  async execute(inviteId: string, request: AcceptLinkInviteRequest): Promise<Result<void>> {
    try {
      await this.executeAuthenticatedRequest.executePost(
        `/link-invites/${inviteId}/accept`,
        JSON.stringify(request)
      )
      return Result.ok(undefined)
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : "Unknown error")
    }
  }
}
