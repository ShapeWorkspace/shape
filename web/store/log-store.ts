import { create, StoreApi, UseBoundStore } from "zustand"
import { LogEntry, registerLogEntryListener } from "../../engine/utils/logger"

// Type declaration for Vite's HMR data storage
type LogStoreHook = UseBoundStore<StoreApi<LogStore>>

declare global {
  interface ImportMetaHotData {
    logStore?: LogStoreHook
  }
}

const MAX_LOG_ENTRIES_TO_KEEP = 500

const buildLogEntryExportLine = (entry: LogEntry): string => {
  const argumentSummary = entry.argumentSummaries.length > 0 ? ` | ${entry.argumentSummaries.join(" | ")}` : ""
  return `${entry.timestampIso} [${entry.loggerName}:${entry.levelName}] ${entry.message}${argumentSummary}`
}

const buildLogExportPayload = (entries: LogEntry[]): string => {
  return entries.map(buildLogEntryExportLine).join("\n")
}

interface LogStoreState {
  logEntries: LogEntry[]
  isLogListenerRegistered: boolean
}

interface LogStoreActions {
  initializeLogListener: () => void
  clearLogEntries: () => void
  buildClipboardLogExport: () => string
}

export type LogStore = LogStoreState & LogStoreActions

/**
 * LogStore holds a rolling in-memory buffer of client logs for diagnostics.
 * The buffer is sourced from the engine logger via a listener registration.
 */
const createLogStore = () =>
  create<LogStore>((set, get) => {
    let activeLogEntryListener: ((entry: LogEntry) => void) | null = null

    const appendLogEntryToBuffer = (entry: LogEntry): void => {
      set(state => {
        const nextEntries = [...state.logEntries, entry]
        const trimmedEntries =
          nextEntries.length > MAX_LOG_ENTRIES_TO_KEEP
            ? nextEntries.slice(nextEntries.length - MAX_LOG_ENTRIES_TO_KEEP)
            : nextEntries
        return { logEntries: trimmedEntries }
      })
    }

    const registerLoggerListener = (): void => {
      if (activeLogEntryListener) {
        return
      }

      // Keep a stable reference so unregistering works reliably across HMR swaps.
      activeLogEntryListener = entry => {
        appendLogEntryToBuffer(entry)
      }

      registerLogEntryListener(activeLogEntryListener)
    }

    return {
      logEntries: [],
      isLogListenerRegistered: false,

      initializeLogListener: () => {
        const { isLogListenerRegistered } = get()
        if (isLogListenerRegistered) {
          return
        }

        registerLoggerListener()
        set({ isLogListenerRegistered: true })
      },

      clearLogEntries: () => {
        set({ logEntries: [] })
      },

      buildClipboardLogExport: () => {
        const { logEntries } = get()
        return buildLogExportPayload(logEntries)
      },
    }
  })

/**
 * HMR Preservation: Reuse existing store instance during hot reloads
 * to prevent listener re-registration and duplicate logs.
 */
export const useLogStore: LogStoreHook = import.meta.hot?.data?.logStore ?? createLogStore()

if (import.meta.hot) {
  import.meta.hot.data.logStore = useLogStore
}
