import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

export const popoverContainer = style({
  position: "relative",
  display: "inline-block",
})

export const popoverPanel = style({
  padding: `${vars.spacing.sm} 0`,
  borderRadius: vars.borderRadius.lg,
  backgroundColor: vars.colors.background.norm,
  border: `1px solid ${vars.colors.border.norm}`,
  boxShadow: vars.shadows.lifted,
  zIndex: vars.zIndices.max,
  overflow: "hidden",
  position: "fixed",
})
