package models

import "time"

// FileUploadPart tracks a completed multipart upload part for a file entity.
// These records allow the server to complete or recover a multipart upload
// even if the client disconnects mid-upload.
type FileUploadPart struct {
	// ID is the unique identifier for this upload part record.
	ID string `json:"id" gorm:"primaryKey;type:uuid"`

	// FileID is the file entity this part belongs to.
	FileID string `json:"file_id" gorm:"type:uuid;not null;uniqueIndex:idx_file_upload_parts_file_part,priority:1"`

	// PartNumber is the S3 multipart part number (1-indexed).
	PartNumber int `json:"part_number" gorm:"not null;uniqueIndex:idx_file_upload_parts_file_part,priority:2"`

	// ETag is returned by S3 after uploading the part.
	ETag string `json:"etag" gorm:"type:text;not null"`

	// EncryptedSizeBytes is the ciphertext size stored in S3 for this part.
	EncryptedSizeBytes int64 `json:"encrypted_size_bytes" gorm:"not null"`

	// SizeBytes stores the plaintext payload size for legacy compatibility.
	SizeBytes int64 `json:"size_bytes" gorm:"column:size_bytes;not null"`

	// PlaintextSizeBytes is the unencrypted payload size for this part.
	PlaintextSizeBytes int64 `json:"plaintext_size_bytes" gorm:"not null"`

	// EncryptedBlob stores ciphertext bytes for local/dev multipart fallback mode.
	// In S3-backed mode this remains empty.
	EncryptedBlob []byte `json:"-" gorm:"column:encrypted_blob"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// TableName sets the database table name for file upload parts.
func (FileUploadPart) TableName() string {
	return "file_upload_parts"
}
