import { style, globalStyle } from "@vanilla-extract/css"
import { vars } from "./theme.css"

export const contextMenuTrigger = style({
  padding: "4px",
  borderRadius: vars.borderRadius.sm,
  backgroundColor: "transparent",
  border: "none",
  cursor: "pointer",
  color: vars.colors.text.weak,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "all 0.15s ease",
  opacity: 0,
  ":hover": {
    backgroundColor: vars.colors.background.subtle,
    color: vars.colors.text.norm,
  },
})

export const contextMenu = style({
  position: "absolute",
  top: "100%",
  right: 0,
  zIndex: vars.zIndices.max,
  backgroundColor: vars.colors.background.norm,
  border: `1px solid ${vars.colors.border.subtle}`,
  borderRadius: vars.borderRadius.lg,
  boxShadow: vars.shadows.norm,
  minWidth: "180px",
  overflow: "hidden",
  marginTop: "4px",
  padding: "8px",
})

// Floating variant used for right-click context menus that are positioned
// explicitly via left/top. This avoids inheriting the dropdown's right:0 rule
// and lets the caller fully control placement while keeping consistent chrome.
export const contextMenuFloating = style({
  width: "256px",
  padding: "8px 0",
  borderRadius: vars.borderRadius.lg,
  backgroundColor: vars.colors.background.norm,
  border: `1px solid ${vars.colors.border.norm}`,
  boxShadow: vars.shadows.lifted,

  zIndex: vars.zIndices.max,
  overflow: "hidden",
  position: "fixed",
})

export const contextMenuItem = style({
  display: "flex",
  padding: "8px 16px",
  alignItems: "center",
  gap: "8px",
  alignSelf: "stretch",

  backgroundColor: "transparent",
  border: "none",
  color: vars.colors.text.norm,
  cursor: "pointer",
  fontSize: vars.fontSizes.md,
  fontWeight: vars.fontWeights.regular,

  width: "100%",
  ":hover": {
    backgroundColor: vars.colors.interaction.default.hover,
  },
})

export const contextMenuItemIcon = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "16px",
  height: "16px",
})

globalStyle(`${contextMenuItemIcon} svg`, {
  width: "16px",
  height: "16px",
})

export const contextMenuItemRightIcon = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "16px",
  height: "16px",
  marginLeft: "auto",
})

globalStyle(`${contextMenuItemRightIcon} svg`, {
  width: "16px",
  height: "16px",
})

export const contextMenuItemDestructive = style([
  contextMenuItem,
  {
    color: vars.colors.signal.danger.norm,
    ":hover": {
      backgroundColor: vars.colors.background.weak,
      color: vars.colors.signal.danger.norm,
    },
  },
])

export const contextMenuContainer = style({
  position: "relative",
  display: "inline-block",
})

export const contextMenuVisible = style([
  contextMenuTrigger,
  {
    opacity: 1,
  },
])

export const contextMenuSectionHeader = style({
  padding: "6px 10px",
  margin: "10px 0 0px 0",
  color: vars.colors.text.weak,
  fontFamily: vars.fonts.system,
  fontSize: vars.fontSizes.xs,
  letterSpacing: "0.02em",
  textTransform: "uppercase",
  userSelect: "none",
})

export const contextMenuSeparator = style({
  height: 1,
  backgroundColor: vars.colors.border.subtle,
  margin: "6px 8px",
})
