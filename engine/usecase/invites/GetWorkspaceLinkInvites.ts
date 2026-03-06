import type { LinkInviteResponse } from "../../models/invite-types"
import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { buildApiWorkspacePath } from "../../utils/workspace-routes"

interface LinkInvitesListResponse {
  invites: LinkInviteResponse[]
}

/**
 * Fetches all active link invites for a workspace (admin view).
 */
export class GetWorkspaceLinkInvites implements UseCaseInterface<LinkInviteResponse[]> {
  constructor(private readonly executeAuthenticatedRequest: ExecuteAuthenticatedRequest) {}

  public async execute(params: { workspaceId: string }): Promise<Result<LinkInviteResponse[]>> {
    const { workspaceId } = params

    try {
      const url = buildApiWorkspacePath(workspaceId, "/link-invites")
      const response = await this.executeAuthenticatedRequest.executeGet<LinkInvitesListResponse>(url)
      return Result.ok(response.invites ?? [])
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : "Failed to fetch link invites")
    }
  }
}
