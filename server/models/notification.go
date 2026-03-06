package models

import "time"

// NotificationActionType enumerates the supported notification event categories.
// These values are persisted and must remain stable across clients.
type NotificationActionType string

const (
	NotificationActionTypeTaskAssigned                   NotificationActionType = "task_assigned"
	NotificationActionTypeTaskCreatedInSubscribedProject NotificationActionType = "task_created_in_subscribed_project"
	NotificationActionTypeTaskComment                    NotificationActionType = "task_comment"
	NotificationActionTypeTaskMention                    NotificationActionType = "task_mention"
	NotificationActionTypeDiscussionReply                NotificationActionType = "discussion_reply"
	NotificationActionTypeDiscussionMention              NotificationActionType = "discussion_mention"
	NotificationActionTypePaperComment                   NotificationActionType = "paper_comment"
	NotificationActionTypePaperCommentReply              NotificationActionType = "paper_comment_reply"
	NotificationActionTypePaperCommentMention            NotificationActionType = "paper_comment_mention"
	NotificationActionTypePaperMention                   NotificationActionType = "paper_mention"
	NotificationActionTypePaperShared                    NotificationActionType = "paper_shared"
	NotificationActionTypeFolderShared                   NotificationActionType = "folder_shared"
	NotificationActionTypeGroupMessage                   NotificationActionType = "group_message"
	NotificationActionTypeGroupAdded                     NotificationActionType = "group_added"
	NotificationActionTypeDirectMessageReceived          NotificationActionType = "dm_received"
	NotificationActionTypeReactionAdded                  NotificationActionType = "reaction_added"
)

// AllNotificationActionTypes returns the canonical list of supported action types.
func AllNotificationActionTypes() []NotificationActionType {
	return []NotificationActionType{
		NotificationActionTypeTaskAssigned,
		NotificationActionTypeTaskCreatedInSubscribedProject,
		NotificationActionTypeTaskComment,
		NotificationActionTypeTaskMention,
		NotificationActionTypeDiscussionReply,
		NotificationActionTypeDiscussionMention,
		NotificationActionTypePaperComment,
		NotificationActionTypePaperCommentReply,
		NotificationActionTypePaperCommentMention,
		NotificationActionTypePaperMention,
		NotificationActionTypePaperShared,
		NotificationActionTypeFolderShared,
		NotificationActionTypeGroupMessage,
		NotificationActionTypeGroupAdded,
		NotificationActionTypeDirectMessageReceived,
		NotificationActionTypeReactionAdded,
	}
}

// EntitySubscription records that a user wants notifications for a specific entity.
type EntitySubscription struct {
	ID          string `json:"id" gorm:"primaryKey;type:uuid"`
	UserID      string `json:"user_id" gorm:"type:uuid;not null;uniqueIndex:idx_entity_subscriptions_unique;index:idx_entity_subscriptions_user_workspace,priority:1"`
	WorkspaceID string `json:"workspace_id" gorm:"type:uuid;not null;uniqueIndex:idx_entity_subscriptions_unique;index:idx_entity_subscriptions_user_workspace,priority:2"`
	EntityID    string `json:"entity_id" gorm:"type:uuid;not null;uniqueIndex:idx_entity_subscriptions_unique;index:idx_entity_subscriptions_entity,priority:2"`
	EntityType  string `json:"entity_type" gorm:"type:text;not null;uniqueIndex:idx_entity_subscriptions_unique;index:idx_entity_subscriptions_entity,priority:1"`

	CreatedAt time.Time `json:"created_at"`
}

// InAppNotification is the persistent notification record shown in the Inbox UI.
type InAppNotification struct {
	ID               string                 `json:"id" gorm:"primaryKey;type:uuid"`
	UserID           string                 `json:"user_id" gorm:"type:uuid;not null;index:idx_in_app_notifications_user_workspace,priority:1;index:idx_in_app_notifications_collapse,priority:1"`
	WorkspaceID      string                 `json:"workspace_id" gorm:"type:uuid;not null;index:idx_in_app_notifications_user_workspace,priority:2;index:idx_in_app_notifications_collapse,priority:2"`
	ActorUserID      string                 `json:"actor_user_id" gorm:"type:uuid;not null"`
	LatestActorID    string                 `json:"latest_actor_id" gorm:"type:uuid;not null"`
	ActionType       NotificationActionType `json:"action_type" gorm:"type:text;not null;index:idx_in_app_notifications_action;index:idx_in_app_notifications_collapse,priority:3"`
	TargetEntityID   string                 `json:"target_entity_id" gorm:"type:uuid;not null"`
	TargetEntityType string                 `json:"target_entity_type" gorm:"type:text;not null"`
	ParentEntityID   string                 `json:"parent_entity_id" gorm:"type:uuid;not null;index:idx_in_app_notifications_collapse,priority:4"`
	ParentEntityType string                 `json:"parent_entity_type" gorm:"type:text;not null"`
	Count            int                    `json:"count" gorm:"not null;default:1"`
	ReadAt           *time.Time             `json:"read_at" gorm:"index"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// PushNotification represents a queued push event to be delivered asynchronously.
type PushNotification struct {
	ID               string                 `json:"id" gorm:"primaryKey;type:uuid"`
	UserID           string                 `json:"user_id" gorm:"type:uuid;not null;index"`
	WorkspaceID      string                 `json:"workspace_id" gorm:"type:uuid;not null;index"`
	ActorUserID      string                 `json:"actor_user_id" gorm:"type:uuid;not null"`
	ActionType       NotificationActionType `json:"action_type" gorm:"type:text;not null;index"`
	TargetEntityID   string                 `json:"target_entity_id" gorm:"type:uuid;not null"`
	TargetEntityType string                 `json:"target_entity_type" gorm:"type:text;not null"`
	ParentEntityID   string                 `json:"parent_entity_id" gorm:"type:uuid;not null"`
	ParentEntityType string                 `json:"parent_entity_type" gorm:"type:text;not null"`
	AttemptCount     int                    `json:"attempt_count" gorm:"not null;default:0"`
	LastAttemptAt    *time.Time             `json:"last_attempt_at"`

	CreatedAt time.Time `json:"created_at"`
}

// NotificationPreference stores per-action push preferences per workspace.
type NotificationPreference struct {
	ID          string                 `json:"id" gorm:"primaryKey;type:uuid"`
	UserID      string                 `json:"user_id" gorm:"type:uuid;not null;uniqueIndex:idx_notification_preferences_unique;index:idx_notification_preferences_user_workspace,priority:1"`
	WorkspaceID string                 `json:"workspace_id" gorm:"type:uuid;not null;uniqueIndex:idx_notification_preferences_unique;index:idx_notification_preferences_user_workspace,priority:2"`
	ActionType  NotificationActionType `json:"action_type" gorm:"type:text;not null;uniqueIndex:idx_notification_preferences_unique"`
	PushEnabled bool                   `json:"push_enabled" gorm:"not null;default:true"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// DeviceTokenPlatform identifies the push provider platform.
type DeviceTokenPlatform string

const (
	DeviceTokenPlatformIOS     DeviceTokenPlatform = "ios"
	DeviceTokenPlatformAndroid DeviceTokenPlatform = "android"
)

// DeviceToken stores a mobile push token for a user.
type DeviceToken struct {
	ID       string              `json:"id" gorm:"primaryKey;type:uuid"`
	UserID   string              `json:"user_id" gorm:"type:uuid;not null;index:idx_device_tokens_user;uniqueIndex:idx_device_tokens_user_token"`
	Token    string              `json:"token" gorm:"type:text;not null;index:idx_device_tokens_token;uniqueIndex:idx_device_tokens_user_token"`
	Platform DeviceTokenPlatform `json:"platform" gorm:"type:text;not null"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// InAppNotificationResponse is the API response payload for notifications.
type InAppNotificationResponse struct {
	ID               string                 `json:"id"`
	UserID           string                 `json:"user_id"`
	WorkspaceID      string                 `json:"workspace_id"`
	ActorUserID      string                 `json:"actor_user_id"`
	LatestActorID    string                 `json:"latest_actor_id"`
	ActionType       NotificationActionType `json:"action_type"`
	TargetEntityID   string                 `json:"target_entity_id"`
	TargetEntityType string                 `json:"target_entity_type"`
	ParentEntityID   string                 `json:"parent_entity_id"`
	ParentEntityType string                 `json:"parent_entity_type"`
	Count            int                    `json:"count"`
	ReadAt           *time.Time             `json:"read_at"`
	CreatedAt        time.Time              `json:"created_at"`
	UpdatedAt        time.Time              `json:"updated_at"`
}

// ToResponse converts an InAppNotification to its API response form.
func (n *InAppNotification) ToResponse() *InAppNotificationResponse {
	if n == nil {
		return nil
	}
	return &InAppNotificationResponse{
		ID:               n.ID,
		UserID:           n.UserID,
		WorkspaceID:      n.WorkspaceID,
		ActorUserID:      n.ActorUserID,
		LatestActorID:    n.LatestActorID,
		ActionType:       n.ActionType,
		TargetEntityID:   n.TargetEntityID,
		TargetEntityType: n.TargetEntityType,
		ParentEntityID:   n.ParentEntityID,
		ParentEntityType: n.ParentEntityType,
		Count:            n.Count,
		ReadAt:           n.ReadAt,
		CreatedAt:        n.CreatedAt,
		UpdatedAt:        n.UpdatedAt,
	}
}

// ToSSEPayload returns a camelCase payload for notification SSE events.
func (n *InAppNotification) ToSSEPayload() map[string]interface{} {
	payload := map[string]interface{}{
		"id":               n.ID,
		"userId":           n.UserID,
		"workspaceId":      n.WorkspaceID,
		"actorUserId":      n.ActorUserID,
		"latestActorId":    n.LatestActorID,
		"actionType":       n.ActionType,
		"targetEntityId":   n.TargetEntityID,
		"targetEntityType": n.TargetEntityType,
		"parentEntityId":   n.ParentEntityID,
		"parentEntityType": n.ParentEntityType,
		"count":            n.Count,
		"createdAt":        n.CreatedAt.UnixMilli(),
		"updatedAt":        n.UpdatedAt.UnixMilli(),
	}
	if n.ReadAt != nil {
		payload["readAt"] = n.ReadAt.UnixMilli()
	}
	return payload
}

// ToSSEDeletePayload returns a minimal payload for notification deletion SSE events.
func (n *InAppNotification) ToSSEDeletePayload() map[string]interface{} {
	if n == nil {
		return nil
	}
	return map[string]interface{}{
		"id":          n.ID,
		"userId":      n.UserID,
		"workspaceId": n.WorkspaceID,
	}
}
