import type { WorkspaceMemberRole } from "../../models/workspace-member"
import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { buildApiWorkspacePath } from "../../utils/workspace-routes"

export interface WorkspaceInviteResponse {
  token: string
  workspace_id: string
  created_by: string
  role: WorkspaceMemberRole
  expires_at?: string
  created_at: string
}

/**
 * Creates a shareable workspace invite token.
 */
export class CreateWorkspaceInvite implements UseCaseInterface<WorkspaceInviteResponse> {
  constructor(private readonly executeAuthenticatedRequest: ExecuteAuthenticatedRequest) {}

  public async execute(params: { workspaceId: string }): Promise<Result<WorkspaceInviteResponse>> {
    const { workspaceId } = params

    try {
      const url = buildApiWorkspacePath(workspaceId, "/invites")
      const response = await this.executeAuthenticatedRequest.executePost<WorkspaceInviteResponse>(
        url,
        JSON.stringify({})
      )
      return Result.ok(response)
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : "Failed to create workspace invite")
    }
  }
}
