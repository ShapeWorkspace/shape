import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronRight } from "lucide-react"
import { FormSidecar } from "./FormSidecar"
import { useAuthStore } from "../store/auth-store"
import { useWorkspaceStore } from "../store/workspace-store"
import { useSidecar } from "../contexts/SidecarContext"
import { resolveApiUrlFromEnvironment, validateApiUrlInput } from "../setup/api-url"
import * as styles from "../styles/sidecar.css"

// Signup is currently open for rollout; invite codes are disabled.
const REQUIRE_INVITE_CODE = false

interface AuthFormSidecarProps {
  mode: "signin" | "signup"
  // When true, bypasses invite code requirement (for workspace invite flows)
  bypassInviteCode?: boolean
}

export function AuthFormSidecar({ mode, bypassInviteCode }: AuthFormSidecarProps) {
  const navigate = useNavigate()
  const { hasAuthenticatedAccounts, login, signup } = useAuthStore()
  const { selectWorkspace, resumePendingWorkspaceRegistration, refreshWorkspaces } = useWorkspaceStore()
  const { popSidecar, clearSidecar, setCollapseDisabled } = useSidecar()

  const defaultApiUrl = useMemo(() => resolveApiUrlFromEnvironment(), [])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [apiUrlInputValue, setApiUrlInputValue] = useState(defaultApiUrl)
  const [apiUrlValidationMessage, setApiUrlValidationMessage] = useState<string | null>(null)
  const [isAdvancedOptionsExpanded, setIsAdvancedOptionsExpanded] = useState(false)

  // Keep the onboarding sidecar non-collapsible while an anonymous user is in auth flow.
  useEffect(() => {
    if (!hasAuthenticatedAccounts) {
      setCollapseDisabled(true)
      return () => setCollapseDisabled(false)
    }

    return () => {}
  }, [hasAuthenticatedAccounts, setCollapseDisabled])

  // Decide which workspace screen to land on after authentication.
  // If user has multiple workspaces, show the workspace selector.
  // Otherwise, navigate directly to the workspace.
  const navigateAfterAuth = useCallback(async () => {
    const { workspaces, currentWorkspace: latestCurrentWorkspace } = useWorkspaceStore.getState()
    const { accounts } = useAuthStore.getState()
    const shouldShowWorkspaceSelector = accounts.length > 1 || workspaces.length > 1

    if (shouldShowWorkspaceSelector) {
      clearSidecar()
      // Defer navigation to next tick to avoid race condition where React Router's
      // navigate() gets swallowed during concurrent state updates from auth flow.
      setTimeout(() => {
        navigate("/workspaces", { replace: true })
      }, 0)
      return
    }

    const workspaceToSelect = latestCurrentWorkspace ?? workspaces[0]
    if (!workspaceToSelect) {
      clearSidecar()
      navigate("/", { replace: true })
      return
    }

    await selectWorkspace(workspaceToSelect.uuid, workspaceToSelect.accountId ?? undefined)

    clearSidecar()
    navigate(`/w/${workspaceToSelect.uuid}`, { replace: true })
  }, [clearSidecar, navigate, selectWorkspace])

  // Determine if we should show the invite code field:
  // - Only in signup mode
  // - Only when REQUIRE_INVITE_CODE is enabled
  // - Not when bypassing (workspace invite flows)
  const shouldShowInviteCode = mode === "signup" && REQUIRE_INVITE_CODE && !bypassInviteCode

  const handleToggleAdvancedOptions = useCallback(() => {
    setIsAdvancedOptionsExpanded(previousValue => !previousValue)
  }, [])

  const handleApiUrlInputChange = useCallback((value: string) => {
    setApiUrlInputValue(value)
    setApiUrlValidationMessage(null)
    setErrorMessage(null)
  }, [])

  const handleSubmit = useCallback(
    async (values: Record<string, string | boolean>) => {
      const emailValue = values.email
      const passwordValue = values.password
      const inviteCodeValue = values.inviteCode

      if (typeof emailValue !== "string" || typeof passwordValue !== "string") {
        setErrorMessage("Email and password are required")
        return
      }

      // Validate invite code if required
      if (shouldShowInviteCode && (typeof inviteCodeValue !== "string" || !inviteCodeValue.trim())) {
        setErrorMessage("Invite code is required")
        return
      }

      // Validate API base URL early to ensure we bind auth to the intended server.
      const apiUrlError = validateApiUrlInput(apiUrlInputValue)
      if (apiUrlError) {
        setErrorMessage(apiUrlError)
        setApiUrlValidationMessage(apiUrlError)
        setIsAdvancedOptionsExpanded(true)
        return
      }

      setIsSubmitting(true)
      setErrorMessage(null)

      try {
        if (mode === "signup") {
          await signup({
            email: emailValue,
            password: passwordValue,
            apiUrl: apiUrlInputValue,
            options: {
              inviteCode: typeof inviteCodeValue === "string" ? inviteCodeValue.trim() : undefined,
              bypassInviteCode,
            },
          })
        } else {
          await login({ email: emailValue, password: passwordValue, apiUrl: apiUrlInputValue })
        }

        const shouldRegisterEmptyLocalWorkspacesAfterAuth = mode === "signup"
        // Signups must register the local workspace even if it's empty; logins should not.
        await resumePendingWorkspaceRegistration({
          shouldRegisterEmptyLocalWorkspaces: shouldRegisterEmptyLocalWorkspacesAfterAuth,
        })
        // After login/signup, force refresh workspaces to fetch the new account's workspaces.
        // This is necessary because fetchWorkspaces() early-returns if workspacesLoaded is true.
        await refreshWorkspaces()
        await navigateAfterAuth()
      } catch (error) {
        const message = error instanceof Error ? error.message : "Authentication failed"
        setErrorMessage(message)
      } finally {
        setIsSubmitting(false)
      }
    },
    [
      mode,
      signup,
      login,
      resumePendingWorkspaceRegistration,
      refreshWorkspaces,
      navigateAfterAuth,
      shouldShowInviteCode,
      bypassInviteCode,
      apiUrlInputValue,
    ]
  )

  // Build the fields array, conditionally including invite code for signup
  const fields = [
    {
      name: "email",
      type: "text" as const,
      label: "Email",
      required: true,
      placeholder: "Email",
      testId: "auth-email-input",
      autoFocus: true,
    },
    {
      name: "password",
      type: "password" as const,
      label: "Password",
      required: true,
      placeholder: "Password",
      testId: "auth-password-input",
    },
    // Conditionally add invite code field for signup when required
    ...(shouldShowInviteCode
      ? [
          {
            name: "inviteCode",
            type: "text" as const,
            label: "Invite Code",
            required: true,
            placeholder: "Enter your invite code",
            testId: "auth-invite-code-input",
          },
        ]
      : []),
  ]

  return (
    <FormSidecar
      title={mode === "signup" ? "Create Account" : "Sign In"}
      fields={fields}
      onSubmit={handleSubmit}
      onCancel={popSidecar}
      submitLabel={mode === "signup" ? "Create account" : "Sign in"}
      cancelLabel="Back"
      isPending={isSubmitting}
      errorMessage={errorMessage}
    >
      {/* Advanced: allow self-hosted API base URLs without cluttering the default flow. */}
      <div className={styles.sidecarAdvancedSection}>
        <button
          className={styles.sidecarAdvancedToggle}
          onClick={handleToggleAdvancedOptions}
          type="button"
          disabled={isSubmitting}
          aria-expanded={isAdvancedOptionsExpanded}
          data-testid="auth-advanced-toggle"
        >
          <span>Advanced</span>
          <span
            className={styles.sidecarAdvancedChevron}
            data-expanded={isAdvancedOptionsExpanded}
            aria-hidden="true"
          >
            <ChevronRight size={12} />
          </span>
        </button>
        {isAdvancedOptionsExpanded && (
          <div className={styles.sidecarAdvancedContent}>
            <div className={styles.sidecarFormField}>
              <label className={styles.sidecarFormLabel}>Server</label>
              <input
                className={`${styles.sidecarInput} ${apiUrlValidationMessage ? styles.sidecarInputError : ""}`}
                value={apiUrlInputValue}
                onChange={event => handleApiUrlInputChange(event.target.value)}
                placeholder={defaultApiUrl}
                disabled={isSubmitting}
                data-testid="auth-api-url-input"
              />
              {apiUrlValidationMessage && (
                <span className={styles.sidecarFormError}>{apiUrlValidationMessage}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </FormSidecar>
  )
}
