import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

// Error message displayed when authentication fails
export const authErrorMessage = style({
  padding: vars.space[3],
  margin: vars.space[2],
  background: "#fee",
  color: "#c00",
  borderRadius: vars.borderRadius.md,
  fontSize: vars.fontSize[13],
})

// Secondary text styling for the mode switch link
export const authSecondaryText = style({
  color: vars.color.textSecondary,
  fontSize: vars.fontSize[13],
})
