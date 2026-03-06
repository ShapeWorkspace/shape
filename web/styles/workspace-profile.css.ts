import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

export const profileHeader = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
})

export const profileHeaderText = style({
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
})

export const profileName = style({
  fontSize: vars.fontSize[14],
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textPrimary,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
})

export const profileEmail = style({
  fontSize: vars.fontSize[12],
  color: vars.color.textSecondary,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
})

export const profileBio = style({
  fontSize: vars.fontSize[12],
  color: vars.color.textSecondary,
  lineHeight: 1.4,
  marginTop: vars.space[2],
})

export const profilePlaceholder = style({
  fontSize: vars.fontSize[12],
  color: vars.color.textTertiary,
  marginTop: vars.space[2],
})

export const profileAvatarRow = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
})

export const profileAvatarActions = style({
  display: "flex",
  gap: vars.space[2],
  flexWrap: "wrap",
})

const profileAvatarButtonBase = {
  padding: `${vars.space[1]} ${vars.space[2]}`,
  borderRadius: vars.borderRadius.base,
  fontSize: vars.fontSize[12],
  cursor: "pointer",
  transition: `all ${vars.transition.fast}`,
  border: `1px solid ${vars.color.borderColor}`,
  background: vars.color.bgPrimary,
  color: vars.color.textSecondary,
  selectors: {
    "&:disabled": {
      opacity: 0.5,
      cursor: "not-allowed",
    },
  },
}

export const profileAvatarButton = style({
  ...profileAvatarButtonBase,
  ":hover": {
    background: vars.color.bgSecondary,
    color: vars.color.textPrimary,
  },
})

export const profileAvatarRemoveButton = style({
  ...profileAvatarButtonBase,
  color: vars.color.deleteRed,
  ":hover": {
    background: vars.color.deleteRedHover,
  },
})
