import { ReactNode } from "react"
import { Navigate } from "react-router-dom"
import { useAuthStore } from "../../store/auth-store"

interface AuthGuardProps {
  children: ReactNode
}

/**
 * AuthGuard protects routes that require authentication.
 * Redirects unauthenticated users to the sign-in entry point.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const { hasAuthenticatedAccounts } = useAuthStore()
  if (!hasAuthenticatedAccounts) {
    return <Navigate to="/auth/signin" replace />
  }

  return <>{children}</>
}
