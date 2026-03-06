package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"shape/middleware"
	"shape/services"

	"github.com/gorilla/mux"
)

// TeamHandlers manages team-related endpoints for a workspace.
// Teams are used as ACL subjects for bulk sharing.
type TeamHandlers struct {
	teamService      *services.TeamService
	workspaceChecker *services.WorkspaceChecker
}

// NewTeamHandlers creates a new TeamHandlers instance with required services.
func NewTeamHandlers(teamService *services.TeamService, workspaceChecker *services.WorkspaceChecker) *TeamHandlers {
	return &TeamHandlers{
		teamService:      teamService,
		workspaceChecker: workspaceChecker,
	}
}

// GetWorkspaceTeams returns all teams in a workspace.
//
// GET /api/workspaces/{workspaceId}/teams
func (h *TeamHandlers) GetWorkspaceTeams(w http.ResponseWriter, r *http.Request) {
	workspaceID := mux.Vars(r)["workspaceId"]
	if strings.TrimSpace(workspaceID) == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	// Verify user is a workspace member before listing teams.
	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserInWorkspace(userID, workspaceID) {
		JSONError(w, "Access denied: not a workspace member", http.StatusForbidden)
		return
	}

	teams, err := h.teamService.GetTeamsInWorkspace(workspaceID)
	if err != nil {
		JSONErrorWithErr(w, "Failed to get teams", err, http.StatusInternalServerError)
		return
	}

	// Convert to response format.
	responses := make([]services.TeamResponse, len(teams))
	for i, team := range teams {
		responses[i] = services.TeamResponse{
			ID:          team.ID,
			Name:        team.Name,
			TeamType:    team.TeamType,
			MemberCount: team.MemberCount,
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"teams": responses,
	})
}
