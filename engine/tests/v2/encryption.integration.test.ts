/**
 * Encryption Integration Tests (V2)
 *
 * Tests the unified entity encryption model where all entities participate in
 * hierarchical wrapping (workspace -> folder -> nested entities).
 *
 * Focus:
 * - Folder hierarchy creation and decryption
 * - File upload/download across hierarchy
 * - Chain-root validation for workspace wrapping
 * - Rewrapping entity keys when changing parents
 * - Parent/child move scenarios without breaking entity key chains
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { GlobalClient } from "../../global/global-client"
import { WorkspaceRuntime } from "../../workspace-runtime/workspace-runtime"
import {
  applyParentUpdateToEntityPayload,
  type ClientEntity,
  type ParentUpdateIntent,
  type ServerEntity,
  type UpdateEntityRequest,
} from "../../models/entity"
import { WrapEntityKey } from "../../usecase/entities/entities"
import {
  getChainRootKeyId,
  getWrappingKeyId,
  getWrappingKeyType,
  WrappingKey,
} from "../../utils/encryption-types"
import {
  createApplicationForClient,
  createEntityThroughRuntime,
  createTestFile,
  newClientWithWorkspace,
} from "./helpers"
import { MakeWorkspaceRequest } from "../../usecase/network/MakeWorkspaceRequest"

const getMakeWorkspaceRequest = (runtime: WorkspaceRuntime): MakeWorkspaceRequest =>
  runtime.getMakeWorkspaceRequest()

const requireWorkspaceKey = (runtime: WorkspaceRuntime) => {
  const currentKey = runtime.getKeyStore().getCurrentKey()
  if (!currentKey) {
    throw new Error("Workspace key was not loaded")
  }
  return currentKey
}

const createMismatchedChainRootKeyId = (client: GlobalClient, currentChainRootKeyId: string): string => {
  let candidate = client.getCrypto().generateUUID()
  while (candidate === currentChainRootKeyId) {
    candidate = client.getCrypto().generateUUID()
  }
  return candidate
}

const fetchEncryptedEntity = async (
  runtime: WorkspaceRuntime,
  entityId: string
): Promise<ServerEntity> => {
  const network = getMakeWorkspaceRequest(runtime)
  const result = await network.executeGet<ServerEntity>(`entities/${entityId}`)
  if (result.isFailed()) {
    throw new Error(result.getErrorMessage())
  }
  return result.getValue()
}

const fetchDecryptedEntity = async (
  runtime: WorkspaceRuntime,
  entityId: string
): Promise<ClientEntity> => {
  const result = await runtime.getQueryEntityById().execute(entityId)
  if (result.isFailed()) {
    throw new Error(result.getError())
  }
  return result.getValue()
}

const getEntityName = (entity: ClientEntity): string => {
  const content = entity.content
  if (!("name" in content)) {
    throw new Error("Expected entity content to include name")
  }
  const name = content.name
  if (typeof name !== "string") {
    throw new Error("Expected entity name to be a string")
  }
  return name
}

const rewrapEntityKeyForParent = async (params: {
  runtime: WorkspaceRuntime
  client: GlobalClient
  entity: ClientEntity
  newParent?: ClientEntity | null
}): Promise<ServerEntity> => {
  const { runtime, client, entity, newParent } = params

  const encryptedEntity = await fetchEncryptedEntity(runtime, entity.id)

  const wrappingKey: WrappingKey = newParent ?? requireWorkspaceKey(runtime)
  const wrapEntityKey = new WrapEntityKey(client.getCrypto())
  const wrapResult = wrapEntityKey.execute({
    entityKey: entity.entityKey,
    wrappingKey,
    entityType: entity.entityType,
    entityId: entity.id,
  })

  if (wrapResult.isFailed()) {
    throw new Error(wrapResult.getError())
  }

  const parentUpdate: ParentUpdateIntent | undefined =
    newParent === undefined
      ? undefined
      : newParent === null
        ? { mode: "clear" }
        : { mode: "set", parent: { id: newParent.id, type: newParent.entityType } }

  const updateRequest: UpdateEntityRequest = {
    chain_root_key_id: getChainRootKeyId(wrappingKey),
    wrapping_key_id: getWrappingKeyId(wrappingKey),
    wrapping_key_type: getWrappingKeyType(wrappingKey),
    entity_key_nonce: wrapResult.getValue().entityKeyNonce,
    wrapped_entity_key: wrapResult.getValue().wrappedEntityKey,
    content_nonce: encryptedEntity.content_nonce,
    content_ciphertext: encryptedEntity.content_ciphertext,
    content_hash: encryptedEntity.content_hash,
    expected_hash: encryptedEntity.content_hash,
  }
  applyParentUpdateToEntityPayload(updateRequest, parentUpdate)

  const network = getMakeWorkspaceRequest(runtime)
  const updateResult = await network.executePut<UpdateEntityRequest, ServerEntity>(
    `entities/${entity.id}`,
    updateRequest
  )

  if (updateResult.isFailed()) {
    throw new Error(updateResult.getErrorMessage())
  }

  return updateResult.getValue()
}

const createFolderHierarchy = async (runtime: WorkspaceRuntime, depth: number): Promise<ClientEntity[]> => {
  const folders: ClientEntity[] = []
  let parent: ClientEntity | undefined

  for (let i = 0; i < depth; i += 1) {
    const folder = await createEntityThroughRuntime(runtime, {
      entityType: "folder",
      content: { name: `Level ${i + 1}` },
      parent,
    })
    folders.push(folder)
    parent = folder
  }

  return folders
}

describe("Encryption Integration Tests (V2)", () => {
  let client: GlobalClient
  let runtime: WorkspaceRuntime
  let workspaceId: string

  beforeEach(async () => {
    const result = await newClientWithWorkspace("v2-encryption")
    client = result.client
    workspaceId = result.workspace.uuid

    runtime = createApplicationForClient(client, workspaceId)
    await runtime.initialize()
  })

  afterEach(async () => {
    try {
      runtime.destroy()
      if (client.getUsersStore().hasUsers()) {
        await client.getLogoutAllAccounts().execute()
      }
    } catch {
      // Ignore cleanup errors
    }
  })

  describe("Folder Creation and Decryption", () => {
    it("creates a root folder wrapped with the workspace key", async () => {
      const workspaceKey = requireWorkspaceKey(runtime)

      const folder = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Root Folder" },
      })

      expect(folder.parentId).toBeUndefined()
      expect(folder.wrappingKeyType).toBe("workspace")
      expect(folder.wrappingKeyId).toBe(workspaceKey.id)
      expect(folder.chainRootKeyId).toBe(workspaceKey.id)

      const fetched = await fetchDecryptedEntity(runtime, folder.id)
      expect(getEntityName(fetched)).toBe("Root Folder")
    })

    it("creates a subfolder wrapped with the parent folder key", async () => {
      const workspaceKey = requireWorkspaceKey(runtime)
      const parent = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Parent Folder" },
      })

      const child = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Child Folder" },
        parent,
      })

      const fetched = await fetchDecryptedEntity(runtime, child.id)
      expect(fetched.parentId).toBe(parent.id)
      expect(fetched.wrappingKeyType).toBe("folder")
      expect(fetched.wrappingKeyId).toBe(parent.id)
      expect(fetched.chainRootKeyId).toBe(workspaceKey.id)
      expect(getEntityName(fetched)).toBe("Child Folder")
    })

    it("creates deeply nested folders and decrypts them", async () => {
      const folders = await createFolderHierarchy(runtime, 5)

      expect(folders).toHaveLength(5)

      for (let i = 0; i < folders.length; i += 1) {
        const fetched = await fetchDecryptedEntity(runtime, folders[i].id)
        expect(getEntityName(fetched)).toBe(`Level ${i + 1}`)
      }
    })
  })

  describe("File Upload/Download Across Hierarchy", () => {
    it("uploads a file at the root wrapped with the workspace key", async () => {
      const workspaceKey = requireWorkspaceKey(runtime)
      const testFile = createTestFile("Root content", "root-file.txt", "text/plain")

      const uploadResult = await runtime.getUploadFile().execute({ rawFile: testFile })
      if (uploadResult.isFailed()) {
        throw new Error(uploadResult.getError())
      }

      const file = uploadResult.getValue()
      expect(file.parentId).toBeUndefined()
      expect(file.wrappingKeyType).toBe("workspace")
      expect(file.wrappingKeyId).toBe(workspaceKey.id)
      expect(file.chainRootKeyId).toBe(workspaceKey.id)
    })

    it("uploads a file into a folder wrapped with the folder key", async () => {
      const folder = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Files Folder" },
      })

      const testFile = createTestFile("Nested content", "nested-file.txt", "text/plain")
      const uploadResult = await runtime.getUploadFile().execute({
        rawFile: testFile,
        parentEntity: { id: folder.id, type: "folder" },
      })
      if (uploadResult.isFailed()) {
        throw new Error(uploadResult.getError())
      }

      const file = uploadResult.getValue()
      expect(file.parentId).toBe(folder.id)
      expect(file.wrappingKeyType).toBe("folder")
      expect(file.wrappingKeyId).toBe(folder.id)
    })

    it("uploads a file into a deeply nested folder", async () => {
      const folders = await createFolderHierarchy(runtime, 3)
      const deepestFolder = folders[folders.length - 1]

      const testFile = createTestFile("Deep content", "deep-file.txt", "text/plain")
      const uploadResult = await runtime.getUploadFile().execute({
        rawFile: testFile,
        parentEntity: { id: deepestFolder.id, type: "folder" },
      })
      if (uploadResult.isFailed()) {
        throw new Error(uploadResult.getError())
      }

      const file = uploadResult.getValue()
      expect(file.parentId).toBe(deepestFolder.id)
    })

    it("downloads a root-level file", async () => {
      const testContent = "Downloadable root content"
      const testFile = createTestFile(testContent, "download-root.txt", "text/plain")

      const uploadResult = await runtime.getUploadFile().execute({ rawFile: testFile })
      if (uploadResult.isFailed()) {
        throw new Error(uploadResult.getError())
      }
      const file = uploadResult.getValue()

      const downloadResult = await runtime.getDownloadFile().execute({ fileId: file.id })
      if (downloadResult.isFailed()) {
        throw new Error(downloadResult.getError())
      }

      const downloadedContent = await downloadResult.getValue().blob.text()
      expect(downloadedContent).toBe(testContent)
    })

    it("downloads a file from a subfolder", async () => {
      const folder = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Download Folder" },
      })

      const testContent = "Downloadable nested content"
      const testFile = createTestFile(testContent, "download-nested.txt", "text/plain")
      const uploadResult = await runtime.getUploadFile().execute({
        rawFile: testFile,
        parentEntity: { id: folder.id, type: "folder" },
      })
      if (uploadResult.isFailed()) {
        throw new Error(uploadResult.getError())
      }
      const file = uploadResult.getValue()

      const downloadResult = await runtime.getDownloadFile().execute({ fileId: file.id })
      if (downloadResult.isFailed()) {
        throw new Error(downloadResult.getError())
      }

      const downloadedContent = await downloadResult.getValue().blob.text()
      expect(downloadedContent).toBe(testContent)
    })

    it("downloads a file from a deeply nested folder", async () => {
      const folders = await createFolderHierarchy(runtime, 4)
      const deepestFolder = folders[folders.length - 1]

      const testContent = "Deep nested downloadable content"
      const testFile = createTestFile(testContent, "deep-download.txt", "text/plain")
      const uploadResult = await runtime.getUploadFile().execute({
        rawFile: testFile,
        parentEntity: { id: deepestFolder.id, type: "folder" },
      })
      if (uploadResult.isFailed()) {
        throw new Error(uploadResult.getError())
      }
      const file = uploadResult.getValue()

      const downloadResult = await runtime.getDownloadFile().execute({ fileId: file.id })
      if (downloadResult.isFailed()) {
        throw new Error(downloadResult.getError())
      }

      const downloadedContent = await downloadResult.getValue().blob.text()
      expect(downloadedContent).toBe(testContent)
    })

    it("preserves file content integrity after encrypt/decrypt", async () => {
      const folders = await createFolderHierarchy(runtime, 2)
      const folder = folders[1]

      const originalContent = "Integrity check with ASCII content"
      const testFile = createTestFile(originalContent, "integrity.txt", "text/plain")
      const uploadResult = await runtime.getUploadFile().execute({
        rawFile: testFile,
        parentEntity: { id: folder.id, type: "folder" },
      })
      if (uploadResult.isFailed()) {
        throw new Error(uploadResult.getError())
      }
      const file = uploadResult.getValue()

      const downloadResult = await runtime.getDownloadFile().execute({ fileId: file.id })
      if (downloadResult.isFailed()) {
        throw new Error(downloadResult.getError())
      }

      const downloadedContent = await downloadResult.getValue().blob.text()
      expect(downloadedContent).toBe(originalContent)
    })
  })

  describe("Chain Root Validation", () => {
    it("rejects folder updates with mismatched chain root metadata", async () => {
      const folder = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Chain Root Folder" },
      })

      const encryptedFolder = await fetchEncryptedEntity(runtime, folder.id)
      const mismatchedChainRootKeyId = createMismatchedChainRootKeyId(
        client,
        encryptedFolder.chain_root_key_id
      )

      const updateRequest: UpdateEntityRequest = {
        chain_root_key_id: mismatchedChainRootKeyId,
        wrapping_key_id: encryptedFolder.wrapping_key_id,
        wrapping_key_type: encryptedFolder.wrapping_key_type,
        entity_key_nonce: encryptedFolder.entity_key_nonce,
        wrapped_entity_key: encryptedFolder.wrapped_entity_key,
        content_nonce: encryptedFolder.content_nonce,
        content_ciphertext: encryptedFolder.content_ciphertext,
        content_hash: encryptedFolder.content_hash,
        expected_hash: encryptedFolder.content_hash,
        parent_id: encryptedFolder.parent_id,
        parent_type: encryptedFolder.parent_type,
      }

      const network = getMakeWorkspaceRequest(runtime)
      const updateResult = await network.executePut<UpdateEntityRequest, ServerEntity>(
        `entities/${folder.id}`,
        updateRequest
      )

      expect(updateResult.isFailed()).toBe(true)
      expect(updateResult.getErrorMessage()).toContain(
        "wrapping_key_id must match chain_root_key_id for workspace wrapping"
      )
    })

    it("rejects file updates with mismatched chain root metadata", async () => {
      const testFile = createTestFile("chain root mismatch", "chain-root.txt", "text/plain")
      const uploadResult = await runtime.getUploadFile().execute({ rawFile: testFile })
      if (uploadResult.isFailed()) {
        throw new Error(uploadResult.getError())
      }
      const file = uploadResult.getValue()

      const encryptedFile = await fetchEncryptedEntity(runtime, file.id)
      const mismatchedChainRootKeyId = createMismatchedChainRootKeyId(
        client,
        encryptedFile.chain_root_key_id
      )

      const updateRequest: UpdateEntityRequest = {
        chain_root_key_id: mismatchedChainRootKeyId,
        wrapping_key_id: encryptedFile.wrapping_key_id,
        wrapping_key_type: encryptedFile.wrapping_key_type,
        entity_key_nonce: encryptedFile.entity_key_nonce,
        wrapped_entity_key: encryptedFile.wrapped_entity_key,
        content_nonce: encryptedFile.content_nonce,
        content_ciphertext: encryptedFile.content_ciphertext,
        content_hash: encryptedFile.content_hash,
        expected_hash: encryptedFile.content_hash,
        parent_id: encryptedFile.parent_id,
        parent_type: encryptedFile.parent_type,
      }

      const network = getMakeWorkspaceRequest(runtime)
      const updateResult = await network.executePut<UpdateEntityRequest, ServerEntity>(
        `entities/${file.id}`,
        updateRequest
      )

      expect(updateResult.isFailed()).toBe(true)
      expect(updateResult.getErrorMessage()).toContain(
        "wrapping_key_id must match chain_root_key_id for workspace wrapping"
      )
    })
  })

  describe("Paper Creation with Hierarchical Wrapping", () => {
    it("creates a paper at the root", async () => {
      const paper = await createEntityThroughRuntime(runtime, {
        entityType: "paper",
        content: { name: "Root Paper" },
      })

      expect(paper.parentId).toBeUndefined()
      expect(getEntityName(paper)).toBe("Root Paper")
    })

    it("creates a paper inside a folder", async () => {
      const folder = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Papers Folder" },
      })

      const paper = await createEntityThroughRuntime(runtime, {
        entityType: "paper",
        content: { name: "Folder Paper" },
        parent: folder,
      })

      const fetched = await fetchDecryptedEntity(runtime, paper.id)
      expect(fetched.parentId).toBe(folder.id)
    })

    it("creates a paper in a deeply nested folder", async () => {
      const folders = await createFolderHierarchy(runtime, 3)
      const deepestFolder = folders[folders.length - 1]

      const paper = await createEntityThroughRuntime(runtime, {
        entityType: "paper",
        content: { name: "Deep Paper" },
        parent: deepestFolder,
      })

      const fetched = await fetchDecryptedEntity(runtime, paper.id)
      expect(fetched.parentId).toBe(deepestFolder.id)
    })
  })

  describe("Move Within Same Chain (up/down)", () => {
    it("moves a file from subfolder to root and keeps content readable", async () => {
      const folder = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Source Folder" },
      })

      const testFile = createTestFile("Move to root content", "move-to-root.txt", "text/plain")
      const uploadResult = await runtime.getUploadFile().execute({
        rawFile: testFile,
        parentEntity: { id: folder.id, type: "folder" },
      })
      if (uploadResult.isFailed()) {
        throw new Error(uploadResult.getError())
      }
      const file = uploadResult.getValue()

      await rewrapEntityKeyForParent({ runtime, client, entity: file, newParent: null })

      const updated = await fetchDecryptedEntity(runtime, file.id)
      expect(updated.parentId).toBeUndefined()
      expect(updated.wrappingKeyType).toBe("workspace")

      const downloadResult = await runtime.getDownloadFile().execute({ fileId: file.id })
      if (downloadResult.isFailed()) {
        throw new Error(downloadResult.getError())
      }
      const content = await downloadResult.getValue().blob.text()
      expect(content).toBe("Move to root content")
    })

    it("moves a file from root to subfolder and keeps content readable", async () => {
      const folder = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Destination Folder" },
      })

      const testFile = createTestFile("Move to folder content", "move-to-folder.txt", "text/plain")
      const uploadResult = await runtime.getUploadFile().execute({ rawFile: testFile })
      if (uploadResult.isFailed()) {
        throw new Error(uploadResult.getError())
      }
      const file = uploadResult.getValue()

      await rewrapEntityKeyForParent({ runtime, client, entity: file, newParent: folder })

      const updated = await fetchDecryptedEntity(runtime, file.id)
      expect(updated.parentId).toBe(folder.id)
      expect(updated.wrappingKeyType).toBe("folder")

      const downloadResult = await runtime.getDownloadFile().execute({ fileId: file.id })
      if (downloadResult.isFailed()) {
        throw new Error(downloadResult.getError())
      }
      const content = await downloadResult.getValue().blob.text()
      expect(content).toBe("Move to folder content")
    })

    it("moves a file from deep nested to a parent folder", async () => {
      const folders = await createFolderHierarchy(runtime, 3)

      const testFile = createTestFile("Move up content", "move-up.txt", "text/plain")
      const uploadResult = await runtime.getUploadFile().execute({
        rawFile: testFile,
        parentEntity: { id: folders[2].id, type: "folder" },
      })
      if (uploadResult.isFailed()) {
        throw new Error(uploadResult.getError())
      }
      const file = uploadResult.getValue()

      await rewrapEntityKeyForParent({ runtime, client, entity: file, newParent: folders[0] })

      const updated = await fetchDecryptedEntity(runtime, file.id)
      expect(updated.parentId).toBe(folders[0].id)

      const downloadResult = await runtime.getDownloadFile().execute({ fileId: file.id })
      if (downloadResult.isFailed()) {
        throw new Error(downloadResult.getError())
      }
    })

    it("moves a file from parent to deep nested folder", async () => {
      const folders = await createFolderHierarchy(runtime, 3)

      const testFile = createTestFile("Move down content", "move-down.txt", "text/plain")
      const uploadResult = await runtime.getUploadFile().execute({
        rawFile: testFile,
        parentEntity: { id: folders[0].id, type: "folder" },
      })
      if (uploadResult.isFailed()) {
        throw new Error(uploadResult.getError())
      }
      const file = uploadResult.getValue()

      await rewrapEntityKeyForParent({ runtime, client, entity: file, newParent: folders[2] })

      const updated = await fetchDecryptedEntity(runtime, file.id)
      expect(updated.parentId).toBe(folders[2].id)

      const downloadResult = await runtime.getDownloadFile().execute({ fileId: file.id })
      if (downloadResult.isFailed()) {
        throw new Error(downloadResult.getError())
      }
    })

    it("moves a folder from subfolder to root", async () => {
      const parent = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Parent" },
      })

      const child = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Child to Move" },
        parent,
      })

      await rewrapEntityKeyForParent({ runtime, client, entity: child, newParent: null })

      const updated = await fetchDecryptedEntity(runtime, child.id)
      expect(updated.parentId).toBeUndefined()
      expect(getEntityName(updated)).toBe("Child to Move")
    })

    it("moves a folder from root to subfolder", async () => {
      const folderToMove = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Folder to Move" },
      })

      const destination = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Destination Parent" },
      })

      await rewrapEntityKeyForParent({ runtime, client, entity: folderToMove, newParent: destination })

      const updated = await fetchDecryptedEntity(runtime, folderToMove.id)
      expect(updated.parentId).toBe(destination.id)
      expect(getEntityName(updated)).toBe("Folder to Move")
    })
  })

  describe("Move Across Different Chains", () => {
    it("moves a file from folder A to folder B", async () => {
      const chainA = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Chain A" },
      })
      const chainB = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Chain B" },
      })

      const testFile = createTestFile("Cross chain content", "cross-chain.txt", "text/plain")
      const uploadResult = await runtime.getUploadFile().execute({
        rawFile: testFile,
        parentEntity: { id: chainA.id, type: "folder" },
      })
      if (uploadResult.isFailed()) {
        throw new Error(uploadResult.getError())
      }
      const file = uploadResult.getValue()

      await rewrapEntityKeyForParent({ runtime, client, entity: file, newParent: chainB })

      const updated = await fetchDecryptedEntity(runtime, file.id)
      expect(updated.parentId).toBe(chainB.id)

      const downloadResult = await runtime.getDownloadFile().execute({ fileId: file.id })
      if (downloadResult.isFailed()) {
        throw new Error(downloadResult.getError())
      }
      const content = await downloadResult.getValue().blob.text()
      expect(content).toBe("Cross chain content")
    })

    it("moves a file from deep chain A to deep chain B", async () => {
      const chainAFolders = await createFolderHierarchy(runtime, 3)
      const chainBRoot = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Chain B Root" },
      })
      const chainBSub = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Chain B Sub" },
        parent: chainBRoot,
      })

      const testFile = createTestFile("Deep cross chain content", "deep-cross.txt", "text/plain")
      const uploadResult = await runtime.getUploadFile().execute({
        rawFile: testFile,
        parentEntity: { id: chainAFolders[2].id, type: "folder" },
      })
      if (uploadResult.isFailed()) {
        throw new Error(uploadResult.getError())
      }
      const file = uploadResult.getValue()

      await rewrapEntityKeyForParent({ runtime, client, entity: file, newParent: chainBSub })

      const downloadResult = await runtime.getDownloadFile().execute({ fileId: file.id })
      if (downloadResult.isFailed()) {
        throw new Error(downloadResult.getError())
      }
    })

    it("moves a folder from chain A to chain B", async () => {
      const chainA = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Chain A" },
      })
      const chainB = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Chain B" },
      })

      const subfolder = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Subfolder to Move" },
        parent: chainA,
      })

      await rewrapEntityKeyForParent({ runtime, client, entity: subfolder, newParent: chainB })

      const updated = await fetchDecryptedEntity(runtime, subfolder.id)
      expect(updated.parentId).toBe(chainB.id)
    })
  })

  describe("Folder with Children Move Tests", () => {
    it("moves a folder containing files and keeps files accessible", async () => {
      const folder = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Folder with Files" },
      })

      const file1 = createTestFile("File 1 content", "file1.txt", "text/plain")
      const file2 = createTestFile("File 2 content", "file2.txt", "text/plain")

      const upload1 = await runtime.getUploadFile().execute({
        rawFile: file1,
        parentEntity: { id: folder.id, type: "folder" },
      })
      const upload2 = await runtime.getUploadFile().execute({
        rawFile: file2,
        parentEntity: { id: folder.id, type: "folder" },
      })

      if (upload1.isFailed() || upload2.isFailed()) {
        throw new Error("Failed to upload files for folder move test")
      }

      const destination = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Destination" },
      })

      await rewrapEntityKeyForParent({ runtime, client, entity: folder, newParent: destination })

      const download1 = await runtime.getDownloadFile().execute({ fileId: upload1.getValue().id })
      const download2 = await runtime.getDownloadFile().execute({ fileId: upload2.getValue().id })

      if (download1.isFailed() || download2.isFailed()) {
        throw new Error("Expected files to remain accessible after folder move")
      }
    })

    it("moves a folder containing subfolders and keeps them accessible", async () => {
      const parent = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Parent with Subfolders" },
      })

      const sub1 = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Subfolder 1" },
        parent,
      })
      const sub2 = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Subfolder 2" },
        parent,
      })

      const destination = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "New Parent" },
      })

      await rewrapEntityKeyForParent({ runtime, client, entity: parent, newParent: destination })

      const fetchedSub1 = await fetchDecryptedEntity(runtime, sub1.id)
      const fetchedSub2 = await fetchDecryptedEntity(runtime, sub2.id)
      expect(getEntityName(fetchedSub1)).toBe("Subfolder 1")
      expect(getEntityName(fetchedSub2)).toBe("Subfolder 2")
    })

    it("moves a folder with nested structure and keeps all files accessible", async () => {
      const parent = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Complex Parent" },
      })

      const child = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Complex Child" },
        parent,
      })

      const grandchild = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Complex Grandchild" },
        parent: child,
      })

      const parentFile = await runtime.getUploadFile().execute({
        rawFile: createTestFile("Parent content", "parent-file.txt", "text/plain"),
        parentEntity: { id: parent.id, type: "folder" },
      })
      const childFile = await runtime.getUploadFile().execute({
        rawFile: createTestFile("Child content", "child-file.txt", "text/plain"),
        parentEntity: { id: child.id, type: "folder" },
      })
      const grandchildFile = await runtime.getUploadFile().execute({
        rawFile: createTestFile("Grandchild content", "grandchild-file.txt", "text/plain"),
        parentEntity: { id: grandchild.id, type: "folder" },
      })

      if (parentFile.isFailed() || childFile.isFailed() || grandchildFile.isFailed()) {
        throw new Error("Failed to upload files for nested folder move test")
      }

      const destination = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Complex Destination" },
      })

      await rewrapEntityKeyForParent({ runtime, client, entity: parent, newParent: destination })

      expect(getEntityName(await fetchDecryptedEntity(runtime, parent.id))).toBe("Complex Parent")
      expect(getEntityName(await fetchDecryptedEntity(runtime, child.id))).toBe("Complex Child")
      expect(getEntityName(await fetchDecryptedEntity(runtime, grandchild.id))).toBe(
        "Complex Grandchild"
      )

      expect((await runtime.getDownloadFile().execute({ fileId: parentFile.getValue().id })).isFailed()).toBe(
        false
      )
      expect((await runtime.getDownloadFile().execute({ fileId: childFile.getValue().id })).isFailed()).toBe(
        false
      )
      expect(
        (await runtime.getDownloadFile().execute({ fileId: grandchildFile.getValue().id })).isFailed()
      ).toBe(false)
    })
  })

  describe("Edge Cases", () => {
    it("handles move file to same folder (no-op)", async () => {
      const folder = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Same Folder" },
      })

      const testFile = createTestFile("No-op content", "no-op.txt", "text/plain")
      const uploadResult = await runtime.getUploadFile().execute({
        rawFile: testFile,
        parentEntity: { id: folder.id, type: "folder" },
      })
      if (uploadResult.isFailed()) {
        throw new Error(uploadResult.getError())
      }
      const file = uploadResult.getValue()

      await rewrapEntityKeyForParent({ runtime, client, entity: file, newParent: folder })

      const updated = await fetchDecryptedEntity(runtime, file.id)
      expect(updated.parentId).toBe(folder.id)

      const downloadResult = await runtime.getDownloadFile().execute({ fileId: file.id })
      expect(downloadResult.isFailed()).toBe(false)
    })

    it("handles move folder to same parent (no-op)", async () => {
      const parent = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Same Parent" },
      })

      const child = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Same Child" },
        parent,
      })

      await rewrapEntityKeyForParent({ runtime, client, entity: child, newParent: parent })

      const updated = await fetchDecryptedEntity(runtime, child.id)
      expect(updated.parentId).toBe(parent.id)
    })

    it("handles multiple moves of the same entity in sequence", async () => {
      const folder1 = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Folder 1" },
      })
      const folder2 = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Folder 2" },
      })
      const folder3 = await createEntityThroughRuntime(runtime, {
        entityType: "folder",
        content: { name: "Folder 3" },
      })

      const testFile = createTestFile("Multi move content", "multi-move.txt", "text/plain")
      const uploadResult = await runtime.getUploadFile().execute({
        rawFile: testFile,
        parentEntity: { id: folder1.id, type: "folder" },
      })
      if (uploadResult.isFailed()) {
        throw new Error(uploadResult.getError())
      }
      const file = uploadResult.getValue()

      await rewrapEntityKeyForParent({ runtime, client, entity: file, newParent: folder2 })
      await rewrapEntityKeyForParent({ runtime, client, entity: file, newParent: folder3 })
      await rewrapEntityKeyForParent({ runtime, client, entity: file, newParent: null })
      await rewrapEntityKeyForParent({ runtime, client, entity: file, newParent: folder1 })

      const updated = await fetchDecryptedEntity(runtime, file.id)
      expect(updated.parentId).toBe(folder1.id)

      const downloadResult = await runtime.getDownloadFile().execute({ fileId: file.id })
      if (downloadResult.isFailed()) {
        throw new Error(downloadResult.getError())
      }
      const content = await downloadResult.getValue().blob.text()
      expect(content).toBe("Multi move content")
    })
  })

  describe("Cache Behavior", () => {
    it("reuses cached wrapping keys for nested folders", async () => {
      const folders = await createFolderHierarchy(runtime, 3)
      const deepest = folders[2]

      const getWrappingKey = runtime.getGetWrappingKey()
      const first = getWrappingKey.executeForExistingEntity({
        entity: { wrapping_key_type: deepest.wrappingKeyType, wrapping_key_id: deepest.wrappingKeyId },
      })
      const second = getWrappingKey.executeForExistingEntity({
        entity: { wrapping_key_type: deepest.wrappingKeyType, wrapping_key_id: deepest.wrappingKeyId },
      })

      expect(first).toBeTruthy()
      expect(second).toBeTruthy()
      expect(first?.id).toBe(second?.id)
    })
  })

  describe("Performance/Stress", () => {
    it("handles a 10-level folder hierarchy", async () => {
      const folders = await createFolderHierarchy(runtime, 10)
      expect(folders).toHaveLength(10)

      const deepest = folders[folders.length - 1]
      const fetched = await fetchDecryptedEntity(runtime, deepest.id)
      expect(getEntityName(fetched)).toBe("Level 10")
    })

    it("uploads multiple files to a deeply nested folder", async () => {
      const folders = await createFolderHierarchy(runtime, 5)
      const deepFolder = folders[folders.length - 1]

      const files: ClientEntity[] = []
      for (let i = 0; i < 5; i += 1) {
        const testFile = createTestFile(`Content ${i}`, `bulk-file-${i}.txt`, "text/plain")
        const uploadResult = await runtime.getUploadFile().execute({
          rawFile: testFile,
          parentEntity: { id: deepFolder.id, type: "folder" },
        })
        if (uploadResult.isFailed()) {
          throw new Error(uploadResult.getError())
        }
        files.push(uploadResult.getValue())
      }

      for (const file of files) {
        const downloadResult = await runtime.getDownloadFile().execute({ fileId: file.id })
        expect(downloadResult.isFailed()).toBe(false)
      }
    })
  })
})
