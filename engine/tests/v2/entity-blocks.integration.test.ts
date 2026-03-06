/**
 * V2 Entity Block Integration Tests (Entity-based server)
 *
 * Focus: block draft sync for entity types that store collaborative content
 * (notes, papers, tasks) via the generic /entities/:id/blocks endpoint.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { WorkspaceRuntime } from "../../workspace-runtime/workspace-runtime"
import { GlobalClient } from "../../global/global-client"
import {
  createApplicationForClient,
  createEntityThroughRuntime,
  createYjsUpdateForBlockContent,
  newClientWithWorkspace,
  waitForCondition,
} from "./helpers"
import type { ClientEntity, EntityContent } from "../../models/entity"

type EntityTypeWithBlocks = "note" | "paper" | "task"

describe("V2 Entity Block Integration Tests", () => {
  let client: GlobalClient
  let runtime: WorkspaceRuntime
  let workspaceId: string

  beforeEach(async () => {
    const result = await newClientWithWorkspace("v2-entity-blocks")
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
    "should sync block drafts for notes, papers, and tasks via /entities/:id/blocks",
    async () => {
      const scenarios: Array<{
        label: string
        entityType: EntityTypeWithBlocks
        content: EntityContent
        expectedField: string
        requiresParent?: boolean
      }> = [
        {
          label: "note",
          entityType: "note",
          content: { title: "Block Note", text: "Block Note body" },
          expectedField: "text",
        },
        {
          label: "paper",
          entityType: "paper",
          content: { name: "Block Paper", text: "Block Paper body" },
          expectedField: "text",
        },
        {
          label: "task",
          entityType: "task",
          content: { title: "Block Task", description: "Block Task description" },
          expectedField: "description",
          requiresParent: true,
        },
      ]

      for (const scenario of scenarios) {
        let parentEntity: ClientEntity | undefined

        if (scenario.requiresParent) {
          parentEntity = await createEntityThroughRuntime(runtime, {
            entityType: "project",
            content: { name: `${scenario.label} Project` },
          })
        }

        const entity = await createEntityThroughRuntime(runtime, {
          entityType: scenario.entityType,
          content: scenario.content,
          parent: parentEntity,
        })

        const draftResult = await runtime.getCreateBlockDraft().execute({
          entityId: entity.id,
          entityType: scenario.entityType,
          yjsUpdates: createYjsUpdateForBlockContent(`${scenario.label} block content`),
        })
        if (draftResult.isFailed()) {
          throw new Error(draftResult.getError())
        }

        await waitForCondition(async () => {
          const blocks = await runtime.getRepositoryStore().blockRepository.getBlocksByEntity(entity.id)
          return blocks.length > 0
        }, 10000, 100)

        const blocks = await runtime.getRepositoryStore().blockRepository.getBlocksByEntity(entity.id)
        expect(blocks.length).toBeGreaterThan(0)
        expect(blocks[0]?.entity_id).toBe(entity.id)
        expect(blocks[0]?.entity_type).toBe(scenario.entityType)
        expect(blocks[0]?.entity_field).toBe(scenario.expectedField)
        expect(blocks[0]?.encrypted_data).toBeTruthy()
      }
    },
    20000
  )
})

// ------------------------------------------------------------
// Block Drafts
// ------------------------------------------------------------

describe("Entity Block Draft Integration Tests", () => {
  let client: GlobalClient
  let runtime: WorkspaceRuntime
  let workspaceId: string

  beforeEach(async () => {
    // Each test needs a fully initialized runtime to exercise block draft sync.
    const result = await newClientWithWorkspace("entity-block-drafts")
    client = result.client
    workspaceId = result.workspace.uuid

    runtime = createApplicationForClient(client, workspaceId)
    await runtime.initialize()
  })

  afterEach(async () => {
    try {
      // Tear down runtime to prevent cross-test SSE and store leakage.
      runtime.destroy()
    } catch {
      // Ignore cleanup errors
    }
  })

  it("should encrypt and sync a paper block draft", async () => {
    // Create the entity that will receive the draft blocks.
    const paper = await createEntityThroughRuntime(runtime, {
      entityType: "paper",
      content: { name: "Draft Block Paper" },
    })

    const draftResult = await runtime.getCreateBlockDraft().execute({
      entityId: paper.id,
      entityType: "paper",
      yjsUpdates: createYjsUpdateForBlockContent("Draft block content"),
    })
    if (draftResult.isFailed()) {
      throw new Error(draftResult.getError())
    }

    await waitForCondition(
      async () => {
        const blocks = await runtime.getRepositoryStore().blockRepository.getBlocksByEntity(paper.id)
        return blocks.length > 0
      },
      10000,
      100
    )

    const blocks = await runtime.getRepositoryStore().blockRepository.getBlocksByEntity(paper.id)
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks[0]?.entity_id).toBe(paper.id)
  })

  it("wires BlockStore to SSE during remote runtime initialization", async () => {
    runtime.destroy()

    runtime = createApplicationForClient(client, workspaceId)
    const blockStore = runtime.getCacheStores().blockStore
    const initializeWithSSEManagerSpy = vi.spyOn(blockStore, "initializeWithSSEManager")

    await runtime.initialize()

    expect(initializeWithSSEManagerSpy).toHaveBeenCalledTimes(1)
    expect(initializeWithSSEManagerSpy).toHaveBeenCalledWith(runtime.getSSEConnectionManager())
  })
})
