import type { WorkspaceMemberRole } from "../../models/workspace-member"
import type { UserInviteResponse } from "../../models/user-invite"
import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { buildApiWorkspacePath } from "../../utils/workspace-routes"

/**
 * Creates an invite for an existing user to join a workspace by email.
 * The response includes invitee public keys for key sharing.
 */
export class CreateUserInviteForEmailAddress implements UseCaseInterface<UserInviteResponse> {
  constructor(private readonly executeAuthenticatedRequest: ExecuteAuthenticatedRequest) {}

  public async execute(params: {
    workspaceId: string
    inviteeEmailAddress: string
    role: WorkspaceMemberRole
  }): Promise<Result<UserInviteResponse>> {
    const { workspaceId, inviteeEmailAddress, role } = params

    try {
      const url = buildApiWorkspacePath(workspaceId, "/user-invites")
      const body = JSON.stringify({ invitee_email: inviteeEmailAddress, role })
      const response = await this.executeAuthenticatedRequest.executePost<UserInviteResponse>(url, body)
      return Result.ok(response)
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : "Failed to create user invite")
    }
  }
}
