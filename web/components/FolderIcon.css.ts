import { style, globalStyle } from "@vanilla-extract/css"
import { vars } from "../styles/theme.css"
import { listItem } from "../styles/list.css"

export const folderIconContainer = style({
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
})

export const overlayContainer = style({
  position: "absolute",
  bottom: -4,
  right: -5,
})

export const circleBackground = style({
  position: "absolute",
  inset: 0,
  borderRadius: "50%",
  backgroundColor: vars.color.bgPrimary,
  transition: `background ${vars.transition.fast}`,
})

// When parent listItem is hovered, match its hover background
globalStyle(`${listItem}:hover ${circleBackground}`, {
  backgroundColor: vars.color.bgSecondary,
})

// When parent listItem is selected, match its selected background
globalStyle(`${listItem}[data-selected="true"] ${circleBackground}`, {
  backgroundColor: vars.color.bgTertiary,
})

export const iconWrapper = style({
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 2,
})
