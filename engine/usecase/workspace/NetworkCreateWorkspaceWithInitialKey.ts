import { CreateWorkspaceRequest, CreateWorkspaceResponse } from "../../models/workspace-account-requests"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"

export class NetworkCreateWorkspaceWithInitialKey implements UseCaseInterface<CreateWorkspaceResponse> {
  constructor(private readonly executeAuthenticatedRequest: ExecuteAuthenticatedRequest) {}

  async execute(request: CreateWorkspaceRequest): Promise<Result<CreateWorkspaceResponse>> {
    try {
      const response = await this.executeAuthenticatedRequest.executePost<CreateWorkspaceResponse>(
        `/workspaces`,
        JSON.stringify(request)
      )
      return Result.ok(response)
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : "Unknown error")
    }
  }
}
