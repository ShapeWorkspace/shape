import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { KeyboardShortcut } from "./KeyboardShortcut"

afterEach(() => {
  cleanup()
})

describe("KeyboardShortcut", () => {
  it("renders the command glyph for macOS when requested", () => {
    render(<KeyboardShortcut keys={["Mod", "Enter"]} platform="mac" />)

    expect(screen.getByText("⌘")).toBeInTheDocument()
    expect(screen.getByText("Return")).toBeInTheDocument()
  })

  it("falls back to control on Windows", () => {
    render(<KeyboardShortcut keys={["Mod", "Enter"]} platform="windows" />)

    expect(screen.getByText("Ctrl")).toBeInTheDocument()
  })

  it("derives an accessible label when none is provided", () => {
    render(<KeyboardShortcut keys={["Shift", "Enter"]} platform="windows" />)

    expect(screen.getByLabelText("Shift + Enter")).toBeInTheDocument()
  })
})
