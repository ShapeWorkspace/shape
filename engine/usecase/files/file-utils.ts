import { FILE_CHUNK_SIZE } from "../crypto/file-crypto-utils"

/**
 * Normalizes a ReadableStream or AsyncIterable into an AsyncIterable of Uint8Array chunks.
 */
export async function* normalizeUploadStreamSource(
  source: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>
): AsyncGenerator<Uint8Array> {
  if (Symbol.asyncIterator in source) {
    for await (const chunk of source as AsyncIterable<Uint8Array>) {
      yield chunk
    }
    return
  }

  const reader = (source as ReadableStream<Uint8Array>).getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      if (value) {
        yield value
      }
    }
  } finally {
    reader.releaseLock()
  }
}
/**
 * Coalesces arbitrary chunk sizes into fixed FILE_CHUNK_SIZE blocks.
 * The final yielded chunk may be smaller than FILE_CHUNK_SIZE.
 */

export async function* coalesceChunksToFileChunkSize(
  source: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>
): AsyncGenerator<Uint8Array> {
  let buffered = new Uint8Array(0)

  for await (const chunk of normalizeUploadStreamSource(source)) {
    if (chunk.length === 0) {
      continue
    }

    const combined = new Uint8Array(buffered.length + chunk.length)
    combined.set(buffered, 0)
    combined.set(chunk, buffered.length)
    buffered = combined

    while (buffered.length >= FILE_CHUNK_SIZE) {
      yield buffered.slice(0, FILE_CHUNK_SIZE)
      buffered = buffered.slice(FILE_CHUNK_SIZE)
    }
  }

  if (buffered.length > 0) {
    yield buffered
  }
}
