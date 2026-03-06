import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

export const logRowDetails = style({
  display: "block",
  marginTop: vars.space[1],
  color: vars.color.textSecondary,
  fontSize: vars.fontSize[12],
  lineHeight: "1.4",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
})

export const logRowLevelBadge = style({
  display: "inline-block",
  marginRight: vars.space[2],
  padding: "2px 6px",
  borderRadius: vars.borderRadius.sm,
  fontSize: vars.fontSize[11],
  fontWeight: vars.fontWeight.medium,
  backgroundColor: vars.color.bgTertiary,
  color: vars.color.textSecondary,
})

export const logRowMessage = style({
  display: "inline",
})
