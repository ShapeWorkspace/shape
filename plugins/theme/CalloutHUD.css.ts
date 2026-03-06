import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

export const container = style({
  display: "flex",
  alignItems: "center",
  gap: vars.spacing.md,
  padding: `${vars.spacing.md} ${vars.spacing.lg}`,
  backgroundColor: vars.colors.background.subtle,
  borderRadius: vars.borderRadius.md,
  position: "relative",
  border: "1px solid transparent",
})

export const containerContrast = style({
  backgroundColor: vars.colors.background.norm,
  borderColor: vars.colors.border.subtle,
})

export const clickableContainer = style({
  cursor: "pointer",
  transition: "background-color 0.15s ease",
  ":hover": {
    backgroundColor: vars.colors.border.subtle,
  },
  ":active": {
    transform: "scale(0.995)",
  },
})

export const iconContainer = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  color: vars.colors.text.weak,
})

export const content = style({
  flex: 1,
  fontSize: vars.fontSizes.sm,
  lineHeight: "1.5",
  color: vars.colors.text.norm,
})

export const closeButton = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  background: "transparent",
  border: "none",
  padding: vars.spacing.xs,
  borderRadius: vars.borderRadius.sm,
  color: vars.colors.text.weak,
  cursor: "pointer",
  transition: "background-color 0.15s ease, color 0.15s ease",
  ":hover": {
    backgroundColor: vars.colors.background.subtle,
    color: vars.colors.text.norm,
  },
  ":active": {
    transform: "scale(0.95)",
  },
})
