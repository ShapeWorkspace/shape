import { useCallback, useMemo, useState, useRef, useEffect, type ReactNode } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { MessageCircle, FileEdit, CheckSquare, Inbox, Smile, ArrowLeft } from "lucide-react"
import { useEngineStore } from "../store/engine-store"
import { useWindowStore } from "../store/window-store"
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "../store/queries/use-notifications"
import { useWorkspaceMembers } from "../store/queries/use-workspace-members"
import { List, ListRow, ListSearch, ListEmpty, useListContext } from "../components/ListUI"
import type { ToolType } from "../store/types"
import type {
  InAppNotification,
  NotificationActionType,
  NotificationEntityReferenceType,
} from "../../engine/models/notification"
import type { ClientEntity } from "../../engine/models/entity"
import type { EntityType } from "../../engine/utils/encryption-types"
import {
  buildNotificationVerb,
  getNotificationDescription,
  type NotificationDisplayCopy,
} from "../utils/notification-display"
import { getEntityName, getEntityTitle } from "../utils/entity-content"
import * as notificationStyles from "../styles/notification.css"

interface NotificationGroupItem {
  groupKey: string
  parentEntityId: string
  parentEntityType: NotificationEntityReferenceType
  notifications: InAppNotification[]
  latestNotification: InAppNotification
  totalCount: number
  unreadCount: number
}

const buildEntityKey = (entityType: NotificationEntityReferenceType, entityId: string): string =>
  `${entityType}:${entityId}`

const RETRY_DELAY_MS = 2000
const MAX_ENTITY_FETCH_ATTEMPTS = 6

function matchesNotificationEntityType(
  notificationEntityType: NotificationEntityReferenceType,
  entityType: EntityType
): boolean {
  return notificationEntityType !== "user" && notificationEntityType === entityType
}

function formatRelativeTime(timestamp: Date): string {
  const diff = Date.now() - timestamp.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

function InboxNotificationRow({
  index,
  copy,
  icon,
  timestamp,
  unread,
  onSelect,
  testId,
  parentEntityId,
}: {
  index: number
  copy: NotificationDisplayCopy
  icon: ReactNode
  timestamp: Date
  unread: boolean
  onSelect: () => void
  testId: string
  parentEntityId: string
}) {
  const listContext = useListContext()
  const isSelected = listContext?.selectedIndex === index

  const handleMouseEnter = () => {
    listContext?.setSelectedIndex(index)
  }

  return (
    <div
      className={notificationStyles.notificationItem}
      data-selected={isSelected}
      data-unread={unread}
      data-notification-parent-id={parentEntityId}
      onClick={onSelect}
      onMouseEnter={handleMouseEnter}
      data-testid={testId}
    >
      <span className={notificationStyles.notificationIcon}>{icon}</span>
      <div className={notificationStyles.notificationContent}>
        <div className={notificationStyles.notificationTitle}>{copy.title}</div>
        <div className={notificationStyles.notificationDescription}>{copy.description}</div>
      </div>
      <span className={notificationStyles.notificationTime}>{formatRelativeTime(timestamp)}</span>
      {unread && <span className={notificationStyles.notificationUnreadDot} />}
    </div>
  )
}

function getNotificationIconForActionType(actionType: NotificationActionType) {
  switch (actionType) {
    case "task_assigned":
    case "task_created_in_subscribed_project":
    case "task_comment":
    case "task_mention":
      return <CheckSquare size={16} />
    case "discussion_reply":
    case "discussion_mention":
      return <MessageCircle size={16} />
    case "paper_comment":
    case "paper_comment_reply":
    case "paper_comment_mention":
      return <MessageCircle size={16} />
    case "paper_mention":
    case "paper_shared":
    case "folder_shared":
      return <FileEdit size={16} />
    case "group_message":
    case "group_added":
      return <MessageCircle size={16} />
    case "dm_received":
      return <MessageCircle size={16} />
    default:
      return <MessageCircle size={16} />
  }
}

/**
 * InboxTool displays notifications and allows navigation to related items.
 */
export function InboxTool() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const { navigateTo } = useWindowStore()
  const { data: notifications = [], isLoading } = useNotifications()
  const { data: workspaceMembers = [] } = useWorkspaceMembers()
  const { mutateAsync: markNotificationRead } = useMarkNotificationRead()
  const { mutateAsync: markAllNotificationsRead } = useMarkAllNotificationsRead()
  const [searchQuery, setSearchQuery] = useState("")
  const [reactionViewOverrideEnabled, setReactionViewOverrideEnabled] = useState(
    () => searchParams.get("view") === "reactions"
  )
  const [, setEntityStoreVersion] = useState(0)
  const pendingEntityFetchesRef = useRef<Set<string>>(new Set())
  const isReactionView = reactionViewOverrideEnabled || searchParams.get("view") === "reactions"
  const currentUserId = application?.getAccountUserId()
  const cacheStores = application?.getCacheStores()
  const entityStore = cacheStores?.entityStore
  const queryEntityById = application?.getQueryEntityById()
  const isWorkspaceRegisteredWithServer = application?.isWorkspaceRemote()

  const reactionNotifications = useMemo(
    () => notifications.filter(notification => notification.actionType === "reaction_added"),
    [notifications]
  )
  const nonReactionNotifications = useMemo(
    () => notifications.filter(notification => notification.actionType !== "reaction_added"),
    [notifications]
  )

  useEffect(() => {
    if (!isReactionView) return
    const unreadReactions = reactionNotifications.filter(notification => !notification.readAt)
    if (unreadReactions.length === 0) return
    Promise.all(unreadReactions.map(notification => markNotificationRead(notification.id))).catch(() => {})
  }, [isReactionView, reactionNotifications, markNotificationRead])

  useEffect(() => {
    if (!entityStore) return
    const unsubscribe = entityStore.subscribe(() => {
      setEntityStoreVersion(version => version + 1)
    })
    return unsubscribe
  }, [entityStore])

  const getCachedNotificationEntity = useCallback(
    (entityType: NotificationEntityReferenceType, entityId: string): ClientEntity | undefined => {
      if (!entityStore || !entityId.trim()) return undefined
      const cachedEntity = entityStore.get(entityId)
      if (!cachedEntity) return undefined
      if (!matchesNotificationEntityType(entityType, cachedEntity.entityType)) {
        return undefined
      }
      return cachedEntity
    },
    [entityStore]
  )

  const fetchNotificationEntityById = useCallback(
    async (
      entityType: NotificationEntityReferenceType,
      entityId: string,
      options: { attempts?: number } = {}
    ): Promise<ClientEntity | undefined> => {
      if (!entityId.trim()) return undefined
      const cachedEntity = getCachedNotificationEntity(entityType, entityId)
      if (cachedEntity) return cachedEntity
      if (!queryEntityById || !isWorkspaceRegisteredWithServer || entityType === "user") {
        return undefined
      }

      const attempts = options.attempts ?? 1
      const pendingFetches = pendingEntityFetchesRef.current
      const entityKey = buildEntityKey(entityType, entityId)

      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (pendingFetches.has(entityKey)) {
          return getCachedNotificationEntity(entityType, entityId)
        }

        pendingFetches.add(entityKey)
        const result = await queryEntityById.execute(entityId)
        pendingFetches.delete(entityKey)

        if (!result.isFailed()) {
          const fetchedEntity = result.getValue()
          if (matchesNotificationEntityType(entityType, fetchedEntity.entityType)) {
            return fetchedEntity
          }
        }

        if (attempt < attempts - 1) {
          await new Promise<void>(resolve => {
            window.setTimeout(() => {
              resolve()
            }, RETRY_DELAY_MS)
          })
        }
      }

      return getCachedNotificationEntity(entityType, entityId)
    },
    [getCachedNotificationEntity, isWorkspaceRegisteredWithServer, queryEntityById]
  )

  const resolveNotificationActorDisplayName = useCallback(
    (userId: string): string => {
      const trimmedUserId = userId.trim()
      if (!trimmedUserId) {
        return "Someone"
      }

      const member = workspaceMembers.find(member => member.userId === trimmedUserId || member.id === trimmedUserId)
      if (!member) {
        return trimmedUserId
      }

      const displayName = member.displayName?.trim()
      if (displayName) {
        return displayName
      }

      const profileName = member.profile?.name?.trim()
      if (profileName) {
        return profileName
      }

      const email = member.user?.email?.trim()
      if (email) {
        const emailLocalPart = email.split("@")[0]?.trim()
        return emailLocalPart || email
      }

      return trimmedUserId
    },
    [workspaceMembers]
  )

  const resolveTaskTitleForNotification = useCallback(
    (taskId: string): string | null => {
      return getEntityTitle(getCachedNotificationEntity("task", taskId))
    },
    [getCachedNotificationEntity]
  )

  const resolveProjectNameForNotification = useCallback(
    (projectId: string): string | null => {
      return getEntityName(getCachedNotificationEntity("project", projectId))
    },
    [getCachedNotificationEntity]
  )

  const resolveDiscussionTitleForNotification = useCallback(
    (discussionId: string): string | null => {
      return getEntityTitle(getCachedNotificationEntity("forum-discussion", discussionId))
    },
    [getCachedNotificationEntity]
  )

  const resolveChannelNameForNotification = useCallback(
    (channelId: string): string | null => {
      return getEntityName(getCachedNotificationEntity("forum-channel", channelId))
    },
    [getCachedNotificationEntity]
  )

  const resolveGroupChatNameForNotification = useCallback(
    (groupChatId: string): string | null => {
      return getEntityName(getCachedNotificationEntity("group-chat", groupChatId))
    },
    [getCachedNotificationEntity]
  )

  const resolveGroupChatContextForMessageId = useCallback(
    (messageId: string): { groupChatId: string; groupChatName: string | null } | null => {
      const groupMessage = getCachedNotificationEntity("group-message", messageId)
      if (!groupMessage?.parentId) return null
      return {
        groupChatId: groupMessage.parentId,
        groupChatName: resolveGroupChatNameForNotification(groupMessage.parentId),
      }
    },
    [getCachedNotificationEntity, resolveGroupChatNameForNotification]
  )

  const resolveTaskContextForCommentId = useCallback(
    (commentId: string): { taskId: string; projectId: string; taskTitle: string | null } | null => {
      const taskComment = getCachedNotificationEntity("task-comment", commentId)
      if (!taskComment?.parentId) return null
      const task = getCachedNotificationEntity("task", taskComment.parentId)
      if (!task?.parentId) return null
      return {
        taskId: task.id,
        projectId: task.parentId,
        taskTitle: getEntityTitle(task),
      }
    },
    [getCachedNotificationEntity]
  )

  const resolveDiscussionContextForReplyId = useCallback(
    (replyId: string): { discussionId: string; channelId: string; discussionTitle: string | null } | null => {
      const reply = getCachedNotificationEntity("forum-reply", replyId)
      if (!reply?.parentId) return null
      const discussion = getCachedNotificationEntity("forum-discussion", reply.parentId)
      if (!discussion?.parentId) return null
      return {
        discussionId: discussion.id,
        channelId: discussion.parentId,
        discussionTitle: getEntityTitle(discussion),
      }
    },
    [getCachedNotificationEntity]
  )

  const resolvePaperNameForNotification = useCallback(
    (paperId: string): string | null => {
      return getEntityName(getCachedNotificationEntity("paper", paperId))
    },
    [getCachedNotificationEntity]
  )

  const resolvePaperNameForCommentNotification = useCallback(
    (commentId: string): string | null => {
      const paperComment = getCachedNotificationEntity("paper-comment", commentId)
      if (!paperComment?.parentId) return null
      return resolvePaperNameForNotification(paperComment.parentId)
    },
    [getCachedNotificationEntity, resolvePaperNameForNotification]
  )

  const resolveFileNameForNotification = useCallback(
    (fileId: string): string | null => {
      return getEntityName(getCachedNotificationEntity("file", fileId))
    },
    [getCachedNotificationEntity]
  )

  const resolveFolderNameForNotification = useCallback(
    (folderId: string): string | null => {
      return getEntityName(getCachedNotificationEntity("folder", folderId))
    },
    [getCachedNotificationEntity]
  )

  useEffect(() => {
    if (!isWorkspaceRegisteredWithServer) return
    const tasks = notifications.map(async notification => {
      await Promise.all([
        fetchNotificationEntityById(notification.parentEntityType, notification.parentEntityId, {
          attempts: MAX_ENTITY_FETCH_ATTEMPTS,
        }),
        fetchNotificationEntityById(notification.targetEntityType, notification.targetEntityId, {
          attempts: MAX_ENTITY_FETCH_ATTEMPTS,
        }),
      ])

      if (notification.actionType === "paper_comment_reply" || notification.actionType === "paper_comment_mention") {
        if (notification.parentEntityType === "paper-comment") {
          const paperComment = await fetchNotificationEntityById("paper-comment", notification.parentEntityId, {
            attempts: MAX_ENTITY_FETCH_ATTEMPTS,
          })
          if (paperComment?.parentId) {
            await fetchNotificationEntityById("paper", paperComment.parentId, {
              attempts: MAX_ENTITY_FETCH_ATTEMPTS,
            })
          }
        }
      }

      if (notification.actionType !== "reaction_added") {
        return
      }

      if (notification.targetEntityType === "task-comment") {
        const taskComment = await fetchNotificationEntityById("task-comment", notification.targetEntityId, {
          attempts: MAX_ENTITY_FETCH_ATTEMPTS,
        })
        if (taskComment?.parentId) {
          const task = await fetchNotificationEntityById("task", taskComment.parentId, {
            attempts: MAX_ENTITY_FETCH_ATTEMPTS,
          })
          if (task?.parentId) {
            await fetchNotificationEntityById("project", task.parentId, {
              attempts: MAX_ENTITY_FETCH_ATTEMPTS,
            })
          }
        }
      }

      if (notification.targetEntityType === "forum-reply") {
        const forumReply = await fetchNotificationEntityById("forum-reply", notification.targetEntityId, {
          attempts: MAX_ENTITY_FETCH_ATTEMPTS,
        })
        if (forumReply?.parentId) {
          const discussion = await fetchNotificationEntityById("forum-discussion", forumReply.parentId, {
            attempts: MAX_ENTITY_FETCH_ATTEMPTS,
          })
          if (discussion?.parentId) {
            await fetchNotificationEntityById("forum-channel", discussion.parentId, {
              attempts: MAX_ENTITY_FETCH_ATTEMPTS,
            })
          }
        }
      }

      if (notification.targetEntityType === "group-message") {
        const groupMessage = await fetchNotificationEntityById("group-message", notification.targetEntityId, {
          attempts: MAX_ENTITY_FETCH_ATTEMPTS,
        })
        if (groupMessage?.parentId) {
          await fetchNotificationEntityById("group-chat", groupMessage.parentId, {
            attempts: MAX_ENTITY_FETCH_ATTEMPTS,
          })
        }
      }
    })

    void Promise.all(tasks)
  }, [
    fetchNotificationEntityById,
    isWorkspaceRegisteredWithServer,
    notifications,
  ])

  // Resolve the entity name for a notification based on its action type.
  // Some action types use the parent entity, others use the target entity.
  const resolveEntityNameForNotification = useCallback(
    (notification: InAppNotification): string | null => {
      switch (notification.actionType) {
        case "task_assigned":
        case "task_comment":
        case "task_mention":
          return resolveTaskTitleForNotification(notification.parentEntityId)

        case "task_created_in_subscribed_project":
          // Handled specially in resolveNotificationDisplayCopy due to dual-entity logic.
          return null

        case "discussion_reply":
        case "discussion_mention":
          return resolveDiscussionTitleForNotification(notification.parentEntityId)

        case "paper_mention":
        case "paper_comment":
          return resolvePaperNameForNotification(notification.parentEntityId)

        case "paper_shared":
          if (notification.targetEntityType === "file") {
            return resolveFileNameForNotification(notification.targetEntityId)
          }
          return resolvePaperNameForNotification(notification.targetEntityId)

        case "paper_comment_reply":
          return resolvePaperNameForCommentNotification(notification.parentEntityId)

        case "paper_comment_mention":
          if (notification.parentEntityType === "paper-comment") {
            return resolvePaperNameForCommentNotification(notification.parentEntityId)
          }
          return resolvePaperNameForNotification(notification.parentEntityId)

        case "folder_shared":
          return resolveFolderNameForNotification(notification.parentEntityId)

        case "group_message":
        case "group_added":
          return resolveGroupChatNameForNotification(notification.parentEntityId)

        case "dm_received":
        default:
          return null
      }
    },
    [
      resolveTaskTitleForNotification,
      resolveDiscussionTitleForNotification,
      resolvePaperNameForNotification,
      resolvePaperNameForCommentNotification,
      resolveFileNameForNotification,
      resolveFolderNameForNotification,
      resolveGroupChatNameForNotification,
    ]
  )

  const resolveNotificationDisplayCopy = useCallback(
    (notification: InAppNotification, totalCount: number): NotificationDisplayCopy => {
      const actorName = resolveNotificationActorDisplayName(
        notification.latestActorId || notification.actorUserId
      )
      const extraCount = Math.max(totalCount - 1, 0)
      const extraSuffix =
        extraCount > 0
          ? ` (+${extraCount} more ${extraCount === 1 ? "notification" : "notifications"})`
          : ""

      // Special case: task_created_in_subscribed_project has different verbs depending
      // on whether we resolved the task name or the project name.
      if (notification.actionType === "task_created_in_subscribed_project") {
        const taskTitle = resolveTaskTitleForNotification(notification.targetEntityId)
        const projectName = resolveProjectNameForNotification(notification.parentEntityId)
        const verb = taskTitle
          ? `created ${taskTitle} in a project you follow`
          : projectName
            ? `created a task in ${projectName}`
            : "created a task in a project you follow"
        return {
          title: `${actorName} ${verb}${extraSuffix}`,
          description: "Project",
        }
      }

      const entityName = resolveEntityNameForNotification(notification)
      const verb = buildNotificationVerb(
        notification.actionType,
        entityName,
        notification.targetEntityType
      )
      const description = getNotificationDescription(
        notification.actionType,
        notification.targetEntityType
      )

      return {
        title: `${actorName} ${verb}${extraSuffix}`,
        description,
      }
    },
    [
      resolveNotificationActorDisplayName,
      resolveEntityNameForNotification,
      resolveTaskTitleForNotification,
      resolveProjectNameForNotification,
    ]
  )

  const resolveNotificationGroupDisplayCopy = useCallback(
    (group: NotificationGroupItem): NotificationDisplayCopy => {
      const baseNotificationCopy = resolveNotificationDisplayCopy(group.latestNotification, group.totalCount)
      if (group.latestNotification.actionType !== "group_message") {
        return baseNotificationCopy
      }

      // Group chats should summarize message counts and list senders when possible.
      const groupChatName =
        resolveGroupChatNameForNotification(group.latestNotification.parentEntityId) ?? "Group chat"
      const groupMessageNotifications = group.notifications.filter(
        notification => notification.actionType === "group_message"
      )
      const groupMessageCount = Math.max(
        groupMessageNotifications.reduce((sum, notification) => sum + Math.max(notification.count, 1), 0),
        1
      )
      const uniqueGroupMessageSenderDisplayNames = new Set<string>()
      groupMessageNotifications.forEach(notification => {
        const groupMessageActorIds = [notification.actorUserId, notification.latestActorId].filter(
          actorId => actorId.trim() !== ""
        )
        groupMessageActorIds.forEach(actorId => {
          uniqueGroupMessageSenderDisplayNames.add(resolveNotificationActorDisplayName(actorId))
        })
      })
      const groupMessageSenderLabel = Array.from(uniqueGroupMessageSenderDisplayNames).join(", ")
      return {
        title: `${groupMessageCount} new message${groupMessageCount === 1 ? "" : "s"} in ${groupChatName}`,
        description: groupMessageSenderLabel || "Someone",
      }
    },
    [
      resolveNotificationDisplayCopy,
      resolveGroupChatNameForNotification,
      resolveNotificationActorDisplayName,
    ]
  )

  const resolveReactionNotificationCopy = useCallback(
    (notification: InAppNotification): NotificationDisplayCopy => {
      const actorName = resolveNotificationActorDisplayName(
        notification.latestActorId || notification.actorUserId
      )

      let titleVerb = "reacted to your item"
      let description = "Reaction"

      switch (notification.targetEntityType) {
        case "task": {
          const taskTitle = resolveTaskTitleForNotification(notification.targetEntityId)
          titleVerb = taskTitle ? `reacted to ${taskTitle}` : "reacted to your task"
          description = "Task"
          break
        }
        case "task-comment": {
          const taskContext = resolveTaskContextForCommentId(notification.targetEntityId)
          titleVerb = taskContext?.taskTitle
            ? `reacted to a comment on ${taskContext.taskTitle}`
            : "reacted to your task comment"
          description = "Task comment"
          break
        }
        case "forum-discussion": {
          const discussionTitle = resolveDiscussionTitleForNotification(notification.targetEntityId)
          titleVerb = discussionTitle ? `reacted to ${discussionTitle}` : "reacted to your discussion"
          description = "Discussion"
          break
        }
        case "forum-reply": {
          const replyContext = resolveDiscussionContextForReplyId(notification.targetEntityId)
          titleVerb = replyContext?.discussionTitle
            ? `reacted to your reply in ${replyContext.discussionTitle}`
            : "reacted to your reply"
          description = "Reply"
          break
        }
        case "direct-message": {
          titleVerb = "reacted to your direct message"
          description = "Direct message"
          break
        }
        case "group-message": {
          titleVerb = "reacted to your group message"
          const groupContext = resolveGroupChatContextForMessageId(notification.targetEntityId)
          description = groupContext?.groupChatName ?? "Group chat"
          break
        }
        default:
          break
      }

      return {
        title: `${actorName} ${titleVerb}`,
        description,
      }
    },
    [
      resolveNotificationActorDisplayName,
      resolveTaskTitleForNotification,
      resolveDiscussionTitleForNotification,
      resolveGroupChatContextForMessageId,
      resolveTaskContextForCommentId,
      resolveDiscussionContextForReplyId,
    ]
  )

  const groupedNotifications = useMemo<NotificationGroupItem[]>(() => {
    const grouped = new Map<string, NotificationGroupItem>()

    for (const notification of nonReactionNotifications) {
      const groupKey = `${notification.parentEntityType}:${notification.parentEntityId}`
      const occurrenceCount = Math.max(notification.count, 1)
      const existing = grouped.get(groupKey)

      if (!existing) {
        grouped.set(groupKey, {
          groupKey,
          parentEntityId: notification.parentEntityId,
          parentEntityType: notification.parentEntityType,
          notifications: [notification],
          latestNotification: notification,
          totalCount: occurrenceCount,
          unreadCount: notification.readAt ? 0 : 1,
        })
        continue
      }

      existing.notifications.push(notification)
      existing.totalCount += occurrenceCount
      if (!notification.readAt) {
        existing.unreadCount += 1
      }
      if (notification.updatedAt.getTime() > existing.latestNotification.updatedAt.getTime()) {
        existing.latestNotification = notification
      }
    }

    return Array.from(grouped.values()).sort((a, b) => {
      const unreadRankA = a.unreadCount > 0 ? 0 : 1
      const unreadRankB = b.unreadCount > 0 ? 0 : 1
      if (unreadRankA !== unreadRankB) {
        return unreadRankA - unreadRankB
      }
      return b.latestNotification.updatedAt.getTime() - a.latestNotification.updatedAt.getTime()
    })
  }, [nonReactionNotifications])

  const filteredGroups = useMemo(() => {
    if (!searchQuery) return groupedNotifications
    const lowered = searchQuery.toLowerCase()
    return groupedNotifications.filter(group => {
      const copy = resolveNotificationGroupDisplayCopy(group)
      return (
        copy.title.toLowerCase().includes(lowered) || copy.description.toLowerCase().includes(lowered)
      )
    })
  }, [groupedNotifications, resolveNotificationGroupDisplayCopy, searchQuery])

  const showMarkAllRow = filteredGroups.some(group => group.unreadCount > 0)
  const reactionUnreadCount = useMemo(
    () => reactionNotifications.filter(notification => !notification.readAt).length,
    [reactionNotifications]
  )
  const reactionSummaryDescription = useMemo(() => {
    if (reactionNotifications.length === 0) {
      return "No reactions yet"
    }
    if (reactionUnreadCount > 0) {
      return `${reactionUnreadCount} new reaction${reactionUnreadCount === 1 ? "" : "s"}`
    }
    return `${reactionNotifications.length} reaction${reactionNotifications.length === 1 ? "" : "s"}`
  }, [reactionNotifications.length, reactionUnreadCount])

  const listItems = useMemo(() => {
    const items: Array<
      | { type: "mark_all" }
      | { type: "notification"; group: NotificationGroupItem }
      | { type: "reactions" }
    > = []
    if (showMarkAllRow) {
      items.push({ type: "mark_all" })
    }
    filteredGroups.forEach(group => {
      items.push({ type: "notification", group })
    })
    items.push({ type: "reactions" })
    return items
  }, [filteredGroups, showMarkAllRow])

  const reactionListItems = useMemo(() => {
    const filteredReactions = reactionNotifications
      .filter(notification => {
        if (!searchQuery) return true
        const copy = resolveReactionNotificationCopy(notification)
        const lowered = searchQuery.toLowerCase()
        return (
          copy.title.toLowerCase().includes(lowered) ||
          copy.description.toLowerCase().includes(lowered)
        )
      })
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())

    return [
      { type: "back" as const },
      ...filteredReactions.map(notification => ({ type: "reaction" as const, notification })),
    ]
  }, [reactionNotifications, resolveReactionNotificationCopy, searchQuery])

  const handleOpenReactionsView = useCallback(() => {
    // Use navigation to ensure the URL search string updates consistently across render cycles.
    setReactionViewOverrideEnabled(true)
    if (workspaceId) {
      navigate(`/w/${workspaceId}/inbox?view=reactions`, { replace: true })
      return
    }
    navigate({ search: "?view=reactions" }, { replace: true })
  }, [navigate, workspaceId])

  const handleReturnToInboxView = useCallback(() => {
    setReactionViewOverrideEnabled(false)
    if (workspaceId) {
      navigate(`/w/${workspaceId}/inbox`, { replace: true })
      return
    }
    navigate({ search: "" }, { replace: true })
  }, [navigate, workspaceId])

  const handleOpenNotificationGroup = useCallback(
    async (group: NotificationGroupItem) => {
      const unreadNotifications = group.notifications.filter(notification => !notification.readAt)
      if (unreadNotifications.length > 0) {
        await Promise.all(unreadNotifications.map(notification => markNotificationRead(notification.id)))
      }

      if (!workspaceId) return

      const notification = group.latestNotification
      const parentType = notification.parentEntityType
      const targetType = notification.targetEntityType

      if (parentType === "group-chat") {
        navigateTo({
          id: notification.parentEntityId,
          label: resolveGroupChatNameForNotification(notification.parentEntityId) ?? "Group",
          tool: "groups",
          itemId: notification.parentEntityId,
        })
        navigate(`/w/${workspaceId}/groups/${notification.parentEntityId}`)
        return
      }

      if (parentType === "forum-channel") {
        navigateTo({
          id: notification.parentEntityId,
          label: resolveChannelNameForNotification(notification.parentEntityId) ?? "Forum",
          tool: "forum",
          itemId: notification.parentEntityId,
        })
        navigate(`/w/${workspaceId}/forum/${notification.parentEntityId}`)
        return
      }

      if (parentType === "forum-discussion") {
        const discussion =
          getCachedNotificationEntity("forum-discussion", notification.parentEntityId) ??
          (await fetchNotificationEntityById("forum-discussion", notification.parentEntityId))
        if (discussion?.parentId) {
          navigateTo({
            id: discussion.id,
            label: getEntityTitle(discussion) ?? "Discussion",
            tool: "forum",
            itemId: discussion.parentId,
            discussionId: discussion.id,
          })
          navigate(`/w/${workspaceId}/forum/${discussion.parentId}/discussions/${discussion.id}`)
          return
        }
      }

      if (targetType === "paper") {
        navigateTo({
          id: notification.targetEntityId,
          label: resolvePaperNameForNotification(notification.targetEntityId) ?? "Paper",
          tool: "papers",
          itemId: notification.targetEntityId,
        })
        navigate(`/w/${workspaceId}/papers/${notification.targetEntityId}`)
        return
      }

      if (targetType === "paper-comment" && parentType === "paper") {
        navigateTo({
          id: notification.parentEntityId,
          label: resolvePaperNameForNotification(notification.parentEntityId) ?? "Paper",
          tool: "papers",
          itemId: notification.parentEntityId,
          commentId: notification.targetEntityId,
        })
        navigate(
          `/w/${workspaceId}/papers/${notification.parentEntityId}?commentId=${notification.targetEntityId}`
        )
        return
      }

      if (targetType === "paper-comment-reply" && parentType === "paper-comment") {
        const parentComment =
          getCachedNotificationEntity("paper-comment", notification.parentEntityId) ??
          (await fetchNotificationEntityById("paper-comment", notification.parentEntityId))
        if (parentComment?.parentId) {
          navigateTo({
            id: parentComment.parentId,
            label: resolvePaperNameForNotification(parentComment.parentId) ?? "Paper",
            tool: "papers",
            itemId: parentComment.parentId,
            commentId: parentComment.id,
          })
          navigate(`/w/${workspaceId}/papers/${parentComment.parentId}?commentId=${parentComment.id}`)
          return
        }
      }

      if (targetType === "folder") {
        const targetFolderId = notification.parentEntityId
        navigateTo({
          id: targetFolderId,
          label: resolveFolderNameForNotification(targetFolderId) ?? "Folder",
          tool: "files",
          folderId: targetFolderId,
        })
        navigate(`/w/${workspaceId}/files?folder=${targetFolderId}`)
        return
      }

      if (targetType === "file") {
        navigateTo({
          id: notification.targetEntityId,
          label: resolveFileNameForNotification(notification.targetEntityId) ?? "File",
          tool: "files",
          itemId: notification.targetEntityId,
        })
        navigate(`/w/${workspaceId}/files/${notification.targetEntityId}`)
        return
      }

      if (parentType === "user") {
        navigateTo({
          id: notification.parentEntityId,
          label: resolveNotificationActorDisplayName(notification.parentEntityId),
          tool: "contacts",
          itemId: notification.parentEntityId,
        })
        navigate(`/w/${workspaceId}/contacts/${notification.parentEntityId}`)
        return
      }

      if (parentType === "project") {
        navigateTo({
          id: notification.parentEntityId,
          label: resolveProjectNameForNotification(notification.parentEntityId) ?? "Project",
          tool: "projects",
          itemId: notification.parentEntityId,
        })
        navigate(`/w/${workspaceId}/projects/${notification.parentEntityId}`)
        return
      }

      if (parentType === "task" || targetType === "task") {
        const taskId =
          parentType === "task" ? notification.parentEntityId : notification.targetEntityId
        const task =
          getCachedNotificationEntity("task", taskId) ??
          (await fetchNotificationEntityById("task", taskId))
        if (task?.parentId) {
          navigateTo({
            id: `${task.parentId}-${task.id}`,
            label: getEntityTitle(task) ?? "Task",
            tool: "projects",
            itemId: task.parentId,
            taskId: task.id,
          })
          navigate(`/w/${workspaceId}/projects/${task.parentId}/tasks/${task.id}`)
          return
        }
      }

      const parentTool = resolveFallbackToolForEntityType(parentType)
      if (parentTool) {
        navigateTo({
          id: notification.parentEntityId,
          label: "Notification",
          tool: parentTool,
        })
        navigate(`/w/${workspaceId}/${parentTool}`)
      }
    },
    [
      markNotificationRead,
      workspaceId,
      navigate,
      navigateTo,
      resolveGroupChatNameForNotification,
      resolveChannelNameForNotification,
      resolvePaperNameForNotification,
      resolveFolderNameForNotification,
      resolveFileNameForNotification,
      resolveProjectNameForNotification,
      resolveNotificationActorDisplayName,
      getCachedNotificationEntity,
      fetchNotificationEntityById,
    ]
  )

  const handleOpenReactionNotification = useCallback(
    async (notification: InAppNotification) => {
      if (!workspaceId) return

      switch (notification.targetEntityType) {
        case "direct-message": {
          if (!currentUserId) break
          const directMessage =
            getCachedNotificationEntity("direct-message", notification.targetEntityId) ??
            (await fetchNotificationEntityById("direct-message", notification.targetEntityId))
          if (!directMessage) break
          const recipientId =
            "recipient_id" in directMessage.metaFields &&
            typeof directMessage.metaFields.recipient_id === "string"
              ? directMessage.metaFields.recipient_id
              : undefined
          if (!recipientId) break
          const otherUserId = directMessage.creatorId === currentUserId ? recipientId : directMessage.creatorId
          navigateTo({
            id: otherUserId,
            label: resolveNotificationActorDisplayName(otherUserId),
            tool: "contacts",
            itemId: otherUserId,
          })
          navigate(`/w/${workspaceId}/contacts/${otherUserId}`)
          return
        }
        case "group-message": {
          let groupContext = resolveGroupChatContextForMessageId(notification.targetEntityId)
          if (!groupContext) {
            const groupMessage = await fetchNotificationEntityById(
              "group-message",
              notification.targetEntityId
            )
            if (groupMessage?.parentId) {
              groupContext = {
                groupChatId: groupMessage.parentId,
                groupChatName: resolveGroupChatNameForNotification(groupMessage.parentId),
              }
            }
          }
          if (groupContext) {
            navigateTo({
              id: groupContext.groupChatId,
              label: groupContext.groupChatName ?? "Group",
              tool: "groups",
              itemId: groupContext.groupChatId,
            })
            navigate(`/w/${workspaceId}/groups/${groupContext.groupChatId}`)
            return
          }
          break
        }
        case "forum-discussion": {
          const discussion =
            getCachedNotificationEntity("forum-discussion", notification.targetEntityId) ??
            (await fetchNotificationEntityById("forum-discussion", notification.targetEntityId))
          if (discussion?.parentId) {
            navigateTo({
              id: discussion.id,
              label: getEntityTitle(discussion) ?? "Discussion",
              tool: "forum",
              itemId: discussion.parentId,
              discussionId: discussion.id,
            })
            navigate(`/w/${workspaceId}/forum/${discussion.parentId}/discussions/${discussion.id}`)
            return
          }
          break
        }
        case "forum-reply": {
          let replyContext = resolveDiscussionContextForReplyId(notification.targetEntityId)
          if (!replyContext) {
            const forumReply = await fetchNotificationEntityById("forum-reply", notification.targetEntityId)
            if (forumReply?.parentId) {
              const discussion = await fetchNotificationEntityById("forum-discussion", forumReply.parentId)
              if (discussion?.parentId) {
                replyContext = {
                  discussionId: discussion.id,
                  channelId: discussion.parentId,
                  discussionTitle: getEntityTitle(discussion),
                }
              }
            }
          }
          if (replyContext) {
            navigateTo({
              id: replyContext.discussionId,
              label: replyContext.discussionTitle ?? "Discussion",
              tool: "forum",
              itemId: replyContext.channelId,
              discussionId: replyContext.discussionId,
            })
            navigate(
              `/w/${workspaceId}/forum/${replyContext.channelId}/discussions/${replyContext.discussionId}`
            )
            return
          }
          break
        }
        case "task": {
          const task =
            getCachedNotificationEntity("task", notification.targetEntityId) ??
            (await fetchNotificationEntityById("task", notification.targetEntityId))
          if (task?.parentId) {
            navigateTo({
              id: `${task.parentId}-${task.id}`,
              label: getEntityTitle(task) ?? "Task",
              tool: "projects",
              itemId: task.parentId,
              taskId: task.id,
            })
            navigate(`/w/${workspaceId}/projects/${task.parentId}/tasks/${task.id}`)
            return
          }
          break
        }
        case "task-comment": {
          let taskContext = resolveTaskContextForCommentId(notification.targetEntityId)
          if (!taskContext) {
            const taskComment = await fetchNotificationEntityById("task-comment", notification.targetEntityId)
            if (taskComment?.parentId) {
              const task = await fetchNotificationEntityById("task", taskComment.parentId)
              if (task?.parentId) {
                taskContext = {
                  taskId: task.id,
                  projectId: task.parentId,
                  taskTitle: getEntityTitle(task),
                }
              }
            }
          }
          if (taskContext) {
            navigateTo({
              id: `${taskContext.projectId}-${taskContext.taskId}`,
              label: taskContext.taskTitle ?? "Task",
              tool: "projects",
              itemId: taskContext.projectId,
              taskId: taskContext.taskId,
            })
            navigate(`/w/${workspaceId}/projects/${taskContext.projectId}/tasks/${taskContext.taskId}`)
            return
          }
          break
        }
        default:
          break
      }

      const fallbackTool = resolveFallbackToolForEntityType(notification.targetEntityType)
      if (fallbackTool) {
        navigateTo({
          id: notification.targetEntityId,
          label: "Reaction",
          tool: fallbackTool,
        })
        navigate(`/w/${workspaceId}/${fallbackTool}`)
      }
    },
    [
      workspaceId,
      navigate,
      navigateTo,
      currentUserId,
      resolveNotificationActorDisplayName,
      resolveGroupChatContextForMessageId,
      resolveDiscussionContextForReplyId,
      resolveTaskContextForCommentId,
      getCachedNotificationEntity,
      fetchNotificationEntityById,
      resolveGroupChatNameForNotification,
    ]
  )

  const handleSelectMainListIndex = useCallback(
    (index: number) => {
      const item = listItems[index]
      if (!item) return
      if (item.type === "mark_all") {
        markAllNotificationsRead()
        return
      }
      if (item.type === "reactions") {
        handleOpenReactionsView()
        return
      }
      handleOpenNotificationGroup(item.group)
    },
    [listItems, markAllNotificationsRead, handleOpenNotificationGroup, handleOpenReactionsView]
  )

  const handleSelectReactionListIndex = useCallback(
    (index: number) => {
      const item = reactionListItems[index]
      if (!item) return
      if (item.type === "back") {
        handleReturnToInboxView()
        return
      }
      handleOpenReactionNotification(item.notification)
    },
    [reactionListItems, handleReturnToInboxView, handleOpenReactionNotification]
  )

  if (!isWorkspaceRegisteredWithServer) {
    return (
      <List itemCount={0} testId="inbox-tool-container">
        <ListEmpty
          message="Notifications will appear here once you sign up."
          testId="inbox-anonymous-message"
        />
      </List>
    )
  }

  if (isLoading && notifications.length === 0) {
    return (
      <List itemCount={0} testId="inbox-tool-container">
        <ListEmpty message="Loading notifications..." />
      </List>
    )
  }

  const hasNonReactionNotifications = nonReactionNotifications.length > 0
  const hasReactionNotifications = reactionNotifications.length > 0

  if (isReactionView) {
    return (
      <List
        itemCount={reactionListItems.length}
        onSelect={handleSelectReactionListIndex}
        testId="inbox-tool-container"
      >
        <ListSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search reactions..."
          testId="inbox-search"
        />

        {reactionListItems.length === 1 && (
          <ListEmpty message={searchQuery ? "No results" : "No reactions yet"} />
        )}

        {reactionListItems.map((item, index) => {
          if (item.type === "back") {
            return (
              <ListRow
                key="reactions-back"
                index={index}
                icon={<ArrowLeft size={16} />}
                title="Back to inbox"
                onClick={handleReturnToInboxView}
                testId="inbox-reactions-back"
              />
            )
          }

          const copy = resolveReactionNotificationCopy(item.notification)

          return (
            <InboxNotificationRow
              key={item.notification.id}
              index={index}
              copy={copy}
              icon={<Smile size={16} />}
              timestamp={item.notification.updatedAt}
              // Reaction history intentionally avoids unread indicators.
              unread={false}
              onSelect={() => handleOpenReactionNotification(item.notification)}
              testId={`inbox-reaction-row-${index}`}
              parentEntityId={item.notification.parentEntityId}
            />
          )
        })}
      </List>
    )
  }

  if (!hasNonReactionNotifications && !hasReactionNotifications) {
    return (
      <List itemCount={0} testId="inbox-tool-container">
        <ListEmpty message="No notifications" />
      </List>
    )
  }

  return (
    <List itemCount={listItems.length} onSelect={handleSelectMainListIndex} testId="inbox-tool-container">
      <ListSearch
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search notifications..."
        testId="inbox-search"
      />

      {listItems.length === 0 && <ListEmpty message="No results" />}

      {listItems.map((item, index) => {
        if (item.type === "mark_all") {
          return (
            <ListRow
              key="mark-all"
              index={index}
              icon={<Inbox size={16} />}
              title="Mark all as read"
              onClick={() => markAllNotificationsRead()}
              testId="inbox-mark-all-read"
            />
          )
        }

        if (item.type === "reactions") {
          return (
            <ListRow
              key="reactions-row"
              index={index}
              icon={<Smile size={16} />}
              title="Reactions"
              meta={reactionSummaryDescription}
              onClick={handleOpenReactionsView}
              testId="inbox-reactions-row"
            />
          )
        }

        const { group } = item
        const copy = resolveNotificationGroupDisplayCopy(group)
        const icon = getNotificationIconForActionType(group.latestNotification.actionType)

        return (
          <InboxNotificationRow
            key={group.groupKey}
            index={index}
            copy={copy}
            icon={icon}
            timestamp={group.latestNotification.updatedAt}
            unread={group.unreadCount > 0}
            onSelect={() => handleOpenNotificationGroup(group)}
            testId={`inbox-notification-row-${index}`}
            parentEntityId={group.parentEntityId}
          />
        )
      })}
    </List>
  )
}

function resolveFallbackToolForEntityType(entityType: NotificationEntityReferenceType): ToolType | null {
  switch (entityType) {
    case "project":
    case "task":
    case "task-comment":
      return "projects"
    case "group-chat":
    case "group-message":
      return "groups"
    case "forum-channel":
    case "forum-discussion":
    case "forum-reply":
      return "forum"
    case "paper":
    case "paper-comment":
    case "paper-comment-reply":
      return "papers"
    case "file":
    case "folder":
      return "files"
    case "user":
    case "direct-message":
      return "contacts"
    default:
      return null
  }
}
