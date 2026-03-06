import { useEffect, useMemo, useState } from "react"
import type { ReactElement } from "react"
import * as styles from "./KeyboardShortcut.css"

type Platform = "mac" | "windows" | "linux" | "unknown"

interface PlatformKeyLabel {
  default: string
  mac?: string
  windows?: string
  linux?: string
}

export type KeyboardShortcutKey = string | PlatformKeyLabel

export interface KeyboardShortcutProps {
  keys: readonly KeyboardShortcutKey[]
  separator?: string
  className?: string
  ariaLabel?: string
  platform?: Platform
}

// Canonical fallback map for common keys so product teams can declare shortcuts tersely
const PLATFORM_KEY_SYMBOLS: Record<string, PlatformKeyLabel> = {
  mod: { default: "Ctrl", mac: "⌘" },
  command: { default: "Command", mac: "⌘" },
  cmd: { default: "Command", mac: "⌘" },
  control: { default: "Ctrl", mac: "Control" },
  ctrl: { default: "Ctrl", mac: "Control" },
  shift: { default: "Shift", mac: "⇧" },
  alt: { default: "Alt", mac: "⌥" },
  option: { default: "Alt", mac: "⌥" },
  meta: { default: "Meta", mac: "⌘" },
  enter: { default: "Enter", mac: "Return" },
  return: { default: "Enter", mac: "Return" },
  escape: { default: "Esc" },
  esc: { default: "Esc" },
  space: { default: "Space" },
  backspace: { default: "Backspace", mac: "⌫" },
  delete: { default: "Delete", mac: "⌦" },
  tab: { default: "Tab" },
  pageup: { default: "PageUp" },
  pagedown: { default: "PageDown" },
  home: { default: "Home" },
  end: { default: "End" },
  arrowup: { default: "↑" },
  arrowdown: { default: "↓" },
  arrowleft: { default: "←" },
  arrowright: { default: "→" },
}

// Best-effort platform detection; we degrade gracefully rather than fail during SSR hydration.
const detectPlatform = (): Platform => {
  if (typeof navigator === "undefined") {
    return "unknown"
  }

  const userAgent = navigator.userAgent || ""
  const platform = (navigator.platform || "").toLowerCase()
  const userAgentData = (navigator as typeof navigator & { userAgentData?: { platform?: string } })
    .userAgentData
  const normalized = (userAgentData?.platform || platform || userAgent).toLowerCase()

  if (normalized.includes("mac")) {
    return "mac"
  }
  if (normalized.includes("win")) {
    return "windows"
  }
  if (normalized.includes("linux")) {
    return "linux"
  }

  return "unknown"
}

const resolveLabelForPlatform = (label: PlatformKeyLabel, platform: Platform): string => {
  switch (platform) {
    case "mac":
      return label.mac ?? label.default
    case "windows":
      return label.windows ?? label.default
    case "linux":
      return label.linux ?? label.default
    default:
      return label.default
  }
}

// Convert whatever descriptor the caller provided into the specific glyph for the active platform.
const resolveDescriptor = (key: KeyboardShortcutKey, platform: Platform): string => {
  if (typeof key !== "string") {
    return resolveLabelForPlatform(key, platform)
  }

  const canonical = key.toLowerCase()
  const preset = PLATFORM_KEY_SYMBOLS[canonical]

  if (preset) {
    return resolveLabelForPlatform(preset, platform)
  }

  if (key.length === 1) {
    return key.toUpperCase()
  }

  return key
}

// Lightweight helper to avoid a classnames dependency for this simple combination.
const joinClassNames = (first?: string, second?: string): string => {
  if (first && second) {
    return `${first} ${second}`
  }
  return first ?? second ?? ""
}

export type KeyboardShortcutPlatform = Platform

export const KeyboardShortcut = (props: KeyboardShortcutProps) => {
  const { keys, separator = "+", className, ariaLabel, platform: explicitPlatform } = props

  // We resolve the platform lazily so that server rendering and the initial client render stay in sync.
  const [detectedPlatform, setDetectedPlatform] = useState<Platform>("unknown")

  useEffect(() => {
    if (explicitPlatform) {
      return
    }
    // Detect once on the client so the component mirrors the host OS without SSR flicker.
    setDetectedPlatform(detectPlatform())
  }, [explicitPlatform])

  const platform = explicitPlatform ?? detectedPlatform

  const labels = useMemo(() => keys.map(key => resolveDescriptor(key, platform)), [keys, platform])

  const accessibleLabel = useMemo(() => {
    if (ariaLabel) {
      return ariaLabel
    }
    return labels.join(" + ")
  }, [ariaLabel, labels])

  const resolvedSeparator = separator
  const wrapperClassName = useMemo(() => joinClassNames(styles.keyboardShortcut, className), [className])

  const segments = useMemo(() => {
    const nodes: ReactElement[] = []

    labels.forEach((label, index) => {
      nodes.push(
        <span key={`key-${index}`} className={styles.key} aria-hidden="true">
          {label}
        </span>
      )

      if (index < labels.length - 1) {
        nodes.push(
          <span key={`sep-${index}`} className={styles.separator} aria-hidden="true">
            {resolvedSeparator}
          </span>
        )
      }
    })

    return nodes
  }, [labels, resolvedSeparator])

  return (
    <span className={wrapperClassName} aria-label={accessibleLabel}>
      {segments}
    </span>
  )
}

export default KeyboardShortcut
