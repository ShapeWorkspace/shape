import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuthStore } from "../store/auth-store"
import { useEngineStore } from "../store/engine-store"
import { useWorkspaceStore } from "../store/workspace-store"
import { encodeSidecarRouteForQueryParam } from "../router/sidecar-routing"

interface AuthRedirectProps {
  mode: "signin" | "signup"
}

/**
 * AuthRedirect converts legacy auth routes into sidecar-driven workspace routes.
 */
export function AuthRedirect({ mode }: AuthRedirectProps) {
  const navigate = useNavigate()
  const { hasAuthenticatedAccounts } = useAuthStore()
  const { application } = useEngineStore()
  const { workspaces, createLocalWorkspace } = useWorkspaceStore()
  const activeWorkspaceId = application?.workspaceId ?? ""
  const [isCreatingLocalWorkspace, setIsCreatingLocalWorkspace] = useState(false)

  useEffect(() => {
    const sidecarRoute = mode === "signin" ? "/auth/signin" : "/auth/signup"

    if (hasAuthenticatedAccounts && !activeWorkspaceId) {
      if (workspaces.length === 0) {
        return
      }
      navigate("/workspaces", { replace: true })
      return
    }

    if (!activeWorkspaceId) {
      if (!hasAuthenticatedAccounts && workspaces.length === 0 && !isCreatingLocalWorkspace) {
        setIsCreatingLocalWorkspace(true)
        createLocalWorkspace()
          .catch((error: unknown) => {
            console.error("Failed to create local workspace for auth redirect:", error)
          })
          .finally(() => {
            setIsCreatingLocalWorkspace(false)
          })
      }
      return
    }

    const encodedSidecarRoute = encodeSidecarRouteForQueryParam(sidecarRoute)
    navigate(`/w/${activeWorkspaceId}?sidecar=${encodedSidecarRoute}`, { replace: true })
  }, [
    mode,
    hasAuthenticatedAccounts,
    activeWorkspaceId,
    workspaces,
    isCreatingLocalWorkspace,
    createLocalWorkspace,
    navigate,
  ])

  return null
}

/**
 * AuthLogoutRedirect performs a safe logout outside the workspace layout.
 * It clears authenticated state, rebuilds anonymous workspace state, and
 * then returns the user to the tools list.
 */
export function AuthLogoutRedirect() {
  const navigate = useNavigate()
  const { logout } = useAuthStore()
  const { createLocalWorkspace, selectWorkspace, syncWorkspaceStateFromManager } = useWorkspaceStore()
  const hasLogoutSequenceStartedRef = useRef(false)

  useEffect(() => {
    if (hasLogoutSequenceStartedRef.current) {
      return
    }
    hasLogoutSequenceStartedRef.current = true

    const runLogoutSequence = async () => {
      try {
        // Clear authenticated state for the current account.
        await logout()

        syncWorkspaceStateFromManager()

        const { workspaces } = useWorkspaceStore.getState()
        if (workspaces.length > 0) {
          const nextWorkspace = workspaces[0]
          await selectWorkspace(nextWorkspace.uuid, nextWorkspace.accountId ?? undefined)
          navigate(`/w/${nextWorkspace.uuid}`, { replace: true })
          return
        }

        const { hasAuthenticatedAccounts } = useAuthStore.getState()
        if (hasAuthenticatedAccounts) {
          navigate("/workspaces", { replace: true })
          return
        }

        // After logging out all accounts, create a fresh anonymous workspace so the tools list can render.
        const localWorkspace = await createLocalWorkspace()
        navigate(`/w/${localWorkspace.uuid}`, { replace: true })
      } catch (error) {
        console.error("Failed to logout:", error)
        // Fallback to the auth entry point if workspace bootstrap fails.
        navigate("/auth/signin", { replace: true })
      }
    }

    void runLogoutSequence()
  }, [logout, createLocalWorkspace, navigate, selectWorkspace, syncWorkspaceStateFromManager])

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
      <div></div>
    </div>
  )
}

/**
 * AuthLogoutAllRedirect performs a full sign-out of every account.
 */
export function AuthLogoutAllRedirect() {
  const navigate = useNavigate()
  const { logoutAllAccounts } = useAuthStore()
  const { createLocalWorkspace } = useWorkspaceStore()
  const hasLogoutSequenceStartedRef = useRef(false)

  useEffect(() => {
    if (hasLogoutSequenceStartedRef.current) {
      return
    }
    hasLogoutSequenceStartedRef.current = true

    const runLogoutSequence = async () => {
      try {
        await logoutAllAccounts()

        const localWorkspace = await createLocalWorkspace()
        navigate(`/w/${localWorkspace.uuid}`, { replace: true })
      } catch (error) {
        console.error("Failed to logout all accounts:", error)
        navigate("/auth/signin", { replace: true })
      }
    }

    void runLogoutSequence()
  }, [logoutAllAccounts, createLocalWorkspace, navigate])

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
      <div></div>
    </div>
  )
}
