import { CacheStores } from "../store/cache-stores"
import { KeyStore } from "../store/key-store"
import { RepositoryStore } from "../repositories/repository-store"
import { RunOnceInitializer } from "./run-once-initializer"

export class InitializeWorkspaceInitializer extends RunOnceInitializer {
  constructor(
    private readonly cacheStores: CacheStores,
    private readonly repositoryStore: RepositoryStore,
    private readonly keyStore: KeyStore
  ) {
    super()
  }

  public async execute(): Promise<void> {
    super.execute()
    await Promise.all([this.loadDraftsFromRepositoryIntoCache(), this.keyStore.initialize()])
  }

  private async loadDraftsFromRepositoryIntoCache(): Promise<void> {
    const [drafts, blocks] = await Promise.all([
      this.repositoryStore.draftRepository.getDrafts(),
      this.repositoryStore.draftBlockRepository.getBlocks(),
    ])

    for (const draft of drafts) {
      this.cacheStores.draftCache.set(draft.id, draft)
    }

    const sortedBlocks = [...blocks].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    for (const block of sortedBlocks) {
      const entityBlocks = this.cacheStores.draftBlockCache.get(block.entityId) ?? []
      entityBlocks.push(block)
      this.cacheStores.draftBlockCache.set(block.entityId, entityBlocks)
    }
  }
}
