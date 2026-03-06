import React, { useState, useCallback, useRef, useEffect, useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useAuthStore } from "../store/auth-store"
import { useWindowStore } from "../store/window-store"
import { useSidecar } from "../contexts/SidecarContext"
import { useDraftInfoMap, isDraftTransient } from "../hooks/useDraftInfoMap"
import {
  useForumChannels,
  useForumDiscussions,
  useForumReplies,
  useCreateForumChannel,
  useCreateForumDiscussion,
  useSendForumReply,
} from "../store/queries/use-forum-channels"
import { useCreateForumChannelACLEntry } from "../store/queries/use-forum-channel-acl"
import { useWorkspaceMembers } from "../store/queries/use-workspace-members"
import { useReactionBatchFetch } from "../store/queries/use-reactions"
import {
  List,
  ListRow,
  ListSearch,
  ListEmpty,
  CustomListContent,
  ListDetailViewInput,
} from "../components/ListUI"
import { Sidecar, SidecarSection, SidecarMenu, SidecarRow } from "../components/SidecarUI"
import { ForumChannelSidecar } from "../components/ForumChannelSidecar"
import { ForumDiscussionSidecar } from "../components/ForumDiscussionSidecar"
import { ForumReplySidecar } from "../components/ForumReplySidecar"
import { FormSidecar } from "../components/FormSidecar"
import {
  MemberSelectionField,
  type SelectedMember,
  type MemberSelectionFieldRef,
} from "../components/MemberSelectionField"
import { TipTapEditor } from "../components/TipTapEditor"
import { TipTapRenderer } from "../components/TipTapRenderer"
import { ReplyComposer } from "../components/ReplyComposer"
import { ReactionBar } from "../components/reactions/ReactionBar"
import { Archive, Hash, MessageSquare, Plus, Pin } from "lucide-react"
import type { MentionSuggestionContext } from "../store/queries/use-mention-suggestions"
import type { ReactionEntityReference } from "../types/reaction-entity-reference"
import * as appStyles from "../styles/app.css"
import * as chatStyles from "../styles/chat.css"
import * as forumStyles from "../styles/forum.css"
import type { DecryptedForumChannel, DecryptedForumDiscussion, DecryptedForumDiscussionReply } from "../../engine/models/entity"

/**
 * ForumTool displays forum channels, discussions, and individual discussion views.
 * Uses the standard List pattern with ListRow children.
 *
 * E2EE: All forum content (channels, discussions, replies) is encrypted client-side.
 */
export function ForumTool() {
  const navigate = useNavigate()
  // Support both single-segment (/forum/:itemId) and nested (/forum/:channelId/:discussionId) routes
  const {
    workspaceId,
    itemId,
    channelId: routeChannelId,
    discussionId: routeDiscussionId,
  } = useParams<{
    workspaceId: string
    itemId?: string
    channelId?: string
    discussionId?: string
  }>()
  const { navigateTo } = useWindowStore()
  const { setSidecar, pushSidecar, popSidecar } = useSidecar()
  const [searchQuery, setSearchQuery] = useState("")
  // Track whether the "New Channel" form sidecar is open to prevent the root
  // sidecar effect from immediately replacing it with the default actions.
  const [isCreatingNewChannel, setIsCreatingNewChannel] = useState(false)

  // Fetch forum channels
  const { data: forumChannels = [], isLoading } = useForumChannels()
  const channelDraftInfoById = useDraftInfoMap({ entityType: "forum-channel" })

  // Navigate to URL helper
  const navigateToItem = useCallback(
    (id: string, label: string) => {
      if (!workspaceId) return
      navigateTo({
        id,
        label,
        tool: "forum",
        itemId: id,
      })
      navigate(`/w/${workspaceId}/forum/${id}`)
    },
    [workspaceId, navigateTo, navigate]
  )

  // Filter channels by search (computed before hooks that depend on it)
  const filteredChannels = useMemo(() => {
    const channelMatchesQuery = forumChannels.filter((c: DecryptedForumChannel) => {
      if (!searchQuery) return true
      return (
        c.content.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.content.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
      )
    })

    return channelMatchesQuery.filter(channel => {
      const draftInfo = channelDraftInfoById.get(channel.id)
      if (!draftInfo?.deleteEntity) {
        return true
      }
      return isDraftTransient(draftInfo)
    })
  }, [forumChannels, searchQuery, channelDraftInfoById])

  // Sort by most recently updated
  const sortedChannels = useMemo(() => {
    return [...filteredChannels].sort((a, b) => {
      const aDraftCreate = channelDraftInfoById.get(a.id)?.formedOnHash === null
      const bDraftCreate = channelDraftInfoById.get(b.id)?.formedOnHash === null
      if (aDraftCreate && !bDraftCreate) return -1
      if (!aDraftCreate && bDraftCreate) return 1
      return b.updatedAt.getTime() - a.updatedAt.getTime()
    })
  }, [filteredChannels, channelDraftInfoById])

  // Total items: just channels (create is in sidecar only)
  const itemCount = sortedChannels.length

  // Handle creating a new channel via dedicated form component with member selection
  const handleCreate = useCallback(() => {
    setIsCreatingNewChannel(true)
    pushSidecar(
      <CreateForumChannelForm
        onSuccess={(channelId, channelName) => {
          setIsCreatingNewChannel(false)
          popSidecar()
          navigateToItem(channelId, channelName)
        }}
        onCancel={() => {
          setIsCreatingNewChannel(false)
          popSidecar()
        }}
      />,
      "New Channel"
    )
  }, [pushSidecar, popSidecar, navigateToItem])

  // All hooks must be called before any conditional returns
  const handleSelectByIndex = useCallback(
    (index: number) => {
      const channel = sortedChannels[index]
      if (channel) {
        navigateToItem(channel.id, channel.content.name)
      }
    },
    [sortedChannels, navigateToItem]
  )

  // Set up Forum sidecar with "New channel" action
  const handleOpenForumSidecar = useCallback(() => {
    setSidecar(<ForumToolSidecar onNewChannel={handleCreate} />, "Forum")
  }, [setSidecar, handleCreate])

  // Automatically populate sidecar when viewing the channel list (not a specific item)
  useEffect(() => {
    // Only show forum sidecar when at the root forum view (no itemId and no nested route)
    if (!itemId && !routeChannelId && !routeDiscussionId && !isCreatingNewChannel) {
      handleOpenForumSidecar()
    }
  }, [itemId, routeChannelId, routeDiscussionId, handleOpenForumSidecar, isCreatingNewChannel])

  // === Conditional renders below - all hooks are already called ===

  // Handle nested route: /forum/:channelId/discussions/:discussionId
  if (routeChannelId && routeDiscussionId) {
    return (
      <DiscussionViewLoader
        channelId={routeChannelId}
        discussionId={routeDiscussionId}
        fallbackChannels={forumChannels}
      />
    )
  }

  // If viewing a specific item (single-segment route: /forum/:itemId)
  if (itemId) {
    // Check if it's a channel
    const channel = forumChannels.find((c: DecryptedForumChannel) => c.id === itemId)
    if (channel) {
      return (
        <ChannelDiscussionsList
          channel={channel}
          onSelectDiscussion={d => {
            // Navigate to /forum/{channelId}/discussions/{discussionId}
            if (!workspaceId) return
            navigateTo({
              id: d.id,
              label: d.content.title,
              tool: "forum",
              itemId: channel.id, // Channel ID for the URL path
              discussionId: d.id, // Discussion ID for the nested route
            })
            navigate(`/w/${workspaceId}/forum/${channel.id}/discussions/${d.id}`)
          }}
        />
      )
    }

    // Fallback: try to find the discussion across all channels (legacy URL support)
    return <DiscussionViewWrapper discussionId={itemId} channels={forumChannels} />
  }

  if (isLoading) {
    return (
      <List itemCount={0} onSelect={() => {}} testId="forum-tool-container">
        <ListEmpty message="Loading channels..." />
      </List>
    )
  }

  return (
    <List itemCount={itemCount} onSelect={handleSelectByIndex} testId="forum-tool-container">
      <ListSearch value={searchQuery} onChange={setSearchQuery} placeholder="Search channels..." />

      {sortedChannels.map((channel: DecryptedForumChannel, index: number) => {
        const draftInfo = channelDraftInfoById.get(channel.id)
        const isTransient = isDraftTransient(draftInfo)
        const showDraftBadge = draftInfo?.hasDraft && !isTransient
        const showPendingDeletion = Boolean(draftInfo?.deleteEntity) && !isTransient
        const displayTitle = showPendingDeletion ? `${channel.content.name} — Pending deletion` : channel.content.name

        return (
          <ListRow
            key={channel.id}
            index={index}
            icon={<Hash size={16} />}
            title={displayTitle}
            meta={channel.content.description ?? undefined}
            onClick={() => navigateToItem(channel.id, channel.content.name)}
            testId={`channel-item-${channel.id}`}
          >
            {showDraftBadge && (
              <span className={forumStyles.draftBadge} data-testid="forum-channel-draft-badge">
                Draft
              </span>
            )}
          </ListRow>
        )
      })}

      {sortedChannels.length === 0 && searchQuery && <ListEmpty message="No channels found" />}

      {sortedChannels.length === 0 && !searchQuery && <ListEmpty message="No channels yet" />}
    </List>
  )
}

/**
 * ChannelDiscussionsList displays discussions within a channel.
 */
interface ChannelDiscussionsListProps {
  channel: DecryptedForumChannel
  onSelectDiscussion: (discussion: DecryptedForumDiscussion) => void
}

function ChannelDiscussionsList({ channel, onSelectDiscussion }: ChannelDiscussionsListProps) {
  const { setSidecar } = useSidecar()
  const [searchQuery, setSearchQuery] = useState("")
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [showArchivedDiscussions, setShowArchivedDiscussions] = useState(false)
  const channelId = channel.id

  // Fetch discussions for this channel
  const { data: discussions = [], isLoading } = useForumDiscussions(channelId)
  const discussionDraftInfoById = useDraftInfoMap({
    entityType: "forum-discussion",
    entityFilter: draft =>
      draft.entity.parent_id === channelId && draft.entity.parent_type === "forum-channel",
  })

  // Set up channel sidecar with channel details
  const handleOpenChannelSidecar = useCallback(() => {
    setSidecar(<ForumChannelSidecar channel={channel} />, channel.content.name)
  }, [setSidecar, channel])

  // Automatically populate sidecar with channel info when channel changes (but not when creating)
  useEffect(() => {
    if (!isCreatingNew) {
      handleOpenChannelSidecar()
    }
  }, [handleOpenChannelSidecar, isCreatingNew])

  // Filter discussions by search first so active/archived sections share the same query scope.
  const filteredDiscussions = discussions.filter((discussion: DecryptedForumDiscussion) => {
    if (!searchQuery) return true
    return discussion.content.title.toLowerCase().includes(searchQuery.toLowerCase())
  })

  // Split discussions into active vs archived buckets for list presentation.
  const activeDiscussions = filteredDiscussions.filter(discussion => !discussion.metaFields.archived)
  const archivedDiscussions = filteredDiscussions.filter(discussion => discussion.metaFields.archived)

  // Sort by draft-first, then pinned, then newest activity.
  const sortDiscussionsByPriority = useCallback(
    (left: DecryptedForumDiscussion, right: DecryptedForumDiscussion) => {
      const leftDraftCreate = discussionDraftInfoById.get(left.id)?.formedOnHash === null
      const rightDraftCreate = discussionDraftInfoById.get(right.id)?.formedOnHash === null
      if (leftDraftCreate && !rightDraftCreate) return -1
      if (!leftDraftCreate && rightDraftCreate) return 1
      if (left.metaFields.pinned && !right.metaFields.pinned) return -1
      if (!left.metaFields.pinned && right.metaFields.pinned) return 1
      const leftLastReplyAt = left.metaFields.last_reply_at
        ? new Date(left.metaFields.last_reply_at).getTime()
        : 0
      const rightLastReplyAt = right.metaFields.last_reply_at
        ? new Date(right.metaFields.last_reply_at).getTime()
        : 0
      return rightLastReplyAt - leftLastReplyAt
    },
    [discussionDraftInfoById]
  )

  const sortedActiveDiscussions = [...activeDiscussions].sort(sortDiscussionsByPriority)
  const sortedArchivedDiscussions = [...archivedDiscussions].sort(sortDiscussionsByPriority)
  const hasArchivedDiscussions = sortedArchivedDiscussions.length > 0

  // If archived results disappear (e.g., search narrowed), collapse the section.
  useEffect(() => {
    if (!hasArchivedDiscussions && showArchivedDiscussions) {
      setShowArchivedDiscussions(false)
    }
  }, [hasArchivedDiscussions, showArchivedDiscussions])

  // Index bookkeeping for keyboard navigation.
  const newDiscussionRowIndex = sortedActiveDiscussions.length
  const archivedToggleRowIndex = hasArchivedDiscussions ? newDiscussionRowIndex + 1 : -1
  const archivedSectionStartIndex = hasArchivedDiscussions
    ? archivedToggleRowIndex + 1
    : newDiscussionRowIndex + 1
  const archivedSectionCount = showArchivedDiscussions ? sortedArchivedDiscussions.length : 0

  // Total items: active + optional toggle + optional archived + create button.
  const itemCount =
    sortedActiveDiscussions.length + 1 + (hasArchivedDiscussions ? 1 : 0) + archivedSectionCount

  // Handle creating a new discussion - show the detail view
  const handleCreate = useCallback(() => {
    setIsCreatingNew(true)
  }, [])

  const handleSelectByIndex = useCallback(
    (index: number) => {
      if (index < sortedActiveDiscussions.length) {
        const discussion = sortedActiveDiscussions[index]
        if (discussion) {
          onSelectDiscussion(discussion)
        }
        return
      }

      if (index === newDiscussionRowIndex) {
        handleCreate()
        return
      }

      if (hasArchivedDiscussions && index === archivedToggleRowIndex) {
        setShowArchivedDiscussions(previousValue => !previousValue)
        return
      }

      if (
        showArchivedDiscussions &&
        index >= archivedSectionStartIndex &&
        index < archivedSectionStartIndex + archivedSectionCount
      ) {
        const archivedIndex = index - archivedSectionStartIndex
        const discussion = sortedArchivedDiscussions[archivedIndex]
        if (discussion) {
          onSelectDiscussion(discussion)
        }
      }
    },
    [
      sortedActiveDiscussions,
      sortedArchivedDiscussions,
      hasArchivedDiscussions,
      showArchivedDiscussions,
      archivedToggleRowIndex,
      archivedSectionStartIndex,
      archivedSectionCount,
      newDiscussionRowIndex,
      onSelectDiscussion,
      handleCreate,
    ]
  )

  // Handle callbacks from NewDiscussionDetailView
  const handleCancelCreate = useCallback(() => {
    setIsCreatingNew(false)
  }, [])

  const handleCreateSuccess = useCallback(
    (discussion: DecryptedForumDiscussion) => {
      setIsCreatingNew(false)
      onSelectDiscussion(discussion)
    },
    [onSelectDiscussion]
  )

  // Show new discussion form when creating
  if (isCreatingNew) {
    return (
      <NewDiscussionDetailView
        channelId={channelId}
        channelName={channel.content.name}
        onCancel={handleCancelCreate}
        onSuccess={handleCreateSuccess}
      />
    )
  }

  if (isLoading) {
    return (
      <List itemCount={0} onSelect={() => {}} testId="forum-discussions-list">
        <ListEmpty message="Loading discussions..." />
      </List>
    )
  }

  return (
    <List itemCount={itemCount} onSelect={handleSelectByIndex} testId="forum-discussions-list">
      {/* Channel header with description */}
      <div className={chatStyles.chatHeader}>
        <span className={chatStyles.chatHeaderTitle}>{channel.content.name}</span>
        {channel.content.description && (
          <span className={chatStyles.chatHeaderDescription}>{channel.content.description}</span>
        )}
      </div>

      <ListSearch value={searchQuery} onChange={setSearchQuery} placeholder="Search discussions..." />

      {sortedActiveDiscussions.map((discussion, index) => {
        const draftInfo = discussionDraftInfoById.get(discussion.id)
        const isTransient = isDraftTransient(draftInfo)
        const showDraftBadge = draftInfo?.hasDraft && !isTransient
        const showPendingDeletion = Boolean(draftInfo?.deleteEntity) && !isTransient
        const displayTitle = showPendingDeletion ? `${discussion.content.title} — Pending deletion` : discussion.content.title

        return (
          <ListRow
            key={discussion.id}
            index={index}
            icon={discussion.metaFields.pinned ? <Pin size={16} /> : <MessageSquare size={16} />}
            title={displayTitle}
            meta={`${discussion.metaFields.num_replies ?? 0} ${discussion.metaFields.num_replies === 1 ? "reply" : "replies"}`}
            onClick={() => onSelectDiscussion(discussion)}
            testId={`discussion-item-${discussion.id}`}
            accessory={
              discussion.metaFields.pinned ? (
                <span
                  data-testid="discussion-pinned-indicator"
                  style={{ display: "flex", alignItems: "center" }}
                >
                  <Pin size={12} />
                </span>
              ) : undefined
            }
          >
            {showDraftBadge && (
              <span className={forumStyles.draftBadge} data-testid="forum-discussion-draft-badge">
                Draft
              </span>
            )}
          </ListRow>
        )
      })}

      {/* Archived toggle row expands/collapses archived discussions */}
      <ListRow
        index={newDiscussionRowIndex}
        icon={<Plus size={16} />}
        title="New discussion"
        isCreateAction
        onClick={handleCreate}
        testId="new-discussion-button"
      />

      {/* Archived toggle row expands/collapses archived discussions */}
      {hasArchivedDiscussions && (
        <ListRow
          index={archivedToggleRowIndex}
          icon={<Archive size={16} />}
          title={`${showArchivedDiscussions ? "Hide" : "Show"} archived (${sortedArchivedDiscussions.length})`}
          onClick={() => setShowArchivedDiscussions(previousValue => !previousValue)}
          testId="forum-discussions-archived-toggle"
        />
      )}

      {/* Archived discussions are hidden by default and rendered when expanded */}
      {showArchivedDiscussions &&
        sortedArchivedDiscussions.map((discussion, archivedIndex) => {
          const listIndex = archivedSectionStartIndex + archivedIndex
          const draftInfo = discussionDraftInfoById.get(discussion.id)
          const isTransient = isDraftTransient(draftInfo)
          const showDraftBadge = draftInfo?.hasDraft && !isTransient
          const showPendingDeletion = Boolean(draftInfo?.deleteEntity) && !isTransient
          const displayTitle = showPendingDeletion
            ? `${discussion.content.title} — Pending deletion`
            : discussion.content.title

          return (
            <ListRow
              key={discussion.id}
              index={listIndex}
              icon={<Archive size={16} />}
              title={displayTitle}
              meta={`${discussion.metaFields.num_replies ?? 0} ${discussion.metaFields.num_replies === 1 ? "reply" : "replies"}`}
              onClick={() => onSelectDiscussion(discussion)}
              testId={`discussion-item-${discussion.id}`}
            >
              {showDraftBadge && (
                <span className={forumStyles.draftBadge} data-testid="forum-discussion-draft-badge">
                  Draft
                </span>
              )}
            </ListRow>
          )
        })}

      {sortedActiveDiscussions.length === 0 && !hasArchivedDiscussions && searchQuery && (
        <ListEmpty message="No discussions found" />
      )}

      {sortedActiveDiscussions.length === 0 && !hasArchivedDiscussions && !searchQuery && (
        <ListEmpty message="No discussions yet" />
      )}
    </List>
  )
}

/**
 * DiscussionViewWrapper finds the parent channel for a discussion and renders the view.
 */
interface DiscussionViewWrapperProps {
  discussionId: string
  channels: DecryptedForumChannel[]
}

function DiscussionViewWrapper({ discussionId, channels }: DiscussionViewWrapperProps) {
  // We need to find which channel this discussion belongs to
  // Try each channel's discussions to find a match
  for (const channel of channels) {
    return (
      <DiscussionViewLoader channelId={channel.id} discussionId={discussionId} fallbackChannels={channels} />
    )
  }

  return (
    <CustomListContent testId="forum-tool-container">
      <div className={appStyles.emptyState}>
        <p className={appStyles.emptyStateText}>Discussion not found</p>
      </div>
    </CustomListContent>
  )
}

/**
 * DiscussionViewLoader fetches discussions for a channel and renders if match found.
 */
interface DiscussionViewLoaderProps {
  channelId: string
  discussionId: string
  fallbackChannels: DecryptedForumChannel[]
}

function DiscussionViewLoader({ channelId, discussionId, fallbackChannels }: DiscussionViewLoaderProps) {
  const { data: discussions = [], isLoading } = useForumDiscussions(channelId)

  const discussion = discussions.find((d: DecryptedForumDiscussion) => d.id === discussionId)

  if (isLoading) {
    return (
      <CustomListContent testId="forum-tool-container">
        <div className={appStyles.emptyState}>
          <p className={appStyles.emptyStateText}>Loading...</p>
        </div>
      </CustomListContent>
    )
  }

  if (discussion) {
    return (
      <CustomListContent testId="forum-discussion-view">
        <DiscussionView channelId={channelId} discussion={discussion} />
      </CustomListContent>
    )
  }

  // If not found in this channel, try other channels
  const remainingChannels = fallbackChannels.filter(c => c.id !== channelId)
  if (remainingChannels.length > 0) {
    return (
      <DiscussionViewLoader
        channelId={remainingChannels[0].id}
        discussionId={discussionId}
        fallbackChannels={remainingChannels}
      />
    )
  }

  return (
    <CustomListContent testId="forum-tool-container">
      <div className={appStyles.emptyState}>
        <p className={appStyles.emptyStateText}>Discussion not found</p>
      </div>
    </CustomListContent>
  )
}

/**
 * DiscussionView is a terminus view for discussion threads.
 */
interface DiscussionViewProps {
  channelId: string
  discussion: DecryptedForumDiscussion
}

function DiscussionView({ channelId, discussion }: DiscussionViewProps) {
  const navigate = useNavigate()
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { navigateTo } = useWindowStore()
  const { currentUser } = useAuthStore()
  const { setSidecar } = useSidecar()
  const repliesEndRef = useRef<HTMLDivElement>(null)
  const mentionSuggestionContext = useMemo<MentionSuggestionContext>(
    () => ({
      contextType: "acl",
      resourceType: "forum_channel",
      resourceId: channelId,
    }),
    [channelId]
  )

  // Get current user ID for identifying own messages
  const currentUserId = currentUser?.uuid

  // Fetch replies for this discussion
  const { data: replies = [], isLoading } = useForumReplies(channelId, discussion.id)
  const replyDraftInfoById = useDraftInfoMap({
    entityType: "forum-reply",
    entityFilter: draft =>
      draft.entity.parent_id === discussion.id && draft.entity.parent_type === "forum-discussion",
  })

  const reactionEntityReferences = useMemo<ReactionEntityReference[]>(() => {
    const references: ReactionEntityReference[] = [
      {
        entityId: discussion.id,
        entityType: "forum-discussion",
      },
    ]
    for (const reply of replies) {
      references.push({
        entityId: reply.id,
        entityType: "forum-reply",
      })
    }
    return references
  }, [discussion.id, replies])

  useReactionBatchFetch(reactionEntityReferences, { isEnabled: !!discussion.id })

  // Send reply mutation
  const sendReplyMutation = useSendForumReply()

  // Use cached workspace members for sender name lookup
  const { data: members = [] } = useWorkspaceMembers()

  // Create a lookup map from userId to display name
  const senderNameMap = useMemo(() => {
    const map = new Map<string, string>()
    members.forEach(member => {
      map.set(member.userId, member.displayName || member.user?.email || "Unknown")
    })
    return map
  }, [members])

  // Get sender display name
  const getSenderName = useCallback(
    (senderId: string): string => {
      if (senderId === currentUserId) return "You"
      return senderNameMap.get(senderId) || "Unknown"
    },
    [currentUserId, senderNameMap]
  )

  // Scroll to bottom when replies change
  useEffect(() => {
    repliesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [replies])

  // Handle sending a reply via ReplyComposer
  const handleSendReply = useCallback(
    (replyId: string, content: string) => {
      sendReplyMutation.mutate({
        id: replyId,
        channelId,
        discussionId: discussion.id,
        body: content,
        quotingReplyId: null,
      })
    },
    [sendReplyMutation, channelId, discussion.id]
  )

  // Handle opening the reply sidecar when a reply is clicked
  const handleOpenReplySidecar = useCallback(
    (reply: DecryptedForumDiscussionReply) => {
      // Convert UI type to full model type for sidecar
      // Use setSidecar to replace (not push) - replies are at the same level
      setSidecar(
        <ForumReplySidecar channelId={channelId} discussionId={discussion.id} reply={reply} />,
        "Reply"
      )
    },
    [setSidecar, channelId, discussion.id]
  )

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  // Navigate back to channel after discussion deletion
  const handleDiscussionDeleted = useCallback(() => {
    if (!workspaceId) return
    navigateTo({
      id: channelId,
      label: "Channel", // Will be replaced by actual channel name
      tool: "forum",
      itemId: channelId,
    })
    navigate(`/w/${workspaceId}/forum/${channelId}`)
  }, [workspaceId, channelId, navigateTo, navigate])

  // Handle opening the discussion sidecar
  const handleOpenDiscussionSidecar = useCallback(() => {
    // Use setSidecar to replace (not push) - discussion settings at same level as replies
    setSidecar(
      <ForumDiscussionSidecar
        channelId={channelId}
        discussion={discussion}
        onDeleted={handleDiscussionDeleted}
      />,
      discussion.content.title
    )
  }, [setSidecar, channelId, discussion, handleDiscussionDeleted])

  // Automatically populate sidecar with discussion info when discussion changes
  useEffect(() => {
    handleOpenDiscussionSidecar()
  }, [handleOpenDiscussionSidecar])

  return (
    <div className={forumStyles.discussionView}>
      <div
        className={forumStyles.discussionHeader}
        onClick={handleOpenDiscussionSidecar}
        style={{ cursor: "pointer" }}
      >
        <h2 data-testid="forum-discussion-title">
          {discussion.metaFields.pinned && <Pin size={16} style={{ marginRight: 8, display: "inline" }} />}
          {discussion.content.title}
        </h2>
        <div className={forumStyles.discussionMeta}>
          {getSenderName(discussion.creatorId)} · {formatDate(discussion.createdAt.getTime())}
        </div>
      </div>

      {/* Scrollable area for content and replies */}
      <div className={forumStyles.discussionScrollArea}>
        {discussion.content.body && (
          <div className={forumStyles.discussionContent} data-testid="forum-discussion-body">
            <TipTapRenderer content={discussion.content.body} />
          </div>
        )}

        <ReactionBar
          entityId={discussion.id}
          entityType="forum-discussion"
          testIdPrefix={`forum-discussion-${discussion.id}`}
        />

        <div className={forumStyles.discussionReplies}>
          <div className={forumStyles.discussionRepliesHeader}>
            {replies.length} {replies.length === 1 ? "Reply" : "Replies"}
          </div>

          {isLoading && (
            <div className={appStyles.emptyState}>
              <p className={appStyles.emptyStateText}>Loading replies...</p>
            </div>
          )}

          {replies.map((reply: DecryptedForumDiscussionReply) => {
            const draftInfo = replyDraftInfoById.get(reply.id)
            const isTransient = isDraftTransient(draftInfo)
            const showDraftBadge = draftInfo?.hasDraft && !isTransient
            const showPendingDeletion = Boolean(draftInfo?.deleteEntity) && !isTransient
            const replyMetaLabel = showPendingDeletion
              ? `${getSenderName(reply.creatorId)} · ${formatDate(reply.createdAt.getTime())} · Pending deletion`
              : `${getSenderName(reply.creatorId)} · ${formatDate(reply.createdAt.getTime())}`

            return (
              <div
                key={reply.id}
                className={forumStyles.discussionReply}
                data-testid={`forum-reply-${reply.id}`}
                onClick={() => handleOpenReplySidecar(reply)}
              >
                <div className={forumStyles.discussionReplyHeader}>
                  <span>{replyMetaLabel}</span>
                  {showDraftBadge && (
                    <span className={forumStyles.draftBadge} data-testid="forum-reply-draft-badge">
                      Draft
                    </span>
                  )}
                </div>
                <TipTapRenderer content={reply.content.body ?? ""} compact />
                <ReactionBar
                  entityId={reply.id}
                  entityType="forum-reply"
                  testIdPrefix={`forum-reply-${reply.id}`}
                />
              </div>
            )
          })}

          <div ref={repliesEndRef} />
        </div>
      </div>

      {/* Reply composer fixed at bottom */}
      <ReplyComposer
        isPending={sendReplyMutation.isPending}
        onSend={handleSendReply}
        mentionSuggestionContext={mentionSuggestionContext}
      />
    </div>
  )
}

/**
 * ForumToolSidecar displays actions for the main Forum tool view.
 */
interface ForumToolSidecarProps {
  onNewChannel: () => void
}

function ForumToolSidecar({ onNewChannel }: ForumToolSidecarProps) {
  const handleSelect = useCallback(
    (index: number) => {
      if (index === 0) {
        onNewChannel()
      }
    },
    [onNewChannel]
  )

  return (
    <Sidecar itemCount={1} onSelect={handleSelect}>
      <SidecarSection title="Actions">
        <SidecarMenu>
          <SidecarRow
            index={0}
            icon={<Plus size={14} />}
            title="New channel"
            onClick={onNewChannel}
            testId="forum-new-channel-sidecar"
          />
        </SidecarMenu>
      </SidecarSection>
    </Sidecar>
  )
}

/**
 * CreateForumChannelForm handles channel creation with member selection.
 * Members are added via ACL entries after the channel is created.
 */
interface CreateForumChannelFormProps {
  onSuccess: (channelId: string, channelName: string) => void
  onCancel: () => void
}

function CreateForumChannelForm({ onSuccess, onCancel }: CreateForumChannelFormProps) {
  const [selectedMembers, setSelectedMembers] = useState<SelectedMember[]>([])
  const memberSelectionRef = useRef<MemberSelectionFieldRef>(null)

  // Mutations for creating channel and ACL entries
  const createChannelMutation = useCreateForumChannel()
  const { mutateAsync: createACLEntry } = useCreateForumChannelACLEntry()

  const handleSubmit = useCallback(
    async (values: Record<string, string | boolean>) => {
      const name = values.name as string
      const description = (values.description as string) || null

      // Create the channel first
      const channel = await createChannelMutation.mutateAsync({
        name: name.trim(),
        description,
      })

      // Then create ACL entries for selected members
      // We don't await all of these - if some fail, the channel still exists
      // and the user can add members later via the manage members UI
      for (const member of selectedMembers) {
        try {
          await createACLEntry({
            channelId: channel.id,
            subjectType: member.subjectType,
            subjectId: member.subjectId,
            permission: member.permission,
          })
        } catch (error) {
          // Log but don't fail - channel is created, member can be added later
          console.error("Failed to add member to channel:", error)
        }
      }

      onSuccess(channel.id, channel.content.name)
    },
    [createChannelMutation, createACLEntry, selectedMembers, onSuccess]
  )

  return (
    <FormSidecar
      title="New Channel"
      fields={[
        {
          name: "name",
          type: "text",
          label: "Name",
          required: true,
          placeholder: "Channel name...",
          testId: "create-channel-name-input",
        },
        {
          name: "description",
          type: "textarea",
          label: "Description",
          placeholder: "Optional description...",
          testId: "create-channel-description-input",
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
 * NewDiscussionDetailView provides a full-page form for creating new discussions.
 * Designed for long-form content creation with title and body fields.
 */
interface NewDiscussionDetailViewProps {
  channelId: string
  channelName: string
  onCancel: () => void
  onSuccess: (discussion: DecryptedForumDiscussion) => void
}

function NewDiscussionDetailView({
  channelId,
  channelName,
  onCancel,
  onSuccess,
}: NewDiscussionDetailViewProps) {
  const { clearSidecar } = useSidecar()
  // Pre-generate discussion ID for file attachment binding
  const [discussionId] = useState(() => crypto.randomUUID())
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const mentionSuggestionContext = useMemo<MentionSuggestionContext>(
    () => ({
      contextType: "acl",
      resourceType: "forum_channel",
      resourceId: channelId,
    }),
    [channelId]
  )

  // Create discussion mutation
  const createDiscussionMutation = useCreateForumDiscussion()

  // Clear sidecar when showing this view
  useEffect(() => {
    clearSidecar()
  }, [clearSidecar])

  const handleSubmit = useCallback(() => {
    if (!title.trim() || isSubmitting) return

    // Check if body has meaningful content (not just empty paragraphs)
    const hasContent = body.trim() && body.trim() !== "<p></p>"

    setIsSubmitting(true)
    createDiscussionMutation.mutate(
      {
        id: discussionId,
        channelId,
        title: title.trim(),
        body: hasContent ? body : null,
      },
      {
        onSuccess: ({ discussion }) => {
          onSuccess(discussion)
        },
        onError: () => {
          setIsSubmitting(false)
        },
      }
    )
  }, [title, body, isSubmitting, createDiscussionMutation, discussionId, channelId, onSuccess])

  // Handle keyboard shortcuts from TipTapEditor
  const handleEditorKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Cmd/Ctrl + Enter to submit
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSubmit()
        return true
      }
      return false
    },
    [handleSubmit]
  )

  // Handle keyboard shortcuts on the container (for escape)
  const handleContainerKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Escape to cancel
      if (e.key === "Escape") {
        e.preventDefault()
        onCancel()
      }
    },
    [onCancel]
  )

  const isSubmitDisabled = !title.trim() || isSubmitting

  return (
    <CustomListContent testId="new-discussion-view">
      <div className={forumStyles.newDiscussionView} onKeyDown={handleContainerKeyDown}>
        <div className={forumStyles.newDiscussionHeader}>
          <span className={forumStyles.newDiscussionTitle}>New discussion in {channelName}</span>
        </div>

        <div className={forumStyles.newDiscussionForm}>
          <ListDetailViewInput
            label="Title"
            placeholder="What do you want to discuss?"
            value={title}
            onChange={setTitle}
            disabled={isSubmitting}
            testId="create-discussion-title-input"
            inputRef={titleInputRef}
            autoFocus
          />

          <div className={forumStyles.newDiscussionEditorWrapper}>
            <label className={forumStyles.newDiscussionEditorLabel}>Content</label>
            <TipTapEditor
              content={body}
              placeholder="Share your thoughts, ideas, or questions..."
              onChange={setBody}
              showToolbar={true}
              disabled={isSubmitting}
              fileAttachment={{
                entityId: discussionId,
                entityType: "forum_discussion",
              }}
              onKeyDown={handleEditorKeyDown}
              mentionSuggestionContext={mentionSuggestionContext}
              testId="create-discussion-content-editor"
              className={forumStyles.newDiscussionEditor}
            />
          </div>
        </div>

        <div className={forumStyles.newDiscussionActions}>
          <button
            className={forumStyles.newDiscussionCancelButton}
            onClick={onCancel}
            disabled={isSubmitting}
            type="button"
          >
            Cancel
          </button>
          <button
            className={forumStyles.newDiscussionSubmitButton}
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
            type="button"
            data-testid="create-discussion-confirm-button"
          >
            {isSubmitting ? "Creating..." : "Create Discussion"}
          </button>
        </div>
      </div>
    </CustomListContent>
  )
}
