import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { MakeWorkspaceRequest } from "../network/MakeWorkspaceRequest"

export class DeleteEntityACLEntry implements UseCaseInterface<void> {
  constructor(private readonly makeWorkspaceRequest: MakeWorkspaceRequest) {}

  public async execute(params: { entityId: string; entryId: string }): Promise<Result<void>> {
    const { entityId, entryId } = params

    const url = `entities/${entityId}/acl/${entryId}`
    const response = await this.makeWorkspaceRequest.executeDelete(url)
    if (response.isFailed()) {
      return Result.fail(response.getError().message)
    }
    return Result.ok()
  }
}
