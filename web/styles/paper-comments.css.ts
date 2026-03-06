import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

export const commentsSidecarHeader = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: vars.space[2],
  marginBottom: vars.space[2],
})

export const commentsSidecarTitle = style({
  fontSize: vars.fontSize[13],
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textSecondary,
})

export const commentsOptionsButton = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: vars.space[1],
  border: "none",
  background: "none",
  color: vars.color.textTertiary,
  cursor: "pointer",
  transition: `color ${vars.transition.fast}`,
  ":hover": {
    color: vars.color.textPrimary,
  },
})

export const commentsSortToggleGroup = style({
  display: "flex",
  gap: vars.space[1],
  background: vars.color.bgSecondary,
  padding: "2px",
  borderRadius: vars.borderRadius.md,
})

export const commentsSortButton = style({
  border: "none",
  background: "transparent",
  fontSize: vars.fontSize[11],
  padding: `2px ${vars.space[2]}`,
  borderRadius: vars.borderRadius.md,
  color: vars.color.textTertiary,
  cursor: "pointer",
  selectors: {
    '&[data-active="true"]': {
      background: vars.color.bgPrimary,
      color: vars.color.textPrimary,
    },
  },
})

export const commentsList = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[2],
})

export const commentsEmpty = style({
  color: vars.color.textTertiary,
  fontSize: vars.fontSize[12],
  padding: `${vars.space[3]} 0`,
})

export const commentListItem = style({
  border: `1px solid ${vars.color.borderLight}`,
  borderRadius: vars.borderRadius.md,
  padding: vars.space[3],
  display: "flex",
  flexDirection: "column",
  gap: vars.space[2],
  cursor: "pointer",
  background: vars.color.bgPrimary,
  transition: `background ${vars.transition.fast}, border-color ${vars.transition.fast}`,
  selectors: {
    '&[data-active="true"]': {
      borderColor: vars.color.resolvedGreen,
      background: vars.color.bgSecondary,
    },
    '&[data-selected="true"]': {
      borderColor: vars.color.resolvedGreen,
      background: vars.color.bgSecondary,
    },
    '&:hover': {
      background: vars.color.bgSecondary,
    },
  },
})

export const commentHeaderRow = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  width: "100%",
})

export const commentHeaderMeta = style({
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
})

export const commentHeaderSpacer = style({
  flex: 1,
})

export const commentAuthorName = style({
  fontSize: vars.fontSize[13],
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textPrimary,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
})

export const commentTimestamp = style({
  fontSize: vars.fontSize[11],
  color: vars.color.textTertiary,
})

export const commentAnchorPreview = style({
  fontSize: vars.fontSize[12],
  color: vars.color.textSecondary,
  fontStyle: "italic",
  borderLeft: `2px solid ${vars.color.borderLight}`,
  paddingLeft: vars.space[2],
})

export const commentBodyPreview = style({
  fontSize: vars.fontSize[13],
  color: vars.color.textPrimary,
  overflow: "hidden",
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
})

export const commentReplyCount = style({
  fontSize: vars.fontSize[11],
  color: vars.color.textTertiary,
})

export const commentDetailContainer = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[3],
})

export const commentDetailThread = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[2],
})

export const commentBodyRenderer = style({
  fontSize: vars.fontSize[14],
  color: vars.color.textPrimary,
})

export const replySection = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[2],
  borderTop: `1px solid ${vars.color.borderLight}`,
  paddingTop: vars.space[2],
})

export const replyList = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[2],
})

export const replyItem = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[1],
  paddingLeft: vars.space[2],
  borderLeft: "none",
  cursor: "pointer",
  transition: `border-color ${vars.transition.fast}`,
  selectors: {
    '&[data-selected="true"]': {
      borderColor: vars.color.resolvedGreen,
    },
    "&:hover": {
      borderColor: vars.color.borderColor,
    },
  },
})

export const replyHeaderRow = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
})

export const replyHeaderMeta = style({
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
})

export const replyAuthorName = style({
  fontSize: vars.fontSize[12],
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textSecondary,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
})

export const replyTimestamp = style({
  fontSize: vars.fontSize[10],
  color: vars.color.textTertiary,
})

export const replyBodyRenderer = style({
  fontSize: vars.fontSize[13],
  color: vars.color.textSecondary,
})

export const composerWrapper = style({
  border: `1px solid ${vars.color.borderLight}`,
  borderRadius: vars.borderRadius.md,
  padding: vars.space[2],
  background: vars.color.bgPrimary,
})

export const resolvedBadge = style({
  fontSize: vars.fontSize[10],
  color: vars.color.resolvedGreen,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginLeft: "auto",
})
