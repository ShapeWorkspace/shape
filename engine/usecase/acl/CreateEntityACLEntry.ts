import {
  type ACLEntry,
  type ACLPermission,
  type ACLSubjectType,
  type ACLEntryServerDto,
  aclEntryFromServerDto,
  CreateACLEntryRequest,
} from "../../models/acl-entry"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { MakeWorkspaceRequest } from "../network/MakeWorkspaceRequest"

export class CreateEntityACLEntry implements UseCaseInterface<ACLEntry> {
  constructor(private readonly makeWorkspaceRequest: MakeWorkspaceRequest) {}

  public async execute(params: {
    entityId: string
    subjectType: ACLSubjectType
    subjectId: string
    permission: ACLPermission
  }): Promise<Result<ACLEntry>> {
    const { entityId, subjectType, subjectId, permission } = params

    const url = `entities/${entityId}/acl`

    const response = await this.makeWorkspaceRequest.executePost<CreateACLEntryRequest, ACLEntryServerDto>(
      url,
      {
        subject_type: subjectType,
        subject_id: subjectId,
        permission,
      }
    )
    if (response.isFailed()) {
      return Result.fail(response.getError().message)
    }
    return Result.ok(aclEntryFromServerDto(response.getValue()))
  }
}
