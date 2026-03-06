import { style, keyframes } from "@vanilla-extract/css"
import { vars } from "./theme.css"

// Animation for backdrop fade-in
const backdropFadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
})

// Animation for palette slide-up
const paletteSlideUp = keyframes({
  from: { opacity: 0, transform: "translateY(-8px) scale(0.98)" },
  to: { opacity: 1, transform: "translateY(0) scale(1)" },
})

// Semi-transparent backdrop covering the entire viewport
export const backdrop = style({
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.4)",
  zIndex: 1000,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  paddingTop: "15vh",
  animation: `${backdropFadeIn} 100ms ease`,
})

// Main palette container - centered modal
export const palette = style({
  width: "520px",
  maxHeight: "400px",
  background: vars.color.bgPrimary,
  borderRadius: vars.borderRadius.xl,
  boxShadow: `0 0 0 1px ${vars.color.borderColor}, 0 16px 48px rgba(0, 0, 0, 0.15)`,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  animation: `${paletteSlideUp} 150ms ease`,
})

// Search input container
export const inputContainer = style({
  padding: vars.space[4],
  borderBottom: `1px solid ${vars.color.borderLight}`,
})

// Search input field
export const input = style({
  width: "100%",
  padding: vars.space[2],
  fontSize: vars.fontSize[15],
  fontWeight: vars.fontWeight.normal,
  color: vars.color.textPrimary,
  background: "transparent",
  border: "none",
  outline: "none",
  "::placeholder": {
    color: vars.color.textTertiary,
  },
})

// Scrollable results list
export const resultsList = style({
  flex: 1,
  overflowY: "auto",
  padding: vars.space[2],
})

// Category label (Actions, Notes, etc.)
export const categoryLabel = style({
  fontSize: vars.fontSize[11],
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textTertiary,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  padding: `${vars.space[2]} ${vars.space[2]}`,
  marginTop: vars.space[2],
  selectors: {
    "&:first-child": {
      marginTop: 0,
    },
  },
})

// Individual result item
export const resultItem = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[3],
  padding: `${vars.space[2]} ${vars.space[3]}`,
  borderRadius: vars.borderRadius.md,
  cursor: "pointer",
  transition: vars.transition.fast,
  selectors: {
    '&[data-selected="true"]': {
      background: vars.color.bgHover,
    },
    "&:hover": {
      background: vars.color.bgHover,
    },
  },
})

// Result item icon container
export const resultIcon = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "24px",
  height: "24px",
  color: vars.color.textSecondary,
  flexShrink: 0,
})

// Result item text container
export const resultText = style({
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: "2px",
})

// Result item title
export const resultTitle = style({
  fontSize: vars.fontSize[14],
  fontWeight: vars.fontWeight.normal,
  color: vars.color.textPrimary,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
})

// Result item subtitle (for entities)
export const resultSubtitle = style({
  fontSize: vars.fontSize[12],
  fontWeight: vars.fontWeight.normal,
  color: vars.color.textTertiary,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
})

// Empty state when no results
export const emptyState = style({
  padding: vars.space[6],
  textAlign: "center",
  color: vars.color.textTertiary,
  fontSize: vars.fontSize[13],
})

// Footer with keyboard hints
export const footer = style({
  padding: `${vars.space[2]} ${vars.space[4]}`,
  borderTop: `1px solid ${vars.color.borderLight}`,
  display: "flex",
  gap: vars.space[4],
  fontSize: vars.fontSize[11],
  color: vars.color.textTertiary,
})

// Keyboard shortcut hint in footer
export const shortcutHint = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[1],
})

// Keyboard key visual
export const key = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "18px",
  height: "18px",
  padding: `0 ${vars.space[1]}`,
  fontSize: vars.fontSize[10],
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textSecondary,
  background: vars.color.bgTertiary,
  borderRadius: vars.borderRadius.sm,
  border: `1px solid ${vars.color.borderColor}`,
})
