package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"shape/middleware"
	"shape/models"
)

// UserSettingsHandlers wires HTTP requests into the user settings service.
type UserSettingsHandlers struct {
	settingsService *models.UserSettingsService
}

// NewUserSettingsHandlers assembles a handler with validated dependencies.
func NewUserSettingsHandlers(service *models.UserSettingsService) *UserSettingsHandlers {
	return &UserSettingsHandlers{settingsService: service}
}

// userSettingsResponse represents the payload returned to callers.
type userSettingsResponse struct {
	Settings map[string]any `json:"settings"`
}

// updateUserSettingsRequest captures the JSON payload sent by clients.
type updateUserSettingsRequest struct {
	Settings map[string]json.RawMessage `json:"settings"`
}

// GetUserSettings returns the authenticated user's persisted settings.
func (h *UserSettingsHandlers) GetUserSettings(w http.ResponseWriter, r *http.Request) {
	userID, err := activeUserIDFromRequest(r)
	if err != nil {
		JSONError(w, err.Error(), http.StatusUnauthorized)
		return
	}

	prefs, err := h.settingsService.GetEmailSettings(userID)
	if err != nil {
		JSONErrorWithErr(w, "failed to load user settings", err, http.StatusInternalServerError)
		return
	}

	response := userSettingsResponse{
		Settings: map[string]any{
			models.UserSettingEmailModeKey:          string(prefs.Mode),
			models.UserSettingEmailBatchIntervalKey: prefs.DelaySeconds,
		},
	}

	JSONResponse(w, response, http.StatusOK)
}

// UpdateUserSettings adjusts the authenticated user's preferences.
func (h *UserSettingsHandlers) UpdateUserSettings(w http.ResponseWriter, r *http.Request) {
	userID, err := activeUserIDFromRequest(r)
	if err != nil {
		JSONError(w, err.Error(), http.StatusUnauthorized)
		return
	}

	var request updateUserSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		JSONError(w, "invalid JSON payload", http.StatusBadRequest)
		return
	}

	if len(request.Settings) == 0 {
		JSONError(w, "settings payload cannot be empty", http.StatusBadRequest)
		return
	}

	prefs, err := h.settingsService.GetEmailSettings(userID)
	if err != nil {
		JSONErrorWithErr(w, "failed to load existing settings", err, http.StatusInternalServerError)
		return
	}

	for key, raw := range request.Settings {
		switch key {
		case models.UserSettingEmailModeKey:
			var mode string
			if err := json.Unmarshal(raw, &mode); err != nil {
				JSONError(w, "email_mode must be a string", http.StatusBadRequest)
				return
			}
			prefs.Mode = models.EmailMode(mode)
		case models.UserSettingEmailBatchIntervalKey:
			var delay int
			if err := json.Unmarshal(raw, &delay); err != nil {
				JSONError(w, "email_batch_interval must be a number", http.StatusBadRequest)
				return
			}
			prefs.DelaySeconds = delay
		default:
			JSONError(w, "unknown setting key provided", http.StatusBadRequest)
			return
		}
	}

	if err := prefs.Validate(); err != nil {
		JSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.settingsService.UpdateEmailSettings(userID, prefs); err != nil {
		JSONErrorWithErr(w, "failed to update user settings", err, http.StatusInternalServerError)
		return
	}

	response := userSettingsResponse{
		Settings: map[string]any{
			models.UserSettingEmailModeKey:          string(prefs.Mode),
			models.UserSettingEmailBatchIntervalKey: prefs.DelaySeconds,
		},
	}

	JSONResponse(w, response, http.StatusOK)
}

// activeUserIDFromRequest extracts the authenticated user UUID or returns an error.
func activeUserIDFromRequest(r *http.Request) (string, error) {
	activeAccountID, ok := middleware.GetActiveAccountIdFromContext(r)
	if !ok {
		return "", errors.New("user ID not found in context")
	}

	userID, ok := activeAccountID.(string)
	if !ok || userID == "" {
		return "", errors.New("invalid user ID type")
	}

	return userID, nil
}
