import type { WorkspaceMemberRole } from "../../models/workspace-member"
import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { buildApiWorkspacePath } from "../../utils/workspace-routes"
import type { AddMemberToWorkspaceRequest, AddWorkspaceMemberServerResponse } from "./types"

/**
 * Invites or adds a member to a workspace by email.
 */
export class AddMemberToWorkspace implements UseCaseInterface<AddWorkspaceMemberServerResponse> {
  constructor(private readonly executeAuthenticatedRequest: ExecuteAuthenticatedRequest) {}

  public async execute(params: {
    workspaceId: string
    email: string
    role: WorkspaceMemberRole
  }): Promise<Result<AddWorkspaceMemberServerResponse>> {
    const { workspaceId, email, role } = params

    try {
      const url = buildApiWorkspacePath(workspaceId, "/members")
      const request: AddMemberToWorkspaceRequest = { email, role }
      const response = await this.executeAuthenticatedRequest.executePost<AddWorkspaceMemberServerResponse>(
        url,
        JSON.stringify(request)
      )
      return Result.ok(response)
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : "Failed to add workspace member")
    }
  }
}
