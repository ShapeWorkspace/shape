import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

export const discussionView = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[4],
  height: "100%",
  overflow: "hidden",
})

export const discussionHeader = style({
  paddingBottom: vars.space[3],
  borderBottom: `1px solid ${vars.color.borderLight}`,
})

export const discussionMeta = style({
  fontSize: vars.fontSize[12],
  color: vars.color.textTertiary,
  marginTop: vars.space[1],
})

// Scrollable area containing both content and replies
export const discussionScrollArea = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[4],
  flex: 1,
  overflowY: "auto",
  minHeight: 0,
})

export const discussionContent = style({
  fontSize: vars.fontSize[14],
  lineHeight: 1.6,
  flexShrink: 0,
})

export const discussionReplies = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[3],
})

export const discussionRepliesHeader = style({
  fontSize: vars.fontSize[12],
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textTertiary,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
})

export const discussionReply = style({
  padding: vars.space[3],
  background: vars.color.bgSecondary,
  borderRadius: vars.borderRadius.base,
  fontSize: vars.fontSize[14],
  lineHeight: 1.5,
  cursor: "pointer",
  transition: `background ${vars.transition.fast}`,
  ":hover": {
    background: vars.color.bgTertiary,
  },
})

export const discussionReplyHeader = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: vars.space[2],
  fontSize: vars.fontSize[12],
  color: vars.color.textTertiary,
  marginBottom: vars.space[1],
  fontWeight: vars.fontWeight.medium,
})

// Draft badge for forum entities in list/detail views
export const draftBadge = style({
  marginLeft: vars.space[2],
  padding: "2px 6px",
  borderRadius: "10px",
  fontSize: vars.fontSize[10],
  fontWeight: vars.fontWeight.medium,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  background: vars.color.bgSecondary,
  color: vars.color.textTertiary,
  display: "inline-flex",
  alignItems: "center",
})

export const modalTextarea = style({
  width: "100%",
  minHeight: "100px",
  padding: `${vars.space[2]} ${vars.space[3]}`,
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.base,
  fontSize: vars.fontSize[13],
  marginBottom: vars.space[3],
  resize: "vertical",
  fontFamily: "inherit",
  outline: "none",
  background: vars.color.bgPrimary,
  color: vars.color.textPrimary,
  ":focus": {
    borderColor: vars.color.textTertiary,
  },
})

// ============================================================
// New Discussion Creation View
// ============================================================

export const newDiscussionView = style({
  display: "flex",
  flexDirection: "column",
  height: "100%",
  gap: vars.space[4],
})

export const newDiscussionHeader = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  paddingBottom: vars.space[3],
  borderBottom: `1px solid ${vars.color.borderLight}`,
})

export const newDiscussionTitle = style({
  fontSize: vars.fontSize[15],
  fontWeight: vars.fontWeight.medium,
})

export const newDiscussionForm = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[4],
  flex: 1,
  overflow: "hidden",
})

export const newDiscussionActions = style({
  display: "flex",
  gap: vars.space[2],
  justifyContent: "flex-end",
  paddingTop: vars.space[3],
  borderTop: `1px solid ${vars.color.borderLight}`,
})

export const newDiscussionCancelButton = style({
  padding: `${vars.space[2]} ${vars.space[4]}`,
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.base,
  background: "none",
  fontSize: vars.fontSize[13],
  cursor: "pointer",
  color: vars.color.textSecondary,
  transition: `all ${vars.transition.fast}`,
  ":hover": {
    background: vars.color.bgSecondary,
  },
  ":disabled": {
    opacity: 0.5,
    cursor: "not-allowed",
  },
})

export const newDiscussionSubmitButton = style({
  padding: `${vars.space[2]} ${vars.space[4]}`,
  border: "none",
  borderRadius: vars.borderRadius.base,
  background: vars.color.textPrimary,
  color: vars.color.bgPrimary,
  fontSize: vars.fontSize[13],
  cursor: "pointer",
  transition: `all ${vars.transition.fast}`,
  ":hover": {
    opacity: 0.9,
  },
  ":disabled": {
    opacity: 0.5,
    cursor: "not-allowed",
  },
})

// TipTapEditor wrapper for new discussion creation
export const newDiscussionEditorWrapper = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  overflow: "hidden",
})

export const newDiscussionEditorLabel = style({
  fontSize: vars.fontSize[12],
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textSecondary,
  marginBottom: vars.space[2],
})

export const newDiscussionEditor = style({
  flex: 1,
  display: "flex",
  flexDirection: "column",
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.base,
  overflow: "hidden",
})

// ============================================================
// Reply Composer
// ============================================================

// Wrapper for composers that use inline send button (no external button)
export const replyComposerWrapper = style({
  display: "flex",
  flexDirection: "column",
})

// Legacy container for composers with external send button
export const replyComposerContainer = style({
  display: "flex",
  gap: vars.space[2],
  alignItems: "flex-end",
})

export const replyComposerEditor = style({
  flex: 1,
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.base,
  overflow: "hidden",
  minHeight: "44px",
  maxHeight: "120px",
})

export const replyComposerSendButton = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "36px",
  height: "36px",
  padding: 0,
  border: "none",
  borderRadius: vars.borderRadius.base,
  background: vars.color.textPrimary,
  color: vars.color.bgPrimary,
  cursor: "pointer",
  transition: `all ${vars.transition.fast}`,
  flexShrink: 0,
  ":hover": {
    opacity: 0.9,
  },
  ":disabled": {
    opacity: 0.4,
    cursor: "not-allowed",
  },
})
