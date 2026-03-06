/**
 * Styles for the EntityLinkNodeView and EntityLinkChip components.
 *
 * Provides styling for entity link chips in:
 * - TipTap editor (EntityLinkNodeView)
 * - Rendered content (EntityLinkChip via TipTapRenderer)
 *
 * Entity link chips display an icon and title, and navigate to the
 * linked entity when clicked.
 */

import { style, keyframes } from "@vanilla-extract/css"
import { vars } from "./theme.css"

// Spin animation for loading icon
const spin = keyframes({
  "0%": { transform: "rotate(0deg)" },
  "100%": { transform: "rotate(360deg)" },
})

// Base wrapper for entity link node in editor
export const entityLinkWrapper = style({
  display: "inline-flex",
  alignItems: "center",
  verticalAlign: "middle",
  margin: "0 2px",
})

// The clickable chip element
export const entityLinkChip = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space[1],
  padding: `2px ${vars.space[2]}`,
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.md,
  fontSize: vars.fontSize[13],
  color: vars.color.textPrimary,
  cursor: "pointer",
  textDecoration: "none",
  transition: `all ${vars.transition.fast}`,
  maxWidth: "200px",
  ":hover": {
    background: vars.color.bgTertiary,
    borderColor: vars.color.unreadBlue,
  },
  ":focus": {
    outline: `2px solid ${vars.color.unreadBlue}`,
    outlineOffset: "1px",
  },
})

// Selected state when node is selected in editor
export const entityLinkSelected = style({
  outline: `2px solid ${vars.color.unreadBlue}`,
  outlineOffset: "1px",
})

// Icon container
export const entityLinkIcon = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: vars.color.textSecondary,
  flexShrink: 0,
})

// Loading spinner animation for icon
export const entityLinkIconLoading = style({
  animation: `${spin} 1s linear infinite`,
})

// Title text with ellipsis for long titles
export const entityLinkTitle = style({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontWeight: vars.fontWeight.medium,
})

// Read-only chip (used in TipTapRenderer)
// Slightly different styling for rendered/read-only context
export const entityLinkChipReadonly = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space[1],
  padding: `2px ${vars.space[2]}`,
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.md,
  fontSize: vars.fontSize[13],
  color: vars.color.textPrimary,
  cursor: "pointer",
  textDecoration: "none",
  transition: `all ${vars.transition.fast}`,
  maxWidth: "200px",
  ":hover": {
    background: vars.color.bgTertiary,
    borderColor: vars.color.unreadBlue,
  },
})
