/**
 * V2 Integration Tests (Entity-based server)
 *
 * Focus: file uploads/downloads using the unified entity model.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { WorkspaceRuntime } from "../../workspace-runtime/workspace-runtime"
import { GlobalClient } from "../../global/global-client"
import {
  createApplicationForClient,
  createEntityThroughRuntime,
  createTestFile,
  newClientWithWorkspace,
} from "./helpers"

describe("V2 File Upload Integration Tests", () => {
  let client: GlobalClient
  let runtime: WorkspaceRuntime
  let workspaceId: string

  beforeEach(async () => {
    const result = await newClientWithWorkspace("v2-files")
    client = result.client
    workspaceId = result.workspace.uuid

    runtime = createApplicationForClient(client, workspaceId)
    await runtime.initialize()
  })

  afterEach(async () => {
    try {
      runtime.destroy()
    } catch {
      // Ignore cleanup errors
    }
  })

  it(
    "should upload and download a file with entity meta_fields updates",
    async () => {
      const fileContent = "Hello from v2 file uploads."
      const fileName = "v2-upload.txt"
      const mimeType = "text/plain"
      const testFile = createTestFile(fileContent, fileName, mimeType)

      const uploadResult = await runtime.getUploadFile().execute({ rawFile: testFile })
      if (uploadResult.isFailed()) {
        throw new Error(uploadResult.getError())
      }

      const uploadedFile = uploadResult.getValue()
      expect(uploadedFile.id).toBeTruthy()
      expect(uploadedFile.content.name).toBe(fileName)
      expect(uploadedFile.content.mimeType).toBe(mimeType)
      expect(uploadedFile.metaFields.size).toBe(testFile.size)
      expect(uploadedFile.metaFields.chunk_count).toBeGreaterThan(0)
      expect(uploadedFile.metaFields.upload_status).toBe("complete")
      expect(uploadedFile.metaFields.stream_finalized).toBe(true)

      const downloadResult = await runtime.getDownloadFile().execute({ fileId: uploadedFile.id })
      if (downloadResult.isFailed()) {
        throw new Error(downloadResult.getError())
      }

      const { file: downloadedFile, blob } = downloadResult.getValue()
      expect(downloadedFile.id).toBe(uploadedFile.id)
      expect(downloadedFile.content.name).toBe(fileName)

      const downloadedContent = await blob.text()
      expect(downloadedContent).toBe(fileContent)
    },
    20000
  )

  it(
    "should upload a file into a folder parent",
    async () => {
      const folder = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Uploads Folder" },
      })

      const testFile = createTestFile("Folder upload", "folder-upload.txt", "text/plain")
      const uploadResult = await runtime.getUploadFile().execute({
        rawFile: testFile,
        parentEntity: { id: folder.id, type: "folder" },
      })
      if (uploadResult.isFailed()) {
        throw new Error(uploadResult.getError())
      }

      const uploadedFile = uploadResult.getValue()
      expect(uploadedFile.parentId).toBe(folder.id)
      expect(uploadedFile.parentType).toBe("folder")
    },
    20000
  )
})
