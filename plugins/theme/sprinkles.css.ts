import { defineProperties, createSprinkles } from "@vanilla-extract/sprinkles"
import { vars } from "./theme.css"

const properties = defineProperties({
  conditions: {
    mobile: {},
    tablet: { "@media": "screen and (min-width: 768px)" },
    desktop: { "@media": "screen and (min-width: 1024px)" },
  },
  defaultCondition: "mobile",
  properties: {
    display: ["none", "flex", "block", "inline", "inline-block", "grid"],
    flexDirection: ["row", "column"],
    justifyContent: ["stretch", "flex-start", "center", "flex-end", "space-around", "space-between"],
    alignItems: ["stretch", "flex-start", "center", "flex-end"],
    gap: vars.spacing,
    paddingTop: vars.spacing,
    paddingBottom: vars.spacing,
    paddingLeft: vars.spacing,
    paddingRight: vars.spacing,
    padding: vars.spacing,
    marginTop: vars.spacing,
    marginBottom: vars.spacing,
    marginLeft: vars.spacing,
    marginRight: vars.spacing,
    margin: vars.spacing,
    borderRadius: vars.borderRadius,
    fontSize: vars.fontSizes,
    fontWeight: ["normal", "bold", "100", "200", "300", "400", "500", "600", "700", "800", "900"],
    textAlign: ["left", "center", "right"],
    position: ["relative", "absolute", "fixed", "sticky"],
    top: ["0"],
    bottom: ["0"],
    left: ["0"],
    right: ["0"],
    width: ["100%"],
    height: ["100%"],
    minHeight: ["0", "100vh"],
    overflow: ["hidden", "scroll", "auto"],
    overflowX: ["hidden", "scroll", "auto"],
    overflowY: ["hidden", "scroll", "auto"],
    cursor: ["pointer", "default", "text"],
    pointerEvents: ["none", "auto"],
    userSelect: ["none", "auto"],
    opacity: ["0", "0.5", "1"],
    zIndex: ["0", "1", "10", "100", "1000"],
  },
  shorthands: {
    paddingX: ["paddingLeft", "paddingRight"],
    paddingY: ["paddingTop", "paddingBottom"],
    marginX: ["marginLeft", "marginRight"],
    marginY: ["marginTop", "marginBottom"],
    size: ["width", "height"],
  },
})

export const sprinkles = createSprinkles(properties)

export type Sprinkles = Parameters<typeof sprinkles>[0]
