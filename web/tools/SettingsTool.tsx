import { useCallback, useEffect, useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useAuthStore } from "../store/auth-store"
import { useWindowStore } from "../store/window-store"
import { useSidecar } from "../contexts/SidecarContext"
import { User, Users, LogOut, Bell, FileText, UserPlus } from "lucide-react"
import { List, ListRow } from "../components/ListUI"
import { WorkspaceInfoSidecar } from "../components/WorkspaceInfoSidecar"
import { AccountSidecar } from "../components/AccountSidecar"
import { AuthFormSidecar } from "../components/AuthFormSidecar"

type SettingsRowId =
  | "account"
  | "add-account"
  | "members"
  | "notifications"
  | "logs"
  | "logout"
  | "logout-all"

interface SettingsRow {
  id: SettingsRowId
  title: string
  meta?: string
  icon: React.ReactNode
  requiresAuth: boolean
  requiresWorkspace: boolean
  isDisabled?: boolean
  testId: string
}

/**
 * SettingsTool displays user settings and account information as a list.
 * Per Book of UI, this must be a standard list with navigable rows.
 *
 * Rows shown depend on authentication state:
 * - Authenticated: Account, Workspace Members, Notifications, Logs, Logout
 * - Unauthenticated: Logs only
 */
export function SettingsTool() {
  const navigate = useNavigate()
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { currentUser, hasAuthenticatedAccounts } = useAuthStore()
  const { navigateTo } = useWindowStore()
  const { setSidecar, clearSidecar, pushSidecar } = useSidecar()
  const isAuthenticated = hasAuthenticatedAccounts
  // Settings rows that route into workspace views must be disabled when no workspace is selected.
  const hasWorkspaceContext = !!workspaceId

  // Set up the workspace info sidecar when the settings tool mounts
  useEffect(() => {
    setSidecar(<WorkspaceInfoSidecar />, "Workspace")
    return () => clearSidecar()
  }, [setSidecar, clearSidecar])

  // Define all possible settings rows.
  const allRows: SettingsRow[] = useMemo(
    () => [
      {
        id: "add-account",
        title: "Add account",
        icon: <UserPlus size={16} />,
        requiresAuth: false,
        requiresWorkspace: false,
        testId: "settings-add-account-row",
      },
      {
        id: "account",
        title: "Account",
        meta: currentUser?.email ?? undefined,
        icon: <User size={16} />,
        requiresAuth: true,
        requiresWorkspace: false,
        testId: "settings-account-row",
      },
      {
        id: "members",
        title: "Workspace Members",
        icon: <Users size={16} />,
        requiresAuth: true,
        requiresWorkspace: true,
        testId: "settings-members-row",
      },
      {
        id: "notifications",
        title: "Notifications",
        meta: "Push preferences",
        icon: <Bell size={16} />,
        requiresAuth: true,
        requiresWorkspace: true,
        testId: "settings-notifications-row",
      },
      {
        id: "logs",
        title: "Logs",
        meta: "Diagnostics",
        icon: <FileText size={16} />,
        requiresAuth: false,
        requiresWorkspace: true,
        testId: "settings-logs-row",
      },
      {
        id: "logout",
        title: "Sign out",
        meta: "Current account",
        icon: <LogOut size={16} />,
        requiresAuth: true,
        requiresWorkspace: false,
        testId: "settings-logout-row",
      },
      {
        id: "logout-all",
        title: "Sign out all accounts",
        icon: <LogOut size={16} />,
        requiresAuth: true,
        requiresWorkspace: false,
        testId: "settings-logout-all-row",
      },
    ],
    [currentUser?.email]
  )

  // Filter rows based on authentication state, then apply workspace availability gating.
  const visibleRows = useMemo(
    () =>
      allRows
        .filter(row => isAuthenticated || !row.requiresAuth)
        .map(row => ({
          ...row,
          // Disable rows that rely on workspace routing when no workspace is active.
          isDisabled: row.requiresWorkspace && !hasWorkspaceContext,
        })),
    [allRows, isAuthenticated, hasWorkspaceContext]
  )

  // Handler to open the account sidecar
  const handleOpenAccountSidecar = useCallback(() => {
    pushSidecar(<AccountSidecar />, "Account")
  }, [pushSidecar])

  const handleOpenAddAccountSidecar = useCallback(() => {
    pushSidecar(<AuthFormSidecar mode="signin" />, "Add Account")
  }, [pushSidecar])

  // Handle logout action
  const handleLogout = useCallback(() => {
    // Navigate to the dedicated logout route so the workspace layout unmounts
    // before the auth store clears sensitive state.
    navigate("/auth/logout", { replace: true })
  }, [navigate])

  const handleLogoutAll = useCallback(() => {
    navigate("/auth/logout-all", { replace: true })
  }, [navigate])

  // Handle selecting a settings row by its id.
  const handleRowAction = useCallback(
    (rowId: SettingsRowId) => {
      // Centralize workspace routing so all workspace-bound rows are safe and consistent.
      const withWorkspaceContext = (action: (activeWorkspaceId: string) => void) => {
        if (!workspaceId) {
          return
        }
        action(workspaceId)
      }

      switch (rowId) {
        case "add-account":
          handleOpenAddAccountSidecar()
          break
        case "account":
          handleOpenAccountSidecar()
          break
        case "members":
          withWorkspaceContext(activeWorkspaceId => {
            navigateTo({
              id: "workspace-members",
              label: "Workspace Members",
              tool: "settings",
              itemId: "members",
            })
            navigate(`/w/${activeWorkspaceId}/settings/members`)
          })
          break
        case "notifications":
          withWorkspaceContext(activeWorkspaceId => {
            navigateTo({
              id: "notification-settings",
              label: "Notifications",
              tool: "settings",
              itemId: "notifications",
            })
            navigate(`/w/${activeWorkspaceId}/settings/notifications`)
          })
          break
        case "logs":
          withWorkspaceContext(activeWorkspaceId => {
            navigateTo({
              id: "settings-logs",
              label: "Logs",
              tool: "settings",
              itemId: "logs",
            })
            navigate(`/w/${activeWorkspaceId}/settings/logs`)
          })
          break
        case "logout":
          handleLogout()
          break
        case "logout-all":
          handleLogoutAll()
          break
      }
    },
    [
      workspaceId,
      navigateTo,
      navigate,
      handleLogout,
      handleLogoutAll,
      handleOpenAccountSidecar,
      handleOpenAddAccountSidecar,
    ]
  )

  // Handle selection by index (for keyboard navigation).
  const handleSelect = useCallback(
    (index: number) => {
      const row = visibleRows[index]
      if (row && !row.isDisabled) {
        handleRowAction(row.id)
      }
    },
    [visibleRows, handleRowAction]
  )

  return (
    <List itemCount={visibleRows.length} onSelect={handleSelect} testId="settings-tool-container">
      {visibleRows.map((row, index) => (
        <ListRow
          key={row.id}
          index={index}
          icon={row.icon}
          title={row.title}
          meta={row.meta}
          disabled={row.isDisabled}
          onClick={() => handleRowAction(row.id)}
          testId={row.testId}
        />
      ))}
    </List>
  )
}
