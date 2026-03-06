import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

export const contextMenuOverlay = style({
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  background: "rgba(0, 0, 0, 0.2)",
})

export const contextMenu = style({
  background: vars.color.bgPrimary,
  borderRadius: vars.borderRadius.lg,
  boxShadow: `0 4px 24px rgba(0, 0, 0, 0.15), 0 0 0 1px ${vars.color.borderColor}`,
  minWidth: "200px",
  maxWidth: "280px",
  padding: vars.space[1],
  outline: "none",
})

export const contextMenuBreadcrumb = style({
  fontSize: vars.fontSize[11],
  color: vars.color.textTertiary,
  padding: `6px ${vars.space[2]} 4px`,
  borderBottom: `1px solid ${vars.color.borderLight}`,
  marginBottom: vars.space[1],
})

export const contextMenuItem = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  padding: `${vars.space[2]} ${vars.space[2]}`,
  cursor: "pointer",
  transition: `background ${vars.transition.fast}`,
  borderRadius: vars.borderRadius.md,
  fontSize: vars.fontSize[14],
  ":hover": {
    background: vars.color.bgSecondary,
  },
  selectors: {
    '&[data-selected="true"]': {
      background: vars.color.bgTertiary,
    },
  },
})

export const contextMenuIcon = style({
  color: vars.color.textTertiary,
  display: "flex",
  alignItems: "center",
})

export const contextMenuLabel = style({
  flex: 1,
})

export const contextMenuArrow = style({
  color: vars.color.textTertiary,
})
