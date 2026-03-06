import {
  type ACLEntry,
  type ACLPermission,
  type ACLEntryServerDto,
  aclEntryFromServerDto,
} from "../../models/acl-entry"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { MakeWorkspaceRequest } from "../network/MakeWorkspaceRequest"

export class UpdateEntityACLEntry implements UseCaseInterface<ACLEntry> {
  constructor(private readonly makeWorkspaceRequest: MakeWorkspaceRequest) {}

  public async execute(params: {
    entityId: string
    entryId: string
    permission: ACLPermission
  }): Promise<Result<ACLEntry>> {
    const { entityId, entryId, permission } = params

    const url = `entities/${entityId}/acl/${entryId}`
    const response = await this.makeWorkspaceRequest.executePut<
      { permission: ACLPermission },
      ACLEntryServerDto
    >(url, { permission })
    if (response.isFailed()) {
      return Result.fail(response.getError().message)
    }
    return Result.ok(aclEntryFromServerDto(response.getValue()))
  }
}
