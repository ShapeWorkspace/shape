import { BlockRepository } from "../repositories/block-repository"
import { ServerBlock } from "../models/entity"
import { logger } from "../utils/logger"
import { SSEConnectionManager } from "../services/sse-connection-manager"
import {
  SSEEventType,
  type EntityBlockCreatedEventData,
  type SSEEventSubscription,
  type TypedSSEEventUnion,
} from "../services/sse-types"
import { PersistServerEntity, IndexBlockEntity } from "../usecase/entities/entities"

export class HandleSSEEvents {
  private unsubscribeFromSse?: () => void

  constructor(
    private readonly sseConnectionManager: SSEConnectionManager,
    private readonly persistServerEntity: PersistServerEntity,
    private readonly blockRepository: BlockRepository,
    private readonly indexBlockEntity: IndexBlockEntity
  ) {}

  public initialize(): void {
    if (this.unsubscribeFromSse) {
      throw new Error("SSE events already initialized")
    }

    const subscription: SSEEventSubscription = {
      eventTypes: [
        SSEEventType.ENTITY_CREATED,
        SSEEventType.ENTITY_UPDATED,
        SSEEventType.ENTITY_BLOCK_CREATED,
      ],
      handler: (event: TypedSSEEventUnion) => {
        if (event.type === SSEEventType.ENTITY_CREATED || event.type === SSEEventType.ENTITY_UPDATED) {
          void this.applyEntityEvent(event)
        } else if (event.type === SSEEventType.ENTITY_BLOCK_CREATED) {
          void this.applyEntityBlockEvent(event.data)
        }
      },
    }

    this.unsubscribeFromSse = this.sseConnectionManager.subscribe(subscription)
  }

  public destroy(): void {
    this.unsubscribeFromSse?.()
    this.unsubscribeFromSse = undefined
  }

  private async applyEntityEvent(event: TypedSSEEventUnion): Promise<void> {
    if (event.type !== SSEEventType.ENTITY_CREATED && event.type !== SSEEventType.ENTITY_UPDATED) {
      return
    }

    const cacheResult = await this.persistServerEntity.execute(event.data)
    if (cacheResult.isFailed()) {
      logger.warn("EntityRealtimeSync: failed to cache SSE entity update", cacheResult.getError())
    }
  }

  private async applyEntityBlockEvent(event: EntityBlockCreatedEventData): Promise<void> {
    const block: ServerBlock = {
      id: event.blockId,
      entity_id: event.entityId,
      entity_type: event.entityType,
      entity_field: event.entityField,
      author_id: event.authorId,
      encrypted_data: event.encryptedData,
      data_version: event.dataVersion,
      created_at: event.createdAt,
    }

    try {
      await this.blockRepository.saveBlock(block)
    } catch (error) {
      logger.warn("EntityRealtimeSync: failed to persist SSE entity block", error)
      return
    }

    const indexResult = await this.indexBlockEntity.execute(block.entity_id)
    if (indexResult.isFailed()) {
      logger.warn("EntityRealtimeSync: failed to index SSE entity block", indexResult.getError())
    }
  }
}
