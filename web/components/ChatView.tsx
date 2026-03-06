/**
 * ChatView - Unified chat component for both DMs and Group Chats.
 *
 * Supports two variants:
 * - "dm": Bubble-style layout (user's messages on right, other's on left)
 * - "group": Slack-style layout (all messages on left with avatars)
 *
 * Both variants share:
 * - Sticky date headers
 * - Hover actions toolbar (React + Reply)
 * - Quoted message preview
 * - Reaction bar
 * - TipTap content rendering
 * - ChatMessageComposer integration
 */

import { useRef, useEffect, useCallback } from "react"
import { Reply } from "lucide-react"
import type { EntityType } from "../../engine/utils/encryption-types"
import type { MentionSuggestionContext } from "../store/queries/use-mention-suggestions"
import { useReactionToggle } from "./reactions/ReactionBar"
import { ReactionBar } from "./reactions/ReactionBar"
import { ReactionPicker } from "./reactions/ReactionPicker"
import { ChatMessageComposer, QuotedMessage } from "./ChatMessageComposer"
import { TipTapRenderer } from "./TipTapRenderer"
import { WorkspaceMemberAvatar } from "./WorkspaceMemberAvatar"
import { getPlainTextPreview } from "../utils/text-utils"
import * as chatStyles from "../styles/chat.css"
import * as appStyles from "../styles/app.css"
import type { DecryptedDirectMessage, DecryptedGroupMessage } from "@shape/engine/models/entity"

// ============================================================
// Types
// ============================================================

export type ChatMessage = DecryptedDirectMessage | DecryptedGroupMessage

export interface ChatViewProps {
  variant: "dm" | "group"
  messages: ChatMessage[]
  currentUserId: string

  // For sender name/avatar resolution
  getSenderName: (senderId: string) => string
  getSenderAvatarDataUrl?: (senderId: string) => string | null

  // Reactions
  reactionEntityType: EntityType

  // Actions
  onQuote: (message: ChatMessage) => void

  // Composer
  composerEntityType: string
  isPending: boolean
  onSend: (messageId: string, content: string, mentions: string[]) => void
  quotedMessage: QuotedMessage | null
  onClearQuote: () => void
  mentionSuggestionContext?: MentionSuggestionContext

  // Test IDs
  testIdPrefix: string
  // Optional override for container testId (defaults to `${testIdPrefix}-conversation-container`)
  containerTestId?: string
}

// ============================================================
// Hover Actions Toolbar
// ============================================================

interface MessageHoverActionsProps {
  messageId: string
  reactionEntityType: EntityType
  onQuote: () => void
  testIdPrefix: string
  // For DM variant: position actions on opposite side of bubble
  variant?: "group" | "dm-mine" | "dm-theirs"
}

function MessageHoverActions({
  messageId,
  reactionEntityType,
  onQuote,
  testIdPrefix,
  variant = "group",
}: MessageHoverActionsProps) {
  const handleReactionToggle = useReactionToggle(reactionEntityType, messageId)

  // Choose the appropriate container class based on variant
  let containerClass = chatStyles.chatMessageHoverActions
  if (variant === "dm-mine") {
    containerClass = chatStyles.dmHoverActionsMine
  } else if (variant === "dm-theirs") {
    containerClass = chatStyles.dmHoverActionsTheirs
  }

  return (
    <div className={containerClass}>
      <ReactionPicker
        onEmojiSelect={handleReactionToggle}
        testId={`${testIdPrefix}-reaction-add`}
        ariaLabel="Add reaction"
        iconOnly
        triggerClassName={chatStyles.chatMessageHoverActionButton}
      />
      <button
        className={chatStyles.chatMessageHoverActionButton}
        onClick={onQuote}
        title="Reply"
        data-testid={`${testIdPrefix}-quote-button`}
      >
        <Reply size={14} />
      </button>
    </div>
  )
}

// ============================================================
// Date Formatting Helpers
// ============================================================

/**
 * Format date for sticky dividers (e.g., "Today", "Yesterday", "Thursday, January 2nd")
 */
function formatDateDivider(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()

  // Check if today
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  if (isToday) return "Today"

  // Check if yesterday
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  if (isYesterday) return "Yesterday"

  // For older dates, show day of week + full date
  const dayOfWeek = date.toLocaleDateString("en-US", { weekday: "long" })
  const month = date.toLocaleDateString("en-US", { month: "long" })
  const day = date.getDate()

  // Add ordinal suffix (1st, 2nd, 3rd, etc.)
  const ordinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"]
    const v = n % 100
    return n + (s[(v - 20) % 10] || s[v] || s[0])
  }

  // Include year if not current year
  if (date.getFullYear() !== now.getFullYear()) {
    return `${dayOfWeek}, ${month} ${ordinal(day)}, ${date.getFullYear()}`
  }

  return `${dayOfWeek}, ${month} ${ordinal(day)}`
}

/**
 * Format time (hour:minute with AM/PM)
 */
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

/**
 * Format short time (24h format for continuation messages)
 */
function formatTimeShort(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  })
}

/**
 * Get date key for grouping (YYYY-MM-DD)
 */
function getDateKey(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

// ============================================================
// DM Variant Components
// ============================================================

interface DMMessageBubbleProps {
  message: ChatMessage
  isMine: boolean
  senderName: string
  quotedText: string | undefined
  quotedSenderName: string | undefined
  quotedMessageId: string | undefined
  reactionEntityType: EntityType
  onQuote: () => void
  onScrollToMessage: (messageId: string) => void
  testIdPrefix: string
}

function DMMessageBubble({
  message,
  isMine,
  quotedText,
  quotedSenderName,
  quotedMessageId,
  reactionEntityType,
  onQuote,
  onScrollToMessage,
  testIdPrefix,
}: DMMessageBubbleProps) {
  const hoverActions = (
    <MessageHoverActions
      messageId={message.id}
      reactionEntityType={reactionEntityType}
      onQuote={onQuote}
      testIdPrefix={`${testIdPrefix}-message-${message.id}`}
      variant={isMine ? "dm-mine" : "dm-theirs"}
    />
  )

  const handleQuotedClick = () => {
  if (quotedMessageId) {
    onScrollToMessage(quotedMessageId)
  }
  }

  const bubble = (
    <div className={isMine ? chatStyles.dmBubbleMine : chatStyles.dmBubbleTheirs}>
      {/* Quoted message preview (Signal-style with sender name) - clickable to scroll */}
      {quotedText && quotedMessageId && (
        <div
          className={isMine ? chatStyles.dmQuotedPreviewClickable : chatStyles.dmQuotedPreviewTheirsClickable}
          data-testid={`${testIdPrefix}-quoted-reference`}
          onClick={handleQuotedClick}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === "Enter" && handleQuotedClick()}
        >
          <span className={chatStyles.dmQuotedSender}>{quotedSenderName}</span>
          <span className={chatStyles.dmQuotedText}>{quotedText}</span>
        </div>
      )}

      {/* Message content */}
      <TipTapRenderer content={message.content.text} />

      {/* Inline timestamp at bottom right */}
      <span className={chatStyles.dmTimestamp}>{formatTime(message.createdAt.getTime())}</span>
    </div>
  )

  return (
    <div data-testid={`${testIdPrefix}-message-${message.id}`}>
      {/* Row with hover actions and bubble - order depends on whose message */}
      <div className={isMine ? chatStyles.dmMessageRowMine : chatStyles.dmMessageRowTheirs}>
        {isMine ? (
          <>
            {hoverActions}
            {bubble}
          </>
        ) : (
          <>
            {bubble}
            {hoverActions}
          </>
        )}
      </div>

      {/* Reaction bar below the bubble, aligned with the bubble */}
      <div
        style={{
          display: "flex",
          justifyContent: isMine ? "flex-end" : "flex-start",
          paddingRight: "12px",
          paddingLeft: "12px",
        }}
      >
        <ReactionBar
          entityId={message.id}
          entityType={reactionEntityType}
          testIdPrefix={`${testIdPrefix}-message-${message.id}`}
          hideAddButton
        />
      </div>
    </div>
  )
}

// ============================================================
// Group Variant Components
// ============================================================

interface GroupMessageRowProps {
  message: ChatMessage
  showHeader: boolean
  senderName: string
  senderAvatarLabel: string
  senderAvatarDataUrl: string | null
  quotedText: string | undefined
  quotedSenderName: string | undefined
  quotedMessageId: string | undefined
  reactionEntityType: EntityType
  onQuote: () => void
  onScrollToMessage: (messageId: string) => void
  testIdPrefix: string
}

function GroupMessageRow({
  message,
  showHeader,
  senderName,
  senderAvatarLabel,
  senderAvatarDataUrl,
  quotedText,
  quotedSenderName,
  quotedMessageId,
  reactionEntityType,
  onQuote,
  onScrollToMessage,
  testIdPrefix,
}: GroupMessageRowProps) {
  const handleQuotedClick = () => {
  if (quotedMessageId) {
    onScrollToMessage(quotedMessageId)
  }
  }

  // Full message row with avatar and header
  if (showHeader) {
    return (
      <div className={chatStyles.chatMessageRow} data-testid={`${testIdPrefix}-message-${message.id}`}>
        {/* Hover actions toolbar */}
        <MessageHoverActions
          messageId={message.id}
          reactionEntityType={reactionEntityType}
          onQuote={onQuote}
          testIdPrefix={`${testIdPrefix}-message-${message.id}`}
        />

        {/* Avatar */}
        <WorkspaceMemberAvatar
          userId={message.creatorId}
          displayName={senderAvatarLabel}
          avatarDataUrl={senderAvatarDataUrl}
          size={36}
          fontSize={14}
        />

        {/* Content area */}
        <div className={chatStyles.chatMessageContent}>
          {/* Header: sender name + timestamp */}
          <div className={chatStyles.chatMessageHeader}>
            <span className={chatStyles.chatMessageSender}>{senderName}</span>
            <span className={chatStyles.chatMessageTime}>{formatTime(message.createdAt.getTime())}</span>
          </div>

          {/* Quoted message preview (Signal-style with sender name) - clickable to scroll */}
          {quotedText && quotedMessageId && (
            <div
              className={chatStyles.chatQuotedPreviewClickable}
              data-testid={`${testIdPrefix}-quoted-reference`}
              onClick={handleQuotedClick}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === "Enter" && handleQuotedClick()}
            >
              <span className={chatStyles.chatQuotedSender}>{quotedSenderName}</span>
              <span className={chatStyles.chatQuotedText}>{quotedText}</span>
            </div>
          )}

          {/* Message content */}
          <TipTapRenderer content={message.content.text} />

          {/* Reaction bar (add button hidden - it's in hover toolbar) */}
          <ReactionBar
            entityId={message.id}
            entityType={reactionEntityType}
            testIdPrefix={`${testIdPrefix}-message-${message.id}`}
            hideAddButton
          />
        </div>
      </div>
    )
  }

  // Continuation row - no avatar or header
  return (
    <div
      className={chatStyles.chatMessageRowContinuation}
      data-testid={`${testIdPrefix}-message-${message.id}`}
    >
      {/* Hover actions toolbar */}
      <MessageHoverActions
        messageId={message.id}
        reactionEntityType={reactionEntityType}
        onQuote={onQuote}
        testIdPrefix={`${testIdPrefix}-message-${message.id}`}
      />

      {/* Placeholder for avatar alignment + hover timestamp */}
      <div className={chatStyles.chatMessageAvatarPlaceholder}>
        <span className={chatStyles.chatMessageTimeHover}>
          {formatTimeShort(message.createdAt.getTime())}
        </span>
      </div>

      {/* Content area */}
      <div className={chatStyles.chatMessageContent}>
        {/* Quoted message preview (Signal-style with sender name) - clickable to scroll */}
        {quotedText && quotedMessageId && (
          <div
            className={chatStyles.chatQuotedPreviewClickable}
            data-testid={`${testIdPrefix}-quoted-reference`}
            onClick={handleQuotedClick}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === "Enter" && handleQuotedClick()}
          >
            <span className={chatStyles.chatQuotedSender}>{quotedSenderName}</span>
            <span className={chatStyles.chatQuotedText}>{quotedText}</span>
          </div>
        )}

        {/* Message content */}
        <TipTapRenderer content={message.content.text} />

        {/* Reaction bar (add button hidden - it's in hover toolbar) */}
        <ReactionBar
          entityId={message.id}
          entityType={reactionEntityType}
          testIdPrefix={`${testIdPrefix}-message-${message.id}`}
          hideAddButton
        />
      </div>
    </div>
  )
}

// ============================================================
// Main ChatView Component
// ============================================================

export function ChatView({
  variant,
  messages,
  currentUserId,
  getSenderName,
  getSenderAvatarDataUrl,
  reactionEntityType,
  onQuote,
  composerEntityType,
  isPending,
  onSend,
  quotedMessage,
  onClearQuote,
  mentionSuggestionContext,
  testIdPrefix,
  containerTestId,
}: ChatViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Scroll to a specific message (used when clicking quoted message references)
  const scrollToMessage = useCallback(
    (messageId: string) => {
      const container = messagesContainerRef.current
      if (!container) return

      const messageElement = container.querySelector(`[data-testid="${testIdPrefix}-message-${messageId}"]`)
      if (messageElement) {
        messageElement.scrollIntoView({ behavior: "smooth", block: "center" })
        // Add a brief highlight effect
        messageElement.classList.add("highlight-message")
        setTimeout(() => {
          messageElement.classList.remove("highlight-message")
        }, 1500)
      }
    },
    [testIdPrefix]
  )

  // Check if this message starts a new date group
  const isNewDateGroup = useCallback(
    (index: number): boolean => {
      if (index === 0) return true
      const currentMsg = messages[index]
      const prevMsg = messages[index - 1]
      if (!currentMsg || !prevMsg) return true
      return getDateKey(currentMsg.createdAt.getTime()) !== getDateKey(prevMsg.createdAt.getTime())
    },
    [messages]
  )

  // Check if message should show full header (group variant only)
  // Show header if: first message, different sender, or >5 min gap
  const shouldShowMessageHeader = useCallback(
    (index: number): boolean => {
      if (index === 0) return true
      const currentMsg = messages[index]
      const prevMsg = messages[index - 1]
      if (!currentMsg || !prevMsg) return true

      // Different sender = show header
      if (currentMsg.creatorId !== prevMsg.creatorId) return true

      // More than 5 minutes apart = show header
      const timeDiff = currentMsg.createdAt.getTime() - prevMsg.createdAt.getTime()
      if (timeDiff > 5 * 60 * 1000) return true

      return false
    },
    [messages]
  )

  // Get quoted message info including sender name (for DM variant)
  const getQuotedMessageInfo = useCallback(
    (quotedMessageId: string | undefined): { text: string; senderName: string } | null => {
      if (!quotedMessageId) return null
      const quoted = messages.find(m => m.id === quotedMessageId)
      if (!quoted) return null
      const senderId = quoted.creatorId
      const senderName = senderId === currentUserId ? "You" : getSenderName(senderId)
      return {
        text: getPlainTextPreview(quoted.content.text, 50),
        senderName,
      }
    },
    [messages, currentUserId, getSenderName]
  )

  // Render a single message based on variant
  const renderMessage = useCallback(
    (message: ChatMessage, index: number) => {
      const handleQuoteMessage = () => onQuote(message)

      if (variant === "dm") {
        const isMine = message.creatorId === currentUserId
        const quotedInfo = getQuotedMessageInfo(message.metaFields.quoted_message_id ?? undefined)
        return (
          <DMMessageBubble
            key={message.id}
            message={message}
            isMine={isMine}
            senderName={getSenderName(message.creatorId)}
            quotedText={quotedInfo?.text}
            quotedSenderName={quotedInfo?.senderName}
            quotedMessageId={message.metaFields.quoted_message_id ?? undefined}
            reactionEntityType={reactionEntityType}
            onQuote={handleQuoteMessage}
            onScrollToMessage={scrollToMessage}
            testIdPrefix={testIdPrefix}
          />
        )
      }

      // Group variant
      const quotedInfo = getQuotedMessageInfo(message.metaFields.quoted_message_id ?? undefined)
      const showHeader = shouldShowMessageHeader(index)
      const senderId = message.creatorId
      const rawSenderName = getSenderName(senderId)
      const senderName = senderId === currentUserId ? "You" : rawSenderName
      const senderAvatarDataUrl = getSenderAvatarDataUrl ? getSenderAvatarDataUrl(senderId) : null
      return (
        <GroupMessageRow
          key={message.id}
          message={message}
          showHeader={showHeader}
          senderName={senderName}
          senderAvatarLabel={rawSenderName}
          senderAvatarDataUrl={senderAvatarDataUrl}
          quotedText={quotedInfo?.text}
          quotedSenderName={quotedInfo?.senderName}
          quotedMessageId={message.metaFields.quoted_message_id ?? undefined}
          reactionEntityType={reactionEntityType}
          onQuote={handleQuoteMessage}
          onScrollToMessage={scrollToMessage}
          testIdPrefix={testIdPrefix}
        />
      )
    },
    [
      variant,
      currentUserId,
      getSenderName,
      getSenderAvatarDataUrl,
      getQuotedMessageInfo,
      shouldShowMessageHeader,
      reactionEntityType,
      onQuote,
      scrollToMessage,
      testIdPrefix,
    ]
  )

  // Use containerTestId if provided, otherwise derive from testIdPrefix
  const resolvedContainerTestId = containerTestId || `${testIdPrefix}-conversation-container`

  return (
    <div className={chatStyles.chatContainer} data-testid={resolvedContainerTestId}>
      {/* Messages list with sticky date headers */}
      <div ref={messagesContainerRef} className={chatStyles.chatMessages}>
        {messages.map((message, index) => {
          const showDateDivider = isNewDateGroup(index)

          if (showDateDivider) {
            return (
              <div key={message.id}>
                {/* Sticky date divider */}
                <div className={chatStyles.chatDateDivider}>
                  <span className={chatStyles.chatDatePill}>
                    {formatDateDivider(message.createdAt.getTime())}
                  </span>
                </div>
                {renderMessage(message, index)}
              </div>
            )
          }

          return renderMessage(message, index)
        })}

        {messages.length === 0 && (
          <div className={appStyles.emptyState} style={{ flex: 1 }}>
            <p className={appStyles.emptyStateText}>
              No messages yet. Send a message to start the conversation.
            </p>
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Message composer */}
      <ChatMessageComposer
        entityType={composerEntityType}
        isPending={isPending}
        onSend={onSend}
        quotedMessage={quotedMessage}
        onClearQuote={onClearQuote}
        mentionSuggestionContext={mentionSuggestionContext}
        testId={`${testIdPrefix}-composer`}
      />
    </div>
  )
}
