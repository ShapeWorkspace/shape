import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"
import Tooltip from "./Tooltip"

describe("Tooltip positioning", () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame

  beforeAll(() => {
    // Stabilise animation timing so our deterministic measurements aren't delayed in JSDOM.
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      callback(0)
      return 0
    }
  })

  afterAll(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("centres a top placement tooltip above the interactive child element", () => {
    vi.useFakeTimers()

    const rectMap = new WeakMap<HTMLElement, DOMRect>()
    const defaultRect = new DOMRect(0, 0, 0, 0)

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return rectMap.get(this) ?? defaultRect
    })

    render(
      <Tooltip content="October 18, 2025 09:47:39 AM" placement="top">
        <span data-testid="timestamp">1m</span>
      </Tooltip>
    )

    const triggerChild = screen.getByTestId("timestamp")
    const wrapper = triggerChild.parentElement as HTMLElement

    // Simulate the flex wrapper stretching while the inner timestamp remains compact.
    rectMap.set(wrapper, new DOMRect(400, 100, 320, 40))
    rectMap.set(triggerChild, new DOMRect(120, 100, 24, 16))

    act(() => {
      fireEvent.mouseEnter(wrapper)
      vi.runAllTimers()
    })

    const tooltip = screen.getByRole("tooltip")

    expect(tooltip.style.transform).toBe("translate(-50%, -100%)")
    expect(tooltip.style.left).toBe("132px")
    expect(tooltip.style.top).toBe("92px")
  })

  it("honours right placement by anchoring at the trigger's midpoint", () => {
    vi.useFakeTimers()

    const rectMap = new WeakMap<HTMLElement, DOMRect>()
    const defaultRect = new DOMRect(0, 0, 0, 0)

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return rectMap.get(this) ?? defaultRect
    })

    render(
      <Tooltip content="Notifications" placement="right">
        <button type="button">Bell</button>
      </Tooltip>
    )

    const triggerButton = screen.getByRole("button", { name: "Bell" })
    const wrapper = triggerButton.parentElement as HTMLElement

    rectMap.set(wrapper, new DOMRect(200, 80, 360, 56))
    rectMap.set(triggerButton, new DOMRect(210, 90, 32, 32))

    act(() => {
      fireEvent.mouseEnter(wrapper)
      vi.runAllTimers()
    })

    const tooltip = screen.getByRole("tooltip")

    expect(tooltip.style.left).toBe("250px")
    expect(tooltip.style.top).toBe("106px")
    expect(tooltip.style.transform).toBe("translate(0, -50%)")
  })
})
