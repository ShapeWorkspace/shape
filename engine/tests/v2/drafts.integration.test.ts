/**
 * V2 Drafts Integration Tests
 *
 * Validates entity-based draft behavior for offline creation, updates,
 * deletes, block drafts, sync outcomes, and search indexing.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import type { GlobalClient } from "../../global/global-client"
import type { ClientEntity } from "../../models/entity"
import { WorkspaceRuntime } from "../../workspace-runtime/workspace-runtime"
import { ApiResult } from "../../utils/ApiResult"
import { InMemorySearchIndex } from "../helpers/in-memory-search-index"
import { SearchStore } from "../../store/search-store"
import { MakeWorkspaceRequest } from "../../usecase/network/MakeWorkspaceRequest"
import type { HttpRequestOptions } from "../../services/http-client"
import {
  createApplicationForClient,
  createEntityThroughRuntime,
  createYjsUpdateForBlockContent,
  newClientWithWorkspace,
  waitForCondition,
} from "./helpers"

const buildTestEntityContent = (title: string, text: string) => ({
  title,
  text,
})

const buildTestEntityNameContent = (name: string) => ({
  name,
})

const buildHexString = (seed: string): string => seed.repeat(8)

const buildSimulatedFailure = <T>() =>
  ApiResult.fail<T>({
    status: 500,
    message: "Simulated failure",
  })

const buildSimulatedConflictHash = () => buildHexString("deadbeef")

const buildBlockDraftUpdate = (label: string) => createYjsUpdateForBlockContent(`${label} block content`)

const buildDraftSyncError = (draftId: string) => `Draft ${draftId} sync failed`

const buildRemoteEntityNotFoundError = (entityId: string) => `Entity ${entityId} missing on server`

const buildTestWorkspaceName = (label: string) => `drafts-${label}`

const getCachedDraftByEntityId = (
  runtime: WorkspaceRuntime,
  entityId: string
) => runtime.getCacheStores().draftCache.get(entityId)

const getDraftBlocksByEntityId = (runtime: WorkspaceRuntime, entityId: string) =>
  runtime.getCacheStores().draftBlockCache.get(entityId) ?? []

const getServerBlocksByEntityId = async (
  runtime: WorkspaceRuntime,
  entityId: string
) => runtime.getRepositoryStore().blockRepository.getBlocksByEntity(entityId)

const getEntityFromCache = (runtime: WorkspaceRuntime, entityId: string) =>
  runtime.getCacheStores().entityStore.get(entityId)

const getMakeWorkspaceRequest = (runtime: WorkspaceRuntime): MakeWorkspaceRequest =>
  runtime.getMakeWorkspaceRequest()

const setBrowserOnlineState = (isOnline: boolean): (() => void) => {
  const hadNavigator = typeof navigator !== "undefined"
  const existingNavigator = hadNavigator ? navigator : undefined
  const previousOnlineState = existingNavigator?.onLine

  if (!hadNavigator) {
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: isOnline },
      configurable: true,
    })
  } else if (existingNavigator) {
    Object.defineProperty(existingNavigator, "onLine", {
      value: isOnline,
      configurable: true,
    })
  }

  return () => {
    if (!hadNavigator) {
      Reflect.deleteProperty(globalThis, "navigator")
      return
    }

    if (existingNavigator) {
      Object.defineProperty(existingNavigator, "onLine", {
        value: previousOnlineState,
        configurable: true,
      })
    }

    Object.defineProperty(globalThis, "navigator", {
      value: existingNavigator,
      configurable: true,
    })
  }
}

const buildSimulatedFailureExecutePost = <P, R>() =>
  async (
    _url: string,
    _data: P,
    _options?: HttpRequestOptions
  ): Promise<ApiResult<R>> => buildSimulatedFailure<R>()

const ensureRuntimeInitialized = async (runtime: WorkspaceRuntime) => {
  await runtime.initialize()
}

const destroyWorkspaceRuntimeAndLogoutUsers = async (
  runtime: WorkspaceRuntime,
  client: GlobalClient
): Promise<void> => {
  runtime.destroy()
  if (client.getUsersStore().hasUsers()) {
    await client.getLogoutAllAccounts().execute()
  }
}

const createInitializedRuntimeForWorkspace = async (label: string) => {
  const result = await newClientWithWorkspace(buildTestWorkspaceName(label))
  const runtime = createApplicationForClient(result.client, result.workspace.uuid)
  await ensureRuntimeInitialized(runtime)
  return {
    client: result.client,
    runtime,
    workspaceId: result.workspace.uuid,
  }
}

describe("V2 Draft Entity Integration Tests", () => {
  let primaryClient: GlobalClient
  let primaryRuntime: WorkspaceRuntime

  beforeEach(async () => {
    const result = await createInitializedRuntimeForWorkspace("entity")
    primaryClient = result.client
    primaryRuntime = result.runtime
  })

  afterEach(async () => {
    try {
      await destroyWorkspaceRuntimeAndLogoutUsers(primaryRuntime, primaryClient)
    } catch {
      // Ignore cleanup errors.
    }
  })

  it("keeps draft entity for offline create without save errors", async () => {
    const restoreNavigator = setBrowserOnlineState(false)

    try {
      // Create entity while offline to force a draft create.
      const createdNote = await createEntityThroughRuntime(primaryRuntime, {
        entityType: "note",
        content: buildTestEntityContent("Offline Draft Note", "Draft content"),
      })

      const storedDraft = getCachedDraftByEntityId(primaryRuntime, createdNote.id)

      expect(storedDraft).toBeTruthy()
      expect(storedDraft?.formedOnHash).toBeUndefined()
      expect(storedDraft?.saveAttempts).toBe(0)
      expect(storedDraft?.saveError).toBeUndefined()
    } finally {
      restoreNavigator()
    }
  })

  it("syncs offline draft create and block drafts after reconnect", async () => {
    const restoreNavigator = setBrowserOnlineState(false)

    let createdPaperId = ""

    try {
      // Create paper entity offline to create a draft.
      const createdPaper = await createEntityThroughRuntime(primaryRuntime, {
        entityType: "paper",
        content: buildTestEntityNameContent("Offline Draft Paper"),
      })
      createdPaperId = createdPaper.id

      // Create a block draft while offline so it queues for sync.
      const blockDraftResult = await primaryRuntime.getCreateBlockDraft().execute({
        entityId: createdPaperId,
        entityType: "paper",
        yjsUpdates: buildBlockDraftUpdate("Offline Paper"),
      })
      expect(blockDraftResult.isFailed()).toBe(false)

      const storedDraft = getCachedDraftByEntityId(primaryRuntime, createdPaperId)
      expect(storedDraft).toBeTruthy()

      const storedDraftBlocks = getDraftBlocksByEntityId(primaryRuntime, createdPaperId)
      expect(storedDraftBlocks.length).toBe(1)
    } finally {
      restoreNavigator()
    }

    const restoreOnlineNavigator = setBrowserOnlineState(true)

    try {
      // Sync all drafts now that we are online.
      const syncResult = await primaryRuntime.getSyncAllDrafts().execute()
      if (syncResult.isFailed()) {
        throw new Error(buildDraftSyncError(createdPaperId))
      }

      await waitForCondition(() => {
        return getCachedDraftByEntityId(primaryRuntime, createdPaperId) === undefined
      })

      const draftBlocks = getDraftBlocksByEntityId(primaryRuntime, createdPaperId)
      expect(draftBlocks.length).toBe(0)

      const serverBlocks = await getServerBlocksByEntityId(primaryRuntime, createdPaperId)
      expect(serverBlocks.length).toBeGreaterThan(0)

      const fetchResult = await primaryRuntime.getQueryEntityById().execute(createdPaperId)
      expect(fetchResult.isFailed()).toBe(false)
    } finally {
      restoreOnlineNavigator()
    }
  })

  it("preserves formedOnHash across multiple offline updates", async () => {
    const createdNote = await createEntityThroughRuntime(primaryRuntime, {
      entityType: "note",
      content: buildTestEntityContent("Original Title", "Original text"),
    })

    const restoreNavigator = setBrowserOnlineState(false)

    try {
      // First offline update.
      const updateResultOne = await primaryRuntime.getUpdateEntity().execute({
        id: createdNote.id,
        content: buildTestEntityContent("First Offline Update", "Original text"),
      })
      expect(updateResultOne.isFailed()).toBe(false)

      const draftAfterFirstUpdate = getCachedDraftByEntityId(primaryRuntime, createdNote.id)
      expect(draftAfterFirstUpdate).toBeTruthy()
      expect(draftAfterFirstUpdate?.formedOnHash).toBe(createdNote.contentHash)

      // Second offline update should keep the same formedOnHash.
      const updateResultTwo = await primaryRuntime.getUpdateEntity().execute({
        id: createdNote.id,
        content: buildTestEntityContent("Second Offline Update", "Original text"),
      })
      expect(updateResultTwo.isFailed()).toBe(false)

      const draftAfterSecondUpdate = getCachedDraftByEntityId(primaryRuntime, createdNote.id)
      expect(draftAfterSecondUpdate).toBeTruthy()
      expect(draftAfterSecondUpdate?.formedOnHash).toBe(createdNote.contentHash)
    } finally {
      restoreNavigator()
    }
  })

  it("marks delete drafts while preserving encrypted payload", async () => {
    const createdNote = await createEntityThroughRuntime(primaryRuntime, {
      entityType: "note",
      content: buildTestEntityContent("Delete Draft Note", "Delete draft text"),
    })

    const restoreNavigator = setBrowserOnlineState(false)

    try {
      const deleteResult = await primaryRuntime.getDeleteEntity().execute(createdNote.id)
      expect(deleteResult.isFailed()).toBe(false)

      const deleteDraft = getCachedDraftByEntityId(primaryRuntime, createdNote.id)
      expect(deleteDraft).toBeTruthy()
      expect(deleteDraft?.deleteEntity).toBe(true)
      expect(deleteDraft?.entity.content_hash).toBeTruthy()

      // Delete flow should also remove the entity from the local cache.
      expect(getEntityFromCache(primaryRuntime, createdNote.id)).toBeUndefined()
    } finally {
      restoreNavigator()
    }
  })

  it("skips draft sync attempts while offline", async () => {
    const createdNote = await createEntityThroughRuntime(primaryRuntime, {
      entityType: "note",
      content: buildTestEntityContent("Offline Skip Note", "Draft skip content"),
    })

    const restoreNavigator = setBrowserOnlineState(false)

    try {
      const updateResult = await primaryRuntime.getUpdateEntity().execute({
        id: createdNote.id,
        content: buildTestEntityContent("Offline Skip Update", "Draft skip content"),
      })
      expect(updateResult.isFailed()).toBe(false)

      const syncDraft = primaryRuntime.getSyncDraft()
      const syncResult = await syncDraft.execute(createdNote.id)

      expect(syncResult.isFailed()).toBe(true)
      expect(syncResult.getError()).toBe("Workspace is offline")

      const draftAfterAttempt = getCachedDraftByEntityId(primaryRuntime, createdNote.id)
      expect(draftAfterAttempt?.saveAttempts).toBe(0)
      expect(draftAfterAttempt?.lastAttemptedSave).toBeUndefined()
    } finally {
      restoreNavigator()
    }
  })

  it("cascades draft sync from parent to child entities", async () => {
    const restoreNavigator = setBrowserOnlineState(false)

    let parentProject: ClientEntity | undefined
    let childTask: ClientEntity | undefined

    try {
      // Create parent and child entities while offline so both are drafts.
      parentProject = await createEntityThroughRuntime(primaryRuntime, {
        entityType: "project",
        content: buildTestEntityNameContent("Offline Draft Project"),
      })

      childTask = await createEntityThroughRuntime(primaryRuntime, {
        entityType: "task",
        content: {
          title: "Offline Draft Task",
          description: "Child task",
        },
        parent: parentProject,
      })

      expect(getCachedDraftByEntityId(primaryRuntime, parentProject.id)).toBeTruthy()
      expect(getCachedDraftByEntityId(primaryRuntime, childTask.id)).toBeTruthy()
    } finally {
      restoreNavigator()
    }

    const restoreOnlineNavigator = setBrowserOnlineState(true)

    try {
      if (!parentProject || !childTask) {
        throw new Error("Missing parent or child draft for cascade sync")
      }

      const syncDraft = primaryRuntime.getSyncDraft()
      const syncResult = await syncDraft.execute(parentProject.id)
      if (syncResult.isFailed()) {
        throw new Error(buildDraftSyncError(parentProject.id))
      }

      await waitForCondition(() => {
        return getCachedDraftByEntityId(primaryRuntime, childTask.id) === undefined
      })

      const childFetchResult = await primaryRuntime.getQueryEntityById().execute(childTask.id)
      expect(childFetchResult.isFailed()).toBe(false)
    } finally {
      restoreOnlineNavigator()
    }
  })
})

describe("V2 Draft Sync Error Handling", () => {
  let primaryClient: GlobalClient
  let primaryRuntime: WorkspaceRuntime

  beforeEach(async () => {
    const result = await createInitializedRuntimeForWorkspace("sync-errors")
    primaryClient = result.client
    primaryRuntime = result.runtime
  })

  afterEach(async () => {
    try {
      await destroyWorkspaceRuntimeAndLogoutUsers(primaryRuntime, primaryClient)
    } catch {
      // Ignore cleanup errors.
    }
  })

  it("marks drafts as conflicted when expected hash mismatches server state", async () => {
    const createdNote = await createEntityThroughRuntime(primaryRuntime, {
      entityType: "note",
      content: buildTestEntityContent("Conflict Draft Note", "Conflict content"),
    })

    const restoreNavigator = setBrowserOnlineState(false)

    try {
      const updateResult = await primaryRuntime.getUpdateEntity().execute({
        id: createdNote.id,
        content: buildTestEntityContent("Offline Conflict Update", "Conflict content"),
      })
      expect(updateResult.isFailed()).toBe(false)

      const draftBeforeConflict = getCachedDraftByEntityId(primaryRuntime, createdNote.id)
      expect(draftBeforeConflict).toBeTruthy()
      if (!draftBeforeConflict) {
        throw new Error("Draft not found for conflict setup")
      }

      const persistDraft = primaryRuntime.getPersistDraft()
      await persistDraft.execute({
        ...draftBeforeConflict,
        formedOnHash: buildSimulatedConflictHash(),
      })
    } finally {
      restoreNavigator()
    }

    const restoreOnlineNavigator = setBrowserOnlineState(true)

    try {
      const syncDraft = primaryRuntime.getSyncDraft()
      const conflictResult = await syncDraft.execute(createdNote.id)
      expect(conflictResult.isFailed()).toBe(false)
      expect(conflictResult.getValue().status).toBe("conflict")

      const conflictDraft = getCachedDraftByEntityId(primaryRuntime, createdNote.id)
      expect(conflictDraft?.saveError).toBe("Conflict detected")
    } finally {
      restoreOnlineNavigator()
    }
  })

  it("marks drafts as orphaned when the entity is missing on the server", async () => {
    const createdNote = await createEntityThroughRuntime(primaryRuntime, {
      entityType: "note",
      content: buildTestEntityContent("Orphan Draft Note", "Orphan content"),
    })

    const restoreNavigator = setBrowserOnlineState(false)

    try {
      const updateResult = await primaryRuntime.getUpdateEntity().execute({
        id: createdNote.id,
        content: buildTestEntityContent("Offline Orphan Update", "Orphan content"),
      })
      expect(updateResult.isFailed()).toBe(false)
    } finally {
      restoreNavigator()
    }

    const restoreOnlineNavigator = setBrowserOnlineState(true)

    try {
      const deleteResult = await getMakeWorkspaceRequest(primaryRuntime).executeDelete(
        `entities/${createdNote.id}`
      )
      if (deleteResult.isFailed()) {
        throw new Error(buildRemoteEntityNotFoundError(createdNote.id))
      }

      const syncDraft = primaryRuntime.getSyncDraft()
      const orphanResult = await syncDraft.execute(createdNote.id)
      expect(orphanResult.isFailed()).toBe(false)
      expect(orphanResult.getValue().status).toBe("orphaned")

      const orphanDraft = getCachedDraftByEntityId(primaryRuntime, createdNote.id)
      expect(orphanDraft?.saveError).toBe("Entity missing")
    } finally {
      restoreOnlineNavigator()
    }
  })

  it("caps automatic draft save attempts", async () => {
    const restoreNavigator = setBrowserOnlineState(false)

    let createdNoteId = ""

    try {
      const createdNote = await createEntityThroughRuntime(primaryRuntime, {
        entityType: "note",
        content: buildTestEntityContent("Retry Draft Note", "Retry content"),
      })
      createdNoteId = createdNote.id
    } finally {
      restoreNavigator()
    }

    const restoreOnlineNavigator = setBrowserOnlineState(true)

    const makeWorkspaceRequest = getMakeWorkspaceRequest(primaryRuntime)
    const originalExecutePost = makeWorkspaceRequest.executePost.bind(makeWorkspaceRequest)
    makeWorkspaceRequest.executePost = buildSimulatedFailureExecutePost()

    try {
      const syncDraft = primaryRuntime.getSyncDraft()

      await syncDraft.execute(createdNoteId)
      await syncDraft.execute(createdNoteId)
      await syncDraft.execute(createdNoteId)

      const draftAfterRetries = getCachedDraftByEntityId(primaryRuntime, createdNoteId)
      expect(draftAfterRetries?.saveAttempts).toBe(3)
      expect(draftAfterRetries?.saveError).toBe("Simulated failure")

      const noOpOutcome = await syncDraft.execute(createdNoteId)
      expect(noOpOutcome.isFailed()).toBe(true)
      expect(noOpOutcome.getError()).toBe("Draft has reached the maximum number of automatic attempts")
    } finally {
      makeWorkspaceRequest.executePost = originalExecutePost
      restoreOnlineNavigator()
    }
  })

  it("resets retry state before reattempting save", async () => {
    const restoreNavigator = setBrowserOnlineState(false)

    let createdNoteId = ""

    try {
      const createdNote = await createEntityThroughRuntime(primaryRuntime, {
        entityType: "note",
        content: buildTestEntityContent("Retry Reset Note", "Retry reset content"),
      })
      createdNoteId = createdNote.id
    } finally {
      restoreNavigator()
    }

    const restoreOnlineNavigator = setBrowserOnlineState(true)

    const makeWorkspaceRequest = getMakeWorkspaceRequest(primaryRuntime)
    const originalExecutePost = makeWorkspaceRequest.executePost.bind(makeWorkspaceRequest)
    makeWorkspaceRequest.executePost = buildSimulatedFailureExecutePost()

    try {
      const syncDraft = primaryRuntime.getSyncDraft()

      await syncDraft.execute(createdNoteId)
      await syncDraft.execute(createdNoteId)

      const draftBeforeReset = getCachedDraftByEntityId(primaryRuntime, createdNoteId)
      expect(draftBeforeReset?.saveAttempts).toBe(2)
      expect(draftBeforeReset?.saveError).toBe("Simulated failure")

      await syncDraft.execute(createdNoteId, { resetAttempts: true })

      const draftAfterReset = getCachedDraftByEntityId(primaryRuntime, createdNoteId)
      expect(draftAfterReset?.saveAttempts).toBe(0)
      expect(draftAfterReset?.saveError).toBe("Simulated failure")
    } finally {
      makeWorkspaceRequest.executePost = originalExecutePost
      restoreOnlineNavigator()
    }
  })
})

describe("V2 Draft Block Integration Tests", () => {
  let primaryClient: GlobalClient
  let primaryRuntime: WorkspaceRuntime

  beforeEach(async () => {
    const result = await createInitializedRuntimeForWorkspace("blocks")
    primaryClient = result.client
    primaryRuntime = result.runtime
  })

  afterEach(async () => {
    try {
      await destroyWorkspaceRuntimeAndLogoutUsers(primaryRuntime, primaryClient)
    } catch {
      // Ignore cleanup errors.
    }
  })

  it("keeps draft blocks when parent create draft is pending", async () => {
    const restoreNavigator = setBrowserOnlineState(false)

    let createdPaperId = ""

    try {
      const createdPaper = await createEntityThroughRuntime(primaryRuntime, {
        entityType: "paper",
        content: buildTestEntityNameContent("Block Draft Paper"),
      })
      createdPaperId = createdPaper.id
    } finally {
      restoreNavigator()
    }

    const restoreOnlineNavigator = setBrowserOnlineState(true)

    try {
      const blockDraftResult = await primaryRuntime.getCreateBlockDraft().execute({
        entityId: createdPaperId,
        entityType: "paper",
        yjsUpdates: buildBlockDraftUpdate("Pending Create"),
      })
      expect(blockDraftResult.isFailed()).toBe(false)

      const draftBlocks = getDraftBlocksByEntityId(primaryRuntime, createdPaperId)
      expect(draftBlocks.length).toBe(1)

      const serverBlocks = await getServerBlocksByEntityId(primaryRuntime, createdPaperId)
      expect(serverBlocks.length).toBe(0)
    } finally {
      restoreOnlineNavigator()
    }
  })

  it("clears draft entity without clearing blocks when requested", async () => {
    const restoreNavigator = setBrowserOnlineState(false)

    let createdPaperId = ""

    try {
      const createdPaper = await createEntityThroughRuntime(primaryRuntime, {
        entityType: "paper",
        content: buildTestEntityNameContent("Clear Draft Paper"),
      })
      createdPaperId = createdPaper.id

      const blockDraftResult = await primaryRuntime.getCreateBlockDraft().execute({
        entityId: createdPaperId,
        entityType: "paper",
        yjsUpdates: buildBlockDraftUpdate("Clear Draft"),
        attemptSync: false,
      })
      expect(blockDraftResult.isFailed()).toBe(false)
    } finally {
      restoreNavigator()
    }

    const clearDraft = primaryRuntime.getClearDraft()
    await clearDraft.execute(createdPaperId, { clearBlocks: false })

    const remainingDraft = getCachedDraftByEntityId(primaryRuntime, createdPaperId)
    expect(remainingDraft).toBeUndefined()

    const draftBlocks = getDraftBlocksByEntityId(primaryRuntime, createdPaperId)
    expect(draftBlocks.length).toBe(1)
  })
})

describe("V2 Draft Search Integration Tests", () => {
  it("indexes offline draft updates for title/name fields", async () => {
    const searchStore = new SearchStore()
    const searchIndex = new InMemorySearchIndex(searchStore)
    await searchIndex.initialize()

    const workspaceResult = await newClientWithWorkspace(buildTestWorkspaceName("search"))
    const runtime = createApplicationForClient(workspaceResult.client, workspaceResult.workspace.uuid, {
      searchIndex,
    })
    await ensureRuntimeInitialized(runtime)

    const createdNote = await createEntityThroughRuntime(runtime, {
      entityType: "note",
      content: buildTestEntityContent("Draft Search Title", "Draft search text"),
    })

    const initialResults = await searchIndex.search("Draft Search Title")
    expect(initialResults.some(result => result.entityId === createdNote.id)).toBe(true)

    const restoreNavigator = setBrowserOnlineState(false)

    try {
      const updateResult = await runtime.getUpdateEntity().execute({
        id: createdNote.id,
        content: buildTestEntityContent("Draft Search Updated", "Draft search text"),
      })
      expect(updateResult.isFailed()).toBe(false)

      const updatedResults = await searchIndex.search("Draft Search Updated")
      expect(updatedResults.some(result => result.entityId === createdNote.id)).toBe(true)
    } finally {
      restoreNavigator()
      runtime.destroy()
      await workspaceResult.client.getLogoutAllAccounts().execute()
    }
  })
})
