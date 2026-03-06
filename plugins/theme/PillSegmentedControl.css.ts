import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

export const container = style({
  alignItems: "center",
  display: "flex",
  gap: vars.spacing.md,
})

export const segment = style({
  alignItems: "center",
  backgroundColor: "transparent",
  border: `1px solid ${vars.colors.border.subtle}`,
  borderRadius: vars.borderRadius.full,
  color: vars.colors.text.norm,
  cursor: "pointer",
  display: "inline-flex",
  fontSize: vars.fontSizes.sm,
  fontWeight: vars.fontWeights.regular,
  gap: vars.spacing.md,
  justifyContent: "center",
  padding: `${vars.spacing.sm} ${vars.spacing.lg}`,
  transition: "transform 150ms ease, background-color 150ms ease",
  selectors: {
    "&:active:not(:disabled)": {
      transform: "scale(0.97)",
    },
    "&:hover:not(:disabled)": {
      backgroundColor: vars.colors.background.subtle,
    },
    "&:disabled": {
      cursor: "not-allowed",
      opacity: 0.5,
    },
  },
})

export const segmentActive = style({
  backgroundColor: vars.colors.text.norm,
  borderColor: vars.colors.text.norm,
  color: vars.colors.background.norm,
})

export const label = style({
  color: vars.colors.text.norm,
  fontWeight: vars.fontWeights.semibold,
})

export const labelActive = style({
  color: vars.colors.background.norm,
})

export const count = style({
  color: vars.colors.text.weak,
  fontSize: vars.fontSizes.sm,
  fontWeight: vars.fontWeights.regular,
})

export const countActive = style({
  color: vars.colors.border.subtle,
})

export const badge = style({
  backgroundColor: vars.colors.border.subtle,
  borderRadius: "50%",
  display: "inline-block",
  height: "6px",
  width: "6px",
})
