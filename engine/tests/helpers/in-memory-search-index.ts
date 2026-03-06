/**
 * InMemorySearchIndex
 *
 * A simple in-memory implementation of SearchIndexInterface for tests.
 * Mirrors the FlexSearchIndexV2 contract without IndexedDB or web workers.
 */

import { isSearchableEntityType } from "../../search/search-types"
import type {
  SearchIndexInterface,
  SearchHit,
  SearchQueryOptions,
  SearchableEntityType,
} from "../../search/search-types"
import type { ClientEntity } from "../../models/entity"
import type { EntityType } from "../../utils/encryption-types"
import { CONTENT_FIELDS } from "../../models/entity"
import { SearchStore } from "../../store/search-store"

const buildDocumentId = (entityType: SearchableEntityType, entityId: string): string =>
  `${entityType}:${entityId}`

type IndexedDocument = {
  id: string
  entityId: string
  entityType: SearchableEntityType
  fields: Record<string, string>
}

const resolveContentFieldValue = (
  content: ClientEntity["content"],
  field: (typeof CONTENT_FIELDS)[number]
): string | undefined => {
  if (field === "title" && "title" in content) {
    const title = content.title
    return typeof title === "string" ? title : undefined
  }
  if (field === "name" && "name" in content) {
    const name = content.name
    return typeof name === "string" ? name : undefined
  }
  return undefined
}

export class InMemorySearchIndex implements SearchIndexInterface {
  isInitialized = false
  private readonly documents: Map<string, IndexedDocument> = new Map()

  constructor(private readonly searchStore?: SearchStore) {}

  async initialize(): Promise<void> {
    this.documents.clear()
    this.isInitialized = true
  }

  indexClientEntity(
    entity: ClientEntity,
    options?: { notify?: boolean; skipDebounce?: boolean }
  ): void {
    this.ensureInitialized()
    if (!isSearchableEntityType(entity.entityType)) {
      return
    }

    const fields: Record<string, string> = {}
    for (const field of CONTENT_FIELDS) {
      const value = resolveContentFieldValue(entity.content, field)
      if (value && value.trim().length > 0) {
        fields[field] = value
      }
    }

    const id = buildDocumentId(entity.entityType, entity.id)
    this.documents.set(id, {
      id,
      entityId: entity.id,
      entityType: entity.entityType,
      fields,
    })

    if (options?.notify !== false) {
      this.searchStore?.notifySearchIndexChanged()
    }
  }

  async decryptAndIndexServerEntity(): Promise<void> {
    throw new Error("InMemorySearchIndex does not support encrypted indexing")
  }

  async decryptAndIndexServerEntityBatch(): Promise<void> {
    throw new Error("InMemorySearchIndex does not support encrypted indexing")
  }

  async removeEntity(id: string, entityType: EntityType): Promise<void> {
    this.ensureInitialized()

    if (isSearchableEntityType(entityType)) {
      const documentId = buildDocumentId(entityType, id)
      this.documents.delete(documentId)
    }

    this.searchStore?.notifySearchIndexChanged()
  }

  addIndexObserver(observer: () => void): void {
    this.searchStore?.addSearchIndexObserver(observer)
  }

  removeIndexObserver(observer: () => void): void {
    this.searchStore?.removeSearchIndexObserver(observer)
  }

  async search(query: string, options?: SearchQueryOptions): Promise<SearchHit[]> {
    this.ensureInitialized()

    if (!query || query.trim().length === 0) {
      return []
    }

    const normalizedQuery = query.toLowerCase()
    const results: SearchHit[] = []

    for (const document of this.documents.values()) {
      if (options?.entityTypes && options.entityTypes.length > 0) {
        if (!options.entityTypes.includes(document.entityType)) {
          continue
        }
      }

      let score = 0
      for (const fieldValue of Object.values(document.fields)) {
        const normalizedValue = fieldValue.toLowerCase()
        if (normalizedValue.includes(normalizedQuery)) {
          const position = normalizedValue.indexOf(normalizedQuery)
          score += Math.max(1, 100 - position)
        }
      }

      if (score > 0) {
        results.push({
          entityId: document.entityId,
          entityType: document.entityType,
          score,
        })
      }
    }

    results.sort((a, b) => b.score - a.score)
    const limit = options?.limit ?? 50
    return results.slice(0, limit)
  }

  async clear(): Promise<void> {
    this.ensureInitialized()
    this.documents.clear()
    this.searchStore?.notifySearchIndexChanged()
  }

  async getStats(): Promise<{ documentCount: number; indexedTypes: SearchableEntityType[] }> {
    this.ensureInitialized()

    const types = new Set<SearchableEntityType>()
    for (const doc of this.documents.values()) {
      types.add(doc.entityType)
    }

    return {
      documentCount: this.documents.size,
      indexedTypes: Array.from(types),
    }
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error("InMemorySearchIndex not initialized. Call initialize() first.")
    }
  }
}
