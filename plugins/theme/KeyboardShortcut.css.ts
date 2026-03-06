import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

export const keyboardShortcut = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.spacing.xxs,
  color: vars.colors.text.weak,
})

export const key = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 0,
  padding: "1px 4px",
  borderRadius: 0,
  border: "none",
  fontSize: vars.fontSizes.xxs,
  fontFamily: vars.fonts.system,
  fontWeight: vars.fontWeights.regular,
  lineHeight: 1,
  color: vars.colors.text.weak,
})

export const separator = style({
  fontSize: vars.fontSizes.xxxs,
  color: vars.colors.text.weak,
  lineHeight: 1,
})
