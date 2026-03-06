import { useState, useEffect } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import type {
  ClientEntity,
  DecryptedForumChannel,
  DecryptedForumDiscussion,
  DecryptedForumDiscussionReply,
  ForumChannelMetaFields,
  ForumDiscussionContent,
  ForumDiscussionMetaFields,
  ForumDiscussionReplyMetaFields,
} from "@shape/engine/models/entity"
import type { QueryEntitiesAndCache } from "../../../engine/usecase/entities/entities"
import { extractEntityLinksFromHtml, extractMentionedUserIdsFromHtml } from "../../lib/extract-entity-links"
import { useEngineStore } from "../engine-store"
import { queryKeys } from "./query-keys"

type EntityQueryNode = Parameters<QueryEntitiesAndCache["execute"]>[0]

function isForumChannelEntity(entity: ClientEntity): entity is DecryptedForumChannel {
  return entity.entityType === "forum-channel"
}

function isForumDiscussionEntity(entity: ClientEntity): entity is DecryptedForumDiscussion {
  return entity.entityType === "forum-discussion"
}

function isForumReplyEntity(entity: ClientEntity): entity is DecryptedForumDiscussionReply {
  return entity.entityType === "forum-reply"
}

function buildForumChannelsQuery(): EntityQueryNode {
  return {
    type: "predicate",
    field: "entity_type",
    operator: "eq",
    value: "forum-channel",
  }
}

function buildForumDiscussionsQuery(channelId: string): EntityQueryNode {
  return {
    type: "group",
    operator: "and",
    children: [
      {
        type: "predicate",
        field: "entity_type",
        operator: "eq",
        value: "forum-discussion",
      },
      {
        type: "predicate",
        field: "parent_id",
        operator: "eq",
        value: channelId,
      },
    ],
  }
}

function buildForumRepliesQuery(discussionId: string): EntityQueryNode {
  return {
    type: "group",
    operator: "and",
    children: [
      {
        type: "predicate",
        field: "entity_type",
        operator: "eq",
        value: "forum-reply",
      },
      {
        type: "predicate",
        field: "parent_id",
        operator: "eq",
        value: discussionId,
      },
    ],
  }
}

// ============================================================
// Forum Channel Hooks
// ============================================================

/**
 * Query hook for fetching all forum channels the user has access to.
 *
 * Architecture: Entity cache is the source of truth.
 * - Data comes from the entity store via useState + subscription
 * - React Query only manages async state (loading, error, refetch)
 */
export function useForumChannels() {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [forumChannels, setForumChannels] = useState<DecryptedForumChannel[]>(() => {
    if (!cacheStores) return []
    return cacheStores.entityStore.getAllByEntityType("forum-channel").filter(isForumChannelEntity)
  })

  useEffect(() => {
    if (!cacheStores) return
    const unsubscribe = cacheStores.entityStore.subscribeToEntityType("forum-channel", updatedEntities => {
      setForumChannels(updatedEntities.filter(isForumChannelEntity))
    })
    return unsubscribe
  }, [cacheStores])

  useEffect(() => {
    if (!cacheStores) {
      setForumChannels([])
      return
    }
    setForumChannels(cacheStores.entityStore.getAllByEntityType("forum-channel").filter(isForumChannelEntity))
  }, [cacheStores])

  const { isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.forumChannels.byWorkspace(workspaceId),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }

      const queryEntities = application.getQueryEntities()
      const result = await queryEntities.execute(buildForumChannelsQuery())
      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return null
    },
    enabled: !!globalClient && !!application && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })

  return {
    data: forumChannels,
    isLoading: isLoading && forumChannels.length === 0,
    isFetching,
    isError,
    error,
    refetch,
  }
}

/**
 * Query hook for fetching a single forum channel.
 */
export function useForumChannel(channelId: string) {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [channel, setChannel] = useState<DecryptedForumChannel | null>(() => {
    if (!cacheStores || !channelId) return null
    const cached = cacheStores.entityStore.get(channelId)
    return cached && isForumChannelEntity(cached) ? cached : null
  })

  useEffect(() => {
    if (!cacheStores || !channelId) return
    const unsubscribe = cacheStores.entityStore.subscribeToEntityType("forum-channel", updatedEntities => {
      const found = updatedEntities.find(entity => entity.id === channelId)
      setChannel(found && isForumChannelEntity(found) ? found : null)
    })
    return unsubscribe
  }, [cacheStores, channelId])

  useEffect(() => {
    if (!cacheStores || !channelId) {
      setChannel(null)
      return
    }
    const cached = cacheStores.entityStore.get(channelId)
    setChannel(cached && isForumChannelEntity(cached) ? cached : null)
  }, [cacheStores, channelId])

  const { isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.forumChannels.detail(workspaceId, channelId),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }

      const queryEntity = application.getQueryEntityById()
      const result = await queryEntity.execute(channelId)
      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return null
    },
    enabled:
      !!globalClient &&
      !!application &&
      !!channelId &&
      application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })

  return {
    data: channel,
    isLoading: isLoading && !channel,
    isError,
    error,
    refetch,
  }
}

/**
 * Mutation hook for creating a forum channel.
 */
export function useCreateForumChannel() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ name, description }: { name: string; description?: string | null }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const createEntity = application.getCreateEntity()
      const result = await createEntity.execute({
        entityType: "forum-channel",
        content: { name, description: description ?? undefined },
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return result.getValue()
    },
    // Permit offline draft creation even when the network is unavailable.
    networkMode: "always",
  })
}

/**
 * Mutation hook for updating a forum channel.
 */
export function useUpdateForumChannel() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({
      channelId,
      name,
      description,
      archived,
    }: {
      channelId: string
      name: string
      description?: string | null
      contentHash: string
      archived?: boolean
    }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const updateEntity = application.getUpdateEntity()
      const result = await updateEntity.execute({
        id: channelId,
        content: { name, description: description ?? undefined },
        metaFields: archived !== undefined ? ({ archived } as Partial<ForumChannelMetaFields>) : undefined,
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return result.getValue()
    },
    // Ensure updates are stored as drafts while offline.
    networkMode: "always",
  })
}

/**
 * Mutation hook for deleting a forum channel.
 * Only the author can delete.
 */
export function useDeleteForumChannel() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ channelId }: { channelId: string }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const deleteEntity = application.getDeleteEntity()
      const result = await deleteEntity.execute(channelId)

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return { channelId }
    },
    // Ensure deletes are captured as drafts while offline.
    networkMode: "always",
  })
}

// ============================================================
// Forum Discussion Hooks
// ============================================================

/**
 * Query hook for fetching all discussions in a forum channel.
 */
export function useForumDiscussions(channelId: string) {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [forumDiscussions, setForumDiscussions] = useState<DecryptedForumDiscussion[]>(() => {
    if (!cacheStores || !channelId) return []
    return cacheStores.forumDiscussionIndex.get(channelId).filter(isForumDiscussionEntity)
  })

  useEffect(() => {
    if (!cacheStores || !channelId) return
    const unsubscribe = cacheStores.forumDiscussionIndex.subscribe(channelId, updatedEntities => {
      setForumDiscussions(updatedEntities.filter(isForumDiscussionEntity))
    })
    return unsubscribe
  }, [cacheStores, channelId])

  useEffect(() => {
    if (!cacheStores || !channelId) {
      setForumDiscussions([])
      return
    }
    setForumDiscussions(cacheStores.forumDiscussionIndex.get(channelId).filter(isForumDiscussionEntity))
  }, [cacheStores, channelId])

  const { isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.forumDiscussions.byChannel(workspaceId, channelId),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }

      const queryEntities = application.getQueryEntities()
      const result = await queryEntities.execute(buildForumDiscussionsQuery(channelId))
      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return null
    },
    enabled: !!globalClient && !!application && !!channelId && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })

  return {
    data: forumDiscussions,
    isLoading: isLoading && forumDiscussions.length === 0,
    isFetching,
    isError,
    error,
    refetch,
  }
}

/**
 * Query hook for fetching a single forum discussion.
 */
export function useForumDiscussion(channelId: string, discussionId: string) {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [discussion, setDiscussion] = useState<DecryptedForumDiscussion | null>(() => {
    if (!cacheStores || !discussionId) return null
    const cached = cacheStores.entityStore.get(discussionId)
    return cached && isForumDiscussionEntity(cached) ? cached : null
  })

  useEffect(() => {
    if (!cacheStores || !channelId || !discussionId) return
    const unsubscribe = cacheStores.forumDiscussionIndex.subscribe(channelId, updatedEntities => {
      const found = updatedEntities.find(entity => entity.id === discussionId)
      setDiscussion(found && isForumDiscussionEntity(found) ? found : null)
    })
    return unsubscribe
  }, [cacheStores, channelId, discussionId])

  useEffect(() => {
    if (!cacheStores || !discussionId) {
      setDiscussion(null)
      return
    }
    const cached = cacheStores.entityStore.get(discussionId)
    setDiscussion(cached && isForumDiscussionEntity(cached) ? cached : null)
  }, [cacheStores, discussionId])

  const { isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.forumDiscussions.detail(workspaceId, channelId, discussionId),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }

      const queryEntity = application.getQueryEntityById()
      const result = await queryEntity.execute(discussionId)
      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return null
    },
    enabled:
      !!globalClient &&
      !!application &&
      !!channelId &&
      !!discussionId &&
      application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })

  return {
    data: discussion,
    isLoading: isLoading && !discussion,
    isError,
    error,
    refetch,
  }
}

/**
 * Mutation hook for creating a forum discussion.
 */
export function useCreateForumDiscussion() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({
      id,
      channelId,
      title,
      body,
    }: {
      /** Optional pre-generated UUID for file attachment binding */
      id?: string
      channelId: string
      title: string
      body?: string | null
    }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      // Fetch the parent channel entity for wrapping key derivation.
      const channelResult = await application.getGetOrFetchEntity().execute(channelId)
      if (channelResult.isFailed()) {
        throw new Error(channelResult.getError())
      }
      const channelEntity = channelResult.getValue()

      const mentionedUserIds = extractMentionedUserIdsFromHtml(body ?? "")

      const createEntity = application.getCreateEntity()
      const result = await createEntity.execute<ForumDiscussionContent, ForumDiscussionMetaFields>({
        entityType: "forum-discussion",
        parent: channelEntity,
        content: { title, body: body ?? undefined },
        id,
        mentionedUserIds,
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      const newDiscussion = result.getValue()

      // Sync entity links if body has content
      if (body && application.isWorkspaceRemote()) {
        const linkedEntities = extractEntityLinksFromHtml(body)
        if (linkedEntities.length > 0) {
          const syncResult = await application.getSyncEntityLinks().execute({
            entityId: newDiscussion.id,
            sourceEntityType: "forum_discussion",
            linkedEntities,
          })
          if (syncResult.isFailed()) {
            throw new Error(syncResult.getError())
          }
        }
      }

      return {
        discussion: newDiscussion,
        channelId,
      }
    },
    // Permit offline draft creation even when the network is unavailable.
    networkMode: "always",
  })
}

/**
 * Mutation hook for updating a forum discussion.
 */
export function useUpdateForumDiscussion() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({
      channelId,
      discussionId,
      title,
      body,
      pinned,
      archived,
    }: {
      channelId: string
      discussionId: string
      title: string
      body?: string | null
      contentHash: string
      pinned?: boolean
      archived?: boolean
    }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const mentionedUserIds = extractMentionedUserIdsFromHtml(body ?? "")

      const metaFields: Partial<ForumDiscussionMetaFields> = {}
      if (pinned !== undefined) metaFields.pinned = pinned
      if (archived !== undefined) metaFields.archived = archived

      const updateEntity = application.getUpdateEntity()
      const result = await updateEntity.execute({
        id: discussionId,
        content: { title, body: body ?? undefined },
        metaFields: Object.keys(metaFields).length > 0 ? metaFields : undefined,
        mentionedUserIds,
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      // Sync entity links if body was provided
      if (body !== undefined && application.isWorkspaceRemote()) {
        const linkedEntities = extractEntityLinksFromHtml(body ?? "")
        const syncResult = await application.getSyncEntityLinks().execute({
          entityId: discussionId,
          sourceEntityType: "forum_discussion",
          linkedEntities,
        })
        if (syncResult.isFailed()) {
          throw new Error(syncResult.getError())
        }
      }

      return {
        discussion: result.getValue(),
        channelId,
      }
    },
    // Ensure updates are stored as drafts while offline.
    networkMode: "always",
  })
}

/**
 * Mutation hook for toggling a forum discussion's pinned status.
 */
export function usePinForumDiscussion() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({
      channelId,
      discussionId,
      pinned,
    }: {
      channelId: string
      discussionId: string
      pinned: boolean
    }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      // Read current content from cache so we can pass it through unchanged.
      const cached = application.getCacheStores().entityStore.get(discussionId)
      if (!cached || !isForumDiscussionEntity(cached)) {
        throw new Error("Discussion not found in cache")
      }

      const updateEntity = application.getUpdateEntity()
      const result = await updateEntity.execute({
        id: discussionId,
        content: cached.content,
        metaFields: { pinned } as Partial<ForumDiscussionMetaFields>,
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return {
        discussion: result.getValue(),
        channelId,
      }
    },
    // Ensure pin updates are stored as drafts while offline.
    networkMode: "always",
  })
}

/**
 * Mutation hook for archiving or unarchiving a forum discussion.
 */
export function useArchiveForumDiscussion() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({
      channelId,
      discussionId,
      archived,
    }: {
      channelId: string
      discussionId: string
      archived: boolean
    }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      // Read current content from cache so we can pass it through unchanged.
      const cached = application.getCacheStores().entityStore.get(discussionId)
      if (!cached || !isForumDiscussionEntity(cached)) {
        throw new Error("Discussion not found in cache")
      }

      const updateEntity = application.getUpdateEntity()
      const result = await updateEntity.execute({
        id: discussionId,
        content: cached.content,
        metaFields: { archived } as Partial<ForumDiscussionMetaFields>,
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return {
        discussion: result.getValue(),
        channelId,
      }
    },
    // Ensure archive updates are stored as drafts while offline.
    networkMode: "always",
  })
}

/**
 * Mutation hook for deleting a forum discussion.
 */
export function useDeleteForumDiscussion() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ discussionId }: { channelId: string; discussionId: string }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const deleteEntity = application.getDeleteEntity()
      const result = await deleteEntity.execute(discussionId)

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return null
    },
    // Ensure deletes are captured as drafts while offline.
    networkMode: "always",
  })
}

// ============================================================
// Forum Reply Hooks
// ============================================================

/**
 * Query hook for fetching all replies in a forum discussion.
 */
export function useForumReplies(channelId: string, discussionId: string) {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [forumReplies, setForumReplies] = useState<DecryptedForumDiscussionReply[]>(() => {
    if (!cacheStores || !discussionId) return []
    return cacheStores.forumReplyIndex.get(discussionId).filter(isForumReplyEntity)
  })

  useEffect(() => {
    if (!cacheStores || !discussionId) return
    const unsubscribe = cacheStores.forumReplyIndex.subscribe(discussionId, updatedEntities => {
      setForumReplies(updatedEntities.filter(isForumReplyEntity))
    })
    return unsubscribe
  }, [cacheStores, discussionId])

  useEffect(() => {
    if (!cacheStores || !discussionId) {
      setForumReplies([])
      return
    }
    setForumReplies(cacheStores.forumReplyIndex.get(discussionId).filter(isForumReplyEntity))
  }, [cacheStores, discussionId])

  const { isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.forumReplies.byDiscussion(workspaceId, channelId, discussionId),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }

      const queryEntities = application.getQueryEntities()
      const result = await queryEntities.execute(buildForumRepliesQuery(discussionId))
      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return null
    },
    enabled: !!globalClient && !!application && !!channelId && !!discussionId && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })

  return {
    data: forumReplies,
    isLoading: isLoading && forumReplies.length === 0,
    isFetching,
    isError,
    error,
    refetch,
  }
}

/**
 * Mutation hook for sending a reply to a forum discussion.
 */
export function useSendForumReply() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({
      id,
      channelId,
      discussionId,
      body,
      quotingReplyId = null,
    }: {
      /** Optional pre-generated UUID for file attachment binding */
      id?: string
      channelId: string
      discussionId: string
      body: string
      quotingReplyId?: string | null
    }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      // Fetch the parent discussion entity for wrapping key derivation.
      const discussionResult = await application.getGetOrFetchEntity().execute(discussionId)
      if (discussionResult.isFailed()) {
        throw new Error(discussionResult.getError())
      }
      const discussionEntity = discussionResult.getValue()

      const mentionedUserIds = extractMentionedUserIdsFromHtml(body)

      const createEntity = application.getCreateEntity()
      const result = await createEntity.execute({
        entityType: "forum-reply",
        parent: discussionEntity,
        content: { body },
        id,
        mentionedUserIds,
        metaFields: quotingReplyId
          ? ({ quoting_reply_id: quotingReplyId } as ForumDiscussionReplyMetaFields)
          : undefined,
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      const newReply = result.getValue()

      // Sync entity links extracted from reply body
      if (application.isWorkspaceRemote()) {
        const linkedEntities = extractEntityLinksFromHtml(body, {
          channel_id: channelId,
          discussion_id: discussionId,
        })
        if (linkedEntities.length > 0) {
          const syncResult = await application.getSyncEntityLinks().execute({
            entityId: newReply.id,
            sourceEntityType: "forum_reply",
            linkedEntities,
          })
          if (syncResult.isFailed()) {
            throw new Error(syncResult.getError())
          }
        }
      }

      return {
        reply: newReply,
        channelId,
        discussionId,
      }
    },
    // Permit offline reply drafts even when the network is unavailable.
    networkMode: "always",
  })
}

/**
 * Mutation hook for deleting a forum reply.
 * Only the author can delete their own replies.
 */
export function useDeleteForumReply() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({
      replyId,
    }: {
      channelId: string
      discussionId: string
      replyId: string
    }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const deleteEntity = application.getDeleteEntity()
      const result = await deleteEntity.execute(replyId)

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return null
    },
    // Ensure deletes are captured as drafts while offline.
    networkMode: "always",
  })
}
