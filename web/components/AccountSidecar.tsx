import { useCallback, useMemo, useRef, useState } from "react"
import type { ChangeEvent } from "react"
import { Mail, Pencil } from "lucide-react"
import { useSidecar } from "../contexts/SidecarContext"
import { useAuthStore } from "../store/auth-store"
import { useEngineStore } from "../store/engine-store"
import { useCurrentUserWorkspaceMember } from "../store/queries/use-workspace-members"
import { FormSidecar } from "./FormSidecar"
import { WorkspaceMemberAvatar } from "./WorkspaceMemberAvatar"
import {
  Sidecar,
  SidecarSection,
  SidecarRow,
  SidecarMenu,
  SidecarMetaList,
  SidecarMetaItem,
} from "./SidecarUI"
import { processWorkspaceMemberAvatarFile } from "../lib/workspace-member-avatar"
import * as sidecarStyles from "../styles/sidecar.css"
import * as profileStyles from "../styles/workspace-profile.css"

interface WorkspaceProfileEditSidecarProps {
  onCancel: () => void
}

function WorkspaceProfileEditSidecar({ onCancel }: WorkspaceProfileEditSidecarProps) {
  const { setSidecar } = useSidecar()
  const { application } = useEngineStore()
  const currentWorkspaceMember = useCurrentUserWorkspaceMember()
  const upsertCurrentUserProfile = application?.getUpsertCurrentUserProfile()

  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [avatarErrorMessage, setAvatarErrorMessage] = useState<string | null>(null)

  const [pendingAvatarBase64, setPendingAvatarBase64] = useState<string | null>(
    currentWorkspaceMember?.profile?.avatar ?? null
  )
  const [pendingAvatarType, setPendingAvatarType] = useState<string | null>(
    currentWorkspaceMember?.profile?.avatarType ?? null
  )

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const pendingAvatarDataUrl =
    pendingAvatarBase64 && pendingAvatarType
      ? `data:${pendingAvatarType};base64,${pendingAvatarBase64}`
      : null

  const handleAvatarSelectClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleAvatarFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ""
      if (!file) {
        return
      }

      // Run the crop/resize/compress pipeline before saving the avatar.
      setAvatarErrorMessage(null)

      try {
        const { avatarBase64, avatarType } = await processWorkspaceMemberAvatarFile(file)
        setPendingAvatarBase64(avatarBase64)
        setPendingAvatarType(avatarType)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to process avatar"
        setAvatarErrorMessage(message)
      }
    },
    []
  )

  const handleRemoveAvatar = useCallback(() => {
    setPendingAvatarBase64(null)
    setPendingAvatarType(null)
    setAvatarErrorMessage(null)
  }, [])

  const handleSubmit = useCallback(
    async (values: Record<string, string | boolean>) => {
      if (!upsertCurrentUserProfile || !application) {
        setErrorMessage("User profile update use case not available")
        return
      }

      const nameValue = values.name
      if (typeof nameValue !== "string") {
        setErrorMessage("Name is required")
        return
      }

      setIsSaving(true)
      setErrorMessage(null)

      try {
        const bioValue = typeof values.bio === "string" ? values.bio : undefined
        const result = await upsertCurrentUserProfile.execute({
          currentUserId: application.getAccountUserId(),
          name: nameValue,
          bio: bioValue,
          avatar: pendingAvatarBase64 ?? undefined,
          avatarType: pendingAvatarType ?? undefined,
        })
        if (result.isFailed()) {
          throw new Error(result.getError())
        }
        setSidecar(<AccountSidecar />, "Account")
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update profile"
        setErrorMessage(message)
      } finally {
        setIsSaving(false)
      }
    },
    [application, upsertCurrentUserProfile, pendingAvatarBase64, pendingAvatarType, setSidecar]
  )

  const defaultNameValue = useMemo(() => {
    if (currentWorkspaceMember?.profileNeedsSetup) {
      return ""
    }
    return currentWorkspaceMember?.profile?.name ?? ""
  }, [currentWorkspaceMember])

  const defaultBioValue = useMemo(() => {
    if (currentWorkspaceMember?.profileNeedsSetup) {
      return ""
    }
    return currentWorkspaceMember?.profile?.bio ?? ""
  }, [currentWorkspaceMember])

  const avatarDisplayName =
    currentWorkspaceMember?.profile?.name ||
    currentWorkspaceMember?.displayName ||
    currentWorkspaceMember?.user?.email ||
    "Member"

  return (
    <FormSidecar
      title="Edit Workspace Profile"
      description="Your profile is scoped to this workspace only."
      fields={[
        {
          name: "name",
          type: "text",
          label: "Display name",
          required: true,
          placeholder: "Your name",
          defaultValue: defaultNameValue,
          testId: "workspace-profile-name-input",
          autoFocus: true,
        },
        {
          name: "bio",
          type: "textarea",
          label: "Bio",
          placeholder: "Optional",
          defaultValue: defaultBioValue,
          testId: "workspace-profile-bio-input",
        },
      ]}
      onSubmit={handleSubmit}
      onCancel={onCancel}
      submitLabel="Save"
      cancelLabel="Cancel"
      isPending={isSaving}
      errorMessage={errorMessage}
    >
      <div className={sidecarStyles.sidecarFormField}>
        <label className={sidecarStyles.sidecarFormLabel} htmlFor="workspace-profile-avatar-input">
          Avatar
        </label>
        <div className={profileStyles.profileAvatarRow}>
          <WorkspaceMemberAvatar
            userId={currentWorkspaceMember?.userId ?? "unknown"}
            displayName={avatarDisplayName}
            avatarDataUrl={pendingAvatarDataUrl}
            size={48}
            fontSize={16}
          />
          <div className={profileStyles.profileAvatarActions}>
            <button
              type="button"
              className={profileStyles.profileAvatarButton}
              onClick={handleAvatarSelectClick}
              disabled={isSaving}
            >
              Upload
            </button>
            {pendingAvatarBase64 && (
              <button
                type="button"
                className={profileStyles.profileAvatarRemoveButton}
                onClick={handleRemoveAvatar}
                disabled={isSaving}
              >
                Remove
              </button>
            )}
          </div>
        </div>
        <input
          ref={fileInputRef}
          id="workspace-profile-avatar-input"
          data-testid="workspace-profile-avatar-input"
          type="file"
          accept="image/*"
          onChange={handleAvatarFileChange}
          style={{ display: "none" }}
        />
        {avatarErrorMessage && <div className={sidecarStyles.sidecarFormError}>{avatarErrorMessage}</div>}
      </div>
    </FormSidecar>
  )
}

export function AccountSidecar() {
  const { currentUser } = useAuthStore()
  const { application } = useEngineStore()
  const currentWorkspaceMember = useCurrentUserWorkspaceMember()
  const { pushSidecar, popSidecar } = useSidecar()

  const profileNeedsSetup = currentWorkspaceMember?.profileNeedsSetup ?? false
  const profileName = currentWorkspaceMember?.profile?.name ?? ""
  const profileBio = currentWorkspaceMember?.profile?.bio ?? ""
  const profileDisplayName = profileNeedsSetup ? "Name not set" : profileName || "Unknown"
  const profileEmail = currentWorkspaceMember?.user?.email || currentUser?.email || "Unknown"
  const profileAvatarLabel = profileNeedsSetup
    ? ""
    : currentWorkspaceMember?.profile?.name ||
      currentWorkspaceMember?.displayName ||
      profileEmail ||
      "Member"
  const profileAvatarDataUrl = currentWorkspaceMember?.avatarDataUrl ?? null

  const canEditProfile = Boolean(application)

  const handleOpenEditSidecar = useCallback(() => {
    if (!canEditProfile) {
      return
    }
    pushSidecar(<WorkspaceProfileEditSidecar onCancel={popSidecar} />, "Edit Profile")
  }, [pushSidecar, popSidecar, canEditProfile])

  return (
    <Sidecar itemCount={1} onSelect={handleOpenEditSidecar}>
      <SidecarSection title="Workspace Profile">
        <div className={profileStyles.profileHeader}>
          <WorkspaceMemberAvatar
            userId={currentWorkspaceMember?.userId ?? "unknown"}
            displayName={profileAvatarLabel}
            avatarDataUrl={profileAvatarDataUrl}
            size={48}
            fontSize={16}
          />
          <div className={profileStyles.profileHeaderText}>
            <div className={profileStyles.profileName} data-testid="workspace-profile-info-name">
              {profileDisplayName}
            </div>
            <div className={profileStyles.profileEmail} data-testid="workspace-profile-info-email">
              {profileEmail}
            </div>
          </div>
        </div>
        {profileNeedsSetup ? (
          <div className={profileStyles.profilePlaceholder}>
            Set your name to complete your workspace profile.
          </div>
        ) : (
          <div className={profileStyles.profileBio} data-testid="workspace-profile-info-bio">
            {profileBio || "No bio yet."}
          </div>
        )}
      </SidecarSection>

      <SidecarSection title="Account">
        <SidecarMetaList>
          <SidecarMetaItem icon={<Mail size={12} />} label="Email" value={profileEmail} />
        </SidecarMetaList>
      </SidecarSection>

      <SidecarSection title="Actions">
        <SidecarMenu>
          <SidecarRow
            index={0}
            icon={<Pencil size={14} />}
            title="Edit profile"
            onClick={handleOpenEditSidecar}
            disabled={!canEditProfile}
            testId="workspace-profile-edit-button"
          />
        </SidecarMenu>
      </SidecarSection>
    </Sidecar>
  )
}
