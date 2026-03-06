import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

/**
 * MiniContextMenu styles
 *
 * A horizontal action bar that appears floating above message bubbles,
 * providing quick access to common actions without requiring a right-click.
 * Slack-style clean design with subtle shadow.
 */

// Container - clean floating toolbar
export const miniMenuContainer = style({
  display: "flex",
  alignItems: "center",
  gap: "2px",
  padding: "2px",
  backgroundColor: vars.colors.background.norm,
  borderRadius: vars.borderRadius.md,
  border: `1px solid ${vars.colors.border.subtle}`,
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
  opacity: 0,
  pointerEvents: "none",
  transition: "opacity 100ms ease-out",
})

// Action button - minimal icon style
export const miniMenuButton = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  borderRadius: vars.borderRadius.sm,
  border: "none",
  background: "transparent",
  color: vars.colors.text.weak,
  cursor: "pointer",
  transition: "background-color 100ms ease, color 100ms ease",
  selectors: {
    "&:hover": {
      backgroundColor: vars.colors.background.subtle,
      color: vars.colors.text.norm,
    },
    "&:focus-visible": {
      outline: "none",
      boxShadow: vars.shadows.focusRing,
    },
    "&:active": {
      backgroundColor: vars.colors.background.weak,
    },
  },
})
