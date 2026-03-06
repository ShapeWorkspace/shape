import { useMemo, useState, useCallback, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useAuthStore } from "../store/auth-store"
import { useWindowStore } from "../store/window-store"
import { useEngineStore } from "../store/engine-store"
import { useSidecar } from "../contexts/SidecarContext"
import { Sidecar, SidecarSection, SidecarMenu } from "../components/SidecarUI"
import { NotificationSubscriptionSidecarRow } from "../components/NotificationSubscriptionSidecarRow"
import { useNotificationSubscriptionToggle } from "../store/queries/use-notification-subscriptions"
import { useConversation, useSendDirectMessage } from "../store/queries/use-direct-messages"
import { useWorkspaceMembers } from "../store/queries/use-workspace-members"
import { useNotifications, useMarkNotificationRead } from "../store/queries/use-notifications"
import { useReactionBatchFetch } from "../store/queries/use-reactions"
import type { ReactionEntityReference } from "../types/reaction-entity-reference"
import type { MentionSuggestionContext } from "../store/queries/use-mention-suggestions"
import { List, ListRow, ListSearch, ListEmpty, CustomListContent } from "../components/ListUI"
import { ChatView, type ChatMessage } from "../components/ChatView"
import type { QuotedMessage } from "../components/ChatMessageComposer"
import { WorkspaceMember } from "../../engine/models/workspace-member"
import { User } from "lucide-react"
import * as appStyles from "../styles/app.css"
import * as notificationStyles from "../styles/notification.css"

/**
 * ContactsTool displays workspace members and direct message conversations.
 *
 * List view: Shows all workspace members (excluding current user).
 * Clicking a member opens their DM conversation.
 *
 * Detail view (itemId present): Shows the DirectMessage conversation with that user.
 * Messages are E2EE encrypted and decrypted client-side.
 */
export function ContactsTool() {
  const navigate = useNavigate()
  const { itemId } = useParams<{ itemId?: string }>()
  const { currentUser } = useAuthStore()
  const { navigateTo } = useWindowStore()
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const [searchQuery, setSearchQuery] = useState("")

  // Get current user ID to filter from member list
  const currentUserId = currentUser?.uuid
  const isWorkspaceRegisteredWithServer = application?.isWorkspaceRemote() ?? false
  const subscriptionDisabledMeta = isWorkspaceRegisteredWithServer
    ? undefined
    : "Sync required to manage notifications."

  // Fetch workspace members with offline caching support
  const { data: members = [], isLoading } = useWorkspaceMembers()

  // Fetch notifications to determine which contacts have unread messages
  const { data: notifications = [] } = useNotifications()

  // Calculate which contacts have unread DM notifications
  const unreadContactIds = useMemo(() => {
    const ids = new Set<string>()
    for (const notification of notifications) {
      if (
        !notification.readAt &&
        notification.actionType === "dm_received" &&
        notification.parentEntityType === "user"
      ) {
        ids.add(notification.parentEntityId)
      }
    }
    return ids
  }, [notifications])

  // Filter out current user and apply search filter
  const filteredMembers = members.filter((member: WorkspaceMember) => {
    // Exclude current user
    if (member.userId === currentUserId) return false

    // Apply search filter
    if (!searchQuery) return true
    const name = member.displayName || ""
    const email = member.user?.email || ""
    const query = searchQuery.toLowerCase()
    return name.toLowerCase().includes(query) || email.toLowerCase().includes(query)
  })

  // Sort members alphabetically by name
  const sortedMembers = [...filteredMembers].sort((a, b) => {
    const nameA = a.displayName || a.user?.email || ""
    const nameB = b.displayName || b.user?.email || ""
    return nameA.localeCompare(nameB)
  })

  // Handle selecting a member to open their conversation
  const handleSelectMember = useCallback(
    (member: WorkspaceMember) => {
      if (!workspaceId) return
      // Update window store for breadcrumb tracking
      navigateTo({
        id: member.userId,
        label: member.displayName || member.user?.email || "Unknown",
        tool: "contacts",
        itemId: member.userId,
      })
      // Navigate via URL
      navigate(`/w/${workspaceId}/contacts/${member.userId}`)
    },
    [workspaceId, navigateTo, navigate]
  )

  const handleSelectByIndex = useCallback(
    (index: number) => {
      if (index < sortedMembers.length) {
        const member = sortedMembers[index]
        if (member) {
          handleSelectMember(member)
        }
      }
    },
    [sortedMembers, handleSelectMember]
  )

  // If viewing a specific member, show the DM conversation
  if (itemId) {
    const member = members.find((m: WorkspaceMember) => m.userId === itemId)
    return (
      <CustomListContent testId="contacts-tool-container">
        <DirectMessageView
          recipientId={itemId}
          recipientName={member?.displayName || member?.user?.email || "Unknown"}
          isSubscriptionDisabled={!isWorkspaceRegisteredWithServer}
          subscriptionDisabledMeta={subscriptionDisabledMeta}
        />
      </CustomListContent>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <List itemCount={0} testId="contacts-tool-container">
        <ListEmpty message="Loading members..." />
      </List>
    )
  }

  // List view
  return (
    <List itemCount={sortedMembers.length} onSelect={handleSelectByIndex} testId="contacts-tool-container">
      <ListSearch value={searchQuery} onChange={setSearchQuery} placeholder="Search members..." />

      {sortedMembers.map((member, index) => {
        const hasUnread = unreadContactIds.has(member.userId)
        return (
          <ListRow
            key={member.userId}
            index={index}
            icon={
              <span style={{ position: "relative", display: "flex" }}>
                <User size={16} />
                {hasUnread && (
                  <span
                    className={notificationStyles.notificationUnreadDot}
                    style={{ position: "absolute", top: -2, right: -4 }}
                  />
                )}
              </span>
            }
            title={member.displayName || member.user?.email || "Unknown"}
            meta={member.user?.email || ""}
            onClick={() => handleSelectMember(member)}
            testId={`workspace-member-${member.userId}`}
          />
        )
      })}

      {sortedMembers.length === 0 && searchQuery && <ListEmpty message="No members found" />}

      {sortedMembers.length === 0 && !searchQuery && <ListEmpty message="No other workspace members" />}
    </List>
  )
}

/**
 * DirectMessageView displays a DM conversation using the unified ChatView component.
 * Handles DM-specific concerns like sidecar notifications and static mention context.
 */
interface DirectMessageViewProps {
  recipientId: string
  recipientName: string
  isSubscriptionDisabled: boolean
  subscriptionDisabledMeta?: string
}

function DirectMessageView({
  recipientId,
  recipientName,
  isSubscriptionDisabled,
  subscriptionDisabledMeta,
}: DirectMessageViewProps) {
  const { currentUser } = useAuthStore()
  const { setSidecar, clearSidecar } = useSidecar()
  const { isSubscribed, isLoading: isSubscriptionLoading, isSaving, toggleSubscription } = useNotificationSubscriptionToggle(
    "user",
    recipientId
  )
  const [quotedMessage, setQuotedMessage] = useState<QuotedMessage | null>(null)

  // Get current user ID for styling messages
  const currentUserId = currentUser?.uuid ?? ""

  // Fetch conversation messages
  const { data: messages = [], isLoading } = useConversation(recipientId)

  // Send message mutation
  const sendMessageMutation = useSendDirectMessage()

  // Fetch notifications and mark-read mutation for auto-marking DMs as read
  const { data: notifications = [] } = useNotifications()
  const { mutate: markNotificationRead } = useMarkNotificationRead()

  // Mark unread DM notifications from this contact as read when viewing the conversation
  useEffect(() => {
    const unreadDmNotifications = notifications.filter(
      n =>
        !n.readAt &&
        n.actionType === "dm_received" &&
        n.parentEntityType === "user" &&
        n.parentEntityId === recipientId
    )
    for (const notification of unreadDmNotifications) {
      markNotificationRead(notification.id)
    }
  }, [notifications, recipientId, markNotificationRead])

  // Mention context for DMs (just the two participants)
  const mentionSuggestionContext = useMemo<MentionSuggestionContext | undefined>(() => {
    if (!currentUserId || !recipientId) {
      return undefined
    }
    return {
      contextType: "static",
      userIds: [currentUserId, recipientId],
    }
  }, [currentUserId, recipientId])

  // Batch fetch reactions for all messages
  const reactionEntityReferences = useMemo<ReactionEntityReference[]>(
    () =>
      messages.map(message => ({
        entityId: message.id,
        entityType: "direct-message",
      })),
    [messages]
  )
  useReactionBatchFetch(reactionEntityReferences, { isEnabled: !!recipientId })

  // Set up sidecar with notification toggle
  useEffect(() => {
    setSidecar(
      <DirectMessageSidecar
        isSubscribed={isSubscribed}
        isSubscriptionLoading={isSubscriptionLoading}
        isSaving={isSaving}
        onToggleSubscription={toggleSubscription}
        isSubscriptionDisabled={isSubscriptionDisabled}
        subscriptionDisabledMeta={subscriptionDisabledMeta}
      />,
      "Notifications"
    )
    return () => {
      clearSidecar()
    }
  }, [
    setSidecar,
    clearSidecar,
    isSubscribed,
    isSubscriptionLoading,
    isSaving,
    toggleSubscription,
    isSubscriptionDisabled,
    subscriptionDisabledMeta,
  ])

  // Handle sending a message
  const handleSend = useCallback(
    (_messageId: string, content: string, mentionedUserIds: string[]) => {
      sendMessageMutation.mutate({
        recipientId,
        text: content,
        quotedMessageId: quotedMessage?.id || null,
        mentions: mentionedUserIds,
      })
      setQuotedMessage(null)
    },
    [recipientId, quotedMessage, sendMessageMutation]
  )

  // Handle quoting a message
  const handleQuote = useCallback((message: ChatMessage) => {
    setQuotedMessage({
      id: message.id,
      text: message.content.text,
    })
  }, [])

  const handleClearQuote = useCallback(() => {
    setQuotedMessage(null)
  }, [])

  // Get sender name - "You" for current user, recipient name for other
  const getSenderName = useCallback(
    (senderId: string): string => {
      return senderId === currentUserId ? "You" : recipientName
    },
    [currentUserId, recipientName]
  )

  const getSenderAvatarDataUrl = useCallback((): string | null => {
    return null
  }, [])

  if (isLoading) {
    return (
      <div className={appStyles.emptyState} data-testid="dm-conversation-container">
        <p className={appStyles.emptyStateText}>Loading messages...</p>
      </div>
    )
  }

  // Convert DirectMessageUI[] to ChatMessage[] (they're compatible)
  const chatMessages: ChatMessage[] = messages

  return (
    <ChatView
      variant="dm"
      messages={chatMessages}
      currentUserId={currentUserId}
      getSenderName={getSenderName}
      getSenderAvatarDataUrl={getSenderAvatarDataUrl}
      reactionEntityType="direct-message"
      onQuote={handleQuote}
      composerEntityType="direct_message"
      isPending={sendMessageMutation.isPending}
      onSend={handleSend}
      quotedMessage={quotedMessage}
      onClearQuote={handleClearQuote}
      mentionSuggestionContext={mentionSuggestionContext}
      testIdPrefix="dm"
    />
  )
}

interface DirectMessageSidecarProps {
  isSubscribed: boolean
  isSubscriptionLoading: boolean
  isSaving: boolean
  onToggleSubscription: () => void
  isSubscriptionDisabled: boolean
  subscriptionDisabledMeta?: string
}

function DirectMessageSidecar({
  isSubscribed,
  isSubscriptionLoading,
  isSaving,
  onToggleSubscription,
  isSubscriptionDisabled,
  subscriptionDisabledMeta,
}: DirectMessageSidecarProps) {
  const handleSelect = useCallback(() => {
    if (!isSubscriptionDisabled) {
      onToggleSubscription()
    }
  }, [onToggleSubscription, isSubscriptionDisabled])

  return (
    <Sidecar itemCount={1} onSelect={handleSelect}>
      <SidecarSection title="Actions">
        <SidecarMenu>
          <NotificationSubscriptionSidecarRow
            index={0}
            isSubscribed={isSubscribed}
            isLoading={isSubscriptionLoading}
            isSaving={isSaving}
            onToggle={onToggleSubscription}
            isDisabled={isSubscriptionDisabled}
            disabledMeta={subscriptionDisabledMeta}
            subscribedLabel="Mute notifications"
            unsubscribedLabel="Unmute notifications"
            testId="direct-message-subscription-toggle"
          />
        </SidecarMenu>
      </SidecarSection>
    </Sidecar>
  )
}
