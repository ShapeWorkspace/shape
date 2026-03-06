import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"
import { sprinkles } from "./sprinkles.css"

export const inputFocusRing = style({
  ":focus": {
    borderColor: vars.colors.border.subtle,
  },
})

export const form = style({
  display: "flex",
  flexDirection: "column",
  gap: "8px",
})

export const formInput = style([
  sprinkles({
    borderRadius: "md",
    fontSize: "sm",
  }),
  inputFocusRing,
  {
    padding: "9px 12px",
    backgroundColor: vars.colors.background.subtle,
    color: vars.colors.text.norm,
    border: `1px solid transparent`,
    outline: "none",
    width: "100%",
    ":disabled": {
      opacity: 0.6,
      cursor: "not-allowed",
    },
    "::placeholder": {
      color: vars.colors.text.weak,
      fontWeight: vars.fontWeights.regular,
    },
  },
])

export const formInputWithIconPaddingAdjustment = style({
  padding: "9px 12px 9px 36px",
})

export const formInputWithIconWrapper = style({
  position: "relative",
  marginBottom: "6px",
  display: "flex",
  alignItems: "center",
})

export const formInputIcon = style([
  {
    color: vars.colors.text.weak,
    position: "absolute",
    left: "12px",
    top: "50%",
    transform: "translateY(-50%)",
    marginTop: "0px",
    pointerEvents: "none",
    zIndex: 1,
    flexShrink: 0,
  },
])

// Category contains many sections
export const formCategory = style({
  marginBottom: "20px",
  display: "flex",
  flexDirection: "column",
  // gap: "6px",
})

export const formSection = style({
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  marginBottom: "12px",
})

export const formLabel = style([
  sprinkles({
    fontSize: "sm",
    fontWeight: "600",
  }),
  {
    color: vars.colors.text.norm,
    marginBottom: "2px",
  },
])

export const formTextarea = style([
  formInput,
  {
    resize: "vertical",
    minHeight: "80px",
    fontFamily: "inherit",
  },
])

// Right-side icon helpers for inputs/selects
export const formInputIconRight = style([
  {
    color: vars.colors.text.weak,
    position: "absolute",
    right: "12px",
    top: "50%",
    transform: "translateY(-50%)",
    marginTop: "0px",
    pointerEvents: "none",
    zIndex: 1,
    flexShrink: 0,
  },
])

export const formInputWithRightIconPadding = style({
  padding: "9px 36px 9px 12px",
})

export const selectReset = style({
  WebkitAppearance: "none",
  MozAppearance: "none",
  appearance: "none",
})

// Native select normalization with a consistent caret alignment
export const formSelect = style([
  formInput,
  {
    WebkitAppearance: "none",
    MozAppearance: "none",
    appearance: "none",
    backgroundImage:
      `url("data:image/svg+xml;utf8,` +
      encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='${vars.colors.text.weak}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>`
      ) +
      `")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
    backgroundSize: "16px 16px",
    paddingRight: "48px",
  },
])

// Generic callout container and variants
export const callout = style({
  borderRadius: vars.borderRadius.lg,
  border: `1px solid ${vars.colors.border.subtle}`,
  backgroundColor: vars.colors.background.subtle,
  color: vars.colors.text.norm,
  padding: `${vars.spacing.md} ${vars.spacing.lg}`,
})

export const calloutError = style([
  callout,
  {
    backgroundColor: vars.colors.background.weak,
    color: vars.colors.text.norm,
    borderColor: vars.colors.signal.danger.norm,
    fontSize: vars.fontSizes.sm,
    fontWeight: parseInt(vars.fontWeights.semibold),
  },
])

// New utility classes
export const rowGapSmCenter = style({
  display: "flex",
  alignItems: "center",
  gap: vars.spacing.sm,
})

export const inlineRowGapSmCenter = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.spacing.sm,
})

export const textSuccess = style({
  color: vars.colors.signal.success.norm,
})

export const textXsBold = style([sprinkles({ fontSize: "xs", fontWeight: "bold" })])
