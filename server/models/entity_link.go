package models

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// SourceContextJSON stores navigation context for backlinks as JSONB.
// It implements sql.Scanner and driver.Valuer for GORM JSONB support.
type SourceContextJSON map[string]string

// Scan implements sql.Scanner for reading JSONB from the database.
func (s *SourceContextJSON) Scan(value interface{}) error {
	if value == nil {
		*s = nil
		return nil
	}

	bytes, ok := value.([]byte)
	if !ok {
		return errors.New("type assertion to []byte failed for SourceContextJSON")
	}

	if len(bytes) == 0 {
		*s = nil
		return nil
	}

	var result map[string]string
	if err := json.Unmarshal(bytes, &result); err != nil {
		return err
	}
	*s = result
	return nil
}

// Value implements driver.Valuer for writing JSONB to the database.
func (s SourceContextJSON) Value() (driver.Value, error) {
	if s == nil || len(s) == 0 {
		return nil, nil
	}
	return json.Marshal(s)
}

// EntityLink represents a link between two unified entities in a workspace.
// Links are stored unencrypted to enable backlink queries.
type EntityLink struct {
	ID string `json:"id" gorm:"primaryKey;type:uuid"`

	WorkspaceID string `json:"workspace_id" gorm:"type:uuid;not null;index"`
	CreatedBy   string `json:"created_by" gorm:"type:uuid;not null"`

	SourceEntityType string `json:"source_entity_type" gorm:"not null"`
	SourceEntityID   string `json:"source_entity_id" gorm:"type:uuid;not null;index:idx_entity_links_source;uniqueIndex:idx_entity_links_unique,priority:1"`

	TargetEntityType string `json:"target_entity_type" gorm:"not null"`
	TargetEntityID   string `json:"target_entity_id" gorm:"type:uuid;not null;index:idx_entity_links_target;uniqueIndex:idx_entity_links_unique,priority:2"`

	LinkType      string            `json:"link_type" gorm:"not null"`
	SourceContext SourceContextJSON `json:"source_context,omitempty" gorm:"type:jsonb"`

	CreatedAt time.Time `json:"created_at"`
}

// TableName sets the database table name for EntityLink.
func (EntityLink) TableName() string {
	return "entity_links"
}

// BeforeCreate sets the CreatedAt timestamp and generates an ID if missing.
func (e *EntityLink) BeforeCreate(tx *gorm.DB) error {
	if e.ID == "" {
		e.ID = uuid.New().String()
	}
	if e.CreatedAt.IsZero() {
		e.CreatedAt = time.Now()
	}
	return nil
}

// EntityLinkResponse is the JSON response format for an entity link.
type EntityLinkResponse struct {
	ID               string            `json:"id"`
	WorkspaceID      string            `json:"workspace_id"`
	CreatedBy        string            `json:"created_by"`
	SourceEntityType string            `json:"source_entity_type"`
	SourceEntityID   string            `json:"source_entity_id"`
	TargetEntityType string            `json:"target_entity_type"`
	TargetEntityID   string            `json:"target_entity_id"`
	LinkType         string            `json:"link_type"`
	SourceContext    map[string]string `json:"source_context,omitempty"`
	CreatedAt        time.Time         `json:"created_at"`
}

// ToResponse converts an EntityLink to its JSON response format.
func (e *EntityLink) ToResponse() *EntityLinkResponse {
	return &EntityLinkResponse{
		ID:               e.ID,
		WorkspaceID:      e.WorkspaceID,
		CreatedBy:        e.CreatedBy,
		SourceEntityType: e.SourceEntityType,
		SourceEntityID:   e.SourceEntityID,
		TargetEntityType: e.TargetEntityType,
		TargetEntityID:   e.TargetEntityID,
		LinkType:         e.LinkType,
		SourceContext:    e.SourceContext,
		CreatedAt:        e.CreatedAt,
	}
}

// GetEntityLinksResponse is the response for fetching entity links.
type GetEntityLinksResponse struct {
	Links    []*EntityLinkResponse `json:"links"`
	LinkedBy []*EntityLinkResponse `json:"linked_by"`
}

// LinkedEntityInput represents a target entity for link syncing.
type LinkedEntityInput struct {
	TargetEntityType string            `json:"target_entity_type"`
	TargetEntityID   string            `json:"target_entity_id"`
	LinkType         string            `json:"link_type"`
	SourceContext    map[string]string `json:"source_context,omitempty"`
}

// SyncEntityLinksRequest is the request body for syncing entity links.
type SyncEntityLinksRequest struct {
	SourceEntityType string              `json:"source_entity_type"`
	LinkedEntities   []LinkedEntityInput `json:"linked_entities"`
}

// EntityLinkService provides methods for managing entity links.
type EntityLinkService struct {
	db *gorm.DB
}

// NewEntityLinkService creates a new entity link service instance.
func NewEntityLinkService(db *gorm.DB) *EntityLinkService {
	return &EntityLinkService{db: db}
}

// SyncLinks atomically syncs entity links for a source entity.
// It deletes links no longer present and creates new ones.
func (s *EntityLinkService) SyncLinks(
	workspaceID string,
	sourceEntityID string,
	sourceEntityType string,
	createdBy string,
	linkedEntities []LinkedEntityInput,
) error {
	if workspaceID == "" {
		return errors.New("workspace_id is required")
	}
	if sourceEntityID == "" {
		return errors.New("source_entity_id is required")
	}
	if sourceEntityType == "" {
		return errors.New("source_entity_type is required")
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		var currentLinks []*EntityLink
		if err := tx.Where("source_entity_id = ?", sourceEntityID).Find(&currentLinks).Error; err != nil {
			return err
		}

		currentTargets := make(map[string]*EntityLink)
		for _, link := range currentLinks {
			currentTargets[link.TargetEntityID] = link
		}

		desiredTargets := make(map[string]LinkedEntityInput)
		for _, linked := range linkedEntities {
			if linked.TargetEntityID != "" {
				desiredTargets[linked.TargetEntityID] = linked
			}
		}

		for targetID, link := range currentTargets {
			if _, exists := desiredTargets[targetID]; !exists {
				if err := tx.Delete(link).Error; err != nil {
					return err
				}
			}
		}

		for targetID, linked := range desiredTargets {
			if _, exists := currentTargets[targetID]; !exists {
				newLink := &EntityLink{
					WorkspaceID:      workspaceID,
					CreatedBy:        createdBy,
					SourceEntityType: sourceEntityType,
					SourceEntityID:   sourceEntityID,
					TargetEntityType: linked.TargetEntityType,
					TargetEntityID:   linked.TargetEntityID,
					LinkType:         linked.LinkType,
					SourceContext:    linked.SourceContext,
				}
				if err := tx.Create(newLink).Error; err != nil {
					return err
				}
			}
		}

		return nil
	})
}

// GetLinksFrom returns all entities that this source links to.
func (s *EntityLinkService) GetLinksFrom(sourceEntityID string) ([]*EntityLink, error) {
	var links []*EntityLink
	if err := s.db.Where("source_entity_id = ?", sourceEntityID).
		Order("created_at ASC").
		Find(&links).Error; err != nil {
		return nil, err
	}
	return links, nil
}

// GetLinksTo returns all entities that link to this target (backlinks).
func (s *EntityLinkService) GetLinksTo(targetEntityID string) ([]*EntityLink, error) {
	var links []*EntityLink
	if err := s.db.Where("target_entity_id = ?", targetEntityID).
		Order("created_at ASC").
		Find(&links).Error; err != nil {
		return nil, err
	}
	return links, nil
}

// GetEntityLinks returns both outgoing links and backlinks for an entity.
// Aggregation rules:
// - forum-discussion: include links from all forum-reply children
// - task: include links from all task-comment children
// - group-chat: include links from all group-message children
func (s *EntityLinkService) GetEntityLinks(entityID, entityType string) (*GetEntityLinksResponse, error) {
	switch entityType {
	case "forum-discussion":
		return s.getDiscussionLinksWithReplies(entityID)
	case "task":
		return s.getTaskLinksWithComments(entityID)
	case "group-chat":
		return s.getGroupChatLinksWithMessages(entityID)
	default:
		return s.getSimpleEntityLinks(entityID)
	}
}

// getSimpleEntityLinks returns links for a single entity without child aggregation.
func (s *EntityLinkService) getSimpleEntityLinks(entityID string) (*GetEntityLinksResponse, error) {
	linksFrom, err := s.GetLinksFrom(entityID)
	if err != nil {
		return nil, err
	}

	linksTo, err := s.GetLinksTo(entityID)
	if err != nil {
		return nil, err
	}

	return s.buildLinksResponse(linksFrom, linksTo), nil
}

// getChildEntityIDs returns the IDs of unified entities matching a parent and type.
func (s *EntityLinkService) getChildEntityIDs(parentID string, entityType string) ([]string, error) {
	var childIDs []string
	if err := s.db.Table("entities").
		Where("parent_id = ? AND entity_type = ?", parentID, entityType).
		Pluck("id", &childIDs).Error; err != nil {
		return nil, err
	}
	return childIDs, nil
}

// getDiscussionLinksWithReplies aggregates links from a discussion and its replies.
func (s *EntityLinkService) getDiscussionLinksWithReplies(discussionID string) (*GetEntityLinksResponse, error) {
	replyIDs, err := s.getChildEntityIDs(discussionID, "forum-reply")
	if err != nil {
		return nil, err
	}

	sourceIDs := append([]string{discussionID}, replyIDs...)

	var linksFrom []*EntityLink
	if err := s.db.Where("source_entity_id IN ?", sourceIDs).
		Order("created_at ASC").
		Find(&linksFrom).Error; err != nil {
		return nil, err
	}

	linksTo, err := s.GetLinksTo(discussionID)
	if err != nil {
		return nil, err
	}

	return s.buildLinksResponse(linksFrom, linksTo), nil
}

// getTaskLinksWithComments aggregates links from a task and its comments.
func (s *EntityLinkService) getTaskLinksWithComments(taskID string) (*GetEntityLinksResponse, error) {
	commentIDs, err := s.getChildEntityIDs(taskID, "task-comment")
	if err != nil {
		return nil, err
	}

	sourceIDs := append([]string{taskID}, commentIDs...)

	var linksFrom []*EntityLink
	if err := s.db.Where("source_entity_id IN ?", sourceIDs).
		Order("created_at ASC").
		Find(&linksFrom).Error; err != nil {
		return nil, err
	}

	linksTo, err := s.GetLinksTo(taskID)
	if err != nil {
		return nil, err
	}

	return s.buildLinksResponse(linksFrom, linksTo), nil
}

// getGroupChatLinksWithMessages aggregates links from a group chat and its messages.
func (s *EntityLinkService) getGroupChatLinksWithMessages(groupChatID string) (*GetEntityLinksResponse, error) {
	messageIDs, err := s.getChildEntityIDs(groupChatID, "group-message")
	if err != nil {
		return nil, err
	}

	sourceIDs := append([]string{groupChatID}, messageIDs...)

	var linksFrom []*EntityLink
	if err := s.db.Where("source_entity_id IN ?", sourceIDs).
		Order("created_at ASC").
		Find(&linksFrom).Error; err != nil {
		return nil, err
	}

	linksTo, err := s.GetLinksTo(groupChatID)
	if err != nil {
		return nil, err
	}

	return s.buildLinksResponse(linksFrom, linksTo), nil
}

// buildLinksResponse converts entity link models into the API response format.
func (s *EntityLinkService) buildLinksResponse(linksFrom []*EntityLink, linksTo []*EntityLink) *GetEntityLinksResponse {
	links := make([]*EntityLinkResponse, 0, len(linksFrom))
	for _, link := range linksFrom {
		links = append(links, link.ToResponse())
	}

	linkedBy := make([]*EntityLinkResponse, 0, len(linksTo))
	for _, link := range linksTo {
		linkedBy = append(linkedBy, link.ToResponse())
	}

	return &GetEntityLinksResponse{
		Links:    links,
		LinkedBy: linkedBy,
	}
}
