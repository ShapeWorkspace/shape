import type { UserInviteResponse, UserInvitesListResponse } from "../../models/user-invite"
import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { buildApiWorkspacePath } from "../../utils/workspace-routes"

/**
 * Fetches all pending user invites for a workspace (admin view).
 */
export class GetWorkspaceUserInvites implements UseCaseInterface<UserInviteResponse[]> {
  constructor(private readonly executeAuthenticatedRequest: ExecuteAuthenticatedRequest) {}

  public async execute(params: { workspaceId: string }): Promise<Result<UserInviteResponse[]>> {
    const { workspaceId } = params

    try {
      const url = buildApiWorkspacePath(workspaceId, "/user-invites")
      const response = await this.executeAuthenticatedRequest.executeGet<UserInvitesListResponse>(url)
      return Result.ok(response.invites ?? [])
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : "Failed to fetch user invites")
    }
  }
}
