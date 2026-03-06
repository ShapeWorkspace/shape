import { useState, useCallback, useEffect } from "react"
import { useParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Users, UserPlus, Mail, Shield, Crown, Link, Copy, Check, Trash2, X } from "lucide-react"
import { useEngineStore } from "../store/engine-store"
import { useSidecar } from "../contexts/SidecarContext"
import { useWorkspaceMembers } from "../store/queries/use-workspace-members"
import { LinkInviteResponse } from "../../engine/models/invite-types"
import type { UserInviteResponse } from "../../engine/models/user-invite"
import { WorkspaceEmailInvite } from "../../engine/models/workspace-email-invite"
import { WorkspaceMember, WorkspaceMemberRole } from "../../engine/models/workspace-member"
import { List, ListRow, ListRowWithInput, ListEmpty, ListSectionHeader } from "../components/ListUI"
import {
  Sidecar,
  SidecarSection,
  SidecarRow,
  SidecarMenu,
  SidecarMetaList,
  SidecarMetaItem,
} from "../components/SidecarUI"
import { WorkspaceMemberAvatar } from "../components/WorkspaceMemberAvatar"
import { logger } from "../../engine/utils/logger"
import * as styles from "../styles/list.css"

// Sidecar context types for different selectable items
type SidecarContext =
  | { type: "link-invite"; invite: LinkInviteResponse }
  | {
      type: "pending-invite"
      invite: {
        id: string
        type: "user" | "email"
        email: string
        name: string | null
        role: string
        createdAt: string
      }
    }

// Helper to format dates (for past dates)
function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days} days ago`
  return date.toLocaleDateString()
}

// Helper to format expiration dates (for future dates)
function formatExpiration(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = date.getTime() - now.getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(hours / 24)

  if (diff <= 0) return "Expired"
  if (hours < 1) return "Expires soon"
  if (hours < 24) return `Expires in ${hours}h`
  if (days === 1) return "Expires in 1 day"
  return `Expires in ${days} days`
}

type NetworkErrorWithOptionalStatus = Error & { status?: number }

// Keep error handling explicit without unsafe type casts.
function isNetworkErrorWithOptionalStatus(error: unknown): error is NetworkErrorWithOptionalStatus {
  return error instanceof Error && "status" in error
}

/**
 * Sidecar content for link invite - allows viewing details and deleting.
 * Uses the new sidecar primitives per Book of UI.
 * Focus state is read from context automatically.
 */
function LinkInviteSidecar({
  invite,
  onDelete,
  isDeleting,
}: {
  invite: LinkInviteResponse
  onDelete: () => void
  isDeleting: boolean
}) {
  return (
    <Sidecar itemCount={1} onSelect={() => onDelete()}>
      {/* Details section */}
      <SidecarSection title="Invite Link">
        <SidecarMetaList>
          <SidecarMetaItem icon={<Link size={12} />} label="Created" value={formatDate(invite.created_at)} />
          <SidecarMetaItem
            icon={<Link size={12} />}
            label="Expires"
            value={formatExpiration(invite.expires_at)}
          />
          <SidecarMetaItem icon={<Shield size={12} />} label="Role" value={invite.role} />
        </SidecarMetaList>
      </SidecarSection>

      {/* Actions section */}
      <SidecarSection title="Actions">
        <SidecarMenu>
          <SidecarRow
            index={0}
            icon={<Trash2 size={14} />}
            title={isDeleting ? "Deleting..." : "Delete Invite"}
            onClick={onDelete}
            disabled={isDeleting}
            testId="delete-invite-link-button"
          />
        </SidecarMenu>
      </SidecarSection>
    </Sidecar>
  )
}

/**
 * Sidecar content for pending invite - allows viewing details and canceling.
 * Uses the new sidecar primitives per Book of UI.
 * Focus state is read from context automatically.
 */
function PendingInviteSidecar({
  invite,
  onCancel,
  isCanceling,
}: {
  invite: {
    id: string
    type: "user" | "email"
    email: string
    name: string | null
    role: string
    createdAt: string
  }
  onCancel: () => void
  isCanceling: boolean
}) {
  return (
    <Sidecar itemCount={1} onSelect={() => onCancel()}>
      {/* Details section */}
      <SidecarSection title="Pending Invite">
        <SidecarMetaList>
          <SidecarMetaItem icon={<Mail size={12} />} label="Email" value={invite.email} />
          {invite.name && <SidecarMetaItem icon={<Users size={12} />} label="Name" value={invite.name} />}
          <SidecarMetaItem icon={<Shield size={12} />} label="Role" value={invite.role} />
          <SidecarMetaItem icon={<Mail size={12} />} label="Invited" value={formatDate(invite.createdAt)} />
        </SidecarMetaList>
      </SidecarSection>

      {/* Actions section */}
      <SidecarSection title="Actions">
        <SidecarMenu>
          <SidecarRow
            index={0}
            icon={<X size={14} />}
            title={isCanceling ? "Canceling..." : "Cancel Invite"}
            onClick={onCancel}
            disabled={isCanceling}
            testId="cancel-invite-button"
          />
        </SidecarMenu>
      </SidecarSection>
    </Sidecar>
  )
}

/**
 * WorkspaceMembersTool displays workspace members and allows managing invites.
 * Per Book of UI:
 * - List rows cannot contain buttons; they ARE the button
 * - Clicking a row shows the sidecar with contextual actions
 * - Sidecar appears to the right of the primary content (rendered by layout)
 */
export function WorkspaceMembersTool() {
  const { workspaceId: workspaceIdFromRoute } = useParams<{ workspaceId: string }>()
  const { application, globalClient } = useEngineStore()
  const workspaceId = application?.workspaceId ?? workspaceIdFromRoute ?? ""
  const queryClient = useQueryClient()
  // Use the new context-based sidecar pattern per Book of UI
  const { setSidecar, clearSidecar } = useSidecar()

  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [isInviting, setIsInviting] = useState(false)

  // State for invite link creation (user without account flow)
  const [inviteLinkUrl, setInviteLinkUrl] = useState<string | null>(null)
  const [isCreatingInviteLink, setIsCreatingInviteLink] = useState(false)
  const [inviteLinkError, setInviteLinkError] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  // Local selection state (which item is selected for sidecar)
  const [selectedContext, setSelectedContext] = useState<SidecarContext | null>(null)

  // Get the account ID from the active Application.
  const activeAccountId = application?.getAccountUserId() ?? null
  // Get identity keys from the account store.
  const activeIdentityKeys =
    activeAccountId && globalClient
      ? globalClient.getAccountStoreContainer().getAccountStore(activeAccountId)?.getIdentityKeys()
      : undefined
  const isApplicationReady = Boolean(application)
  const shouldAllowMemberManagement =
    isApplicationReady &&
    Boolean(activeAccountId) &&
    Boolean(activeIdentityKeys) &&
    application?.isWorkspaceRemote()
  const membersUnavailableMessage = !isApplicationReady
    ? "Loading workspace members..."
    : activeAccountId
      ? "Members will appear once this workspace is registered with the server."
      : "Sign in to manage workspace members."

  // Fetch workspace members
  const { data: members = [], isLoading: membersLoading } = useWorkspaceMembers()

  // Fetch pending user invites (for existing users)
  const { data: userInvites = [], isLoading: userInvitesLoading } = useQuery({
    queryKey: ["workspace-user-invites", workspaceId],
    queryFn: async () => {
      if (!application || !workspaceId) return []
      const invitesResult = await application.getGetWorkspaceUserInvites().execute({ workspaceId })
      if (invitesResult.isFailed()) {
        throw new Error(invitesResult.getError())
      }
      return invitesResult.getValue()
    },
    enabled: !!application && !!workspaceId && shouldAllowMemberManagement,
  })

  // Fetch pending email invites (for non-registered users)
  const { data: emailInvites = [], isLoading: emailInvitesLoading } = useQuery({
    queryKey: ["workspace-pending-invites", workspaceId],
    queryFn: async () => {
      if (!application || !workspaceId) return []
      const invitesResult = await application.getGetWorkspacePendingInvites().execute({ workspaceId })
      if (invitesResult.isFailed()) {
        throw new Error(invitesResult.getError())
      }
      return invitesResult.getValue()
    },
    enabled: !!application && !!workspaceId && shouldAllowMemberManagement,
  })

  // Fetch active link invites (shareable E2EE invite links)
  const { data: linkInvites = [], isLoading: linkInvitesLoading } = useQuery({
    queryKey: ["workspace-link-invites", workspaceId],
    queryFn: async () => {
      if (!application || !workspaceId) return []
      const invitesResult = await application.getGetWorkspaceLinkInvites().execute({ workspaceId })
      if (invitesResult.isFailed()) {
        throw new Error(invitesResult.getError())
      }
      return invitesResult.getValue()
    },
    enabled: !!application && !!workspaceId && shouldAllowMemberManagement,
  })

  // Mutation to revoke user invite
  const revokeUserInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      if (!application || !workspaceId) throw new Error("Not initialized")
      const revokeResult = await application.getRevokeUserInvite().execute({ workspaceId, inviteId })
      if (revokeResult.isFailed()) {
        throw new Error(revokeResult.getError())
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-user-invites", workspaceId] })
      setSelectedContext(null)
      clearSidecar()
    },
  })

  // Mutation to revoke email invite
  const revokeEmailInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      if (!application || !workspaceId) throw new Error("Not initialized")
      const revokeResult = await application.getRevokeWorkspacePendingInvite().execute({ workspaceId, inviteId })
      if (revokeResult.isFailed()) {
        throw new Error(revokeResult.getError())
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-pending-invites", workspaceId] })
      setSelectedContext(null)
      clearSidecar()
    },
  })

  // Mutation to delete link invite
  const deleteLinkInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      if (!application || !workspaceId) throw new Error("Not initialized")
      const deleteResult = await application.getDeleteWorkspaceLinkInvite().execute({ workspaceId, inviteId })
      if (deleteResult.isFailed()) {
        throw new Error(deleteResult.getError())
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-link-invites", workspaceId] })
      setSelectedContext(null)
      clearSidecar()
    },
  })

  // Handle invite submission
  const handleInvite = useCallback(async () => {
    if (!application || !workspaceId || !inviteEmail.trim() || !shouldAllowMemberManagement) return

    setInviteError(null)
    setIsInviting(true)

    try {
      const inviteeEmailAddress = inviteEmail.trim().toLowerCase()

      // Create the invite first so the server can resolve the invitee and return their public keys.
      const inviteResult = await application.getCreateUserInviteForEmailAddress().execute({
        workspaceId,
        inviteeEmailAddress,
        role: WorkspaceMemberRole.Member,
      })
      if (inviteResult.isFailed()) {
        throw new Error(inviteResult.getError())
      }
      const workspaceUserInviteResponse = inviteResult.getValue()

      // Create workspace key shares after the invite is registered, but do it asynchronously.
      const inviteeUserId = workspaceUserInviteResponse.invitee_user_id
      const inviteeBoxPublicKey = workspaceUserInviteResponse.invitee_box_public_key
      if (!inviteeUserId || !inviteeBoxPublicKey) {
        throw new Error("Invite created, but invitee encryption keys are missing.")
      }

      if (activeIdentityKeys) {
        // Fire-and-forget key share creation so invites aren't blocked on slow key fetches.
        const allKeys = application.getKeyStore().getAllKeys()
        const createKeyShare = application.getCreateKeyShareForUser()
        void Promise.all(
          allKeys.map(key => createKeyShare.execute(key.id, inviteeUserId, inviteeBoxPublicKey, key.key))
        )
          .then(results => {
            const failed = results.find(r => r.isFailed())
            if (failed) {
              logger.warn("Invite key share creation failed", {
                workspaceId,
                inviteeUserId,
                error: failed.getError(),
              })
              setInviteError(`Invite created, but key sharing failed: ${failed.getError()}`)
            }
          })
          .catch(error => {
            logger.warn("Invite key share creation failed", {
              workspaceId,
              inviteeUserId,
              error: error instanceof Error ? error.message : "Unknown error",
            })
            setInviteError("Invite created, but key sharing failed.")
          })
      } else {
        logger.warn("Invite created, but identity keys are unavailable for sharing.", {
          workspaceId,
          inviteeUserId,
        })
        setInviteError("Invite created, but key sharing could not start.")
      }

      // Refresh the user invites list so the UI updates immediately.
      queryClient.invalidateQueries({ queryKey: ["workspace-user-invites", workspaceId] })

      setInviteEmail("")
    } catch (err) {
      console.error("Failed to invite user:", err)
      if (isNetworkErrorWithOptionalStatus(err) && err.status === 404) {
        setInviteError("No account found for this email. Use an invite link instead.")
      } else {
        setInviteError(err instanceof Error ? err.message : "Failed to send invite")
      }
    } finally {
      setIsInviting(false)
    }
  }, [
    application,
    workspaceId,
    inviteEmail,
    queryClient,
    shouldAllowMemberManagement,
    activeIdentityKeys,
  ])

  // Handle creating an invite link (for users without accounts)
  // Per BOOK OF ENCRYPTION: Creates encrypted key bundle and returns URL with secret in fragment
  const handleCreateInviteLink = useCallback(async () => {
    if (!application || !globalClient || !workspaceId || !shouldAllowMemberManagement) return

    setInviteLinkError(null)
    setIsCreatingInviteLink(true)
    setInviteLinkUrl(null)

    try {
      const inviteService = application.getInviteService()

      // Check if identity keys are available for the active account
      const accountStore =
        activeAccountId && globalClient
          ? globalClient.getAccountStoreContainer().getAccountStore(activeAccountId)
          : undefined
      if (!accountStore?.getIdentityKeys()) {
        throw new Error("Not authenticated")
      }

      const result = await inviteService.createLinkInvite()
      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      const inviteResult = result.getValue()
      setInviteLinkUrl(inviteResult.inviteUrl)

      // Refresh link invites list to show the new invite
      queryClient.invalidateQueries({ queryKey: ["workspace-link-invites", workspaceId] })
    } catch (err) {
      console.error("Failed to create invite link:", err)
      setInviteLinkError(err instanceof Error ? err.message : "Failed to create invite link")
    } finally {
      setIsCreatingInviteLink(false)
    }
  }, [
    application,
    globalClient,
    workspaceId,
    queryClient,
    shouldAllowMemberManagement,
    activeAccountId,
  ])

  // Handle copying invite link to clipboard
  const handleCopyInviteLink = useCallback(async () => {
    if (!inviteLinkUrl) return

    try {
      await navigator.clipboard.writeText(inviteLinkUrl)
      setLinkCopied(true)
      // Reset copied state after 2 seconds
      setTimeout(() => setLinkCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy link:", err)
    }
  }, [inviteLinkUrl])

  // Clear sidecar on unmount
  useEffect(() => {
    return () => clearSidecar()
  }, [clearSidecar])

  // Helper to show link invite sidecar
  // Focus state is read from context by Sidecar component automatically
  const showLinkInviteSidecar = useCallback(
    (invite: LinkInviteResponse) => {
      setSelectedContext({ type: "link-invite", invite })
      setSidecar(
        <LinkInviteSidecar
          invite={invite}
          onDelete={() => deleteLinkInviteMutation.mutate(invite.id)}
          isDeleting={false}
        />,
        "Invite Link" // Title for breadcrumb bar per Book of UI
      )
    },
    [setSidecar, deleteLinkInviteMutation]
  )

  // Helper to show pending invite sidecar
  // Focus state is read from context by Sidecar component automatically
  const showPendingInviteSidecar = useCallback(
    (invite: {
      id: string
      type: "user" | "email"
      email: string
      name: string | null
      role: string
      createdAt: string
    }) => {
      setSelectedContext({ type: "pending-invite", invite })
      setSidecar(
        <PendingInviteSidecar
          invite={invite}
          onCancel={() => {
            if (invite.type === "user") {
              revokeUserInviteMutation.mutate(invite.id)
            } else {
              revokeEmailInviteMutation.mutate(invite.id)
            }
          }}
          isCanceling={false}
        />,
        "Pending Invite" // Title for breadcrumb bar per Book of UI
      )
    },
    [setSidecar, revokeUserInviteMutation, revokeEmailInviteMutation]
  )

  // Helper to close the sidecar
  const closeSidecar = useCallback(() => {
    setSelectedContext(null)
    clearSidecar()
  }, [clearSidecar])

  // Close sidecar on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedContext) {
        closeSidecar()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedContext, closeSidecar])

  const isLoading = membersLoading || userInvitesLoading || emailInvitesLoading || linkInvitesLoading

  // Combine all pending invites for display
  const allPendingInvites = [
    ...userInvites.map((inv: UserInviteResponse) => ({
      id: inv.id,
      type: "user" as const,
      email: inv.invitee_email || "Unknown",
      name: inv.invitee_user_name || null,
      role: inv.role,
      createdAt: inv.created_at,
    })),
    ...emailInvites.map((inv: WorkspaceEmailInvite) => ({
      id: inv.id,
      type: "email" as const,
      email: inv.email,
      name: null,
      role: inv.role,
      createdAt: inv.createdAt.toISOString(),
    })),
  ]

  // Calculate item count dynamically based on whether email is entered
  const hasEmailInput = inviteEmail.trim() !== ""
  const baseItemCount = hasEmailInput ? 3 : 2 // input + (optional invite button) + create link
  const createLinkIndex = hasEmailInput ? 2 : 1
  const itemCount = baseItemCount + linkInvites.length + allPendingInvites.length + members.length

  // Get role icon
  const getRoleIcon = (role: string) => {
    switch (role) {
      case "super_admin":
        return <Crown size={14} />
      case "admin":
        return <Shield size={14} />
      default:
        return null
    }
  }

  // Handle selection for keyboard navigation
  const handleSelect = useCallback(
    (index: number) => {
      if (index === 0) {
        // Invite input row - focus the input (handled by ListRowWithInput)
      } else if (index === 1 && hasEmailInput) {
        // Invite button row - trigger invite (only exists when email is entered)
        handleInvite()
      } else if (index === createLinkIndex) {
        // Create invite link / copy link row
        if (inviteLinkUrl) {
          handleCopyInviteLink()
        } else {
          handleCreateInviteLink()
        }
      }
    },
    [hasEmailInput, createLinkIndex, inviteLinkUrl, handleInvite, handleCreateInviteLink, handleCopyInviteLink]
  )

  if (!shouldAllowMemberManagement) {
    return (
      <List itemCount={0} testId="workspace-members-tool-container">
        <ListEmpty message={membersUnavailableMessage} />
      </List>
    )
  }

  const shouldShowLoadingMessage =
    isLoading &&
    linkInvites.length === 0 &&
    allPendingInvites.length === 0 &&
    members.length === 0

  return (
    <List itemCount={itemCount} onSelect={handleSelect} testId="workspace-members-tool-container">
      {/* Email invite input row - only works for existing users */}
      <ListRowWithInput
        index={0}
        icon={<Mail size={16} />}
        type="email"
        placeholder="Invite existing user by email..."
        value={inviteEmail}
        onChange={setInviteEmail}
        disabled={isInviting}
        testId="invite-email-input"
      />

      {/* Invite button row - animates in/out based on email input */}
      <ListRow
        index={1}
        icon={<UserPlus size={16} />}
        title={isInviting ? "Inviting..." : "Invite"}
        isCreateAction
        disabled={isInviting}
        onClick={handleInvite}
        testId="invite-submit-button"
        show={hasEmailInput}
      />

      {/* Error message for invite */}
      {inviteError && <div className={styles.listInviteError}>{inviteError}</div>}

      {/* Create invite link row OR display invite link */}
      {!inviteLinkUrl ? (
        <ListRow
          index={createLinkIndex}
          icon={<Link size={16} />}
          title={isCreatingInviteLink ? "Creating..." : "Create Invite Link"}
          isCreateAction
          disabled={isCreatingInviteLink}
          onClick={handleCreateInviteLink}
          testId="create-invite-link-button"
        />
      ) : (
        <ListRow
          index={createLinkIndex}
          icon={linkCopied ? <Check size={16} /> : <Copy size={16} />}
          title={inviteLinkUrl}
          meta={linkCopied ? "Copied." : "Click to copy"}
          onClick={handleCopyInviteLink}
          testId="invite-link-input"
        />
      )}

      {/* Error message for invite link */}
      {inviteLinkError && <div className={styles.listInviteError}>{inviteLinkError}</div>}

      {/* Loading state while network queries hydrate */}
      {shouldShowLoadingMessage && <ListEmpty message="Loading..." />}

      {/* Invite links section - shows active shareable invite links */}
      {linkInvites.length > 0 && (
        <>
          <ListSectionHeader title="Invite Links" count={linkInvites.length} />
          {linkInvites.map((invite: LinkInviteResponse, index: number) => (
            <ListRow
              key={`link-${invite.id}`}
              index={baseItemCount + index}
              icon={<Link size={16} />}
              title={`Created ${formatDate(invite.created_at)}`}
              meta={formatExpiration(invite.expires_at)}
              onClick={() => showLinkInviteSidecar(invite)}
              isSelected={selectedContext?.type === "link-invite" && selectedContext.invite.id === invite.id}
              testId="link-invite-row"
            />
          ))}
        </>
      )}

      {/* Pending invites section */}
      {allPendingInvites.length > 0 && (
        <>
          <ListSectionHeader title="Pending Invites" count={allPendingInvites.length} />
          {allPendingInvites.map((invite, index) => (
            <ListRow
              key={`pending-${invite.id}`}
              index={baseItemCount + linkInvites.length + index}
              icon={invite.type === "user" ? <Users size={16} /> : <Mail size={16} />}
              title={invite.name || invite.email}
              meta={`${invite.role} • Invited ${formatDate(invite.createdAt)}`}
              onClick={() => showPendingInviteSidecar(invite)}
              isSelected={
                selectedContext?.type === "pending-invite" && selectedContext.invite.id === invite.id
              }
              testId="pending-invite-row"
            />
          ))}
        </>
      )}

      {/* Members section */}
      {members.length > 0 && (
        <>
          <ListSectionHeader title="Members" count={members.length} />
          {members.map((member: WorkspaceMember, index: number) => (
            <ListRow
              key={member.userId}
              index={baseItemCount + linkInvites.length + allPendingInvites.length + index}
              icon={
                <WorkspaceMemberAvatar
                  userId={member.userId}
                  displayName={member.displayName || member.user?.email || "Unknown"}
                  avatarDataUrl={member.avatarDataUrl}
                  size={24}
                  fontSize={12}
                />
              }
              title={member.displayName || member.user?.email || "Unknown"}
              meta={member.user?.email || ""}
              accessory={
                <span className={styles.listRoleBadge}>
                  {getRoleIcon(member.role)}
                  {member.role.replace("_", " ")}
                </span>
              }
              testId={`member-row-${index}`}
            />
          ))}
        </>
      )}

      {/* Empty state */}
      {members.length === 0 &&
        allPendingInvites.length === 0 &&
        linkInvites.length === 0 &&
        <ListEmpty message="No members yet. Invite someone to get started!" />}
    </List>
  )
}
