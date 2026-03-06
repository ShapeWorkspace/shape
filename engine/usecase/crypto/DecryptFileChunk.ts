/**
 * DecryptFileChunk usecase decrypts a file chunk using streaming decryption.
 *
 * Uses the stateful decryptor from InitFileDecryptor to decrypt chunks
 * sequentially, verifying the associated data for each chunk.
 */

import { Crypto } from "../../crypto/crypto"
import { StreamDecryptor, StreamDecryptorResult } from "../../crypto/types"
import { logger } from "../../utils/logger"
import { buildFileChunkAssociatedData } from "./file-crypto-utils"

export interface DecryptFileChunkParams {
  /** The streaming decryptor from InitFileDecryptor */
  decryptor: StreamDecryptor
  /** The encrypted chunk data */
  encryptedChunk: Uint8Array
  /** 0-based index of this chunk */
  chunkIndex: number
  /** The workspace ID for AD construction */
  workspaceId: string
  /** The file ID for AD construction */
  fileId: string
  /** The workspace key ID for AD construction */
  workspaceKeyId: string
}

export class DecryptFileChunk {
  constructor(private readonly crypto: Crypto) {}

  /**
   * Decrypts a file chunk using the streaming decryptor.
   * Returns the decrypted chunk data, or null if decryption fails.
   */
  execute(params: DecryptFileChunkParams): Uint8Array | null {
    const { decryptor, encryptedChunk, chunkIndex, workspaceId, fileId, workspaceKeyId } = params

    const ad = buildFileChunkAssociatedData(workspaceId, fileId, chunkIndex, workspaceKeyId)

    const result: StreamDecryptorResult | false = this.crypto.xchacha20StreamDecryptorPush(
      decryptor,
      encryptedChunk,
      ad
    )

    if (result === false) {
      logger.error(`Failed to decrypt chunk ${chunkIndex} for file:${fileId}`)
      return null
    }

    return result.message
  }
}
