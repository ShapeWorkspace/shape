import {
  type AvailableSubjects,
  type AvailableSubjectsResponse,
  availableSubjectsFromServerDto,
} from "../../models/team"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { MakeWorkspaceRequest } from "../network/MakeWorkspaceRequest"

export class GetAvailableSubjectsForEntity implements UseCaseInterface<AvailableSubjects> {
  constructor(private readonly makeWorkspaceRequest: MakeWorkspaceRequest) {}

  public async execute(params: { entityId: string }): Promise<Result<AvailableSubjects>> {
    const { entityId } = params

    const url = `entities/${entityId}/acl/available-subjects`
    const response = await this.makeWorkspaceRequest.executeGet<AvailableSubjectsResponse>(url)
    if (response.isFailed()) {
      return Result.fail(response.getError().message)
    }
    return Result.ok(availableSubjectsFromServerDto(response.getValue()))
  }
}
