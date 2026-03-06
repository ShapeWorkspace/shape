import { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { useEngineStore } from "../engine-store"
import { queryKeys } from "./query-keys"
import type {
  EntitySubscription,
  NotificationEntityReferenceType,
} from "../../../engine/models/notification"

/**
 * Query hook for fetching all notification subscriptions for the current user.
 */
export function useNotificationSubscriptions() {
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const notificationService = application?.getNotificationService()

  const [subscriptions, setSubscriptions] = useState<EntitySubscription[]>(() => {
    if (!notificationService) return []
    return notificationService.getCachedSubscriptions()
  })

  useEffect(() => {
    if (!notificationService || !application?.isWorkspaceRemote()) return
    const unsubscribe = notificationService.onSubscriptionsChange(updated => {
      setSubscriptions(updated)
    })
    return unsubscribe
  }, [notificationService, application])

  useEffect(() => {
    if (!notificationService || !application?.isWorkspaceRemote()) return
    setSubscriptions(notificationService.getCachedSubscriptions())
  }, [notificationService, application])

  const { isLoading, isFetching } = useQuery({
    queryKey: queryKeys.notificationSubscriptions.byWorkspace(workspaceId),
    queryFn: async () => {
      if (!application) {
        throw new Error("Not initialized")
      }

      await application.getNotificationService().fetchSubscriptions()
      return null
    },
    enabled: !!application && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })

  return {
    data: subscriptions,
    isLoading: isLoading && subscriptions.length === 0,
    isFetching,
  }
}

/**
 * Hook for a single entity subscription with subscribe/unsubscribe helpers.
 */
export function useNotificationSubscription(entityType: NotificationEntityReferenceType, entityId: string) {
  const { application } = useEngineStore()
  const { data: subscriptions, isLoading } = useNotificationSubscriptions()

  const subscription = useMemo(() => {
    return subscriptions.find(entry => entry.entityType === entityType && entry.entityId === entityId) ?? null
  }, [subscriptions, entityType, entityId])

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application?.isWorkspaceRemote()) {
        throw new Error("Notification subscriptions are unavailable in local-only workspaces")
      }

      return application.getNotificationService().subscribeToEntity(entityType, entityId)
    },
    networkMode: "always",
  })

  const unsubscribeMutation = useMutation({
    mutationFn: async () => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application?.isWorkspaceRemote()) {
        throw new Error("Notification subscriptions are unavailable in local-only workspaces")
      }

      await application.getNotificationService().unsubscribeFromEntity(entityType, entityId)
      return null
    },
    networkMode: "always",
  })

  const isSubscribed = !!subscription
  const isSaving = subscribeMutation.isPending || unsubscribeMutation.isPending

  return {
    subscription,
    isSubscribed,
    isLoading,
    isSaving,
    subscribe: subscribeMutation.mutate,
    unsubscribe: unsubscribeMutation.mutate,
  }
}

export function useNotificationSubscriptionToggle(entityType: NotificationEntityReferenceType, entityId: string) {
  const { isSubscribed, isLoading, isSaving, subscribe, unsubscribe } = useNotificationSubscription(entityType, entityId)

  const toggleSubscription = useCallback(() => {
    if (isSaving) return
    if (isSubscribed) {
      unsubscribe()
      return
    }
    subscribe()
  }, [isSaving, isSubscribed, subscribe, unsubscribe])

  return {
    isSubscribed,
    isLoading,
    isSaving,
    toggleSubscription,
  }
}
