import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { buildApiWorkspacePath } from "../../utils/workspace-routes"

interface MentionableUserIdsResponse {
  user_ids: string[]
}

/**
 * Fetches user IDs that can be mentioned for an ACL-scoped resource.
 */
export class GetMentionableUserIds implements UseCaseInterface<string[]> {
  constructor(private readonly executeAuthenticatedRequest: ExecuteAuthenticatedRequest) {}

  public async execute(params: {
    workspaceId: string
    resourceType: string
    resourceId: string
  }): Promise<Result<string[]>> {
    const { workspaceId, resourceType, resourceId } = params

    try {
      const url = buildApiWorkspacePath(workspaceId, `/mentions/${resourceType}/${resourceId}`)
      const response = await this.executeAuthenticatedRequest.executeGet<MentionableUserIdsResponse>(url)
      return Result.ok(response.user_ids)
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : "Failed to fetch mentionable user IDs")
    }
  }
}
