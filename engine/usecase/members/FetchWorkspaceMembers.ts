import {
  WorkspaceMember,
  WorkspaceMemberFromServerDto,
  WorkspaceMemberServer,
} from "../../models/workspace-member"
import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { buildApiWorkspacePath } from "../../utils/workspace-routes"

export class FetchWorkspaceMembers implements UseCaseInterface<WorkspaceMember[]> {
  constructor(private readonly executeAuthenticatedRequest: ExecuteAuthenticatedRequest) {}

  public async execute(params: { workspaceId: string }): Promise<Result<WorkspaceMember[]>> {
    const { workspaceId } = params

    try {
      const url = buildApiWorkspacePath(workspaceId, "/members")
      const response = await this.executeAuthenticatedRequest.executeGet<WorkspaceMemberServer[]>(url)
      return Result.ok(response.map(WorkspaceMemberFromServerDto))
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : "Failed to fetch workspace members")
    }
  }
}
