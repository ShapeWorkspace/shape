import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

/**
 * Label component styles for displaying informational panels
 * with success, warning, or danger signals
 */

export const container = style({
  display: "flex",
  alignItems: "center",
  width: "100%",
})

export const badge = style({
  width: "100%",
  padding: `${vars.spacing.sm} ${vars.spacing.md}`,
  fontSize: vars.fontSizes.xs,
  display: "flex",
  alignItems: "center",
  gap: vars.spacing.sm,
  borderRadius: vars.borderRadius.lg,
})

/**
 * Signal-specific badge styles
 */
export const signalSuccess = style({
  backgroundColor: vars.colors.background.aiChip,
  color: vars.colors.signal.success.norm,
})

export const signalWarning = style({
  backgroundColor: vars.colors.background.subtle,
  color: vars.colors.text.norm,
})

export const signalDanger = style({
  backgroundColor: vars.colors.background.subtle,
  color: vars.colors.signal.danger.norm,
})

export const icon = style({
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginTop: "2px",
})

export const iconSuccess = style({
  color: vars.colors.signal.success.norm,
})

export const iconWarning = style({
  color: vars.colors.signal.warning.norm,
})

export const iconDanger = style({
  color: vars.colors.signal.danger.norm,
})

export const textGroup = style({
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  flex: 1,
  minWidth: 0,
  justifyContent: "center",
})

export const primaryText = style({
  fontSize: vars.fontSizes.sm,
})

export const supportingText = style({
  fontSize: vars.fontSizes.sm,
  fontWeight: vars.fontWeights.regular,
  color: vars.colors.signal.success.norm,
})
