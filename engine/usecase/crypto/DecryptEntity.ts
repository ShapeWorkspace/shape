import { Crypto } from "../../crypto/crypto"
import { HexString } from "../../crypto/types"
import { ClientEntity, EntityContent, EntityMetaFields, ServerEntity } from "../../models/entity"
import {
  getWrappingKeyId,
  getWrappingKeyKey,
  getWrappingKeyType,
  WrappingKey,
} from "../../utils/encryption-types"
import { Result } from "../../utils/Result"
import { buildContentEncryptionAssociatedData, buildEntityKeyWrappingAssociatedData } from "./crypto-utils"

export class DecryptEntity {
  constructor(private readonly crypto: Crypto) {}

  execute<C extends EntityContent, M extends EntityMetaFields>(dto: {
    serverEntity: ServerEntity<M>
    wrappingKey: WrappingKey
  }): Result<ClientEntity<C, M>> {
    const entityKeyResult = this.decryptEntityKey(dto.serverEntity, dto.wrappingKey)
    if (entityKeyResult.isFailed()) {
      return Result.fail(entityKeyResult.getError())
    }
    const entityKey = entityKeyResult.getValue()
    const serverEntity = dto.serverEntity

    const contentAssociatedData = buildContentEncryptionAssociatedData(
      serverEntity.workspace_id,
      serverEntity.entity_type,
      serverEntity.id
    )

    const contentJson = this.crypto.xchacha20Decrypt(
      serverEntity.content_ciphertext,
      serverEntity.content_nonce,
      entityKey,
      contentAssociatedData
    )

    if (contentJson === null) {
      return Result.fail(`Failed to decrypt content for ${serverEntity.id}`)
    }

    let content: C
    try {
      content = JSON.parse(contentJson) as C
    } catch (error) {
      return Result.fail(`Failed to parse decrypted content for ${serverEntity.id}: ${error}`)
    }

    const entity: ClientEntity<C, M> = {
      id: serverEntity.id,
      workspaceId: serverEntity.workspace_id,
      entityType: serverEntity.entity_type,
      parentId: serverEntity.parent_id ?? undefined,
      parentType: serverEntity.parent_type ?? undefined,
      creatorId: serverEntity.creator_id,
      lastUpdatedById: serverEntity.last_updated_by_id,
      content: content,
      metaFields: serverEntity.meta_fields,
      mentionedUserIds: serverEntity.mentioned_user_ids,
      contentHash: serverEntity.content_hash,
      createdAt: new Date(serverEntity.created_at),
      updatedAt: new Date(serverEntity.updated_at),
      chainRootKeyId: serverEntity.chain_root_key_id,
      wrappingKeyId: serverEntity.wrapping_key_id,
      wrappingKeyType: serverEntity.wrapping_key_type,
      entityKey: entityKey,
    }

    return Result.ok(entity)
  }

  private decryptEntityKey(entity: ServerEntity, wrappingKey: WrappingKey): Result<HexString> {
    // Verify the wrapping key ID matches what the entity expects
    if (entity.wrapping_key_id !== getWrappingKeyId(wrappingKey)) {
      return Result.fail(
        `Wrapping key mismatch for ${entity.id}
        (expected ${entity.wrapping_key_id}, got ${getWrappingKeyId(wrappingKey)})`
      )
    }

    // Build the same associated data that was used during encryption
    const entityKeyAssociatedData = buildEntityKeyWrappingAssociatedData(
      entity.workspace_id,
      entity.entity_type,
      entity.id,
      getWrappingKeyType(wrappingKey),
      getWrappingKeyId(wrappingKey)
    )

    // Unwrap the entity key
    const entityKey = this.crypto.xchacha20Decrypt(
      entity.wrapped_entity_key,
      entity.entity_key_nonce,
      getWrappingKeyKey(wrappingKey),
      entityKeyAssociatedData
    )

    if (entityKey === null) {
      return Result.fail(`Failed to unwrap entity key for ${entity.id}`)
    }

    return Result.ok(entityKey)
  }
}
