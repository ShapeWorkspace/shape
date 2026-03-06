import { EntityStore } from "./entity-store"
import { HexString } from "../crypto/types"
import { BlockStore } from "./block-store"
import { SimpleCache } from "./simple-cache"
import { StoreIndex } from "./store-index"
import { BlockDraft, ClientEntity, Draft } from "../models/entity"

const sortByCreatedAtAscending = (a: ClientEntity, b: ClientEntity) =>
  a.createdAt.getTime() - b.createdAt.getTime()

const sortByUpdatedAtDescending = (a: ClientEntity, b: ClientEntity) =>
  b.updatedAt.getTime() - a.updatedAt.getTime()

export class CacheStores {
  public readonly entityStore = new EntityStore()

  public readonly groupMessageIndex = new StoreIndex(this.entityStore, {
    entityType: "group-message",
    sortFn: sortByCreatedAtAscending,
  })

  public readonly projectTaskIndex = new StoreIndex(this.entityStore, {
    entityType: "task",
    sortFn: sortByUpdatedAtDescending,
  })

  public readonly projectTagIndex = new StoreIndex(this.entityStore, {
    entityType: "project-tag",
  })

  public readonly forumDiscussionIndex = new StoreIndex(this.entityStore, {
    entityType: "forum-discussion",
    sortFn: sortByUpdatedAtDescending,
  })

  public readonly forumReplyIndex = new StoreIndex(this.entityStore, {
    entityType: "forum-reply",
    sortFn: sortByCreatedAtAscending,
  })

  public readonly paperCommentIndex = new StoreIndex(this.entityStore, {
    entityType: "paper-comment",
    sortFn: sortByUpdatedAtDescending,
  })

  public readonly paperCommentReplyIndex = new StoreIndex(this.entityStore, {
    entityType: "paper-comment-reply",
    sortFn: sortByCreatedAtAscending,
  })

  public readonly taskCommentIndex = new StoreIndex(this.entityStore, {
    entityType: "task-comment",
    sortFn: sortByCreatedAtAscending,
  })

  public readonly folderKeyCache: SimpleCache<string, HexString> = new SimpleCache<string, HexString>()
  public readonly draftCache: SimpleCache<string, Draft> = new SimpleCache<string, Draft>()
  public readonly draftBlockCache: SimpleCache<string, BlockDraft[]> = new SimpleCache<string, BlockDraft[]>()
  public readonly blockStore: BlockStore = new BlockStore()

  findEntityById<T = ClientEntity>(id: string): T | undefined {
    return this.entityStore.get(id) as T | undefined
  }

  clearAll(): void {
    this.entityStore.clear()
    this.folderKeyCache.clear()
    this.draftCache.clear()
    this.draftBlockCache.clear()
    this.blockStore.clear()
  }
}
