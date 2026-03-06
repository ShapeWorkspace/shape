import { EntityType } from "../utils/encryption-types"
import type { SSEConnectionManager } from "../services/sse-connection-manager"
import { SSEEventType, EntityBlockCreatedEventData } from "../services/sse-types"
import { logger } from "../utils/logger"

export type BlockUpdateCallback = (blockData: EntityBlockCreatedEventData) => void

export class BlockStore {
  private readonly callbacksByEntityType: Map<EntityType, Map<string, BlockUpdateCallback[]>> = new Map()
  private sseUnsubscribe: (() => void) | null = null

  initializeWithSSEManager(sseManager: SSEConnectionManager): void {
    if (this.sseUnsubscribe) {
      throw new Error("BlockStore already initialized")
    }

    this.sseUnsubscribe = sseManager.subscribe({
      eventTypes: [SSEEventType.ENTITY_BLOCK_CREATED],
      handler: event => {
        if (event.type === SSEEventType.ENTITY_BLOCK_CREATED) {
          this.handleBlockCreatedEvent(event.data as EntityBlockCreatedEventData)
        }
      },
    })
  }

  private handleBlockCreatedEvent(data: EntityBlockCreatedEventData): void {
    const callbacksByEntity = this.callbacksByEntityType.get(data.entityType)
    if (!callbacksByEntity) {
      return
    }

    const callbacks = callbacksByEntity.get(data.entityId)
    if (!callbacks || callbacks.length === 0) {
      return
    }

    for (const callback of callbacks) {
      try {
        callback(data)
      } catch (error) {
        logger.error(`Error in block callback for ${data.entityType}:`, error)
      }
    }
  }

  subscribeToBlockUpdates(
    entityType: EntityType,
    entityId: string,
    callback: BlockUpdateCallback
  ): () => void {
    if (!this.callbacksByEntityType.has(entityType)) {
      this.callbacksByEntityType.set(entityType, new Map())
    }
    const callbacksByEntity = this.callbacksByEntityType.get(entityType)!

    if (!callbacksByEntity.has(entityId)) {
      callbacksByEntity.set(entityId, [])
    }
    callbacksByEntity.get(entityId)!.push(callback)

    return () => {
      const callbacks = callbacksByEntity.get(entityId)
      if (!callbacks) {
        return
      }

      const index = callbacks.indexOf(callback)
      if (index >= 0) {
        callbacks.splice(index, 1)
      }

      if (callbacks.length === 0) {
        callbacksByEntity.delete(entityId)
      }

      if (callbacksByEntity.size === 0) {
        this.callbacksByEntityType.delete(entityType)
      }
    }
  }

  clearCallbacksForEntity(entityType: EntityType, entityId: string): void {
    const callbacksByEntity = this.callbacksByEntityType.get(entityType)
    if (callbacksByEntity) {
      callbacksByEntity.delete(entityId)
      if (callbacksByEntity.size === 0) {
        this.callbacksByEntityType.delete(entityType)
      }
    }
  }

  clearCallbacksForEntityType(entityType: EntityType): void {
    this.callbacksByEntityType.delete(entityType)
  }

  clear(): void {
    this.callbacksByEntityType.clear()

    if (this.sseUnsubscribe) {
      this.sseUnsubscribe()
      this.sseUnsubscribe = null
    }
  }
}
