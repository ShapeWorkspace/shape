import type { LinkedEntityInput, SyncEntityLinksRequest } from "../../models/entity-link"
import { Result } from "../../utils/Result"
import { type UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { MakeWorkspaceRequest } from "../network/MakeWorkspaceRequest"

export class SyncEntityLinks implements UseCaseInterface<void> {
  constructor(private readonly makeWorkspaceRequest: MakeWorkspaceRequest) {}

  public async execute(params: {
    entityId: string
    sourceEntityType: string
    linkedEntities: LinkedEntityInput[]
  }): Promise<Result<void>> {
    const { entityId, sourceEntityType, linkedEntities } = params
    const response = await this.makeWorkspaceRequest.executePostNoContent<SyncEntityLinksRequest>(
      `entity-links/${entityId}/sync`,
      {
        source_entity_type: sourceEntityType,
        linked_entities: linkedEntities,
      }
    )
    if (response.isFailed()) {
      return Result.fail(response.getErrorMessage())
    }
    return Result.ok(undefined)
  }
}
