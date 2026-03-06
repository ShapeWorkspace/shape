import { useEffect, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import type {
  ClientEntity,
  DecryptedDirectMessage,
  DirectMessageMetaFields,
} from "@shape/engine/models/entity"
import type { QueryEntitiesAndCache } from "../../../engine/usecase/entities/entities"
import { useEngineStore } from "../engine-store"
import { queryKeys } from "./query-keys"

type EntityQueryNode = Parameters<QueryEntitiesAndCache["execute"]>[0]

function isDirectMessageEntity(entity: ClientEntity): entity is DecryptedDirectMessage {
  return entity.entityType === "direct-message"
}

function isDirectConversationMessage(
  entity: DecryptedDirectMessage,
  currentUserId: string,
  recipientId: string
): boolean {
  const recipient = entity.metaFields.recipient_id
  return (
    (entity.creatorId === currentUserId && recipient === recipientId) ||
    (entity.creatorId === recipientId && recipient === currentUserId)
  )
}

function selectConversationMessages(
  entities: ClientEntity[],
  currentUserId: string,
  recipientId: string
): DecryptedDirectMessage[] {
  return entities
    .filter(isDirectMessageEntity)
    .filter(entity => isDirectConversationMessage(entity, currentUserId, recipientId))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
}

function buildConversationQuery(currentUserId: string, recipientId: string): EntityQueryNode {
  return {
    type: "group",
    operator: "and",
    children: [
      {
        type: "predicate",
        field: "entity_type",
        operator: "eq",
        value: "direct-message",
      },
      {
        type: "predicate",
        field: "creator_id",
        operator: "in",
        value: [currentUserId, recipientId],
      },
    ],
  }
}

/**
 * Query hook for fetching a conversation between the current user and a recipient.
 *
 * Architecture: Entity cache is the source of truth for real-time updates.
 * - Data flows from entity store subscriptions
 * - React Query manages async state (loading, error, refetch) for initial fetch
 */
export function useConversation(recipientId: string) {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const currentUserId = application?.getAccountUserId() ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [messages, setMessages] = useState<DecryptedDirectMessage[]>(() => {
    if (!cacheStores || !currentUserId || !recipientId) return []
    const entities = cacheStores.entityStore.getAllByEntityType("direct-message")
    return selectConversationMessages(entities, currentUserId, recipientId)
  })

  useEffect(() => {
    if (!cacheStores || !currentUserId || !recipientId) return
    const unsubscribe = cacheStores.entityStore.subscribeToEntityType("direct-message", updatedEntities => {
      setMessages(selectConversationMessages(updatedEntities, currentUserId, recipientId))
    })
    return unsubscribe
  }, [cacheStores, currentUserId, recipientId])

  useEffect(() => {
    if (!cacheStores || !currentUserId || !recipientId) {
      setMessages([])
      return
    }
    const entities = cacheStores.entityStore.getAllByEntityType("direct-message")
    setMessages(selectConversationMessages(entities, currentUserId, recipientId))
  }, [cacheStores, currentUserId, recipientId])

  const { isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.directMessages.conversation(workspaceId, recipientId),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }
      if (!currentUserId || !recipientId) {
        return null
      }

      const queryEntities = application.getQueryEntities()
      const result = await queryEntities.execute(buildConversationQuery(currentUserId, recipientId))
      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return null
    },
    enabled:
      !!globalClient &&
      !!application &&
      !!currentUserId &&
      !!recipientId &&
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
 * Mutation hook for sending a direct message.
 * Entity drafts + cache updates are handled by the engine.
 */
export function useSendDirectMessage() {
  const { globalClient, application } = useEngineStore()

  return useMutation({
    mutationFn: async ({
      recipientId,
      text,
      quotedMessageId = null,
      mentions = [],
    }: {
      recipientId: string
      text: string
      quotedMessageId?: string | null
      mentions?: string[]
    }) => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        throw new Error("Direct messages are unavailable in local-only workspaces")
      }

      const metaFields: DirectMessageMetaFields = quotedMessageId
        ? {
            recipient_id: recipientId,
            quoted_message_id: quotedMessageId,
          }
        : {
            recipient_id: recipientId,
          }

      const createEntity = application.getCreateEntity()
      const messageResult = await createEntity.execute({
        entityType: "direct-message",
        content: { text },
        metaFields,
        mentionedUserIds: mentions,
      })

      if (messageResult.isFailed()) {
        throw new Error(messageResult.getError())
      }

      return {
        message: messageResult.getValue(),
        recipientId,
      }
    },
  })
}

/**
 * Mutation hook for deleting a direct message.
 * Only the sender can delete their own messages.
 */
export function useDeleteDirectMessage() {
  const { globalClient, application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ messageId, recipientId }: { messageId: string; recipientId: string }) => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        throw new Error("Direct messages are unavailable in local-only workspaces")
      }

      const deleteEntity = application.getDeleteEntity()
      const deleteResult = await deleteEntity.execute(messageId)
      if (deleteResult.isFailed()) {
        throw new Error(deleteResult.getError())
      }

      return { messageId, recipientId }
    },
  })
}
