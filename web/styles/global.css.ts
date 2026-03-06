import { globalStyle, keyframes } from "@vanilla-extract/css"
import { vars } from "./theme.css"

globalStyle("*", {
  margin: 0,
  padding: 0,
  boxSizing: "border-box",
})

globalStyle("html, body, #root", {
  height: "100%",
  width: "100%",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif",
  background: vars.color.bgPrimary,
  color: vars.color.textPrimary,
  fontSize: vars.fontSize[14],
  lineHeight: 1.5,
  WebkitFontSmoothing: "antialiased",
  letterSpacing: "-0.01em",
})

// Highlight animation for scroll-to-message feature in chat
// Applied via classList when clicking on quoted message references
const highlightPulse = keyframes({
  "0%": {
    backgroundColor: "rgba(52, 120, 246, 0.25)",
  },
  "100%": {
    backgroundColor: "transparent",
  },
})

globalStyle(".highlight-message", {
  animation: `${highlightPulse} 1.5s ease-out`,
})
