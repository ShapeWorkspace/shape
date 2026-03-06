import { logger } from "../utils/logger"

// Keys shared with the server API so the client and backend stay aligned.
export const USER_SETTING_EMAIL_MODE = "email_mode" as const
export const USER_SETTING_EMAIL_BATCH_INTERVAL = "email_batch_interval" as const

// EmailMode represents the currently supported delivery modes.
export type EmailMode = "realtime" | "batched" | "off"

// EMAIL_DELAY_BUCKET_OPTIONS lists the allowable delay buckets (in seconds) that the UI can display.
export const EMAIL_DELAY_BUCKET_OPTIONS = [
  60, 300, 1800, 3600, 10800, 14400, 21600, 28800, 43200, 86400,
] as const
export type EmailDelayBucket = (typeof EMAIL_DELAY_BUCKET_OPTIONS)[number]

// DEFAULT_EMAIL_DELAY_SECONDS is used when no explicit delayed preference exists.
export const DEFAULT_EMAIL_DELAY_SECONDS: EmailDelayBucket = 300

const EMAIL_MODES: readonly EmailMode[] = ["realtime", "batched", "off"] as const

// isEmailMode checks whether a string matches one of the supported modes.
export const isEmailMode = (value: string): value is EmailMode => {
  return EMAIL_MODES.includes(value as EmailMode)
}

// isEmailDelayBucket guards delay values so only recognised buckets pass through.
export const isEmailDelayBucket = (value: number): value is EmailDelayBucket => {
  return EMAIL_DELAY_BUCKET_OPTIONS.includes(value as EmailDelayBucket)
}

export interface UserSettingsParams {
  emailMode: EmailMode
  emailDelaySeconds: EmailDelayBucket
  values?: Record<string, unknown>
}

// UserSettings provides an immutable snapshot of a user's preferences.
export class UserSettings {
  public readonly emailMode: EmailMode
  public readonly emailDelaySeconds: EmailDelayBucket
  private readonly values: Record<string, unknown>

  constructor(params: UserSettingsParams) {
    this.emailMode = params.emailMode
    this.emailDelaySeconds = params.emailDelaySeconds

    const baseValues: Record<string, unknown> = {
      [USER_SETTING_EMAIL_MODE]: this.emailMode,
      [USER_SETTING_EMAIL_BATCH_INTERVAL]: this.emailDelaySeconds,
    }

    if (params.values) {
      for (const [key, rawValue] of Object.entries(params.values)) {
        if (key === USER_SETTING_EMAIL_MODE || key === USER_SETTING_EMAIL_BATCH_INTERVAL) {
          // Skip the canonical keys because we already stamped the validated values above.
          continue
        }
        baseValues[key] = rawValue
      }
    }

    this.values = Object.freeze({ ...baseValues })

    Object.freeze(this)
  }

  // getAll returns a shallow copy so callers can forward the full map without risking mutation.
  public getAll(): Record<string, unknown> {
    return { ...this.values }
  }

  // withEmailSettings produces a new immutable instance that keeps any additional metadata.
  public withEmailSettings(emailMode: EmailMode, delaySeconds: EmailDelayBucket): UserSettings {
    return new UserSettings({
      emailMode,
      emailDelaySeconds: delaySeconds,
      values: this.values,
    })
  }
}

// coerceEmailMode normalises arbitrary responses into a valid mode, logging when a fallback is used.
export const coerceEmailMode = (candidate: unknown): EmailMode => {
  if (typeof candidate === "string" && isEmailMode(candidate)) {
    return candidate
  }

  logger.warn("Unknown email mode provided by server, defaulting to realtime", candidate)
  return "realtime"
}

// coerceEmailDelayBucket normalises delay values, defaulting to five minutes if an unknown bucket arrives.
export const coerceEmailDelayBucket = (candidate: unknown): EmailDelayBucket => {
  if (typeof candidate === "number" && isEmailDelayBucket(candidate)) {
    return candidate
  }

  logger.warn("Unknown email delay provided by server, defaulting to 5 minutes", candidate)
  return DEFAULT_EMAIL_DELAY_SECONDS
}
