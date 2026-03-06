import { describe, expect, it, vi } from "vitest"
import { Logger, LogLevel } from "./logger"

describe("Logger", () => {
  it("includes a locale-formatted timestamp in the log label", () => {
    // Intercept the formatter so we can assert on the exact output without depending on the host locale.
    const formattedStamp = "1/2/25, 3:45:30 PM"
    const formatMock = vi.fn().mockReturnValue(formattedStamp)
    const dateTimeSpy = vi
      .spyOn(Intl, "DateTimeFormat")
      .mockImplementation(() => ({ format: formatMock }) as unknown as Intl.DateTimeFormat)

    // Capture the console call so we can inspect what the logger attempted to write.
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => undefined)

    const testLogger = new Logger("TEST", LogLevel.INFO)
    testLogger.info("hello")

    // Ensure the logger configured the formatter with the expected parameters (locale inferred, compact output).
    expect(dateTimeSpy).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ dateStyle: "short", timeStyle: "medium" })
    )
    // The formatter we supplied should have been invoked exactly once with the Date instance created by the logger.
    expect(formatMock).toHaveBeenCalledTimes(1)
    expect(formatMock.mock.calls[0]?.[0]).toBeInstanceOf(Date)

    // The log template should include whatever our mocked formatter produced.
    const [template] = consoleSpy.mock.calls[0] ?? []
    expect(template).toContain(formattedStamp)

    dateTimeSpy.mockRestore()
    consoleSpy.mockRestore()
  })
})
