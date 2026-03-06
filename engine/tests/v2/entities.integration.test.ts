import { describe, it, expect, beforeEach, afterEach } from "vitest"
import type {
  ClientEntity,
  EntityContent,
  ParentReference,
  ProjectContent,
  ServerEntity,
} from "../../models/entity"
import type { ACLEntry } from "../../models/acl-entry"
import type { AvailableSubjects } from "../../models/team"
import type { EntityType } from "../../utils/encryption-types"
import { GlobalClient } from "../../global/global-client"
import { WorkspaceRuntime } from "../../workspace-runtime/workspace-runtime"
import {
  createApplicationForClient,
  createCollaborativeClientPair,
  createEntityThroughRuntime,
  newClientWithWorkspace,
  waitForCondition,
} from "./helpers"
import {
  ComparisonOperator,
  ExecuteRemoteQuery,
  RemotePredicate,
  RemoteQueryGroup,
} from "../../usecase/entities/entities"
import { SSEEventType } from "../../services/sse-types"

type EntityCrudScenario = {
  label: string
  entityType: EntityType
  createContent: EntityContent
  updateContent: EntityContent
  parentBuilder?: (app: WorkspaceRuntime) => Promise<ClientEntity>
  expectedAclFrom: "none" | "self" | "parent"
}

type CollaborativeRuntimePair = {
  creatorRuntime: WorkspaceRuntime
  viewerRuntime: WorkspaceRuntime
  creatorClient: GlobalClient
  viewerClient: GlobalClient
  viewerUserId: string
  workspaceId: string
}

// ------------------------------
// Shared helpers
// ------------------------------

async function createInitializedWorkspaceRuntimeForClient(
  client: GlobalClient,
  workspaceId: string
): Promise<WorkspaceRuntime> {
  // Every test gets a fully initialized runtime with remote keys and SSE.
  const runtime = createApplicationForClient(client, workspaceId)
  await runtime.initialize()
  return runtime
}

async function destroyWorkspaceRuntimeAndLogoutUsers(
  runtime: WorkspaceRuntime,
  client: GlobalClient
): Promise<void> {
  // Keep cleanup centralized to avoid subtle test leaks.
  runtime.destroy()
  if (client.getUsersStore().hasUsers()) {
    await client.getLogoutAllAccounts().execute()
  }
}

async function createCollaborativeRuntimePair(): Promise<CollaborativeRuntimePair> {
  // Centralize multi-client setup so ACL tests stay focused on behavior.
  const { client1, client2, user2, workspace } = await createCollaborativeClientPair()
  const creatorRuntime = await createInitializedWorkspaceRuntimeForClient(client1, workspace.uuid)
  const viewerRuntime = await createInitializedWorkspaceRuntimeForClient(client2, workspace.uuid)

  return {
    creatorRuntime,
    viewerRuntime,
    creatorClient: client1,
    viewerClient: client2,
    viewerUserId: user2.uuid,
    workspaceId: workspace.uuid,
  }
}

async function destroyCollaborativeRuntimePair(pair: CollaborativeRuntimePair) {
  // Ensure both runtimes and auth sessions are cleaned up.
  await destroyWorkspaceRuntimeAndLogoutUsers(pair.creatorRuntime, pair.creatorClient)
  await destroyWorkspaceRuntimeAndLogoutUsers(pair.viewerRuntime, pair.viewerClient)
}

function buildEntityIdQuery(entityId: string): RemotePredicate {
  return {
    type: "predicate",
    field: "id",
    operator: "eq",
    value: entityId,
  }
}

function buildWorkspaceScopeQuery(workspaceId: string): RemotePredicate {
  return {
    type: "predicate",
    field: "workspace_id",
    operator: "eq",
    value: workspaceId,
  }
}

function buildPredicate(field: string, operator: ComparisonOperator, value?: unknown): RemotePredicate {
  return {
    type: "predicate",
    field: field as keyof ServerEntity,
    operator,
    ...(value === undefined ? {} : { value }),
  }
}

function buildGroupOrQuery(children: RemotePredicate[]): RemoteQueryGroup {
  return {
    type: "group",
    operator: "or",
    children,
  }
}

async function fetchServerEntitiesThroughRuntime(
  runtime: WorkspaceRuntime,
  query: RemotePredicate | RemoteQueryGroup
): Promise<ServerEntity[]> {
  const executeRemoteQuery = new ExecuteRemoteQuery(runtime.getMakeWorkspaceRequest())
  const queryResult = await executeRemoteQuery.execute(query)
  if (queryResult.isFailed()) {
    throw new Error(`Remote query failed: ${queryResult.getError()}`)
  }
  return queryResult.getValue()
}

async function updateEntityThroughRuntime(
  runtime: WorkspaceRuntime,
  entityId: string,
  content: EntityContent
) {
  const updateResult = await runtime.getUpdateEntity().execute({ id: entityId, content })
  if (updateResult.isFailed()) {
    throw new Error(updateResult.getError())
  }
}

async function updateEntityWithParentThroughRuntime(
  runtime: WorkspaceRuntime,
  entityId: string,
  content: EntityContent,
  newParent: ParentReference
) {
  const updateResult = await runtime.getUpdateEntity().execute({
    id: entityId,
    content,
    parentUpdate: { mode: "set", parent: newParent },
  })
  if (updateResult.isFailed()) {
    throw new Error(updateResult.getError())
  }
}

async function deleteEntityThroughRuntime(runtime: WorkspaceRuntime, entityId: string) {
  const deleteResult = await runtime.getDeleteEntity().execute(entityId)
  if (deleteResult.isFailed()) {
    throw new Error(deleteResult.getError())
  }
}

async function decryptServerEntityThroughRuntime(runtime: WorkspaceRuntime, serverEntity: ServerEntity) {
  const decryptEntity = runtime.getDecryptEntityWithKeyLookup()
  const decryptResult = decryptEntity.execute(serverEntity)
  if (decryptResult.isFailed()) {
    throw new Error(decryptResult.getError())
  }
  return decryptResult.getValue()
}

function doesContentContainExpectedFields(expected: EntityContent, actual: EntityContent): boolean {
  const actualValues = new Map(Object.entries(actual))
  for (const [key, value] of Object.entries(expected)) {
    if (actualValues.get(key) !== value) {
      return false
    }
  }
  return true
}

async function waitForServerEntityContentMatch(
  runtime: WorkspaceRuntime,
  entityId: string,
  expectedContent: EntityContent
): Promise<ServerEntity> {
  let resolvedServerEntity: ServerEntity | null = null

  await waitForCondition(async () => {
    const entities = await fetchServerEntitiesThroughRuntime(runtime, buildEntityIdQuery(entityId))
    if (entities.length !== 1) {
      return false
    }
    const decryptedEntity = await decryptServerEntityThroughRuntime(runtime, entities[0])
    if (!doesContentContainExpectedFields(expectedContent, decryptedEntity.content)) {
      return false
    }
    resolvedServerEntity = entities[0]
    return true
  })

  if (!resolvedServerEntity) {
    throw new Error("Expected server entity was not found after waiting for content update")
  }

  return resolvedServerEntity
}

async function waitForServerEntityParentMatch(
  runtime: WorkspaceRuntime,
  entityId: string,
  expectedParentId?: string
): Promise<ServerEntity> {
  let resolvedServerEntity: ServerEntity | null = null

  await waitForCondition(async () => {
    const entities = await fetchServerEntitiesThroughRuntime(runtime, buildEntityIdQuery(entityId))
    if (entities.length !== 1) {
      return false
    }
    const serverEntity = entities[0]
    if (expectedParentId) {
      if (serverEntity.parent_id !== expectedParentId) {
        return false
      }
    } else if (serverEntity.parent_id) {
      return false
    }

    resolvedServerEntity = serverEntity
    return true
  })

  if (!resolvedServerEntity) {
    throw new Error("Expected server entity was not found after waiting for parent update")
  }

  return resolvedServerEntity
}

async function waitForCachedEntityMatch(
  runtime: WorkspaceRuntime,
  entityId: string,
  expectedContent?: EntityContent
): Promise<ClientEntity> {
  let resolvedEntity: ClientEntity | null = null

  await waitForCondition(() => {
    const cachedEntity = runtime.getCacheStores().entityStore.get(entityId)
    if (!cachedEntity) {
      return false
    }

    if (expectedContent && !doesContentContainExpectedFields(expectedContent, cachedEntity.content)) {
      return false
    }

    resolvedEntity = cachedEntity
    return true
  })

  if (!resolvedEntity) {
    throw new Error("Expected cached entity was not found after waiting for SSE update")
  }

  return resolvedEntity
}

async function waitForSseConnection(runtime: WorkspaceRuntime) {
  await waitForCondition(() => runtime.getSSEConnectionManager().getIsConnected(), 10000, 100)
}

function subscribeForEntitySseEvent(
  runtime: WorkspaceRuntime,
  eventType: SSEEventType.ENTITY_CREATED | SSEEventType.ENTITY_UPDATED,
  matcher: (entity: ServerEntity) => boolean
) {
  let matchedEntity: ServerEntity | null = null
  const unsubscribe = runtime.getSSEConnectionManager().subscribe({
    eventTypes: [eventType],
    handler: event => {
      if (event.type !== eventType) {
        return
      }
      const entity = event.data as ServerEntity
      if (matcher(entity)) {
        matchedEntity = entity
      }
    },
  })

  return {
    getMatchedEntity: () => matchedEntity,
    unsubscribe,
  }
}

async function createFolderParentPair(runtime: WorkspaceRuntime, label: string) {
  const firstParent = await createEntityThroughRuntime(runtime, {
    entityType: "folder",
    content: { name: `${label} Parent A` },
  })

  const secondParent = await createEntityThroughRuntime(runtime, {
    entityType: "folder",
    content: { name: `${label} Parent B` },
  })

  return { firstParent, secondParent }
}

async function createEntityAclEntry(
  runtime: WorkspaceRuntime,
  entityId: string,
  subjectId: string,
  permission: "read" | "write" | "admin"
) {
  const createAclEntry = runtime.getCreateEntityACLEntry()
  const aclResult = await createAclEntry.execute({
    entityId,
    subjectType: "user",
    subjectId,
    permission,
  })
  if (aclResult.isFailed()) {
    throw new Error(aclResult.getError())
  }
  return aclResult.getValue()
}

async function getEntityAclEntries(runtime: WorkspaceRuntime, entityId: string): Promise<ACLEntry[]> {
  const getAclEntries = runtime.getGetEntityACLEntries()
  const entriesResult = await getAclEntries.execute({ entityId })
  if (entriesResult.isFailed()) {
    throw new Error(entriesResult.getError())
  }
  return entriesResult.getValue()
}

async function updateEntityAclEntry(
  runtime: WorkspaceRuntime,
  entityId: string,
  entryId: string,
  permission: "read" | "write" | "admin"
): Promise<ACLEntry> {
  const updateAclEntry = runtime.getUpdateEntityACLEntry()
  const updateResult = await updateAclEntry.execute({ entityId, entryId, permission })
  if (updateResult.isFailed()) {
    throw new Error(updateResult.getError())
  }
  return updateResult.getValue()
}

async function deleteEntityAclEntry(
  runtime: WorkspaceRuntime,
  entityId: string,
  entryId: string
): Promise<void> {
  const deleteAclEntry = runtime.getDeleteEntityACLEntry()
  const deleteResult = await deleteAclEntry.execute({ entityId, entryId })
  if (deleteResult.isFailed()) {
    throw new Error(deleteResult.getError())
  }
}

async function getEntityAclMemberCount(runtime: WorkspaceRuntime, entityId: string): Promise<number> {
  const getMemberCount = runtime.getGetEntityACLMemberCount()
  const countResult = await getMemberCount.execute({ entityId })
  if (countResult.isFailed()) {
    throw new Error(countResult.getError())
  }
  return countResult.getValue()
}

async function getAvailableSubjectsForEntity(
  runtime: WorkspaceRuntime,
  entityId: string
): Promise<AvailableSubjects> {
  const getAvailableSubjects = runtime.getGetAvailableSubjectsForEntity()
  const subjectsResult = await getAvailableSubjects.execute({ entityId })
  if (subjectsResult.isFailed()) {
    throw new Error(subjectsResult.getError())
  }
  return subjectsResult.getValue()
}

async function expectEntityVisibilityForRuntime(
  runtime: WorkspaceRuntime,
  entityId: string,
  expectedCount: number
) {
  const entities = await fetchServerEntitiesThroughRuntime(runtime, buildEntityIdQuery(entityId))
  expect(entities).toHaveLength(expectedCount)
}

// ------------------------------------------------------------
// CRUD
// ------------------------------------------------------------

describe("Entity CRUD Integration Tests", () => {
  let client: GlobalClient
  let runtime: WorkspaceRuntime
  let workspaceId: string

  beforeEach(async () => {
    const result = await newClientWithWorkspace("entity-crud")
    client = result.client
    workspaceId = result.workspace.uuid
    runtime = await createInitializedWorkspaceRuntimeForClient(client, workspaceId)
  })

  afterEach(async () => {
    try {
      await destroyWorkspaceRuntimeAndLogoutUsers(runtime, client)
    } catch {
      // Ignore cleanup errors
    }
  })

  const crudScenarios: EntityCrudScenario[] = [
    {
      label: "note (creator-only)",
      entityType: "note",
      createContent: { title: "Entity CRUD Note", text: "Initial body" },
      updateContent: { title: "Entity CRUD Note (Updated)", text: "Updated body" },
      expectedAclFrom: "none",
    },
    {
      label: "project (ACL root)",
      entityType: "project",
      createContent: { name: "Entity CRUD Project" },
      updateContent: { name: "Entity CRUD Project (Updated)" },
      expectedAclFrom: "self",
    },
    {
      label: "task (parent required)",
      entityType: "task",
      createContent: { title: "Entity CRUD Task", status: "backlog" },
      updateContent: { title: "Entity CRUD Task (Updated)", status: "in_progress" },
      expectedAclFrom: "parent",
      parentBuilder: async app =>
        createEntityThroughRuntime(app, {
          entityType: "project",
          content: { name: "Entity CRUD Task Parent" },
        }),
    },
  ]

  for (const scenario of crudScenarios) {
    it(`should create, update, and delete ${scenario.label}`, async () => {
      // Ensure any required parent exists and is usable for ACL inheritance.
      const parentEntity = scenario.parentBuilder ? await scenario.parentBuilder(runtime) : undefined

      const createdEntity = await createEntityThroughRuntime(runtime, {
        entityType: scenario.entityType,
        content: scenario.createContent,
        parent: parentEntity,
      })

      const createdServerEntities = await fetchServerEntitiesThroughRuntime(
        runtime,
        buildEntityIdQuery(createdEntity.id)
      )
      expect(createdServerEntities).toHaveLength(1)

      const createdServerEntity = createdServerEntities[0]
      if (parentEntity) {
        expect(createdServerEntity.parent_id).toBe(parentEntity.id)
        expect(createdServerEntity.parent_type).toBe(parentEntity.entityType)
      } else {
        expect(createdServerEntity.parent_id).toBeUndefined()
        expect(createdServerEntity.parent_type).toBeUndefined()
      }

      switch (scenario.expectedAclFrom) {
        case "none":
          expect(createdServerEntity.acl_from_id).toBeUndefined()
          expect(createdServerEntity.acl_from_type).toBeUndefined()
          break
        case "self":
          expect(createdServerEntity.acl_from_id).toBe(createdEntity.id)
          expect(createdServerEntity.acl_from_type).toBe(scenario.entityType)
          break
        case "parent":
          if (!parentEntity) {
            throw new Error("parent entity is required for expectedAclFrom=parent")
          }
          expect(createdServerEntity.acl_from_id).toBe(parentEntity.id)
          expect(createdServerEntity.acl_from_type).toBe(parentEntity.entityType)
          break
      }

      const decryptedCreatedEntity = await decryptServerEntityThroughRuntime(runtime, createdServerEntity)
      expect(decryptedCreatedEntity.content).toEqual(expect.objectContaining(scenario.createContent))

      await updateEntityThroughRuntime(runtime, createdEntity.id, scenario.updateContent)

      const updatedServerEntity = await waitForServerEntityContentMatch(
        runtime,
        createdEntity.id,
        scenario.updateContent
      )
      const decryptedUpdatedEntity = await decryptServerEntityThroughRuntime(runtime, updatedServerEntity)
      expect(decryptedUpdatedEntity.content).toEqual(expect.objectContaining(scenario.updateContent))

      await deleteEntityThroughRuntime(runtime, createdEntity.id)

      const deletedServerEntities = await fetchServerEntitiesThroughRuntime(
        runtime,
        buildEntityIdQuery(createdEntity.id)
      )
      expect(deletedServerEntities).toHaveLength(0)
    })
  }
})

// ------------------------------------------------------------
// Access control
// ------------------------------------------------------------

describe("Entity Access Control Integration Tests", () => {
  let creatorRuntime: WorkspaceRuntime
  let viewerRuntime: WorkspaceRuntime
  let viewerUserId: string
  let runtimePair: CollaborativeRuntimePair

  beforeEach(async () => {
    runtimePair = await createCollaborativeRuntimePair()
    creatorRuntime = runtimePair.creatorRuntime
    viewerRuntime = runtimePair.viewerRuntime
    viewerUserId = runtimePair.viewerUserId
  })

  afterEach(async () => {
    try {
      await destroyCollaborativeRuntimePair(runtimePair)
    } catch {
      // Ignore cleanup errors
    }
  })

  it("should restrict notes to the creator", async () => {
    const createdEntity = await createEntityThroughRuntime(creatorRuntime, {
      entityType: "note",
      content: { title: "Creator Note", text: "Private text" },
    })

    await expectEntityVisibilityForRuntime(creatorRuntime, createdEntity.id, 1)
    await expectEntityVisibilityForRuntime(viewerRuntime, createdEntity.id, 0)
  })

  it("should allow direct-message access for the recipient only", async () => {
    const creatorUserId = creatorRuntime.getAccountStore().getUserId()

    const messageToViewer = await createEntityThroughRuntime(creatorRuntime, {
      entityType: "direct-message",
      content: { text: "hello from sender" },
      metaFields: { recipient_id: viewerUserId },
    })

    const messageToCreator = await createEntityThroughRuntime(creatorRuntime, {
      entityType: "direct-message",
      content: { text: "self-message for access check" },
      metaFields: { recipient_id: creatorUserId },
    })

    await expectEntityVisibilityForRuntime(creatorRuntime, messageToViewer.id, 1)
    await expectEntityVisibilityForRuntime(viewerRuntime, messageToViewer.id, 1)

    await expectEntityVisibilityForRuntime(creatorRuntime, messageToCreator.id, 1)
    await expectEntityVisibilityForRuntime(viewerRuntime, messageToCreator.id, 0)
  })

  it("should restrict ACL-backed entities without explicit grants", async () => {
    const createdEntity = await createEntityThroughRuntime(creatorRuntime, {
      entityType: "project",
      content: { name: "Entity ACL Project" },
    })

    await expectEntityVisibilityForRuntime(creatorRuntime, createdEntity.id, 1)
    await expectEntityVisibilityForRuntime(viewerRuntime, createdEntity.id, 0)
  })

  it("should allow access once an ACL entry is created for the entity", async () => {
    const createdEntity = await createEntityThroughRuntime(creatorRuntime, {
      entityType: "project",
      content: { name: "Entity ACL Shared Project" },
    })

    await createEntityAclEntry(creatorRuntime, createdEntity.id, viewerUserId, "read")
    await expectEntityVisibilityForRuntime(viewerRuntime, createdEntity.id, 1)
  })

  it("should inherit ACL from the parent entity", async () => {
    const parentProject = await createEntityThroughRuntime(creatorRuntime, {
      entityType: "project",
      content: { name: "Entity ACL Parent Project" },
    })

    const childTask = await createEntityThroughRuntime(creatorRuntime, {
      entityType: "task",
      content: { title: "Entity ACL Child Task", status: "backlog" },
      parent: parentProject,
    })

    await expectEntityVisibilityForRuntime(viewerRuntime, childTask.id, 0)
    await createEntityAclEntry(creatorRuntime, parentProject.id, viewerUserId, "read")
    await expectEntityVisibilityForRuntime(viewerRuntime, childTask.id, 1)
  })
})

// ------------------------------------------------------------
// ACL Lifecycle
// ------------------------------------------------------------

describe("Entity ACL Lifecycle Integration Tests", () => {
  let creatorRuntime: WorkspaceRuntime
  let viewerRuntime: WorkspaceRuntime
  let viewerUserId: string
  let runtimePair: CollaborativeRuntimePair

  beforeEach(async () => {
    runtimePair = await createCollaborativeRuntimePair()
    creatorRuntime = runtimePair.creatorRuntime
    viewerRuntime = runtimePair.viewerRuntime
    viewerUserId = runtimePair.viewerUserId
  })

  afterEach(async () => {
    try {
      await destroyCollaborativeRuntimePair(runtimePair)
    } catch {
      // Ignore cleanup errors
    }
  })

  it("should manage ACL entries end-to-end for an entity", async () => {
    const project = await createEntityThroughRuntime(creatorRuntime, {
      entityType: "project",
      content: { name: "ACL Lifecycle Project" },
    })

    const availableSubjects = await getAvailableSubjectsForEntity(creatorRuntime, project.id)
    const availableMemberIds = availableSubjects.members.map(member => member.userId)
    expect(availableMemberIds).toContain(viewerUserId)

    const createdEntry = await createEntityAclEntry(creatorRuntime, project.id, viewerUserId, "read")
    expect(createdEntry.subjectId).toBe(viewerUserId)
    expect(createdEntry.permission).toBe("read")

    const entriesAfterCreate = await getEntityAclEntries(creatorRuntime, project.id)
    const entryIds = entriesAfterCreate.map(entry => entry.subjectId)
    expect(entryIds).toContain(viewerUserId)

    const memberCount = await getEntityAclMemberCount(creatorRuntime, project.id)
    expect(memberCount).toBe(2)

    const updatedEntry = await updateEntityAclEntry(creatorRuntime, project.id, createdEntry.id, "write")
    expect(updatedEntry.permission).toBe("write")

    await deleteEntityAclEntry(creatorRuntime, project.id, createdEntry.id)

    const entriesAfterDelete = await getEntityAclEntries(creatorRuntime, project.id)
    const remainingSubjectIds = entriesAfterDelete.map(entry => entry.subjectId)
    expect(remainingSubjectIds).not.toContain(viewerUserId)

    await expectEntityVisibilityForRuntime(viewerRuntime, project.id, 0)
  })

  it("should resolve ACL operations through a child entity", async () => {
    const parentProject = await createEntityThroughRuntime(creatorRuntime, {
      entityType: "project",
      content: { name: "ACL Root Project" },
    })

    const childTask = await createEntityThroughRuntime(creatorRuntime, {
      entityType: "task",
      content: { title: "ACL Root Task", status: "backlog" },
      parent: parentProject,
    })

    await createEntityAclEntry(creatorRuntime, childTask.id, viewerUserId, "read")

    const entries = await getEntityAclEntries(creatorRuntime, childTask.id)
    const entrySubjectIds = entries.map(entry => entry.subjectId)
    expect(entrySubjectIds).toContain(viewerUserId)

    await expectEntityVisibilityForRuntime(viewerRuntime, parentProject.id, 1)
    await expectEntityVisibilityForRuntime(viewerRuntime, childTask.id, 1)
  })
})

// ------------------------------------------------------------
// SSE
// ------------------------------------------------------------

describe("Entity SSE Integration Tests", () => {
  let creatorRuntime: WorkspaceRuntime
  let viewerRuntime: WorkspaceRuntime
  let viewerUserId: string
  let runtimePair: CollaborativeRuntimePair

  beforeEach(async () => {
    runtimePair = await createCollaborativeRuntimePair()
    creatorRuntime = runtimePair.creatorRuntime
    viewerRuntime = runtimePair.viewerRuntime
    viewerUserId = runtimePair.viewerUserId

    await waitForSseConnection(creatorRuntime)
    await waitForSseConnection(viewerRuntime)
  })

  afterEach(async () => {
    try {
      await destroyCollaborativeRuntimePair(runtimePair)
    } catch {
      // Ignore cleanup errors
    }
  })

  it("should deliver entity_created SSE when access is granted via ACL", async () => {
    const project = await createEntityThroughRuntime(creatorRuntime, {
      entityType: "project",
      content: { name: "SSE ACL Project" },
    })

    const subscription = subscribeForEntitySseEvent(
      viewerRuntime,
      SSEEventType.ENTITY_CREATED,
      entity => entity.id === project.id
    )

    await createEntityAclEntry(creatorRuntime, project.id, viewerUserId, "read")

    await waitForCondition(() => subscription.getMatchedEntity() !== null, 10000, 100)
    const matchedEntity = subscription.getMatchedEntity()
    subscription.unsubscribe()

    expect(matchedEntity).not.toBeNull()
    expect(matchedEntity?.id).toBe(project.id)
    expect(matchedEntity?.entity_type).toBe("project")

    const cachedEntity = await waitForCachedEntityMatch(viewerRuntime, project.id, project.content)
    const projectContent = cachedEntity.content as ProjectContent
    expect(projectContent.name).toBe(project.content.name)
  })

  it("should deliver entity_updated SSE to collaborators with access", async () => {
    const project = await createEntityThroughRuntime(creatorRuntime, {
      entityType: "project",
      content: { name: "SSE Update Project" },
    })

    await createEntityAclEntry(creatorRuntime, project.id, viewerUserId, "read")

    await waitForCachedEntityMatch(viewerRuntime, project.id, project.content)

    const subscription = subscribeForEntitySseEvent(
      viewerRuntime,
      SSEEventType.ENTITY_UPDATED,
      entity => entity.id === project.id
    )

    await updateEntityThroughRuntime(creatorRuntime, project.id, { name: "SSE Update Project (Updated)" })

    await waitForCondition(() => subscription.getMatchedEntity() !== null, 10000, 100)
    const matchedEntity = subscription.getMatchedEntity()
    subscription.unsubscribe()

    expect(matchedEntity).not.toBeNull()
    expect(matchedEntity?.id).toBe(project.id)
    expect(matchedEntity?.entity_type).toBe("project")

    const cachedEntity = await waitForCachedEntityMatch(viewerRuntime, project.id, {
      name: "SSE Update Project (Updated)",
    })
    const projectContent = cachedEntity.content as ProjectContent
    expect(projectContent.name).toBe("SSE Update Project (Updated)")
  })
})

// ------------------------------------------------------------
// Parent Changes
// ------------------------------------------------------------

describe("Entity Parent Change Integration Tests", () => {
  let client: GlobalClient
  let runtime: WorkspaceRuntime
  let workspaceId: string

  beforeEach(async () => {
    const result = await newClientWithWorkspace("entity-parent-change")
    client = result.client
    workspaceId = result.workspace.uuid
    runtime = await createInitializedWorkspaceRuntimeForClient(client, workspaceId)
  })

  afterEach(async () => {
    try {
      await destroyWorkspaceRuntimeAndLogoutUsers(runtime, client)
    } catch {
      // Ignore cleanup errors
    }
  })

  const allowedParentChangeScenarios: Array<{
    label: string
    entityType: EntityType
    createContent: EntityContent
    updateContent: EntityContent
  }> = [
    {
      label: "paper",
      entityType: "paper",
      createContent: { name: "Paper in Parent A", text: "Paper body" },
      updateContent: { name: "Paper in Parent B", text: "Paper body updated" },
    },
    {
      label: "file",
      entityType: "file",
      createContent: { name: "File in Parent A", mimeType: "text/plain" },
      updateContent: { name: "File in Parent B", mimeType: "text/plain" },
    },
    {
      label: "folder",
      entityType: "folder",
      createContent: { name: "Folder in Parent A" },
      updateContent: { name: "Folder in Parent B" },
    },
  ]

  for (const scenario of allowedParentChangeScenarios) {
    it(`should allow parent changes for ${scenario.label}`, async () => {
      const { firstParent, secondParent } = await createFolderParentPair(runtime, scenario.label)

      const childEntity = await createEntityThroughRuntime(runtime, {
        entityType: scenario.entityType,
        content: scenario.createContent,
        parent: firstParent,
      })

      await updateEntityWithParentThroughRuntime(runtime, childEntity.id, scenario.updateContent, {
        id: secondParent.id,
        type: secondParent.entityType,
      })

      const updatedServerEntity = await waitForServerEntityParentMatch(
        runtime,
        childEntity.id,
        secondParent.id
      )
      expect(updatedServerEntity.parent_id).toBe(secondParent.id)
      expect(updatedServerEntity.parent_type).toBe(secondParent.entityType)
      expect(updatedServerEntity.acl_from_id).toBe(secondParent.id)
      expect(updatedServerEntity.acl_from_type).toBe(secondParent.entityType)
    })
  }

  it("should ignore parent changes for non-movable entity types", async () => {
    const { firstParent } = await createFolderParentPair(runtime, "NonMovable")

    const project = await createEntityThroughRuntime(runtime, {
      entityType: "project",
      content: { name: "NonMovable Project" },
    })

    await updateEntityWithParentThroughRuntime(
      runtime,
      project.id,
      { name: "NonMovable Project Updated" },
      {
        id: firstParent.id,
        type: firstParent.entityType,
      }
    )

    const serverEntity = await waitForServerEntityParentMatch(runtime, project.id, undefined)
    expect(serverEntity.parent_id).toBeUndefined()
    expect(serverEntity.parent_type).toBeUndefined()
    expect(serverEntity.acl_from_id).toBe(project.id)
    expect(serverEntity.acl_from_type).toBe("project")
  })
})

// ------------------------------------------------------------
// Query
// ------------------------------------------------------------

describe("Entity Query Integration Tests", () => {
  let creatorRuntime: WorkspaceRuntime
  let viewerRuntime: WorkspaceRuntime
  let viewerUserId: string
  let workspaceId: string
  let runtimePair: CollaborativeRuntimePair

  beforeEach(async () => {
    runtimePair = await createCollaborativeRuntimePair()
    creatorRuntime = runtimePair.creatorRuntime
    viewerRuntime = runtimePair.viewerRuntime
    viewerUserId = runtimePair.viewerUserId
    workspaceId = runtimePair.workspaceId
  })

  afterEach(async () => {
    try {
      await destroyCollaborativeRuntimePair(runtimePair)
    } catch {
      // Ignore cleanup errors
    }
  })

  it("should filter query results by access rules", async () => {
    const creatorNote = await createEntityThroughRuntime(creatorRuntime, {
      entityType: "note",
      content: { title: "Creator Only Note", text: "Not shareable" },
    })

    const sharedProject = await createEntityThroughRuntime(creatorRuntime, {
      entityType: "project",
      content: { name: "Shared Project" },
    })

    const privateProject = await createEntityThroughRuntime(creatorRuntime, {
      entityType: "project",
      content: { name: "Private Project" },
    })

    const directMessage = await createEntityThroughRuntime(creatorRuntime, {
      entityType: "direct-message",
      content: { text: "hello from query test" },
      metaFields: { recipient_id: viewerUserId },
    })

    await createEntityAclEntry(creatorRuntime, sharedProject.id, viewerUserId, "read")

    const creatorEntities = await fetchServerEntitiesThroughRuntime(
      creatorRuntime,
      buildWorkspaceScopeQuery(workspaceId)
    )
    const creatorEntityIds = creatorEntities.map(entity => entity.id)
    expect(creatorEntityIds).toEqual(
      expect.arrayContaining([creatorNote.id, sharedProject.id, privateProject.id, directMessage.id])
    )

    const viewerEntities = await fetchServerEntitiesThroughRuntime(
      viewerRuntime,
      buildWorkspaceScopeQuery(workspaceId)
    )
    const viewerEntityIds = viewerEntities.map(entity => entity.id)

    expect(viewerEntityIds).toEqual(expect.arrayContaining([sharedProject.id, directMessage.id]))
    expect(viewerEntityIds).not.toEqual(expect.arrayContaining([creatorNote.id, privateProject.id]))
  })

  it("should support grouped OR queries", async () => {
    const firstEntity = await createEntityThroughRuntime(creatorRuntime, {
      entityType: "project",
      content: { name: "Group Query Project" },
    })

    const secondEntity = await createEntityThroughRuntime(creatorRuntime, {
      entityType: "note",
      content: { title: "Group Query Note", text: "Grouped query text" },
    })

    const groupQuery = buildGroupOrQuery([
      buildEntityIdQuery(firstEntity.id),
      buildEntityIdQuery(secondEntity.id),
    ])

    const queryResults = await fetchServerEntitiesThroughRuntime(creatorRuntime, groupQuery)
    const resultIds = queryResults.map(entity => entity.id)
    expect(resultIds).toEqual(expect.arrayContaining([firstEntity.id, secondEntity.id]))
  })
})

// ------------------------------------------------------------
// Query Operators
// ------------------------------------------------------------

describe("Entity Query Operator Integration Tests", () => {
  let client: GlobalClient
  let runtime: WorkspaceRuntime
  let workspaceId: string
  let fixture: {
    note: ClientEntity
    project: ClientEntity
    task: ClientEntity
  }

  beforeEach(async () => {
    const result = await newClientWithWorkspace("entity-query-ops")
    client = result.client
    workspaceId = result.workspace.uuid
    runtime = await createInitializedWorkspaceRuntimeForClient(client, workspaceId)

    const note = await createEntityThroughRuntime(runtime, {
      entityType: "note",
      content: { title: "Query Ops Note", text: "Query ops content" },
    })

    const project = await createEntityThroughRuntime(runtime, {
      entityType: "project",
      content: { name: "Query Ops Project" },
    })

    const task = await createEntityThroughRuntime(runtime, {
      entityType: "task",
      content: { title: "Query Ops Task", status: "backlog" },
      parent: project,
    })

    fixture = { note, project, task }
  })

  afterEach(async () => {
    try {
      await destroyWorkspaceRuntimeAndLogoutUsers(runtime, client)
    } catch {
      // Ignore cleanup errors
    }
  })

  it("should support ne operator", async () => {
    const query = buildPredicate("entity_type", "ne", "note")
    const results = await fetchServerEntitiesThroughRuntime(runtime, query)
    const resultIds = results.map(entity => entity.id)

    expect(resultIds).toContain(fixture.project.id)
    expect(resultIds).toContain(fixture.task.id)
    expect(resultIds).not.toContain(fixture.note.id)
  })

  it("should support in operator", async () => {
    const query = buildPredicate("id", "in", [fixture.note.id, fixture.project.id])
    const results = await fetchServerEntitiesThroughRuntime(runtime, query)
    const resultIds = results.map(entity => entity.id)

    expect(resultIds).toContain(fixture.note.id)
    expect(resultIds).toContain(fixture.project.id)
    expect(resultIds).not.toContain(fixture.task.id)
  })

  it("should support not_in operator", async () => {
    const query = buildPredicate("id", "not_in", [fixture.note.id])
    const results = await fetchServerEntitiesThroughRuntime(runtime, query)
    const resultIds = results.map(entity => entity.id)

    expect(resultIds).toContain(fixture.project.id)
    expect(resultIds).toContain(fixture.task.id)
    expect(resultIds).not.toContain(fixture.note.id)
  })

  it("should support is_null and is_not_null operators", async () => {
    const rootQuery = buildPredicate("parent_id", "is_null")
    const rootResults = await fetchServerEntitiesThroughRuntime(runtime, rootQuery)
    const rootIds = rootResults.map(entity => entity.id)
    expect(rootIds).toContain(fixture.note.id)
    expect(rootIds).toContain(fixture.project.id)
    expect(rootIds).not.toContain(fixture.task.id)

    const childQuery = buildPredicate("parent_id", "is_not_null")
    const childResults = await fetchServerEntitiesThroughRuntime(runtime, childQuery)
    const childIds = childResults.map(entity => entity.id)
    expect(childIds).toContain(fixture.task.id)
    expect(childIds).not.toContain(fixture.note.id)
    expect(childIds).not.toContain(fixture.project.id)
  })

  it("should support grouped AND queries", async () => {
    const groupQuery: RemoteQueryGroup = {
      type: "group",
      operator: "and",
      children: [buildPredicate("entity_type", "eq", "project"), buildPredicate("parent_id", "is_null")],
    }

    const results = await fetchServerEntitiesThroughRuntime(runtime, groupQuery)
    const resultIds = results.map(entity => entity.id)
    expect(resultIds).toContain(fixture.project.id)
    expect(resultIds).not.toContain(fixture.note.id)
    expect(resultIds).not.toContain(fixture.task.id)
  })
})
