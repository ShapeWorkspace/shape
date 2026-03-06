/**
 * V2 Unified Sync Integration Tests
 *
 * Exercises unified sync endpoints against the v2 server:
 * - /workspaces/:id/sync
 * - /workspaces/:id/sync/sequence
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { WorkspaceRuntime } from "../../workspace-runtime/workspace-runtime"
import { GlobalClient } from "../../global/global-client"
import {
  createApplicationForClient,
  createEntityThroughRuntime,
  createYjsUpdateForBlockContent,
  newClientWithWorkspace,
  waitForCondition,
} from "./helpers"
import { MakeWorkspaceRequest } from "../../usecase/network/MakeWorkspaceRequest"
import { isServerBlock } from "../../models/entity"
import type { SyncResponse } from "../../usecase/entities/entities"

const getMakeWorkspaceRequest = (runtime: WorkspaceRuntime): MakeWorkspaceRequest =>
  runtime.getMakeWorkspaceRequest()

async function fetchUnifiedSyncChanges(
  networkService: MakeWorkspaceRequest,
  since = 0,
  limit = 100
): Promise<SyncResponse> {
  const result = await networkService.executeGet<SyncResponse>(`/sync?since=${since}&limit=${limit}`)
  if (result.isFailed()) {
    throw new Error(result.getErrorMessage())
  }
  return result.getValue()
}

async function fetchLatestSequence(networkService: MakeWorkspaceRequest): Promise<number> {
  const result = await networkService.executeGet<{ sequence: number }>(`/sync/sequence`)
  if (result.isFailed()) {
    throw new Error(result.getErrorMessage())
  }
  return result.getValue().sequence
}

describe("V2 Unified Sync Integration Tests", () => {
  let client: GlobalClient
  let runtime: WorkspaceRuntime

  beforeEach(async () => {
    const result = await newClientWithWorkspace("v2-sync")
    client = result.client

    runtime = createApplicationForClient(client, result.workspace.uuid)
    await runtime.initialize()
  })

  afterEach(async () => {
    try {
      runtime.destroy()
    } catch {
      // Ignore cleanup errors
    }
  })

  describe("Basic Sync Flow", () => {
    it("should return empty changes for a fresh workspace", async () => {
      const response = await fetchUnifiedSyncChanges(getMakeWorkspaceRequest(runtime))

      expect(response.changes).toEqual([])
      expect(response.hasMore).toBe(false)
      expect(response.nextSequence).toBeGreaterThanOrEqual(0)
    })

    it("should return changes after creating entities", async () => {
      const note = await createEntityThroughRuntime(runtime, {
        entityType: "note",
        content: { title: "Sync Note", text: "Sync body" },
      })

      const response = await fetchUnifiedSyncChanges(getMakeWorkspaceRequest(runtime))
      const noteChange = response.changes.find(change => change.entityId === note.id)

      expect(noteChange).toBeDefined()
      expect(noteChange!.operation).toBe("create")
      expect(noteChange!.entity).toBeDefined()
    })

    it("should track sequence numbers correctly", async () => {
      const initialSequence = await fetchLatestSequence(getMakeWorkspaceRequest(runtime))

      await createEntityThroughRuntime(runtime, {
        entityType: "note",
        content: { title: "Sequence Note", text: "Sequence body" },
      })

      const nextSequence = await fetchLatestSequence(getMakeWorkspaceRequest(runtime))
      expect(nextSequence).toBeGreaterThan(initialSequence)

      await createEntityThroughRuntime(runtime, {
        entityType: "note",
        content: { title: "Sequence Note 2", text: "Sequence body 2" },
      })

      const laterSequence = await fetchLatestSequence(getMakeWorkspaceRequest(runtime))
      expect(laterSequence).toBeGreaterThan(nextSequence)
    })

    it("should handle pagination with hasMore flag", async () => {
      for (let i = 0; i < 5; i++) {
        await createEntityThroughRuntime(runtime, {
          entityType: "note",
          content: { title: `Paginate Note ${i}`, text: "Paginate body" },
        })
      }

      const response = await fetchUnifiedSyncChanges(getMakeWorkspaceRequest(runtime), 0, 2)

      expect(response.changes.length).toBeGreaterThan(0)
      expect(response.hasMore).toBe(true)
      expect(response.nextSequence).toBeGreaterThan(0)
    })
  })

  describe("Delete Operations", () => {
    it("should return delete operation in sync changes", async () => {
      const note = await createEntityThroughRuntime(runtime, {
        entityType: "note",
        content: { title: "Delete Note", text: "Delete body" },
      })

      const sequenceAfterCreate = await fetchLatestSequence(getMakeWorkspaceRequest(runtime))

      const deleteResult = await runtime.getDeleteEntity().execute(note.id)
      if (deleteResult.isFailed()) {
        throw new Error(deleteResult.getError())
      }

      const response = await fetchUnifiedSyncChanges(getMakeWorkspaceRequest(runtime), sequenceAfterCreate)
      const deleteChange = response.changes.find(
        change => change.entityId === note.id && change.operation === "delete"
      )

      expect(deleteChange).toBeDefined()
      expect(deleteChange!.entity).toBeNull()
    })
  })

  describe("Change Log Deduplication", () => {
    it("should return only one entry when entity is updated multiple times", async () => {
      const note = await createEntityThroughRuntime(runtime, {
        entityType: "note",
        content: { title: "Original Title", text: "Original body" },
      })

      for (let i = 1; i <= 4; i++) {
        const updateResult = await runtime.getUpdateEntity().execute({
          id: note.id,
          content: { title: `Updated Title ${i}`, text: `Updated body ${i}` },
        })
        if (updateResult.isFailed()) {
          throw new Error(updateResult.getError())
        }
      }

      const response = await fetchUnifiedSyncChanges(getMakeWorkspaceRequest(runtime), 0)
      const noteChanges = response.changes.filter(change => change.entityId === note.id)

      expect(noteChanges.length).toBe(1)
      expect(noteChanges[0]?.operation).toBe("update")
    })

    it("should return only delete when entity is updated then deleted", async () => {
      const note = await createEntityThroughRuntime(runtime, {
        entityType: "note",
        content: { title: "Update then Delete", text: "Body" },
      })

      const updateResult = await runtime.getUpdateEntity().execute({
        id: note.id,
        content: { title: "Updated Title", text: "Updated body" },
      })
      if (updateResult.isFailed()) {
        throw new Error(updateResult.getError())
      }

      const deleteResult = await runtime.getDeleteEntity().execute(note.id)
      if (deleteResult.isFailed()) {
        throw new Error(deleteResult.getError())
      }

      const response = await fetchUnifiedSyncChanges(getMakeWorkspaceRequest(runtime), 0)
      const noteChanges = response.changes.filter(change => change.entityId === note.id)

      expect(noteChanges.length).toBe(1)
      expect(noteChanges[0]?.operation).toBe("delete")
      expect(noteChanges[0]?.entity).toBeNull()
    })
  })

  describe("Block Changes", () => {
    it("should include block changes in unified sync", async () => {
      const paper = await createEntityThroughRuntime(runtime, {
        entityType: "paper",
        content: { name: "Block Paper", text: "Block Paper body" },
      })

      const draftResult = await runtime.getCreateBlockDraft().execute({
        entityId: paper.id,
        entityType: "paper",
        yjsUpdates: createYjsUpdateForBlockContent("Paper block content"),
      })
      if (draftResult.isFailed()) {
        throw new Error(draftResult.getError())
      }

      await waitForCondition(async () => {
        const blocks = await runtime.getRepositoryStore().blockRepository.getBlocksByEntity(paper.id)
        return blocks.length > 0
      }, 10000, 100)

      const response = await fetchUnifiedSyncChanges(getMakeWorkspaceRequest(runtime), 0)
      const blockChange = response.changes.find(change => change.entityType === "block")

      expect(blockChange).toBeDefined()
      expect(blockChange!.entity).toBeDefined()
      expect(isServerBlock(blockChange!.entity!)).toBe(true)
      expect((blockChange!.entity as { entity_id?: string }).entity_id).toBe(paper.id)
    })
  })
})
