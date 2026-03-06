import { style, keyframes, styleVariants } from "@vanilla-extract/css"
import { vars } from "./theme.css"

const spin = keyframes({
  "0%": { transform: "rotate(0deg)" },
  "100%": { transform: "rotate(360deg)" },
})

export const spinner = style({
  borderRadius: "50%",
  border: `2px solid ${vars.colors.border.subtle}`,
  borderTopColor: vars.colors.text.norm,
  animation: `${spin} 1s linear infinite`,
})

export const spinnerSize = styleVariants({
  small: { width: "16px", height: "16px" },
  medium: { width: "24px", height: "24px" },
  large: { width: "32px", height: "32px" },
})

export const container = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: vars.spacing.sm,
})

export const label = style({
  fontSize: vars.fontSizes.sm,
  color: vars.colors.text.weak,
  fontFamily: vars.fonts.system,
})
