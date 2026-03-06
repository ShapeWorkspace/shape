package services

import (
	"errors"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"shape/models"
)

// FileUploadPartService persists multipart upload part metadata for file entities.
// This data is required to complete multipart uploads on the server.
type FileUploadPartService struct {
	db *gorm.DB
}

// NewFileUploadPartService constructs a new FileUploadPartService.
func NewFileUploadPartService(db *gorm.DB) *FileUploadPartService {
	return &FileUploadPartService{db: db}
}

// UpsertUploadedPart creates or updates a multipart part record.
// The operation is idempotent for a given (file_id, part_number) pair.
func (s *FileUploadPartService) UpsertUploadedPart(part *models.FileUploadPart) error {
	if part == nil {
		return errors.New("file upload part is required")
	}
	if part.FileID == "" {
		return errors.New("file_id is required")
	}
	if part.PartNumber <= 0 {
		return errors.New("part_number must be greater than zero")
	}
	if part.ETag == "" {
		return errors.New("etag is required")
	}
	if part.ID == "" {
		part.ID = uuid.NewString()
	}

	return s.db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "file_id"}, {Name: "part_number"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"e_tag",
			"size_bytes",
			"encrypted_size_bytes",
			"plaintext_size_bytes",
			"encrypted_blob",
			"updated_at",
		}),
	}).Create(part).Error
}

// ListPartsForFile returns all recorded parts for a file, ordered by part number.
func (s *FileUploadPartService) ListPartsForFile(fileID string) ([]models.FileUploadPart, error) {
	if fileID == "" {
		return nil, errors.New("file_id is required")
	}

	var parts []models.FileUploadPart
	if err := s.db.Where("file_id = ?", fileID).Order("part_number ASC").Find(&parts).Error; err != nil {
		return nil, err
	}
	return parts, nil
}

// DeletePartsForFile removes all recorded parts for a file upload.
func (s *FileUploadPartService) DeletePartsForFile(fileID string) error {
	if fileID == "" {
		return errors.New("file_id is required")
	}
	return s.db.Where("file_id = ?", fileID).Delete(&models.FileUploadPart{}).Error
}
