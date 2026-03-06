package services

import (
	"errors"
	"log"
	"strings"

	"shape/models"
)

// ACLRealtimeShareService centralizes real-time SSE broadcasts for ACL grants.
// It intentionally targets ONLY the newly granted subject (user or team members),
// avoiding full ACL fan-out to keep the event payload scoped and predictable.
type ACLRealtimeShareService struct {
	sseManager  *SSEManager
	teamService *TeamService
}

// NewACLRealtimeShareService constructs a share broadcaster for ACL grants.
// The team service is required to expand team subjects into user IDs.
func NewACLRealtimeShareService(sseManager *SSEManager, teamService *TeamService) *ACLRealtimeShareService {
	return &ACLRealtimeShareService{
		sseManager:  sseManager,
		teamService: teamService,
	}
}

// BroadcastEntityCreatedToACLSubject sends a pre-built entity_created SSE event
// to the recipient(s) represented by the ACL subject.
// This is used after ACL entry creation to hydrate the newly authorized client
// without requiring a full fetch.
func (s *ACLRealtimeShareService) BroadcastEntityCreatedToACLSubject(
	workspaceID string,
	subjectType models.ACLSubjectType,
	subjectID string,
	event SSEEvent,
	actorUserID string,
) {
	if s == nil || s.sseManager == nil {
		return
	}
	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(subjectID) == "" {
		return
	}

	recipientUserIDs, err := s.resolveRecipientUserIDsForSubject(subjectType, subjectID)
	if err != nil {
		log.Printf("sse: failed to resolve ACL recipients subject=%s:%s: %v", subjectType, subjectID, err)
		return
	}
	if len(recipientUserIDs) == 0 {
		return
	}

	for _, recipientUserID := range recipientUserIDs {
		if strings.TrimSpace(recipientUserID) == "" {
			continue
		}
		if actorUserID != "" && recipientUserID == actorUserID {
			// Skip notifying the actor to avoid redundant "created" events in their own cache.
			continue
		}
		s.sseManager.BroadcastToUserWithOptions(recipientUserID, workspaceID, event, UserBroadcastOptions{})
	}
}

// resolveRecipientUserIDsForSubject expands an ACL subject into concrete user IDs.
// Users map directly, team subjects fan out to all current team members.
func (s *ACLRealtimeShareService) resolveRecipientUserIDsForSubject(
	subjectType models.ACLSubjectType,
	subjectID string,
) ([]string, error) {
	switch subjectType {
	case models.ACLSubjectTypeUser:
		return []string{subjectID}, nil
	case models.ACLSubjectTypeTeam:
		if s.teamService == nil {
			return nil, errors.New("team service is unavailable")
		}
		members, err := s.teamService.GetTeamMembers(subjectID)
		if err != nil {
			return nil, err
		}

		uniqueUserIDs := make(map[string]struct{}, len(members))
		for _, member := range members {
			if strings.TrimSpace(member.UserID) == "" {
				continue
			}
			uniqueUserIDs[member.UserID] = struct{}{}
		}

		resolvedUserIDs := make([]string, 0, len(uniqueUserIDs))
		for userID := range uniqueUserIDs {
			resolvedUserIDs = append(resolvedUserIDs, userID)
		}
		return resolvedUserIDs, nil
	default:
		return nil, nil
	}
}
