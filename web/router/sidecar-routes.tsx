import { ReactNode } from "react"
import { OnboardingAuthSidecar } from "../components/OnboardingAuthSidecar"
import { AuthFormSidecar } from "../components/AuthFormSidecar"

export interface SidecarStackRouteItem {
  title: string
  content: ReactNode
  route?: string
}

/**
 * Resolve a sidecar route string into a stack of sidecar items.
 * This keeps sidecar deep-linking centralized and extensible.
 */
export function resolveSidecarStackForRoute(route: string): SidecarStackRouteItem[] | null {
  if (route === "/auth/signin") {
    return [
      {
        title: "Welcome",
        content: <OnboardingAuthSidecar />,
      },
      {
        title: "Sign In",
        content: <AuthFormSidecar mode="signin" />,
        route,
      },
    ]
  }

  if (route === "/auth/signup") {
    return [
      {
        title: "Welcome",
        content: <OnboardingAuthSidecar />,
      },
      {
        title: "Sign Up",
        content: <AuthFormSidecar mode="signup" />,
        route,
      },
    ]
  }

  return null
}
