import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

export const chatContainer = style({
  display: "flex",
  flexDirection: "column",
  height: "100%",
  minHeight: "400px",
})

export const chatHeader = style({
  paddingBottom: vars.space[3],
  borderBottom: `1px solid ${vars.color.borderLight}`,
  marginBottom: vars.space[3],
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
})

export const chatHeaderTitle = style({
  fontSize: vars.fontSize[15],
  fontWeight: vars.fontWeight.medium,
  flex: 1,
})

// Action button in chat header (e.g., member count button)
export const chatHeaderAction = style({
  display: "flex",
  alignItems: "center",
  gap: "4px",
  padding: `${vars.space[1]} ${vars.space[2]}`,
  background: vars.color.bgTertiary,
  border: "none",
  borderRadius: vars.borderRadius.md,
  cursor: "pointer",
  fontSize: vars.fontSize[12],
  color: vars.color.textSecondary,
  transition: `background ${vars.transition.fast}`,
  ":hover": {
    background: vars.color.borderColor,
    color: vars.color.textPrimary,
  },
})

// Description text in chat header, right-aligned, max 2 lines
export const chatHeaderDescription = style({
  fontSize: vars.fontSize[12],
  color: vars.color.textTertiary,
  textAlign: "right",
  maxWidth: "50%",
  overflow: "hidden",
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  lineHeight: 1.4,
})

export const chatAvatar = style({
  width: "28px",
  height: "28px",
  background: vars.color.bgTertiary,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: vars.color.textSecondary,
})

export const chatMessages = style({
  flex: 1,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  // No gap - message grouping handles spacing
  paddingBottom: vars.space[3],
})

// ============================================================
// Slack-like Message Layout
// ============================================================

// Message row container - horizontal layout with avatar on left
export const chatMessageRow = style({
  display: "flex",
  alignItems: "flex-start",
  gap: vars.space[2],
  paddingLeft: vars.space[2],
  paddingRight: vars.space[3],
  paddingTop: vars.space[3],
  paddingBottom: "2px",
  position: "relative",
  ":hover": {
    background: vars.color.bgHover,
  },
})

// Continuation row for consecutive messages from same sender (no avatar/name)
export const chatMessageRowContinuation = style({
  display: "flex",
  alignItems: "flex-start",
  gap: vars.space[2],
  paddingLeft: vars.space[2],
  paddingRight: vars.space[3],
  paddingTop: "2px",
  paddingBottom: "2px",
  position: "relative",
  ":hover": {
    background: vars.color.bgHover,
  },
})

// Avatar placeholder to maintain alignment for continuation messages
export const chatMessageAvatarPlaceholder = style({
  width: "36px",
  flexShrink: 0,
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "flex-start",
  paddingTop: "4px",
})

// Message content area (right of avatar)
export const chatMessageContent = style({
  flex: 1,
  minWidth: 0,
  fontSize: vars.fontSize[14],
  lineHeight: 1.5,
  wordBreak: "break-word",
  overflowWrap: "break-word",
})

// Message header with sender name and timestamp
export const chatMessageHeader = style({
  display: "flex",
  alignItems: "baseline",
  gap: vars.space[2],
  marginBottom: "2px",
})

// ============================================================
// DM (iMessage/Signal style) Components
// ============================================================

// DM message row container - horizontal flex to position hover actions next to bubble
export const dmMessageRowMine = style({
  display: "flex",
  flexDirection: "row",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: vars.space[2],
  paddingLeft: vars.space[3],
  paddingRight: vars.space[3],
  marginBottom: "2px",
})

export const dmMessageRowTheirs = style({
  display: "flex",
  flexDirection: "row",
  justifyContent: "flex-start",
  alignItems: "center",
  gap: vars.space[2],
  paddingLeft: vars.space[3],
  paddingRight: vars.space[3],
  marginBottom: "2px",
})

// DM bubble base styles
const dmBubbleBase = {
  maxWidth: "75%",
  padding: `${vars.space[2]} ${vars.space[3]}`,
  borderRadius: "18px",
  fontSize: vars.fontSize[14],
  lineHeight: 1.4,
  wordBreak: "break-word" as const,
  overflowWrap: "break-word" as const,
  position: "relative" as const,
}

// User's bubble - blue, right side
export const dmBubbleMine = style({
  ...dmBubbleBase,
  background: "#3478F6",
  color: "#fff",
})

// Other person's bubble - gray, left side
export const dmBubbleTheirs = style({
  ...dmBubbleBase,
  background: vars.color.bgTertiary,
  color: vars.color.textPrimary,
})

// Inline timestamp inside bubble (Signal-style)
export const dmTimestamp = style({
  display: "inline-block",
  fontSize: vars.fontSize[10],
  opacity: 0.7,
  marginLeft: vars.space[2],
  whiteSpace: "nowrap",
  verticalAlign: "bottom",
})

// Quoted preview inside DM bubble (Signal-style)
export const dmQuotedPreview = style({
  fontSize: vars.fontSize[13],
  background: "rgba(255, 255, 255, 0.15)",
  borderLeft: "3px solid rgba(255, 255, 255, 0.6)",
  borderRadius: "4px",
  padding: `${vars.space[2]} ${vars.space[2]}`,
  marginBottom: vars.space[2],
  display: "flex",
  flexDirection: "column",
  gap: "2px",
})

// Clickable quoted preview inside DM bubble (for scroll-to-message)
export const dmQuotedPreviewClickable = style([
  dmQuotedPreview,
  {
    cursor: "pointer",
    transition: `background ${vars.transition.fast}`,
    ":hover": {
      background: "rgba(255, 255, 255, 0.25)",
    },
  },
])

// Quoted message sender name
export const dmQuotedSender = style({
  fontSize: vars.fontSize[12],
  fontWeight: 600,
  opacity: 0.9,
})

// Quoted message text content
export const dmQuotedText = style({
  fontSize: vars.fontSize[13],
  opacity: 0.85,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
})

// Quoted preview for the other person's messages (different background)
export const dmQuotedPreviewTheirs = style({
  fontSize: vars.fontSize[13],
  background: "rgba(0, 0, 0, 0.08)",
  borderLeft: `3px solid ${vars.color.textTertiary}`,
  borderRadius: "4px",
  padding: `${vars.space[2]} ${vars.space[2]}`,
  marginBottom: vars.space[2],
  display: "flex",
  flexDirection: "column",
  gap: "2px",
})

// Clickable quoted preview for the other person's messages
export const dmQuotedPreviewTheirsClickable = style([
  dmQuotedPreviewTheirs,
  {
    cursor: "pointer",
    transition: `background ${vars.transition.fast}`,
    ":hover": {
      background: "rgba(0, 0, 0, 0.15)",
    },
  },
])

// Hover actions for DM messages - inline next to the bubble
export const dmHoverActions = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[1],
  opacity: 0,
  transition: `opacity ${vars.transition.fast}`,
  background: vars.color.bgPrimary,
  border: `1px solid ${vars.color.borderLight}`,
  borderRadius: vars.borderRadius.md,
  padding: "2px",
  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  flexShrink: 0,
  selectors: {
    [`${dmMessageRowMine}:hover &`]: {
      opacity: 1,
    },
    [`${dmMessageRowTheirs}:hover &`]: {
      opacity: 1,
    },
  },
})

// Hover actions positioned to the left of user's bubble (order: actions, bubble)
export const dmHoverActionsMine = style([dmHoverActions])

// Hover actions positioned to the right of other's bubble (order: bubble, actions)
export const dmHoverActionsTheirs = style([dmHoverActions])


export const chatInputContainer = style({
  display: "flex",
  gap: vars.space[2],
  paddingTop: vars.space[3],
  borderTop: `1px solid ${vars.color.borderLight}`,
})

export const chatInput = style({
  flex: 1,
  padding: `${vars.space[2]} ${vars.space[3]}`,
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.lg,
  fontSize: vars.fontSize[14],
  outline: "none",
  background: vars.color.bgPrimary,
  color: vars.color.textPrimary,
  "::placeholder": {
    color: vars.color.textTertiary,
  },
  ":focus": {
    borderColor: vars.color.textTertiary,
  },
})

export const chatSend = style({
  padding: `${vars.space[2]} 14px`,
  background: vars.color.bgTertiary,
  color: vars.color.textPrimary,
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.lg,
  cursor: "pointer",
  fontSize: vars.fontSize[14],
  transition: `all ${vars.transition.fast}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  ":hover": {
    background: vars.color.bgHover,
    borderColor: vars.color.textTertiary,
  },
})

// Sender name - bold, inherits color from parent bubble
export const chatMessageSender = style({
  fontSize: vars.fontSize[14],
  fontWeight: 600,
  // Use inherit so it works in both mine (dark text) and theirs (light text) bubbles
  color: "inherit",
})

// Sender name for "You" - uses green accent color
export const chatMessageSenderYou = style({
  fontSize: vars.fontSize[14],
  fontWeight: 600,
  color: vars.color.resolvedGreen,
})

// Timestamp - inline with sender name (Slack-style)
export const chatMessageTime = style({
  fontSize: vars.fontSize[11],
  color: vars.color.textTertiary,
})

// Hover-only timestamp for continuation messages
export const chatMessageTimeHover = style({
  fontSize: vars.fontSize[10],
  color: vars.color.textTertiary,
  opacity: 0,
  whiteSpace: "nowrap",
  transition: `opacity ${vars.transition.fast}`,
  selectors: {
    [`${chatMessageRowContinuation}:hover &`]: {
      opacity: 1,
    },
  },
})

export const threadContainer = style({
  marginLeft: vars.space[4],
  marginTop: vars.space[2],
})

// ============================================================
// Date Divider (Slack-style sticky date headers)
// ============================================================

// Date divider container - sticky header that shows when scrolling through messages
export const chatDateDivider = style({
  position: "sticky",
  top: 0,
  zIndex: 10,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: `${vars.space[3]} 0`,
  background: vars.color.bgPrimary,
})

// Date pill/badge
export const chatDatePill = style({
  display: "inline-flex",
  alignItems: "center",
  padding: `${vars.space[1]} ${vars.space[3]}`,
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.borderLight}`,
  borderRadius: vars.borderRadius.lg,
  fontSize: vars.fontSize[12],
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textSecondary,
})

export const threadToggle = style({
  fontSize: vars.fontSize[11],
  color: vars.color.textTertiary,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "4px",
  padding: "4px 0",
  ":hover": {
    color: vars.color.textPrimary,
  },
})

// Message footer with quote button (Slack-style: inline actions)
export const chatMessageFooter = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space[1],
  marginLeft: vars.space[2],
  opacity: 0,
  transition: `opacity ${vars.transition.fast}`,
  selectors: {
    [`${chatMessageRow}:hover &`]: {
      opacity: 1,
    },
    [`${chatMessageRowContinuation}:hover &`]: {
      opacity: 1,
    },
  },
})

// Quote button on messages (Slack-style action button)
export const chatQuoteButton = style({
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.borderLight}`,
  cursor: "pointer",
  padding: "4px 6px",
  borderRadius: vars.borderRadius.sm,
  color: vars.color.textSecondary,
  display: "flex",
  alignItems: "center",
  transition: `all ${vars.transition.fast}`,
  ":hover": {
    background: vars.color.bgHover,
    color: vars.color.textPrimary,
    borderColor: vars.color.borderColor,
  },
})

// Quoted message preview (Signal-style container with sender name)
export const chatQuotedPreview = style({
  fontSize: vars.fontSize[13],
  background: vars.color.bgTertiary,
  borderLeft: `3px solid ${vars.color.textTertiary}`,
  borderRadius: "4px",
  padding: `${vars.space[2]} ${vars.space[2]}`,
  marginBottom: vars.space[2],
  display: "flex",
  flexDirection: "column",
  gap: "2px",
})

// Clickable quoted message preview (for scroll-to-message functionality)
export const chatQuotedPreviewClickable = style([
  chatQuotedPreview,
  {
    cursor: "pointer",
    transition: `background ${vars.transition.fast}`,
    ":hover": {
      background: vars.color.bgHover,
    },
  },
])

// Quoted message sender name (for group chats)
export const chatQuotedSender = style({
  fontSize: vars.fontSize[12],
  fontWeight: 600,
  color: vars.color.textSecondary,
})

// Quoted message text content (for group chats)
export const chatQuotedText = style({
  fontSize: vars.fontSize[13],
  color: vars.color.textSecondary,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
})

// Quoted message preview in the composer area
export const chatQuotedComposer = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  padding: `${vars.space[2]} ${vars.space[3]}`,
  background: vars.color.bgTertiary,
  borderRadius: vars.borderRadius.md,
  marginBottom: vars.space[2],
  fontSize: vars.fontSize[13],
})

// Quoted text in composer
export const chatComposerQuotedText = style({
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  opacity: 0.8,
})

// Clear quote button
export const chatQuoteClear = style({
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: "4px",
  borderRadius: "4px",
  color: vars.color.textSecondary,
  display: "flex",
  alignItems: "center",
  ":hover": {
    color: vars.color.textPrimary,
  },
})

// ============================================================
// Chat Message Composer (TipTap-based)
// ============================================================

// Container for the chat composer with TipTap editor
export const chatComposerContainer = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[2],
  paddingTop: vars.space[3],
  borderTop: `1px solid ${vars.color.borderLight}`,
})

// TipTap editor wrapper for chat composer (compact mode)
export const chatComposerEditor = style({
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.lg,
  overflow: "hidden",
  maxHeight: "120px",
  minHeight: "40px",
})

// ============================================================
// Hover Actions Toolbar (React & Reply buttons)
// ============================================================

// Hover actions toolbar positioned at top right of message row, vertically centered
export const chatMessageHoverActions = style({
  position: "absolute",
  top: "50%",
  right: vars.space[3],
  transform: "translateY(-50%)",
  display: "flex",
  alignItems: "center",
  gap: vars.space[1],
  opacity: 0,
  transition: `opacity ${vars.transition.fast}`,
  background: vars.color.bgPrimary,
  border: `1px solid ${vars.color.borderLight}`,
  borderRadius: vars.borderRadius.md,
  padding: "2px",
  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  selectors: {
    [`${chatMessageRow}:hover &`]: {
      opacity: 1,
    },
    [`${chatMessageRowContinuation}:hover &`]: {
      opacity: 1,
    },
  },
})

// Individual action button in the hover toolbar
export const chatMessageHoverActionButton = style({
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: "4px 6px",
  borderRadius: vars.borderRadius.sm,
  color: vars.color.textSecondary,
  display: "flex",
  alignItems: "center",
  transition: `all ${vars.transition.fast}`,
  ":hover": {
    background: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
})
