/**
 * EncryptFileChunk usecase encrypts a file chunk using streaming encryption.
 *
 * Uses libsodium's secretstream (XChaCha20-Poly1305) which provides:
 * - Automatic rekeying for large files
 * - Authentication of each chunk with associated data
 * - Tag to mark the final chunk for integrity
 */

import { Crypto } from "../../crypto/crypto"
import { StreamEncryptor, SodiumTag } from "../../crypto/types"
import { buildFileChunkAssociatedData } from "./file-crypto-utils"

export interface EncryptFileChunkParams {
  /** The streaming encryptor from PrepareFileEncryption */
  encryptor: StreamEncryptor
  /** The plaintext chunk data */
  chunk: Uint8Array
  /** 0-based index of this chunk */
  chunkIndex: number
  /** Whether this is the final chunk */
  isLastChunk: boolean
  /** The file ID for AD construction */
  fileId: string
  /** The workspace key ID for AD construction */
  workspaceKeyId: string
}

export class EncryptFileChunk {
  constructor(private readonly crypto: Crypto, private readonly workspaceId: string) { }

  /**
   * Encrypts a file chunk using the streaming encryptor.
   * Returns the encrypted chunk data.
   */
  execute(params: EncryptFileChunkParams): Uint8Array {
    const { encryptor, chunk, chunkIndex, isLastChunk, fileId, workspaceKeyId } = params

    // Build associated data that binds this chunk to the file
    const ad = buildFileChunkAssociatedData(this.workspaceId, fileId, chunkIndex, workspaceKeyId)

    // Use TAG_FINAL for the last chunk to ensure integrity
    const tag = isLastChunk
      ? SodiumTag.CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_TAG_FINAL
      : SodiumTag.CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_TAG_PUSH

    return this.crypto.xchacha20StreamEncryptorPush(encryptor, chunk, ad, tag)
  }
}
