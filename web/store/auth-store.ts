import { create, type StoreApi, type UseBoundStore } from "zustand"
import { useEngineStore } from "./engine-store"
import { useWorkspaceStore } from "./workspace-store"
import { normalizeApiUrlInput } from "../setup/api-url"

// Type declaration for Vite's HMR data storage
declare global {
  interface ImportMetaHotData {
    authStore?: UseBoundStore<StoreApi<AuthStore>>
  }
}

/**
 * User type from the engine layer.
 * Using a minimal interface to avoid circular dependency with engine types.
 */
export interface AuthUser {
  uuid: string
  email: string
}

/**
 * AuthStore manages authentication state and actions.
 * Depends on EngineStore for GlobalClient access.
 */
interface AuthState {
  accounts: AuthUser[]
  currentUser: AuthUser | null
  hasAuthenticatedAccounts: boolean
  isAuthenticating: boolean
  authError: string | null
}

interface SignupOptions {
  inviteCode?: string
  bypassInviteCode?: boolean
}

interface AuthActions {
  // Authenticate with email and password
  login: (params: { email: string; password: string; apiUrl: string }) => Promise<AuthUser>
  // Register a new user (name derived from email)
  signup: (params: {
    email: string
    password: string
    apiUrl: string
    options?: SignupOptions
  }) => Promise<AuthUser>
  // Log out the current workspace account
  logout: () => Promise<void>
  // Log out all authenticated accounts
  logoutAllAccounts: () => Promise<void>
  // Hydrate user state from existing session (called on app init)
  hydrateFromSession: () => void
  /**
   * Reconciles currentUser/account list with the currently selected workspace.
   * Picks the account that owns the active workspace entry when available,
   * otherwise falls back to the sole authenticated account (if exactly one).
   */
  syncCurrentUserForWorkspaceSelection: () => void
  // Clear any auth errors
  clearAuthError: () => void
}

export type AuthStore = AuthState & AuthActions

/**
 * Factory function to create the auth store.
 * Separated to enable HMR state preservation.
 */
const createAuthStore = (): UseBoundStore<StoreApi<AuthStore>> =>
  create<AuthStore>(set => ({
    accounts: [],
    currentUser: null,
    hasAuthenticatedAccounts: false,
    isAuthenticating: false,
    authError: null,

    login: async (params: { email: string; password: string; apiUrl: string }) => {
      const { email, password, apiUrl } = params
      const { globalClient } = useEngineStore.getState()
      if (!globalClient) {
        throw new Error("Client not initialized")
      }

      set({ isAuthenticating: true, authError: null })

      try {
        const normalizedApiUrl = normalizeApiUrlInput(apiUrl)
        const result = await globalClient.getLogin().execute({ email, password, apiUrl: normalizedApiUrl })
        if (result.isFailed()) {
          throw new Error(result.getError())
        }
        const user = result.getValue()
        const accounts = globalClient.getUsersStore().getUsers()
        const currentWorkspace = useWorkspaceStore.getState().currentWorkspace
        const currentUser =
          currentWorkspace?.accountId && accounts.length > 0
            ? ((accounts.find(account => account.uuid === currentWorkspace.accountId) as
                | AuthUser
                | undefined) ?? null)
            : null
        set({
          accounts: accounts as AuthUser[],
          currentUser,
          hasAuthenticatedAccounts: accounts.length > 0,
          isAuthenticating: false,
        })
        return user as AuthUser
      } catch (error) {
        const message = error instanceof Error ? error.message : "Login failed"
        set({ authError: message, isAuthenticating: false })
        throw error
      }
    },

    signup: async (params: { email: string; password: string; apiUrl: string; options?: SignupOptions }) => {
      const { email, password, apiUrl, options } = params
      const { globalClient } = useEngineStore.getState()
      if (!globalClient) {
        throw new Error("Client not initialized")
      }

      set({ isAuthenticating: true, authError: null })

      try {
        const normalizedApiUrl = normalizeApiUrlInput(apiUrl)
        const result = await globalClient.getRegister().execute({
          email,
          password,
          apiUrl: normalizedApiUrl,
          inviteCode: options?.inviteCode,
          bypassInviteCode: options?.bypassInviteCode,
        })
        if (result.isFailed()) {
          throw new Error(result.getError())
        }
        const user = result.getValue()
        const accounts = globalClient.getUsersStore().getUsers()
        const currentWorkspace = useWorkspaceStore.getState().currentWorkspace
        const currentUser =
          currentWorkspace?.accountId && accounts.length > 0
            ? ((accounts.find(account => account.uuid === currentWorkspace.accountId) as
                | AuthUser
                | undefined) ?? null)
            : null
        set({
          accounts: accounts as AuthUser[],
          currentUser,
          hasAuthenticatedAccounts: accounts.length > 0,
          isAuthenticating: false,
        })
        return user as AuthUser
      } catch (error) {
        const message = error instanceof Error ? error.message : "Signup failed"
        set({ authError: message, isAuthenticating: false })
        throw error
      }
    },

    logout: async () => {
      const { globalClient, destroyApplication } = useEngineStore.getState()
      const { currentWorkspace } = useWorkspaceStore.getState()
      if (!globalClient) {
        throw new Error("Client not initialized")
      }

      const usersStore = globalClient.getUsersStore()
      const accounts = usersStore.getUsers()
      const resolvedAccountId = currentWorkspace?.accountId ?? (accounts.length === 1 ? accounts[0].uuid : "")

      if (!resolvedAccountId) {
        set({ currentUser: null, authError: null })
        return
      }

      // Destroy application to release workspace-scoped crypto keys.
      destroyApplication()

      await globalClient.getLogout().execute(resolvedAccountId)
      const nextAccounts = usersStore.getUsers()
      set({
        accounts: nextAccounts as AuthUser[],
        hasAuthenticatedAccounts: nextAccounts.length > 0,
        currentUser: null,
        authError: null,
      })
    },

    logoutAllAccounts: async () => {
      const { globalClient, destroyApplication } = useEngineStore.getState()
      const { clearWorkspaces } = useWorkspaceStore.getState()

      if (!globalClient) {
        throw new Error("Client not initialized")
      }

      destroyApplication()
      await globalClient.getLogoutAllAccounts().execute()
      clearWorkspaces()
      set({
        accounts: [],
        currentUser: null,
        hasAuthenticatedAccounts: false,
        authError: null,
      })
    },

    hydrateFromSession: () => {
      const { globalClient } = useEngineStore.getState()
      if (!globalClient) {
        return
      }

      const accounts = globalClient.getUsersStore().getUsers()
      const currentWorkspace = useWorkspaceStore.getState().currentWorkspace
      const fallbackUser = accounts.length === 1 ? (accounts[0] as AuthUser) : null
      const currentUser =
        currentWorkspace?.accountId && accounts.length > 0
          ? ((accounts.find(account => account.uuid === currentWorkspace.accountId) as
              | AuthUser
              | undefined) ?? fallbackUser)
          : fallbackUser
      set({
        accounts: accounts as AuthUser[],
        currentUser,
        hasAuthenticatedAccounts: accounts.length > 0,
      })
    },

    syncCurrentUserForWorkspaceSelection: () => {
      const { globalClient } = useEngineStore.getState()
      if (!globalClient) {
        set(state => {
          if (
            state.currentUser === null &&
            state.accounts.length === 0 &&
            state.hasAuthenticatedAccounts === false
          ) {
            return state
          }
          return { currentUser: null, accounts: [], hasAuthenticatedAccounts: false }
        })
        return
      }

      const accounts = globalClient.getUsersStore().getUsers()
      const currentWorkspace = useWorkspaceStore.getState().currentWorkspace
      const fallbackUser = accounts.length === 1 ? (accounts[0] as AuthUser) : null
      const currentUser =
        currentWorkspace?.accountId && accounts.length > 0
          ? ((accounts.find(account => account.uuid === currentWorkspace.accountId) as
              | AuthUser
              | undefined) ?? fallbackUser)
          : fallbackUser
      const nextAccounts = accounts as AuthUser[]
      const nextHasAuthenticatedAccounts = nextAccounts.length > 0

      set(state => {
        const currentUserId = state.currentUser?.uuid ?? null
        const nextCurrentUserId = currentUser?.uuid ?? null
        const accountsUnchanged =
          state.accounts.length === nextAccounts.length &&
          state.accounts.every((account, index) => {
            const nextAccount = nextAccounts[index]
            return (
              nextAccount !== undefined &&
              account.uuid === nextAccount.uuid &&
              account.email === nextAccount.email
            )
          })

        if (
          currentUserId === nextCurrentUserId &&
          state.hasAuthenticatedAccounts === nextHasAuthenticatedAccounts &&
          accountsUnchanged
        ) {
          return state
        }

        return {
          accounts: nextAccounts,
          currentUser,
          hasAuthenticatedAccounts: nextHasAuthenticatedAccounts,
        }
      })
    },

    clearAuthError: () => {
      set({ authError: null })
    },
  }))

/**
 * HMR Preservation: Reuse existing store instance during hot reloads
 * to prevent state reset (which would cause auth redirects).
 */
let useAuthStore = createAuthStore()

if (import.meta.hot?.data?.authStore) {
  useAuthStore = import.meta.hot.data.authStore
}

if (import.meta.hot) {
  import.meta.hot.data.authStore = useAuthStore
}

export { useAuthStore }
