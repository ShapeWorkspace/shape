import { EncryptFileChunk } from "../crypto/EncryptFileChunk"
import { DecryptFileChunk } from "../crypto/DecryptFileChunk"
import { FILE_CHUNK_SIZE, calculateFileChunkCount, readFileChunk } from "../crypto/file-crypto-utils"
import { EntityType, getChainRootKeyId, WrappingKey } from "../../utils/encryption-types"
import { Crypto } from "../../crypto/crypto"
import type { HexString, StreamEncryptor } from "../../crypto/types"
import { Result } from "../../utils/Result"
import { MakeWorkspaceRequest } from "../network/MakeWorkspaceRequest"
import { ApiResult } from "../../utils/ApiResult"
import { WorkspaceInfoStore } from "../../store/workspace-info-store"
import { GetWrappingKey, IndexClientEntity } from "../entities/entities"
import {
  CreateEntityRequest,
  DecryptedFile,
  FileContent,
  FileMetaFields,
  serverEntityToClientEntity,
  EncryptedFile,
} from "../../models/entity"
import { CacheStores } from "../../store/cache-stores"
import { DecryptEntity } from "../crypto/DecryptEntity"
import { EncryptEntity } from "../crypto/EncryptEntity"
import { uint8ArrayToBase64String } from "../../utils/base64"
import { coalesceChunksToFileChunkSize } from "./file-utils"

export type ProgressCallback = (loaded: number, total: number) => void
export type UploadStreamSource = ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>
const LOCAL_INLINE_UPLOAD_URL_PREFIX = "local-inline://"

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

// ============================================================================
// Network usecases
// ============================================================================

interface PartUploadURL {
  part_number: number
  url: string
  expires_at: string
}

interface CompleteUploadRequest {
  stream_finalized: boolean
}

export interface UploadPartURLRequest {
  part_number: number
}

/**
 * Requests a single presigned URL for uploading a multipart part.
 */
export class RequestSingleUploadPartURL {
  constructor(private readonly makeWorkspaceRequest: MakeWorkspaceRequest) {}

  async execute(dto: { fileId: string; partNumber: number }): Promise<ApiResult<PartUploadURL>> {
    return this.makeWorkspaceRequest.executePost<UploadPartURLRequest, PartUploadURL>(
      `files/${dto.fileId}/upload-url`,
      { part_number: dto.partNumber }
    )
  }
}

interface RecordUploadPartRequest {
  part_number: number
  etag: string
  encrypted_size_bytes: number
  plaintext_size_bytes: number
  encrypted_chunk_base64?: string
}

/**
 * Records a completed multipart part so the server can finalize the upload later.
 */
export class RecordUploadedMultipartPart {
  constructor(private readonly makeWorkspaceRequest: MakeWorkspaceRequest) {}

  async execute(dto: {
    fileId: string
    partNumber: number
    etag: string
    encryptedSizeBytes: number
    plaintextSizeBytes: number
  }): Promise<ApiResult<void>> {
    return this.makeWorkspaceRequest.executePost<RecordUploadPartRequest, void>(`files/${dto.fileId}/parts`, {
      part_number: dto.partNumber,
      etag: dto.etag,
      encrypted_size_bytes: dto.encryptedSizeBytes,
      plaintext_size_bytes: dto.plaintextSizeBytes,
    })
  }
}

/**
 * Completes a multipart upload using the parts stored server-side.
 */
export class CompleteMultipartUpload {
  constructor(private readonly makeWorkspaceRequest: MakeWorkspaceRequest) {}

  async execute(dto: { fileId: string; streamFinalized: boolean }): Promise<ApiResult<EncryptedFile>> {
    return this.makeWorkspaceRequest.executePost<CompleteUploadRequest, EncryptedFile>(
      `files/${dto.fileId}/complete`,
      { stream_finalized: dto.streamFinalized }
    )
  }
}

/**
 * Uploads a single encrypted chunk and persists its metadata on the server.
 */
export class UploadEncryptedChunk {
  constructor(
    private readonly makeWorkspaceRequest: MakeWorkspaceRequest,
    private readonly encryptFileChunk: EncryptFileChunk,
    private readonly requestSingleUploadPartURL: RequestSingleUploadPartURL
  ) {}

  async execute(dto: {
    fileId: string
    partNumber: number
    chunkIndex: number
    encryptor: StreamEncryptor
    plaintextChunk: Uint8Array
    isFinalChunk: boolean
    wrappingKeyIdForAD: string
  }): Promise<ApiResult<void>> {
    const { fileId, partNumber, chunkIndex, encryptor, plaintextChunk, isFinalChunk, wrappingKeyIdForAD } =
      dto

    const encryptedChunk = this.encryptFileChunk.execute({
      encryptor,
      chunk: plaintextChunk,
      chunkIndex,
      isLastChunk: isFinalChunk,
      fileId,
      workspaceKeyId: wrappingKeyIdForAD,
    })

    const uploadUrl = await this.requestSingleUploadPartURL.execute({ fileId, partNumber })
    if (uploadUrl.isFailed()) {
      throw new Error(uploadUrl.getErrorMessage())
    }
    const uploadTarget = uploadUrl.getValue().url
    if (uploadTarget.startsWith(LOCAL_INLINE_UPLOAD_URL_PREFIX)) {
      const localRecordResult = await this.makeWorkspaceRequest.executePostNoContent<RecordUploadPartRequest>(
        `files/${fileId}/parts`,
        {
          part_number: partNumber,
          etag: `local-part-${partNumber}-${encryptedChunk.length}`,
          encrypted_size_bytes: encryptedChunk.length,
          plaintext_size_bytes: plaintextChunk.length,
          encrypted_chunk_base64: uint8ArrayToBase64String(encryptedChunk),
        }
      )
      if (localRecordResult.isFailed()) {
        throw new Error(localRecordResult.getErrorMessage())
      }
      return localRecordResult
    }

    const uploadPayload = encryptedChunk.slice().buffer
    const response = await fetch(uploadTarget, {
      method: "PUT",
      body: uploadPayload,
      headers: { "Content-Type": "application/octet-stream" },
    })

    if (!response.ok) {
      throw new Error(`Failed to upload chunk ${partNumber}: ${response.statusText}`)
    }

    const etag = response.headers.get("ETag")
    if (!etag) {
      throw new Error(`Missing ETag for chunk ${partNumber}`)
    }

    const recordResult = await this.makeWorkspaceRequest.executePostNoContent<RecordUploadPartRequest>(
      `files/${fileId}/parts`,
      {
        part_number: partNumber,
        etag: etag,
        encrypted_size_bytes: encryptedChunk.length,
        plaintext_size_bytes: plaintextChunk.length,
      }
    )
    if (recordResult.isFailed()) {
      throw new Error(recordResult.getErrorMessage())
    }
    return recordResult
  }
}

export class CreateBaseFile {
  constructor(
    private readonly crypto: Crypto,
    private readonly encryptEntity: EncryptEntity,
    private readonly getWrappingKey: GetWrappingKey,
    private readonly makeWorkspaceRequest: MakeWorkspaceRequest
  ) {}

  async execute(dto: {
    name: string
    mimeType: string
    parentEntity?: { id: string; type: EntityType }
  }): Promise<
    Result<{ file: EncryptedFile; entityKey: HexString; wrappingKey: WrappingKey; encryptor: StreamEncryptor }>
  > {
    const { name, mimeType, parentEntity } = dto
    const wrappingKey = this.getWrappingKey.executeForNewEntity({
      parentId: parentEntity?.id,
    })
    if (!wrappingKey) {
      return Result.fail("Failed to get wrapping key for base file creation")
    }

    const fileId = this.crypto.generateUUID()

    const { encrypted, entityKey } = this.encryptEntity.execute({
      content: {
        name,
        mimeType,
      },
      entityType: "file",
      entityId: fileId,
      wrappingKey,
    })

    const encryptor = this.crypto.xchacha20StreamInitEncryptor(entityKey)

    const createRequest: CreateEntityRequest<FileMetaFields> = {
      entity_type: "file",
      parent_id: parentEntity?.id ?? undefined,
      parent_type: parentEntity?.type ?? undefined,
      meta_fields: {
        size: 0,
        chunk_count: 0,
        stream_header: encryptor.header,
        upload_status: "pending",
        stream_finalized: false,
      },
      ...encrypted,
    }

    const createResult = await this.makeWorkspaceRequest.executePost<
      CreateEntityRequest<FileMetaFields>,
      EncryptedFile
    >(`entities`, createRequest)

    if (createResult.isFailed()) {
      return Result.fail(`Failed to create file: ${createResult.getErrorMessage()}`)
    }

    return Result.ok({
      file: createResult.getValue(),
      entityKey,
      encryptor,
      wrappingKey,
    })
  }
}

// ============================================================================
// File upload usecases
// ============================================================================

export class UploadFile {
  constructor(
    private readonly uploadEncryptedChunk: UploadEncryptedChunk,
    private readonly completeMultipartUpload: CompleteMultipartUpload,
    private readonly cacheStores: CacheStores,
    private readonly indexClientEntity: IndexClientEntity,
    private readonly createBaseFile: CreateBaseFile
  ) {}

  async execute(dto: {
    rawFile: File
    onProgress?: ProgressCallback
    parentEntity?: { id: string; type: EntityType }
  }): Promise<Result<DecryptedFile>> {
    const { rawFile, onProgress, parentEntity } = dto

    const baseResult = await this.createBaseFile.execute({
      name: rawFile.name,
      mimeType: rawFile.type,
      parentEntity,
    })
    if (baseResult.isFailed()) {
      return Result.fail(`Failed to create base file: ${baseResult.getError()}`)
    }
    const { file, entityKey, wrappingKey, encryptor } = baseResult.getValue()

    const chunkCount = calculateFileChunkCount(rawFile.size)
    let uploadedBytes = 0
    const wrappingKeyIdForAD = getChainRootKeyId(wrappingKey)

    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
      const chunk = await readFileChunk(rawFile, chunkIndex)
      const isLastChunk = chunkIndex === chunkCount - 1
      const partNumber = chunkIndex + 1

      try {
        await this.uploadEncryptedChunk.execute({
          fileId: file.id,
          partNumber,
          chunkIndex,
          encryptor,
          plaintextChunk: chunk,
          isFinalChunk: isLastChunk,
          wrappingKeyIdForAD,
        })
      } catch (error) {
        return Result.fail(`Failed to upload chunk ${partNumber}: ${getErrorMessage(error)}`)
      }

      uploadedBytes += chunk.length
      onProgress?.(uploadedBytes, rawFile.size)
    }

    const completeResult = await this.completeMultipartUpload.execute({
      fileId: file.id,
      streamFinalized: true,
    })
    if (completeResult.isFailed()) {
      return Result.fail(`Failed to complete upload: ${completeResult.getErrorMessage()}`)
    }

    const completedFile = completeResult.getValue()
    const fileModel = serverEntityToClientEntity({
      serverEntity: completedFile,
      entityKey,
      content: { name: rawFile.name, mimeType: rawFile.type || "application/octet-stream" },
    })

    this.cacheStores.entityStore.setCanonical(fileModel)
    this.indexClientEntity.execute(fileModel)

    return Result.ok(fileModel)
  }
}

export class UploadFileFromStream {
  constructor(
    private readonly createBaseFile: CreateBaseFile,
    private readonly uploadEncryptedChunk: UploadEncryptedChunk,
    private readonly completeMultipartUpload: CompleteMultipartUpload,
    private readonly cacheStores: CacheStores,
    private readonly indexClientEntity: IndexClientEntity
  ) {}

  async execute(dto: {
    uploadSource: UploadStreamSource
    uploadName: string
    uploadMimeType: string
    onProgress?: ProgressCallback
    parentEntity?: { id: string; type: EntityType }
  }): Promise<Result<DecryptedFile>> {
    const { uploadSource, uploadName, uploadMimeType, onProgress, parentEntity } = dto

    const baseResult = await this.createBaseFile.execute({
      name: uploadName,
      mimeType: uploadMimeType,
      parentEntity,
    })
    if (baseResult.isFailed()) {
      return Result.fail(`Failed to create base file: ${baseResult.getError()}`)
    }
    const { file, entityKey, wrappingKey, encryptor } = baseResult.getValue()

    let uploadedBytes = 0
    let partNumber = 1
    let chunkIndex = 0
    const wrappingKeyIdForAD = getChainRootKeyId(wrappingKey)

    try {
      // Use a one-chunk lookahead so we can mark the true last chunk as FINAL.
      // This avoids emitting a zero-length part, which S3 can reject for multipart uploads.
      let pendingChunk: Uint8Array | null = null

      for await (const chunk of coalesceChunksToFileChunkSize(uploadSource)) {
        if (pendingChunk) {
          await this.uploadEncryptedChunk.execute({
            fileId: file.id,
            partNumber,
            chunkIndex,
            encryptor,
            plaintextChunk: pendingChunk,
            isFinalChunk: false,
            wrappingKeyIdForAD,
          })

          uploadedBytes += pendingChunk.length
          onProgress?.(uploadedBytes, 0)

          partNumber += 1
          chunkIndex += 1
        }

        pendingChunk = chunk
      }

      if (!pendingChunk) {
        return Result.fail("Recording produced no data to upload")
      }

      await this.uploadEncryptedChunk.execute({
        fileId: file.id,
        partNumber,
        chunkIndex,
        encryptor,
        plaintextChunk: pendingChunk,
        isFinalChunk: true,
        wrappingKeyIdForAD,
      })

      uploadedBytes += pendingChunk.length
      onProgress?.(uploadedBytes, uploadedBytes)
    } catch (error) {
      return Result.fail(`Failed to upload stream: ${getErrorMessage(error)}`)
    }

    const completeResult = await this.completeMultipartUpload.execute({
      fileId: file.id,
      streamFinalized: true,
    })
    if (completeResult.isFailed()) {
      return Result.fail(`Failed to complete upload: ${completeResult.getErrorMessage()}`)
    }

    const completedFile = completeResult.getValue()
    const fileModel = serverEntityToClientEntity({
      serverEntity: completedFile,
      entityKey,
      content: { name: uploadName, mimeType: uploadMimeType || "application/octet-stream" },
    })

    this.cacheStores.entityStore.setCanonical(fileModel)
    this.indexClientEntity.execute(fileModel)

    return Result.ok(fileModel)
  }
}

// ============================================================================
// File download usecase
// ============================================================================

export interface GetDownloadURLResponse {
  download_url: string
  expires_at: string
}

/**
 * Downloads and decrypts a file.
 */
export class DownloadFile {
  constructor(
    private readonly crypto: Crypto,
    private readonly makeWorkspaceRequest: MakeWorkspaceRequest,
    private readonly decryptFileChunk: DecryptFileChunk,
    private readonly decryptEntity: DecryptEntity,
    private readonly workspaceInfoStore: WorkspaceInfoStore,
    private readonly getWrappingKey: GetWrappingKey
  ) {}

  async execute(dto: {
    fileId: string
    onProgress?: ProgressCallback
    abortSignal?: AbortSignal
  }): Promise<Result<{ file: DecryptedFile; blob: Blob }>> {
    const { fileId, onProgress, abortSignal } = dto

    const fileResult = await this.makeWorkspaceRequest.executeGet<EncryptedFile>(`entities/${fileId}`)
    if (fileResult.isFailed()) {
      return Result.fail(`Failed to get file: ${fileResult.getErrorMessage()}`)
    }
    const serverFile = fileResult.getValue()

    const wrappingKey = this.getWrappingKey.executeForExistingEntity({ entity: serverFile })
    if (!wrappingKey) {
      return Result.fail("Failed to get wrapping key for file download")
    }

    const decryptedFileResult = this.decryptEntity.execute<FileContent, FileMetaFields>({
      serverEntity: serverFile,
      wrappingKey,
    })
    if (decryptedFileResult.isFailed()) {
      return Result.fail("Failed to decrypt file metadata")
    }

    const decryptedFile = decryptedFileResult.getValue()

    const downloadResult = await this.makeWorkspaceRequest.executeGet<GetDownloadURLResponse>(
      `files/${fileId}/download`
    )
    if (downloadResult.isFailed()) {
      return Result.fail(`Failed to get download URL: ${downloadResult.getErrorMessage()}`)
    }
    const downloadResponse = downloadResult.getValue()

    let encryptedBlob: ArrayBuffer
    try {
      if (abortSignal?.aborted) {
        return Result.fail("Download aborted")
      }

      const response = await fetch(downloadResponse.download_url, { signal: abortSignal })
      if (!response.ok) {
        return Result.fail(`Failed to download file: ${response.statusText}`)
      }
      encryptedBlob = await response.arrayBuffer()
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return Result.fail("Download aborted")
      }
      return Result.fail(`Failed to download file: ${getErrorMessage(error)}`)
    }

    const ENCRYPTED_CHUNK_OVERHEAD = 17 // 16 byte auth tag + 1 byte for tag
    const encryptedChunkSize = FILE_CHUNK_SIZE + ENCRYPTED_CHUNK_OVERHEAD
    const decryptor = this.crypto.xchacha20StreamInitDecryptor(
      decryptedFile.metaFields.stream_header,
      decryptedFile.entityKey
    )

    const decryptedChunks: Uint8Array[] = []
    let offset = 0
    let decryptedBytes = 0

    for (let i = 0; i < decryptedFile.metaFields.chunk_count; i++) {
      const isLastChunk = i === decryptedFile.metaFields.chunk_count - 1
      const chunkEnd = isLastChunk ? encryptedBlob.byteLength : offset + encryptedChunkSize
      const encryptedChunk = new Uint8Array(encryptedBlob.slice(offset, chunkEnd))
      offset = chunkEnd

      const decryptedChunk = this.decryptFileChunk.execute({
        decryptor,
        encryptedChunk,
        chunkIndex: i,
        workspaceId: this.workspaceInfoStore.workspaceId,
        fileId,
        workspaceKeyId: getChainRootKeyId(wrappingKey),
      })

      if (!decryptedChunk) {
        return Result.fail(`Failed to decrypt chunk ${i}`)
      }

      decryptedChunks.push(decryptedChunk)
      decryptedBytes += decryptedChunk.length
      onProgress?.(decryptedBytes, decryptedFile.metaFields.size)
    }

    // Combine chunks into a single blob
    const totalLength = decryptedChunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const combined = new Uint8Array(totalLength)
    let pos = 0
    for (const chunk of decryptedChunks) {
      combined.set(chunk, pos)
      pos += chunk.length
    }

    const blob = new Blob([combined], { type: decryptedFile.content.mimeType })

    return Result.ok({ file: decryptedFile, blob })
  }
}
