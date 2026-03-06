import { style, styleVariants, keyframes } from "@vanilla-extract/css"
import { vars } from "./theme.css"

// Slide up from below and fade in
const slideInUp = keyframes({
  "0%": {
    opacity: 0,
    transform: "translateY(100%)",
  },
  "100%": {
    opacity: 1,
    transform: "translateY(0)",
  },
})

// Fade out and slide down
const slideOutDown = keyframes({
  "0%": {
    opacity: 1,
    transform: "translateY(0)",
  },
  "100%": {
    opacity: 0,
    transform: "translateY(100%)",
  },
})

// Animation durations
const ENTER_DURATION = "150ms"
const EXIT_DURATION = "150ms"

export const statusBarContainer = style({
  position: "fixed",
  left: 0,
  right: 0,
  bottom: vars.space[4],
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: vars.space[2],
  pointerEvents: "none",
  zIndex: 200,
})

export const statusBarItem = style({
  width: "calc(100% - 32px)",
  maxWidth: "600px",
  background: vars.color.bgPrimary,
  borderRadius: vars.borderRadius.lg,
  padding: `${vars.space[2]} ${vars.space[3]}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: vars.space[3],
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
  pointerEvents: "auto",
})

// Animation state classes applied by the component
export const statusBarItemEntering = style({
  animation: `${slideInUp} ${ENTER_DURATION} ease-out forwards`,
})

export const statusBarItemExiting = style({
  animation: `${slideOutDown} ${EXIT_DURATION} ease-in forwards`,
})

// Variant styles - no border, just for semantic grouping
export const statusBarItemVariant = styleVariants({
  info: {},
  warning: {},
  error: {},
  success: {},
})

export const statusBarItemContent = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  fontSize: vars.fontSize[13],
  color: vars.color.textPrimary,
})

export const statusBarItemIcon = style({
  color: vars.color.textSecondary,
  display: "inline-flex",
})

export const statusBarItemMessage = style({
  color: vars.color.textPrimary,
})

export const statusBarDismissButton = style({
  background: "none",
  border: "none",
  padding: 0,
  color: vars.color.textSecondary,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  transition: `color ${vars.transition.fast}`,
  ":hover": {
    color: vars.color.textPrimary,
  },
})
