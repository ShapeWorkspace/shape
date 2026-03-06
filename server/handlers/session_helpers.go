package handlers

import (
	"fmt"
	"net/http"

	"shape/middleware"

	"github.com/gorilla/sessions"
)

// prepareSessionForUser loads the existing session (or creates one) and attaches the provided
// user identifier so downstream handlers can persist it. Callers can mutate the returned session
// before saving (for example, to set feature flags) to keep the logic consistent across auth flows.
func prepareSessionForUser(r *http.Request, userID string) (*sessions.Session, error) {
	session, err := middleware.GetSession(r)
	if err != nil {
		return nil, fmt.Errorf("session init failed: %w", err)
	}
	if err := middleware.AppendUserToSession(session, userID); err != nil {
		return nil, fmt.Errorf("session user attach failed: %w", err)
	}
	return session, nil
}

// persistSession saves the session to the response, committing any changes made to session values.
func persistSession(w http.ResponseWriter, r *http.Request, session *sessions.Session) error {
	if err := middleware.SaveSession(session, r, w); err != nil {
		return fmt.Errorf("session persist failed: %w", err)
	}
	return nil
}
