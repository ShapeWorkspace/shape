/**
 * Utility functions for encoding/decoding encrypted Yjs blocks.
 *
 * Provides protobuf serialization for Blocks messages containing multiple
 * encrypted Yjs deltas, plus base64 conversion helpers.
 */

import * as Utils from "../../crypto/utils"
import {
  EncryptedYjsDelta as EncryptedYjsDeltaProto,
  Blocks as BlocksProto,
  EncryptedYjsDelta,
} from "../../protobufs/entityblock"

/**
 * Represents a collection of encrypted Yjs deltas (matches protobuf structure).
 */
export type Blocks = {
  deltas: EncryptedYjsDelta[]
}

/**
 * Creates a Blocks message containing a single encrypted delta.
 * Returns the protobuf-encoded bytes.
 */
export function createBlocksFromSingleDelta(delta: EncryptedYjsDelta): Uint8Array {
  return encodeBlocks({ deltas: [delta] })
}

/**
 * Creates a Blocks message containing multiple encrypted deltas.
 * Used when aggregating multiple edits before sending to server.
 */
export function createBlocksFromMultipleDeltas(deltas: EncryptedYjsDelta[]): Uint8Array {
  return encodeBlocks({ deltas })
}

/**
 * Decodes a base64-encoded Blocks protobuf.
 * Returns the decoded blocks, or null if decoding fails.
 */
export function decodeBlocksFromBase64(base64Data: string): Blocks | null {
  try {
    const bytes = Utils.base64ToArrayBuffer(base64Data)
    return decodeBlocks(bytes)
  } catch {
    return null
  }
}

/**
 * Encodes a Blocks message to base64.
 */
export function encodeBlocksToBase64(blocks: Blocks): string {
  const bytes = encodeBlocks(blocks)
  return Utils.arrayBufferToBase64(bytes)
}

/**
 * Encodes a Blocks message to protobuf wire format using protobuf-ts.
 */
export function encodeBlocks(blocks: Blocks): Uint8Array {
  // Create protobuf message from our data
  const protoBlock = BlocksProto.create({
    deltas: blocks.deltas.map(delta =>
      EncryptedYjsDeltaProto.create({
        ciphertext: delta.ciphertext,
        nonce: delta.nonce,
      })
    ),
  })

  // Serialize to binary using protobuf-ts
  return BlocksProto.toBinary(protoBlock)
}

/**
 * Decodes a Blocks message from protobuf wire format using protobuf-ts.
 */
export function decodeBlocks(data: Uint8Array): Blocks | null {
  try {
    // Deserialize from binary using protobuf-ts
    const protoBlock = BlocksProto.fromBinary(data)

    // Convert to our interface format
    return {
      deltas: protoBlock.deltas.map(delta => ({
        ciphertext: delta.ciphertext,
        nonce: delta.nonce,
      })),
    }
  } catch {
    return null
  }
}
