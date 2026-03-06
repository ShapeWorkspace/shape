package handlers

import "shape/models"

// CreateACLEntryRequest is the request body for creating an ACL entry.
// Shared across handlers that expose ACL endpoints.
type CreateACLEntryRequest struct {
	SubjectType models.ACLSubjectType `json:"subject_type"`
	SubjectID   string                `json:"subject_id"`
	Permission  models.ACLPermission  `json:"permission"`
}

// UpdateACLEntryRequest is the request body for updating an ACL entry.
// Shared across handlers that expose ACL endpoints.
type UpdateACLEntryRequest struct {
	Permission models.ACLPermission `json:"permission"`
}
