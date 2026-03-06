package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"shape/middleware"
	"shape/models"
	"shape/services"

	"github.com/gorilla/mux"
	"gorm.io/gorm"
)

type MentionHandlers struct {
	aclService       *services.ACLService
	workspaceChecker *services.WorkspaceChecker
}

type MentionableUserIDsResponse struct {
	UserIDs []string `json:"user_ids"`
}

func NewMentionHandlers(
	aclService *services.ACLService,
	workspaceChecker *services.WorkspaceChecker,
) *MentionHandlers {
	return &MentionHandlers{
		aclService:       aclService,
		workspaceChecker: workspaceChecker,
	}
}

// GetMentionableUsers returns user IDs that can be mentioned for a resource.
//
// GET /api/workspaces/{workspaceId}/mentions/{resourceType}/{resourceId}
func (h *MentionHandlers) GetMentionableUsers(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := strings.TrimSpace(vars["workspaceId"])
	resourceTypeRaw := strings.TrimSpace(vars["resourceType"])
	resourceID := strings.TrimSpace(vars["resourceId"])

	if workspaceID == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}
	if resourceTypeRaw == "" {
		JSONError(w, "Resource type is required", http.StatusBadRequest)
		return
	}
	if resourceID == "" {
		JSONError(w, "Resource ID is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserInWorkspace(userID, workspaceID) {
		JSONError(w, "Access denied: not a workspace member", http.StatusForbidden)
		return
	}

	resourceType, err := parseMentionResourceType(resourceTypeRaw)
	if err != nil {
		JSONError(w, "Unsupported resource type", http.StatusBadRequest)
		return
	}

	creatorID, err := h.aclService.GetResourceCreatorID(workspaceID, resourceType, resourceID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			JSONError(w, "Resource not found", http.StatusNotFound)
			return
		}
		JSONErrorWithErr(w, "Failed to load resource", err, http.StatusInternalServerError)
		return
	}

	if userID != creatorID {
		hasAccess, accessErr := h.aclService.UserHasAccessToResource(userID, resourceType, resourceID)
		if accessErr != nil {
			JSONErrorWithErr(w, "Failed to check access", accessErr, http.StatusInternalServerError)
			return
		}
		if !hasAccess {
			JSONError(w, "Access denied", http.StatusForbidden)
			return
		}
	}

	mentionableUserIDs, err := h.aclService.ListUserIDsWithAccessForResource(
		workspaceID,
		resourceType,
		resourceID,
		creatorID,
	)
	if err != nil {
		JSONErrorWithErr(w, "Failed to load mentionable users", err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(MentionableUserIDsResponse{UserIDs: mentionableUserIDs})
}

func parseMentionResourceType(value string) (models.ACLResourceType, error) {
	switch value {
	case string(models.ACLResourceTypeProject):
		return models.ACLResourceTypeProject, nil
	case string(models.ACLResourceTypePaper):
		return models.ACLResourceTypePaper, nil
	case string(models.ACLResourceTypeFile):
		return models.ACLResourceTypeFile, nil
	case string(models.ACLResourceTypeFolder):
		return models.ACLResourceTypeFolder, nil
	case string(models.ACLResourceTypeGroupChat):
		return models.ACLResourceTypeGroupChat, nil
	case string(models.ACLResourceTypeForumChannel):
		return models.ACLResourceTypeForumChannel, nil
	default:
		return "", errors.New("unsupported resource type")
	}
}
