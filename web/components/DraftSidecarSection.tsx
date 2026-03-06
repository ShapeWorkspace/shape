import { useMemo, type ReactNode } from "react"
import { AlertTriangle, Check, RefreshCcw, RotateCcw, Trash2, X, Loader2, LogIn } from "lucide-react"
import {
  SidecarSection,
  SidecarDescription,
  SidecarMetaList,
  SidecarMetaItem,
  SidecarMenu,
  SidecarRow,
} from "./SidecarUI"
import type { DraftState } from "../hooks/useDraftState"
import { useReachability } from "../hooks/use-reachability"
import { useAuthStore } from "../store/auth-store"
import { useEngineStore } from "../store/engine-store"
import * as styles from "../styles/sidecar.css"

// DraftSidecarSection renders draft status, diffs, and actions in entity sidecars.

interface DraftDiffRow {
  label: string
  localValue: string
  serverValue: string
}

interface DraftActionRow {
  title: string
  icon: ReactNode
  onClick?: () => void
  isDestructive?: boolean
  isDisabled?: boolean
}

interface DraftSidecarSectionProps {
  entityLabel: string
  draftState: DraftState
  canonicalUpdatedAt?: Date | null
  localUpdatedAt?: Date | null
  diffRows?: DraftDiffRow[]
  startIndex: number
  onRetry: () => void
  onDiscard: () => void
  onForceSave?: () => void
  onRestore?: () => void
  onSyncAllDrafts?: () => void
}

export function DraftSidecarSection({
  entityLabel,
  draftState,
  canonicalUpdatedAt,
  localUpdatedAt,
  diffRows = [],
  startIndex,
  onRetry,
  onDiscard,
  onForceSave,
  onRestore,
  onSyncAllDrafts,
}: DraftSidecarSectionProps) {
  const { isOnline } = useReachability()
  const { currentUser } = useAuthStore()
  const { application } = useEngineStore()
  const isUserAuthenticated = !!currentUser
  const canAttemptSync = Boolean(application?.isWorkspaceRemote()) && isUserAuthenticated && isOnline
  const shouldSurfaceSyncError =
    draftState.hasError && Boolean(application?.isWorkspaceRemote()) && isUserAuthenticated
  const syncDisabledMessage = !isUserAuthenticated
    ? "once you sign in."
    : !application?.isWorkspaceRemote()
      ? "once this workspace is registered."
      : "when you come back online."
  const shouldHideTransientDraft = draftState.isTransient && isOnline && canAttemptSync

  const actionRows = useMemo<DraftActionRow[]>(() => {
    if (!application?.isWorkspaceRemote() || !isUserAuthenticated) {
      return [
        {
          title: isUserAuthenticated ? "Register workspace to sync" : "Sign in to sync",
          icon: <LogIn size={14} />,
          isDisabled: true,
        },
      ]
    }

    if (draftState.isConflict) {
      return [
        {
          title: "Keep local",
          icon: <Check size={14} />,
          onClick: onForceSave,
        },
        {
          title: "Keep server",
          icon: <X size={14} />,
          onClick: onDiscard,
          isDestructive: true,
        },
      ]
    }

    if (draftState.isOrphaned) {
      return [
        {
          title: "Restore as new",
          icon: <RotateCcw size={14} />,
          onClick: onRestore,
        },
        {
          title: "Discard draft",
          icon: <Trash2 size={14} />,
          onClick: onDiscard,
          isDestructive: true,
        },
      ]
    }

    if (draftState.hasError) {
      return [
        {
          title: "Retry",
          icon: <RefreshCcw size={14} />,
          onClick: onRetry,
        },
      ]
    }

    return [
      {
        title: "Try save",
        icon: <RefreshCcw size={14} />,
        onClick: onSyncAllDrafts ?? onRetry,
      },
    ]
  }, [
    draftState.hasError,
    draftState.isConflict,
    draftState.isOrphaned,
    isUserAuthenticated,
    application,
    onDiscard,
    onForceSave,
    onRetry,
    onRestore,
    onSyncAllDrafts,
  ])

  if (!draftState.hasDraft) {
    return null
  }

  if (shouldHideTransientDraft) {
    return null
  }

  const lastAttemptedSave = application?.isWorkspaceRemote() && isUserAuthenticated
    ? draftState.draftEntity?.lastAttemptedSave
    : null
  const saveError = draftState.draftEntity?.saveError

  return (
    <SidecarSection title="Draft">
      {canAttemptSync &&
        draftState.isTransient &&
        !draftState.isConflict &&
        !draftState.isOrphaned &&
        !shouldSurfaceSyncError && (
          <SidecarMetaList>
            <SidecarMetaItem
              icon={<Loader2 size={12} className={styles.sidecarSpinner} />}
              label="Status"
              value="Saving..."
            />
          </SidecarMetaList>
        )}

      {draftState.isConflict && (
        <>
          <SidecarDescription>
            This {entityLabel} has local changes and server changes. Which do you want to keep?
          </SidecarDescription>
          {diffRows.length > 0 && (
            <div className={styles.draftDiffList}>
              {diffRows.map(row => (
                <div key={row.label} className={styles.draftDiffRow}>
                  <div className={styles.draftDiffLabel}>{row.label}</div>
                  <div className={styles.draftDiffValues}>
                    <div className={styles.draftDiffValue}>
                      <span className={styles.draftDiffValueLabel}>Local</span>
                      <span>{row.localValue}</span>
                    </div>
                    <div className={styles.draftDiffValue}>
                      <span className={styles.draftDiffValueLabel}>Server</span>
                      <span>{row.serverValue}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {draftState.isOrphaned && (
        <SidecarDescription>This {entityLabel} was deleted on the server.</SidecarDescription>
      )}

      {shouldSurfaceSyncError && (
        <SidecarDescription>
          <span className={styles.draftWarning}>
            <AlertTriangle size={12} />
            {saveError || "Failed to save"}
          </span>
        </SidecarDescription>
      )}

      {!draftState.isConflict &&
        !draftState.isOrphaned &&
        !shouldSurfaceSyncError &&
        (!draftState.isTransient || !isOnline || !canAttemptSync) && (
          <SidecarDescription>
            <span data-testid="draft-offline-warning">
              This {entityLabel} will be synced {syncDisabledMessage}
            </span>
          </SidecarDescription>
        )}

      <SidecarMetaList>
        {localUpdatedAt && (
          <SidecarMetaItem label="Last local change" value={formatTimestamp(localUpdatedAt)} />
        )}
        {canonicalUpdatedAt && (
          <SidecarMetaItem label="Last server change" value={formatTimestamp(canonicalUpdatedAt)} />
        )}
        {lastAttemptedSave && (
          <SidecarMetaItem label="Last save attempt" value={formatTimestamp(new Date(lastAttemptedSave))} />
        )}
      </SidecarMetaList>

      {actionRows.length > 0 && (
        <SidecarMenu>
          {actionRows.map((action, idx) => (
            <SidecarRow
              key={action.title}
              index={startIndex + idx}
              icon={action.icon}
              title={action.title}
              onClick={action.onClick}
              isDestructive={action.isDestructive}
              disabled={action.isDisabled}
            />
          ))}
        </SidecarMenu>
      )}
    </SidecarSection>
  )
}

function formatTimestamp(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}
