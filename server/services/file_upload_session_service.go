package services

import (
	"errors"

	"gorm.io/gorm"

	"shape/models"
)

// FileUploadSessionService tracks multipart upload sessions for file entities.
// Sessions are created on file creation and removed after completion.
type FileUploadSessionService struct {
	db *gorm.DB
}

// NewFileUploadSessionService constructs a new FileUploadSessionService.
func NewFileUploadSessionService(db *gorm.DB) *FileUploadSessionService {
	return &FileUploadSessionService{db: db}
}

// CreateSession stores a multipart upload session for a file entity.
func (s *FileUploadSessionService) CreateSession(session *models.FileUploadSession) error {
	if session == nil {
		return errors.New("file upload session is required")
	}
	if session.FileID == "" {
		return errors.New("file_id is required")
	}
	if session.WorkspaceID == "" {
		return errors.New("workspace_id is required")
	}
	if session.UploadID == "" {
		return errors.New("upload_id is required")
	}

	return s.db.Create(session).Error
}

// GetSession retrieves the upload session for a file entity.
func (s *FileUploadSessionService) GetSession(fileID string) (*models.FileUploadSession, error) {
	if fileID == "" {
		return nil, errors.New("file_id is required")
	}

	var session models.FileUploadSession
	if err := s.db.Where("file_id = ?", fileID).First(&session).Error; err != nil {
		return nil, err
	}
	return &session, nil
}

// DeleteSession removes the upload session for a file entity.
func (s *FileUploadSessionService) DeleteSession(fileID string) error {
	if fileID == "" {
		return errors.New("file_id is required")
	}
	return s.db.Where("file_id = ?", fileID).Delete(&models.FileUploadSession{}).Error
}
