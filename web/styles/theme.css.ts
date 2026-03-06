import { createThemeContract, createGlobalTheme, globalStyle } from "@vanilla-extract/css"

// Theme contract defines the shape of all theme variables.
// Using a contract allows us to override values for dark mode.
export const vars = createThemeContract({
  color: {
    bgPrimary: "",
    bgSecondary: "",
    bgTertiary: "",
    bgHover: "",
    bgActive: "",
    textPrimary: "",
    textSecondary: "",
    textTertiary: "",
    borderColor: "",
    borderLight: "",
    unreadBlue: "",
    resolvedGreen: "",
    deleteRed: "",
    deleteRedHover: "",
    deleteRedActive: "",
  },
  space: {
    1: "",
    2: "",
    3: "",
    4: "",
    5: "",
    6: "",
    8: "",
    10: "",
  },
  fontSize: {
    10: "",
    11: "",
    12: "",
    13: "",
    14: "",
    15: "",
    16: "",
    18: "",
  },
  fontWeight: {
    normal: "",
    medium: "",
  },
  borderRadius: {
    sm: "",
    md: "",
    base: "",
    lg: "",
    xl: "",
  },
  transition: {
    fast: "",
  },
})

// Light theme (default)
createGlobalTheme(":root", vars, {
  color: {
    bgPrimary: "#ffffff",
    bgSecondary: "#fafafa",
    bgTertiary: "#f5f5f5",
    bgHover: "#f0f0f0",
    bgActive: "#ebebeb",
    textPrimary: "#1a1a1a",
    textSecondary: "#666666",
    textTertiary: "#999999",
    borderColor: "#e8e8e8",
    borderLight: "#f0f0f0",
    unreadBlue: "#2196f3",
    resolvedGreen: "#4caf50",
    deleteRed: "#e53935",
    deleteRedHover: "rgba(229, 57, 53, 0.1)",
    deleteRedActive: "rgba(229, 57, 53, 0.15)",
  },
  space: {
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "20px",
    6: "24px",
    8: "32px",
    10: "40px",
  },
  fontSize: {
    10: "10px",
    11: "11px",
    12: "12px",
    13: "13px",
    14: "14px",
    15: "15px",
    16: "16px",
    18: "18px",
  },
  fontWeight: {
    normal: "400",
    medium: "500",
  },
  borderRadius: {
    sm: "3px",
    md: "4px",
    base: "6px",
    lg: "8px",
    xl: "12px",
  },
  transition: {
    fast: "100ms ease",
  },
})

// Dark theme - automatically applied when system prefers dark mode.
// Only color values need to change; spacing, font sizes, etc. remain the same.
globalStyle(":root", {
  "@media": {
    "(prefers-color-scheme: dark)": {
      vars: {
        [vars.color.bgPrimary]: "#111111",
        [vars.color.bgSecondary]: "#1a1a1a",
        [vars.color.bgTertiary]: "#222222",
        [vars.color.bgHover]: "#2a2a2a",
        [vars.color.bgActive]: "#333333",
        [vars.color.textPrimary]: "#f0f0f0",
        [vars.color.textSecondary]: "#a0a0a0",
        [vars.color.textTertiary]: "#707070",
        [vars.color.borderColor]: "#333333",
        [vars.color.borderLight]: "#2a2a2a",
        // Accent colors slightly adjusted for better contrast on dark backgrounds
        [vars.color.unreadBlue]: "#42a5f5",
        [vars.color.resolvedGreen]: "#66bb6a",
        [vars.color.deleteRed]: "#ef5350",
        [vars.color.deleteRedHover]: "rgba(239, 83, 80, 0.15)",
        [vars.color.deleteRedActive]: "rgba(239, 83, 80, 0.2)",
      },
    },
  },
})
