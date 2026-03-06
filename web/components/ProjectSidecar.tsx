import { useCallback, useMemo, useState, useRef, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Calendar, Users, Pencil } from "lucide-react"
import { useSidecar } from "../contexts/SidecarContext"
import { useDrafts } from "../contexts/DraftContext"
import { useDraftState } from "../hooks/useDraftState"
import {
  Sidecar,
  SidecarSection,
  SidecarRow,
  SidecarMenu,
  SidecarMetaList,
  SidecarMetaItem,
} from "./SidecarUI"
import { FormSidecar } from "./FormSidecar"
import { MemberSelectionField, type SelectedMember, type MemberSelectionFieldRef } from "./MemberSelectionField"
import { DraftSidecarSection } from "./DraftSidecarSection"
import { ManageMembersSidecarMenu } from "./ManageMembersSidecarMenu"
import { useProjectACLMemberCount, useCreateProjectACLEntry } from "../store/queries/use-project-acl"
import { useUpdateProject, useProject, useCreateProject } from "../store/queries/use-projects"
import { useEngineStore } from "../store/engine-store"
import { useAuthStore } from "../store/auth-store"
import { useWindowStore } from "../store/window-store"
import type { DecryptedProject } from "../../engine/models/entity"
import { CopyLinkSidecarRow } from "./CopyLinkSidecarRow"
import { LinksSidecarSection, useLinksSidecarItemCount } from "./LinksSidecarSection"
import { NotificationSubscriptionSidecarRow } from "./NotificationSubscriptionSidecarRow"
import { useNotificationSubscriptionToggle } from "../store/queries/use-notification-subscriptions"
import * as styles from "../styles/sidecar.css"

/**
 * Props for ProjectSidecar component.
 */
interface ProjectSidecarProps {
  // The project to display in the sidecar (used as initial data, fresh data fetched via hook)
  project: DecryptedProject
}

/**
 * ProjectSidecar displays contextual information and actions for a project.
 * Shown when viewing a project (not a specific task).
 *
 * Sections:
 * - Details: created date, updated date
 * - Actions: Manage members
 */
export function ProjectSidecar({ project: initialProject }: ProjectSidecarProps) {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { pushSidecar } = useSidecar()
  // Fetch fresh project data to reflect updates (e.g., after rename).
  // Falls back to initialProject while loading or if query fails.
  const { data: freshProject } = useProject(initialProject.id)
  const project = freshProject ?? initialProject
  const { data: memberCount } = useProjectACLMemberCount(project.id)
  const { application } = useEngineStore()
  const { retryDraft, discardDraft, forceSaveWithExpectedHash, restoreDraftAsNew, syncAllDrafts } =
    useDrafts()

  // Get canonical project for draft conflict detection
  const canonicalProject = useMemo((): DecryptedProject | null => {
    if (!application) return null
    return application.getCacheStores().entityStore.getCanonical<DecryptedProject>(project.id) ?? null
  }, [application, project.id])

  // Draft state for offline/conflict handling
  const draftState = useDraftState({
    entityType: "project",
    entityId: project.id,
    canonicalContentHash: canonicalProject?.contentHash,
    canonicalExists: Boolean(canonicalProject),
  })

  // Count of draft action rows for keyboard navigation
  const draftActionCount = draftState.hasDraft ? (draftState.isConflict || draftState.isOrphaned ? 2 : 1) : 0

  // Get count of entity links for keyboard navigation
  const linksItemCount = useLinksSidecarItemCount(project.id, "project")
  const { currentUser } = useAuthStore()
  const workspaceMemberManager = application?.getWorkspaceMemberManager()
  const isMemberManagementDisabled = !application?.isWorkspaceRemote()
  const subscriptionDisabledMeta = currentUser
    ? "Sync required to manage notifications."
    : "Sign in to manage notifications."

  // Get creator name - first check if it's the current user, then fall back to member service
  const creatorName = useMemo(() => {
    if (!project.creatorId) return "Unknown"

    // If the creator is the current user, use their name directly
    if (currentUser && currentUser.uuid === project.creatorId) {
      return "You"
    }

    // Otherwise look up from member service
    if (workspaceMemberManager) {
      const members = workspaceMemberManager.getWorkspaceMembers()
      const member = members.find(m => m.userId === project.creatorId)
      if (member) {
        return member.displayName
      }
    }

    return "Unknown"
  }, [project.creatorId, currentUser, workspaceMemberManager])

  // Format date for display
  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  // Format member count display
  const memberCountDisplay = useMemo(() => {
    if (isMemberManagementDisabled) {
      return currentUser ? "Sync required" : "Sign in to manage"
    }
    if (memberCount === undefined) return "Loading..."
    if (memberCount === 1) return "1 member"
    return `${memberCount} members`
  }, [memberCount, isMemberManagementDisabled, currentUser])

  // Handle rename - push rename sidecar
  const handleStartRename = useCallback(() => {
    pushSidecar(<ProjectRenameSidecar project={project} />, "Rename")
  }, [pushSidecar, project])

  // Handle navigating to manage members view
  const handleManageMembers = useCallback(() => {
    if (isMemberManagementDisabled) {
      return
    }
    pushSidecar(
      <ManageMembersSidecarMenu
        resourceType="project"
        resourceId={project.id}
        creatorId={project.creatorId}
        creatorName={creatorName}
      />,
      "Members"
    )
  }, [pushSidecar, project.id, project.creatorId, creatorName, isMemberManagementDisabled])

  // Draft action handlers
  const handleRetryDraft = useCallback(() => {
    retryDraft("project", project.id)
  }, [retryDraft, project.id])

  const handleDiscardDraft = useCallback(() => {
    discardDraft("project", project.id)
  }, [discardDraft, project.id])

  const handleForceSave = useCallback(() => {
    if (canonicalProject) {
      forceSaveWithExpectedHash("project", project.id, canonicalProject.contentHash)
    }
  }, [forceSaveWithExpectedHash, project.id, canonicalProject])

  const handleRestore = useCallback(() => {
    restoreDraftAsNew("project", project.id)
  }, [restoreDraftAsNew, project.id])

  const handleSyncAllDrafts = useCallback(() => {
    syncAllDrafts()
  }, [syncAllDrafts])

  const { isSubscribed, isLoading: isSubscriptionLoading, isSaving, toggleSubscription } = useNotificationSubscriptionToggle("project", project.id)

  // Handle keyboard selection - account for draft actions at the start
  const handleSelect = useCallback(
    (index: number) => {
      const adjustedIndex = index - draftActionCount
      switch (adjustedIndex) {
        case 0:
          handleStartRename()
          break
        case 1:
          handleManageMembers()
          break
        case 2:
          if (!isMemberManagementDisabled) {
            toggleSubscription()
          }
          break
      }
    },
    [handleStartRename, handleManageMembers, toggleSubscription, draftActionCount, isMemberManagementDisabled]
  )

  // Build diff rows for conflict display
  const diffRows = useMemo(() => {
    if (!draftState.isConflict || !canonicalProject) return []
    return [
      {
        label: "Name",
        localValue: project.content.name,
        serverValue: canonicalProject.content.name,
      },
    ]
  }, [draftState.isConflict, canonicalProject, project.content.name])

  // Total item count: draft actions + 4 base actions + links
  const totalItemCount = draftActionCount + 4 + linksItemCount

  return (
    <Sidecar itemCount={totalItemCount} onSelect={handleSelect}>
      {/* Draft Section - shown when there's a draft */}
      <DraftSidecarSection
        entityLabel="project"
        draftState={draftState}
        canonicalUpdatedAt={canonicalProject?.updatedAt}
        localUpdatedAt={
          draftState.draftEntity ? new Date(draftState.draftEntity.entity.updated_at) : project.updatedAt
        }
        diffRows={diffRows}
        startIndex={0}
        onRetry={handleRetryDraft}
        onDiscard={handleDiscardDraft}
        onForceSave={handleForceSave}
        onRestore={handleRestore}
        onSyncAllDrafts={handleSyncAllDrafts}
      />

      {/* Details Section */}
      <SidecarSection title="Details">
        <SidecarMetaList>
          <SidecarMetaItem
            icon={<Calendar size={12} />}
            label="Created"
            value={formatDate(project.createdAt)}
          />
          <SidecarMetaItem
            icon={<Calendar size={12} />}
            label="Updated"
            value={formatDate(project.updatedAt)}
          />
        </SidecarMetaList>
      </SidecarSection>

      {/* Actions Section */}
      <SidecarSection title="Actions">
        <SidecarMenu>
          <SidecarRow
            index={draftActionCount}
            icon={<Pencil size={14} />}
            title="Rename"
            onClick={handleStartRename}
            testId="project-rename"
          />
          <SidecarRow
            index={draftActionCount + 1}
            icon={<Users size={14} />}
            title="Manage members"
            meta={memberCountDisplay}
            onClick={handleManageMembers}
            disabled={isMemberManagementDisabled}
            testId="project-manage-members"
          />
          <NotificationSubscriptionSidecarRow
            index={draftActionCount + 2}
            isSubscribed={isSubscribed}
            isLoading={isSubscriptionLoading}
            isSaving={isSaving}
            onToggle={toggleSubscription}
            isDisabled={isMemberManagementDisabled}
            disabledMeta={subscriptionDisabledMeta}
            testId="project-subscription-toggle"
          />
          {workspaceId && (
            <CopyLinkSidecarRow
              workspaceId={workspaceId}
              tool="projects"
              entityId={project.id}
              index={draftActionCount + 3}
            />
          )}
        </SidecarMenu>
      </SidecarSection>

      {/* Entity Links Section */}
      <LinksSidecarSection entityId={project.id} entityType="project" startIndex={draftActionCount + 4} />
    </Sidecar>
  )
}

/**
 * ProjectRenameSidecar allows renaming a project.
 * Updates both the breadcrumb label and sidecar title after successful rename.
 */
interface ProjectRenameSidecarProps {
  project: DecryptedProject
}

function ProjectRenameSidecar({ project }: ProjectRenameSidecarProps) {
  const { popSidecar, updateSidecarTitle } = useSidecar()
  const { updateCurrentItemLabel } = useWindowStore()
  const { mutate: updateProject, isPending } = useUpdateProject()
  const [name, setName] = useState(project.content.name)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input on mount and select all text
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleSubmit = useCallback(() => {
    if (name.trim() && name !== project.content.name) {
      const trimmedName = name.trim()
      updateProject(
        { projectId: project.id, name: trimmedName },
        {
          onSuccess: () => {
            // Update the breadcrumb label in the window store (this also updates the sidebar)
            updateCurrentItemLabel(trimmedName)
            // Pop first to get back to ProjectSidecar, then update its title
            popSidecar()
            // Now update the sidecar title (which is now ProjectSidecar)
            updateSidecarTitle(trimmedName)
          },
        }
      )
    } else {
      popSidecar()
    }
  }, [name, project, updateProject, popSidecar, updateCurrentItemLabel, updateSidecarTitle])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSubmit()
      } else if (e.key === "Escape") {
        popSidecar()
      }
    },
    [handleSubmit, popSidecar]
  )

  return (
    <Sidecar itemCount={0} onSelect={() => {}}>
      <SidecarSection title="New name">
        <div className={styles.sidecarInputContainer}>
          <input
            ref={inputRef}
            type="text"
            className={styles.sidecarInput}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isPending}
            data-testid="project-rename-input"
          />
          <div className={styles.sidecarInputActions}>
            <button className={styles.sidecarCancelButton} onClick={() => popSidecar()} disabled={isPending}>
              Cancel
            </button>
            <button
              className={styles.sidecarConfirmButton}
              onClick={handleSubmit}
              disabled={isPending || !name.trim()}
            >
              Save
            </button>
          </div>
        </div>
      </SidecarSection>
    </Sidecar>
  )
}

/**
 * CreateProjectSidecar is the form shown in the sidecar for creating a new project.
 * After successful creation, navigates to the newly created project.
 * Includes member selection to add collaborators during creation.
 */
interface CreateProjectSidecarProps {
  // Callback to clear the sidecar after creation or cancellation
  onCancel: () => void
}

export function CreateProjectSidecar({ onCancel }: CreateProjectSidecarProps) {
  const navigate = useNavigate()
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { navigateTo } = useWindowStore()
  const { clearSidecar } = useSidecar()
  const { mutateAsync: createProject } = useCreateProject()
  const { mutateAsync: createACLEntry } = useCreateProjectACLEntry()
  const [selectedMembers, setSelectedMembers] = useState<SelectedMember[]>([])
  const memberSelectionRef = useRef<MemberSelectionFieldRef>(null)

  const handleSubmit = useCallback(
    async (values: Record<string, string | boolean>) => {
      const name = values.name as string
      if (!name.trim() || !workspaceId) return

      // Create the project first
      const project = await createProject(name.trim())

      // Then create ACL entries for selected members
      // We don't await all of these - if some fail, the project still exists
      // and the user can add members later via the manage members UI
      for (const member of selectedMembers) {
        try {
          await createACLEntry({
            projectId: project.id,
            subjectType: member.subjectType,
            subjectId: member.subjectId,
            permission: member.permission,
          })
        } catch (error) {
          // Log but don't fail - project is created, member can be added later
          console.error("Failed to add member to project:", error)
        }
      }

      // Clear the sidecar first, then navigate to the new project
      clearSidecar()
      navigateTo({
        id: project.id,
        label: project.content.name,
        tool: "projects",
        itemId: project.id,
      })
      navigate(`/w/${workspaceId}/projects/${project.id}`)
    },
    [workspaceId, createProject, createACLEntry, selectedMembers, clearSidecar, navigateTo, navigate]
  )

  return (
    <FormSidecar
      title="Project name"
      fields={[
        {
          name: "name",
          type: "text",
          label: "Name",
          placeholder: "Project name...",
          required: true,
          testId: "new-project-name-input",
        },
      ]}
      onSubmit={handleSubmit}
      onCancel={onCancel}
      submitLabel="Create"
      memberSelectionRef={memberSelectionRef}
    >
      <MemberSelectionField
        ref={memberSelectionRef}
        selectedMembers={selectedMembers}
        onMembersChange={setSelectedMembers}
      />
    </FormSidecar>
  )
}
