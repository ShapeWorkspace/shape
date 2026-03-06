import { useEffect, useMemo, useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { useEngineStore } from "../engine-store"
import { queryKeys } from "./query-keys"
import type { NotificationActionType, NotificationPreferenceState } from "../../../engine/models/notification"

interface UpdatePreferenceInput {
  actionType: NotificationActionType
  pushEnabled: boolean
}

/**
 * Query hook for fetching and updating notification settings for the current workspace.
 */
export function useNotificationSettings() {
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const notificationService = application?.getNotificationService()

  const [preferences, setPreferences] = useState<NotificationPreferenceState[]>(() => {
    if (!notificationService) return []
    return notificationService.getCachedPreferences()
  })

  useEffect(() => {
    if (!notificationService || !application?.isWorkspaceRemote()) return
    const unsubscribe = notificationService.onPreferencesChange(updated => {
      setPreferences(updated)
    })
    return unsubscribe
  }, [notificationService, application])

  useEffect(() => {
    if (!notificationService || !application?.isWorkspaceRemote()) return
    setPreferences(notificationService.getCachedPreferences())
  }, [notificationService, application])

  const { isLoading, isFetching } = useQuery({
    queryKey: queryKeys.notificationSettings.byWorkspace(workspaceId),
    queryFn: async () => {
      if (!application) {
        throw new Error("Not initialized")
      }

      await application.getNotificationService().fetchNotificationSettings()
      return null
    },
    enabled: !!application && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })

  const [pendingActionType, setPendingActionType] = useState<NotificationActionType | null>(null)

  const updateMutation = useMutation({
    mutationFn: async (input: UpdatePreferenceInput) => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application?.isWorkspaceRemote()) {
        throw new Error("Notification settings are unavailable in local-only workspaces")
      }

      await application.getNotificationService().updateNotificationSettings([
        { actionType: input.actionType, pushEnabled: input.pushEnabled },
      ])
      return null
    },
    onMutate: input => {
      setPendingActionType(input.actionType)
    },
    onSettled: () => {
      setPendingActionType(null)
    },
    networkMode: "always",
  })

  const preferencesByActionType = useMemo(() => {
    const map = new Map<NotificationActionType, NotificationPreferenceState>()
    for (const preference of preferences) {
      map.set(preference.actionType, preference)
    }
    return map
  }, [preferences])

  return {
    data: preferences,
    preferencesByActionType,
    isLoading: isLoading && preferences.length === 0,
    isFetching,
    isUpdating: updateMutation.isPending,
    pendingActionType,
    updatePreference: updateMutation.mutate,
  }
}
