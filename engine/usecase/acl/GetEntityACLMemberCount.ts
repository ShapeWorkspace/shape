import { type GetACLMemberCountResponse } from "../../models/acl-entry"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { MakeWorkspaceRequest } from "../network/MakeWorkspaceRequest"

export class GetEntityACLMemberCount implements UseCaseInterface<number> {
  constructor(private readonly makeWorkspaceRequest: MakeWorkspaceRequest) {}

  public async execute(params: { entityId: string }): Promise<Result<number>> {
    const { entityId } = params

    const url = `entities/${entityId}/acl/count`
    const response = await this.makeWorkspaceRequest.executeGet<GetACLMemberCountResponse>(url)
    if (response.isFailed()) {
      return Result.fail(response.getError().message)
    }
    return Result.ok(response.getValue().count ?? 0)
  }
}
