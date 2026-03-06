import { style, globalStyle } from "@vanilla-extract/css"
import { vars } from "./theme.css"

export const switchRoot = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.sm,
})

export const switchContainer = style({
  display: "flex",
  alignItems: "center",
  gap: vars.spacing.sm,
})

export const switchTrack = style({
  width: "40px",
  height: "24px",
  borderRadius: vars.borderRadius.full,
  backgroundColor: "transparent",
  border: `1px solid ${vars.colors.border.subtle}`,
  position: "relative",
  cursor: "pointer",
  transition: "border-color 0.2s ease-out",
  selectors: {
    "&[data-checked='true']": {
      borderColor: vars.colors.text.norm,
    },
    "&:hover:not(:disabled)": {
      borderColor: vars.colors.border.norm,
    },
    "&:focus-visible": {
      outline: `2px solid ${vars.colors.border.focusRing}`,
      outlineOffset: 2,
    },
    "&:disabled": {
      cursor: "not-allowed",
      opacity: 0.6,
    },
  },
})

export const switchThumb = style({
  width: "24px",
  height: "24px",
  borderRadius: vars.borderRadius.full,
  backgroundColor: vars.colors.text.norm,
  position: "absolute",
  top: 0,
  left: 0,
  transition: "transform 0.2s ease-out",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  selectors: {
    "&[data-checked='true']": {
      transform: "translateX(16px)",
    },
  },
})

globalStyle(`${switchThumb} svg`, {
  stroke: vars.colors.background.norm,
  flexShrink: 0,
  width: "12px",
  height: "12px",
})

export const switchLabel = style({
  color: vars.colors.text.norm,
  fontSize: vars.fontSizes.sm,
  fontWeight: vars.fontWeights.regular,
  cursor: "pointer",
  userSelect: "none",
  selectors: {
    [`${switchRoot}[data-disabled='true'] &`]: {
      cursor: "not-allowed",
      opacity: 0.6,
    },
  },
})

export const switchChildren = style({
  marginLeft: "52px",
})
