import { WorkspaceEmailInvite, type WorkspaceEmailInviteServerDto } from "../../models/workspace-email-invite"
import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { buildApiWorkspacePath } from "../../utils/workspace-routes"

interface PendingInvitesResponse {
  invites: WorkspaceEmailInviteServerDto[]
}

/**
 * Fetches pending email invites for a workspace.
 * This is admin-only on the server.
 */
export class GetWorkspacePendingInvites implements UseCaseInterface<WorkspaceEmailInvite[]> {
  constructor(private readonly executeAuthenticatedRequest: ExecuteAuthenticatedRequest) {}

  public async execute(params: { workspaceId: string }): Promise<Result<WorkspaceEmailInvite[]>> {
    const { workspaceId } = params

    try {
      const url = buildApiWorkspacePath(workspaceId, "/pending-invites")
      const response = await this.executeAuthenticatedRequest.executeGet<PendingInvitesResponse>(url)
      const invites = response.invites ?? []
      return Result.ok(invites.map(invite => WorkspaceEmailInvite.fromServerDto(invite)))
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : "Failed to fetch pending invites")
    }
  }
}
