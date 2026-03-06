import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

// Base notification item - uses flex-start for multi-line content alignment
export const notificationItem = style({
  display: "flex",
  alignItems: "flex-start",
  gap: vars.space[2],
  padding: vars.space[3],
  cursor: "pointer",
  transition: `background ${vars.transition.fast}`,
  borderRadius: vars.borderRadius.base,
  margin: "1px 0",
  position: "relative",
  ":hover": {
    background: vars.color.bgSecondary,
  },
  selectors: {
    '&[data-selected="true"]': {
      background: vars.color.bgTertiary,
    },
    '&[data-unread="true"]': {
      background: vars.color.bgSecondary,
    },
  },
})

export const notificationIcon = style({
  color: vars.color.textTertiary,
  flexShrink: 0,
  marginTop: "2px",
  display: "flex",
  alignItems: "center",
})

// Container for title and description, allows text truncation
export const notificationContent = style({
  flex: 1,
  minWidth: 0,
})

export const notificationTitle = style({
  fontSize: vars.fontSize[14],
  fontWeight: vars.fontWeight.medium,
  marginBottom: "2px",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
})

export const notificationDescription = style({
  fontSize: vars.fontSize[13],
  color: vars.color.textSecondary,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
})

export const notificationTime = style({
  fontSize: vars.fontSize[12],
  color: vars.color.textTertiary,
  flexShrink: 0,
})

// Blue dot indicator for unread notifications
export const notificationUnreadDot = style({
  width: "8px",
  height: "8px",
  background: vars.color.unreadBlue,
  borderRadius: "50%",
  flexShrink: 0,
  marginTop: vars.space[1],
})
