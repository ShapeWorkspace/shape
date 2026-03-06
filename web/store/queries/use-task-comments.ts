import { useEffect, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import type {
  ClientEntity,
  DecryptedProjectTask,
  DecryptedTaskComment,
} from "@shape/engine/models/entity"
import type { QueryEntitiesAndCache } from "../../../engine/usecase/entities/entities"
import { extractEntityLinksFromHtml, extractMentionedUserIdsFromHtml } from "../../lib/extract-entity-links"
import { useEngineStore } from "../engine-store"
import { queryKeys } from "./query-keys"

type EntityQueryNode = Parameters<QueryEntitiesAndCache["execute"]>[0]

function isTaskCommentEntity(entity: ClientEntity): entity is DecryptedTaskComment {
  return entity.entityType === "task-comment"
}

function isProjectTaskEntity(entity: ClientEntity): entity is DecryptedProjectTask {
  return entity.entityType === "task"
}

function buildTaskCommentsQuery(taskId: string): EntityQueryNode {
  return {
    type: "group",
    operator: "and",
    children: [
      {
        type: "predicate",
        field: "entity_type",
        operator: "eq",
        value: "task-comment",
      },
      {
        type: "predicate",
        field: "parent_id",
        operator: "eq",
        value: taskId,
      },
    ],
  }
}

/**
 * Query hook for fetching all comments for a task.
 *
 * Architecture: Entity cache is the source of truth.
 * - Data comes from index subscriptions
 * - React Query only manages async state (loading, error, refetch)
 */
export function useTaskComments(projectId: string, taskId: string) {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [comments, setComments] = useState<DecryptedTaskComment[]>(() => {
    if (!cacheStores || !taskId) return []
    return cacheStores.taskCommentIndex.get(taskId).filter(isTaskCommentEntity)
  })

  useEffect(() => {
    if (!cacheStores || !taskId) return
    const unsubscribe = cacheStores.taskCommentIndex.subscribe(taskId, updatedComments => {
      setComments(updatedComments.filter(isTaskCommentEntity))
    })
    return unsubscribe
  }, [cacheStores, taskId])

  useEffect(() => {
    if (!cacheStores || !taskId) {
      setComments([])
      return
    }
    setComments(cacheStores.taskCommentIndex.get(taskId).filter(isTaskCommentEntity))
  }, [cacheStores, taskId])

  const { isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.taskComments.byTask(workspaceId, projectId, taskId),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }

      const queryEntities = application.getQueryEntities()
      const queryResult = await queryEntities.execute(buildTaskCommentsQuery(taskId))
      if (queryResult.isFailed()) {
        throw new Error(queryResult.getError())
      }

      return null
    },
    enabled:
      !!globalClient &&
      !!application &&
      !!projectId &&
      !!taskId &&
      application.isWorkspaceRemote(),
    staleTime: 0,
    gcTime: 0,
    networkMode: "always",
    refetchOnMount: "always",
    retry: 5,
    retryDelay: attemptIndex => Math.min(500 * 2 ** attemptIndex, 5000),
  })

  return {
    data: comments,
    isLoading: isLoading && comments.length === 0,
    isFetching,
    isError,
    error,
    refetch,
  }
}

/**
 * Query hook for fetching a single comment by ID.
 */
export function useTaskComment(projectId: string, taskId: string, commentId: string) {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [comment, setComment] = useState<DecryptedTaskComment | null>(() => {
    if (!cacheStores || !taskId || !commentId) return null
    const cached = cacheStores.entityStore.get(commentId)
    if (!cached || !isTaskCommentEntity(cached) || cached.parentId !== taskId) {
      return null
    }
    return cached
  })

  useEffect(() => {
    if (!cacheStores || !taskId || !commentId) return
    const unsubscribe = cacheStores.entityStore.subscribeToEntityType("task-comment", updatedComments => {
      const match = updatedComments.find(entity => entity.id === commentId && entity.parentId === taskId)
      if (!match || !isTaskCommentEntity(match)) {
        setComment(null)
        return
      }
      setComment(match)
    })
    return unsubscribe
  }, [cacheStores, taskId, commentId])

  useEffect(() => {
    if (!cacheStores || !taskId || !commentId) {
      setComment(null)
      return
    }
    const cached = cacheStores.entityStore.get(commentId)
    if (!cached || !isTaskCommentEntity(cached) || cached.parentId !== taskId) {
      setComment(null)
      return
    }
    setComment(cached)
  }, [cacheStores, taskId, commentId])

  const { isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.taskComments.detail(workspaceId, projectId, taskId, commentId),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }

      const queryEntity = application.getQueryEntityById()
      const result = await queryEntity.execute(commentId)
      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      const fetchedEntity = result.getValue()
      if (!isTaskCommentEntity(fetchedEntity) || fetchedEntity.parentId !== taskId) {
        throw new Error("Comment not found")
      }

      return null
    },
    enabled:
      !!globalClient &&
      !!application &&
      !!projectId &&
      !!taskId &&
      !!commentId &&
      application.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })

  return {
    data: comment,
    isLoading: isLoading && !comment,
    isError,
    error,
    refetch,
  }
}

/**
 * Hook to get the comment count for a task.
 */
export function useTaskCommentCount(taskId: string): number {
  const { application } = useEngineStore()
  const cacheStores = application?.getCacheStores() ?? null

  const [count, setCount] = useState<number>(() => {
    if (!cacheStores || !taskId) return 0
    return cacheStores.taskCommentIndex.get(taskId).filter(isTaskCommentEntity).length
  })

  useEffect(() => {
    if (!cacheStores || !taskId) {
      setCount(0)
      return
    }

    setCount(cacheStores.taskCommentIndex.get(taskId).filter(isTaskCommentEntity).length)
    const unsubscribe = cacheStores.taskCommentIndex.subscribe(taskId, updatedComments => {
      setCount(updatedComments.filter(isTaskCommentEntity).length)
    })
    return unsubscribe
  }, [cacheStores, taskId])

  return count
}

interface CreateTaskCommentOptions {
  projectId: string
  taskId: string
  body: string
  id?: string
}

/**
 * Mutation hook for creating a new task comment.
 */
export function useCreateTaskComment() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ projectId, taskId, body, id }: CreateTaskCommentOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const taskResult = await application.getGetOrFetchEntity().execute(taskId)
      if (taskResult.isFailed()) {
        throw new Error(taskResult.getError())
      }

      const taskEntity = taskResult.getValue()
      if (!isProjectTaskEntity(taskEntity)) {
        throw new Error("Task not found")
      }

      const mentionedUserIds = extractMentionedUserIdsFromHtml(body)
      const createEntity = application.getCreateEntity()
      const commentResult = await createEntity.execute({
        entityType: "task-comment",
        parent: taskEntity,
        content: { body },
        id,
        mentionedUserIds,
      })
      if (commentResult.isFailed()) {
        throw new Error(commentResult.getError())
      }

      const newComment = commentResult.getValue()

      if (application.isWorkspaceRemote()) {
        const linkedEntities = extractEntityLinksFromHtml(body, {
          project_id: projectId,
          task_id: taskId,
        })
        if (linkedEntities.length > 0) {
          const syncResult = await application.getSyncEntityLinks().execute({
            entityId: newComment.id,
            sourceEntityType: "task_comment",
            linkedEntities,
          })
          if (syncResult.isFailed()) {
            throw new Error(syncResult.getError())
          }
        }
      }

      return newComment
    },
    networkMode: "always",
  })
}

interface UpdateTaskCommentOptions {
  projectId: string
  taskId: string
  commentId: string
  body: string
  contentHash: string
}

/**
 * Mutation hook for updating an existing task comment.
 */
export function useUpdateTaskComment() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ projectId, taskId, commentId, body }: UpdateTaskCommentOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const updateEntity = application.getUpdateEntity()
      const updateResult = await updateEntity.execute({
        id: commentId,
        content: { body },
      })
      if (updateResult.isFailed()) {
        throw new Error(updateResult.getError())
      }

      if (application.isWorkspaceRemote()) {
        const linkedEntities = extractEntityLinksFromHtml(body, {
          project_id: projectId,
          task_id: taskId,
        })
        const syncResult = await application.getSyncEntityLinks().execute({
          entityId: commentId,
          sourceEntityType: "task_comment",
          linkedEntities,
        })
        if (syncResult.isFailed()) {
          throw new Error(syncResult.getError())
        }
      }

      return updateResult.getValue()
    },
    networkMode: "always",
  })
}

interface DeleteTaskCommentOptions {
  commentId: string
}

/**
 * Mutation hook for deleting a task comment.
 */
export function useDeleteTaskComment() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ commentId }: DeleteTaskCommentOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const deleteEntity = application.getDeleteEntity()
      const deleteResult = await deleteEntity.execute(commentId)
      if (deleteResult.isFailed()) {
        throw new Error(deleteResult.getError())
      }

      return null
    },
    networkMode: "always",
  })
}
