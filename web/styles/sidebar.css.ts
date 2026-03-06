import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

export const sidebar = style({
  width: "240px",
  minWidth: "240px",
  padding: vars.space[3],
  display: "flex",
  flexDirection: "column",
  gap: "1px",
  background: "transparent",
  borderRight: `1px solid ${vars.color.borderColor}`,
  // Enable independent scrolling by constraining height to viewport
  height: "100vh",
  overflow: "hidden",
})

// Drawer mode variant for mobile - no fixed width, fills the drawer container
export const sidebarDrawerMode = style({
  width: "100%",
  minWidth: 0,
  padding: vars.space[3],
  display: "flex",
  flexDirection: "column",
  gap: "1px",
  background: "transparent",
  // No border in drawer mode - the drawer container provides the edge
  border: "none",
  height: "100%",
  overflow: "hidden",
})

// Scrollable container for the windows list
// Allows windows to scroll independently without affecting page scroll
export const sidebarWindowsList = style({
  flex: 1,
  overflowY: "auto",
  overflowX: "hidden",
  display: "flex",
  flexDirection: "column",
  gap: "1px",
  // Hide scrollbar but keep functionality (cleaner look)
  scrollbarWidth: "thin",
  scrollbarColor: `${vars.color.borderColor} transparent`,
})

// Header row container - allows title and close button to be side by side
export const sidebarHeaderRow = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
})

export const sidebarHeader = style({
  padding: `6px ${vars.space[2]}`,
  fontSize: vars.fontSize[11],
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textTertiary,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: vars.space[1],
  transition: `color ${vars.transition.fast}`,
  selectors: {
    '&[data-focused="true"]': {
      color: vars.color.textPrimary,
    },
  },
})

// Close button for drawer mode - positioned opposite the Shape title
export const sidebarCloseButton = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "44px",
  height: "44px",
  background: "none",
  border: "none",
  cursor: "pointer",
  color: vars.color.textTertiary,
  borderRadius: vars.borderRadius.md,
  touchAction: "manipulation",
  marginRight: `-${vars.space[2]}`,
  marginTop: `-${vars.space[1]}`,
  transition: `all ${vars.transition.fast}`,
  WebkitTapHighlightColor: "transparent",
  ":active": {
    background: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
})

export const sidebarItem = style({
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: `6px ${vars.space[2]}`,
  cursor: "pointer",
  transition: `background ${vars.transition.fast}`,
  fontSize: vars.fontSize[14],
  color: vars.color.textSecondary,
  border: "none",
  background: "none",
  width: "100%",
  textAlign: "left",
  borderRadius: vars.borderRadius.md,
  ":hover": {
    background: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
  selectors: {
    '&[data-active="true"]': {
      background: vars.color.bgActive,
      color: vars.color.textPrimary,
    },
    '&[data-keyboard-selected="true"]': {
      background: vars.color.bgHover,
      color: vars.color.textPrimary,
    },
  },
})

export const sidebarItemNewWindow = style([
  sidebarItem,
  {
    color: vars.color.textPrimary,
  },
])

export const sidebarItemIcon = style({
  color: vars.color.textTertiary,
  display: "flex",
  alignItems: "center",
  alignSelf: "flex-start",
  marginTop: "5px",
})

// Sublabel showing breadcrumb path in window items
export const sidebarItemSublabel = style({
  fontSize: vars.fontSize[11],
  color: vars.color.textTertiary,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  display: "flex",
  alignItems: "center",
  gap: "1px",
})

// Individual segment within the sublabel breadcrumb
export const sidebarItemSublabelSegment = style({
  display: "inline-flex",
  alignItems: "center",
  gap: "1px",
})

// Container for title + sublabel in window items
export const sidebarItemContent = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  overflow: "hidden",
  minWidth: 0,
})

export const sidebarItemClose = style({
  marginLeft: "auto",
  opacity: 0,
  padding: "2px",
  borderRadius: vars.borderRadius.sm,
  background: "none",
  border: "none",
  cursor: "pointer",
  color: vars.color.textTertiary,
  transition: `all ${vars.transition.fast}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  ":hover": {
    background: vars.color.bgTertiary,
    color: vars.color.textPrimary,
  },
  selectors: {
    [`${sidebarItem}:hover &`]: {
      opacity: 1,
    },
  },
})

// Pending invites section at bottom of sidebar
export const sidebarInvites = style({
  marginTop: "auto",
  paddingTop: vars.space[3],
  borderTop: `1px solid ${vars.color.borderColor}`,
})

export const sidebarInvitesHeader = style({
  padding: `6px ${vars.space[2]}`,
  fontSize: vars.fontSize[11],
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textTertiary,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
})

export const sidebarInviteItem = style({
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: `6px ${vars.space[2]}`,
  fontSize: vars.fontSize[13],
  color: vars.color.textSecondary,
  borderRadius: vars.borderRadius.md,
  ":hover": {
    background: vars.color.bgHover,
  },
})

export const sidebarInviteIcon = style({
  color: vars.color.textTertiary,
  flexShrink: 0,
})

export const sidebarInviteName = style({
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
})

export const sidebarInviteAccept = style({
  padding: "4px",
  borderRadius: vars.borderRadius.sm,
  background: vars.color.resolvedGreen,
  border: "none",
  cursor: "pointer",
  color: "white",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
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

// Bottom row of sidebar - layout toggle right-aligned
export const sidebarBottom = style({
  marginTop: "auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
})

// Layout mode toggle positioned at right
export const sidebarLayoutToggle = style({
  display: "flex",
  justifyContent: "flex-end",
})

export const sidebarLayoutToggleButton = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "none",
  border: "none",
  padding: vars.space[1],
  color: vars.color.textTertiary,
  cursor: "pointer",
  transition: `color ${vars.transition.fast}`,
  ":hover": {
    color: vars.color.textSecondary,
  },
  selectors: {
    '&[data-active="true"]': {
      color: vars.color.textPrimary,
    },
  },
})

export const sidebarFooter = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[1],
  padding: `0 ${vars.space[2]}`,
  fontSize: vars.fontSize[12],
  color: vars.color.textTertiary,
})
