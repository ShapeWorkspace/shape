import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

// ---------------------------------------------------------------------------
// Workspace Selector (Dropdown)
// ---------------------------------------------------------------------------

// Container holding the switcher button and dropdown
export const workspaceSwitcherContainer = style({
  position: "relative",
  marginBottom: vars.space[2],
})

// Main button that shows current workspace
export const workspaceSwitcherButton = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  width: "100%",
  padding: `${vars.space[2]} ${vars.space[3]}`,
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.base,
  cursor: "pointer",
  fontSize: vars.fontSize[13],
  color: vars.color.textPrimary,
  textAlign: "left",
  fontFamily: "inherit",
  transition: `background ${vars.transition.fast}, border-color ${vars.transition.fast}`,
  ":hover": {
    background: vars.color.bgHover,
    borderColor: vars.color.textTertiary,
  },
})

// Icon next to workspace name
export const workspaceSwitcherIcon = style({
  color: vars.color.textTertiary,
  flexShrink: 0,
})

// Workspace name text
export const workspaceSwitcherName = style({
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
})

// Chevron indicator
export const workspaceSwitcherChevron = style({
  color: vars.color.textTertiary,
  flexShrink: 0,
  transition: `transform ${vars.transition.fast}`,
})

// Chevron when dropdown is open
export const workspaceSwitcherChevronOpen = style({
  transform: "rotate(180deg)",
})

// Dropdown menu container
export const workspaceSwitcherDropdown = style({
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  background: vars.color.bgPrimary,
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.base,
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
  zIndex: 100,
  overflow: "hidden",
})

// Scrollable list of workspaces
export const workspaceSwitcherList = style({
  maxHeight: "200px",
  overflowY: "auto",
  padding: vars.space[1],
})

export const workspaceSwitcherGroup = style({
  paddingBottom: vars.space[1],
})

export const workspaceSwitcherGroupLabel = style({
  padding: `0 ${vars.space[3]}`,
  marginTop: vars.space[1],
  marginBottom: vars.space[1],
  fontSize: vars.fontSize[11],
  color: vars.color.textTertiary,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
})

export const workspaceSwitcherGroupList = style({
  paddingLeft: vars.space[2],
})

// Individual workspace item button
export const workspaceSwitcherItem = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  width: "100%",
  padding: `${vars.space[2]} ${vars.space[3]}`,
  background: "none",
  border: "none",
  borderRadius: vars.borderRadius.md,
  cursor: "pointer",
  fontSize: vars.fontSize[13],
  color: vars.color.textPrimary,
  textAlign: "left",
  fontFamily: "inherit",
  transition: `background ${vars.transition.fast}`,
  ":hover": {
    background: vars.color.bgHover,
  },
})

// Selected workspace item styling
export const workspaceSwitcherItemSelected = style({
  background: vars.color.bgActive,
})

// Checkmark icon for selected workspace
export const workspaceSwitcherCheck = style({
  color: vars.color.unreadBlue,
  flexShrink: 0,
})

// Workspace item name text
export const workspaceSwitcherItemName = style({
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
})

// Empty state when no other workspaces exist
export const workspaceSwitcherEmpty = style({
  padding: vars.space[3],
  textAlign: "center",
  color: vars.color.textSecondary,
  fontSize: vars.fontSize[13],
})

// Divider between workspace list and create button
export const workspaceSwitcherDivider = style({
  height: "1px",
  background: vars.color.borderColor,
  margin: `${vars.space[1]} 0`,
})

// Create new workspace button
export const workspaceSwitcherCreate = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  width: "100%",
  padding: `10px ${vars.space[3]}`,
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: vars.fontSize[13],
  color: vars.color.unreadBlue,
  textAlign: "left",
  fontFamily: "inherit",
  transition: `background ${vars.transition.fast}`,
  ":hover": {
    background: vars.color.bgHover,
  },
})

export const workspaceSwitcherCreateDisabled = style({
  color: vars.color.textTertiary,
  cursor: "not-allowed",
  ":hover": {
    background: "none",
  },
})

// Loading state
export const workspaceSwitcherLoading = style({
  padding: `${vars.space[2]} ${vars.space[3]}`,
  fontSize: vars.fontSize[13],
  color: vars.color.textSecondary,
})
