import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

export const container = style({
  alignItems: "stretch",
  backgroundColor: vars.colors.border.subtle,
  borderRadius: vars.borderRadius.lg,
  display: "flex",
  gap: vars.spacing.xs,
  padding: `${vars.spacing.xs} ${vars.spacing.xs}`,
  width: "fit-content",
})

export const segment = style({
  alignItems: "center",
  backgroundColor: "transparent",
  border: "none",
  borderRadius: vars.borderRadius.lg,
  color: vars.colors.text.weak,
  cursor: "pointer",
  display: "flex",
  fontSize: vars.fontSizes.sm,
  fontWeight: vars.fontWeights.medium,
  gap: vars.spacing.xs,
  justifyContent: "center",
  padding: `${vars.spacing.xs} ${vars.spacing.xxxl}`,
  transition: "color 150ms ease, background-color 150ms ease",
  selectors: {
    "&:hover:not(:disabled)": {
      color: vars.colors.text.norm,
    },
    "&:disabled": {
      cursor: "not-allowed",
      opacity: 0.6,
    },
  },
})

export const segmentActive = style({
  backgroundColor: vars.colors.background.norm,
  boxShadow: vars.shadows.norm,
  color: vars.colors.text.norm,
})

export const count = style({
  alignItems: "center",
  backgroundColor: vars.colors.text.norm,
  borderRadius: vars.borderRadius.full,
  color: vars.colors.background.norm,
  display: "inline-flex",
  fontSize: vars.fontSizes.xs,
  fontWeight: vars.fontWeights.semibold,
  height: "18px",
  justifyContent: "center",
  minWidth: "18px",
  padding: `0 ${vars.spacing.xs}`,
})

export const unreadDot = style({
  backgroundColor: vars.colors.text.weak,
  borderRadius: "50%",
  width: "6px",
  height: "6px",
})
