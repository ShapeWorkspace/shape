import { useState, useCallback, useMemo, useEffect } from "react"
import { useParams, useSearchParams, useNavigate, useLocation } from "react-router-dom"
import { Users, AlertCircle, Check, LogIn, UserPlus, X } from "lucide-react"
import { useEngineStore } from "../store/engine-store"
import { useAuthStore, type AuthUser } from "../store/auth-store"
import { useWorkspaceStore } from "../store/workspace-store"
import { InviteBundlePlaintext, type LinkInviteResponse } from "../../engine/models/invite-types"
import type { InviteStatusResponse } from "../../engine/models/invite-status"
import {
  ListContainer,
  List,
  ListRow,
  ListRowWithInput,
  ListRowActions,
  ListRowActionButton,
  ListSectionHeader,
  ListEmpty,
} from "../components/ListUI"
import { resolveApiUrlFromEnvironment } from "../setup/api-url"

/**
 * InviteAcceptanceTool handles the invite acceptance flow for users visiting an invite link.
 *
 * Supported URL structures:
 * - Link invite: /invite/{inviteId}?pub={inviterPublicKey}#sk={inviteSecret}
 * - Token invite: /invite/{token}
 */
export function InviteAcceptanceTool() {
  const { inviteId } = useParams<{ inviteId: string }>()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { globalClient, isInitialized } = useEngineStore()
  const { currentUser, accounts, login, signup } = useAuthStore()
  const { refreshWorkspaces, selectWorkspace, createLocalWorkspace } = useWorkspaceStore()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isAccepting, setIsAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)
  const [acceptSuccess, setAcceptSuccess] = useState(false)
  const defaultApiUrl = useMemo(() => resolveApiUrlFromEnvironment(), [])

  // Parse URL parameters:
  // - pub: inviter's sign public key (from query string, sent to server for verification)
  // - sk: invite secret (from hash fragment, NEVER sent to server)
  const inviterPublicKey = searchParams.get("pub")
  const inviteSecret = useMemo(() => {
    const hash = location.hash
    if (hash.startsWith("#sk=")) {
      return hash.slice(4)
    }
    return null
  }, [location.hash])
  const hasInviterPublicKey = Boolean(inviterPublicKey)
  const hasInviteSecret = Boolean(inviteSecret)
  const inviteFlowType: "link" | "token" | "invalid" =
    hasInviterPublicKey && hasInviteSecret
      ? "link"
      : !hasInviterPublicKey && !hasInviteSecret
        ? "token"
        : "invalid"

  type InviteMetadata =
    | { kind: "link"; value: LinkInviteResponse }
    | { kind: "token"; value: InviteStatusResponse }

  // Fetch invite details via engine use cases to keep endpoint logic out of UI.
  const [invite, setInvite] = useState<InviteMetadata | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [fetchError, setFetchError] = useState<Error | null>(null)

  useEffect(() => {
    if (!inviteId || !isInitialized || !globalClient) {
      return
    }

    if (inviteFlowType === "invalid") {
      setIsLoading(false)
      setFetchError(null)
      setInvite(null)
      return
    }

    let isMounted = true

    const fetchInviteMetadata = async () => {
      setIsLoading(true)
      setFetchError(null)

      try {
        const accountStoreContainer = globalClient.getAccountStoreContainer()
        const localAccountStore = accountStoreContainer.getOrCreateLocalAccountStore()

        if (inviteFlowType === "link") {
          const getInvite = globalClient.getGetInvite()
          const inviteResult = await getInvite.execute({
            inviteId,
            accountStore: localAccountStore,
          })
          if (inviteResult.isFailed()) {
            throw new Error(inviteResult.getError())
          }
          if (!isMounted) {
            return
          }
          setInvite({ kind: "link", value: inviteResult.getValue() })
        } else {
          const getInviteStatus = globalClient.getGetInviteStatus()
          const inviteResult = await getInviteStatus.execute({
            token: inviteId,
            accountStore: localAccountStore,
          })
          if (inviteResult.isFailed()) {
            throw new Error(inviteResult.getError())
          }
          if (!isMounted) {
            return
          }
          setInvite({ kind: "token", value: inviteResult.getValue() })
        }
      } catch (error) {
        if (!isMounted) {
          return
        }
        setFetchError(error instanceof Error ? error : new Error("Failed to load invite"))
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void fetchInviteMetadata()

    return () => {
      isMounted = false
    }
  }, [inviteId, isInitialized, globalClient, inviteFlowType])

  const handleDeclineInvite = useCallback(async () => {
    try {
      const localWorkspace = await createLocalWorkspace()
      navigate(`/w/${localWorkspace.uuid}`, { replace: true })
    } catch (error) {
      console.error("Failed to create local workspace after declining invite:", error)
    }
  }, [createLocalWorkspace, navigate])

  const acceptInviteWithAccount = useCallback(
    async (account: AuthUser) => {
      if (!globalClient || !inviteId) {
        setAcceptError("Missing invite parameters")
        return
      }

      const accountStoreContainer = globalClient.getAccountStoreContainer()
      const accountStore = accountStoreContainer.getAccountStore(account.uuid)
      if (!accountStore) {
        setAcceptError("Account not found")
        return
      }

      setAcceptError(null)
      setIsAccepting(true)

      try {
        let targetWorkspaceId = ""

        if (inviteFlowType === "link") {
          if (!inviteSecret || !inviterPublicKey) {
            throw new Error("Missing link invite parameters")
          }
          const identityKeys = accountStore.getIdentityKeys()
          if (!identityKeys) {
            throw new Error("Not authenticated")
          }

          const decryptInviteBundle = globalClient.getDecryptInviteBundle()
          const decryptResult = await decryptInviteBundle.execute({
            accountUserId: account.uuid,
            inviteId,
            inviteSecret,
            inviterSignPublicKey: inviterPublicKey,
          })
          if (decryptResult.isFailed()) {
            throw new Error(decryptResult.getError())
          }
          const bundle: InviteBundlePlaintext = decryptResult.getValue()!

          const acceptLinkInvite = globalClient.getAcceptLinkInvite()
          const acceptResult = await acceptLinkInvite.execute(inviteId, bundle, accountStore)
          if (acceptResult.isFailed()) {
            throw new Error(acceptResult.getError())
          }
          targetWorkspaceId = bundle.workspaceId
        } else if (inviteFlowType === "token") {
          const acceptWorkspaceInvite = globalClient.getAcceptWorkspaceInvite()
          const acceptResult = await acceptWorkspaceInvite.execute({
            accountId: account.uuid,
            token: inviteId,
          })
          if (acceptResult.isFailed()) {
            throw new Error(acceptResult.getError())
          }

          if (!invite || invite.kind !== "token") {
            throw new Error("Invite metadata not loaded")
          }
          targetWorkspaceId = invite.value.workspace_id
        } else {
          throw new Error("Invalid invite URL")
        }

        if (!targetWorkspaceId) {
          throw new Error("Workspace not found for invite")
        }

        setAcceptSuccess(true)
        await refreshWorkspaces()
        await selectWorkspace(targetWorkspaceId, account.uuid)
        navigate(`/w/${targetWorkspaceId}`, { replace: true })
      } catch (err) {
        console.error("Failed to accept invite:", err)
        setAcceptError(err instanceof Error ? err.message : "Failed to accept invite")
      } finally {
        setIsAccepting(false)
      }
    },
    [
      globalClient,
      inviteId,
      inviteSecret,
      inviterPublicKey,
      inviteFlowType,
      invite,
      refreshWorkspaces,
      selectWorkspace,
      navigate,
    ]
  )

  const handleAuthenticateAndAcceptInvite = useCallback(
    async (mode: "signin" | "signup") => {
      if (!email.trim() || !password) {
        setAcceptError("Email and password are required")
        return
      }

      setAcceptError(null)
      setIsAccepting(true)

      try {
        let authenticatedAccount: AuthUser
        if (mode === "signin") {
          authenticatedAccount = await login({ email: email.trim(), password, apiUrl: defaultApiUrl })
        } else {
          // Bypass invite code requirement since this is a workspace invite flow.
          // The invite link itself serves as authorization for registration.
          authenticatedAccount = await signup({
            email: email.trim(),
            password,
            apiUrl: defaultApiUrl,
            options: { bypassInviteCode: true },
          })
        }

        await acceptInviteWithAccount(authenticatedAccount)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Authentication failed"
        setAcceptError(message)
      } finally {
        setIsAccepting(false)
      }
    },
    [email, password, login, signup, acceptInviteWithAccount, defaultApiUrl]
  )

  const accountsForInvite = currentUser ? [currentUser] : accounts
  const hasAccountsForInvite = accountsForInvite.length > 0

  const workspaceName =
    invite?.kind === "link"
      ? invite.value.workspace_name || "Workspace"
      : invite?.kind === "token"
        ? invite.value.workspace_name || "Workspace"
        : "Workspace"
  const inviteRole =
    invite?.kind === "link"
      ? invite.value.role
      : invite?.kind === "token"
        ? invite.value.role
        : "member"
  const inviterLabel =
    invite?.kind === "link" && invite.value.inviter_user_name
      ? `Invited by ${invite.value.inviter_user_name}`
      : "You have been invited to this workspace"

  const inviteRows: JSX.Element[] = []
  let inviteRowCount = 0

  if (!acceptSuccess) {
    // Build the list rows in-order so itemCount matches rendered rows.
    let rowIndex = 0

    inviteRows.push(
      <ListRow
        key="invite-details-row"
        index={rowIndex++}
        icon={<Users size={16} />}
        title={workspaceName}
        meta={`Role: ${inviteRole}`}
        disabled
        testId="invite-details-row"
      />
    )

    inviteRows.push(
      <ListRow
        key="invite-inviter-row"
        index={rowIndex++}
        icon={<Users size={16} />}
        title={inviterLabel}
        disabled
        testId="invite-inviter"
      />
    )

    if (!hasAccountsForInvite) {
      inviteRows.push(
        <ListRowWithInput
          key="invite-email-input"
          index={rowIndex++}
          icon={<LogIn size={16} />}
          type="email"
          placeholder="Email"
          value={email}
          onChange={setEmail}
          disabled={isAccepting}
          testId="invite-email-input"
        />
      )
      inviteRows.push(
        <ListRowWithInput
          key="invite-password-input"
          index={rowIndex++}
          icon={<LogIn size={16} />}
          type="password"
          placeholder="Password"
          value={password}
          onChange={setPassword}
          disabled={isAccepting}
          testId="invite-password-input"
        />
      )
      inviteRows.push(
        <ListRow
          key="invite-auth-actions"
          index={rowIndex++}
          icon={<Check size={16} />}
          title="Continue"
          accessory={
            <ListRowActions>
              <ListRowActionButton
                label="Sign In & Accept"
                icon={<LogIn size={12} />}
                onClick={() => handleAuthenticateAndAcceptInvite("signin")}
                variant="primary"
                disabled={isAccepting}
                testId="invite-signin-accept"
              />
              <ListRowActionButton
                label="Sign Up & Accept"
                icon={<UserPlus size={12} />}
                onClick={() => handleAuthenticateAndAcceptInvite("signup")}
                variant="secondary"
                disabled={isAccepting}
                testId="invite-signup-accept"
              />
            </ListRowActions>
          }
          disabled
        />
      )
    } else {
      accountsForInvite.forEach((account: AuthUser) => {
        inviteRows.push(
          <ListRow
            key={`accept-invite-${account.uuid}`}
            index={rowIndex++}
            icon={<Check size={16} />}
            title={isAccepting ? "Accepting..." : `Accept as ${account.email || "account"}`}
            isCreateAction
            onClick={() => acceptInviteWithAccount(account)}
            disabled={isAccepting}
            testId={`accept-invite-${account.uuid}`}
          />
        )
      })
    }

    if (acceptError) {
      inviteRows.push(
        <ListRow
          key="invite-error"
          index={rowIndex++}
          icon={<AlertCircle size={16} />}
          title={acceptError}
          disabled
          testId="invite-error-row"
        />
      )
    }

    inviteRows.push(
      <ListRow
        key="invite-decline"
        index={rowIndex++}
        icon={<X size={16} />}
        title="Decline Invite"
        onClick={handleDeclineInvite}
        testId="invite-decline"
      />
    )

    inviteRowCount = rowIndex
  }

  // Validate URL parameters
  const hasValidParams = Boolean(inviteId) && inviteFlowType !== "invalid"

  // Show loading state
  if (!isInitialized || isLoading) {
    return (
      <ListContainer>
        <List itemCount={Math.max(inviteRowCount, 1)} testId="invite-acceptance-tool">
          <ListEmpty message="Loading invite..." testId="invite-loading-empty" />
        </List>
      </ListContainer>
    )
  }

  // Show error for invalid URL
  if (!hasValidParams) {
    return (
      <ListContainer>
        <List itemCount={0} testId="invite-acceptance-tool">
          <ListSectionHeader title="Invalid Invite" />
          <ListEmpty
            message="This invite link appears to be malformed or incomplete."
            testId="invite-invalid-empty"
          />
        </List>
      </ListContainer>
    )
  }

  // Show error if invite fetch failed
  if (fetchError) {
    const errorMessage = fetchError instanceof Error ? fetchError.message : "Failed to load invite"
    return (
      <ListContainer>
        <List itemCount={0} testId="invite-acceptance-tool">
          <ListSectionHeader title="Invite Not Found" />
          <ListEmpty message={errorMessage} testId="invite-not-found-empty" />
        </List>
      </ListContainer>
    )
  }

  // Invite acceptance UI
  return (
    <ListContainer>
      {acceptSuccess ? (
        <List itemCount={1} testId="invite-acceptance-tool">
          <ListSectionHeader title="Invite Accepted" />
          <ListRow
            index={0}
            icon={<Check size={16} />}
            title={`Redirecting to ${workspaceName}...`}
            testId="invite-success-row"
          />
        </List>
      ) : (
        <List itemCount={inviteRowCount} testId="invite-acceptance-tool">
          <ListSectionHeader title="Workspace Invitation" />
          {inviteRows}
        </List>
      )}
    </ListContainer>
  )
}
