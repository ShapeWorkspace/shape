import { style, keyframes } from "@vanilla-extract/css"
import { vars } from "./theme.css"

// Accordion unfold animation for list items (entrance)
const accordionUnfold = keyframes({
  "0%": {
    maxHeight: "0px",
    opacity: 0,
    transform: "scaleY(0)",
    transformOrigin: "top",
  },
  "100%": {
    maxHeight: "48px",
    opacity: 1,
    transform: "scaleY(1)",
    transformOrigin: "top",
  },
})

// Accordion fold animation for list items (exit)
const accordionFold = keyframes({
  "0%": {
    maxHeight: "48px",
    opacity: 1,
    transform: "scaleY(1)",
    transformOrigin: "top",
  },
  "100%": {
    maxHeight: "0px",
    opacity: 0,
    transform: "scaleY(0)",
    transformOrigin: "top",
  },
})

export const list = style({
  display: "flex",
  flexDirection: "column",
  outline: "none",
  // Enable scrolling within the list container so sticky elements work
  overflow: "auto",
})

// Sticky header container that stays fixed at the top while list scrolls
export const listStickyHeader = style({
  position: "sticky",
  top: 0,
  zIndex: 10,
  background: vars.color.bgPrimary,
})

export const listHeader = style({
  padding: `${vars.space[3]} ${vars.space[3]} ${vars.space[2]}`,
})

export const listTitle = style({
  fontSize: vars.fontSize[11],
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textTertiary,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
})

export const listSearch = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  padding: `${vars.space[2]} ${vars.space[3]}`,
  marginBottom: vars.space[1],
})

export const listSearchIcon = style({
  color: vars.color.textTertiary,
  flexShrink: 0,
  transition: `color ${vars.transition.fast}`,
})

// Active state for search icon when there's input (white in dark mode)
export const listSearchIconActive = style({
  color: vars.color.textPrimary,
  flexShrink: 0,
  transition: `color ${vars.transition.fast}`,
})

export const listSearchInput = style({
  flex: 1,
  border: "none",
  background: "none",
  fontSize: vars.fontSize[14],
  color: vars.color.textPrimary,
  outline: "none",
  "::placeholder": {
    color: vars.color.textTertiary,
  },
})

export const listItem = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  padding: `${vars.space[2]} ${vars.space[3]}`,
  cursor: "pointer",
  transition: `background ${vars.transition.fast}`,
  borderRadius: vars.borderRadius.base,
  margin: "1px 0",
  ":hover": {
    background: vars.color.bgSecondary,
  },
  selectors: {
    '&[data-selected="true"]': {
      background: vars.color.bgTertiary,
    },
  },
})

// Animated list item that unfolds like an accordion (entrance)
export const listItemAnimatedEnter = style({
  animation: `${accordionUnfold} 150ms ease-out forwards`,
  overflow: "hidden",
})

// Animated list item that folds like an accordion (exit)
export const listItemAnimatedExit = style({
  animation: `${accordionFold} 150ms ease-in forwards`,
  overflow: "hidden",
  pointerEvents: "none",
})

export const listItemIcon = style({
  display: "flex",
  alignItems: "center",
  color: vars.color.textTertiary,
  flexShrink: 0,
})

export const listItemTitle = style({
  flex: 1,
  fontSize: vars.fontSize[14],
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
})

export const listItemMeta = style({
  fontSize: vars.fontSize[12],
  color: vars.color.textTertiary,
})

export const listItemPin = style({
  opacity: 0,
  padding: vars.space[1],
  borderRadius: vars.borderRadius.sm,
  background: "none",
  border: "none",
  cursor: "pointer",
  color: vars.color.textTertiary,
  transition: `all ${vars.transition.fast}`,
  display: "flex",
  alignItems: "center",
  ":hover": {
    background: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
  selectors: {
    [`${listItem}:hover &`]: {
      opacity: 1,
    },
    '&[data-pinned="true"]': {
      opacity: 1,
      color: vars.color.textPrimary,
    },
  },
})

export const listItemInput = style({
  flex: 1,
  border: "none",
  background: "none",
  fontSize: vars.fontSize[14],
  color: vars.color.textPrimary,
  outline: "none",
  padding: 0,
  "::placeholder": {
    color: vars.color.textTertiary,
  },
})

// Container for action buttons in a row
export const listRowActions = style({
  display: "flex",
  gap: vars.space[2],
})

// Base action button style
const actionButtonBase = {
  display: "flex",
  alignItems: "center",
  gap: vars.space[1],
  padding: `${vars.space[1]} ${vars.space[2]}`,
  borderRadius: vars.borderRadius.sm,
  fontSize: vars.fontSize[12],
  cursor: "pointer",
  transition: `all ${vars.transition.fast}`,
  selectors: {
    "&:disabled": {
      opacity: 0.5,
      cursor: "not-allowed",
    },
  },
} as const

// Primary action button (e.g., Accept)
export const listRowActionPrimary = style({
  ...actionButtonBase,
  border: "none",
  background: vars.color.resolvedGreen,
  color: "white",
  ":hover": {
    filter: "brightness(1.1)",
  },
})

// Secondary action button (e.g., Decline, Cancel)
export const listRowActionSecondary = style({
  ...actionButtonBase,
  border: `1px solid ${vars.color.borderColor}`,
  background: "transparent",
  color: vars.color.textSecondary,
  ":hover": {
    background: vars.color.bgSecondary,
  },
})

// Toolbar container for list actions (e.g., Create button)
export const listToolbar = style({
  display: "flex",
  gap: vars.space[2],
  padding: `${vars.space[2]} ${vars.space[3]}`,
  borderBottom: `1px solid ${vars.color.borderLight}`,
  marginBottom: vars.space[1],
})

// Toolbar button style
export const listToolbarButton = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[1],
  padding: `${vars.space[1]} ${vars.space[2]}`,
  borderRadius: vars.borderRadius.md,
  background: "transparent",
  border: `1px solid ${vars.color.borderColor}`,
  cursor: "pointer",
  fontSize: vars.fontSize[12],
  color: vars.color.textSecondary,
  transition: `all ${vars.transition.fast}`,
  ":hover": {
    background: vars.color.bgSecondary,
    color: vars.color.textPrimary,
  },
})

// Section header for grouping list items
export const listSectionHeader = style({
  padding: `${vars.space[2]} ${vars.space[3]}`,
  fontSize: vars.fontSize[11],
  color: vars.color.textTertiary,
  fontWeight: vars.fontWeight.medium,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  selectors: {
    '&[data-separator="true"]': {
      borderBottom: `1px solid ${vars.color.borderLight}`,
      marginBottom: vars.space[1],
      padding: `4px ${vars.space[3]}`,
    },
  },
})

// Invite input section container
export const listInviteSection = style({
  padding: `${vars.space[3]} ${vars.space[3]}`,
  borderBottom: `1px solid ${vars.color.borderColor}`,
})

// Invite input row
export const listInviteRow = style({
  display: "flex",
  gap: vars.space[2],
  alignItems: "center",
})

// Invite email input
export const listInviteInput = style({
  flex: 1,
  padding: `${vars.space[2]} ${vars.space[3]}`,
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.base,
  background: vars.color.bgSecondary,
  color: vars.color.textPrimary,
  fontSize: vars.fontSize[14],
  outline: "none",
  ":focus": {
    borderColor: vars.color.unreadBlue,
  },
  "::placeholder": {
    color: vars.color.textTertiary,
  },
})

// Invite submit button
export const listInviteButton = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[1],
  padding: `${vars.space[2]} ${vars.space[4]}`,
  border: "none",
  borderRadius: vars.borderRadius.base,
  background: vars.color.unreadBlue,
  color: "white",
  fontSize: vars.fontSize[14],
  cursor: "pointer",
  transition: `all ${vars.transition.fast}`,
  ":hover": {
    filter: "brightness(1.1)",
  },
  selectors: {
    "&:disabled": {
      opacity: 0.5,
      cursor: "not-allowed",
    },
  },
})

// Error message
export const listInviteError = style({
  color: vars.color.deleteRed,
  fontSize: vars.fontSize[12],
  marginTop: vars.space[2],
})

// Role badge
export const listRoleBadge = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[1],
  color: vars.color.textSecondary,
  fontSize: vars.fontSize[12],
})

// Invite link section container (for user without account flow)
export const listInviteLinkSection = style({
  marginTop: vars.space[3],
  paddingTop: vars.space[3],
  borderTop: `1px solid ${vars.color.borderColor}`,
})

// Create invite link button
export const listInviteLinkButton = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  padding: `${vars.space[2]} ${vars.space[4]}`,
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.base,
  background: "transparent",
  color: vars.color.textSecondary,
  fontSize: vars.fontSize[14],
  cursor: "pointer",
  transition: `all ${vars.transition.fast}`,
  ":hover": {
    background: vars.color.bgSecondary,
  },
  selectors: {
    "&:disabled": {
      opacity: 0.5,
      cursor: "not-allowed",
    },
  },
})

// Invite link container (input + copy button)
export const listInviteLinkContainer = style({
  display: "flex",
  gap: vars.space[2],
  alignItems: "center",
})

// Invite link input (read-only)
export const listInviteLinkInput = style({
  flex: 1,
  padding: `${vars.space[2]} ${vars.space[3]}`,
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.base,
  background: vars.color.bgTertiary,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize[13],
  fontFamily: "monospace",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
})

// Copy invite link button
export const listInviteLinkCopyButton = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[1],
  padding: `${vars.space[2]} ${vars.space[3]}`,
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.base,
  background: "transparent",
  color: vars.color.textSecondary,
  fontSize: vars.fontSize[13],
  cursor: "pointer",
  transition: `all ${vars.transition.fast}`,
  flexShrink: 0,
  ":hover": {
    background: vars.color.bgSecondary,
  },
})

// ============================================================
// Detail View Input - Standardized input for detail views
// ============================================================

export const detailViewInputContainer = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[2],
})

export const detailViewInputLabel = style({
  fontSize: vars.fontSize[12],
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textSecondary,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
})

export const detailViewInput = style({
  width: "100%",
  padding: vars.space[3],
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.base,
  fontSize: vars.fontSize[16],
  fontWeight: vars.fontWeight.medium,
  fontFamily: "inherit",
  outline: "none",
  background: vars.color.bgPrimary,
  color: vars.color.textPrimary,
  transition: `border-color ${vars.transition.fast}`,
  ":focus": {
    borderColor: vars.color.textTertiary,
  },
  "::placeholder": {
    color: vars.color.textTertiary,
    fontWeight: vars.fontWeight.normal,
  },
  ":disabled": {
    opacity: 0.5,
    cursor: "not-allowed",
  },
})

export const detailViewTextarea = style({
  width: "100%",
  minHeight: "200px",
  padding: vars.space[3],
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.base,
  fontSize: vars.fontSize[14],
  lineHeight: 1.6,
  fontFamily: "inherit",
  outline: "none",
  background: vars.color.bgPrimary,
  color: vars.color.textPrimary,
  resize: "none",
  transition: `border-color ${vars.transition.fast}`,
  ":focus": {
    borderColor: vars.color.textTertiary,
  },
  "::placeholder": {
    color: vars.color.textTertiary,
  },
  ":disabled": {
    opacity: 0.5,
    cursor: "not-allowed",
  },
})
