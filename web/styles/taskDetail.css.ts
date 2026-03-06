import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

// ============================================================
// TaskDetailView Styles
// Terminus view for viewing and editing a single task
// ============================================================

export const taskDetailContainer = style({
  display: "flex",
  flexDirection: "column",
  height: "100%",
  minHeight: 0,
})

export const taskDetailEmpty = style({
  padding: vars.space[5],
  textAlign: "center",
  color: vars.color.textTertiary,
  fontSize: vars.fontSize[13],
})

// ============================================================
// Header / Title Section
// ============================================================

export const taskDetailHeader = style({
  display: "flex",
  flexDirection: "column",
})

export const taskDetailTitle = style({
  fontSize: vars.fontSize[18],
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textPrimary,
  margin: 0,
  cursor: "pointer",
  padding: `${vars.space[1]} 0`,
  borderRadius: vars.borderRadius.base,
  transition: `background ${vars.transition.fast}`,
  ":hover": {
    background: vars.color.bgSecondary,
  },
})

export const taskDetailTitleInput = style({
  fontSize: vars.fontSize[18],
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textPrimary,
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.base,
  padding: vars.space[1],
  outline: "none",
  fontFamily: "inherit",
  width: "100%",
  ":focus": {
    borderColor: vars.color.textTertiary,
  },
})

// ============================================================
// Scrollable content area (title, description, comments list)
// ============================================================

export const taskDetailContent = style({
  flex: 1,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: vars.space[6],
  minHeight: 0,
})

// ============================================================
// Section (Description, Comments)
// ============================================================

export const taskDetailSection = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[2],
})

export const taskDetailSectionLabel = style({
  fontSize: vars.fontSize[11],
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textTertiary,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
})

// Header row for sections that need a label and status indicator side by side
export const taskDetailSectionHeader = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
})

// Saving status indicator shown when changes are being persisted
export const taskDetailSavingStatus = style({
  fontSize: vars.fontSize[11],
  color: vars.color.textTertiary,
})

// ============================================================
// Description
// ============================================================

export const taskDetailDescription = style({
  fontSize: vars.fontSize[14],
  color: vars.color.textPrimary,
  lineHeight: 1.6,
  padding: vars.space[2],
  background: vars.color.bgSecondary,
  borderRadius: vars.borderRadius.base,
  cursor: "pointer",
  minHeight: "60px",
  transition: `background ${vars.transition.fast}`,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  ":hover": {
    background: vars.color.bgTertiary,
  },
})

export const taskDetailDescriptionInput = style({
  fontSize: vars.fontSize[14],
  color: vars.color.textPrimary,
  lineHeight: 1.6,
  padding: vars.space[2],
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.base,
  outline: "none",
  fontFamily: "inherit",
  minHeight: "100px",
  resize: "vertical",
  width: "100%",
  boxSizing: "border-box",
  ":focus": {
    borderColor: vars.color.textTertiary,
  },
})

export const taskDetailPlaceholder = style({
  color: vars.color.textTertiary,
  fontStyle: "italic",
})

// TipTap editor wrapper for description editing
export const taskDetailDescriptionEditor = style({
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.base,
  overflow: "hidden",
  minHeight: "120px",
})

// ============================================================
// Comments
// ============================================================

export const taskDetailCommentsList = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[3],
})

export const taskDetailCommentsEmpty = style({
  padding: vars.space[4],
  textAlign: "center",
  color: vars.color.textTertiary,
  fontSize: vars.fontSize[13],
  background: vars.color.bgSecondary,
  borderRadius: vars.borderRadius.base,
})

export const taskDetailComment = style({
  display: "flex",
  gap: vars.space[3],
  padding: vars.space[3],
  background: vars.color.bgSecondary,
  borderRadius: vars.borderRadius.base,
})

export const taskDetailCommentAvatar = style({
  width: "28px",
  height: "28px",
  borderRadius: "50%",
  background: vars.color.textTertiary,
  color: vars.color.bgPrimary,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: vars.fontSize[12],
  fontWeight: vars.fontWeight.medium,
  flexShrink: 0,
})

export const taskDetailCommentBody = style({
  flex: 1,
  minWidth: 0,
})

export const taskDetailCommentHeader = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  marginBottom: vars.space[1],
})

export const taskDetailCommentAuthor = style({
  fontSize: vars.fontSize[13],
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textPrimary,
})

export const taskDetailCommentTime = style({
  fontSize: vars.fontSize[12],
  color: vars.color.textTertiary,
})

export const taskDetailCommentContent = style({
  fontSize: vars.fontSize[14],
  color: vars.color.textSecondary,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
})

// ============================================================
// Comment Input Footer (fixed at bottom)
// ============================================================

export const taskDetailCommentFooter = style({
  flexShrink: 0,
  borderTop: `1px solid ${vars.color.borderColor}`,
  paddingTop: vars.space[3],
  marginTop: vars.space[3],
})

// Composer container with border that wraps textarea and footer
export const taskDetailComposer = style({
  display: "flex",
  flexDirection: "column",
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.base,
  background: vars.color.bgPrimary,
  ":focus-within": {
    borderColor: vars.color.textTertiary,
  },
})

export const taskDetailCommentInput = style({
  flex: 1,
  padding: "10px",
  border: "none",
  borderRadius: `${vars.borderRadius.base} ${vars.borderRadius.base} 0 0`,
  fontSize: vars.fontSize[14],
  outline: "none",
  fontFamily: "inherit",
  resize: "none",
  background: "transparent",
  color: vars.color.textPrimary,
  lineHeight: 1.5,
})

// Footer inside composer with hint and send button
export const taskDetailComposerFooter = style({
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "flex-end",
  gap: vars.space[2],
  padding: "0 10px 10px 10px",
})

export const taskDetailCommentHint = style({
  fontSize: vars.fontSize[11],
  color: vars.color.textTertiary,
})

export const taskDetailCommentSend = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "28px",
  height: "28px",
  borderRadius: vars.borderRadius.base,
  border: "none",
  background: vars.color.bgTertiary,
  color: vars.color.textSecondary,
  cursor: "pointer",
  transition: `all ${vars.transition.fast}`,
  flexShrink: 0,
  ":hover": {
    background: vars.color.textPrimary,
    color: vars.color.bgPrimary,
  },
  ":disabled": {
    opacity: 0.4,
    cursor: "not-allowed",
  },
})
