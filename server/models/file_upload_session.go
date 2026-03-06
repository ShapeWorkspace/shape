package models

import "time"

// FileUploadSession stores the multipart upload session metadata for a file entity.
// The session is created when the file is initialized and removed after completion.
type FileUploadSession struct {
	// FileID is the file entity ID (also used as the primary key).
	FileID string `json:"file_id" gorm:"primaryKey;type:uuid"`

	// WorkspaceID scopes the upload session to a workspace for validation.
	WorkspaceID string `json:"workspace_id" gorm:"type:uuid;not null;index:idx_file_upload_sessions_workspace"`

	// UploadID is the S3 multipart upload identifier.
	UploadID string `json:"upload_id" gorm:"type:text;not null"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// TableName sets the database table name for file upload sessions.
func (FileUploadSession) TableName() string {
	return "file_upload_sessions"
}
