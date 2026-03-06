import { useCallback, useEffect, useMemo, useState } from "react"
import type { ClientEntity, ReactionContent, ReactionMetaFields } from "../../../engine/models/entity"
import type { EntityType } from "../../../engine/utils/encryption-types"
import type { WorkspaceRuntime } from "../../../engine/workspace-runtime/workspace-runtime"
import { useReachability } from "../../hooks/use-reachability"
import { useAuthStore } from "../../store/auth-store"
import { useEngineStore } from "../../store/engine-store"
import { useStatusStore } from "../../store/status-store"
import { useReactions, type ReactionListItem } from "../../store/queries/use-reactions"
import { useWorkspaceMembers } from "../../store/queries/use-workspace-members"
import { ReactionPicker } from "./ReactionPicker"
import { ReactionPills } from "./ReactionPills"
import * as reactionStyles from "../../styles/reactions.css"

interface ReactionBarProps {
  entityId: string
  entityType: EntityType
  testIdPrefix?: string
  // If true, hide the ReactionPicker (add button). Used when picker is in hover toolbar.
  hideAddButton?: boolean
}

interface ReactionToggleOptions {
  onDeleteStart?: (reactionIds: string[]) => void
  onDeleteFailure?: (reactionIds: string[]) => void
}

const STATUS_DISMISS_MS = 4000

function buildReactionStatusId(entityType: EntityType, entityId: string, suffix: string): string {
  return `reaction-status-${entityType}-${entityId}-${suffix}`
}

function isReactionListItem(entity: ClientEntity): entity is ReactionListItem {
  return entity.entityType === "reaction" && typeof entity.content === "object" && entity.content !== null && "emoji" in entity.content
}

async function resolveReactionParentEntity(application: WorkspaceRuntime | null, entityId: string) {
  if (!application) {
    return undefined
  }

  const cachedEntity = application.getCacheStores().entityStore.get(entityId)
  if (cachedEntity) {
    return cachedEntity
  }

  const parentEntityResult = await application.getQueryEntityById().execute(entityId)
  if (parentEntityResult.isFailed()) {
    return undefined
  }

  return parentEntityResult.getValue()
}

/**
 * Hook that encapsulates reaction create/delete behavior using entity use cases.
 */
export function useReactionToggle(
  entityType: EntityType,
  entityId: string,
  reactionSnapshot?: ReactionListItem[],
  options: ReactionToggleOptions = {}
): (emoji: string) => Promise<void> {
  const { application } = useEngineStore()
  const { currentUser } = useAuthStore()
  const { upsertStatus, removeStatus } = useStatusStore()
  const { isOnline } = useReachability()
  const { data: hookReactions = [] } = useReactions(entityType, entityId)
  const reactions = reactionSnapshot ?? hookReactions
  const { onDeleteStart, onDeleteFailure } = options

  const currentUserId = currentUser?.uuid ?? application?.getWorkspaceInfoStore().userId ?? null

  const getCurrentParentReactions = useCallback((): ReactionListItem[] => {
    if (!application) {
      return reactions
    }

    const allReactionEntities = application
      .getCacheStores()
      .entityStore.getAllByEntityType("reaction")
      .filter(isReactionListItem)

    return allReactionEntities
      .filter(
        reaction => reaction.parentType === entityType && reaction.parentId === entityId
      )
      .sort((firstReaction, secondReaction) => firstReaction.createdAt.getTime() - secondReaction.createdAt.getTime())
  }, [application, reactions, entityType, entityId])

  const showReactionStatusMessage = useCallback(
    (statusId: string, message: string) => {
      upsertStatus({
        id: statusId,
        message,
        variant: "warning",
        isDismissible: true,
      })
      setTimeout(() => removeStatus(statusId), STATUS_DISMISS_MS)
    },
    [upsertStatus, removeStatus]
  )

  const handleReactionActionError = useCallback(
    (message: string) => {
      showReactionStatusMessage(buildReactionStatusId(entityType, entityId, "error"), message)
    },
    [showReactionStatusMessage, entityType, entityId]
  )

  const guardReactionAction = useCallback((): boolean => {
    if (!application || !entityId) {
      return false
    }

    if (!application.isWorkspaceRemote()) {
      handleReactionActionError("You need to be signed in to add a reaction.")
      return false
    }

    if (!isOnline) {
      showReactionStatusMessage(
        buildReactionStatusId(entityType, entityId, "offline"),
        "CAN'T CREATE REACTIONS WHILE OFFLINE."
      )
      return false
    }

    return true
  }, [application, entityId, isOnline, showReactionStatusMessage, entityType, handleReactionActionError])

  const deleteMatchingReactions = useCallback(
    async (matchingReactions: ReactionListItem[]) => {
      if (!application) return

      const deleteEntity = application.getDeleteEntity()
      const entityStore = application.getCacheStores().entityStore

      const reactionIds = matchingReactions.map(reaction => reaction.id)
      onDeleteStart?.(reactionIds)

      for (const reaction of matchingReactions) {
        const dirtySnapshot = entityStore.getDirtyVersion(reaction.id)
        const canonicalSnapshot = entityStore.getCanonical(reaction.id)
        const fallbackSnapshot = dirtySnapshot ?? canonicalSnapshot ?? reaction

        entityStore.delete(reaction.id)

        const deleteResult = await deleteEntity.execute(reaction.id, {
          entitySnapshot: fallbackSnapshot,
        })

        if (deleteResult.isFailed()) {
          if (dirtySnapshot) {
            entityStore.setDirtyVersion(dirtySnapshot)
          } else {
            entityStore.setCanonical(fallbackSnapshot)
          }
          onDeleteFailure?.([reaction.id])
          handleReactionActionError("Couldn't remove reaction. Try again.")
        }
      }
    },
    [application, handleReactionActionError, onDeleteFailure, onDeleteStart]
  )

  const createReactionEntity = useCallback(
    async (emoji: string) => {
      if (!application) {
        return
      }

      const parentEntity = await resolveReactionParentEntity(application, entityId)
      if (!parentEntity) {
        handleReactionActionError("Couldn't resolve reaction target. Try again.")
        return
      }

      const createEntity = application.getCreateEntity()
      const createResult = await createEntity.execute<ReactionContent, ReactionMetaFields>({
        entityType: "reaction",
        parent: parentEntity as ClientEntity,
        content: { emoji },
      })

      if (createResult.isFailed()) {
        handleReactionActionError("Couldn't create reaction. Try again.")
      }
    },
    [application, entityId, handleReactionActionError]
  )

  return useCallback(
    async (emoji: string) => {
      if (!guardReactionAction()) {
        return
      }

      if (!currentUserId) {
        return
      }

      const trimmedEmoji = emoji.trim()
      if (!trimmedEmoji) {
        return
      }

      const matchingReactions = getCurrentParentReactions().filter(
        reaction => reaction.creatorId === currentUserId && reaction.content.emoji === trimmedEmoji
      )

      if (matchingReactions.length > 0) {
        await deleteMatchingReactions(matchingReactions)
        return
      }

      await createReactionEntity(trimmedEmoji)
    },
    [guardReactionAction, currentUserId, getCurrentParentReactions, deleteMatchingReactions, createReactionEntity]
  )
}

export function ReactionBar({ entityId, entityType, testIdPrefix = "reaction", hideAddButton = false }: ReactionBarProps) {
  const { application } = useEngineStore()
  const { currentUser } = useAuthStore()
  const { data: reactions = [] } = useReactions(entityType, entityId)
  const { data: members = [] } = useWorkspaceMembers()
  const [hiddenReactionIds, setHiddenReactionIds] = useState<Set<string>>(() => new Set())

  const hideReactionIds = useCallback((reactionIds: string[]) => {
    if (reactionIds.length === 0) return
    setHiddenReactionIds(previous => {
      const next = new Set(previous)
      for (const reactionId of reactionIds) {
        next.add(reactionId)
      }
      return next
    })
  }, [])

  const restoreReactionIds = useCallback((reactionIds: string[]) => {
    if (reactionIds.length === 0) return
    setHiddenReactionIds(previous => {
      const next = new Set(previous)
      let changed = false
      for (const reactionId of reactionIds) {
        if (next.delete(reactionId)) {
          changed = true
        }
      }
      return changed ? next : previous
    })
  }, [])

  useEffect(() => {
    setHiddenReactionIds(new Set())
  }, [entityId, entityType])

  const visibleReactions = useMemo(() => {
    if (hiddenReactionIds.size === 0) {
      return reactions
    }
    return reactions.filter(reaction => !hiddenReactionIds.has(reaction.id))
  }, [reactions, hiddenReactionIds])

  const toggleOptions = useMemo(
    () => ({
      onDeleteStart: hideReactionIds,
      onDeleteFailure: restoreReactionIds,
    }),
    [hideReactionIds, restoreReactionIds]
  )

  const handleToggleReactionForEmoji = useReactionToggle(entityType, entityId, reactions, toggleOptions)

  const currentUserId = currentUser?.uuid ?? application?.getWorkspaceInfoStore().userId ?? null
  const memberNameLookup = useMemo(() => {
    const map = new Map<string, string>()
    for (const member of members) {
      map.set(member.userId, member.displayName || member.user?.email || "Unknown")
    }
    return map
  }, [members])

  const resolveWorkspaceMemberDisplayName = useCallback(
    (userId: string): string => {
      return memberNameLookup.get(userId) ?? "Unknown"
    },
    [memberNameLookup]
  )

  if (!entityId) {
    return null
  }

  return (
    <div className={reactionStyles.reactionBar} data-testid={`${testIdPrefix}-reaction-bar`}>
      <ReactionPills
        reactions={visibleReactions}
        currentUserId={currentUserId}
        resolveDisplayName={resolveWorkspaceMemberDisplayName}
        onToggleReaction={handleToggleReactionForEmoji}
        testIdPrefix={testIdPrefix}
      />
      {!hideAddButton && (
        <ReactionPicker
          onEmojiSelect={handleToggleReactionForEmoji}
          testId={`${testIdPrefix}-reaction-add`}
          ariaLabel="Add reaction"
        />
      )}
    </div>
  )
}
