import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

export const toolSelector = style({
  display: "flex",
  flexDirection: "column",
})

export const toolSelectorItem = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[3],
  padding: `${vars.space[2]} ${vars.space[3]}`,
  cursor: "pointer",
  transition: `background ${vars.transition.fast}`,
  borderRadius: vars.borderRadius.base,
  margin: "1px 0",
  ":hover": {
    background: vars.color.bgSecondary,
  },
  selectors: {
    '&[data-selected="true"]': {
      background: vars.color.bgTertiary,
    },
  },
})

export const toolSelectorIcon = style({
  color: vars.color.textSecondary,
  position: "relative",
  display: "flex",
  alignItems: "center",
})

export const toolSelectorLabel = style({
  fontSize: vars.fontSize[14],
})

export const toolSelectorDesc = style({
  fontSize: vars.fontSize[13],
  color: vars.color.textTertiary,
  marginLeft: "auto",
})

export const unreadDot = style({
  position: "absolute",
  top: "-2px",
  right: "-4px",
  width: "8px",
  height: "8px",
  background: vars.color.unreadBlue,
  borderRadius: "50%",
})

export const billingPaywallHud = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[2],
  padding: vars.space[3],
  marginBottom: vars.space[2],
  borderRadius: vars.borderRadius.lg,
  border: `1px solid ${vars.color.borderColor}`,
  background: vars.color.bgSecondary,
})

export const billingPaywallTitle = style({
  fontSize: vars.fontSize[14],
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textPrimary,
})

export const billingPaywallMessage = style({
  fontSize: vars.fontSize[13],
  color: vars.color.textSecondary,
})

export const billingPaywallActions = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  flexWrap: "wrap",
})

const billingButtonBase = style({
  borderRadius: vars.borderRadius.md,
  border: `1px solid ${vars.color.borderColor}`,
  fontSize: vars.fontSize[12],
  fontWeight: vars.fontWeight.medium,
  padding: `${vars.space[1]} ${vars.space[2]}`,
  cursor: "pointer",
  transition: `background ${vars.transition.fast}`,
  selectors: {
    "&:disabled": {
      opacity: 0.6,
      cursor: "not-allowed",
    },
  },
})

export const billingPaywallPrimaryButton = style([
  billingButtonBase,
  {
    background: vars.color.textPrimary,
    borderColor: vars.color.textPrimary,
    color: vars.color.bgPrimary,
    ":hover": {
      background: vars.color.textSecondary,
      borderColor: vars.color.textSecondary,
    },
  },
])

export const billingPaywallSecondaryButton = style([
  billingButtonBase,
  {
    background: vars.color.bgPrimary,
    color: vars.color.textPrimary,
    ":hover": {
      background: vars.color.bgHover,
    },
  },
])

export const billingPaywallError = style({
  color: vars.color.deleteRed,
  fontSize: vars.fontSize[12],
})
