import { WorkspaceInvite, WorkspaceInviteServerDto } from "../../models/workspace-invite"
import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { buildApiWorkspacePath } from "../../utils/workspace-routes"

interface WorkspaceInvitesListResponse {
  invites: WorkspaceInviteServerDto[]
}

/**
 * Fetches active token invites for a workspace (admin view).
 */
export class GetWorkspaceInvites implements UseCaseInterface<WorkspaceInvite[]> {
  constructor(private readonly executeAuthenticatedRequest: ExecuteAuthenticatedRequest) {}

  public async execute(params: { workspaceId: string }): Promise<Result<WorkspaceInvite[]>> {
    const { workspaceId } = params

    try {
      const url = buildApiWorkspacePath(workspaceId, "/invites")
      const response = await this.executeAuthenticatedRequest.executeGet<WorkspaceInvitesListResponse>(url)
      const invites = (response.invites ?? []).map(WorkspaceInvite.fromServerDto)
      return Result.ok(invites)
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : "Failed to fetch workspace invites")
    }
  }
}
