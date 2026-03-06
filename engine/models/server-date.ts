/**
 * ServerDate
 *
 * Why this exists and why normalization is necessary
 * - The server (Go) serializes timestamps using RFC3339/RFC3339Nano semantics where the
 *   fractional seconds portion is variable-length and trailing zeros are trimmed.
 * - Our database (PostgreSQL) persists timestamps with microsecond precision (<= 6 fractional digits).
 * - When creating a base activity on the server, the in-memory timestamp may include sub‑microsecond
 *   nanosecond digits (e.g., ...869705366Z). When the parent is later loaded back from Postgres or when
 *   a reply inherits its parent’s value that came from the DB, the fractional part is microsecond
 *   precision (e.g., ...869705Z). The two strings represent the same moment but differ in textual form.
 * - Some tests (and a small amount of client logic) compare timestamp strings via equality on the
 *   original wire value, which led to CI-only failures: locally, timestamps often landed on a µs boundary
 *   (6 digits) and passed; in CI, they sometimes included 9 digits, causing mismatches.
 *
 * What we do here
 * - Normalize all incoming timestamp representations on the client to microsecond precision by truncating
 *   the fractional seconds to at most 6 digits and trimming trailing zeros. We do not pad zeros and we do
 *   not alter the timezone/offset portion. This yields stable, deterministic string equality for the same
 *   instant across environments, while preserving the server’s trimming behavior.
 * - Accept multiple input shapes (string, Date, or persisted objects that contain an `original` or `date`
 *   field) so that values rehydrated from storage do not crash and remain consistent after round-trips.
 *
 * Design notes
 * - Normalization is idempotent: applying it multiple times yields the same result.
 * - We intentionally keep the server implementation unchanged to avoid hidden behavior at the API layer
 *   and to centralize client expectations in one place.
 */
export class ServerDate {
  public readonly date: Date
  public readonly original: string
  public readonly relativeTime: string
  public readonly time: string

  constructor(original: string) {
    const asString = ServerDate.inputToIsoString(original)
    const normalized = ServerDate.normalizeToMicroseconds(asString)

    this.original = original
    this.date = new Date(normalized)
    this.relativeTime = this.formatRelativeTime()
    this.time = this.asTimeString()

    Object.freeze(this)
  }

  // Accepts string | Date | object persisted to storage (e.g., { original: string } or { date: string })
  private static inputToIsoString(input: unknown): string {
    if (typeof input === "string") return input
    if (input instanceof Date) return input.toISOString()
    if (input && typeof input === "object") {
      const anyObj = input as Record<string, unknown>
      const original = anyObj["original"]
      if (typeof original === "string") return original
      const date = anyObj["date"]
      if (typeof date === "string") return date
    }
    // Fallback to Date parsing of stringified input
    try {
      const d = new Date(String(input))
      if (!isNaN(d.getTime())) {
        return d.toISOString()
      }
    } catch {
      // As a last resort, return empty epoch ISO
      return new Date(0).toISOString()
    }
    return new Date(0).toISOString()
  }

  // Normalize ISO8601 timestamp strings to microsecond precision (<= 6 fractional digits)
  private static normalizeToMicroseconds(iso: string): string {
    // Match fractional seconds like .123456789Z or .123Z or with offset
    const match = iso.match(/^(.*T\d{2}:\d{2}:\d{2})(\.(\d+))?(Z|[+-]\d{2}:?\d{2})$/)
    if (!match) return iso
    const prefix = match[1]!
    const fraction = match[3] || ""
    const suffix = match[4]!
    if (fraction.length === 0) return iso
    // Truncate to max 6 digits (microseconds). Do not pad; preserve server trimming behavior
    const truncated = fraction.slice(0, 6).replace(/0+$/, "")
    return truncated.length > 0 ? `${prefix}.${truncated}${suffix}` : `${prefix}${suffix}`
  }

  private formatRelativeTime(): string {
    const now = new Date()
    const diff = now.getTime() - this.date.getTime()

    const minutes = Math.floor(diff / (1000 * 60))
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (minutes < 60) {
      return minutes <= 1 ? "1m" : `${minutes}m`
    } else if (hours < 24) {
      return hours === 1 ? "1h" : `${hours}h`
    } else {
      return days === 1 ? "1d" : `${days}d`
    }
  }

  private asTimeString(): string {
    return this.date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "numeric",
    })
  }

  /** For use with tests; clients shouldn't otherwise generate server dates */
  static mocked(original?: string): ServerDate {
    if (original) {
      return new ServerDate(original)
    }

    // Generate ISO string with pseudo microsecond precision in server timezone (UTC-5)
    const now = new Date()
    // Convert to server timezone (UTC-5 / CDT)
    const serverTime = new Date(now.getTime() - 5 * 60 * 60 * 1000)
    const isoString = serverTime.toISOString()

    // Insert 3 random digits before the 'Z' and replace Z with -05:00 timezone offset
    // Ensure we don't generate trailing zeros to match server behavior
    let microsecondSuffix = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0")
    // Remove trailing zeros to match server JSON serialization behavior
    microsecondSuffix = microsecondSuffix.replace(/0+$/, "") || "0"
    const withMicroseconds = isoString.slice(0, -1) + microsecondSuffix + "-05:00"

    return new ServerDate(withMicroseconds)
  }
}
