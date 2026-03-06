import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

/**
 * Breadcrumb bar wrapper - contains the breadcrumb navigation on the left
 * and the sidecar toggle button on the right.
 */
export const breadcrumbBar = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: `0 0 0 ${vars.space[4]}`,
  marginBottom: vars.space[2],
  flexShrink: 0,
  height: "41px",
})

export const breadcrumbBarFull = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: `0 0 0 ${vars.space[4]}`,
  flexShrink: 0,
  height: "41px",
  borderBottom: `1px solid ${vars.color.borderColor}`,
})

export const breadcrumb = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[1],
  fontSize: vars.fontSize[13],
})

export const breadcrumbIconWrapper = style({
  position: "relative",
  display: "flex",
  alignItems: "center",
})

export const breadcrumbUnreadDot = style({
  position: "absolute",
  top: "-2px",
  right: "-4px",
  width: "8px",
  height: "8px",
  background: vars.color.unreadBlue,
  borderRadius: "50%",
})

/**
 * Sidecar toggle button - icon button at the right side of the breadcrumb bar.
 * Toggles sidecar visibility when clicked.
 */
export const sidecarToggle = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: vars.space[1],
  marginRight: vars.space[3],
  color: vars.color.textTertiary,
  cursor: "pointer",
  background: "none",
  border: "none",
  transition: `color ${vars.transition.fast}`,
  ":hover": {
    color: vars.color.textPrimary,
  },
  selectors: {
    // When sidecar has content and is visible, show as active
    '&[data-active="true"]': {
      color: vars.color.textSecondary,
    },
  },
})

export const sidecarToggleIcon = style({
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
})

export const sidecarToggleWarning = style({
  position: "absolute",
  top: -4,
  right: -4,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "14px",
  height: "14px",
  borderRadius: "7px",
  background: vars.color.bgPrimary,
  color: vars.color.deleteRed,
  boxShadow: `0 0 0 1px ${vars.color.borderColor}`,
})

export const breadcrumbItem = style({
  display: "block",
  color: vars.color.textTertiary,
  cursor: "pointer",
  transition: `color ${vars.transition.fast}`,
  // Truncate long labels with ellipsis
  maxWidth: "200px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  ":hover": {
    color: vars.color.textPrimary,
  },
  selectors: {
    '&[data-active="true"]': {
      color: vars.color.textSecondary,
    },
    // When the breadcrumb area is focused, the active (leaf) item should be bright white
    '&[data-active="true"][data-focused="true"]': {
      color: vars.color.textPrimary,
    },
  },
})

// The home icon uses an absolute-positioned unread dot, so keep it from being clipped.
export const breadcrumbHomeItem = style({
  overflow: "visible",
  maxWidth: "none",
})

export const breadcrumbSeparator = style({
  color: vars.color.borderColor,
})

export const breadcrumbSegment = style({
  display: "flex",
  alignItems: "center",
  gap: "6px",
  minWidth: 0,
})
