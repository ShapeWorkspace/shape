import { style, styleVariants } from "@vanilla-extract/css"
import { vars } from "./theme.css"

export const root = style({
  display: "inline-flex",
  alignItems: "center",
  cursor: "pointer",
  userSelect: "none",
})

export const input = style({
  position: "absolute",
  opacity: 0,
  pointerEvents: "none",
  width: 0,
  height: 0,
})

export const box = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: vars.borderRadius.sm,
  width: "14px",
  height: "14px",
  border: `1px solid ${vars.colors.border.subtle}`,
  backgroundColor: vars.colors.background.subtle,
  color: "transparent",
  transition: "background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease",

  selectors: {
    // Checked state: solid dark bg with white icon
    [`${input}:checked + &`]: {
      backgroundColor: vars.colors.text.norm,
      borderColor: vars.colors.text.norm,
      color: vars.colors.background.norm,
    },

    // Disabled
    [`${input}:disabled + &`]: {
      opacity: 0.6,
      cursor: "not-allowed",
    },
  },
})

export const size = styleVariants({
  sm: { width: "13px", height: "13px" },
  md: { width: "15px", height: "15px" },
  lg: { width: "17px", height: "17px" },
})
