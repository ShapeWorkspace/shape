import { BlockRepository } from "../../repositories/block-repository"
import { CacheStores } from "../../store/cache-stores"
import {
  applyParentUpdateToEntityPayload,
  BlockDraft,
  ClientEntity,
  CreateBlockRequest,
  CreateEntityRequest,
  Draft,
  EntityContent,
  EntityMetaFields,
  isServerBlock,
  getParentReferenceFromUpdateIntent,
  ParentUpdateIntent,
  ServerBlock,
  ServerEntity,
  EncryptedFile,
  UpdateEntityRequest,
} from "../../models/entity"
import { Crypto } from "../../crypto/crypto"
import { DraftRepository } from "../../repositories/draft-repository"
import { EncryptEntity } from "../crypto/EncryptEntity"
import { EntityRepository } from "../../repositories/entity-repository"
import {
  EntityType,
  getWrappingKeyId,
  getWrappingKeyKey,
  getWrappingKeyType,
  WrappingKey,
  WrappingKeyType,
} from "../../utils/encryption-types"
import type { SearchIndexInterface } from "../../search/search-types"
import { MakeWorkspaceRequest } from "../network/MakeWorkspaceRequest"
import { Result } from "../../utils/Result"
import { RepositoryStore } from "../../repositories/repository-store"
import { DraftBlockRepository } from "../../repositories"
import { generateClientUUID } from "../../utils/generate-id"
import { logger } from "../../utils/logger"
import { WorkspaceInfoStore } from "../../store/workspace-info-store"
import { GetWorkspaceKeysResponse } from "../../models/workspace-key"
import { KeyStore } from "../../store/key-store"
import { DecryptKeyFromShares } from "../invites/DecryptKeyFromShares"
import { HexString } from "../../crypto/types"
import { CreateKeyShareForUser } from "../invites/CreateKeyShareForUser"
import { SyncStore } from "../../store/sync-store"
import { EventBus } from "../../processes/event-bus"
import { ApiResult } from "../../utils/ApiResult"
import { DecryptYjsDelta } from "../crypto/DecryptYjsDelta"
import { EncryptYjsDelta } from "../crypto/EncryptYjsDelta"
import { decodeBlocksFromBase64, encodeBlocksToBase64 } from "../crypto/block-crypto-utils"
import * as Y from "yjs"
import { DecryptEntity } from "../crypto/DecryptEntity"
import { XCHACHA20_NONCE_BYTES } from "../../crypto/constants"
import { SearchHit, SearchQueryOptions } from "../../search/search-types"

export const DRAFT_RETRY_DELAYS_MS = [5000, 15000, 45000]
const ENTITY_HAS_PENDING_DELETE_DRAFT = "Entity has pending delete draft"
const ENTITY_IGNORED_DUE_TO_LOCAL_DELETE = "Entity ignored due to local delete tombstone"

function canAttemptAutomaticSave(draft: Draft): boolean {
  const MAX_AUTOMATIC_ATTEMPTS = 3
  return draft.saveAttempts < MAX_AUTOMATIC_ATTEMPTS
}

function buildDraftIntentSignature(draft: Draft): string {
  return JSON.stringify({
    id: draft.id,
    deleteEntity: draft.deleteEntity,
    formedOnHash: draft.formedOnHash ?? null,
    entity: {
      contentHash: draft.entity.content_hash,
      contentCiphertext: draft.entity.content_ciphertext,
      contentNonce: draft.entity.content_nonce,
      parentId: draft.entity.parent_id ?? null,
      parentType: draft.entity.parent_type ?? null,
      metaFields: draft.entity.meta_fields ?? {},
      mentionedUserIds: draft.entity.mentioned_user_ids ?? [],
    },
  })
}

function isSameDraftIntent(left: Draft, right: Draft): boolean {
  return buildDraftIntentSignature(left) === buildDraftIntentSignature(right)
}

function isDuplicateEntityCreateError(result: ApiResult<unknown>): boolean {
  if (result.hasStatus(409)) {
    return true
  }
  if (!result.hasStatus(500)) {
    return false
  }
  const errorMessage = result.getErrorMessage().toLowerCase()
  return (
    errorMessage.includes("unique constraint failed: entities.id") ||
    errorMessage.includes("duplicate key value")
  )
}

export class ConstructYjsDocFromEncryptedBlocks {
  constructor(
    private readonly decryptDelta: DecryptYjsDelta,
    private readonly cacheStores: CacheStores
  ) {}

  async execute(blocks: ServerBlock[]): Promise<Result<string>> {
    const entityId = blocks[0].entity_id
    const entity = this.cacheStores.entityStore.get(entityId)
    if (!entity) {
      return Result.fail("Entity not found")
    }

    const ydoc = new Y.Doc()

    for (const block of blocks) {
      try {
        const blocksMessage = decodeBlocksFromBase64(block.encrypted_data)
        if (!blocksMessage) {
          continue
        }

        for (const encryptedDelta of blocksMessage.deltas) {
          const yjsUpdate = this.decryptDelta.execute({ delta: encryptedDelta, entityKey: entity.entityKey })
          if (yjsUpdate) {
            Y.applyUpdate(ydoc, yjsUpdate)
          }
        }
      } catch (error) {
        logger.warn(`reconstructYjsContentFromBlocks: Failed to process block ${block.id}:`, error)
      }
    }

    try {
      const xmlFragment = ydoc.getXmlFragment("content")
      return Result.ok(this.extractTextFromYFragment(xmlFragment).trim())
    } catch (error) {
      return Result.fail(`Failed to extract text from Yjs document: ${error}`)
    }
  }

  private extractTextFromYFragment(node: Y.XmlFragment | Y.XmlElement): string {
    const texts: string[] = []

    const children = node.toArray()
    for (const child of children) {
      if (child instanceof Y.XmlText) {
        const text = child.toString()
        if (text) texts.push(text)
      } else if (child instanceof Y.XmlElement) {
        const childText = this.extractTextFromYFragment(child)
        if (childText) texts.push(childText)
      }
    }

    return texts.join(" ")
  }
}

export class GetOrFetchEntity {
  constructor(
    private readonly entityRepository: EntityRepository,
    private readonly cacheStores: CacheStores,
    private readonly decryptEntity: DecryptEntityWithKeyLookup,
    private readonly fetchEntity: QueryEntityById
  ) {}

  async execute(entityId: string): Promise<Result<ClientEntity>> {
    const cached = this.cacheStores.entityStore.get(entityId)
    if (cached) {
      return Result.ok(cached)
    }

    const serverEntity = await this.entityRepository.getEntity(entityId)
    if (!serverEntity) {
      const fetchResult = await this.fetchEntity.execute(entityId)
      if (fetchResult.isFailed()) {
        return Result.fail(fetchResult.getError())
      }
      const entity = fetchResult.getValue()
      return Result.ok(entity)
    }

    const decryptResult = this.decryptEntity.execute(serverEntity)
    if (decryptResult.isFailed()) {
      return Result.fail(decryptResult.getError())
    }

    const entity = decryptResult.getValue()
    this.cacheStores.entityStore.setCanonical(entity)
    return Result.ok(entity)
  }
}

export class DecryptEntityWithKeyLookup {
  constructor(
    private readonly getWrappingKey: GetWrappingKey,
    private readonly decryptEntity: DecryptEntity
  ) {}

  execute<C extends EntityContent, M extends EntityMetaFields>(
    serverEntity: ServerEntity<M>
  ): Result<ClientEntity<C, M>> {
    const wrappingKey = this.getWrappingKey.executeForExistingEntity({ entity: serverEntity })
    if (!wrappingKey) {
      return Result.fail(`Failed to get wrapping key for note ${serverEntity.id}`)
    }

    return this.decryptEntity.execute({
      serverEntity,
      wrappingKey,
    })
  }
}

export class PersistServerEntity {
  constructor(
    private readonly entityRepository: EntityRepository,
    private readonly decryptEntity: DecryptEntityWithKeyLookup,
    private readonly cacheStores: CacheStores,
    private readonly indexClientEntity: IndexClientEntity
  ) {}

  async execute(serverEntity: ServerEntity): Promise<Result<ClientEntity>> {
    const draftState = this.cacheStores.draftCache.get(serverEntity.id)
    if (draftState?.deleteEntity) {
      return Result.fail(ENTITY_HAS_PENDING_DELETE_DRAFT)
    }

    if (
      this.cacheStores.entityStore.shouldIgnoreIncomingEntity(serverEntity.id, new Date(serverEntity.updated_at))
    ) {
      return Result.fail(ENTITY_IGNORED_DUE_TO_LOCAL_DELETE)
    }

    try {
      await this.entityRepository.saveEntity(serverEntity)
    } catch (error) {
      logger.warn("PersistServerEntity: failed to persist server entity", error)
      return Result.fail("Failed to persist server entity")
    }

    const decryptionResult = this.decryptEntity.execute(serverEntity)
    if (decryptionResult.isFailed()) {
      return Result.fail(decryptionResult.getError())
    }

    const clientEntity = decryptionResult.getValue()
    this.cacheStores.entityStore.setCanonical(clientEntity)

    this.indexClientEntity.execute(clientEntity)

    return Result.ok(clientEntity)
  }
}

export class IndexBlockEntity {
  constructor(
    private readonly searchIndex: SearchIndexInterface,
    private readonly blockRepository: BlockRepository,
    private readonly cacheStores: CacheStores,
    private readonly constructYjsDoc: ConstructYjsDocFromEncryptedBlocks
  ) {}

  async execute<C extends EntityContent>(entityId: string): Promise<Result<void>> {
    const entity = this.cacheStores.entityStore.get(entityId) as ClientEntity<C>
    if (!entity) {
      return Result.fail("Entity not found")
    }
    const blocks = await this.blockRepository.getBlocksByEntity(entityId)
    if (blocks.length === 0) {
      return Result.ok(undefined)
    }

    const contentResult = await this.constructYjsDoc.execute(blocks)
    if (contentResult.isFailed()) {
      return Result.fail(contentResult.getError())
    }
    const textContent = contentResult.getValue()
    this.searchIndex.indexClientEntity({
      ...entity,
      content: {
        ...entity.content,
        text: textContent,
      },
    })

    return Result.ok(undefined)
  }
}

export interface SyncResult {
  success: boolean
  totalChanges: number
}

export interface SyncChange {
  sequence: number
  operation: "create" | "update" | "delete"
  entityId: string
  entityType: EntityType
  entity: ServerEntity | ServerBlock | null
}

export interface SyncResponse {
  changes: SyncChange[]
  nextSequence: number
  hasMore: boolean
}

export class Sync {
  constructor(
    private readonly syncStore: SyncStore,
    private readonly makeWorkspaceRequest: MakeWorkspaceRequest,
    private readonly removeEntityLocally: RemoveEntityLocally,
    private readonly persistServerEntity: PersistServerEntity,
    private readonly blockRepository: BlockRepository,
    private readonly indexBlockEntity: IndexBlockEntity,
    private readonly eventBus: EventBus
  ) {}

  public async execute(): Promise<SyncResult> {
    if (this.syncStore.isSyncing) {
      return {
        success: false,
        totalChanges: 0,
      }
    }

    this.syncStore.isSyncing = true
    this.syncStore.abortController = new AbortController()
    const signal = this.syncStore.abortController.signal
    this.eventBus.emit(this.eventBus.EVENTS.SYNC_STARTED, undefined)

    const state = this.syncStore.syncState
    let hasMore = true
    let totalChanges = 0
    let cursor = state.lastSequence
    const entitiesWithBlockChanges = new Set<string>()

    while (hasMore) {
      if (signal.aborted) {
        this.syncStore.isSyncing = false
        this.eventBus.emit(this.eventBus.EVENTS.SYNC_COMPLETED, { success: false, totalChanges })
        return {
          success: false,
          totalChanges,
        }
      }

      const fetchResult = await this.fetchChanges(cursor, signal)
      if (fetchResult.isFailed()) {
        this.syncStore.isSyncing = false
        this.eventBus.emit(this.eventBus.EVENTS.SYNC_COMPLETED, { success: false, totalChanges })
        return {
          success: false,
          totalChanges,
        }
      }

      const response = fetchResult.getValue()
      totalChanges += response.changes.length

      for (const change of response.changes) {
        if (signal.aborted) {
          this.syncStore.isSyncing = false
          this.eventBus.emit(this.eventBus.EVENTS.SYNC_COMPLETED, { success: false, totalChanges })
          return {
            success: false,
            totalChanges,
          }
        }

        await this.handleChange(change, entitiesWithBlockChanges)
      }

      cursor = response.nextSequence
      hasMore = response.hasMore

      this.syncStore.saveSyncState({
        lastSequence: cursor,
        lastSyncAt: Date.now(),
      })
    }

    if (entitiesWithBlockChanges.size > 0) {
      for (const entityId of entitiesWithBlockChanges) {
        await this.indexBlockEntity.execute(entityId)
      }
    }

    this.syncStore.isSyncing = false
    const result: SyncResult = { success: true, totalChanges }
    this.eventBus.emit(this.eventBus.EVENTS.SYNC_COMPLETED, result)
    return result
  }

  private async handleChange(change: SyncChange, entitiesWithBlockChanges: Set<string>): Promise<void> {
    if (change.entityType === "block") {
      if (change.operation === "delete") {
        await this.blockRepository.deleteBlock(change.entityId)
      } else if (change.entity) {
        if (!isServerBlock(change.entity)) {
          throw new Error("Entity block is not supported")
        }
        entitiesWithBlockChanges.add(change.entity.entity_id)
        await this.blockRepository.saveBlock(change.entity)
      } else {
        throw new Error("Unhandled change format")
      }
    } else {
      if (change.operation === "delete") {
        await this.removeEntityLocally.execute(change.entityId, change.entityType)
      } else if (change.entity) {
        if (isServerBlock(change.entity)) {
          throw new Error("Entity block is not supported")
        }
        const writeResult = await this.persistServerEntity.execute(change.entity)
        if (writeResult.isFailed() && writeResult.getError() !== ENTITY_IGNORED_DUE_TO_LOCAL_DELETE) {
          logger.warn("Sync: failed to cache entity update", {
            entityId: change.entity.id,
            error: writeResult.getError(),
          })
        }
      } else {
        throw new Error("Unhandled change format")
      }
    }
  }

  private async fetchChanges(sinceSequence: number, signal: AbortSignal): Promise<ApiResult<SyncResponse>> {
    const limit = 100
    const url = `sync?since=${sinceSequence}&limit=${limit}`
    return await this.makeWorkspaceRequest.executeGet<SyncResponse>(url, { signal })
  }
}

export class GetWrappingKey {
  constructor(
    private readonly keyStore: KeyStore,
    private readonly cacheStores: CacheStores
  ) {}

  public executeForNewEntity(dto: { parentId?: string }): WrappingKey | undefined {
    if (dto.parentId) {
      return this.cacheStores.findEntityById<ClientEntity>(dto.parentId)
    } else {
      return this.keyStore.getCurrentKey()
    }
  }

  public executeForExistingEntity(dto: {
    entity: { wrapping_key_type: WrappingKeyType; wrapping_key_id: string }
  }): WrappingKey | undefined {
    if (dto.entity.wrapping_key_type === "workspace") {
      return this.keyStore.getCurrentKey()
    } else {
      return this.cacheStores.findEntityById<ClientEntity>(dto.entity.wrapping_key_id)
    }
  }
}

function buildEntityKeyWrappingAD(dto: {
  workspaceId: string
  entityType: EntityType
  entityId: string
  wrappingKeyType: WrappingKeyType
  wrappingKeyId: string
}): string {
  return `shape:v1:entity:${dto.workspaceId}:${dto.entityType}:${dto.entityId}:entitykey:${dto.wrappingKeyType}:${dto.wrappingKeyId}`
}

export class WrapEntityKey {
  constructor(private readonly crypto: Crypto) {}

  execute(dto: {
    entityKey: HexString
    wrappingKey: WrappingKey
    entityType: EntityType
    entityId: string
  }): Result<{ entityKeyNonce: HexString; wrappedEntityKey: string }> {
    const { entityKey, wrappingKey, entityType, entityId } = dto
    const entityKeyNonce = this.crypto.generateRandomKey(XCHACHA20_NONCE_BYTES)
    const wrappingAD = buildEntityKeyWrappingAD({
      workspaceId: wrappingKey.workspaceId,
      entityType,
      entityId,
      wrappingKeyType: getWrappingKeyType(wrappingKey),
      wrappingKeyId: getWrappingKeyId(wrappingKey),
    })

    const wrappedEntityKey = this.crypto.xchacha20Encrypt(
      entityKey,
      entityKeyNonce,
      getWrappingKeyKey(wrappingKey),
      wrappingAD
    )

    if (!wrappedEntityKey) {
      return Result.fail("Failed to wrap entity key")
    }

    return Result.ok({
      entityKeyNonce,
      wrappedEntityKey,
    })
  }
}

export class UnwrapEntityKey {
  constructor(private readonly crypto: Crypto) {}

  execute(dto: {
    wrappedEntityKey: string
    entityKeyNonce: HexString
    wrappingKey: WrappingKey
    entityType: EntityType
    entityId: string
  }): Result<HexString> {
    const { wrappedEntityKey, entityKeyNonce, wrappingKey, entityType, entityId } = dto
    const wrappingAD = buildEntityKeyWrappingAD({
      workspaceId: wrappingKey.workspaceId,
      entityType,
      entityId,
      wrappingKeyType: getWrappingKeyType(wrappingKey),
      wrappingKeyId: getWrappingKeyId(wrappingKey),
    })

    const entityKey = this.crypto.xchacha20Decrypt(
      wrappedEntityKey,
      entityKeyNonce,
      getWrappingKeyKey(wrappingKey),
      wrappingAD
    )
    if (!entityKey) {
      return Result.fail("Failed to unwrap entity key")
    }

    return Result.ok(entityKey)
  }
}

export class ShareKeysWithInvitee {
  constructor(
    private readonly keyStore: KeyStore,
    private readonly createKeyShareForUser: CreateKeyShareForUser
  ) {}

  async execute(dto: { inviteeUserId: string; inviteeBoxPublicKey: HexString }): Promise<Result<void>> {
    for (const key of this.keyStore.getAllKeys()) {
      const shareResult = await this.createKeyShareForUser.execute(
        key.id,
        dto.inviteeUserId,
        dto.inviteeBoxPublicKey,
        key.key
      )
      if (shareResult.isFailed()) {
        return Result.fail(`Failed to create key share for key ${key.id}: ${shareResult.getError()}`)
      }
    }

    return Result.ok(undefined)
  }
}

export class FetchWorkspaceKeys {
  constructor(
    private readonly workspaceRequest: MakeWorkspaceRequest,
    private readonly decryptKeyFromShares: DecryptKeyFromShares,
    private readonly keyStore: KeyStore
  ) {}

  async execute(): Promise<Result<void>> {
    const response = await this.workspaceRequest.executeGet<GetWorkspaceKeysResponse>(`keys`)
    if (response.isFailed()) {
      return Result.fail(response.getErrorMessage())
    }

    const keysWithShares = response.getValue().keys

    for (const keyWithShares of keysWithShares) {
      const decryptResult = this.decryptKeyFromShares.execute(keyWithShares)

      if (!decryptResult.isFailed()) {
        const decryptedKey = decryptResult.getValue()
        if (decryptedKey) {
          await this.keyStore.saveKey(decryptedKey)
        }
      }
    }

    return Result.ok(undefined)
  }
}

export class SyncAllDrafts {
  constructor(
    private readonly cacheStores: CacheStores,
    private readonly workspaceInfoStore: WorkspaceInfoStore,
    private readonly syncDraft: SyncDraft,
    private readonly syncBlockDraft: SyncBlockDraft
  ) {}

  async execute(): Promise<Result<void>> {
    if (!this.workspaceInfoStore.isRemote) {
      return Result.fail("Workspace is not remote")
    }

    const drafts = this.cacheStores.draftCache.values()
    for (const draft of drafts) {
      await this.syncDraft.execute(draft.id)
    }

    const multiEntityBlocks = this.cacheStores.draftBlockCache.values()
    for (const blocks of multiEntityBlocks) {
      for (const block of blocks) {
        await this.syncBlockDraft.execute(block)
      }
    }

    return Result.ok()
  }
}

export class CreateEntityV2 {
  constructor(
    private readonly crypto: Crypto,
    private readonly encryptEntity: EncryptEntity,
    private readonly createOrUpdateDraft: CreateDraft,
    private readonly cacheStores: CacheStores,
    private readonly workspaceInfoStore: WorkspaceInfoStore,
    private readonly getWrappingKey: GetWrappingKey,
    private readonly indexClientEntity: IndexClientEntity
  ) {}

  async execute<C extends EntityContent, M extends EntityMetaFields>(dto: {
    content: C
    entityType: EntityType
    id?: string
    parent?: ClientEntity
    metaFields?: M
    mentionedUserIds?: string[]
  }): Promise<Result<ClientEntity<C, M>>> {
    const wrappingKey = this.getWrappingKey.executeForNewEntity({ parentId: dto.parent?.id })
    if (!wrappingKey) {
      return Result.fail("Failed to get wrapping key for entity creation")
    }
    const entityId = dto.id ?? this.crypto.generateUUID()

    const { encrypted, entityKey } = this.encryptEntity.execute({
      content: dto.content,
      entityType: dto.entityType,
      entityId,
      wrappingKey,
    })

    const date = new Date()
    const mentionedUserIds = dto.mentionedUserIds ?? []
    const serverEntity: ServerEntity = {
      ...encrypted,
      id: entityId,
      workspace_id: this.workspaceInfoStore.workspaceId,
      entity_type: dto.entityType,
      parent_id: dto.parent?.id,
      parent_type: dto.parent?.entityType,
      meta_fields: dto.metaFields ?? {},
      mentioned_user_ids: mentionedUserIds,
      creator_id: this.workspaceInfoStore.userId,
      last_updated_by_id: this.workspaceInfoStore.userId,
      created_at: date.toISOString(),
      updated_at: date.toISOString(),
    }

    const clientEntity: ClientEntity<C> = {
      id: entityId,
      workspaceId: this.workspaceInfoStore.workspaceId,
      entityType: dto.entityType,
      parentId: dto.parent?.id,
      parentType: dto.parent?.entityType,
      entityKey: entityKey,
      contentHash: encrypted.content_hash,
      createdAt: date,
      updatedAt: date,
      chainRootKeyId: encrypted.chain_root_key_id,
      wrappingKeyId: encrypted.wrapping_key_id,
      wrappingKeyType: encrypted.wrapping_key_type,
      content: dto.content,
      metaFields: dto.metaFields ?? {},
      mentionedUserIds,
      creatorId: this.workspaceInfoStore.userId,
      lastUpdatedById: this.workspaceInfoStore.userId,
    }

    this.cacheStores.entityStore.setDirtyVersion(clientEntity)

    await this.createOrUpdateDraft.execute({
      entity: serverEntity,
      attemptSync: true,
      formedOnHash: undefined,
    })

    this.indexClientEntity.execute(clientEntity)

    const entity = this.cacheStores.entityStore.get(entityId)
    return Result.ok((entity as ClientEntity<C, M>) ?? clientEntity)
  }
}

export class IndexClientEntity {
  constructor(private readonly searchIndex: SearchIndexInterface) {}

  execute(entity: ClientEntity, options: { skipDebounce?: boolean } = { skipDebounce: false }): Result<void> {
    this.searchIndex.indexClientEntity(entity, { skipDebounce: options.skipDebounce })
    return Result.ok()
  }
}

export class SearchIndex {
  constructor(private readonly searchIndex: SearchIndexInterface) {}

  async execute(query: string, options?: SearchQueryOptions): Promise<Result<SearchHit[]>> {
    const results = await this.searchIndex.search(query, options)
    return Result.ok(results)
  }
}

export class IndexServerEntity {
  constructor(
    private readonly searchIndex: SearchIndexInterface,
    private readonly getWrappingKey: GetWrappingKey
  ) {}

  async execute(entity: ServerEntity): Promise<Result<void>> {
    const wrappingKey = this.getWrappingKey.executeForExistingEntity({ entity })
    if (!wrappingKey) {
      return Result.fail("Failed to get wrapping key for entity")
    }

    await this.searchIndex.decryptAndIndexServerEntity({ entity, wrappingKey })
    return Result.ok()
  }
}

export const ENTITY_BLOCK_DATA_VERSION = "yjs-v1"

const ENTITY_BLOCK_FIELD_BY_ENTITY_TYPE: Partial<Record<EntityType, string>> = {
  note: "text",
  paper: "text",
  task: "description",
}

export function resolveEntityBlockFieldForEntityType(entityType: EntityType): string | undefined {
  return ENTITY_BLOCK_FIELD_BY_ENTITY_TYPE[entityType]
}

export class CreateBlockDraft {
  constructor(
    private readonly encryptDelta: EncryptYjsDelta,
    private readonly cacheStores: CacheStores,
    private readonly repository: DraftBlockRepository,
    private readonly workspaceInfoStore: WorkspaceInfoStore,
    private readonly syncBlockDraft: SyncBlockDraft
  ) {}

  async execute(dto: {
    entityId: string
    entityType: EntityType
    yjsUpdates: Uint8Array[] | Uint8Array
    entityField?: string
    attemptSync?: boolean
  }): Promise<Result<BlockDraft>> {
    // Default to syncing immediately unless explicitly disabled.
    const shouldAttemptSync = dto.attemptSync !== false
    const entityField = dto.entityField ?? resolveEntityBlockFieldForEntityType(dto.entityType)
    if (!entityField) {
      return Result.fail("Entity type does not support block drafts")
    }

    const cachedEntity = this.cacheStores.entityStore.get(dto.entityId)
    if (!cachedEntity) {
      return Result.fail("Entity not found for block draft encryption")
    }

    const updates = Array.isArray(dto.yjsUpdates) ? dto.yjsUpdates : [dto.yjsUpdates]
    if (updates.length === 0) {
      return Result.fail("At least one Yjs update is required")
    }

    const encryptedDeltas = updates.map(update =>
      this.encryptDelta.execute({ yjsUpdate: update, entityKey: cachedEntity.entityKey })
    )

    const encryptedData = encodeBlocksToBase64({ deltas: encryptedDeltas })

    const nowIso = new Date().toISOString()

    const draft: BlockDraft = {
      entityId: dto.entityId,
      entityType: dto.entityType,
      entityField,
      encryptedData,
      dataVersion: ENTITY_BLOCK_DATA_VERSION,
      updatedAt: nowIso,
      id: generateClientUUID(),
      createdAt: nowIso,
      workspaceId: this.workspaceInfoStore.workspaceId,
    }

    await this.repository.saveBlock(draft)

    const blocks = this.cacheStores.draftBlockCache.get(dto.entityId) ?? []
    blocks.push(draft)
    this.cacheStores.draftBlockCache.set(dto.entityId, blocks)

    if (shouldAttemptSync && this.workspaceInfoStore.isRemote) {
      this.syncBlockDraft.execute(draft).catch(error => {
        logger.warn("DraftService: failed to attempt draft block sync", error)
      })
    }

    return Result.ok(draft)
  }
}

export class SyncBlockDraft {
  constructor(
    private readonly blockRepository: BlockRepository,
    private readonly makeWorkspaceRequest: MakeWorkspaceRequest,
    private readonly cacheStores: CacheStores
  ) {}

  async execute(draft: BlockDraft): Promise<Result<ServerBlock>> {
    const pendingEntityDraft = this.cacheStores.draftCache.get(draft.entityId)
    const parentEntityPendingDelete = pendingEntityDraft && pendingEntityDraft.deleteEntity
    const parentEntityPendingCreate = pendingEntityDraft && pendingEntityDraft.formedOnHash === undefined
    if (parentEntityPendingDelete || parentEntityPendingCreate) {
      return Result.fail("Parent entity is pending delete or create")
    }

    const response = await this.makeWorkspaceRequest.executePost<CreateBlockRequest, ServerBlock>(
      `/entities/${draft.entityId}/blocks`,
      { encrypted_data: draft.encryptedData }
    )

    if (response.isFailed()) {
      return Result.fail(response.getErrorMessage())
    }

    try {
      await this.blockRepository.saveBlock(response.getValue())
    } catch {
      void 0
    }

    await this.blockRepository.deleteBlock(draft.id)
    // Remove the draft from the local draft-block cache once the server block is persisted.
    const blocks = this.cacheStores.draftBlockCache.get(draft.entityId) ?? []
    const remainingBlocks: BlockDraft[] = []
    for (const block of blocks) {
      if (block.id !== draft.id) {
        remainingBlocks.push(block)
      }
    }
    this.cacheStores.draftBlockCache.set(draft.entityId, remainingBlocks)

    return Result.ok(response.getValue())
  }
}

export class CreateDraft {
  constructor(
    private readonly syncDraft: SyncDraft,
    private readonly persistDraft: PersistDraft
  ) {}

  async execute(dto: { entity: ServerEntity; attemptSync: boolean; formedOnHash?: HexString }) {
    const { entity, attemptSync, formedOnHash } = dto
    const draft: Draft = {
      id: entity.id,
      workspaceId: entity.workspace_id,
      entity,
      formedOnHash,
      deleteEntity: false,
      lastAttemptedSave: undefined,
      saveAttempts: 0,
      saveError: undefined,
    }

    await this.persistDraft.execute(draft)

    if (attemptSync) {
      await this.syncDraft.execute(entity.id)
    }

    return draft
  }
}

export class UpdateEntity {
  constructor(
    private readonly createDraft: CreateDraft,
    private readonly cacheStores: CacheStores,
    private readonly getWrappingKey: GetWrappingKey,
    private readonly encryptEntity: EncryptEntity,
    private readonly repositoryStore: RepositoryStore,
    private readonly indexClientEntity: IndexClientEntity
  ) {}

  async execute<C extends EntityContent, M extends EntityMetaFields>(dto: {
    id: string
    content: C
    metaFields?: Partial<M>
    mentionedUserIds?: string[]
    parentUpdate?: ParentUpdateIntent
  }): Promise<Result<ClientEntity<C, M>>> {
    const { id, content, metaFields, mentionedUserIds, parentUpdate } = dto

    const clientEntity = this.cacheStores.entityStore.get<C, M>(id)
    if (!clientEntity) {
      return Result.fail("Entity not found")
    }

    const updatedClientEntity: ClientEntity<C, M> = {
      ...clientEntity,
      content,
      ...(metaFields ? { metaFields: { ...clientEntity.metaFields, ...metaFields } } : {}),
      ...(mentionedUserIds ? { mentionedUserIds } : {}),
    }

    this.cacheStores.entityStore.setDirtyVersion(updatedClientEntity)

    const serverEntity = await this.repositoryStore.entityRepository.getEntity(id)
    if (!serverEntity) {
      return Result.fail("Entity not found")
    }

    const wrappingParent = getParentReferenceFromUpdateIntent(parentUpdate)
    const wrappingKey =
      wrappingParent === undefined
        ? this.getWrappingKey.executeForExistingEntity({
            entity: {
              wrapping_key_type: clientEntity.wrappingKeyType,
              wrapping_key_id: clientEntity.wrappingKeyId,
            },
          })
        : this.getWrappingKey.executeForNewEntity({ parentId: wrappingParent?.id })
    if (!wrappingKey) {
      return Result.fail("Failed to get wrapping key for file update")
    }

    const { encrypted } = this.encryptEntity.execute({
      content,
      entityType: clientEntity.entityType,
      entityId: id,
      wrappingKey,
      existingEntityKey: clientEntity.entityKey,
    })

    const updatedServerEntity: ServerEntity = {
      ...serverEntity,
      ...encrypted,
      ...(metaFields ? { meta_fields: { ...serverEntity.meta_fields, ...metaFields } } : {}),
      ...(mentionedUserIds ? { mentioned_user_ids: mentionedUserIds } : {}),
    }

    applyParentUpdateToEntityPayload(updatedServerEntity, parentUpdate)

    await this.createDraft.execute({
      entity: updatedServerEntity,
      attemptSync: true,
      formedOnHash: clientEntity.contentHash,
    })

    this.indexClientEntity.execute(updatedClientEntity)

    return Result.ok(updatedClientEntity)
  }
}

export class PersistDraft {
  constructor(
    private readonly repository: DraftRepository,
    private readonly cacheStores: CacheStores
  ) {}

  async execute(draft: Draft) {
    await this.repository.saveDraft(draft)
    this.cacheStores.draftCache.set(draft.id, draft)

    return draft
  }
}

function mapCachedEntityToServerEntity(entity: ClientEntity): ServerEntity {
  return {
    id: entity.id,
    workspace_id: entity.workspaceId,
    entity_type: entity.entityType,
    parent_id: entity.parentId,
    parent_type: entity.parentType,
    creator_id: entity.creatorId,
    last_updated_by_id: entity.lastUpdatedById,
    chain_root_key_id: entity.chainRootKeyId,
    wrapping_key_id: entity.wrappingKeyId,
    wrapping_key_type: entity.wrappingKeyType,
    entity_key_nonce: "",
    wrapped_entity_key: "",
    content_nonce: "",
    content_ciphertext: "",
    content_hash: entity.contentHash,
    meta_fields: entity.metaFields,
    mentioned_user_ids: entity.mentionedUserIds,
    created_at: entity.createdAt.toISOString(),
    updated_at: entity.updatedAt.toISOString(),
  }
}

export class DeleteEntity {
  constructor(
    private readonly cacheStores: CacheStores,
    private readonly entityRepo: EntityRepository,
    private readonly blockRepo: BlockRepository,
    private readonly searchIndex: SearchIndexInterface,
    private readonly syncDraft: SyncDraft,
    private readonly persistDraft: PersistDraft
  ) {}

  async execute(
    entityId: string,
    options: {
      entitySnapshot?: ClientEntity
    } = {}
  ): Promise<Result<void>> {
    const { entitySnapshot } = options
    const existingDraft = this.cacheStores.draftCache.get(entityId)
    const cachedEntity = this.cacheStores.entityStore.get(entityId)
    let storedEntity: ServerEntity | undefined
    let draftEntity =
      existingDraft?.entity ??
      (cachedEntity ? mapCachedEntityToServerEntity(cachedEntity) : undefined) ??
      (entitySnapshot ? mapCachedEntityToServerEntity(entitySnapshot) : undefined)

    if (!draftEntity) {
      const repoEntity = await this.entityRepo.getEntity(entityId)
      if (repoEntity) {
        storedEntity = repoEntity
        draftEntity = repoEntity
      }
    }

    if (!draftEntity) {
      return Result.fail("Entity not found")
    }

    const draft: Draft = {
      id: entityId,
      workspaceId: draftEntity.workspace_id,
      entity: draftEntity,
      formedOnHash:
        cachedEntity?.contentHash ??
        entitySnapshot?.contentHash ??
        storedEntity?.content_hash ??
        existingDraft?.formedOnHash,
      deleteEntity: true,
      saveAttempts: 0,
    }

    // Mark delete intent immediately to prevent stale create responses from re-persisting this entity.
    this.cacheStores.draftCache.set(draft.id, draft)

    this.cacheStores.entityStore.delete(entityId)
    await this.blockRepo.deleteBlocksByEntity(entityId)
    await this.searchIndex.removeEntity(entityId, draftEntity.entity_type)

    await this.persistDraft.execute(draft)
    await this.syncDraft.execute(entityId)

    return Result.ok()
  }
}

export class RemoveEntityLocally {
  constructor(
    private readonly cacheStores: CacheStores,
    private readonly draftRepo: DraftRepository,
    private readonly entityRepo: EntityRepository,
    private readonly blockRepo: BlockRepository,
    private readonly searchIndex: SearchIndexInterface
  ) {}

  async execute(entityId: string, entityType: EntityType) {
    this.cacheStores.draftCache.delete(entityId)
    this.cacheStores.entityStore.delete(entityId)

    await this.draftRepo.deleteDraft(entityId)
    await this.entityRepo.deleteEntity(entityId)
    await this.blockRepo.deleteBlocksByEntity(entityId)

    await this.searchIndex.removeEntity(entityId, entityType)
  }
}

export class ClearDraft {
  constructor(
    private readonly cacheStores: CacheStores,
    private readonly draftRepo: DraftRepository,
    private readonly blockRepo: BlockRepository,
    private readonly eventBus: EventBus
  ) {}

  async execute(entityId: string, options: { clearBlocks?: boolean } = {}): Promise<void> {
    const { clearBlocks = true } = options

    this.cacheStores.draftCache.delete(entityId)
    this.cacheStores.entityStore.deleteDirtyVersion(entityId)
    await this.draftRepo.deleteDraft(entityId)

    if (clearBlocks) {
      await this.blockRepo.deleteBlocksByEntity(entityId)
      this.cacheStores.draftBlockCache.delete(entityId)
    }

    this.eventBus.emit(this.eventBus.EVENTS.CANCEL_DRAFT_RETRY, entityId)
  }
}

export type DraftSyncStatus = "success" | "conflict" | "orphaned" | "error"

export interface DraftSyncOutcome {
  status: DraftSyncStatus
  errorMessage?: string
}

export class SyncDraft {
  private readonly inFlightByEntityId = new Map<string, Promise<Result<DraftSyncOutcome>>>()

  constructor(
    private readonly cacheStores: CacheStores,
    private readonly workspaceInfoStore: WorkspaceInfoStore,
    private readonly makeWorkspaceRequest: MakeWorkspaceRequest,
    private readonly removeEntityLocally: RemoveEntityLocally,
    private readonly persistServerEntity: PersistServerEntity,
    private readonly clearDraft: ClearDraft,
    private readonly syncBlockDraft: SyncBlockDraft,
    private readonly persistDraft: PersistDraft,
    private readonly eventBus: EventBus
  ) {}

  async execute(
    entityId: string,
    options: {
      resetAttempts?: boolean
      // Used for "Keep local" conflict resolution.
      forceSaveWithExpectedHash?: string
      // Restores an orphaned draft as a new create (formed_on_hash = null).
      restoreDraftAsNew?: boolean
    } = {}
  ): Promise<Result<DraftSyncOutcome>> {
    while (true) {
      const inFlight = this.inFlightByEntityId.get(entityId)
      if (!inFlight) {
        break
      }
      await inFlight
    }

    const operation = this.executeInternal(entityId, options)
    this.inFlightByEntityId.set(entityId, operation)
    try {
      return await operation
    } finally {
      if (this.inFlightByEntityId.get(entityId) === operation) {
        this.inFlightByEntityId.delete(entityId)
      }
    }
  }

  private async executeInternal(
    entityId: string,
    options: {
      resetAttempts?: boolean
      forceSaveWithExpectedHash?: string
      restoreDraftAsNew?: boolean
    } = {}
  ): Promise<Result<DraftSyncOutcome>> {
    if (!this.workspaceInfoStore.isOnline()) {
      return Result.fail("Workspace is offline")
    }

    const draft = this.cacheStores.draftCache.get(entityId)
    if (!draft) {
      return Result.fail("Draft not found")
    }

    if (!canAttemptAutomaticSave(draft)) {
      return Result.fail("Draft has reached the maximum number of automatic attempts")
    }

    const updatedDraft: Draft = {
      ...draft,
      lastAttemptedSave: new Date().toISOString(),
      saveAttempts: options.resetAttempts ? 0 : draft.saveAttempts + 1,
      saveError: options.resetAttempts ? undefined : draft.saveError,
      formedOnHash: options.forceSaveWithExpectedHash
        ? options.forceSaveWithExpectedHash
        : options.restoreDraftAsNew
          ? undefined
          : draft.formedOnHash,
    }

    await this.persistDraft.execute(updatedDraft)

    const networkOutcome = await this.performNetworkOperation(updatedDraft)

    if (networkOutcome.status === "success") {
      const latestDraft = this.cacheStores.draftCache.get(entityId)
      if (!latestDraft) {
        return Result.ok(networkOutcome)
      }
      if (!isSameDraftIntent(latestDraft, updatedDraft)) {
        return Result.ok(networkOutcome)
      }

      await this.clearDraft.execute(entityId, { clearBlocks: updatedDraft.deleteEntity })

      if (!updatedDraft.deleteEntity) {
        const childBlocks = this.cacheStores.draftBlockCache.get(entityId) ?? []
        for (const block of childBlocks) {
          await this.syncBlockDraft.execute(block)
        }
        const childrenEntitiesReferencingThisEntity = Array.from(this.cacheStores.draftCache.values()).filter(
          draft => {
            return draft.entity.parent_id === entityId
          }
        )
        for (const childEntity of childrenEntitiesReferencingThisEntity) {
          await this.execute(childEntity.id)
        }
      }

      return Result.ok(networkOutcome)
    }

    if (networkOutcome.status === "conflict" || networkOutcome.status === "orphaned") {
      await this.persistDraft.execute({
        ...updatedDraft,
        saveError: networkOutcome.errorMessage ?? networkOutcome.status,
      })
      return Result.ok(networkOutcome)
    }

    await this.persistDraft.execute({
      ...updatedDraft,
      saveError: networkOutcome.errorMessage ?? "Failed to save",
    })

    if (canAttemptAutomaticSave(updatedDraft)) {
      this.eventBus.emit(this.eventBus.EVENTS.SCHEDULE_DRAFT_RETRY, updatedDraft)
    }

    return Result.fail(networkOutcome.errorMessage ?? "Failed to save")
  }

  private async performNetworkOperation(draft: Draft): Promise<DraftSyncOutcome> {
    if (draft.deleteEntity) {
      const result = await this.makeWorkspaceRequest.executeDelete(`entities/${draft.id}`)
      if (result.isFailed()) {
        if (result.hasStatus(404)) {
          await this.removeEntityLocally.execute(draft.id, draft.entity.entity_type)
          return { status: "success" }
        } else {
          return { status: "error", errorMessage: result.getErrorMessage() }
        }
      } else {
        await this.removeEntityLocally.execute(draft.id, draft.entity.entity_type)
        return { status: "success" }
      }
    } else if (draft.formedOnHash === undefined) {
      const apiResult = await this.makeWorkspaceRequest.executePost<CreateEntityRequest, ServerEntity>(
        "entities",
        draft.entity
      )
      if (apiResult.isFailed()) {
        if (!isDuplicateEntityCreateError(apiResult)) {
          return { status: "error", errorMessage: apiResult.getErrorMessage() }
        }

        const existingEntityResult = await this.makeWorkspaceRequest.executeGet<ServerEntity>(`entities/${draft.id}`)
        if (existingEntityResult.isFailed()) {
          return { status: "error", errorMessage: apiResult.getErrorMessage() }
        }

        const saveExistingResult = await this.persistServerEntity.execute(existingEntityResult.getValue())
        if (
          saveExistingResult.isFailed() &&
          saveExistingResult.getError() !== ENTITY_HAS_PENDING_DELETE_DRAFT &&
          saveExistingResult.getError() !== ENTITY_IGNORED_DUE_TO_LOCAL_DELETE
        ) {
          return { status: "error", errorMessage: saveExistingResult.getError() }
        }

        return { status: "success" }
      } else {
        const serverEntity = apiResult.getValue()
        // If this create draft was replaced (e.g., user deleted the entity while create was in-flight),
        // avoid resurrecting the entity locally and best-effort clean it up on the server.
        const latestDraft = this.cacheStores.draftCache.get(draft.id)
        if (latestDraft?.deleteEntity) {
          await this.makeWorkspaceRequest.executeDelete(`entities/${draft.id}`)
          this.cacheStores.entityStore.delete(draft.id)
          return { status: "success" }
        }
        if (!latestDraft || !isSameDraftIntent(latestDraft, draft)) {
          return { status: "success" }
        }
        const saveResult = await this.persistServerEntity.execute(serverEntity)
        if (saveResult.isFailed()) {
          if (
            saveResult.getError() === ENTITY_HAS_PENDING_DELETE_DRAFT ||
            saveResult.getError() === ENTITY_IGNORED_DUE_TO_LOCAL_DELETE
          ) {
            return { status: "success" }
          }
          return { status: "error", errorMessage: saveResult.getError() }
        }
        return { status: "success" }
      }
    } else {
      if (!draft.formedOnHash) {
        throw new Error("Expected hash is required")
      }
      const apiResult = await this.makeWorkspaceRequest.executePut<UpdateEntityRequest, ServerEntity>(
        `entities/${draft.id}`,
        { ...draft.entity, expected_hash: draft.formedOnHash }
      )
      if (apiResult.isFailed()) {
        if (apiResult.hasStatus(404)) {
          return { status: "orphaned", errorMessage: "Entity missing" }
        } else if (apiResult.hasStatus(409)) {
          return { status: "conflict", errorMessage: "Conflict detected" }
        } else {
          return { status: "error", errorMessage: apiResult.getErrorMessage() }
        }
      } else {
        const serverEntity = apiResult.getValue()
        const saveResult = await this.persistServerEntity.execute(serverEntity)
        if (saveResult.isFailed()) {
          if (
            saveResult.getError() === ENTITY_HAS_PENDING_DELETE_DRAFT ||
            saveResult.getError() === ENTITY_IGNORED_DUE_TO_LOCAL_DELETE
          ) {
            return { status: "success" }
          }
          return { status: "error", errorMessage: saveResult.getError() }
        }
        return { status: "success" }
      }
    }
  }
}

export type ComparisonOperator = "eq" | "ne" | "in" | "not_in" | "is_null" | "is_not_null"

export type LogicalOperator = "and" | "or"

export type RemotePredicate = {
  type: "predicate"
  field: keyof ServerEntity
  operator: ComparisonOperator
  value?: unknown
}

export type RemoteQueryGroup = {
  type: "group"
  operator: LogicalOperator
  children: RemoteQueryNode[]
}

type RemoteQueryNode = RemotePredicate | RemoteQueryGroup

export class ExecuteRemoteQuery {
  constructor(private readonly makeWorkspaceRequest: MakeWorkspaceRequest) {}

  async execute(queries: RemoteQueryNode): Promise<Result<ServerEntity[]>> {
    const result = await this.makeWorkspaceRequest.executePost<{ query: RemoteQueryNode }, ServerEntity[]>(
      `entities`,
      {
        query: queries,
      }
    )
    if (result.isFailed()) {
      return Result.fail(result.getErrorMessage())
    }
    return Result.ok(result.getValue())
  }
}

export class QueryEntitiesAndCache {
  constructor(
    private readonly executeRemoteQuery: ExecuteRemoteQuery,
    private readonly persistServerEntity: PersistServerEntity
  ) {}

  async execute(query: RemoteQueryNode): Promise<Result<ClientEntity[]>> {
    const result = await this.executeRemoteQuery.execute(query)
    if (result.isFailed()) {
      return Result.fail(result.getError())
    }

    const entities = result.getValue()
    if (entities.length === 0) {
      return Result.ok([])
    }

    const cacheResults = await Promise.all(entities.map(entity => this.persistServerEntity.execute(entity)))
    const cachedEntities: ClientEntity[] = []
    let hasHardFailure = false
    for (const cacheResult of cacheResults) {
      if (cacheResult.isOk()) {
        cachedEntities.push(cacheResult.getValue())
        continue
      }
      if (cacheResult.getError() !== ENTITY_IGNORED_DUE_TO_LOCAL_DELETE) {
        hasHardFailure = true
      }
    }

    if (cachedEntities.length === 0) {
      if (!hasHardFailure) {
        return Result.ok([])
      }
      return Result.fail("Failed to decrypt entities")
    }

    return Result.ok(cachedEntities)
  }
}

export class QueryEntitiesByParent {
  constructor(private readonly queryEntitiesAndCache: QueryEntitiesAndCache) {}

  async execute(parentId: string): Promise<Result<ClientEntity[]>> {
    const query: RemoteQueryNode = {
      type: "predicate",
      field: "parent_id",
      operator: "eq",
      value: parentId,
    }

    return this.queryEntitiesAndCache.execute(query)
  }
}

export class QueryEntityById {
  constructor(private readonly queryEntitiesAndCache: QueryEntitiesAndCache) {}

  async execute(entityId: string): Promise<Result<ClientEntity>> {
    const query: RemoteQueryNode = {
      type: "predicate",
      field: "id",
      operator: "eq",
      value: entityId,
    }

    const result = await this.queryEntitiesAndCache.execute(query)

    if (result.isFailed()) {
      return Result.fail(result.getError())
    } else {
      const entities = result.getValue()
      if (entities.length === 0) {
        return Result.fail("Entity decryption failed")
      }

      return Result.ok(entities[0])
    }
  }
}

export class FetchStandaloneFiles {
  constructor(private readonly executeRemoteQuery: ExecuteRemoteQuery) {}

  async execute(): Promise<Result<EncryptedFile[]>> {
    // (entity_type = "file") AND (parent_type IS NULL OR parent_type = "folder")
    const query: RemoteQueryNode = {
      type: "group",
      operator: "and",
      children: [
        {
          type: "predicate",
          field: "entity_type",
          operator: "eq",
          value: "file",
        },
        {
          type: "group",
          operator: "or",
          children: [
            {
              type: "predicate",
              field: "parent_type",
              operator: "is_null",
            },
            {
              type: "predicate",
              field: "parent_type",
              operator: "eq",
              value: "folder",
            },
          ],
        },
      ],
    }

    const result = await this.executeRemoteQuery.execute(query)
    if (result.isFailed()) {
      return Result.fail(result.getError())
    }
    return Result.ok(result.getValue().map(entity => entity as EncryptedFile))
  }
}
