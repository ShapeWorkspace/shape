import { buildApiWorkspacePath } from "../utils/workspace-routes"
import { logger } from "../utils/logger"
import {
  type NotificationActionType,
  type NotificationEntityReferenceType,
  type InAppNotification,
  type InAppNotificationDto,
  type EntitySubscription,
  type EntitySubscriptionDto,
  type NotificationPreferenceState,
  type NotificationPreferenceSummary,
  type DeviceToken,
  type DeviceTokenDto,
  type DeviceTokenPlatform,
  NOTIFICATION_ACTION_DEFINITIONS,
  inAppNotificationFromDto,
  entitySubscriptionFromDto,
  deviceTokenFromDto,
} from "../models/notification"
import { ExecuteAuthenticatedRequest } from "../usecase/network/ExecuteAuthenticatedRequest"
import { SSEConnectionManager } from "./sse-connection-manager"
import {
  SSEEventType,
  type NotificationDeletedEventData,
  type NotificationUpdatedEventData,
} from "./sse-types"

interface ListNotificationsResponse {
  notifications: InAppNotificationDto[]
  has_more: boolean
  page: number
}

interface NotificationResponse {
  notification: InAppNotificationDto
}

interface ListSubscriptionsResponse {
  subscriptions: EntitySubscriptionDto[]
  has_more: boolean
  page: number
}

interface SubscriptionResponse {
  subscription: EntitySubscriptionDto
}

interface NotificationSettingsResponse {
  preferences: NotificationPreferenceSummary[]
}

interface UpdateNotificationSettingsRequest {
  preferences: NotificationPreferenceSummary[]
}

interface DeviceTokenResponse {
  device_token: DeviceTokenDto
}

interface DeviceTokensResponse {
  device_tokens: DeviceTokenDto[]
}

export type NotificationChangeCallback = (notifications: InAppNotification[]) => void
export type NotificationSubscriptionChangeCallback = (subscriptions: EntitySubscription[]) => void
export type NotificationPreferenceChangeCallback = (preferences: NotificationPreferenceState[]) => void
// Callback for real-time SSE notification events (fires immediately when SSE arrives, not on cache changes).
export type NotificationSseEventCallback = (notification: InAppNotification) => void

const notificationActionTypes: NotificationActionType[] = [
  ...NOTIFICATION_ACTION_DEFINITIONS.map(definition => definition.actionType),
  "reaction_added",
]

const notificationEntityTypes: NotificationEntityReferenceType[] = [
  "project",
  "task",
  "task-comment",
  "forum-channel",
  "forum-discussion",
  "forum-reply",
  "group-chat",
  "group-message",
  "paper",
  "paper-comment",
  "paper-comment-reply",
  "file",
  "folder",
  "user",
  "direct-message",
]

const isNotificationActionType = (value: string): value is NotificationActionType =>
  notificationActionTypes.some(actionType => actionType === value)

const isNotificationEntityType = (value: string): value is NotificationEntityReferenceType =>
  notificationEntityTypes.some(entityType => entityType === value)

const buildSubscriptionKey = (entityType: NotificationEntityReferenceType, entityId: string): string => {
  return `${entityType}:${entityId}`
}

export class NotificationService {
  private notificationsById: Map<string, InAppNotification> = new Map()
  private subscriptionsById: Map<string, EntitySubscription> = new Map()
  private subscriptionsByEntityKey: Map<string, EntitySubscription> = new Map()
  private preferenceSnapshotByActionType: Map<NotificationActionType, boolean> = new Map()

  private notificationObservers: Set<NotificationChangeCallback> = new Set()
  private subscriptionObservers: Set<NotificationSubscriptionChangeCallback> = new Set()
  private preferenceObservers: Set<NotificationPreferenceChangeCallback> = new Set()
  private sseEventObservers: Set<NotificationSseEventCallback> = new Set()

  constructor(
    private readonly networkService: ExecuteAuthenticatedRequest,
    private readonly sseManager: SSEConnectionManager,
    private readonly workspaceId: string
  ) {
    this.subscribeToSseNotifications()
  }

  public onNotificationsChange(callback: NotificationChangeCallback): () => void {
    this.notificationObservers.add(callback)
    return () => this.notificationObservers.delete(callback)
  }

  public onSubscriptionsChange(callback: NotificationSubscriptionChangeCallback): () => void {
    this.subscriptionObservers.add(callback)
    return () => this.subscriptionObservers.delete(callback)
  }

  public onPreferencesChange(callback: NotificationPreferenceChangeCallback): () => void {
    this.preferenceObservers.add(callback)
    return () => this.preferenceObservers.delete(callback)
  }

  // Subscribe to real-time SSE notification events. Unlike onNotificationsChange which fires on
  // any cache update, this fires immediately when a new notification arrives via SSE.
  public onNotificationSseEvent(callback: NotificationSseEventCallback): () => void {
    this.sseEventObservers.add(callback)
    return () => this.sseEventObservers.delete(callback)
  }

  public getCachedNotifications(): InAppNotification[] {
    const notifications = Array.from(this.notificationsById.values())
    return notifications.sort((a, b) => {
      const aUnreadRank = a.readAt ? 1 : 0
      const bUnreadRank = b.readAt ? 1 : 0
      if (aUnreadRank !== bUnreadRank) {
        return aUnreadRank - bUnreadRank
      }
      return b.updatedAt.getTime() - a.updatedAt.getTime()
    })
  }

  public getCachedSubscriptions(): EntitySubscription[] {
    return Array.from(this.subscriptionsById.values())
  }

  public getSubscriptionForEntity(
    entityType: NotificationEntityReferenceType,
    entityId: string
  ): EntitySubscription | null {
    return this.subscriptionsByEntityKey.get(buildSubscriptionKey(entityType, entityId)) ?? null
  }

  public isSubscribedToEntity(entityType: NotificationEntityReferenceType, entityId: string): boolean {
    return this.subscriptionsByEntityKey.has(buildSubscriptionKey(entityType, entityId))
  }

  public getCachedPreferences(): NotificationPreferenceState[] {
    return NOTIFICATION_ACTION_DEFINITIONS.map(definition => ({
      actionType: definition.actionType,
      pushEnabled: this.preferenceSnapshotByActionType.get(definition.actionType) ?? true,
    }))
  }

  public async fetchNotifications(page = 1, limit = 100): Promise<InAppNotification[]> {
    const url = buildApiWorkspacePath(
      this.workspaceId,
      `/notifications?page=${page}&limit=${limit}`
    )

    const response = await this.networkService.executeGet<ListNotificationsResponse>(url)
    const notifications = response.notifications.map(inAppNotificationFromDto)

    this.updateNotificationCache(notifications, page === 1)

    return notifications
  }

  public async markNotificationRead(notificationId: string): Promise<InAppNotification> {
    const url = buildApiWorkspacePath(this.workspaceId, `/notifications/${notificationId}/read`)

    const response = await this.networkService.executePost<NotificationResponse>(url, JSON.stringify({}))
    const notification = inAppNotificationFromDto(response.notification)

    this.notificationsById.set(notification.id, notification)
    this.notifyNotificationsChanged()

    return notification
  }

  public async markAllNotificationsRead(): Promise<void> {
    const url = buildApiWorkspacePath(this.workspaceId, `/notifications/read-all`)
    await this.networkService.executePost(url, JSON.stringify({}))

    const now = new Date()
    const updatedNotifications = new Map<string, InAppNotification>()
    for (const notification of this.notificationsById.values()) {
      if (notification.readAt) {
        updatedNotifications.set(notification.id, notification)
        continue
      }

      updatedNotifications.set(notification.id, {
        ...notification,
        readAt: now,
        updatedAt: now,
      })
    }

    this.notificationsById = updatedNotifications
    this.notifyNotificationsChanged()
  }

  public async fetchSubscriptions(limit = 100): Promise<EntitySubscription[]> {
    let page = 1
    const allSubscriptions: EntitySubscription[] = []
    let hasMore = true

    while (hasMore) {
      const url = buildApiWorkspacePath(
        this.workspaceId,
        `/subscriptions?page=${page}&limit=${limit}`
      )
      const response = await this.networkService.executeGet<ListSubscriptionsResponse>(url)
      const subscriptions = response.subscriptions.map(entitySubscriptionFromDto)
      allSubscriptions.push(...subscriptions)
      hasMore = response.has_more
      page += 1
    }

    this.setSubscriptions(allSubscriptions)
    return allSubscriptions
  }

  public async subscribeToEntity(
    entityType: NotificationEntityReferenceType,
    entityId: string
  ): Promise<EntitySubscription> {
    const url = buildApiWorkspacePath(this.workspaceId, `/subscriptions`)
    const payload = JSON.stringify({ entity_id: entityId, entity_type: entityType })

    const response = await this.networkService.executePost<SubscriptionResponse>(url, payload)
    const subscription = entitySubscriptionFromDto(response.subscription)

    this.upsertSubscription(subscription)
    this.notifySubscriptionsChanged()

    return subscription
  }

  public async unsubscribeFromEntity(
    entityType: NotificationEntityReferenceType,
    entityId: string
  ): Promise<void> {
    const subscription = this.getSubscriptionForEntity(entityType, entityId)
    if (!subscription) {
      return
    }

    const url = buildApiWorkspacePath(this.workspaceId, `/subscriptions/${subscription.id}`)
    await this.networkService.executeDelete(url)

    this.removeSubscription(subscription.id)
    this.notifySubscriptionsChanged()
  }

  public async fetchNotificationSettings(): Promise<NotificationPreferenceState[]> {
    const url = buildApiWorkspacePath(this.workspaceId, `/notification-settings`)
    const response = await this.networkService.executeGet<NotificationSettingsResponse>(url)

    this.preferenceSnapshotByActionType.clear()
    for (const preference of response.preferences) {
      if (!isNotificationActionType(preference.action_type)) {
        continue
      }
      this.preferenceSnapshotByActionType.set(preference.action_type, preference.push_enabled)
    }

    this.notifyPreferencesChanged()
    return this.getCachedPreferences()
  }

  public async updateNotificationSettings(
    updates: NotificationPreferenceState[]
  ): Promise<NotificationPreferenceState[]> {
    const url = buildApiWorkspacePath(this.workspaceId, `/notification-settings`)
    const payload: UpdateNotificationSettingsRequest = {
      preferences: updates.map(update => ({
        action_type: update.actionType,
        push_enabled: update.pushEnabled,
      })),
    }

    await this.networkService.executePut(url, JSON.stringify(payload))

    for (const update of updates) {
      this.preferenceSnapshotByActionType.set(update.actionType, update.pushEnabled)
    }

    this.notifyPreferencesChanged()
    return this.getCachedPreferences()
  }

  public async registerDeviceToken(token: string, platform: DeviceTokenPlatform): Promise<DeviceToken> {
    const response = await this.networkService.executePost<DeviceTokenResponse>(
      `/device-tokens`,
      JSON.stringify({ token, platform })
    )

    return deviceTokenFromDto(response.device_token)
  }

  public async listDeviceTokens(): Promise<DeviceToken[]> {
    const response = await this.networkService.executeGet<DeviceTokensResponse>(`/device-tokens`)
    return response.device_tokens.map(deviceTokenFromDto)
  }

  public async deleteDeviceToken(deviceTokenId: string): Promise<void> {
    await this.networkService.executeDelete(`/device-tokens/${deviceTokenId}`)
  }

  private subscribeToSseNotifications(): void {
    this.sseManager.subscribe({
      eventTypes: [SSEEventType.NOTIFICATION_UPDATED, SSEEventType.NOTIFICATION_DELETED],
      handler: event => {
        if (event.type !== SSEEventType.NOTIFICATION_UPDATED) {
          if (event.type === SSEEventType.NOTIFICATION_DELETED) {
            this.removeNotificationFromSseDeletion(event.data)
          }
          return
        }
        void this.applyNotificationFromSse(event.data)
      },
    })
  }

  private removeNotificationFromSseDeletion(data: NotificationDeletedEventData): void {
    const cachedNotification = this.notificationsById.get(data.id)
    if (!cachedNotification) {
      return
    }
    if (cachedNotification.userId !== data.userId || cachedNotification.workspaceId !== data.workspaceId) {
      return
    }

    // Drop the cached notification and notify observers so inbox views update immediately.
    this.notificationsById.delete(data.id)
    this.notifyNotificationsChanged()
  }

  private async applyNotificationFromSse(data: NotificationUpdatedEventData): Promise<void> {
    if (!isNotificationActionType(data.actionType)) {
      logger.warn("Unknown notification action type", data.actionType)
      return
    }

    if (!isNotificationEntityType(data.targetEntityType) || !isNotificationEntityType(data.parentEntityType)) {
      logger.warn("Unknown notification entity type", {
        targetEntityType: data.targetEntityType,
        parentEntityType: data.parentEntityType,
      })
      return
    }

    const notification: InAppNotification = {
      id: data.id,
      userId: data.userId,
      workspaceId: data.workspaceId,
      actorUserId: data.actorUserId,
      latestActorId: data.latestActorId,
      actionType: data.actionType,
      targetEntityId: data.targetEntityId,
      targetEntityType: data.targetEntityType,
      parentEntityId: data.parentEntityId,
      parentEntityType: data.parentEntityType,
      count: data.count,
      readAt: data.readAt ? new Date(data.readAt) : null,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    }

    await this.ensureSubscriptionForNotification(notification)

    this.notificationsById.set(notification.id, notification)
    this.notifyNotificationsChanged()
    this.notifySseEventObservers(notification)
  }

  private async ensureSubscriptionForNotification(notification: InAppNotification): Promise<void> {
    if (this.isSubscribedToEntity(notification.parentEntityType, notification.parentEntityId)) {
      await this.ensureChildSubscriptionForNotification(notification)
      return
    }

    try {
      await this.subscribeToEntity(notification.parentEntityType, notification.parentEntityId)
      await this.ensureChildSubscriptionForNotification(notification)
    } catch (error) {
      logger.warn("Failed to auto-sync notification subscription", error)
    }
  }

  private async ensureChildSubscriptionForNotification(notification: InAppNotification): Promise<void> {
    if (notification.actionType !== "task_created_in_subscribed_project") {
      return
    }
    if (notification.targetEntityType !== "task") {
      return
    }
    if (this.isSubscribedToEntity(notification.targetEntityType, notification.targetEntityId)) {
      return
    }

    try {
      await this.subscribeToEntity(notification.targetEntityType, notification.targetEntityId)
    } catch (error) {
      logger.warn("Failed to auto-subscribe to task from project notification", error)
    }
  }

  private updateNotificationCache(notifications: InAppNotification[], reset: boolean): void {
    if (reset) {
      this.notificationsById.clear()
    }

    for (const notification of notifications) {
      this.notificationsById.set(notification.id, notification)
    }

    this.notifyNotificationsChanged()
  }

  private setSubscriptions(subscriptions: EntitySubscription[]): void {
    this.subscriptionsById.clear()
    this.subscriptionsByEntityKey.clear()

    for (const subscription of subscriptions) {
      this.upsertSubscription(subscription)
    }

    this.notifySubscriptionsChanged()
  }

  private upsertSubscription(subscription: EntitySubscription): void {
    this.subscriptionsById.set(subscription.id, subscription)
    this.subscriptionsByEntityKey.set(
      buildSubscriptionKey(subscription.entityType, subscription.entityId),
      subscription
    )
  }

  private removeSubscription(subscriptionId: string): void {
    const subscription = this.subscriptionsById.get(subscriptionId)
    if (!subscription) {
      return
    }

    this.subscriptionsById.delete(subscriptionId)
    this.subscriptionsByEntityKey.delete(buildSubscriptionKey(subscription.entityType, subscription.entityId))
  }

  private notifyNotificationsChanged(): void {
    const notifications = this.getCachedNotifications()
    for (const callback of this.notificationObservers) {
      try {
        callback(notifications)
      } catch (error) {
        logger.warn("Notification observer failed", error)
      }
    }
  }

  private notifySubscriptionsChanged(): void {
    const subscriptions = this.getCachedSubscriptions()
    for (const callback of this.subscriptionObservers) {
      try {
        callback(subscriptions)
      } catch (error) {
        logger.warn("Subscription observer failed", error)
      }
    }
  }

  private notifyPreferencesChanged(): void {
    const preferences = this.getCachedPreferences()
    for (const callback of this.preferenceObservers) {
      try {
        callback(preferences)
      } catch (error) {
        logger.warn("Notification preferences observer failed", error)
      }
    }
  }

  private notifySseEventObservers(notification: InAppNotification): void {
    for (const callback of this.sseEventObservers) {
      try {
        callback(notification)
      } catch (error) {
        logger.warn("SSE event observer failed", error)
      }
    }
  }
}
