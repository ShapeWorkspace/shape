import { useEffect, useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { useEngineStore } from "../engine-store"
import { queryKeys } from "./query-keys"
import type { InAppNotification } from "../../../engine/models/notification"

/**
 * Query hook for fetching in-app notifications for the current workspace.
 * Data is sourced from the engine's notification cache with SSE updates.
 */
export function useNotifications() {
  const { application } = useEngineStore()
  const notificationService = application?.getNotificationService()
  const workspaceId = application?.workspaceId ?? ""

  const [notifications, setNotifications] = useState<InAppNotification[]>(() => {
    if (!notificationService) return []
    return notificationService.getCachedNotifications()
  })

  useEffect(() => {
    if (!notificationService || !application?.isWorkspaceRemote()) return
    const unsubscribe = notificationService.onNotificationsChange(updated => {
      setNotifications(updated)
    })
    return unsubscribe
  }, [application, notificationService])

  useEffect(() => {
    if (!notificationService || !application?.isWorkspaceRemote()) return
    setNotifications(notificationService.getCachedNotifications())
  }, [application, notificationService])

  const { isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.notifications.byWorkspace(workspaceId),
    queryFn: async () => {
      if (!application) {
        throw new Error("Not initialized")
      }

      await application.getNotificationService().fetchNotifications()
      return null
    },
    enabled: !!application && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })

  return {
    data: notifications,
    isLoading: isLoading && notifications.length === 0,
    isFetching,
    isError,
    error,
    refetch,
  }
}

/**
 * Mutation hook for marking a single notification as read.
 */
export function useMarkNotificationRead() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async (notificationId: string) => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application?.isWorkspaceRemote()) {
        throw new Error("Notifications are unavailable in local-only workspaces")
      }

      return application.getNotificationService().markNotificationRead(notificationId)
    },
    networkMode: "always",
  })
}

/**
 * Mutation hook for marking all notifications as read.
 */
export function useMarkAllNotificationsRead() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async () => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application?.isWorkspaceRemote()) {
        throw new Error("Notifications are unavailable in local-only workspaces")
      }

      await application.getNotificationService().markAllNotificationsRead()
      return null
    },
    networkMode: "always",
  })
}
