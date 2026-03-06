/**
 * Utility functions for file encryption operations.
 *
 * Contains pure functions for chunk calculations, file reading,
 * and associated data construction.
 */

// File chunk size: 5MB (matches server expectation)
export const FILE_CHUNK_SIZE = 5 * 1024 * 1024

/**
 * Calculates the number of chunks needed for a file of the given size.
 */
export function calculateFileChunkCount(fileSize: number): number {
  return Math.ceil(fileSize / FILE_CHUNK_SIZE)
}

/**
 * Reads a chunk from a File object at the given index.
 */
export async function readFileChunk(file: File, chunkIndex: number): Promise<Uint8Array> {
  const start = chunkIndex * FILE_CHUNK_SIZE
  const end = Math.min(start + FILE_CHUNK_SIZE, file.size)
  const blob = file.slice(start, end)
  const buffer = await blob.arrayBuffer()
  return new Uint8Array(buffer)
}

/**
 * Builds associated data for a file chunk.
 * Format: shape:v1:file:<workspaceId>:file:<fileId>:chunk-<index>:<keyId>
 *
 * The AD binds each encrypted chunk to:
 * - The specific workspace
 * - The specific file
 * - The chunk index (prevents reordering)
 * - The key ID (prevents key confusion attacks)
 */
export function buildFileChunkAssociatedData(
  workspaceId: string,
  fileId: string,
  chunkIndex: number,
  workspaceKeyId: string
): string {
  return `shape:v1:file:${workspaceId}:file:${fileId}:chunk-${chunkIndex}:${workspaceKeyId}`
}
