import { ENTITY_KEY_BYTES, XCHACHA20_NONCE_BYTES } from "../../crypto/constants"
import { Crypto } from "../../crypto/crypto"
import { ServerEntity } from "../../models/entity"
import {
  EntityType,
  WrappingKey,
  getChainRootKeyId,
  getWrappingKeyId,
  getWrappingKeyKey,
  getWrappingKeyType,
} from "../../utils/encryption-types"
import { buildContentEncryptionAssociatedData, buildEntityKeyWrappingAssociatedData } from "./crypto-utils"

export type EncryptionResult = Pick<
  ServerEntity,
  | "id"
  | "workspace_id"
  | "chain_root_key_id"
  | "wrapping_key_id"
  | "wrapping_key_type"
  | "entity_key_nonce"
  | "wrapped_entity_key"
  | "content_nonce"
  | "content_ciphertext"
  | "content_hash"
>

export class EncryptEntity {
  constructor(private readonly crypto: Crypto) {}

  execute<T>(dto: {
    content: T
    entityType: EntityType
    entityId: string
    wrappingKey: WrappingKey
    existingEntityKey?: string
  }): {
    encrypted: EncryptionResult
    entityKey: string
  } {
    const { content, entityType, entityId, wrappingKey, existingEntityKey } = dto

    const entityKey = existingEntityKey ?? this.crypto.generateRandomKey(ENTITY_KEY_BYTES)

    const entityKeyNonce = this.crypto.generateRandomKey(XCHACHA20_NONCE_BYTES)
    const contentNonce = this.crypto.generateRandomKey(XCHACHA20_NONCE_BYTES)

    const entityKeyAssociatedData = buildEntityKeyWrappingAssociatedData(
      wrappingKey.workspaceId,
      entityType,
      entityId,
      getWrappingKeyType(wrappingKey),
      getWrappingKeyId(wrappingKey)
    )

    const wrappedEntityKey = this.crypto.xchacha20Encrypt(
      entityKey,
      entityKeyNonce,
      getWrappingKeyKey(wrappingKey),
      entityKeyAssociatedData
    )

    const contentAssociatedData = buildContentEncryptionAssociatedData(
      wrappingKey.workspaceId,
      entityType,
      entityId
    )

    const contentJson = JSON.stringify(content)
    const contentCiphertext = this.crypto.xchacha20Encrypt(
      contentJson,
      contentNonce,
      entityKey,
      contentAssociatedData
    )

    const contentHash = this.crypto.sodiumCryptoGenericHash(contentCiphertext)

    return {
      encrypted: {
        id: entityId,
        workspace_id: wrappingKey.workspaceId,
        chain_root_key_id: getChainRootKeyId(wrappingKey),
        wrapping_key_id: getWrappingKeyId(wrappingKey),
        wrapping_key_type: getWrappingKeyType(wrappingKey),
        entity_key_nonce: entityKeyNonce,
        wrapped_entity_key: wrappedEntityKey,
        content_nonce: contentNonce,
        content_ciphertext: contentCiphertext,
        content_hash: contentHash,
      },
      entityKey,
    }
  }
}
