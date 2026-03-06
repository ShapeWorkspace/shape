import { create } from "zustand"
import type { StoreApi, UseBoundStore } from "zustand"
import { useEngineStore } from "./engine-store"
import { useWindowStore } from "./window-store"
import { WorkspaceInfo } from "./types"
import { useStatusStore } from "./status-store"
import { STORE_NAMES } from "../../engine/repositories/schema"
import { logger } from "../../engine/utils/logger"
import { buildWorkspaceEntryKey } from "../../engine/store/workspace-store"
import { LOCAL_ANONYMOUS_WORKSPACE_USER_ID } from "../../engine/models/workspace"
import { Workspace } from "../../engine/models/workspace"

// Type declaration for Vite's HMR data storage
declare global {
  interface ImportMetaHotData {
    workspaceStore?: UseBoundStore<StoreApi<WorkspaceStore>>
  }
}

/**
 * WorkspaceStore manages workspace selection and creation.
 * Depends on EngineStore for GlobalClient and Application lifecycle.
 */
interface WorkspaceState {
  workspaces: WorkspaceInfo[]
  currentWorkspace: WorkspaceInfo | null
  isLoadingWorkspaces: boolean
  workspacesLoaded: boolean
  // Track local workspace registrations in-flight to block UI interactions during auth flows.
  registeringWorkspaceIds: string[]
}

interface WorkspaceActions {
  // Fetch all workspaces for the authenticated user
  fetchWorkspaces: () => Promise<void>
  // Force refresh workspaces from server (bypasses loaded check)
  refreshWorkspaces: () => Promise<void>
  // Select an existing workspace by ID (async to initialize search worker)
  selectWorkspace: (workspaceId: string, accountId?: string) => Promise<void>
  // Create a new workspace and select it
  createWorkspace: (name: string, options?: { accountId?: string }) => Promise<WorkspaceInfo>
  // Create a local-only workspace for anonymous usage
  createLocalWorkspace: (name?: string) => Promise<WorkspaceInfo>
  // Register an existing local workspace on the server
  registerExistingWorkspaceWithServer: (
    workspaceId: string,
    accountId: string,
    options?: { shouldRetryOnFailure?: boolean }
  ) => Promise<WorkspaceInfo>
  // Check if a local workspace has any data (entities or drafts)
  localWorkspaceHasData: (workspaceId: string) => Promise<boolean>
  // Remove a workspace from local storage
  removeWorkspace: (workspaceId: string, accountId?: string) => Promise<void>
  // Rename a workspace (local or server-backed)
  renameWorkspace: (workspaceId: string, name: string, accountId?: string) => Promise<void>
  // Hydrate workspace state from existing session (called on app init)
  hydrateFromSession: (options?: { allowLocalWorkspaceAutoCreate?: boolean }) => Promise<void>
  // Sync workspace state from the GlobalWorkspaceManager (no network fetch)
  syncWorkspaceStateFromManager: () => void
  // Resume registration for any local workspaces after authentication
  resumePendingWorkspaceRegistration: (options?: {
    // When true, register local workspaces even if they are empty (used for signup).
    shouldRegisterEmptyLocalWorkspaces?: boolean
    accountId?: string
  }) => Promise<void>
  // Clear workspace state (called on logout)
  clearWorkspaces: () => void
}

export type WorkspaceStore = WorkspaceState & WorkspaceActions

const DEFAULT_LOCAL_WORKSPACE_NAME = "Untitled Workspace"
const WORKSPACE_REGISTRATION_RETRY_DELAY_MS = 15000

const workspaceRegistrationPromises = new Map<string, Promise<WorkspaceInfo>>()
const workspaceRegistrationRetryTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
const workspaceSelectionPromises = new Map<string, Promise<void>>()

const buildWorkspaceRegistrationStatusId = (workspaceId: string) => `workspace-registration-${workspaceId}`

const mergeWorkspaceInfos = (existing: WorkspaceInfo[], incoming: WorkspaceInfo[]): WorkspaceInfo[] => {
  // Keep newly created workspaces even if a concurrent fetch returns stale data.
  const merged = new Map<string, WorkspaceInfo>()
  existing.forEach(workspace => {
    merged.set(workspace.workspaceEntryId, workspace)
  })
  incoming.forEach(workspace => {
    merged.set(workspace.workspaceEntryId, workspace)
  })
  return Array.from(merged.values())
}

const localWorkspaceDataStoreNames = [
  STORE_NAMES.ENTITY,
  STORE_NAMES.BLOCK,
  STORE_NAMES.DRAFT,
  STORE_NAMES.DRAFT_BLOCK,
  STORE_NAMES.ENTITY_LINK,
]

const isWorkspaceRegisteredForAccount = (workspace: Workspace): boolean =>
  workspace.isRegisteredWithServer === true && workspace.userId !== LOCAL_ANONYMOUS_WORKSPACE_USER_ID

const mapWorkspaceToInfo = (workspace: Workspace, accountEmail: string | null): WorkspaceInfo => ({
  uuid: workspace.uuid,
  name: workspace.name,
  subdomain: workspace.subdomain,
  // Treat missing registration flags as false and never mark local-anonymous entries as registered.
  isRegisteredWithServer: isWorkspaceRegisteredForAccount(workspace),
  workspaceEntryId: buildWorkspaceEntryKey(workspace.uuid, workspace.userId),
  accountId: workspace.userId,
  accountEmail,
})

/**
 * Factory function to create the workspace store.
 * Separated to enable HMR state preservation.
 */
const createWorkspaceStore = (): UseBoundStore<StoreApi<WorkspaceStore>> =>
  create<WorkspaceStore>((set, get) => ({
    workspaces: [],
    currentWorkspace: null,
    isLoadingWorkspaces: false,
    workspacesLoaded: false,
    registeringWorkspaceIds: [],

    fetchWorkspaces: async () => {
      const { globalClient } = useEngineStore.getState()
      if (!globalClient) {
        throw new Error("Client not initialized")
      }

      // Prevent duplicate fetches
      const { workspacesLoaded, isLoadingWorkspaces } = get()
      if (workspacesLoaded || isLoadingWorkspaces) {
        return
      }

      set({ isLoadingWorkspaces: true })

      try {
        const fetchAllWorkspaces = globalClient.getFetchAllWorkspaces()
        const result = await fetchAllWorkspaces.execute()
        if (result.isFailed()) {
          throw new Error(result.getError())
        }

        const usersStore = globalClient.getUsersStore()
        const workspaceStore = globalClient.getWorkspaceStore()
        const workspaceInfos: WorkspaceInfo[] = workspaceStore
          .getAllWorkspaces()
          .map(workspace =>
            mapWorkspaceToInfo(workspace, usersStore.getUserByUuid(workspace.userId)?.email ?? null)
          )
        set(state => ({
          workspaces: mergeWorkspaceInfos(state.workspaces, workspaceInfos),
          workspacesLoaded: true,
          isLoadingWorkspaces: false,
        }))
      } catch (error) {
        set({ isLoadingWorkspaces: false })
        throw error
      }
    },

    refreshWorkspaces: async () => {
      const { globalClient } = useEngineStore.getState()
      if (!globalClient) {
        throw new Error("Client not initialized")
      }

      // Wait for any in-progress fetch to complete, then proceed with our own fetch.
      // This ensures we always get the most up-to-date data after this call returns.
      while (get().isLoadingWorkspaces) {
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      set({ isLoadingWorkspaces: true })

      try {
        const fetchAllWorkspaces = globalClient.getFetchAllWorkspaces()
        const result = await fetchAllWorkspaces.execute()
        if (result.isFailed()) {
          throw new Error(result.getError())
        }

        const usersStore = globalClient.getUsersStore()
        const workspaceStore = globalClient.getWorkspaceStore()
        const workspaceInfos: WorkspaceInfo[] = workspaceStore
          .getAllWorkspaces()
          .map(workspace =>
            mapWorkspaceToInfo(workspace, usersStore.getUserByUuid(workspace.userId)?.email ?? null)
          )
        set(state => ({
          workspaces: mergeWorkspaceInfos(state.workspaces, workspaceInfos),
          workspacesLoaded: true,
          isLoadingWorkspaces: false,
        }))
      } catch (error) {
        set({ isLoadingWorkspaces: false })
        throw error
      }
    },

    selectWorkspace: async (workspaceId: string, accountId?: string) => {
      const { globalClient } = useEngineStore.getState()
      if (!globalClient) {
        throw new Error("Client not initialized")
      }

      const workspaceStore = globalClient.getWorkspaceStore()
      let workspace = accountId
        ? workspaceStore.getWorkspaceByUuid(workspaceId, accountId)
        : workspaceStore.getWorkspaceByUuid(workspaceId)

      if (!workspace && accountId) {
        workspace = workspaceStore.getWorkspaceByUuid(workspaceId)
      }

      if (!workspace) {
        return
      }

      const workspaceEntryId = buildWorkspaceEntryKey(workspace.uuid, workspace.userId)
      const existingSelection = workspaceSelectionPromises.get(workspaceEntryId)
      if (existingSelection) {
        await existingSelection
        return
      }

      // De-dupe concurrent selection requests (e.g. route guard + UI click).
      const selectionPromise = (async () => {
        const { createWorkspaceScopedApplication } = useEngineStore.getState()
        const { currentWorkspaceId, saveWindowsForWorkspace, resetWindowsForWorkspace } =
          useWindowStore.getState()

        const usersStore = globalClient.getUsersStore()
        const accountStoreContainer = globalClient.getAccountStoreContainer()
        const accountEmail = usersStore.getUserByUuid(workspace.userId)?.email ?? null
        const accountStore = accountStoreContainer.getAccountStore(workspace.userId)
        const shouldEnableServerFeatures =
          isWorkspaceRegisteredForAccount(workspace) && !!accountStore?.getIdentityKeys()

        // Save current workspace's windows before switching
        if (currentWorkspaceId && currentWorkspaceId !== workspaceId) {
          saveWindowsForWorkspace(currentWorkspaceId)
        }

        // Always reset navigation state before updating currentWorkspace to avoid URL sync
        // using the previous workspace's window stack.
        resetWindowsForWorkspace(workspaceId)

        workspaceStore.setCurrentWorkspace(workspace)
        await workspaceStore.persistWorkspaceSnapshot(workspace)

        const workspaceInfo = mapWorkspaceToInfo(workspace, accountEmail)
        set(state => {
          const existingIndex = state.workspaces.findIndex(
            existing => existing.workspaceEntryId === workspaceInfo.workspaceEntryId
          )
          if (existingIndex >= 0) {
            const nextWorkspaces = [...state.workspaces]
            nextWorkspaces[existingIndex] = workspaceInfo
            return { currentWorkspace: workspaceInfo, workspaces: nextWorkspaces }
          }
          return { currentWorkspace: workspaceInfo, workspaces: [...state.workspaces, workspaceInfo] }
        })

        // Create workspace-scoped Application with E2EE services and search indexing
        await createWorkspaceScopedApplication(workspaceId, {
          // Use the resolved registration flag to prevent local-anonymous entries from
          // enabling server-only services like notifications or SSE.
          isWorkspaceRegisteredWithServer: shouldEnableServerFeatures,
          accountId: workspace.userId,
        })
      })()

      workspaceSelectionPromises.set(workspaceEntryId, selectionPromise)

      try {
        await selectionPromise
      } finally {
        workspaceSelectionPromises.delete(workspaceEntryId)
      }
    },

    createWorkspace: async (name: string, options?: { accountId?: string }) => {
      const { globalClient } = useEngineStore.getState()
      const { createWorkspaceScopedApplication } = useEngineStore.getState()
      const { currentWorkspaceId, saveWindowsForWorkspace, loadWindowsForWorkspace } =
        useWindowStore.getState()

      if (!globalClient) {
        throw new Error("Client not initialized")
      }

      const usersStore = globalClient.getUsersStore()
      const accountStoreContainer = globalClient.getAccountStoreContainer()
      const accounts = usersStore.getUsers()
      const fallbackAccountId =
        accounts.length === 1 ? accounts[0].uuid : (get().currentWorkspace?.accountId ?? "")
      const resolvedAccountId = options?.accountId ?? fallbackAccountId

      if (!resolvedAccountId) {
        throw new Error("Account selection required to create a workspace")
      }

      const accountStore = accountStoreContainer.getAccountStore(resolvedAccountId)
      if (!accountStore) {
        throw new Error("Account store not available - user must be logged in")
      }
      const identityKeys = accountStore.getIdentityKeys()
      if (!identityKeys) {
        throw new Error("User identity keys not available - user must be logged in")
      }

      // Save current workspace's windows before switching
      if (currentWorkspaceId) {
        saveWindowsForWorkspace(currentWorkspaceId)
      }

      const createWorkspaceUsecase = globalClient.getCreateWorkspace()
      const result = await createWorkspaceUsecase.execute(name, accountStore, identityKeys)
      if (result.isFailed()) {
        throw new Error(result.getError())
      }
      const workspace = result.getValue()

      const workspaceInfo = mapWorkspaceToInfo(
        workspace,
        usersStore.getUserByUuid(resolvedAccountId)?.email ?? null
      )

      // Add to workspaces list and set as current
      set(state => ({
        workspaces: [...state.workspaces, workspaceInfo],
        currentWorkspace: workspaceInfo,
      }))

      // Load windows for the new workspace (will be empty, starts fresh)
      loadWindowsForWorkspace(workspace.uuid)

      // Initialize the workspace Application in the background to keep the UI responsive.
      void createWorkspaceScopedApplication(workspace.uuid, {
        isWorkspaceRegisteredWithServer: true,
        accountId: resolvedAccountId,
      }).catch(error => {
        logger.error("Failed to initialize workspace after creation.", {
          workspaceId: workspace.uuid,
          accountId: resolvedAccountId,
          errorMessage: error instanceof Error ? error.message : "Unknown error",
        })
      })

      return workspaceInfo
    },

    createLocalWorkspace: async (name?: string) => {
      const { globalClient } = useEngineStore.getState()
      const { createWorkspaceScopedApplication } = useEngineStore.getState()
      const { currentWorkspaceId, saveWindowsForWorkspace, loadWindowsForWorkspace } =
        useWindowStore.getState()

      if (!globalClient) {
        throw new Error("Client not initialized")
      }

      const createLocalWorkspaceUsecase = globalClient.getCreateLocalWorkspace()
      const result = await createLocalWorkspaceUsecase.execute(name ?? DEFAULT_LOCAL_WORKSPACE_NAME)
      if (result.isFailed()) {
        throw new Error(result.getError())
      }
      const workspace = result.getValue()

      // Save current workspace windows before switching
      if (currentWorkspaceId && currentWorkspaceId !== workspace.uuid) {
        saveWindowsForWorkspace(currentWorkspaceId)
      }

      await createWorkspaceScopedApplication(workspace.uuid, {
        isWorkspaceRegisteredWithServer: false,
      })

      const workspaceInfo = mapWorkspaceToInfo(workspace, null)

      set(state => {
        const existingIndex = state.workspaces.findIndex(
          existing => existing.workspaceEntryId === workspaceInfo.workspaceEntryId
        )
        if (existingIndex >= 0) {
          const nextWorkspaces = [...state.workspaces]
          nextWorkspaces[existingIndex] = workspaceInfo
          return { workspaces: nextWorkspaces, currentWorkspace: workspaceInfo }
        }
        return { workspaces: [...state.workspaces, workspaceInfo], currentWorkspace: workspaceInfo }
      })

      loadWindowsForWorkspace(workspace.uuid)

      return workspaceInfo
    },

    registerExistingWorkspaceWithServer: async (
      workspaceId: string,
      accountId: string,
      options?: { shouldRetryOnFailure?: boolean }
    ) => {
      const existingPromise = workspaceRegistrationPromises.get(workspaceId)
      if (existingPromise) {
        return existingPromise
      }

      const registrationPromise = (async () => {
        // Mark workspace registration as in-flight to disable main content interactions.
        set(state => {
          if (state.registeringWorkspaceIds.includes(workspaceId)) {
            return state
          }
          return { registeringWorkspaceIds: [...state.registeringWorkspaceIds, workspaceId] }
        })

        const shouldRetryOnFailure = options?.shouldRetryOnFailure ?? true
        const { globalClient } = useEngineStore.getState()
        const { createWorkspaceScopedApplication } = useEngineStore.getState()
        const { loadWindowsForWorkspace } = useWindowStore.getState()

        if (!globalClient) {
          throw new Error("Client not initialized")
        }

        const usersStore = globalClient.getUsersStore()
        const workspaceStore = globalClient.getWorkspaceStore()
        const accountStoreContainer = globalClient.getAccountStoreContainer()

        let workspace = workspaceStore.getWorkspaceByUuid(workspaceId, accountId)
        if (!workspace) {
          workspace = workspaceStore.getWorkspaceByUuid(workspaceId)
        }
        if (!workspace) {
          throw new Error("Workspace not found")
        }

        const statusStore = useStatusStore.getState()
        const statusId = buildWorkspaceRegistrationStatusId(workspaceId)
        try {
          if (workspace.isRegisteredWithServer) {
            statusStore.removeStatus(statusId)
            return mapWorkspaceToInfo(workspace, usersStore.getUserByUuid(accountId)?.email ?? null)
          }

          const accountStore = accountStoreContainer.getAccountStore(accountId)
          if (!accountStore) {
            throw new Error("Account store not available - user must be logged in")
          }
          const identityKeys = accountStore.getIdentityKeys()
          if (!identityKeys) {
            throw new Error("User identity keys not available - user must be logged in")
          }

          const getLocalWorkspaceKey = globalClient.getGetLocalWorkspaceKey()
          const localKey = await getLocalWorkspaceKey.execute(workspaceId)
          if (!localKey) {
            throw new Error("Local workspace key not found")
          }

          statusStore.upsertStatus({
            id: statusId,
            message: `Registering workspace "${workspace.name}"...`,
            variant: "info",
            isDismissible: false,
          })

          try {
            const registerUsecase = globalClient.getRegisterExistingWorkspaceWithServer()
            const result = await registerUsecase.execute(
              workspaceId,
              workspace.name,
              localKey,
              accountStore,
              identityKeys
            )
            if (result.isFailed()) {
              throw new Error(result.getError())
            }
            const registeredWorkspace = result.getValue()

            await createWorkspaceScopedApplication(registeredWorkspace.uuid, {
              isWorkspaceRegisteredWithServer: true,
              accountId,
            })

            // Remove the anonymous local entry now that the workspace is registered,
            // so the workspace list doesn't show both local + registered versions.
            const removeWorkspaceModel = globalClient.getRemoveWorkspaceModel()
            await removeWorkspaceModel.execute(workspaceId, LOCAL_ANONYMOUS_WORKSPACE_USER_ID)

            const workspaceInfo = mapWorkspaceToInfo(
              registeredWorkspace,
              usersStore.getUserByUuid(accountId)?.email ?? null
            )

            set(state => {
              const workspacesWithoutAnonymousEntry = state.workspaces.filter(
                existing =>
                  !(
                    existing.uuid === workspaceInfo.uuid &&
                    existing.accountId === LOCAL_ANONYMOUS_WORKSPACE_USER_ID
                  )
              )
              const existingIndex = workspacesWithoutAnonymousEntry.findIndex(
                existing => existing.workspaceEntryId === workspaceInfo.workspaceEntryId
              )
              if (existingIndex >= 0) {
                const nextWorkspaces = [...workspacesWithoutAnonymousEntry]
                nextWorkspaces[existingIndex] = workspaceInfo
                return { workspaces: nextWorkspaces, currentWorkspace: workspaceInfo }
              }
              return {
                workspaces: [...workspacesWithoutAnonymousEntry, workspaceInfo],
                currentWorkspace: workspaceInfo,
              }
            })

            loadWindowsForWorkspace(registeredWorkspace.uuid)

            statusStore.removeStatus(statusId)

            const retryTimeout = workspaceRegistrationRetryTimeouts.get(workspaceId)
            if (retryTimeout) {
              clearTimeout(retryTimeout)
              workspaceRegistrationRetryTimeouts.delete(workspaceId)
            }

            return workspaceInfo
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error"
            logger.error("Workspace registration failed.", {
              workspaceId,
              workspaceName: workspace.name,
              errorMessage,
            })

            statusStore.upsertStatus({
              id: statusId,
              message: "Workspace registration failed - retrying soon.",
              variant: "error",
              isDismissible: true,
            })

            if (shouldRetryOnFailure && !workspaceRegistrationRetryTimeouts.has(workspaceId)) {
              const retryTimeout = setTimeout(() => {
                workspaceRegistrationRetryTimeouts.delete(workspaceId)
                // Retry registration with the same account context that initiated it.
                get()
                  .registerExistingWorkspaceWithServer(workspaceId, accountId, {
                    shouldRetryOnFailure: true,
                  })
                  .catch(() => {})
              }, WORKSPACE_REGISTRATION_RETRY_DELAY_MS)
              workspaceRegistrationRetryTimeouts.set(workspaceId, retryTimeout)
            }

            throw error
          }
        } finally {
          // Clear the in-flight marker even if registration fails (retry will re-add it).
          set(state => ({
            registeringWorkspaceIds: state.registeringWorkspaceIds.filter(id => id !== workspaceId),
          }))
        }
      })()

      workspaceRegistrationPromises.set(workspaceId, registrationPromise)

      try {
        return await registrationPromise
      } finally {
        workspaceRegistrationPromises.delete(workspaceId)
      }
    },

    localWorkspaceHasData: async (workspaceId: string) => {
      const { globalClient } = useEngineStore.getState()
      if (!globalClient) {
        throw new Error("Client not initialized")
      }

      const offlineDatabase = globalClient.getOfflineDatabase()

      for (const storeName of localWorkspaceDataStoreNames) {
        const records = await offlineDatabase.getAll<unknown>(workspaceId, storeName)
        if (records.length > 0) {
          return true
        }
      }

      return false
    },

    removeWorkspace: async (workspaceId: string, accountId?: string) => {
      const { globalClient } = useEngineStore.getState()
      if (!globalClient) {
        throw new Error("Client not initialized")
      }

      const workspaceStore = globalClient.getWorkspaceStore()
      const workspace = accountId
        ? workspaceStore.getWorkspaceByUuid(workspaceId, accountId)
        : workspaceStore.getWorkspaceByUuid(workspaceId)
      const workspaceEntryId = workspace ? buildWorkspaceEntryKey(workspace.uuid, workspace.userId) : null

      const removeWorkspaceModel = globalClient.getRemoveWorkspaceModel()
      await removeWorkspaceModel.execute(workspaceId, accountId)

      set(state => {
        const nextWorkspaces = workspaceEntryId
          ? state.workspaces.filter(entry => entry.workspaceEntryId !== workspaceEntryId)
          : state.workspaces.filter(entry => entry.uuid !== workspaceId)
        const nextCurrentWorkspace =
          state.currentWorkspace?.workspaceEntryId === workspaceEntryId ? null : state.currentWorkspace
        return {
          workspaces: nextWorkspaces,
          currentWorkspace: nextCurrentWorkspace,
        }
      })
    },

    renameWorkspace: async (workspaceId: string, name: string, accountId?: string) => {
      const trimmedName = name.trim()
      if (!trimmedName) {
        throw new Error("Workspace name cannot be empty")
      }

      const { globalClient, application } = useEngineStore.getState()
      if (!globalClient) {
        throw new Error("Client not initialized")
      }

      const workspaceStore = globalClient.getWorkspaceStore()
      const workspace = accountId
        ? workspaceStore.getWorkspaceByUuid(workspaceId, accountId)
        : workspaceStore.getWorkspaceByUuid(workspaceId)
      if (!workspace) {
        throw new Error("Workspace not found")
      }

      let updatedWorkspace = workspace

      if (workspace.isRegisteredWithServer) {
        if (!application) {
          throw new Error("Workspace application not initialized")
        }
        const updateResult = await application.getUpdateWorkspace().execute({
          workspaceId,
          attributes: { name: trimmedName },
        })
        if (updateResult.isFailed()) {
          throw new Error(`Failed to rename workspace: ${updateResult.getError()}`)
        }
        updatedWorkspace = updateResult.getValue()
        const updateWorkspaceModel = globalClient.getUpdateWorkspaceModel()
        updateWorkspaceModel.execute(updatedWorkspace)
      } else {
        const renameLocalWorkspace = globalClient.getRenameLocalWorkspace()
        const result = renameLocalWorkspace.execute(workspaceId, trimmedName)
        if (result.isFailed()) {
          throw new Error(`Failed to rename local workspace: ${result.getError()}`)
        }
        // Result is checked as successful above, so getValue() is guaranteed to return a value.
        updatedWorkspace = result.getValue()!
      }

      const usersStore = globalClient.getUsersStore()
      const workspaceInfo = mapWorkspaceToInfo(
        updatedWorkspace,
        usersStore.getUserByUuid(updatedWorkspace.userId)?.email ?? null
      )

      set(state => {
        const nextWorkspaces = state.workspaces.map(existing =>
          existing.workspaceEntryId === workspaceInfo.workspaceEntryId ? workspaceInfo : existing
        )
        const nextCurrentWorkspace =
          state.currentWorkspace?.workspaceEntryId === workspaceInfo.workspaceEntryId
            ? workspaceInfo
            : state.currentWorkspace
        return {
          workspaces: nextWorkspaces,
          currentWorkspace: nextCurrentWorkspace,
        }
      })
    },

    hydrateFromSession: async (options?: { allowLocalWorkspaceAutoCreate?: boolean }) => {
      const { globalClient } = useEngineStore.getState()
      const { createWorkspaceScopedApplication } = useEngineStore.getState()
      const { loadWindowsForWorkspace } = useWindowStore.getState()

      if (!globalClient) {
        return
      }

      const workspaceStore = globalClient.getWorkspaceStore()
      const usersStore = globalClient.getUsersStore()
      const allowLocalWorkspaceAutoCreate = options?.allowLocalWorkspaceAutoCreate ?? true
      const hasAuthenticatedAccounts = usersStore.hasUsers()

      let currentWorkspace = workspaceStore.getCurrentWorkspace()
      let allWorkspaces = workspaceStore.getAllWorkspaces()

      if (!hasAuthenticatedAccounts && allowLocalWorkspaceAutoCreate) {
        if (allWorkspaces.length === 0) {
          const createLocalWorkspace = globalClient.getCreateLocalWorkspace()
          const result = await createLocalWorkspace.execute(DEFAULT_LOCAL_WORKSPACE_NAME)
          if (!result.isFailed()) {
            currentWorkspace = result.getValue()!
            allWorkspaces = workspaceStore.getAllWorkspaces()
          }
        } else if (!currentWorkspace) {
          currentWorkspace = allWorkspaces[0]
          workspaceStore.setCurrentWorkspace(currentWorkspace)
        }
      }

      // Convert engine Workspace models to WorkspaceInfo for the UI
      const workspaceInfos: WorkspaceInfo[] = allWorkspaces.map(workspace =>
        mapWorkspaceToInfo(workspace, usersStore.getUserByUuid(workspace.userId)?.email ?? null)
      )

      const currentWorkspaceInfo: WorkspaceInfo | null = currentWorkspace
        ? mapWorkspaceToInfo(
            currentWorkspace,
            usersStore.getUserByUuid(currentWorkspace.userId)?.email ?? null
          )
        : null

      // Create workspace-scoped Application with E2EE services and search indexing
      if (currentWorkspace) {
        await createWorkspaceScopedApplication(currentWorkspace.uuid, {
          // Never treat local-anonymous entries as registered workspaces.
          isWorkspaceRegisteredWithServer: isWorkspaceRegisteredForAccount(currentWorkspace),
          accountId: currentWorkspace.userId,
        })
        // Load persisted windows for this workspace
        loadWindowsForWorkspace(currentWorkspace.uuid)
      }

      // Note: we don't set workspacesLoaded here because this is from cache,
      // not a fresh server fetch. workspacesLoaded guards against duplicate fetches.
      set({
        workspaces: workspaceInfos,
        currentWorkspace: currentWorkspaceInfo,
      })

      // Subscribe to workspace changes from the WorkspaceStore
      // Note: This is a long-lived subscription; unsubscribe function is not stored
      // since the store persists for the entire session.
      workspaceStore.onCurrentWorkspaceChange(workspace => {
        const wsInfo: WorkspaceInfo | null = workspace
          ? mapWorkspaceToInfo(workspace, usersStore.getUserByUuid(workspace.userId)?.email ?? null)
          : null
        set({ currentWorkspace: wsInfo })
      })
    },

    syncWorkspaceStateFromManager: () => {
      const { globalClient } = useEngineStore.getState()
      if (!globalClient) {
        return
      }

      const workspaceStore = globalClient.getWorkspaceStore()
      const usersStore = globalClient.getUsersStore()
      const allWorkspaces = workspaceStore.getAllWorkspaces()
      const workspaceInfos: WorkspaceInfo[] = allWorkspaces.map(workspace =>
        mapWorkspaceToInfo(workspace, usersStore.getUserByUuid(workspace.userId)?.email ?? null)
      )

      const currentWorkspace = workspaceStore.getCurrentWorkspace()
      const currentWorkspaceInfo: WorkspaceInfo | null = currentWorkspace
        ? mapWorkspaceToInfo(
            currentWorkspace,
            usersStore.getUserByUuid(currentWorkspace.userId)?.email ?? null
          )
        : null

      set({
        workspaces: workspaceInfos,
        currentWorkspace: currentWorkspaceInfo,
      })
    },

    /**
     * Registers or removes local-only workspaces after auth.
     * Signups should register even empty local workspaces; logins only register those with local data.
     * This keeps the workspace list aligned with server state without leaving orphaned locals.
     */
    resumePendingWorkspaceRegistration: async (options?: {
      shouldRegisterEmptyLocalWorkspaces?: boolean
      accountId?: string
    }) => {
      const { globalClient } = useEngineStore.getState()
      if (!globalClient) {
        return
      }

      const usersStore = globalClient.getUsersStore()
      const accountStoreContainer = globalClient.getAccountStoreContainer()
      const accounts = usersStore.getUsers()
      const fallbackAccountId =
        accounts.length === 1 ? accounts[0].uuid : (get().currentWorkspace?.accountId ?? "")
      const resolvedAccountId = options?.accountId ?? fallbackAccountId
      if (!resolvedAccountId) {
        return
      }

      const accountStore = accountStoreContainer.getAccountStore(resolvedAccountId)
      const identityKeys = accountStore?.getIdentityKeys()
      if (!identityKeys) {
        return
      }

      const workspaceStore = globalClient.getWorkspaceStore()
      const allWorkspaces = workspaceStore.getAllWorkspaces()
      const shouldRegisterEmptyLocalWorkspaces = options?.shouldRegisterEmptyLocalWorkspaces ?? false
      const shouldAwaitRegistrations = shouldRegisterEmptyLocalWorkspaces

      const currentWorkspace = get().currentWorkspace
      let removedCurrentWorkspace = false

      for (const workspace of allWorkspaces) {
        if (workspace.isRegisteredWithServer) {
          continue
        }

        const hasLocalData = await get().localWorkspaceHasData(workspace.uuid)
        // Registration rules:
        // - Sign up: always register the local workspace (even if empty).
        // - Sign in: only register if the local workspace has data.
        const shouldRegisterWorkspace = hasLocalData || shouldRegisterEmptyLocalWorkspaces

        if (!shouldRegisterWorkspace) {
          const isCurrentWorkspace =
            currentWorkspace?.uuid === workspace.uuid && currentWorkspace?.accountId === workspace.userId
          await get().removeWorkspace(workspace.uuid, workspace.userId)
          if (isCurrentWorkspace) {
            removedCurrentWorkspace = true
          }
          continue
        }

        const registrationPromise = get().registerExistingWorkspaceWithServer(
          workspace.uuid,
          resolvedAccountId,
          shouldRegisterEmptyLocalWorkspaces
            ? { shouldRetryOnFailure: false }
            : { shouldRetryOnFailure: true }
        )

        if (shouldAwaitRegistrations) {
          try {
            await registrationPromise
          } catch (error) {
            logger.warn("Failed to register local workspace.", {
              workspaceId: workspace.uuid,
              errorMessage: error instanceof Error ? error.message : "Unknown error",
            })
          }
          continue
        }

        // Background registration for sign-in flows; status bar surfaces failures.
        registrationPromise.catch(error => {
          logger.warn("Failed to register local workspace.", {
            workspaceId: workspace.uuid,
            errorMessage: error instanceof Error ? error.message : "Unknown error",
          })
        })
      }

      if (removedCurrentWorkspace) {
        const remainingWorkspaces = workspaceStore.getAllWorkspaces()
        const nextWorkspace = remainingWorkspaces[0]
        if (nextWorkspace) {
          await get().selectWorkspace(nextWorkspace.uuid, nextWorkspace.userId)
        } else {
          set({ currentWorkspace: null })
        }
      }
    },

    clearWorkspaces: () => {
      set({
        workspaces: [],
        currentWorkspace: null,
        workspacesLoaded: false,
        registeringWorkspaceIds: [],
      })
    },
  }))

/**
 * HMR Preservation: Reuse existing store instance during hot reloads
 * to prevent state reset (which would cause auth redirects).
 */
let useWorkspaceStore = createWorkspaceStore()

if (import.meta.hot?.data?.workspaceStore) {
  useWorkspaceStore = import.meta.hot.data.workspaceStore
}

if (import.meta.hot) {
  import.meta.hot.data.workspaceStore = useWorkspaceStore
}

export { useWorkspaceStore }
