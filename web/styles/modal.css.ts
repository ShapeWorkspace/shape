import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

export const modalOverlay = style({
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
})

export const modal = style({
  background: vars.color.bgPrimary,
  borderRadius: vars.borderRadius.xl,
  padding: vars.space[5],
  minWidth: "300px",
  maxWidth: "400px",
  boxShadow: "0 4px 24px rgba(0, 0, 0, 0.12)",
})

export const modalTitle = style({
  fontSize: vars.fontSize[15],
  fontWeight: vars.fontWeight.medium,
  marginBottom: vars.space[4],
})

export const modalInput = style({
  width: "100%",
  padding: `${vars.space[2]} ${vars.space[3]}`,
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.lg,
  fontSize: vars.fontSize[14],
  outline: "none",
  marginBottom: vars.space[4],
  fontFamily: "inherit",
  background: vars.color.bgPrimary,
  color: vars.color.textPrimary,
  ":focus": {
    borderColor: vars.color.textTertiary,
  },
})

export const modalTextarea = style([
  modalInput,
  {
    resize: "vertical",
    minHeight: "100px",
  },
])

export const modalButtons = style({
  display: "flex",
  gap: vars.space[2],
  justifyContent: "flex-end",
})

export const modalButton = style({
  padding: `${vars.space[2]} ${vars.space[4]}`,
  borderRadius: vars.borderRadius.base,
  fontSize: vars.fontSize[13],
  cursor: "pointer",
  transition: `all ${vars.transition.fast}`,
  fontWeight: vars.fontWeight.medium,
})

export const modalButtonCancel = style([
  modalButton,
  {
    background: "transparent",
    border: `1px solid ${vars.color.borderColor}`,
    color: vars.color.textPrimary,
    ":hover": {
      background: vars.color.bgHover,
    },
  },
])

export const modalButtonConfirm = style([
  modalButton,
  {
    background: vars.color.textPrimary,
    border: "none",
    color: vars.color.bgPrimary,
    ":hover": {
      filter: "brightness(0.85)",
    },
  },
])
