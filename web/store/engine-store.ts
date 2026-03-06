import { create, StoreApi, UseBoundStore } from "zustand"
import { GlobalClient } from "../../engine/global/global-client"
import { WorkspaceRuntime } from "@shape/engine/workspace-runtime/workspace-runtime"
import { initializeGlobalClient } from "../setup/clientInitializer"
import { getSearchWorker, terminateSearchWorker } from "../../engine/workers/search/search-worker-client"
import { LOCAL_ANONYMOUS_WORKSPACE_USER_ID } from "../../engine/models/workspace"
import { registerTauriPushNotifications } from "../utils/tauri-push-notifications"
import { setupDesktopNotificationsFromSse } from "../utils/tauri-desktop-notifications"
import { useStatusStore } from "./status-store"
import { AccountStore } from "../../engine/store/account-store"
import type { StorageProvider } from "../../engine/storage/storage-provider"
import type { SyncResult } from "../../engine/usecase/entities/entities"

type EngineStoreHook = UseBoundStore<StoreApi<EngineStore>>

declare global {
  interface ImportMetaHotData {
    engineStore?: EngineStoreHook
  }
}

interface EngineState {
  globalClient: GlobalClient | null
  storageProvider: StorageProvider | null
  application: WorkspaceRuntime | null
  isInitialized: boolean
  isInitializing: boolean
}

interface EngineActions {
  initializeGlobalClient: () => Promise<void>
  createWorkspaceScopedApplication: (
    workspaceId: string,
    options?: { isWorkspaceRegisteredWithServer?: boolean; accountId?: string }
  ) => Promise<void>
  destroyApplication: () => void
}

export type EngineStore = EngineState & EngineActions

// Sync status indicator — shows a status bar message during long syncs or on failure.
const buildSyncStatusId = (workspaceId: string) => `sync-status-${workspaceId}`
const SYNC_STATUS_DELAY_MS = 1500
const syncStatusDelayTimers = new Map<string, ReturnType<typeof setTimeout>>()
const syncStatusIsActive = new Map<string, boolean>()

let applicationCreationAbortController: AbortController | null = null
let inProgressApplication: WorkspaceRuntime | null = null
let syncEventUnsubscribers: (() => void)[] = []

const clearSyncStatusDelay = (workspaceId: string) => {
  const timer = syncStatusDelayTimers.get(workspaceId)
  if (timer) {
    clearTimeout(timer)
    syncStatusDelayTimers.delete(workspaceId)
  }
}

const handleSyncStarted = (workspaceId: string) => {
  const { upsertStatus } = useStatusStore.getState()
  const statusId = buildSyncStatusId(workspaceId)

  syncStatusIsActive.set(workspaceId, true)

  if (!syncStatusDelayTimers.has(workspaceId)) {
    const timer = setTimeout(() => {
      syncStatusDelayTimers.delete(workspaceId)
      if (!syncStatusIsActive.get(workspaceId)) {
        return
      }
      upsertStatus({
        id: statusId,
        message: "Syncing workspace data...",
        variant: "info",
        isDismissible: false,
      })
    }, SYNC_STATUS_DELAY_MS)
    syncStatusDelayTimers.set(workspaceId, timer)
  }
}

const handleSyncCompleted = (workspaceId: string, result: SyncResult) => {
  const { upsertStatus, removeStatus } = useStatusStore.getState()
  const statusId = buildSyncStatusId(workspaceId)

  syncStatusIsActive.set(workspaceId, false)
  clearSyncStatusDelay(workspaceId)

  if (!result.success) {
    upsertStatus({
      id: statusId,
      message: "Sync failed - retrying when possible.",
      variant: "error",
      isDismissible: true,
    })
    return
  }

  removeStatus(statusId)
}

const subscribeSyncEvents = (app: WorkspaceRuntime) => {
  const eventBus = app.getEventBus()
  const workspaceId = app.workspaceId

  const unsubStart = eventBus.subscribe(eventBus.EVENTS.SYNC_STARTED, () => {
    handleSyncStarted(workspaceId)
  })
  const unsubComplete = eventBus.subscribe(eventBus.EVENTS.SYNC_COMPLETED, (result: SyncResult) => {
    handleSyncCompleted(workspaceId, result)
  })

  syncEventUnsubscribers = [unsubStart, unsubComplete]
}

const teardownSyncEvents = (workspaceId: string) => {
  for (const unsub of syncEventUnsubscribers) {
    unsub()
  }
  syncEventUnsubscribers = []
  useStatusStore.getState().removeStatus(buildSyncStatusId(workspaceId))
  clearSyncStatusDelay(workspaceId)
}

const createEngineStore = () =>
  create<EngineStore>((set, get) => ({
    globalClient: null,
    storageProvider: null,
    application: null,
    isInitialized: false,
    isInitializing: false,

    initializeGlobalClient: async () => {
      const { isInitialized, isInitializing } = get()
      if (isInitialized || isInitializing) {
        return
      }

      set({ isInitializing: true })

      try {
        const { client, storage } = await initializeGlobalClient()
        set({ globalClient: client, storageProvider: storage, isInitialized: true, isInitializing: false })
      } catch (error) {
        console.error("Failed to initialize global client:", error)
        set({ isInitializing: false })
        throw error
      }
    },

    createWorkspaceScopedApplication: async (
      workspaceId: string,
      options?: { isWorkspaceRegisteredWithServer?: boolean; accountId?: string }
    ) => {
      if (applicationCreationAbortController) {
        applicationCreationAbortController.abort()
      }
      if (inProgressApplication) {
        inProgressApplication.destroy()
        inProgressApplication = null
      }
      applicationCreationAbortController = new AbortController()
      const abortSignal = applicationCreationAbortController.signal

      const { globalClient, storageProvider, application } = get()
      if (!globalClient) {
        throw new Error("GlobalClient not initialized")
      }
      if (!storageProvider) {
        throw new Error("StorageProvider not initialized")
      }

      const isWorkspaceRegisteredWithServer = options?.isWorkspaceRegisteredWithServer ?? true
      const resolvedAccountId = options?.accountId?.trim() ?? ""
      const isWorkspaceRegisteredWithServerAndAuthenticated =
        isWorkspaceRegisteredWithServer &&
        resolvedAccountId.length > 0 &&
        resolvedAccountId !== LOCAL_ANONYMOUS_WORKSPACE_USER_ID

      const requiredIdentityUserId = isWorkspaceRegisteredWithServerAndAuthenticated
        ? resolvedAccountId
        : LOCAL_ANONYMOUS_WORKSPACE_USER_ID

      // Skip if already have an Application for this workspace with matching state.
      if (application && application.workspaceId === workspaceId) {
        const existingIsRegistered = application.isWorkspaceRemote()
        const nextIsRegistered = isWorkspaceRegisteredWithServerAndAuthenticated
        const existingIdentityUserId = application.getAccountUserId()
        if (existingIsRegistered === nextIsRegistered && existingIdentityUserId === requiredIdentityUserId) {
          return
        }
      }

      if (application) {
        teardownSyncEvents(application.workspaceId)
        // Clear from state before destroying so hooks don't call into a deinitialized container.
        set({ application: null })
        application.destroy()
        terminateSearchWorker()
      }

      if (abortSignal.aborted) {
        return
      }

      const searchIndex = await getSearchWorker(workspaceId)
      if (!searchIndex) {
        throw new Error("Search worker failed to initialize")
      }

      if (abortSignal.aborted) {
        terminateSearchWorker()
        return
      }

      const accountStoreContainer = globalClient.getAccountStoreContainer()
      let accountStore: AccountStore
      if (isWorkspaceRegisteredWithServerAndAuthenticated) {
        const existingAccountStore = accountStoreContainer.getAccountStore(resolvedAccountId)
        if (!existingAccountStore) {
          throw new Error("Account store not available - account is required for server workspaces")
        }
        accountStore = existingAccountStore
      } else {
        accountStore = accountStoreContainer.getOrCreateLocalAccountStore()
      }

      const newApplication = new WorkspaceRuntime(
        workspaceId,
        globalClient.getCrypto(),
        accountStore,
        globalClient.getWorkspaceStore(),
        globalClient.getOfflineDatabase(),
        storageProvider,
        searchIndex,
        isWorkspaceRegisteredWithServerAndAuthenticated
      )

      inProgressApplication = newApplication
      subscribeSyncEvents(newApplication)

      try {
        await newApplication.initialize()
      } catch (error) {
        if (abortSignal.aborted) {
          inProgressApplication = null
          teardownSyncEvents(workspaceId)
          newApplication.destroy()
          terminateSearchWorker()
          return
        }
        inProgressApplication = null
        throw error
      }

      if (abortSignal.aborted) {
        inProgressApplication = null
        teardownSyncEvents(workspaceId)
        newApplication.destroy()
        terminateSearchWorker()
        return
      }

      if (isWorkspaceRegisteredWithServerAndAuthenticated) {
        void registerTauriPushNotifications(newApplication.getNotificationService())
      }

      if (isWorkspaceRegisteredWithServerAndAuthenticated) {
        const memberManager = newApplication.getWorkspaceMemberManager()
        setupDesktopNotificationsFromSse(newApplication.getNotificationService(), userId => {
          const members = memberManager.getWorkspaceMembers()
          const member = members.find(m => m.userId === userId)
          return member?.displayName ?? "Someone"
        })
      }

      inProgressApplication = null
      set({ application: newApplication })
    },

    destroyApplication: () => {
      const { application } = get()
      if (application) {
        teardownSyncEvents(application.workspaceId)
        application.destroy()
        terminateSearchWorker()
        set({ application: null })
      }
    },
  }))

export const useEngineStore: EngineStoreHook = import.meta.hot?.data?.engineStore ?? createEngineStore()

if (import.meta.hot) {
  import.meta.hot.data.engineStore = useEngineStore
}
