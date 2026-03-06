import { useEffect, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import type {
  ClientEntity,
  DecryptedPaper,
  DecryptedPaperComment,
  DecryptedPaperCommentReply,
} from "@shape/engine/models/entity"
import type { QueryEntitiesAndCache } from "../../../engine/usecase/entities/entities"
import { extractEntityLinksFromTipTapJson } from "../../lib/extract-entity-links"
import { extractMentionedUserIdsFromTipTapJson } from "../../lib/tiptap-json"
import { useEngineStore } from "../engine-store"
import { queryKeys } from "./query-keys"

type EntityQueryNode = Parameters<QueryEntitiesAndCache["execute"]>[0]

function isPaperCommentEntity(entity: ClientEntity): entity is DecryptedPaperComment {
  return entity.entityType === "paper-comment"
}

function isPaperCommentReplyEntity(entity: ClientEntity): entity is DecryptedPaperCommentReply {
  return entity.entityType === "paper-comment-reply"
}

function isPaperEntity(entity: ClientEntity): entity is DecryptedPaper {
  return entity.entityType === "paper"
}

function buildPaperCommentsQuery(paperId: string): EntityQueryNode {
  return {
    type: "group",
    operator: "and",
    children: [
      {
        type: "predicate",
        field: "entity_type",
        operator: "eq",
        value: "paper-comment",
      },
      {
        type: "predicate",
        field: "parent_id",
        operator: "eq",
        value: paperId,
      },
    ],
  }
}

function buildPaperCommentRepliesQuery(commentId: string): EntityQueryNode {
  return {
    type: "group",
    operator: "and",
    children: [
      {
        type: "predicate",
        field: "entity_type",
        operator: "eq",
        value: "paper-comment-reply",
      },
      {
        type: "predicate",
        field: "parent_id",
        operator: "eq",
        value: commentId,
      },
    ],
  }
}

/**
 * Query hook for fetching all comments for a paper.
 *
 * Architecture: Entity cache is the source of truth.
 * - Data comes from index subscriptions
 * - React Query only manages async state (loading, error, refetch)
 */
export function usePaperComments(paperId: string) {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [comments, setComments] = useState<DecryptedPaperComment[]>(() => {
    if (!cacheStores || !paperId) return []
    return cacheStores.paperCommentIndex.get(paperId).filter(isPaperCommentEntity)
  })

  useEffect(() => {
    if (!cacheStores || !paperId) return
    const unsubscribe = cacheStores.paperCommentIndex.subscribe(paperId, updatedComments => {
      setComments(updatedComments.filter(isPaperCommentEntity))
    })
    return unsubscribe
  }, [cacheStores, paperId])

  useEffect(() => {
    if (!cacheStores || !paperId) {
      setComments([])
      return
    }
    setComments(cacheStores.paperCommentIndex.get(paperId).filter(isPaperCommentEntity))
  }, [cacheStores, paperId])

  const { isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.paperComments.byPaper(workspaceId, paperId),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }

      const queryEntities = application.getQueryEntities()
      const queryResult = await queryEntities.execute(buildPaperCommentsQuery(paperId))
      if (queryResult.isFailed()) {
        throw new Error(queryResult.getError())
      }

      return null
    },
    enabled:
      !!globalClient &&
      !!application &&
      !!paperId &&
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
 * Query hook for fetching replies to a paper comment.
 */
export function usePaperCommentReplies(commentId: string) {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [replies, setReplies] = useState<DecryptedPaperCommentReply[]>(() => {
    if (!cacheStores || !commentId) return []
    return cacheStores.paperCommentReplyIndex.get(commentId).filter(isPaperCommentReplyEntity)
  })

  useEffect(() => {
    if (!cacheStores || !commentId) return
    const unsubscribe = cacheStores.paperCommentReplyIndex.subscribe(commentId, updatedReplies => {
      setReplies(updatedReplies.filter(isPaperCommentReplyEntity))
    })
    return unsubscribe
  }, [cacheStores, commentId])

  useEffect(() => {
    if (!cacheStores || !commentId) {
      setReplies([])
      return
    }
    setReplies(cacheStores.paperCommentReplyIndex.get(commentId).filter(isPaperCommentReplyEntity))
  }, [cacheStores, commentId])

  const { isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.paperCommentReplies.byComment(workspaceId, commentId),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }

      const queryEntities = application.getQueryEntities()
      const queryResult = await queryEntities.execute(buildPaperCommentRepliesQuery(commentId))
      if (queryResult.isFailed()) {
        throw new Error(queryResult.getError())
      }

      return null
    },
    enabled:
      !!globalClient &&
      !!application &&
      !!commentId &&
      application.isWorkspaceRemote(),
    staleTime: 0,
    gcTime: 0,
    networkMode: "always",
    refetchOnMount: "always",
    retry: 5,
    retryDelay: attemptIndex => Math.min(500 * 2 ** attemptIndex, 5000),
  })

  return {
    data: replies,
    isLoading: isLoading && replies.length === 0,
    isFetching,
    isError,
    error,
    refetch,
  }
}

/**
 * Hook to get the reply count for a paper comment.
 */
export function usePaperCommentReplyCount(commentId: string): number {
  const { application } = useEngineStore()
  const cacheStores = application?.getCacheStores() ?? null

  const [count, setCount] = useState<number>(() => {
    if (!cacheStores || !commentId) return 0
    return cacheStores.paperCommentReplyIndex.get(commentId).filter(isPaperCommentReplyEntity).length
  })

  useEffect(() => {
    if (!cacheStores || !commentId) {
      setCount(0)
      return
    }

    setCount(cacheStores.paperCommentReplyIndex.get(commentId).filter(isPaperCommentReplyEntity).length)
    const unsubscribe = cacheStores.paperCommentReplyIndex.subscribe(commentId, updatedReplies => {
      setCount(updatedReplies.filter(isPaperCommentReplyEntity).length)
    })
    return unsubscribe
  }, [cacheStores, commentId])

  return count
}

interface CreatePaperCommentOptions {
  paperId: string
  body: string
  id?: string
}

/**
 * Mutation hook for creating a new paper comment.
 */
export function useCreatePaperComment() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ paperId, body, id }: CreatePaperCommentOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const paperResult = await application.getGetOrFetchEntity().execute(paperId)
      if (paperResult.isFailed()) {
        throw new Error(paperResult.getError())
      }

      const paperEntity = paperResult.getValue()
      if (!isPaperEntity(paperEntity)) {
        throw new Error("Paper not found")
      }

      const mentionedUserIds = extractMentionedUserIdsFromTipTapJson(body)
      const createEntity = application.getCreateEntity()
      const commentResult = await createEntity.execute({
        entityType: "paper-comment",
        parent: paperEntity,
        content: { body },
        id,
        mentionedUserIds,
      })
      if (commentResult.isFailed()) {
        throw new Error(commentResult.getError())
      }

      const newComment = commentResult.getValue()

      if (application.isWorkspaceRemote()) {
        const linkedEntities = extractEntityLinksFromTipTapJson(body, {
          paper_id: paperId,
        })
        if (linkedEntities.length > 0) {
          const syncResult = await application.getSyncEntityLinks().execute({
            entityId: newComment.id,
            sourceEntityType: "paper_comment",
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

interface UpdatePaperCommentOptions {
  commentId: string
  body?: string
  resolved?: boolean
}

/**
 * Mutation hook for updating an existing paper comment.
 */
export function useUpdatePaperComment() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ commentId, body, resolved }: UpdatePaperCommentOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      // Fetch existing content from cache to provide to update
      const existingEntity = application.getCacheStores().entityStore.get(commentId)
      const existingContent = existingEntity?.content ?? {}

      const updateEntity = application.getUpdateEntity()
      const updateResult = await updateEntity.execute({
        id: commentId,
        content: body !== undefined ? { ...existingContent, body } : existingContent,
        ...(resolved !== undefined ? { metaFields: { resolved } } : {}),
      })
      if (updateResult.isFailed()) {
        throw new Error(updateResult.getError())
      }

      if (body !== undefined && application.isWorkspaceRemote()) {
        // Fetch the comment to get its parentId (paperId) for entity link context
        const commentEntity = application.getCacheStores().entityStore.get(commentId)
        const paperId = commentEntity?.parentId ?? ""
        const linkedEntities = extractEntityLinksFromTipTapJson(body, {
          paper_id: paperId,
        })
        const syncResult = await application.getSyncEntityLinks().execute({
          entityId: commentId,
          sourceEntityType: "paper_comment",
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

interface DeletePaperCommentOptions {
  commentId: string
}

/**
 * Mutation hook for deleting a paper comment.
 */
export function useDeletePaperComment() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ commentId }: DeletePaperCommentOptions) => {
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

interface CreatePaperCommentReplyOptions {
  commentId: string
  body: string
  id?: string
}

/**
 * Mutation hook for creating a reply to a paper comment.
 */
export function useCreatePaperCommentReply() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ commentId, body, id }: CreatePaperCommentReplyOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const commentResult = await application.getGetOrFetchEntity().execute(commentId)
      if (commentResult.isFailed()) {
        throw new Error(commentResult.getError())
      }

      const commentEntity = commentResult.getValue()
      if (!isPaperCommentEntity(commentEntity)) {
        throw new Error("Comment not found")
      }

      const mentionedUserIds = extractMentionedUserIdsFromTipTapJson(body)
      const createEntity = application.getCreateEntity()
      const replyResult = await createEntity.execute({
        entityType: "paper-comment-reply",
        parent: commentEntity,
        content: { body },
        id,
        mentionedUserIds,
      })
      if (replyResult.isFailed()) {
        throw new Error(replyResult.getError())
      }

      const newReply = replyResult.getValue()

      if (application.isWorkspaceRemote()) {
        // Get the paper ID from the comment's parent
        const paperId = commentEntity.parentId ?? ""
        const linkedEntities = extractEntityLinksFromTipTapJson(body, {
          paper_id: paperId,
          paper_comment_id: commentId,
        })
        if (linkedEntities.length > 0) {
          const syncResult = await application.getSyncEntityLinks().execute({
            entityId: newReply.id,
            sourceEntityType: "paper_comment_reply",
            linkedEntities,
          })
          if (syncResult.isFailed()) {
            throw new Error(syncResult.getError())
          }
        }
      }

      return newReply
    },
    networkMode: "always",
  })
}

interface UpdatePaperCommentReplyOptions {
  replyId: string
  body: string
}

/**
 * Mutation hook for updating a paper comment reply.
 */
export function useUpdatePaperCommentReply() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ replyId, body }: UpdatePaperCommentReplyOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const updateEntity = application.getUpdateEntity()
      const updateResult = await updateEntity.execute({
        id: replyId,
        content: { body },
      })
      if (updateResult.isFailed()) {
        throw new Error(updateResult.getError())
      }

      if (application.isWorkspaceRemote()) {
        // Get context from cache for entity links
        const replyEntity = application.getCacheStores().entityStore.get(replyId)
        const commentId = replyEntity?.parentId ?? ""
        const commentEntity = application.getCacheStores().entityStore.get(commentId)
        const paperId = commentEntity?.parentId ?? ""
        const linkedEntities = extractEntityLinksFromTipTapJson(body, {
          paper_id: paperId,
          paper_comment_id: commentId,
        })
        const syncResult = await application.getSyncEntityLinks().execute({
          entityId: replyId,
          sourceEntityType: "paper_comment_reply",
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

interface DeletePaperCommentReplyOptions {
  replyId: string
}

/**
 * Mutation hook for deleting a paper comment reply.
 */
export function useDeletePaperCommentReply() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ replyId }: DeletePaperCommentReplyOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const deleteEntity = application.getDeleteEntity()
      const deleteResult = await deleteEntity.execute(replyId)
      if (deleteResult.isFailed()) {
        throw new Error(deleteResult.getError())
      }

      return null
    },
    networkMode: "always",
  })
}
