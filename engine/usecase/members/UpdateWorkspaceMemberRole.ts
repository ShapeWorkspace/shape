import {
  WorkspaceMember,
  type WorkspaceMemberRole,
  WorkspaceMemberServer,
  WorkspaceMemberFromServerDto,
} from "../../models/workspace-member"
import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { buildApiWorkspacePath } from "../../utils/workspace-routes"
import type { UpdateWorkspaceMemberRoleRequest } from "./types"

export class UpdateWorkspaceMemberRole implements UseCaseInterface<WorkspaceMember> {
  constructor(private readonly executeAuthenticatedRequest: ExecuteAuthenticatedRequest) {}

  public async execute(params: {
    workspaceId: string
    userId: string
    role: WorkspaceMemberRole
  }): Promise<Result<WorkspaceMember>> {
    const { workspaceId, userId, role } = params

    try {
      const url = buildApiWorkspacePath(workspaceId, `/members/${userId}`)
      const request: UpdateWorkspaceMemberRoleRequest = { role }
      const response = await this.executeAuthenticatedRequest.executePut<WorkspaceMemberServer>(
        url,
        JSON.stringify(request)
      )
      return Result.ok(WorkspaceMemberFromServerDto(response))
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : "Failed to update workspace member role")
    }
  }
}
