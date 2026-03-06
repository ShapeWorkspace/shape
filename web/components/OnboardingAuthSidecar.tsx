import { useCallback, useEffect, useMemo, useState } from "react"
import { LogIn, UserPlus, Pencil } from "lucide-react"
import { isTauriMobileApp } from "@shape/engine/utils/tauri-runtime"
import { useSidecar } from "../contexts/SidecarContext"
import { useWorkspaceStore } from "../store/workspace-store"
import { useActiveWorkspaceInfo } from "../hooks/use-active-workspace-info"
import { FormSidecar } from "./FormSidecar"
import { Sidecar, SidecarSection, SidecarMenu, SidecarRow, SidecarDescription } from "./SidecarUI"
import { AuthFormSidecar } from "./AuthFormSidecar"

interface RenameWorkspaceSidecarProps {
  onCancel: () => void
}

function RenameWorkspaceSidecar({ onCancel }: RenameWorkspaceSidecarProps) {
  const activeWorkspaceInfo = useActiveWorkspaceInfo()
  const renameWorkspace = useWorkspaceStore(state => state.renameWorkspace)
  const [isWorkspaceRenameInProgress, setIsWorkspaceRenameInProgress] = useState(false)
  const [workspaceRenameErrorMessage, setWorkspaceRenameErrorMessage] = useState<string | null>(null)

  const handleWorkspaceRenameSubmit = useCallback(
    async (values: Record<string, string | boolean>) => {
      if (!activeWorkspaceInfo) {
        setWorkspaceRenameErrorMessage("Workspace not available")
        return
      }

      const nameValue = values.name
      if (typeof nameValue !== "string") {
        setWorkspaceRenameErrorMessage("Workspace name is required")
        return
      }

      setIsWorkspaceRenameInProgress(true)
      setWorkspaceRenameErrorMessage(null)

      try {
        await renameWorkspace(activeWorkspaceInfo.uuid, nameValue)
        onCancel()
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to rename workspace"
        setWorkspaceRenameErrorMessage(message)
      } finally {
        setIsWorkspaceRenameInProgress(false)
      }
    },
    [activeWorkspaceInfo, renameWorkspace, onCancel]
  )

  return (
    <FormSidecar
      title="Rename Workspace"
      fields={[
        {
          name: "name",
          type: "text",
          label: "Workspace name",
          required: true,
          placeholder: "Untitled Workspace",
          defaultValue: activeWorkspaceInfo?.name ?? "",
          testId: "workspace-rename-input",
          autoFocus: true,
        },
      ]}
      onSubmit={handleWorkspaceRenameSubmit}
      onCancel={onCancel}
      submitLabel="Save"
      cancelLabel="Back"
      isPending={isWorkspaceRenameInProgress}
      errorMessage={workspaceRenameErrorMessage}
    />
  )
}

export function OnboardingAuthSidecar() {
  const { pushSidecar, popSidecar, setCollapseDisabled } = useSidecar()

  // Determine the appropriate data loss warning based on platform.
  // In the mobile app, data is lost when uninstalling or losing the phone.
  // In the browser, data is lost when clearing browser data.
  const dataLossWarning = useMemo(() => {
    if (isTauriMobileApp()) {
      return "will be lost if you uninstall the app or lose your phone"
    }
    return "will be lost if you clear browser data"
  }, [])

  useEffect(() => {
    // The onboarding sidecar must remain visible for anonymous users.
    setCollapseDisabled(true)
    return () => {
      setCollapseDisabled(false)
    }
  }, [setCollapseDisabled])

  const handleOpenSignInSidecar = useCallback(() => {
    pushSidecar(<AuthFormSidecar mode="signin" />, "Sign In", { route: "/auth/signin" })
  }, [pushSidecar])

  const handleOpenSignUpSidecar = useCallback(() => {
    pushSidecar(<AuthFormSidecar mode="signup" />, "Sign Up", { route: "/auth/signup" })
  }, [pushSidecar])

  const handleOpenRenameWorkspaceSidecar = useCallback(() => {
    pushSidecar(<RenameWorkspaceSidecar onCancel={popSidecar} />, "Rename Workspace")
  }, [pushSidecar, popSidecar])

  const handleSidecarSelection = useCallback(
    (index: number) => {
      if (index === 0) {
        handleOpenSignInSidecar()
        return
      }
      if (index === 1) {
        handleOpenSignUpSidecar()
        return
      }
      if (index === 2) {
        handleOpenRenameWorkspaceSidecar()
      }
    },
    [handleOpenSignInSidecar, handleOpenSignUpSidecar, handleOpenRenameWorkspaceSidecar]
  )

  return (
    <Sidecar itemCount={3} onSelect={handleSidecarSelection}>
      <SidecarSection title="Welcome">
        <SidecarDescription>
          Welcome to Shape. You can use the app offline, but your data is stored locally and {dataLossWarning}.
          Sign in or sign up to securely sync your data.
        </SidecarDescription>
      </SidecarSection>
      <SidecarSection title="Actions">
        <SidecarMenu>
          <SidecarRow
            index={0}
            icon={<LogIn size={14} />}
            title="Sign In"
            onClick={handleOpenSignInSidecar}
            testId="onboarding-signin"
          />
          <SidecarRow
            index={1}
            icon={<UserPlus size={14} />}
            title="Sign Up"
            onClick={handleOpenSignUpSidecar}
            testId="onboarding-signup"
          />
          <SidecarRow
            index={2}
            icon={<Pencil size={14} />}
            title="Rename Workspace"
            onClick={handleOpenRenameWorkspaceSidecar}
            testId="onboarding-rename-workspace"
          />
        </SidecarMenu>
      </SidecarSection>
    </Sidecar>
  )
}
