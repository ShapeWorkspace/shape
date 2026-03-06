import {
  entityLinksFromDtos,
  type GetEntityLinksResponse,
  type EntityLink,
} from "../../models/entity-link"
import { Result } from "../../utils/Result"
import { type UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { MakeWorkspaceRequest } from "../network/MakeWorkspaceRequest"

export interface EntityLinksResult {
  links: EntityLink[]
  linkedBy: EntityLink[]
}

export class GetEntityLinks implements UseCaseInterface<EntityLinksResult> {
  constructor(private readonly makeWorkspaceRequest: MakeWorkspaceRequest) {}

  public async execute(params: { entityId: string; entityType?: string }): Promise<Result<EntityLinksResult>> {
    const { entityId, entityType } = params
    const queryParams = entityType ? `?entity_type=${encodeURIComponent(entityType)}` : ""
    const response = await this.makeWorkspaceRequest.executeGet<GetEntityLinksResponse>(
      `entity-links/${entityId}${queryParams}`
    )
    if (response.isFailed()) {
      return Result.fail(response.getErrorMessage())
    }

    const value = response.getValue()
    return Result.ok({
      links: entityLinksFromDtos(value.links),
      linkedBy: entityLinksFromDtos(value.linked_by),
    })
  }
}
