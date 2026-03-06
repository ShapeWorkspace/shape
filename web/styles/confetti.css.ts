import { style, keyframes } from "@vanilla-extract/css"

// Particle burst animation - starts at center, moves outward while fading
const burst = keyframes({
  "0%": {
    transform: "translate(-50%, -50%) scale(1)",
    opacity: 1,
  },
  "100%": {
    transform: "translate(var(--end-x), var(--end-y)) scale(0)",
    opacity: 0,
  },
})

export const confettiContainer = style({
  position: "absolute",
  left: "calc(50% - 2px)",
  top: "calc(50% - 3px)",
  width: 0,
  height: 0,
  pointerEvents: "none",
  zIndex: 10,
})

export const particle = style({
  position: "absolute",
  width: 6,
  height: 6,
  borderRadius: "50%",
  animation: `${burst} 400ms ease-out forwards`,
})

// 8 particles positioned in a circle, each with unique color and end position
// Calculated positions: cos(angle) * distance, sin(angle) * distance where distance = 24px

export const particle0 = style({
  backgroundColor: "#FFD700", // Gold
  vars: { "--end-x": "24px", "--end-y": "0px" }, // 0°
})

export const particle1 = style({
  backgroundColor: "#FF6B6B", // Coral
  vars: { "--end-x": "17px", "--end-y": "17px" }, // 45°
  animationDelay: "25ms",
})

export const particle2 = style({
  backgroundColor: "#4ECDC4", // Teal
  vars: { "--end-x": "0px", "--end-y": "24px" }, // 90°
  animationDelay: "50ms",
})

export const particle3 = style({
  backgroundColor: "#45B7D1", // Sky blue
  vars: { "--end-x": "-17px", "--end-y": "17px" }, // 135°
  animationDelay: "75ms",
})

export const particle4 = style({
  backgroundColor: "#96CEB4", // Sage
  vars: { "--end-x": "-24px", "--end-y": "0px" }, // 180°
  animationDelay: "100ms",
})

export const particle5 = style({
  backgroundColor: "#FFEAA7", // Cream
  vars: { "--end-x": "-17px", "--end-y": "-17px" }, // 225°
  animationDelay: "125ms",
})

export const particle6 = style({
  backgroundColor: "#DDA0DD", // Plum
  vars: { "--end-x": "0px", "--end-y": "-24px" }, // 270°
  animationDelay: "150ms",
})

export const particle7 = style({
  backgroundColor: "#98D8C8", // Mint
  vars: { "--end-x": "17px", "--end-y": "-17px" }, // 315°
  animationDelay: "175ms",
})
