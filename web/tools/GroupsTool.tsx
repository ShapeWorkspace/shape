import { useMemo, useState, useCallback, useRef, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useAuthStore } from "../store/auth-store"
import { useWindowStore } from "../store/window-store"
import { useSidecar } from "../contexts/SidecarContext"
import {
  useGroupChats,
  useGroupChat,
  useGroupMessages,
  useSendGroupMessage,
  useCreateGroupChat,
} from "../store/queries/use-group-chats"
import { useCreateGroupChatACLEntry } from "../store/queries/use-group-chat-acl"
import { useWorkspaceMembers } from "../store/queries/use-workspace-members"
import { useNotifications, useMarkNotificationRead } from "../store/queries/use-notifications"
import { useReactionBatchFetch } from "../store/queries/use-reactions"
import type { MentionSuggestionContext } from "../store/queries/use-mention-suggestions"
import { List, ListRow, ListSearch, ListEmpty, CustomListContent } from "../components/ListUI"
import { Sidecar, SidecarSection, SidecarMenu, SidecarRow } from "../components/SidecarUI"
import { GroupChatSidecar } from "../components/GroupChatSidecar"
import { FormSidecar } from "../components/FormSidecar"
import {
  MemberSelectionField,
  type SelectedMember,
  type MemberSelectionFieldRef,
} from "../components/MemberSelectionField"
import { ChatView, type ChatMessage } from "../components/ChatView"
import type { QuotedMessage } from "../components/ChatMessageComposer"
import { MessageSquare, Plus } from "lucide-react"
import * as appStyles from "../styles/app.css"
import * as notificationStyles from "../styles/notification.css"
import type { DecryptedGroupChat, DecryptedGroupMessage } from "@shape/engine/models/entity"
import type { ReactionEntityReference } from "../types/reaction-entity-reference"

/**
 * GroupsTool displays group chats and their conversations.
 *
 * List view: Shows all group chats the user has access to.
 * Clicking a group opens its message conversation.
 *
 * Detail view (itemId present): Shows the GroupChatView with messages.
 * Messages are E2EE encrypted and decrypted client-side.
 */
export function GroupsTool() {
  const navigate = useNavigate()
  const { workspaceId, itemId } = useParams<{ workspaceId: string; itemId?: string }>()
  const { navigateTo } = useWindowStore()
  const { setSidecar, pushSidecar, popSidecar } = useSidecar()
  const [searchQuery, setSearchQuery] = useState("")
  // Guard against repeatedly re-setting the list sidecar on every render.
  const hasInitializedListSidecarRef = useRef(false)

  // Fetch group chats
  const { data: groupChats = [], isLoading } = useGroupChats()

  // Fetch notifications to determine which groups have unread messages
  const { data: notifications = [] } = useNotifications()

  // Calculate which groups have unread message notifications
  const unreadGroupIds = useMemo(() => {
    const ids = new Set<string>()
    for (const notification of notifications) {
      if (
        !notification.readAt &&
      notification.actionType === "group_message" &&
        notification.parentEntityType === "group-chat"
      ) {
        ids.add(notification.parentEntityId)
      }
    }
    return ids
  }, [notifications])

  // Filter by search query
  const filteredGroupChats = groupChats.filter((gc: DecryptedGroupChat) => {
    if (!searchQuery) return true
    return gc.content.name.toLowerCase().includes(searchQuery.toLowerCase())
  })

  // Sort by most recently updated
  const sortedGroupChats = [...filteredGroupChats].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  )

  // Handle selecting a group chat
  const handleSelectGroupChat = useCallback(
    (groupChat: DecryptedGroupChat) => {
      if (!workspaceId) return
      // Update window store for breadcrumb tracking
      navigateTo({
        id: groupChat.id,
        label: groupChat.content.name,
        tool: "groups",
        itemId: groupChat.id,
      })
      // Navigate via URL
      navigate(`/w/${workspaceId}/groups/${groupChat.id}`)
    },
    [workspaceId, navigateTo, navigate]
  )

  // Handle creating a new group via dedicated form component with member selection
  const handleCreate = useCallback(() => {
    pushSidecar(
      <CreateGroupChatForm
        onSuccess={(groupChatId, groupChatName) => {
          popSidecar()
          if (workspaceId) {
            navigateTo({
              id: groupChatId,
              label: groupChatName,
              tool: "groups",
              itemId: groupChatId,
            })
            navigate(`/w/${workspaceId}/groups/${groupChatId}`)
          }
        }}
        onCancel={() => popSidecar()}
      />,
      "New Group"
    )
  }, [pushSidecar, popSidecar, workspaceId, navigateTo, navigate])

  const handleSelectByIndex = useCallback(
    (index: number) => {
      if (index === 0) {
        handleCreate()
        return
      }
      const groupIndex = index - 1
      if (groupIndex < sortedGroupChats.length) {
        const groupChat = sortedGroupChats[groupIndex]
        if (groupChat) {
          handleSelectGroupChat(groupChat)
        }
      }
    },
    [sortedGroupChats, handleSelectGroupChat, handleCreate]
  )

  // Set up Groups sidecar with "New group" action
  const handleOpenGroupsSidecar = useCallback(() => {
    setSidecar(<GroupsToolSidecar onNewGroup={handleCreate} />, "Groups")
  }, [setSidecar, handleCreate])

  // Automatically populate sidecar when viewing the groups list (not a specific group)
  useEffect(() => {
    if (itemId) {
      // Reset so returning to the list re-initializes the sidecar.
      hasInitializedListSidecarRef.current = false
      return
    }

    if (hasInitializedListSidecarRef.current) {
      return
    }

    handleOpenGroupsSidecar()
    hasInitializedListSidecarRef.current = true
  }, [itemId, handleOpenGroupsSidecar])

  // If viewing a specific group chat, show the conversation
  if (itemId) {
    return (
      <CustomListContent testId="groups-tool-container">
        <GroupChatView groupChatId={itemId} />
      </CustomListContent>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <List itemCount={0} testId="groups-tool-container">
        <ListEmpty message="Loading groups..." />
      </List>
    )
  }

  // List view - itemCount includes create row at the top
  const itemCount = 1 + sortedGroupChats.length

  return (
    <List itemCount={itemCount} onSelect={handleSelectByIndex} testId="groups-tool-container">
      <ListSearch value={searchQuery} onChange={setSearchQuery} placeholder="Search groups..." />

      <ListRow
        index={0}
        icon={<Plus size={16} />}
        title="New group"
        isCreateAction
        onClick={handleCreate}
        testId="groups-create-button"
      />

      {sortedGroupChats.map((groupChat, index) => {
        const hasUnread = unreadGroupIds.has(groupChat.id)
        return (
          <ListRow
            key={groupChat.id}
            index={1 + index}
            icon={
              <span style={{ position: "relative", display: "flex" }}>
                <MessageSquare size={16} />
                {hasUnread && (
                  <span
                    className={notificationStyles.notificationUnreadDot}
                    style={{ position: "absolute", top: -2, right: -4 }}
                  />
                )}
              </span>
            }
            title={groupChat.content.name}
            onClick={() => handleSelectGroupChat(groupChat)}
            testId={`group-chat-row-${groupChat.id}`}
          />
        )
      })}

      {sortedGroupChats.length === 0 && searchQuery && <ListEmpty message="No groups found" />}
    </List>
  )
}

/**
 * GroupChatView displays a group conversation using the unified ChatView component.
 * Handles group-specific concerns like sidecar, ACL-based mentions, and reaction batching.
 */
interface GroupChatViewProps {
  groupChatId: string
}

function GroupChatView({ groupChatId }: GroupChatViewProps) {
  const { currentUser } = useAuthStore()
  const { setSidecar } = useSidecar()
  const [quotedMessage, setQuotedMessage] = useState<QuotedMessage | null>(null)

  // Track the last sidecar state to avoid render loops caused by setSidecar.
  const lastSidecarStateRef = useRef<{
    groupChatId: string
    groupChatName: string
    groupChatCreatorId: string
  } | null>(null)

  // Get current user ID for styling messages
  const currentUserId = currentUser?.uuid ?? ""

  // Fetch group chat details
  const { data: groupChat, isLoading: isLoadingChat } = useGroupChat(groupChatId)

  // Fetch messages
  const { data: messages = [], isLoading: isLoadingMessages } = useGroupMessages(groupChatId)

  // Fetch notifications and mark-read mutation for auto-marking group messages as read
  const { data: notifications = [] } = useNotifications()
  const { mutate: markNotificationRead } = useMarkNotificationRead()

  // Mark unread group message notifications for this group as read when viewing the conversation
  useEffect(() => {
    const unreadGroupNotifications = notifications.filter(
      n =>
        !n.readAt &&
      n.actionType === "group_message" &&
        n.parentEntityType === "group-chat" &&
        n.parentEntityId === groupChatId
    )
    for (const notification of unreadGroupNotifications) {
      markNotificationRead(notification.id)
    }
  }, [notifications, groupChatId, markNotificationRead])

  // Use cached workspace members for sender name lookup (works offline)
  const { data: members = [] } = useWorkspaceMembers()

  // Create a lookup map from userId to display name
  const senderNameMap = useMemo(() => {
    const map = new Map<string, string>()
    members.forEach(member => {
      map.set(member.userId, member.displayName || member.user?.email || "Unknown")
    })
    return map
  }, [members])

  const senderAvatarMap = useMemo(() => {
    const map = new Map<string, string | null>()
    members.forEach(member => {
      map.set(member.userId, member.avatarDataUrl ?? null)
    })
    return map
  }, [members])

  // Get sender display name (ChatView will prepend "You" for current user)
  const getSenderName = useCallback(
    (senderId: string): string => {
      return senderNameMap.get(senderId) || "Unknown"
    },
    [senderNameMap]
  )

  const getSenderAvatarDataUrl = useCallback(
    (senderId: string): string | null => {
      return senderAvatarMap.get(senderId) ?? null
    },
    [senderAvatarMap]
  )

  // Send message mutation
  const sendMessageMutation = useSendGroupMessage()

  const mentionSuggestionContext = useMemo<MentionSuggestionContext | undefined>(() => {
    if (!groupChatId) {
      return undefined
    }
    return {
      contextType: "acl",
      resourceType: "group_chat",
      resourceId: groupChatId,
    }
  }, [groupChatId])

  // Batch fetch reactions for all messages
  const reactionEntityReferences = useMemo<ReactionEntityReference[]>(
    () =>
      messages.map(message => ({
        entityId: message.id,
        entityType: "group-message",
      })),
    [messages]
  )
  useReactionBatchFetch(reactionEntityReferences, { isEnabled: !!groupChatId })

  // Handle sending a message
  const handleSend = useCallback(
    (_messageId: string, content: string, mentionedUserIds: string[]) => {
      sendMessageMutation.mutate({
        groupChatId,
        text: content,
        quotedMessageId: quotedMessage?.id || null,
        mentions: mentionedUserIds,
      })
      setQuotedMessage(null)
    },
    [groupChatId, quotedMessage, sendMessageMutation]
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

  // Set up sidecar with group details
  useEffect(() => {
    if (!groupChat) return

    const nextSidecarState = {
      groupChatId,
      groupChatName: groupChat.content.name,
      groupChatCreatorId: groupChat.creatorId,
    }
    const lastSidecarState = lastSidecarStateRef.current

    if (
      lastSidecarState &&
      lastSidecarState.groupChatId === nextSidecarState.groupChatId &&
      lastSidecarState.groupChatName === nextSidecarState.groupChatName &&
      lastSidecarState.groupChatCreatorId === nextSidecarState.groupChatCreatorId
    ) {
      return
    }

    setSidecar(
      <GroupChatSidecar
        groupChatId={groupChatId}
        groupName={groupChat.content.name}
        creatorId={groupChat.creatorId}
      />,
      groupChat.content.name
    )
    lastSidecarStateRef.current = nextSidecarState
  }, [groupChat, groupChatId, setSidecar])

  const isLoading = isLoadingChat || isLoadingMessages

  if (isLoading) {
    return (
      <div className={appStyles.emptyState} data-testid="group-chat-conversation-container">
        <p className={appStyles.emptyStateText}>Loading messages...</p>
      </div>
    )
  }

  // Convert GroupMessageUI[] to ChatMessage[] (they're compatible)
  const chatMessages: DecryptedGroupMessage[] = messages

  return (
    <ChatView
      variant="group"
      messages={chatMessages}
      currentUserId={currentUserId}
      getSenderName={getSenderName}
      getSenderAvatarDataUrl={getSenderAvatarDataUrl}
      reactionEntityType="group-message"
      onQuote={handleQuote}
      composerEntityType="group_message"
      isPending={sendMessageMutation.isPending}
      onSend={handleSend}
      quotedMessage={quotedMessage}
      onClearQuote={handleClearQuote}
      mentionSuggestionContext={mentionSuggestionContext}
      testIdPrefix="group"
      containerTestId="group-chat-conversation-container"
    />
  )
}

/**
 * CreateGroupChatForm handles group chat creation with member selection.
 * Members are added via ACL entries after the group is created.
 */
interface CreateGroupChatFormProps {
  onSuccess: (groupChatId: string, groupChatName: string) => void
  onCancel: () => void
}

function CreateGroupChatForm({ onSuccess, onCancel }: CreateGroupChatFormProps) {
  const [selectedMembers, setSelectedMembers] = useState<SelectedMember[]>([])
  const memberSelectionRef = useRef<MemberSelectionFieldRef>(null)

  // Mutations for creating group and ACL entries
  const createGroupChatMutation = useCreateGroupChat()
  const { mutateAsync: createACLEntry } = useCreateGroupChatACLEntry()

  const handleSubmit = useCallback(
    async (values: Record<string, string | boolean>) => {
      const name = values.name as string

      // Create the group chat first
      const groupChat = await createGroupChatMutation.mutateAsync({
        name: name.trim(),
      })

      // Then create ACL entries for selected members
      // We don't await all of these - if some fail, the group still exists
      // and the user can add members later via the manage members UI
      for (const member of selectedMembers) {
        try {
          await createACLEntry({
            groupChatId: groupChat.id,
            subjectType: member.subjectType,
            subjectId: member.subjectId,
            permission: member.permission,
          })
        } catch (error) {
          // Log but don't fail - group is created, member can be added later
          console.error("Failed to add member to group:", error)
        }
      }

      onSuccess(groupChat.id, groupChat.content.name)
    },
    [createGroupChatMutation, createACLEntry, selectedMembers, onSuccess]
  )

  return (
    <FormSidecar
      title="New Group"
      fields={[
        {
          name: "name",
          type: "text",
          label: "Name",
          required: true,
          placeholder: "Group name...",
          testId: "create-group-name-input",
        },
      ]}
      onSubmit={handleSubmit}
      onCancel={onCancel}
      submitLabel="Create"
      memberSelectionRef={memberSelectionRef}
    >
      <MemberSelectionField
        ref={memberSelectionRef}
        selectedMembers={selectedMembers}
        onMembersChange={setSelectedMembers}
      />
    </FormSidecar>
  )
}

/**
 * GroupsToolSidecar displays actions for the main Groups tool view.
 */
interface GroupsToolSidecarProps {
  onNewGroup: () => void
}

function GroupsToolSidecar({ onNewGroup }: GroupsToolSidecarProps) {
  const handleSelect = useCallback(
    (index: number) => {
      if (index === 0) {
        onNewGroup()
      }
    },
    [onNewGroup]
  )

  return (
    <Sidecar itemCount={1} onSelect={handleSelect}>
      <SidecarSection title="Actions">
        <SidecarMenu>
          <SidecarRow
            index={0}
            icon={<Plus size={14} />}
            title="New group"
            onClick={onNewGroup}
            testId="groups-new-group-sidecar"
          />
        </SidecarMenu>
      </SidecarSection>
    </Sidecar>
  )
}
