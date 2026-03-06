import { style, styleVariants } from "@vanilla-extract/css"
import { vars } from "./theme.css"

export const avatar = style({
  borderRadius: vars.borderRadius.full,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: vars.fontWeights.semibold,
  fontFamily: vars.fonts.system,
  flexShrink: 0,
  userSelect: "none",
  overflow: "hidden",
})

export const image = style({
  width: "100%",
  height: "100%",
  objectFit: "cover",
})

export const size = styleVariants({
  xs: { width: "20px", height: "20px", fontSize: vars.fontSizes.xxxs },
  sm: { width: "24px", height: "24px", fontSize: vars.fontSizes.xxxs },
  md: { width: "32px", height: "32px", fontSize: vars.fontSizes.sm },
  lg: { width: "40px", height: "40px", fontSize: vars.fontSizes.md },
  xl: { width: "48px", height: "48px", fontSize: vars.fontSizes.lg },
})
