import { createGlobalTheme } from "@vanilla-extract/css"

/**
 * Shape Tech Design System
 *
 * Do not edit or add tokens here without reviewing the approved Figma.
 **/

export const vars = createGlobalTheme(":root", {
  globalHeaderHeight: "53px",
  colors: {
    interaction: {
      primary: {
        norm: "var(--foreground)",
        hover: "var(--foreground-secondary)",
        active: "var(--foreground-hint)",
      },
      weak: {
        norm: "var(--surface-sunken)",
        hover: "var(--surface-raised)",
        active: "var(--border-weak)",
      },
      default: {
        norm: "transparent",
        hover: "color-mix(in srgb, var(--foreground) 6%, transparent)",
        active: "color-mix(in srgb, var(--foreground) 10%, transparent)",
      },
    },
    link: {
      norm: "var(--foreground)",
      hover: "color-mix(in srgb, var(--foreground) 6%, transparent)",
      active: "color-mix(in srgb, var(--foreground) 10%, transparent)",
    },
    text: {
      norm: "var(--foreground)",
      weak: "var(--foreground-secondary)",
      hint: "var(--foreground-hint)",
      disabled: "var(--foreground-disabled)",
      invert: "var(--background)",
    },
    border: {
      norm: "var(--border)",
      subtle: "var(--border-weak)",
      weak: "var(--border-weak)",
      focus: "var(--accent-color)",
      focusRing: "color-mix(in srgb, var(--accent-color) 15%, transparent)",
    },
    background: {
      norm: "var(--background)",
      subtle: "var(--surface-sunken)",
      weak: "var(--surface-raised)",
      strong: "var(--border-weak)",
      extraStrong: "var(--border)",
      aiChip: "color-mix(in srgb, var(--success) 10%, transparent)",
      invert: "var(--foreground)",
    },
    signal: {
      success: {
        norm: "var(--success)",
        hover: "color-mix(in srgb, var(--success) 6%, var(--foreground))",
        active: "color-mix(in srgb, var(--success) 10%, var(--foreground))",
      },
      warning: {
        norm: "var(--warning)",
        hover: "color-mix(in srgb, var(--warning) 6%, var(--foreground))",
        active: "color-mix(in srgb, var(--warning) 10%, var(--foreground))",
      },
      danger: {
        norm: "var(--destructive)",
        hover: "color-mix(in srgb, var(--destructive) 6%, var(--foreground))",
        active: "color-mix(in srgb, var(--destructive) 10%, var(--foreground))",
      },
      info: {
        norm: "var(--info)",
        hover: "color-mix(in srgb, var(--info) 6%, var(--foreground))",
        active: "color-mix(in srgb, var(--info) 10%, var(--foreground))",
      },
    },
  },
  spacing: {
    xxs: "2px",
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
    lgToXl: "18px",
    xl: "20px",
    xxl: "24px",
    xxxl: "30px",
    xxxxl: "38px",
  },
  borderRadius: {
    sm: "2px",
    md: "4px",
    lg: "6px",
    full: "100vmax",
  },
  shadows: {
    norm: "var(--shadow-norm)",
    raised: "var(--shadow-raised)",
    lifted: "var(--shadow-lifted)",
    focusRing: "var(--shadow-focus-ring)",
  },
  fonts: {
    system: "var(--font-family)",
  },
  fontSizes: {
    xxxs: "10px",
    xxs: "11px",
    xs: "12px",
    sm: "13px",
    md: "14px",
    lg: "16px",
    xl: "18px",
    xxl: "24px",
    xxxl: "32px",
  },
  fontWeights: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
  zIndices: {
    xs: "100",
    sm: "200",
    md: "400",
    lg: "800",
    xl: "1200",
    xxl: "1600",
    xxxl: "2000",
    max: "9999",
  },
})
