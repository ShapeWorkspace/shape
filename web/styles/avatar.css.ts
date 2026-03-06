import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

export const avatar = style({
  borderRadius: "50%",
  background: vars.color.bgTertiary,
  color: vars.color.textSecondary,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: vars.fontSize[12],
  fontWeight: vars.fontWeight.medium,
  overflow: "hidden",
  flexShrink: 0,
})

export const avatarImage = style({
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
})
