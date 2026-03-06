package services

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// S3Service provides file storage operations using AWS S3.
// This service handles:
// - File blob uploads via presigned URLs (uploaded client-side, supports multipart for large files) - stored in private files bucket
// - Presigned download URLs for file access
type S3Service struct {
	client            *s3.Client
	presignClient     *s3.PresignClient
	filesBucketName   string
	avatarsBucketName string
	avatarsPublicURL  string // Custom base URL for avatar access (for MinIO/LocalStack)
	region            string
}

// CompletedPart represents a completed part of a multipart upload.
// The client returns these after uploading each part via presigned URL.
type CompletedPart struct {
	PartNumber int    `json:"part_number"`
	ETag       string `json:"etag"`
}

// PresignedUploadPart contains a presigned URL for uploading a single part.
type PresignedUploadPart struct {
	PartNumber int       `json:"part_number"`
	URL        string    `json:"url"`
	ExpiresAt  time.Time `json:"expires_at"`
}

// NewS3Service initializes an S3 client from environment variables and returns the configured service.
// Required environment variables:
// - S3_FILES_BUCKET_NAME: The S3 bucket name for private file storage (encrypted files)
// - S3_AVATARS_BUCKET_NAME: The S3 bucket name for public avatar storage
// - S3_REGION: The AWS region (defaults to AWS_REGION if not set)
// Optional environment variables:
// - S3_ENDPOINT_URL: Custom endpoint for S3-compatible services (MinIO, LocalStack)
// - S3_AVATARS_PUBLIC_URL: Base URL for public avatar access (for MinIO/LocalStack)
// AWS credentials are loaded via the standard SDK chain (IAM role, env vars, or config file).
func NewS3Service() (*S3Service, error) {
	filesBucketName := os.Getenv("S3_FILES_BUCKET_NAME")
	avatarsBucketName := os.Getenv("S3_AVATARS_BUCKET_NAME")
	region := os.Getenv("S3_REGION")
	endpointURL := os.Getenv("S3_ENDPOINT_URL")
	avatarsPublicURL := os.Getenv("S3_AVATARS_PUBLIC_URL")

	// Fall back to AWS_REGION if S3_REGION is not set.
	if region == "" {
		region = os.Getenv("AWS_REGION")
	}

	if filesBucketName == "" {
		return nil, fmt.Errorf("S3_FILES_BUCKET_NAME environment variable is required")
	}
	if avatarsBucketName == "" {
		return nil, fmt.Errorf("S3_AVATARS_BUCKET_NAME environment variable is required")
	}
	if region == "" {
		return nil, fmt.Errorf("S3_REGION or AWS_REGION environment variable is required")
	}

	// Load AWS config with the specified region.
	// Credentials are loaded from the standard SDK chain (IAM role, env vars, shared credentials file).
	cfg, err := config.LoadDefaultConfig(context.TODO(),
		config.WithRegion(region),
	)
	if err != nil {
		return nil, fmt.Errorf("unable to load AWS SDK config: %w", err)
	}

	// Create S3 client with optional custom endpoint (for MinIO, LocalStack, etc.).
	var client *s3.Client
	if endpointURL != "" {
		client = s3.NewFromConfig(cfg, func(o *s3.Options) {
			o.BaseEndpoint = aws.String(endpointURL)
			o.UsePathStyle = true // Required for MinIO and LocalStack
		})
	} else {
		client = s3.NewFromConfig(cfg)
	}

	// Create presign client for generating presigned URLs.
	presignClient := s3.NewPresignClient(client)

	return &S3Service{
		client:            client,
		presignClient:     presignClient,
		filesBucketName:   filesBucketName,
		avatarsBucketName: avatarsBucketName,
		avatarsPublicURL:  avatarsPublicURL,
		region:            region,
	}, nil
}

// GetFilesBucketName returns the configured files bucket name (private).
func (s *S3Service) GetFilesBucketName() string {
	return s.filesBucketName
}

// GetAvatarsBucketName returns the configured avatars bucket name (public).
func (s *S3Service) GetAvatarsBucketName() string {
	return s.avatarsBucketName
}

// GetRegion returns the configured AWS region.
func (s *S3Service) GetRegion() string {
	return s.region
}

// ------------------------------------------------------
// File Blob Operations (Multipart Upload)
// ------------------------------------------------------

// InitiateMultipartUpload starts a multipart upload for a file and returns the upload ID.
// The upload ID is required for generating presigned URLs for each part and completing the upload.
//
// Parameters:
//   - key: The S3 object key (e.g., "workspaces/{workspace_id}/files/{file_id}")
//
// Returns:
//   - uploadID: The S3 multipart upload ID
//   - error: Any error that occurred
func (s *S3Service) InitiateMultipartUpload(key string) (string, error) {
	output, err := s.client.CreateMultipartUpload(context.TODO(), &s3.CreateMultipartUploadInput{
		Bucket:      aws.String(s.filesBucketName),
		Key:         aws.String(key),
		ContentType: aws.String("application/octet-stream"),
	})
	if err != nil {
		return "", fmt.Errorf("failed to initiate multipart upload: %w", err)
	}

	return *output.UploadId, nil
}

// GenerateUploadPartURL generates a presigned PUT URL for uploading a single part of a multipart upload.
// The URL expires after 15 minutes.
//
// Parameters:
//   - key: The S3 object key
//   - uploadID: The multipart upload ID from InitiateMultipartUpload
//   - partNumber: The part number (1-indexed, per S3 requirements)
//
// Returns:
//   - PresignedUploadPart containing the URL and expiration time
//   - error: Any error that occurred
func (s *S3Service) GenerateUploadPartURL(key string, uploadID string, partNumber int) (*PresignedUploadPart, error) {
	expiresIn := 15 * time.Minute
	expiresAt := time.Now().Add(expiresIn)

	presignedRequest, err := s.presignClient.PresignUploadPart(context.TODO(), &s3.UploadPartInput{
		Bucket:     aws.String(s.filesBucketName),
		Key:        aws.String(key),
		UploadId:   aws.String(uploadID),
		PartNumber: aws.Int32(int32(partNumber)),
	}, func(opts *s3.PresignOptions) {
		opts.Expires = expiresIn
	})
	if err != nil {
		return nil, fmt.Errorf("failed to generate presigned upload URL for part %d: %w", partNumber, err)
	}

	return &PresignedUploadPart{
		PartNumber: partNumber,
		URL:        presignedRequest.URL,
		ExpiresAt:  expiresAt,
	}, nil
}

// CompleteMultipartUpload finalizes a multipart upload by combining all uploaded parts.
// This must be called after all parts have been uploaded via their presigned URLs.
//
// Parameters:
//   - key: The S3 object key
//   - uploadID: The multipart upload ID
//   - parts: Slice of CompletedPart containing part numbers and ETags returned by S3 after each part upload
//
// Returns:
//   - error: Any error that occurred
func (s *S3Service) CompleteMultipartUpload(key string, uploadID string, parts []CompletedPart) error {
	// Convert our CompletedPart to S3 CompletedPart type.
	completedParts := make([]types.CompletedPart, len(parts))
	for i, part := range parts {
		completedParts[i] = types.CompletedPart{
			PartNumber: aws.Int32(int32(part.PartNumber)),
			ETag:       aws.String(part.ETag),
		}
	}

	_, err := s.client.CompleteMultipartUpload(context.TODO(), &s3.CompleteMultipartUploadInput{
		Bucket:   aws.String(s.filesBucketName),
		Key:      aws.String(key),
		UploadId: aws.String(uploadID),
		MultipartUpload: &types.CompletedMultipartUpload{
			Parts: completedParts,
		},
	})
	if err != nil {
		return fmt.Errorf("failed to complete multipart upload: %w", err)
	}

	return nil
}

// AbortMultipartUpload cancels a multipart upload and cleans up any uploaded parts.
// Call this if the upload fails or is cancelled.
//
// Parameters:
//   - key: The S3 object key
//   - uploadID: The multipart upload ID
//
// Returns:
//   - error: Any error that occurred
func (s *S3Service) AbortMultipartUpload(key string, uploadID string) error {
	_, err := s.client.AbortMultipartUpload(context.TODO(), &s3.AbortMultipartUploadInput{
		Bucket:   aws.String(s.filesBucketName),
		Key:      aws.String(key),
		UploadId: aws.String(uploadID),
	})
	if err != nil {
		return fmt.Errorf("failed to abort multipart upload: %w", err)
	}

	return nil
}

// ------------------------------------------------------
// File Download Operations
// ------------------------------------------------------

// GenerateDownloadURL generates a presigned GET URL for downloading a file.
// The URL expires after the specified duration.
//
// Parameters:
//   - key: The S3 object key
//   - expires: How long the URL should be valid
//
// Returns:
//   - The presigned download URL
//   - error: Any error that occurred
func (s *S3Service) GenerateDownloadURL(key string, expires time.Duration) (string, error) {
	presignedRequest, err := s.presignClient.PresignGetObject(context.TODO(), &s3.GetObjectInput{
		Bucket: aws.String(s.filesBucketName),
		Key:    aws.String(key),
	}, func(opts *s3.PresignOptions) {
		opts.Expires = expires
	})
	if err != nil {
		return "", fmt.Errorf("failed to generate presigned download URL: %w", err)
	}

	return presignedRequest.URL, nil
}

// ------------------------------------------------------
// Delete Operations
// ------------------------------------------------------

// DeleteObject removes an object from S3.
//
// Parameters:
//   - key: The S3 object key to delete
//
// Returns:
//   - error: Any error that occurred
func (s *S3Service) DeleteObject(key string) error {
	_, err := s.client.DeleteObject(context.TODO(), &s3.DeleteObjectInput{
		Bucket: aws.String(s.filesBucketName),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("failed to delete object: %w", err)
	}

	return nil
}

// DeleteObjects removes multiple objects from S3 in a single request.
// This is more efficient than calling DeleteObject multiple times.
//
// Parameters:
//   - keys: Slice of S3 object keys to delete
//
// Returns:
//   - error: Any error that occurred
func (s *S3Service) DeleteObjects(keys []string) error {
	if len(keys) == 0 {
		return nil
	}

	// S3 DeleteObjects supports up to 1000 keys per request.
	// For simplicity, we process all keys at once (assuming < 1000).
	// TODO: Batch into chunks of 1000 if needed for very large deletions.
	objectIds := make([]types.ObjectIdentifier, len(keys))
	for i, key := range keys {
		objectIds[i] = types.ObjectIdentifier{
			Key: aws.String(key),
		}
	}

	_, err := s.client.DeleteObjects(context.TODO(), &s3.DeleteObjectsInput{
		Bucket: aws.String(s.filesBucketName),
		Delete: &types.Delete{
			Objects: objectIds,
			Quiet:   aws.Bool(true),
		},
	})
	if err != nil {
		return fmt.Errorf("failed to delete objects: %w", err)
	}

	return nil
}

// ------------------------------------------------------
// Utility Functions
// ------------------------------------------------------

// BuildFileS3Key constructs the S3 object key for a file blob.
// Format: workspaces/{workspace_id}/files/{file_id}
func BuildFileS3Key(workspaceID string, fileID string) string {
	return fmt.Sprintf("workspaces/%s/files/%s", workspaceID, fileID)
}
