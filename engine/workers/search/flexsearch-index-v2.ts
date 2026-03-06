import { Document as FlexSearchDocumentIndex, IndexedDB } from "flexsearch"
import type { Remote } from "comlink"
import {
  isSearchableEntityType,
} from "@shape/engine/search/search-types"
import type {
  SearchHit,
  SearchQueryOptions,
  FlexSearchDocument,
  EntityDecryptionBundle,
  SearchIndexInterface,
  SearchableEntityType,
} from "@shape/engine/search/search-types"
import type { DecryptionWorker } from "./decrypt.worker"
import { CONTENT_FIELDS } from "@shape/engine/models/entity"
import type { ClientEntity } from "@shape/engine/models/entity"
import type { EntityType } from "@shape/engine/utils/encryption-types"
import { SearchStore } from "../../store/search-store"

const IDB_NAME_PREFIX = "shape-search-"

function compoundId({
  entityType,
  entityId,
}: {
  entityType: SearchableEntityType
  entityId: string
}): string {
  return `${entityType}:${entityId}`
}

function parseCompoundId(
  id: string
): { entityType: SearchableEntityType; entityId: string } | null {
  const [entityType, entityId] = id.split(":")
  if (!entityType || !entityId || !isSearchableEntityType(entityType)) {
    return null
  }
  return { entityType, entityId }
}

const FLUSH_DEBOUNCE = 2500

export class FlexSearchIndexV2 implements SearchIndexInterface {
  private index: FlexSearchDocumentIndex<FlexSearchDocument>
  private db: IndexedDB | null = null
  private readonly indexQueue: Map<string, FlexSearchDocument> = new Map()
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  isInitialized = false

  constructor(
    private readonly decryptWorker: Remote<DecryptionWorker>,
    private readonly workspaceId: string,
    private readonly searchStore: SearchStore
  ) {
    this.db = new IndexedDB(`${IDB_NAME_PREFIX}${this.workspaceId}`)

    this.index = new FlexSearchDocumentIndex<FlexSearchDocument>({
      document: {
        id: "id",
        index: CONTENT_FIELDS as unknown as string[],
        store: false,
      },
      tokenize: "forward",
      resolution: 9,
      context: true,
    })
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new Error("Index already initialized")
    }

    await this.index.mount(this.db)
    this.isInitialized = true
  }

  indexClientEntity(
    entity: ClientEntity,
    options: { notify?: boolean; skipDebounce?: boolean } = { notify: true, skipDebounce: false }
  ): void {
    if (!isSearchableEntityType(entity.entityType)) {
      return
    }
    const document: FlexSearchDocument = {
      id: compoundId({ entityType: entity.entityType, entityId: entity.id }),
    }
    for (const field of CONTENT_FIELDS) {
      const value = (entity.content as Record<string, unknown>)[field]
      if (typeof value === "string") {
        document[field] = value
      }
    }

    if (options.skipDebounce) {
      void Promise.resolve(this.index.update(document)).then(() => {
        if (options.notify) {
          this.searchStore.notifySearchIndexChanged()
        }
      })
    } else {
      this.indexQueue.set(document.id, document)
      if (!this.flushTimer) {
        this.flushTimer = setTimeout(() => this.flushQueue(), FLUSH_DEBOUNCE)
      }
    }
  }

  private async flushQueue(): Promise<void> {
    if (this.flushTimer) {
      this.flushTimer = null
    }

    const values = Array.from(this.indexQueue.values())
    this.indexQueue.clear()

    for (const document of values) {
      await this.index.update(document)
    }

    this.searchStore.notifySearchIndexChanged()

    if (this.indexQueue.size > 0 && !this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flushQueue(), FLUSH_DEBOUNCE)
    }
  }

  async decryptAndIndexServerEntity(items: EntityDecryptionBundle): Promise<void> {
    return this.decryptAndIndexServerEntityBatch([items])
  }

  async decryptAndIndexServerEntityBatch(items: EntityDecryptionBundle[]): Promise<void> {
    if (items.length === 0) return

    const results = await this.decryptWorker.decryptBatch(items)

    await Promise.all(results.map(result => this.indexClientEntity(result, { notify: false })))

    this.searchStore.notifySearchIndexChanged()
  }

  async removeEntity(id: string, entityType: EntityType): Promise<void> {
    if (!isSearchableEntityType(entityType)) {
      this.searchStore.notifySearchIndexChanged()
      return
    }

    const compoundEntityId = compoundId({ entityType, entityId: id })
    this.indexQueue.delete(compoundEntityId)
    await this.index.remove(compoundEntityId)
    this.searchStore.notifySearchIndexChanged()
  }

  addIndexObserver(observer: () => void): void {
    this.searchStore.addSearchIndexObserver(observer)
  }

  removeIndexObserver(observer: () => void): void {
    this.searchStore.removeSearchIndexObserver(observer)
  }

  async search(query: string, options?: SearchQueryOptions): Promise<SearchHit[]> {
    if (!query || query.trim().length === 0) {
      return []
    }

    const limit = options?.limit ?? 50
    const searchResults = await this.index.search(query, { limit: limit * 2 })

    const seenIds = new Set<string>()
    const results: SearchHit[] = []

    for (const fieldResult of searchResults) {
      if (fieldResult.result) {
        for (const item of fieldResult.result) {
          const parsed = parseCompoundId(String(item))
          if (!parsed) {
            continue
          }
          const { entityType, entityId } = parsed
          const id = String(item)
          if (seenIds.has(id)) continue
          seenIds.add(id)

          if (options?.entityTypes && options.entityTypes.length > 0) {
            if (!options.entityTypes.includes(entityType)) {
              continue
            }
          }

          const score = 100 - results.length
          results.push({
            entityId,
            entityType,
            score,
          })

          if (results.length >= limit) {
            break
          }
        }
      }

      if (results.length >= limit) {
        break
      }
    }

    return results
  }

  destroy(): void {
    this.db = null
    this.isInitialized = false
  }
}
