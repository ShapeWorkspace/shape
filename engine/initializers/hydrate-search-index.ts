import { RunOnceInitializer } from "./run-once-initializer"
import { CacheStores } from "../store/cache-stores"
import { EntityRepository } from "../repositories/entity-repository"
import type { SearchIndexInterface } from "../search/search-types"
import { logger } from "../utils/logger"
import type { EntityType } from "../utils/encryption-types"
import {
  DecryptEntityWithKeyLookup,
  GetOrFetchEntity,
  IndexBlockEntity,
  resolveEntityBlockFieldForEntityType,
} from "../usecase/entities/entities"

export class HydrateSearchIndexInitializer extends RunOnceInitializer {
  constructor(
    private readonly cacheStores: CacheStores,
    private readonly entityRepository: EntityRepository,
    private readonly getOrFetchEntity: GetOrFetchEntity,
    private readonly decryptEntityWithKeyLookup: DecryptEntityWithKeyLookup,
    private readonly searchIndex: SearchIndexInterface,
    private readonly indexBlockEntity: IndexBlockEntity
  ) {
    super()
  }

  public async execute(): Promise<void> {
    super.execute()
    await this.hydrateFromLocalEntities()
    await this.hydrateFromDrafts()
  }

  private async hydrateFromLocalEntities(): Promise<void> {
    const entities = await this.entityRepository.getEntitys()
    if (entities.length === 0) {
      return
    }

    // Hydrate in dependency-aware passes. Child entities can depend on parent keys
    // that are only available after the parent entity is decrypted and cached.
    let pending = [...entities]
    const lastErrorsByEntityId = new Map<string, string>()

    while (pending.length > 0) {
      const nextPending: typeof pending = []
      let hydratedInThisPass = 0

      for (const entity of pending) {
        const result = await this.getOrFetchEntity.execute(entity.id)
        if (result.isFailed()) {
          lastErrorsByEntityId.set(entity.id, result.getError())
          nextPending.push(entity)
          continue
        }

        hydratedInThisPass += 1
        const clientEntity = result.getValue()
        this.searchIndex.indexClientEntity(clientEntity, { notify: false, skipDebounce: true })
        await this.indexBlocksIfNeeded(clientEntity.id, clientEntity.entityType, false)
      }

      if (nextPending.length === 0) {
        return
      }

      if (hydratedInThisPass === 0) {
        for (const unresolved of nextPending) {
          logger.warn("HydrateSearchIndexInitializer: failed to hydrate cached entity for search", {
            entityId: unresolved.id,
            error: lastErrorsByEntityId.get(unresolved.id) ?? "Unknown error",
          })
        }
        return
      }

      pending = nextPending
    }
  }

  private async hydrateFromDrafts(): Promise<void> {
    const drafts = Array.from(this.cacheStores.draftCache.values())
    if (drafts.length === 0) {
      return
    }

    // Apply delete drafts immediately so local canonical entities are removed before
    // hydrated draft creates/updates are indexed.
    const nonDeleteDrafts: typeof drafts = []
    for (const draft of drafts) {
      if (!draft.deleteEntity) {
        nonDeleteDrafts.push(draft)
        continue
      }

      this.cacheStores.entityStore.delete(draft.id)
      await this.searchIndex.removeEntity(draft.id, draft.entity.entity_type)
    }

    if (nonDeleteDrafts.length === 0) {
      return
    }

    // Hydrate in dependency-aware passes so child drafts can resolve wrapping keys
    // once their parents have been hydrated in earlier passes.
    let pending = [...nonDeleteDrafts]
    const lastErrorsByEntityId = new Map<string, string>()

    while (pending.length > 0) {
      const nextPending: typeof pending = []
      let hydratedInThisPass = 0

      for (const draft of pending) {
        const decryptResult = this.decryptEntityWithKeyLookup.execute(draft.entity)
        if (decryptResult.isFailed()) {
          lastErrorsByEntityId.set(draft.id, decryptResult.getError())
          nextPending.push(draft)
          continue
        }

        hydratedInThisPass += 1
        const clientEntity = decryptResult.getValue()
        this.cacheStores.entityStore.setDirtyVersion(clientEntity)
        this.searchIndex.indexClientEntity(clientEntity, { notify: false, skipDebounce: true })
        await this.indexBlocksIfNeeded(clientEntity.id, clientEntity.entityType, true)
      }

      if (nextPending.length === 0) {
        return
      }

      if (hydratedInThisPass === 0) {
        for (const unresolved of nextPending) {
          logger.warn("HydrateSearchIndexInitializer: failed to hydrate draft entity for search", {
            entityId: unresolved.id,
            error: lastErrorsByEntityId.get(unresolved.id) ?? "Unknown error",
          })
        }
        return
      }

      pending = nextPending
    }
  }

  private async indexBlocksIfNeeded(entityId: string, entityType: EntityType, isDraft: boolean): Promise<void> {
    if (!resolveEntityBlockFieldForEntityType(entityType)) {
      return
    }

    const blockIndexResult = await this.indexBlockEntity.execute(entityId)
    if (blockIndexResult.isFailed()) {
      logger.warn(
        isDraft
          ? "HydrateSearchIndexInitializer: failed to hydrate draft block index for entity"
          : "HydrateSearchIndexInitializer: failed to hydrate block index for entity",
        {
          entityId,
          error: blockIndexResult.getError(),
        }
      )
    }
  }
}
