/* eslint-disable @typescript-eslint/no-explicit-any */

// Log levels in order of priority (higher numbers = more verbose)
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  LOG = 3,
  DEBUG = 4,
}

export interface LogEntry {
  id: string
  timestampMs: number
  timestampIso: string
  level: LogLevel
  levelName: string
  loggerName: string
  message: string
  argumentSummaries: string[]
}

export type LogEntryListener = (entry: LogEntry) => void

let globalLogSequenceNumber = 0

export class Logger {
  private static readonly colorPalette = [
    "#F44336",
    "#E91E63",
    "#9C27B0",
    "#673AB7",
    "#3F51B5",
    "#2196F3",
    "#03A9F4",
    "#00BCD4",
    "#009688",
    "#4CAF50",
    "#8BC34A",
    "#CDDC39",
    "#FFEB3B",
    "#FFC107",
    "#FF9800",
    "#FF5722",
    "#795548",
    "#9E9E9E",
    "#607D8B",
  ]

  constructor(
    readonly name: string,
    private currentLogLevel: LogLevel = LogLevel.INFO
  ) {}

  private readonly logEntryListeners = new Set<LogEntryListener>()

  setLogLevel(level: LogLevel): void {
    this.currentLogLevel = level
  }

  getLogLevel(): LogLevel {
    return this.currentLogLevel
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.currentLogLevel
  }

  private static getColorForString(str: string): string {
    if (!str) {
      return Logger.colorPalette[0]!
    }

    const charCode = str.charCodeAt(0)
    return Logger.colorPalette[charCode % Logger.colorPalette.length]!
  }

  private static getBoxStyle(level: LogLevel, backgroundColor: string, opacity: number = 1): string {
    if (level === LogLevel.DEBUG) {
      return ""
    }

    const hex = backgroundColor.replace("#", "")
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    const yiq = (r * 299 + g * 587 + b * 114) / 1000
    const color = yiq >= 128 ? "black" : "white"
    return `background: ${backgroundColor}; opacity: ${opacity}; color: ${color}; padding: 2px 6px; border-radius: 3px; font-weight: bold;`
  }

  private static getMessageStyle(level: LogLevel, levelName: string): string {
    let base = `color: ${level === LogLevel.DEBUG ? "gray" : "white"};`

    if (levelName === "TEMP") {
      base += `font-weight: bold; color: red;`
    }

    return base
  }

  private static formatTimestamp(date: Date): string {
    // Use the runtime's locale preference so timestamps match user expectations (e.g. 12h vs 24h).
    // Selecting short date + medium time keeps the output compact while still including the day and time.
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(date)
  }

  private static buildLogEntryId(timestampMs: number): string {
    globalLogSequenceNumber += 1
    return `${timestampMs}-${globalLogSequenceNumber}`
  }

  private static formatLogArgumentForStorage(argument: unknown): string {
    if (argument instanceof Error) {
      const stack = argument.stack ? `\n${argument.stack}` : ""
      return `${argument.name}: ${argument.message}${stack}`
    }

    if (argument === undefined) {
      return "undefined"
    }

    if (argument === null) {
      return "null"
    }

    if (typeof argument === "string") {
      return argument
    }

    if (typeof argument === "number" || typeof argument === "boolean" || typeof argument === "bigint") {
      return String(argument)
    }

    if (typeof argument === "symbol") {
      return argument.toString()
    }

    try {
      return JSON.stringify(argument)
    } catch {
      try {
        return String(argument)
      } catch {
        return "[Unserializable argument]"
      }
    }
  }

  private emitLogEntry(level: LogLevel, levelName: string, message: string, args: unknown[]): void {
    if (this.logEntryListeners.size === 0) {
      return
    }

    // Build a stable log entry shape for the UI logger sink.
    const now = new Date()
    const timestampMs = now.getTime()
    const entry: LogEntry = {
      id: Logger.buildLogEntryId(timestampMs),
      timestampMs,
      timestampIso: now.toISOString(),
      level,
      levelName,
      loggerName: this.name,
      message: message ?? "",
      argumentSummaries: args.map(Logger.formatLogArgumentForStorage),
    }

    for (const listener of this.logEntryListeners) {
      try {
        listener(entry)
      } catch {
        // Never allow logging observers to break runtime logging.
      }
    }
  }

  registerLogEntryListener(listener: LogEntryListener): void {
    this.logEntryListeners.add(listener)
  }

  unregisterLogEntryListener(listener: LogEntryListener): void {
    this.logEntryListeners.delete(listener)
  }

  private logMessage(
    level: LogLevel,
    levelName: string,
    consoleMethod: (...data: any[]) => void,
    message: string,
    ...args: any[]
  ): void {
    if (!this.shouldLog(level)) return

    const msg = message ?? ""
    const backgroundColor = Logger.getColorForString(msg)

    // Capture the current time up front so every argument in this call references the same instant.
    const now = new Date()
    // Format the timestamp using the user's locale preferences so we respect 12/24-hour expectations automatically.
    const timestamp = Logger.formatTimestamp(now)
    // Build the label that sits inside the colored badge; this keeps the timestamp visually grouped with level metadata.
    const label = `[${timestamp} ${this.name}-${levelName}]`
    const icon = level === LogLevel.DEBUG ? "🐞" : "ℹ️"

    consoleMethod(
      `%c${icon} ${label}%c ${msg}`,
      Logger.getBoxStyle(level, backgroundColor),
      Logger.getMessageStyle(level, levelName),
      ...args
    )

    this.emitLogEntry(level, levelName, msg, args)
  }

  log(message: string, ...args: any[]): void {
    this.logMessage(LogLevel.LOG, "LOG", console.log, message, ...args)
  }

  info(message: string, ...args: any[]): void {
    this.logMessage(LogLevel.INFO, "INFO", console.info, message, ...args)
  }

  warn(message: string, ...args: any[]): void {
    this.logMessage(LogLevel.WARN, "WARN", console.warn, message, ...args)
  }

  error(message: string, ...args: any[]): void {
    this.logMessage(LogLevel.ERROR, "ERROR", console.error, message, ...args)
  }

  debug(message: string, ...args: any[]): void {
    this.logMessage(LogLevel.DEBUG, "DEBUG", console.log, message, ...args)
  }

  temp(message: string, ...args: any[]): void {
    this.logMessage(LogLevel.INFO, "TEMP", console.log, message, ...args)
  }
}

// Create a default logger instance
const defaultLogger = new Logger("CLIENT")

// Export the default logger instance
export const logger = defaultLogger

// Export utility functions that delegate to the default logger
export function setLogLevel(level: LogLevel): void {
  defaultLogger.setLogLevel(level)
}

export function getLogLevel(): LogLevel {
  return defaultLogger.getLogLevel()
}

export function registerLogEntryListener(listener: LogEntryListener): void {
  defaultLogger.registerLogEntryListener(listener)
}

export function unregisterLogEntryListener(listener: LogEntryListener): void {
  defaultLogger.unregisterLogEntryListener(listener)
}
