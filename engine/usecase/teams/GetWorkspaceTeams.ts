import { type GetTeamsResponse, teamFromServerDto, type Team } from "../../models/team"
import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { buildApiWorkspacePath } from "../../utils/workspace-routes"

/**
 * Fetches all teams in a workspace, with the Everyone team first.
 */
export class GetWorkspaceTeams implements UseCaseInterface<Team[]> {
  constructor(private readonly executeAuthenticatedRequest: ExecuteAuthenticatedRequest) {}

  public async execute(params: { workspaceId: string }): Promise<Result<Team[]>> {
    const { workspaceId } = params

    try {
      const url = buildApiWorkspacePath(workspaceId, "/teams")
      const response = await this.executeAuthenticatedRequest.executeGet<GetTeamsResponse>(url)
      const teams = (response.teams ?? []).map(teamFromServerDto)
      return Result.ok(teams)
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : "Failed to fetch workspace teams")
    }
  }
}
