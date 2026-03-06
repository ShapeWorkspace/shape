/**
 * Entity Links Integration Tests (V2)
 *
 * Tests the engine's EntityLinkService functionality against the v2 server.
 * Covers:
 * - Basic entity link CRUD operations (sync, get)
 * - Aggregation for discussions with replies
 * - Aggregation for tasks with comments
 * - Source context storage and retrieval for backlink navigation
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { GlobalClient } from "../../global/global-client"
import { WorkspaceRuntime } from "../../workspace-runtime/workspace-runtime"
import { EntityLinkService } from "../../services/entity-link-service"
import { EntityLinkRepository } from "../../repositories/entity-link-repository"
import { ExecuteAuthenticatedRequest } from "../../usecase/network/ExecuteAuthenticatedRequest"
import { logger } from "../../utils/logger"
import type { ClientEntity } from "../../models/entity"
import type { LinkedEntityInput } from "../../models/entity-link"
import { createApplicationForClient, createEntityThroughRuntime, newClientWithWorkspace } from "./helpers"

const createNote = async (runtime: WorkspaceRuntime, title: string) =>
  createEntityThroughRuntime(runtime, {
    entityType: "note",
    content: { title, text: `${title} body` },
  })

const createForumChannel = async (runtime: WorkspaceRuntime, name: string) =>
  createEntityThroughRuntime(runtime, {
    entityType: "forum-channel",
    content: { name, description: "" },
  })

const createForumDiscussion = async (
  runtime: WorkspaceRuntime,
  channel: ClientEntity,
  title: string
) =>
  createEntityThroughRuntime(runtime, {
    entityType: "forum-discussion",
    content: { title, body: `<p>${title}</p>` },
    parent: channel,
  })

const createForumReply = async (runtime: WorkspaceRuntime, discussion: ClientEntity) =>
  createEntityThroughRuntime(runtime, {
    entityType: "forum-reply",
    content: { body: "<p>Reply body</p>" },
    parent: discussion,
  })

const createProject = async (runtime: WorkspaceRuntime, name: string) =>
  createEntityThroughRuntime(runtime, {
    entityType: "project",
    content: { name },
  })

const createTask = async (runtime: WorkspaceRuntime, project: ClientEntity, title: string) =>
  createEntityThroughRuntime(runtime, {
    entityType: "task",
    content: { title, status: "backlog" },
    parent: project,
  })

const createTaskComment = async (runtime: WorkspaceRuntime, task: ClientEntity) =>
  createEntityThroughRuntime(runtime, {
    entityType: "task-comment",
    content: { body: "<p>Comment body</p>" },
    parent: task,
  })

describe("Entity Links Integration Tests (V2)", () => {
  let client: GlobalClient
  let application: WorkspaceRuntime
  let entityLinkService: EntityLinkService
  let workspaceId: string

  beforeEach(async () => {
    const result = await newClientWithWorkspace("entity-links-test")
    client = result.client
    workspaceId = result.workspace.uuid

    application = createApplicationForClient(client, workspaceId)
    await application.initialize()

    const accountStore = application.getAccountStore()
    const executeAuthenticatedRequest = new ExecuteAuthenticatedRequest(
      accountStore.getHttpClient(),
      accountStore,
      application.getRefreshAuthTokens(),
      logger
    )
    const entityLinkRepository = new EntityLinkRepository(client.getOfflineDatabase())
    entityLinkService = new EntityLinkService(executeAuthenticatedRequest, entityLinkRepository)
  })

  afterEach(async () => {
    try {
      application.destroy()
      if (client.getUsersStore().hasUsers()) {
        await client.getLogoutAllAccounts().execute()
      }
    } catch {
      // Ignore cleanup errors
    }
  })

  describe("Basic Entity Link Operations", () => {
    it("syncs entity links for a note", async () => {
      const note = await createNote(application, "Source Note")
      const targetNote = await createNote(application, "Target Note")

      const linkedEntities: LinkedEntityInput[] = [
        {
          target_entity_type: "note",
          target_entity_id: targetNote.id,
          link_type: "explicit",
        },
      ]

      const syncResult = await entityLinkService.syncEntityLinks(
        workspaceId,
        note.id,
        "note",
        linkedEntities
      )
      expect(syncResult.isFailed()).toBe(false)

      const linksResult = await entityLinkService.getEntityLinks(workspaceId, note.id, "note")
      expect(linksResult.isFailed()).toBe(false)
      const links = linksResult.getValue()

      expect(links.links.length).toBe(1)
      expect(links.links[0].targetEntityId).toBe(targetNote.id)
      expect(links.links[0].targetEntityType).toBe("note")
      expect(links.linkedBy.length).toBe(0)
    })

    it("returns backlinks when fetching from target entity", async () => {
      const sourceNote = await createNote(application, "Source")
      const targetNote = await createNote(application, "Target")

      const linkedEntities: LinkedEntityInput[] = [
        {
          target_entity_type: "note",
          target_entity_id: targetNote.id,
          link_type: "explicit",
        },
      ]

      await entityLinkService.syncEntityLinks(
        workspaceId,
        sourceNote.id,
        "note",
        linkedEntities
      )

      const linksResult = await entityLinkService.getEntityLinks(workspaceId, targetNote.id, "note")
      expect(linksResult.isFailed()).toBe(false)
      const links = linksResult.getValue()

      expect(links.links.length).toBe(0)
      expect(links.linkedBy.length).toBe(1)
      expect(links.linkedBy[0].sourceEntityId).toBe(sourceNote.id)
      expect(links.linkedBy[0].sourceEntityType).toBe("note")
    })

    it("removes links when syncing with an empty array", async () => {
      const sourceNote = await createNote(application, "Source")
      const targetNote = await createNote(application, "Target")

      await entityLinkService.syncEntityLinks(workspaceId, sourceNote.id, "note", [
        { target_entity_type: "note", target_entity_id: targetNote.id, link_type: "explicit" },
      ])

      let linksResult = await entityLinkService.getEntityLinks(workspaceId, sourceNote.id, "note")
      expect(linksResult.getValue().links.length).toBe(1)

      await entityLinkService.syncEntityLinks(workspaceId, sourceNote.id, "note", [])

      linksResult = await entityLinkService.getEntityLinks(workspaceId, sourceNote.id, "note")
      expect(linksResult.getValue().links.length).toBe(0)
    })

    it("handles multiple links from the same source", async () => {
      const sourceNote = await createNote(application, "Source")
      const target1 = await createNote(application, "Target 1")
      const target2 = await createNote(application, "Target 2")
      const target3 = await createNote(application, "Target 3")

      await entityLinkService.syncEntityLinks(workspaceId, sourceNote.id, "note", [
        { target_entity_type: "note", target_entity_id: target1.id, link_type: "explicit" },
        { target_entity_type: "note", target_entity_id: target2.id, link_type: "explicit" },
        { target_entity_type: "note", target_entity_id: target3.id, link_type: "explicit" },
      ])

      const linksResult = await entityLinkService.getEntityLinks(workspaceId, sourceNote.id, "note")
      expect(linksResult.getValue().links.length).toBe(3)

      const targetIds = linksResult.getValue().links.map(link => link.targetEntityId)
      expect(targetIds).toContain(target1.id)
      expect(targetIds).toContain(target2.id)
      expect(targetIds).toContain(target3.id)
    })
  })

  describe("Source Context for Backlink Navigation", () => {
    it("stores and returns source context for forum replies", async () => {
      const note = await createNote(application, "Target Note")
      const channel = await createForumChannel(application, "Test Channel")
      const discussion = await createForumDiscussion(application, channel, "Test Discussion")
      const reply = await createForumReply(application, discussion)

      const linkedEntities: LinkedEntityInput[] = [
        {
          target_entity_type: "note",
          target_entity_id: note.id,
          link_type: "explicit",
          source_context: {
            channel_id: channel.id,
            discussion_id: discussion.id,
          },
        },
      ]

      await entityLinkService.syncEntityLinks(
        workspaceId,
        reply.id,
        "forum-reply",
        linkedEntities
      )

      const linksResult = await entityLinkService.getEntityLinks(workspaceId, note.id, "note")
      expect(linksResult.isFailed()).toBe(false)
      const links = linksResult.getValue()

      expect(links.linkedBy.length).toBe(1)
      expect(links.linkedBy[0].sourceEntityType).toBe("forum-reply")
      expect(links.linkedBy[0].sourceEntityId).toBe(reply.id)
      expect(links.linkedBy[0].sourceContext?.channel_id).toBe(channel.id)
      expect(links.linkedBy[0].sourceContext?.discussion_id).toBe(discussion.id)
    })

    it("stores and returns source context for task comments", async () => {
      const note = await createNote(application, "Target Note")
      const project = await createProject(application, "Test Project")
      const task = await createTask(application, project, "Test Task")
      const comment = await createTaskComment(application, task)

      const linkedEntities: LinkedEntityInput[] = [
        {
          target_entity_type: "note",
          target_entity_id: note.id,
          link_type: "explicit",
          source_context: {
            project_id: project.id,
            task_id: task.id,
          },
        },
      ]

      await entityLinkService.syncEntityLinks(
        workspaceId,
        comment.id,
        "task-comment",
        linkedEntities
      )

      const linksResult = await entityLinkService.getEntityLinks(workspaceId, note.id, "note")
      expect(linksResult.isFailed()).toBe(false)
      const links = linksResult.getValue()

      expect(links.linkedBy.length).toBe(1)
      expect(links.linkedBy[0].sourceEntityType).toBe("task-comment")
      expect(links.linkedBy[0].sourceEntityId).toBe(comment.id)
      expect(links.linkedBy[0].sourceContext?.project_id).toBe(project.id)
      expect(links.linkedBy[0].sourceContext?.task_id).toBe(task.id)
    })
  })

  describe("Discussion Link Aggregation", () => {
    it("aggregates links from discussion and replies", async () => {
      const note1 = await createNote(application, "Note 1")
      const note2 = await createNote(application, "Note 2")
      const note3 = await createNote(application, "Note 3")

      const channel = await createForumChannel(application, "Test Channel")
      const discussion = await createForumDiscussion(application, channel, "Test Discussion")
      const reply1 = await createForumReply(application, discussion)
      const reply2 = await createForumReply(application, discussion)

      await entityLinkService.syncEntityLinks(workspaceId, discussion.id, "forum-discussion", [
        { target_entity_type: "note", target_entity_id: note1.id, link_type: "explicit" },
      ])

      await entityLinkService.syncEntityLinks(workspaceId, reply1.id, "forum-reply", [
        {
          target_entity_type: "note",
          target_entity_id: note2.id,
          link_type: "explicit",
          source_context: { channel_id: channel.id, discussion_id: discussion.id },
        },
      ])

      await entityLinkService.syncEntityLinks(workspaceId, reply2.id, "forum-reply", [
        {
          target_entity_type: "note",
          target_entity_id: note3.id,
          link_type: "explicit",
          source_context: { channel_id: channel.id, discussion_id: discussion.id },
        },
      ])

      const linksResult = await entityLinkService.getEntityLinks(
        workspaceId,
        discussion.id,
        "forum-discussion"
      )
      expect(linksResult.isFailed()).toBe(false)
      const links = linksResult.getValue()

      expect(links.links.length).toBe(3)
      const targetIds = links.links.map(link => link.targetEntityId)
      expect(targetIds).toContain(note1.id)
      expect(targetIds).toContain(note2.id)
      expect(targetIds).toContain(note3.id)
    })

    it("returns empty links when discussion has no links or replies", async () => {
      const channel = await createForumChannel(application, "Empty Channel")
      const discussion = await createForumDiscussion(application, channel, "Empty Discussion")

      const linksResult = await entityLinkService.getEntityLinks(
        workspaceId,
        discussion.id,
        "forum-discussion"
      )
      expect(linksResult.isFailed()).toBe(false)
      const links = linksResult.getValue()

      expect(links.links.length).toBe(0)
      expect(links.linkedBy.length).toBe(0)
    })

    it("aggregates reply links even when discussion has no links", async () => {
      const note = await createNote(application, "Target Note")
      const channel = await createForumChannel(application, "Test Channel")
      const discussion = await createForumDiscussion(application, channel, "Test Discussion")
      const reply = await createForumReply(application, discussion)

      await entityLinkService.syncEntityLinks(workspaceId, reply.id, "forum-reply", [
        {
          target_entity_type: "note",
          target_entity_id: note.id,
          link_type: "explicit",
          source_context: { channel_id: channel.id, discussion_id: discussion.id },
        },
      ])

      const linksResult = await entityLinkService.getEntityLinks(
        workspaceId,
        discussion.id,
        "forum-discussion"
      )
      expect(linksResult.isFailed()).toBe(false)
      const links = linksResult.getValue()

      expect(links.links.length).toBe(1)
      expect(links.links[0].targetEntityId).toBe(note.id)
      expect(links.links[0].sourceEntityType).toBe("forum-reply")
    })
  })

  describe("Task Link Aggregation", () => {
    it("aggregates links from task and task comments", async () => {
      const note1 = await createNote(application, "Note 1")
      const note2 = await createNote(application, "Note 2")
      const note3 = await createNote(application, "Note 3")

      const project = await createProject(application, "Test Project")
      const task = await createTask(application, project, "Test Task")
      const comment1 = await createTaskComment(application, task)
      const comment2 = await createTaskComment(application, task)

      await entityLinkService.syncEntityLinks(workspaceId, task.id, "task", [
        { target_entity_type: "note", target_entity_id: note1.id, link_type: "explicit" },
      ])

      await entityLinkService.syncEntityLinks(workspaceId, comment1.id, "task-comment", [
        {
          target_entity_type: "note",
          target_entity_id: note2.id,
          link_type: "explicit",
          source_context: { project_id: project.id, task_id: task.id },
        },
      ])

      await entityLinkService.syncEntityLinks(workspaceId, comment2.id, "task-comment", [
        {
          target_entity_type: "note",
          target_entity_id: note3.id,
          link_type: "explicit",
          source_context: { project_id: project.id, task_id: task.id },
        },
      ])

      const linksResult = await entityLinkService.getEntityLinks(workspaceId, task.id, "task")
      expect(linksResult.isFailed()).toBe(false)
      const links = linksResult.getValue()

      expect(links.links.length).toBe(3)
      const targetIds = links.links.map(link => link.targetEntityId)
      expect(targetIds).toContain(note1.id)
      expect(targetIds).toContain(note2.id)
      expect(targetIds).toContain(note3.id)
    })

    it("returns empty links when task has no links or comments", async () => {
      const project = await createProject(application, "Empty Project")
      const task = await createTask(application, project, "Empty Task")

      const linksResult = await entityLinkService.getEntityLinks(workspaceId, task.id, "task")
      expect(linksResult.isFailed()).toBe(false)
      const links = linksResult.getValue()

      expect(links.links.length).toBe(0)
      expect(links.linkedBy.length).toBe(0)
    })

    it("aggregates comment links even when task has no links", async () => {
      const note = await createNote(application, "Target Note")
      const project = await createProject(application, "Test Project")
      const task = await createTask(application, project, "Test Task")
      const comment = await createTaskComment(application, task)

      await entityLinkService.syncEntityLinks(workspaceId, comment.id, "task-comment", [
        {
          target_entity_type: "note",
          target_entity_id: note.id,
          link_type: "explicit",
          source_context: { project_id: project.id, task_id: task.id },
        },
      ])

      const linksResult = await entityLinkService.getEntityLinks(workspaceId, task.id, "task")
      expect(linksResult.isFailed()).toBe(false)
      const links = linksResult.getValue()

      expect(links.links.length).toBe(1)
      expect(links.links[0].targetEntityId).toBe(note.id)
      expect(links.links[0].sourceEntityType).toBe("task-comment")
    })
  })

  describe("Cross-Entity Type Linking", () => {
    it("handles links between different entity types", async () => {
      const note = await createNote(application, "Research Note")
      const project = await createProject(application, "Implementation Project")
      const task = await createTask(application, project, "Implementation Task")

      await entityLinkService.syncEntityLinks(workspaceId, task.id, "task", [
        { target_entity_type: "note", target_entity_id: note.id, link_type: "explicit" },
      ])

      const taskLinksResult = await entityLinkService.getEntityLinks(workspaceId, task.id, "task")
      expect(taskLinksResult.getValue().links.length).toBe(1)
      expect(taskLinksResult.getValue().links[0].targetEntityType).toBe("note")

      const noteLinksResult = await entityLinkService.getEntityLinks(workspaceId, note.id, "note")
      expect(noteLinksResult.getValue().linkedBy.length).toBe(1)
      expect(noteLinksResult.getValue().linkedBy[0].sourceEntityType).toBe("task")
    })

    it("handles bidirectional links between entities", async () => {
      const note1 = await createNote(application, "Note A")
      const note2 = await createNote(application, "Note B")

      await entityLinkService.syncEntityLinks(workspaceId, note1.id, "note", [
        { target_entity_type: "note", target_entity_id: note2.id, link_type: "explicit" },
      ])

      await entityLinkService.syncEntityLinks(workspaceId, note2.id, "note", [
        { target_entity_type: "note", target_entity_id: note1.id, link_type: "explicit" },
      ])

      const note1Links = await entityLinkService.getEntityLinks(workspaceId, note1.id, "note")
      expect(note1Links.getValue().links.length).toBe(1)
      expect(note1Links.getValue().linkedBy.length).toBe(1)
      expect(note1Links.getValue().links[0].targetEntityId).toBe(note2.id)
      expect(note1Links.getValue().linkedBy[0].sourceEntityId).toBe(note2.id)

      const note2Links = await entityLinkService.getEntityLinks(workspaceId, note2.id, "note")
      expect(note2Links.getValue().links.length).toBe(1)
      expect(note2Links.getValue().linkedBy.length).toBe(1)
      expect(note2Links.getValue().links[0].targetEntityId).toBe(note1.id)
      expect(note2Links.getValue().linkedBy[0].sourceEntityId).toBe(note1.id)
    })
  })
})
