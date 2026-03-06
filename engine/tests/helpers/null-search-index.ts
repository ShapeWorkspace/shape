/**
 * NullSearchIndex
 *
 * A no-op implementation of ISearchIndex for tests.
 * All operations silently succeed but search returns empty results.
 */

import type { SearchIndexInterface, SearchHit, SearchQueryOptions } from "../../search/search-types"
import type { ClientEntity } from "../../models/entity"
import type { EntityDecryptionBundle } from "../../search/search-types"
import type { EntityType } from "../../utils/encryption-types"

export class NullSearchIndex implements SearchIndexInterface {
  isInitialized = false

  async initialize(): Promise<void> {
    this.isInitialized = true
  }

  indexClientEntity(
    _entity: ClientEntity,
    _options?: { notify?: boolean; skipDebounce?: boolean }
  ): void {
    // No-op
  }

  async decryptAndIndexServerEntity(_params: EntityDecryptionBundle): Promise<void> {
    // No-op
  }

  async decryptAndIndexServerEntityBatch(_params: EntityDecryptionBundle[]): Promise<void> {
    // No-op
  }

  async removeEntity(_id: string, _entityType: EntityType): Promise<void> {
    // No-op
  }

  addIndexObserver(_observer: () => void): void {
    // No-op
  }

  removeIndexObserver(_observer: () => void): void {
    // No-op
  }

  async search(_query: string, _options?: SearchQueryOptions): Promise<SearchHit[]> {
    // Always return empty results
    return []
  }
}
