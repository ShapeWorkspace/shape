/**
 * Search Integration Tests (V2)
 *
 * Validates the search index behavior using an in-memory implementation.
 * Focuses on title/name indexing, filtering, updates, removals, and notifications.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { ClientEntity, EntityContent } from "../../models/entity"
import type { EntityType } from "../../utils/encryption-types"
import { SearchStore } from "../../store/search-store"
import { InMemorySearchIndex } from "../helpers/in-memory-search-index"

const WORKSPACE_ID = "test-workspace-id"

const buildEntity = <C extends EntityContent>(params: {
  entityType: EntityType
  entityId: string
  content: C
}): ClientEntity<C> => {
  const now = new Date()
  return {
    id: params.entityId,
    workspaceId: WORKSPACE_ID,
    entityType: params.entityType,
    creatorId: "user-1",
    lastUpdatedById: "user-1",
    chainRootKeyId: "workspace-key",
    wrappingKeyId: "workspace-key",
    wrappingKeyType: "workspace",
    entityKey: "entity-key",
    content: params.content,
    metaFields: {},
    mentionedUserIds: [],
    contentHash: "content-hash",
    createdAt: now,
    updatedAt: now,
  }
}

describe("Search Integration Tests (V2)", () => {
  let searchStore: SearchStore
  let searchIndex: InMemorySearchIndex

  beforeEach(async () => {
    searchStore = new SearchStore()
    searchIndex = new InMemorySearchIndex(searchStore)
    await searchIndex.initialize()
  })

  describe("Indexing and Searching", () => {
    it("indexes a note by title", async () => {
      const note = buildEntity({
        entityType: "note",
        entityId: "note-1",
        content: { title: "Meeting Notes", text: "Budget discussion" },
      })

      searchIndex.indexClientEntity(note)

      const results = await searchIndex.search("Meeting")
      expect(results.length).toBe(1)
      expect(results[0].entityId).toBe("note-1")
      expect(results[0].entityType).toBe("note")
    })

    it("indexes a folder by name", async () => {
      const folder = buildEntity({
        entityType: "folder",
        entityId: "folder-1",
        content: { name: "Design Docs" },
      })

      searchIndex.indexClientEntity(folder)

      const results = await searchIndex.search("Design")
      expect(results.length).toBe(1)
      expect(results[0].entityType).toBe("folder")
    })

    it("returns empty results for non-matching queries", async () => {
      const note = buildEntity({
        entityType: "note",
        entityId: "note-2",
        content: { title: "Project Ideas", text: "Dashboard" },
      })

      searchIndex.indexClientEntity(note)

      const results = await searchIndex.search("xyz123nonexistent")
      expect(results.length).toBe(0)
    })

    it("handles case-insensitive search", async () => {
      const note = buildEntity({
        entityType: "note",
        entityId: "note-3",
        content: { title: "Planning Session", text: "" },
      })

      searchIndex.indexClientEntity(note)

      const lower = await searchIndex.search("planning")
      const upper = await searchIndex.search("PLANNING")
      const mixed = await searchIndex.search("PlAnNiNg")

      expect(lower.length).toBe(1)
      expect(upper.length).toBe(1)
      expect(mixed.length).toBe(1)
    })

    it("indexes multiple entities and returns all matches", async () => {
      const note1 = buildEntity({
        entityType: "note",
        entityId: "note-alpha",
        content: { title: "Alpha Plan", text: "" },
      })
      const note2 = buildEntity({
        entityType: "note",
        entityId: "note-beta",
        content: { title: "Alpha Review", text: "" },
      })
      const folder = buildEntity({
        entityType: "folder",
        entityId: "folder-alpha",
        content: { name: "Alpha Files" },
      })

      searchIndex.indexClientEntity(note1)
      searchIndex.indexClientEntity(note2)
      searchIndex.indexClientEntity(folder)

      const results = await searchIndex.search("Alpha")
      expect(results.length).toBe(3)
    })
  })

  describe("Filtering by Entity Type", () => {
    it("filters results by entity type", async () => {
      const note = buildEntity({
        entityType: "note",
        entityId: "note-filter",
        content: { title: "Filter Me", text: "" },
      })
      const folder = buildEntity({
        entityType: "folder",
        entityId: "folder-filter",
        content: { name: "Filter Me" },
      })

      searchIndex.indexClientEntity(note)
      searchIndex.indexClientEntity(folder)

      const noteResults = await searchIndex.search("Filter", { entityTypes: ["note"] })
      expect(noteResults.length).toBe(1)
      expect(noteResults[0].entityType).toBe("note")

      const folderResults = await searchIndex.search("Filter", { entityTypes: ["folder"] })
      expect(folderResults.length).toBe(1)
      expect(folderResults[0].entityType).toBe("folder")
    })
  })

  describe("Index Updates and Removals", () => {
    it("updates indexed content when re-indexed", async () => {
      const note = buildEntity({
        entityType: "note",
        entityId: "note-update",
        content: { title: "Old Title", text: "" },
      })

      searchIndex.indexClientEntity(note)
      expect((await searchIndex.search("Old")).length).toBe(1)

      const updated = buildEntity({
        entityType: "note",
        entityId: "note-update",
        content: { title: "New Title", text: "" },
      })

      searchIndex.indexClientEntity(updated)

      expect((await searchIndex.search("Old")).length).toBe(0)
      expect((await searchIndex.search("New")).length).toBe(1)
    })

    it("removes an entity from the index", async () => {
      const folder = buildEntity({
        entityType: "folder",
        entityId: "folder-remove",
        content: { name: "Remove Me" },
      })

      searchIndex.indexClientEntity(folder)
      expect((await searchIndex.search("Remove")).length).toBe(1)

      await searchIndex.removeEntity("folder-remove", "folder")

      const results = await searchIndex.search("Remove")
      expect(results.length).toBe(0)
    })
  })

  describe("Index Change Notifications", () => {
    it("notifies subscribers when indexing a client entity", async () => {
      const observer = vi.fn()
      searchStore.addSearchIndexObserver(observer)

      const note = buildEntity({
        entityType: "note",
        entityId: "note-notify",
        content: { title: "Notify", text: "" },
      })

      searchIndex.indexClientEntity(note)

      expect(observer).toHaveBeenCalledTimes(1)
      searchStore.removeSearchIndexObserver(observer)
    })

    it("notifies subscribers when removing an entity", async () => {
      const observer = vi.fn()
      searchStore.addSearchIndexObserver(observer)

      await searchIndex.removeEntity("missing", "note")

      expect(observer).toHaveBeenCalledTimes(1)
      searchStore.removeSearchIndexObserver(observer)
    })

    it("notifies subscribers when the index is cleared", async () => {
      const observer = vi.fn()
      searchStore.addSearchIndexObserver(observer)

      await searchIndex.clear()

      expect(observer).toHaveBeenCalledTimes(1)
      searchStore.removeSearchIndexObserver(observer)
    })
  })
})
