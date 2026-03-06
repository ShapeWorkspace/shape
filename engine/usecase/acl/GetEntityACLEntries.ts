import { type ACLEntry, type GetACLEntriesResponse, aclEntryFromServerDto } from "../../models/acl-entry"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { MakeWorkspaceRequest } from "../network/MakeWorkspaceRequest"

export class GetEntityACLEntries implements UseCaseInterface<ACLEntry[]> {
  constructor(private readonly makeWorkspaceRequest: MakeWorkspaceRequest) {}

  public async execute(params: { entityId: string }): Promise<Result<ACLEntry[]>> {
    const { entityId } = params

    const url = `entities/${entityId}/acl`
    const response = await this.makeWorkspaceRequest.executeGet<GetACLEntriesResponse>(url)
    if (response.isFailed()) {
      return Result.fail(response.getError().message)
    }
    const entries = (response.getValue().entries ?? []).map(aclEntryFromServerDto)
    return Result.ok(entries)
  }
}
