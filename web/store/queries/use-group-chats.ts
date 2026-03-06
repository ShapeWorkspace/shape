import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import type {
  ClientEntity,
  DecryptedGroupChat,
  DecryptedGroupMessage,
  GroupMessageMetaFields,
} from "@shape/engine/models/entity"
import type { CacheStores } from "../../../engine/store/cache-stores"
import type { QueryEntitiesAndCache } from "../../../engine/usecase/entities/entities"
import { useEngineStore } from "../engine-store"
import { useAuthStore } from "../auth-store"
import { queryKeys } from "./query-keys"
import { extractEntityLinksFromHtml } from "../../lib/extract-entity-links"

function isGroupChatEntity(entity: ClientEntity): entity is DecryptedGroupChat {
  return entity.entityType === "group-chat"
}

function isGroupMessageEntity(entity: ClientEntity): entity is DecryptedGroupMessage {
  return entity.entityType === "group-message"
}

function selectCachedGroupChats(cacheStores: CacheStores | null): DecryptedGroupChat[] {
  if (!cacheStores) return []
  return cacheStores.entityStore.getAllByEntityType("group-chat").filter(isGroupChatEntity)
}

function filterRevokedGroupChats(
  groupChats: DecryptedGroupChat[],
  revokedGroupIds: Set<string>,
  cacheStores: CacheStores | null
): DecryptedGroupChat[] {
  if (revokedGroupIds.size === 0) {
    return groupChats
  }

  return groupChats.filter(groupChat => {
    if (!revokedGroupIds.has(groupChat.id)) {
      return true
    }
    const hasDirtyVersion = cacheStores?.entityStore.hasDirtyVersion(groupChat.id) ?? false
    const hasDraftVersion = cacheStores?.draftCache.get(groupChat.id) !== undefined
    return hasDirtyVersion || hasDraftVersion
  })
}

type EntityQueryNode = Parameters<QueryEntitiesAndCache["execute"]>[0]

function buildGroupChatsQuery(): EntityQueryNode {
  return {
    type: "predicate",
    field: "entity_type",
    operator: "eq",
    value: "group-chat",
  }
}

function buildGroupMessagesQuery(groupChatId: string): EntityQueryNode {
  return {
    type: "group",
    operator: "and",
    children: [
      {
        type: "predicate",
        field: "entity_type",
        operator: "eq",
        value: "group-message",
      },
      {
        type: "predicate",
        field: "parent_id",
        operator: "eq",
        value: groupChatId,
      },
    ],
  }
}

/**
 * Query hook for fetching all group chats the user has access to.
 *
 * Architecture: Entity cache is the source of truth.
 * - Data comes from the entity store via useState + subscription
 * - React Query only manages async state (loading, error, refetch)
 */
export function useGroupChats() {
  const { globalClient, application } = useEngineStore()
  const currentUserId = useAuthStore(state => state.currentUser?.uuid ?? "")
  const workspaceId = application?.workspaceId ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [groupChats, setGroupChats] = useState<DecryptedGroupChat[]>(() => selectCachedGroupChats(cacheStores))
  const serverVisibleGroupIdsRef = useRef<Set<string> | null>(null)
  const revokedGroupIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!cacheStores) return
    const unsubscribe = cacheStores.entityStore.subscribeToEntityType("group-chat", updatedEntities => {
      setGroupChats(
        filterRevokedGroupChats(
          updatedEntities.filter(isGroupChatEntity),
          revokedGroupIdsRef.current,
          cacheStores
        )
      )
    })
    return unsubscribe
  }, [cacheStores])

  useEffect(() => {
    if (!cacheStores) {
      setGroupChats([])
      serverVisibleGroupIdsRef.current = null
      revokedGroupIdsRef.current = new Set()
      return
    }
    setGroupChats(
      filterRevokedGroupChats(selectCachedGroupChats(cacheStores), revokedGroupIdsRef.current, cacheStores)
    )
  }, [cacheStores])

  const { isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.groupChats.byWorkspace(workspaceId),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }

      const queryEntities = application.getQueryEntities()
      const result = await queryEntities.execute(buildGroupChatsQuery())
      if (result.isFailed()) {
        throw new Error(result.getError())
      }
      const visibleGroupIds = new Set(result.getValue().filter(isGroupChatEntity).map(entity => entity.id))
      const previousVisibleGroupIds = serverVisibleGroupIdsRef.current
      const nextRevoked = new Set(revokedGroupIdsRef.current)
      if (previousVisibleGroupIds) {
        for (const previousGroupId of previousVisibleGroupIds) {
          if (!visibleGroupIds.has(previousGroupId)) {
            nextRevoked.add(previousGroupId)
          }
        }
        for (const visibleGroupId of visibleGroupIds) {
          nextRevoked.delete(visibleGroupId)
        }
      }

      // For cached groups missing from list results, verify access by ID before hiding.
      // This avoids stale unauthorized rows while preserving newly shared groups that
      // may not be in the initial list response yet.
      const queryGroupById = application.getQueryEntityById()
      const cachedGroupChats = selectCachedGroupChats(cacheStores)
      for (const cachedGroup of cachedGroupChats) {
        if (visibleGroupIds.has(cachedGroup.id)) {
          nextRevoked.delete(cachedGroup.id)
          continue
        }

        const hasDirtyVersion = cacheStores?.entityStore.hasDirtyVersion(cachedGroup.id) ?? false
        const hasDraftVersion = cacheStores?.draftCache.get(cachedGroup.id) !== undefined
        if (hasDirtyVersion || hasDraftVersion || (currentUserId !== "" && cachedGroup.creatorId === currentUserId)) {
          continue
        }

        const byIdResult = await queryGroupById.execute(cachedGroup.id)
        if (byIdResult.isFailed()) {
          nextRevoked.add(cachedGroup.id)
        } else {
          nextRevoked.delete(cachedGroup.id)
        }
      }

      revokedGroupIdsRef.current = nextRevoked
      serverVisibleGroupIdsRef.current = visibleGroupIds
      setGroupChats(
        filterRevokedGroupChats(selectCachedGroupChats(cacheStores), revokedGroupIdsRef.current, cacheStores)
      )
      return null
    },
    enabled: !!globalClient && !!application && application.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })

  return {
    data: groupChats,
    isLoading: isLoading && groupChats.length === 0,
    isFetching,
    isError,
    error,
    refetch,
  }
}

/**
 * Query hook for fetching a single group chat.
 */
export function useGroupChat(groupChatId: string) {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [groupChat, setGroupChat] = useState<DecryptedGroupChat | null>(() => {
    if (!cacheStores || !groupChatId) return null
    const cached = cacheStores.entityStore.get(groupChatId)
    return cached && isGroupChatEntity(cached) ? cached : null
  })

  useEffect(() => {
    if (!cacheStores || !groupChatId) return
    const unsubscribe = cacheStores.entityStore.subscribeToEntityType("group-chat", updatedEntities => {
      const match = updatedEntities.find(entity => entity.id === groupChatId)
      if (!match || !isGroupChatEntity(match)) {
        setGroupChat(null)
        return
      }
      setGroupChat(match)
    })
    return unsubscribe
  }, [cacheStores, groupChatId])

  useEffect(() => {
    if (!cacheStores || !groupChatId) {
      setGroupChat(null)
      return
    }
    const cached = cacheStores.entityStore.get(groupChatId)
    setGroupChat(cached && isGroupChatEntity(cached) ? cached : null)
  }, [cacheStores, groupChatId])

  const { isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.groupChats.detail(workspaceId, groupChatId),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }

      const queryEntity = application.getQueryEntityById()
      const result = await queryEntity.execute(groupChatId)
      if (result.isFailed()) {
        throw new Error(result.getError())
      }
      return null
    },
    enabled:
      !!globalClient &&
      !!application &&
      !!groupChatId &&
      application.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })

  return {
    data: groupChat,
    isLoading: isLoading && !groupChat,
    isError,
    error,
    refetch,
  }
}

/**
 * Query hook for fetching messages in a group chat.
 *
 * Architecture: Entity cache is the source of truth for real-time updates.
 * - Data flows from the group-message index via useState + subscription
 * - SSE events update the entity store and index
 * - React Query manages async state (loading, error, refetch) for initial fetch
 */
export function useGroupMessages(groupChatId: string) {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [messages, setMessages] = useState<DecryptedGroupMessage[]>(() => {
    if (!cacheStores || !groupChatId) return []
    return cacheStores.groupMessageIndex.get(groupChatId).filter(isGroupMessageEntity)
  })

  useEffect(() => {
    if (!cacheStores || !groupChatId) return
    const unsubscribe = cacheStores.groupMessageIndex.subscribe(groupChatId, updatedMessages => {
      setMessages(updatedMessages.filter(isGroupMessageEntity))
    })
    return unsubscribe
  }, [cacheStores, groupChatId])

  useEffect(() => {
    if (!cacheStores || !groupChatId) {
      setMessages([])
      return
    }
    setMessages(cacheStores.groupMessageIndex.get(groupChatId).filter(isGroupMessageEntity))
  }, [cacheStores, groupChatId])

  const { isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.groupChats.messages(workspaceId, groupChatId),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }

      const queryEntities = application.getQueryEntities()
      const result = await queryEntities.execute(buildGroupMessagesQuery(groupChatId))
      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return null
    },
    enabled:
      !!globalClient &&
      !!application &&
      !!groupChatId &&
      application.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })

  return {
    data: messages,
    isLoading: isLoading && messages.length === 0,
    isFetching,
    isError,
    error,
    refetch,
  }
}

/**
 * Mutation hook for creating a group chat.
 * Entity drafts + cache updates are handled by the engine.
 */
export function useCreateGroupChat() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const createEntity = application.getCreateEntity()
      const result = await createEntity.execute({
        entityType: "group-chat",
        content: { name },
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return result.getValue()
    },
    // Allow draft-backed creation while offline (no network required).
    networkMode: "always",
  })
}

/**
 * Mutation hook for updating a group chat.
 * Entity drafts + cache updates are handled by the engine.
 */
export function useUpdateGroupChat() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ groupChatId, name }: { groupChatId: string; name: string }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const updateEntity = application.getUpdateEntity()
      const result = await updateEntity.execute({
        id: groupChatId,
        content: { name },
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return result.getValue()
    },
    // Allow offline edits; drafts will sync when online.
    networkMode: "always",
  })
}

/**
 * Mutation hook for deleting a group chat.
 * Entity drafts + cache updates are handled by the engine.
 */
export function useDeleteGroupChat() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ groupChatId }: { groupChatId: string }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const deleteEntity = application.getDeleteEntity()
      const result = await deleteEntity.execute(groupChatId)

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return { groupChatId }
    },
    // Allow offline deletions; drafts will sync when online.
    networkMode: "always",
  })
}

/**
 * Mutation hook for sending a message to a group chat.
 * Entity drafts + cache updates are handled by the engine.
 */
export function useSendGroupMessage() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({
      groupChatId,
      text,
      quotedMessageId,
      mentions = [],
    }: {
      groupChatId: string
      text: string
      quotedMessageId?: string | null
      mentions?: string[]
    }) => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        throw new Error("Group messages are unavailable in local-only workspaces")
      }

      const parentResult = await application.getGetOrFetchEntity().execute(groupChatId)
      if (parentResult.isFailed()) {
        throw new Error(parentResult.getError())
      }

      const parentEntity = parentResult.getValue()
      if (!isGroupChatEntity(parentEntity)) {
        throw new Error("Group chat not found")
      }

      const metaFields: GroupMessageMetaFields = quotedMessageId
        ? { quoted_message_id: quotedMessageId }
        : {}

      const createEntity = application.getCreateEntity()
      const messageResult = await createEntity.execute({
        entityType: "group-message",
        parent: parentEntity,
        content: { text },
        metaFields,
        mentionedUserIds: mentions,
      })

      if (messageResult.isFailed()) {
        throw new Error(messageResult.getError())
      }

      const newMessage = messageResult.getValue()

      // Sync entity links extracted from message text
      const linkedEntities = extractEntityLinksFromHtml(text, {
        group_id: groupChatId,
      })
      if (linkedEntities.length > 0) {
        const syncResult = await application.getSyncEntityLinks().execute({
          entityId: newMessage.id,
          sourceEntityType: "group_message",
          linkedEntities,
        })
        if (syncResult.isFailed()) {
          throw new Error(syncResult.getError())
        }
      }

      return {
        message: newMessage,
        groupChatId,
      }
    },
  })
}

/**
 * Mutation hook for deleting a group message.
 * Entity drafts + cache updates are handled by the engine.
 */
export function useDeleteGroupMessage() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ groupChatId, messageId }: { groupChatId: string; messageId: string }) => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        throw new Error("Group messages are unavailable in local-only workspaces")
      }

      const deleteEntity = application.getDeleteEntity()
      const result = await deleteEntity.execute(messageId)

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return { groupChatId, messageId }
    },
  })
}
