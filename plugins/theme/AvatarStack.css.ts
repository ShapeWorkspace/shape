import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

export const stack = style({
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
})

export const item = style({
  position: "relative",
  marginLeft: "-8px",
  borderRadius: vars.borderRadius.full,
  boxShadow: `0 0 0 2px ${vars.colors.background.subtle}`,
  selectors: {
    "&:first-child": {
      marginLeft: 0,
    },
  },
})

export const overflow = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: vars.borderRadius.full,
  backgroundColor: vars.colors.background.subtle,
  color: vars.colors.text.norm,
  fontFamily: vars.fonts.system,
  fontWeight: vars.fontWeights.semibold,
  flexShrink: 0,
  userSelect: "none",
  boxShadow: `0 0 0 2px ${vars.colors.background.subtle}`,
})
