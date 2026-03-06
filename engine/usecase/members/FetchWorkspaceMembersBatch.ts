import {
  WorkspaceMember,
  WorkspaceMemberFromServerDto,
  WorkspaceMemberServer,
} from "../../models/workspace-member"
import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { buildApiWorkspacePath } from "../../utils/workspace-routes"

export class FetchWorkspaceMembersBatch implements UseCaseInterface<WorkspaceMember[]> {
  constructor(private readonly executeAuthenticatedRequest: ExecuteAuthenticatedRequest) {}

  public async execute(params: {
    workspaceId: string
    userIds: string[]
  }): Promise<Result<WorkspaceMember[]>> {
    const { workspaceId, userIds } = params

    try {
      const url = buildApiWorkspacePath(workspaceId, "/members/batch")
      const body = JSON.stringify({ user_ids: userIds })
      const response = await this.executeAuthenticatedRequest.executePost<WorkspaceMemberServer[]>(url, body)
      const members = response.map(WorkspaceMemberFromServerDto)
      return Result.ok(members)
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : "Failed to fetch workspace members")
    }
  }
}
