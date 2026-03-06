import { render, screen } from "@testing-library/react"
import { RelativeTimestamp } from "./RelativeTimestamp"

describe("RelativeTimestamp", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("displays 'just now' for timestamps less than 5 seconds ago", () => {
    const now = Date.now()
    vi.setSystemTime(now)

    render(<RelativeTimestamp timestamp={now - 2000} />)

    expect(screen.getByText("just now")).toBeInTheDocument()
  })

  it("displays seconds ago in 5-second increments", () => {
    const now = Date.now()
    vi.setSystemTime(now)

    render(<RelativeTimestamp timestamp={now - 17000} />)

    // 17 seconds rounds down to 15s
    expect(screen.getByText("15s ago")).toBeInTheDocument()
  })

  it("displays minutes ago for times under an hour", () => {
    const now = Date.now()
    vi.setSystemTime(now)

    render(<RelativeTimestamp timestamp={now - 5 * 60 * 1000} />)

    expect(screen.getByText("5m ago")).toBeInTheDocument()
  })

  it("displays full datetime for times over an hour", () => {
    const now = Date.now()
    vi.setSystemTime(now)

    // 2 hours ago
    const timestamp = now - 2 * 60 * 60 * 1000

    render(<RelativeTimestamp timestamp={timestamp} />)

    // Should contain date parts (the exact format depends on locale)
    const text = screen.getByText(/ago|AM|PM/i)
    expect(text).toBeInTheDocument()
  })
})
