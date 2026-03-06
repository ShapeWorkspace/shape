import { style, keyframes, styleVariants } from "@vanilla-extract/css"
import { vars } from "./theme.css"

const spin = keyframes({
  "0%": { transform: "rotate(0deg)" },
  "100%": { transform: "rotate(360deg)" },
})

export const container = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.spacing.sm,
  color: vars.colors.text.weak,
})

const sizeVars = {
  sm: { box: 14, border: 2 },
  md: { box: 18, border: 2 },
  lg: { box: 24, border: 3 },
} as const

export const spinner = styleVariants({
  sm: {
    width: sizeVars.sm.box,
    height: sizeVars.sm.box,
    borderRadius: "50%",
    border: `${sizeVars.sm.border}px solid ${vars.colors.background.subtle}`,
    borderTopColor: vars.colors.text.norm,
    animation: `${spin} 900ms linear infinite`,
  },
  md: {
    width: sizeVars.md.box,
    height: sizeVars.md.box,
    borderRadius: "50%",
    border: `${sizeVars.md.border}px solid ${vars.colors.background.subtle}`,
    borderTopColor: vars.colors.text.norm,
    animation: `${spin} 900ms linear infinite`,
  },
  lg: {
    width: sizeVars.lg.box,
    height: sizeVars.lg.box,
    borderRadius: "50%",
    border: `${sizeVars.lg.border}px solid ${vars.colors.background.subtle}`,
    borderTopColor: vars.colors.text.norm,
    animation: `${spin} 900ms linear infinite`,
  },
})

export const label = style({
  fontSize: vars.fontSizes.sm,
})
