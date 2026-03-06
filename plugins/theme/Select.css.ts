import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

export const container = style({
  position: "relative",
  display: "flex",
  alignItems: "center",
  width: "100%",
})

export const select = style({
  width: "100%",
})

export const chevron = style({
  position: "absolute",
  right: "12px",
  display: "flex",
  alignItems: "center",
  lineHeight: 0,
  color: vars.colors.text.weak,
  pointerEvents: "none",
})
