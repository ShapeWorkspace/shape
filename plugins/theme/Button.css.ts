import { style, globalStyle } from "@vanilla-extract/css"
import { vars } from "./theme.css"

export const button = style({
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: vars.borderRadius.lg,
  gap: vars.spacing.xs,
  fontFamily: vars.fonts.system,
  fontWeight: vars.fontWeights.regular,
  selectors: {
    "&:disabled": {
      cursor: "not-allowed",
      opacity: 0.5,
    },
    "&:focus-visible": {
      outline: `2px solid ${vars.colors.border.focusRing}`,
      outlineOffset: 2,
    },
    "&:active:not(:disabled)": {
      transform: "scale(0.97)",
    },
  },
})

globalStyle(`${button} svg`, {
  stroke: "currentColor",
  flexShrink: 0,
})

// Compound variants: weakOutline, weakSolid, weakGhost, dangerOutline, etc.
export const weakOutline = style({
  backgroundColor: "transparent",
  border: `1px solid ${vars.colors.border.norm}`,
  color: vars.colors.text.norm,
  selectors: {
    "&:hover:not(:disabled)": {
      backgroundColor: vars.colors.background.weak,
    },
    "&:active:not(:disabled)": {
      backgroundColor: vars.colors.background.strong,
    },
  },
})

export const weakSolid = style({
  backgroundColor: vars.colors.interaction.weak.norm,
  border: `1px solid ${vars.colors.interaction.weak.norm}`,
  color: vars.colors.text.norm,
  selectors: {
    "&:hover:not(:disabled)": {
      backgroundColor: vars.colors.interaction.weak.hover,
    },
    "&:active:not(:disabled)": {
      backgroundColor: vars.colors.interaction.weak.active,
    },
  },
})

export const weakGhost = style({
  backgroundColor: "transparent",
  border: "1px solid transparent",
  color: vars.colors.text.norm,
  selectors: {
    "&:hover:not(:disabled)": {
      backgroundColor: vars.colors.interaction.default.hover,
    },
    "&:active:not(:disabled)": {
      backgroundColor: vars.colors.interaction.default.active,
    },
  },
})

export const dangerOutline = style({
  backgroundColor: "transparent",
  border: `1px solid ${vars.colors.signal.danger.active}`,
  color: vars.colors.signal.danger.norm,
  selectors: {
    "&:hover:not(:disabled)": {
      backgroundColor: `color-mix(in srgb, ${vars.colors.signal.danger.hover}, transparent 90%)`,
    },
    "&:active:not(:disabled)": {
      backgroundColor: `color-mix(in srgb, ${vars.colors.signal.danger.hover}, transparent 80%)`,
    },
  },
})

// Placeholders for future combinations
export const dangerSolid = style({
  backgroundColor: vars.colors.signal.danger.norm,
  border: `1px solid ${vars.colors.signal.danger.norm}`,
  color: vars.colors.text.invert,
  selectors: {
    "&:hover:not(:disabled)": {
      backgroundColor: vars.colors.signal.danger.hover,
    },
    "&:active:not(:disabled)": {
      backgroundColor: vars.colors.signal.danger.active,
    },
  },
})
export const dangerGhost = style({
  backgroundColor: "transparent",
  border: "1px solid transparent",
  color: vars.colors.signal.danger.norm,
  selectors: {
    "&:hover:not(:disabled)": {
      backgroundColor: vars.colors.interaction.default.hover,
    },
    "&:active:not(:disabled)": {
      backgroundColor: vars.colors.interaction.default.active,
    },
  },
})
export const normOutline = style({
  backgroundColor: "transparent",
  border: `1px solid ${vars.colors.interaction.primary.norm}`,
  color: vars.colors.text.norm,
  selectors: {
    "&:hover:not(:disabled)": {
      backgroundColor: vars.colors.background.weak,
    },
    "&:active:not(:disabled)": {
      backgroundColor: vars.colors.background.strong,
    },
  },
})

export const normSolid = style({
  backgroundColor: vars.colors.interaction.primary.norm,
  color: vars.colors.text.invert,
  border: `1px solid ${vars.colors.interaction.primary.norm}`,
  selectors: {
    "&:hover:not(:disabled)": {
      backgroundColor: vars.colors.interaction.primary.hover,
    },
    "&:active:not(:disabled)": {
      backgroundColor: vars.colors.interaction.primary.active,
    },
  },
})

export const normGhost = style({
  backgroundColor: "transparent",
  border: "1px solid transparent",
  color: vars.colors.text.norm,
  selectors: {
    "&:hover:not(:disabled)": {
      backgroundColor: vars.colors.interaction.default.hover,
    },
    "&:active:not(:disabled)": {
      backgroundColor: vars.colors.interaction.default.active,
    },
  },
})

// Accent variants use the user-selected accent color
export const accentSolid = style({
  backgroundColor: "var(--accent-color)",
  border: "1px solid var(--accent-color)",
  color: "#fff",
  selectors: {
    "&:hover:not(:disabled)": {
      backgroundColor: "color-mix(in srgb, var(--accent-color) 85%, #000)",
    },
    "&:active:not(:disabled)": {
      backgroundColor: "color-mix(in srgb, var(--accent-color) 75%, #000)",
    },
  },
})

export const accentOutline = style({
  backgroundColor: "transparent",
  border: "1px solid var(--accent-color)",
  color: "var(--accent-color)",
  selectors: {
    "&:hover:not(:disabled)": {
      backgroundColor: "color-mix(in srgb, var(--accent-color) 10%, transparent)",
    },
    "&:active:not(:disabled)": {
      backgroundColor: "color-mix(in srgb, var(--accent-color) 20%, transparent)",
    },
  },
})

export const accentGhost = style({
  backgroundColor: "transparent",
  border: "1px solid transparent",
  color: "var(--accent-color)",
  selectors: {
    "&:hover:not(:disabled)": {
      backgroundColor: "color-mix(in srgb, var(--accent-color) 10%, transparent)",
    },
    "&:active:not(:disabled)": {
      backgroundColor: "color-mix(in srgb, var(--accent-color) 15%, transparent)",
    },
  },
})

export const regular = style({
  padding: `${vars.spacing.sm} ${vars.spacing.lg}`,
  fontSize: vars.fontSizes.md,
  minHeight: "32px",
})

export const small = style({
  padding: `${vars.spacing.xs} ${vars.spacing.md}`,
  fontSize: vars.fontSizes.sm,
  minHeight: "24px",
})

export const large = style({
  padding: `${vars.spacing.md} ${vars.spacing.xl}`,
  fontSize: vars.fontSizes.lg,
  minHeight: "40px",
})

export const tiny = style({
  padding: "6px",
})
