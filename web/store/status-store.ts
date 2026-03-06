import { create, StoreApi, UseBoundStore } from "zustand"

// Type declaration for Vite's HMR data storage
type StatusStoreHook = UseBoundStore<StoreApi<StatusStore>>

declare global {
  interface ImportMetaHotData {
    statusStore?: StatusStoreHook
  }
}

export type StatusVariant = "info" | "warning" | "error" | "success"

export interface StatusItem {
  id: string
  message: string
  variant: StatusVariant
  isDismissible: boolean
}

interface StatusState {
  statuses: StatusItem[]
}

interface StatusActions {
  upsertStatus: (status: StatusItem) => void
  removeStatus: (statusId: string) => void
  clearStatuses: () => void
}

export type StatusStore = StatusState & StatusActions

/**
 * StatusStore tracks persistent status messages shown in the global status bar.
 * It supports updates by ID so long-running tasks can keep a single row fresh.
 */
const createStatusStore = () =>
  create<StatusStore>(set => ({
    statuses: [],

    upsertStatus: (status: StatusItem) => {
      set(state => {
        const existingIndex = state.statuses.findIndex(existing => existing.id === status.id)
        if (existingIndex >= 0) {
          const nextStatuses = [...state.statuses]
          nextStatuses[existingIndex] = status
          return { statuses: nextStatuses }
        }
        return { statuses: [...state.statuses, status] }
      })
    },

    removeStatus: (statusId: string) => {
      set(state => ({
        statuses: state.statuses.filter(status => status.id !== statusId),
      }))
    },

    clearStatuses: () => {
      set({ statuses: [] })
    },
  }))

/**
 * HMR Preservation: Reuse existing store instance during hot reloads
 * to prevent status rows from flashing.
 */
export const useStatusStore: StatusStoreHook =
  import.meta.hot?.data?.statusStore ?? createStatusStore()

if (import.meta.hot) {
  import.meta.hot.data.statusStore = useStatusStore
}
