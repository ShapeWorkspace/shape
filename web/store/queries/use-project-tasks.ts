import { useEffect, useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import type {
  ClientEntity,
  DecryptedProjectTask,
  ProjectTaskMetaFields,
  TaskStatus,
  ServerBlock,
} from "@shape/engine/models/entity"
import type { QueryEntitiesAndCache } from "../../../engine/usecase/entities/entities"
import { useEngineStore } from "../engine-store"
import { queryKeys } from "./query-keys"

function isProjectTaskEntity(entity: ClientEntity): entity is DecryptedProjectTask {
  return entity.entityType === "task"
}

type EntityQueryNode = Parameters<QueryEntitiesAndCache["execute"]>[0]

function buildProjectTasksQuery(projectId: string): EntityQueryNode {
  return {
    type: "group",
    operator: "and",
    children: [
      {
        type: "predicate",
        field: "entity_type",
        operator: "eq",
        value: "task",
      },
      {
        type: "predicate",
        field: "parent_id",
        operator: "eq",
        value: projectId,
      },
    ],
  }
}

/**
 * Query hook for fetching all tasks for a project.
 *
 * Architecture: Entity cache is the source of truth.
 * - Data comes from the project task index via useState + subscription
 * - React Query only manages async state (loading, error, refetch)
 */
export function useProjectTasks(projectId: string) {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [tasks, setTasks] = useState<DecryptedProjectTask[]>(() => {
    if (!cacheStores || !projectId) return []
    return cacheStores.projectTaskIndex.get(projectId).filter(isProjectTaskEntity)
  })

  useEffect(() => {
    if (!cacheStores || !projectId) return
    const unsubscribe = cacheStores.projectTaskIndex.subscribe(projectId, updatedTasks => {
      setTasks(updatedTasks.filter(isProjectTaskEntity))
    })
    return unsubscribe
  }, [cacheStores, projectId])

  useEffect(() => {
    if (!cacheStores || !projectId) {
      setTasks([])
      return
    }
    setTasks(cacheStores.projectTaskIndex.get(projectId).filter(isProjectTaskEntity))
  }, [cacheStores, projectId])

  const { isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.projectTasks.byProject(workspaceId, projectId),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }

      const queryEntities = application.getQueryEntities()
      const result = await queryEntities.execute(buildProjectTasksQuery(projectId))
      if (result.isFailed()) {
        throw new Error(result.getError())
      }
      return null
    },
    enabled:
      !!globalClient &&
      !!application &&
      !!projectId &&
      application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })

  return {
    data: tasks,
    isLoading: isLoading && tasks.length === 0,
    isFetching,
    isError,
    error,
    refetch,
  }
}

/**
 * Query hook for fetching a single task by ID.
 */
export function useProjectTask(projectId: string, taskId: string) {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [task, setTask] = useState<DecryptedProjectTask | null>(() => {
    if (!cacheStores || !taskId) return null
    const cached = cacheStores.entityStore.get(taskId)
    return cached && isProjectTaskEntity(cached) ? cached : null
  })

  useEffect(() => {
    if (!cacheStores || !projectId) return
    const unsubscribe = cacheStores.projectTaskIndex.subscribe(projectId, updatedTasks => {
      const found = updatedTasks.find(t => t.id === taskId)
      setTask(found && isProjectTaskEntity(found) ? found : null)
    })
    return unsubscribe
  }, [cacheStores, projectId, taskId])

  useEffect(() => {
    if (!cacheStores || !taskId) {
      setTask(null)
      return
    }
    const cached = cacheStores.entityStore.get(taskId)
    setTask(cached && isProjectTaskEntity(cached) ? cached : null)
  }, [cacheStores, projectId, taskId])

  const { isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.projectTasks.detail(workspaceId, projectId, taskId),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }

      const queryEntity = application.getQueryEntityById()
      const result = await queryEntity.execute(taskId)
      if (result.isFailed()) {
        throw new Error(result.getError())
      }
      return null
    },
    enabled:
      !!globalClient &&
      !!application &&
      !!projectId &&
      !!taskId &&
      application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })

  return {
    data: task,
    isLoading: isLoading && !task,
    isError,
    error,
    refetch,
  }
}

/**
 * Options for creating a task.
 */
interface CreateTaskOptions {
  projectId: string
  title: string
  projectTagId?: string | null
}

/**
 * Mutation hook for creating a new project task.
 * Entity drafts + cache updates are handled by the engine.
 */
export function useCreateProjectTask() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ projectId, title, projectTagId }: CreateTaskOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      // Fetch parent project entity for key derivation
      const parentResult = await application.getGetOrFetchEntity().execute(projectId)
      if (parentResult.isFailed()) {
        throw new Error(parentResult.getError())
      }

      const metaFields: ProjectTaskMetaFields = {}
      if (projectTagId) {
        metaFields.project_tag_id = projectTagId
      }

      const createEntity = application.getCreateEntity()
      const result = await createEntity.execute({
        entityType: "task",
        parent: parentResult.getValue(),
        content: { title, status: "backlog" as const },
        metaFields,
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return result.getValue()
    },
    // Allow draft-backed creation while offline.
    networkMode: "always",
  })
}

/**
 * Options for updating a task.
 */
interface UpdateTaskOptions {
  projectId: string
  taskId: string
  updates: {
    content?: {
      title?: string
      status?: TaskStatus
    }
    metaFields?: {
      project_tag_id?: string | null
      assignee_id?: string | null
      due_date?: string | null
    }
  }
}

/**
 * Mutation hook for updating an existing project task.
 * Entity drafts + cache updates are handled by the engine.
 */
export function useUpdateProjectTask() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ taskId, updates }: UpdateTaskOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const cacheStores = application.getCacheStores()
      const cached = cacheStores.entityStore.get(taskId)
      if (!cached || !isProjectTaskEntity(cached)) {
        throw new Error("Task not found in cache")
      }

      // Merge content: keep existing values for fields not being updated
      const content = {
        title: updates.content?.title ?? cached.content.title,
        status: updates.content?.status ?? cached.content.status,
      }

      const updateEntity = application.getUpdateEntity()
      const result = await updateEntity.execute({
        id: taskId,
        content,
        metaFields: updates.metaFields as Partial<ProjectTaskMetaFields>,
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return result.getValue()
    },
    // Ensure updates persist as drafts when offline.
    networkMode: "always",
  })
}

/**
 * Options for updating task mentions.
 */
interface UpdateTaskMentionsOptions {
  projectId: string
  taskId: string
  mentionedUserIds: string[]
}

/**
 * Mutation hook for sending task mention updates.
 * This updates the mentioned_user_ids on the entity via UpdateEntity.
 */
export function useUpdateProjectTaskMentions() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ taskId, mentionedUserIds }: UpdateTaskMentionsOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const cacheStores = application.getCacheStores()
      const cached = cacheStores.entityStore.get(taskId)
      if (!cached || !isProjectTaskEntity(cached)) {
        throw new Error("Task not found in cache")
      }

      const updateEntity = application.getUpdateEntity()
      const result = await updateEntity.execute({
        id: taskId,
        content: cached.content,
        mentionedUserIds,
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return null
    },
    // Mention updates should be attempted even when offline.
    networkMode: "always",
  })
}

/**
 * Mutation hook for updating task status.
 * Entity drafts + cache updates are handled by the engine.
 */
export function useUpdateTaskStatus() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({
      taskId,
      status,
    }: {
      projectId: string
      taskId: string
      status: TaskStatus
    }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const cacheStores = application.getCacheStores()
      const cached = cacheStores.entityStore.get(taskId)
      if (!cached || !isProjectTaskEntity(cached)) {
        throw new Error("Task not found in cache")
      }

      const updateEntity = application.getUpdateEntity()
      const result = await updateEntity.execute({
        id: taskId,
        content: { ...cached.content, status },
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return result.getValue()
    },
    // Ensure status update persists as draft when offline.
    networkMode: "always",
  })
}

/**
 * Mutation hook for deleting a project task.
 * Entity drafts + cache updates are handled by the engine.
 */
export function useDeleteProjectTask() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ projectId, taskId }: { projectId: string; taskId: string }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const deleteEntity = application.getDeleteEntity()
      const result = await deleteEntity.execute(taskId)

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return { projectId, taskId }
    },
    // Allow delete drafts to be created while offline.
    networkMode: "always",
  })
}

/**
 * Query hook for fetching blocks for a task description.
 * Blocks are fetched from local repository (populated by sync / QueryEntityById).
 */
export function useTaskBlocks(projectId: string, taskId: string) {
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useQuery<ServerBlock[]>({
    queryKey: queryKeys.projectTasks.blocks(workspaceId, projectId, taskId),
    queryFn: async () => {
      if (!application) {
        throw new Error("Not initialized")
      }

      // Ensure the entity and its blocks are fetched from the server
      if (application.isWorkspaceRemote()) {
        const fetchResult = await application.getQueryEntityById().execute(taskId)
        if (fetchResult.isFailed()) {
          throw new Error(fetchResult.getError())
        }
      }

      // Read blocks from local repository
      const blocks = await application.getRepositoryStore().blockRepository.getBlocksByEntity(taskId)
      return blocks
    },
    enabled: !!application && !!projectId && !!taskId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    // Allow loading cached/draft blocks while offline.
    networkMode: "always",
  })
}

/**
 * Mutation hook for creating a task block draft (encrypted Yjs delta).
 * CreateBlockDraft handles encryption internally.
 */
export function useCreateTaskBlock() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({
      taskId,
      yjsUpdates,
    }: {
      projectId: string
      taskId: string
      yjsUpdates: Uint8Array[] | Uint8Array
    }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const createBlockDraft = application.getCreateBlockDraft()
      const result = await createBlockDraft.execute({
        entityId: taskId,
        entityType: "task",
        yjsUpdates,
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return result.getValue()
    },
    // Persist Yjs deltas into draft blocks when offline.
    networkMode: "always",
  })
}
