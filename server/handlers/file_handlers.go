package handlers

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"shape/middleware"
	"shape/models"
	"shape/services"
	"shape/usecase"
)

// FileHandlers handles file entity upload/download operations.
// Files are stored as unified entities with file metadata stored in meta_fields.
type FileHandlers struct {
	entityService            *services.EntityService
	fileUploadPartService    *services.FileUploadPartService
	fileUploadSessionService *services.FileUploadSessionService
	workspaceChecker         *services.WorkspaceChecker
	changeLogService         *services.ChangeLogService
	s3Service                *services.S3Service
	entityBroadcastUseCase   *usecase.EntityBroadcastUseCase
}

// NewFileHandlers constructs FileHandlers with required dependencies.
func NewFileHandlers(
	entityService *services.EntityService,
	fileUploadPartService *services.FileUploadPartService,
	fileUploadSessionService *services.FileUploadSessionService,
	workspaceChecker *services.WorkspaceChecker,
	changeLogService *services.ChangeLogService,
	s3Service *services.S3Service,
	entityBroadcastUseCase *usecase.EntityBroadcastUseCase,
) *FileHandlers {
	return &FileHandlers{
		entityService:            entityService,
		fileUploadPartService:    fileUploadPartService,
		fileUploadSessionService: fileUploadSessionService,
		workspaceChecker:         workspaceChecker,
		changeLogService:         changeLogService,
		s3Service:                s3Service,
		entityBroadcastUseCase:   entityBroadcastUseCase,
	}
}

// ---------------------------------------------------------------------------
// Requests / Responses
// ---------------------------------------------------------------------------

// UploadPartURLRequest asks for a presigned URL for a specific multipart part.
type UploadPartURLRequest struct {
	PartNumber int `json:"part_number"`
}

// UploadPartURLResponse returns a presigned URL for uploading a single part.
type UploadPartURLResponse struct {
	PartNumber int       `json:"part_number"`
	URL        string    `json:"url"`
	ExpiresAt  time.Time `json:"expires_at"`
}

// RecordUploadPartRequest records a completed multipart part.
type RecordUploadPartRequest struct {
	PartNumber           int    `json:"part_number"`
	ETag                 string `json:"etag"`
	EncryptedSizeBytes   int64  `json:"encrypted_size_bytes"`
	PlaintextSizeBytes   int64  `json:"plaintext_size_bytes"`
	EncryptedChunkBase64 string `json:"encrypted_chunk_base64,omitempty"`
}

// CompleteUploadRequest finalizes a multipart upload.
type CompleteUploadRequest struct {
	StreamFinalized bool `json:"stream_finalized"`
}

// DownloadURLResponse is returned with a presigned download URL.
type DownloadURLResponse struct {
	DownloadURL string    `json:"download_url"`
	ExpiresAt   time.Time `json:"expires_at"`
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// RequestUploadPartURL returns a presigned URL for uploading a single multipart part.
func (h *FileHandlers) RequestUploadPartURL(w http.ResponseWriter, r *http.Request) {
	workspaceID := mux.Vars(r)["workspaceId"]
	fileID := mux.Vars(r)["fileId"]
	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(fileID) == "" {
		JSONError(w, "Workspace ID and File ID are required", http.StatusBadRequest)
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

	var req UploadPartURLRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if req.PartNumber <= 0 {
		JSONError(w, "part_number must be greater than zero", http.StatusBadRequest)
		return
	}

	entity, err := h.entityService.GetByIDInWorkspace(fileID, workspaceID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			JSONError(w, "File not found", http.StatusNotFound)
			return
		}
		JSONErrorWithErr(w, "Failed to load file entity", err, http.StatusInternalServerError)
		return
	}
	if entity.EntityType != "file" {
		JSONError(w, "Entity is not a file", http.StatusBadRequest)
		return
	}

	canWrite, err := h.entityService.UserHasWriteAccess(userID, entity)
	if err != nil {
		JSONErrorWithErr(w, "Failed to verify file permissions", err, http.StatusInternalServerError)
		return
	}
	if !canWrite {
		JSONError(w, "Access denied", http.StatusForbidden)
		return
	}

	metaFields, err := parseFileMetaFields(entity.MetaFields)
	if err != nil {
		JSONError(w, err.Error(), http.StatusBadRequest)
		return
	}
	if strings.ToLower(metaFields.UploadStatus) != "pending" {
		JSONError(w, "File upload is already complete", http.StatusBadRequest)
		return
	}

	session, err := h.ensureFileUploadSession(workspaceID, fileID)
	if err != nil {
		JSONErrorWithErr(w, "Failed to initialize upload session", err, http.StatusInternalServerError)
		return
	}

	if isLocalUploadID(session.UploadID) {
		response := UploadPartURLResponse{
			PartNumber: req.PartNumber,
			URL:        "local-inline://upload-part",
			ExpiresAt:  time.Now().Add(15 * time.Minute),
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
		return
	}

	if h.s3Service == nil {
		JSONError(w, "File storage is not configured", http.StatusInternalServerError)
		return
	}

	uploadPart, err := h.s3Service.GenerateUploadPartURL(services.BuildFileS3Key(workspaceID, fileID), session.UploadID, req.PartNumber)
	if err != nil {
		JSONErrorWithErr(w, "Failed to generate upload URL", err, http.StatusInternalServerError)
		return
	}

	response := UploadPartURLResponse{
		PartNumber: uploadPart.PartNumber,
		URL:        uploadPart.URL,
		ExpiresAt:  uploadPart.ExpiresAt,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// RecordUploadPart stores metadata for an uploaded multipart part.
func (h *FileHandlers) RecordUploadPart(w http.ResponseWriter, r *http.Request) {
	workspaceID := mux.Vars(r)["workspaceId"]
	fileID := mux.Vars(r)["fileId"]
	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(fileID) == "" {
		JSONError(w, "Workspace ID and File ID are required", http.StatusBadRequest)
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

	var req RecordUploadPartRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if req.PartNumber <= 0 {
		JSONError(w, "part_number must be greater than zero", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.ETag) == "" {
		JSONError(w, "etag is required", http.StatusBadRequest)
		return
	}
	if req.EncryptedSizeBytes <= 0 || req.PlaintextSizeBytes <= 0 {
		JSONError(w, "part sizes must be greater than zero", http.StatusBadRequest)
		return
	}

	entity, err := h.entityService.GetByIDInWorkspace(fileID, workspaceID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			JSONError(w, "File not found", http.StatusNotFound)
			return
		}
		JSONErrorWithErr(w, "Failed to load file entity", err, http.StatusInternalServerError)
		return
	}
	if entity.EntityType != "file" {
		JSONError(w, "Entity is not a file", http.StatusBadRequest)
		return
	}

	canWrite, err := h.entityService.UserHasWriteAccess(userID, entity)
	if err != nil {
		JSONErrorWithErr(w, "Failed to verify file permissions", err, http.StatusInternalServerError)
		return
	}
	if !canWrite {
		JSONError(w, "Access denied", http.StatusForbidden)
		return
	}

	metaFields, err := parseFileMetaFields(entity.MetaFields)
	if err != nil {
		JSONError(w, err.Error(), http.StatusBadRequest)
		return
	}
	if strings.ToLower(metaFields.UploadStatus) != "pending" {
		JSONError(w, "File upload is already complete", http.StatusBadRequest)
		return
	}

	if h.fileUploadPartService == nil {
		JSONError(w, "File upload part service unavailable", http.StatusInternalServerError)
		return
	}
	session, err := h.ensureFileUploadSession(workspaceID, fileID)
	if err != nil {
		JSONErrorWithErr(w, "Failed to initialize upload session", err, http.StatusInternalServerError)
		return
	}

	var encryptedBlob []byte
	if isLocalUploadID(session.UploadID) {
		if strings.TrimSpace(req.EncryptedChunkBase64) == "" {
			JSONError(w, "encrypted_chunk_base64 is required for local uploads", http.StatusBadRequest)
			return
		}
		encryptedBlob, err = base64.StdEncoding.DecodeString(req.EncryptedChunkBase64)
		if err != nil {
			JSONError(w, "encrypted_chunk_base64 must be valid base64", http.StatusBadRequest)
			return
		}
		if int64(len(encryptedBlob)) != req.EncryptedSizeBytes {
			JSONError(w, "encrypted_size_bytes does not match encrypted chunk payload", http.StatusBadRequest)
			return
		}
	}

	part := &models.FileUploadPart{
		FileID:             fileID,
		PartNumber:         req.PartNumber,
		ETag:               req.ETag,
		SizeBytes:          req.PlaintextSizeBytes,
		EncryptedSizeBytes: req.EncryptedSizeBytes,
		PlaintextSizeBytes: req.PlaintextSizeBytes,
		EncryptedBlob:      encryptedBlob,
	}
	if err := h.fileUploadPartService.UpsertUploadedPart(part); err != nil {
		JSONErrorWithErr(w, "Failed to record upload part", err, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// CompleteUpload finalizes a multipart upload and updates file metadata.
func (h *FileHandlers) CompleteUpload(w http.ResponseWriter, r *http.Request) {
	workspaceID := mux.Vars(r)["workspaceId"]
	fileID := mux.Vars(r)["fileId"]
	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(fileID) == "" {
		JSONError(w, "Workspace ID and File ID are required", http.StatusBadRequest)
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

	var req CompleteUploadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	entity, err := h.entityService.GetByIDInWorkspace(fileID, workspaceID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			JSONError(w, "File not found", http.StatusNotFound)
			return
		}
		JSONErrorWithErr(w, "Failed to load file entity", err, http.StatusInternalServerError)
		return
	}
	if entity.EntityType != "file" {
		JSONError(w, "Entity is not a file", http.StatusBadRequest)
		return
	}

	canWrite, err := h.entityService.UserHasWriteAccess(userID, entity)
	if err != nil {
		JSONErrorWithErr(w, "Failed to verify file permissions", err, http.StatusInternalServerError)
		return
	}
	if !canWrite {
		JSONError(w, "Access denied", http.StatusForbidden)
		return
	}

	metaFields, err := parseFileMetaFields(entity.MetaFields)
	if err != nil {
		JSONError(w, err.Error(), http.StatusBadRequest)
		return
	}
	if strings.ToLower(metaFields.UploadStatus) != "pending" {
		JSONError(w, "File upload is already complete", http.StatusBadRequest)
		return
	}

	if h.fileUploadSessionService == nil || h.fileUploadPartService == nil {
		JSONError(w, "File upload services unavailable", http.StatusInternalServerError)
		return
	}
	session, err := h.fileUploadSessionService.GetSession(fileID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			JSONError(w, "Upload session not found", http.StatusNotFound)
			return
		}
		JSONErrorWithErr(w, "Failed to load upload session", err, http.StatusInternalServerError)
		return
	}
	if session.WorkspaceID != workspaceID {
		JSONError(w, "Upload session workspace mismatch", http.StatusForbidden)
		return
	}
	isLocalUpload := isLocalUploadID(session.UploadID)
	if !isLocalUpload && h.s3Service == nil {
		JSONError(w, "File storage is not configured", http.StatusInternalServerError)
		return
	}

	parts, err := h.fileUploadPartService.ListPartsForFile(fileID)
	if err != nil {
		JSONErrorWithErr(w, "Failed to load upload parts", err, http.StatusInternalServerError)
		return
	}
	if len(parts) == 0 {
		JSONError(w, "No upload parts recorded", http.StatusBadRequest)
		return
	}

	completedParts := make([]services.CompletedPart, 0, len(parts))
	var totalPlaintextSize int64
	for _, part := range parts {
		if isLocalUpload && len(part.EncryptedBlob) == 0 {
			JSONError(w, "Missing encrypted chunk payload for local upload part", http.StatusBadRequest)
			return
		}
		completedParts = append(completedParts, services.CompletedPart{
			PartNumber: part.PartNumber,
			ETag:       part.ETag,
		})
		totalPlaintextSize += part.PlaintextSizeBytes
	}

	if !isLocalUpload {
		s3Key := services.BuildFileS3Key(workspaceID, fileID)
		if err := h.s3Service.CompleteMultipartUpload(s3Key, session.UploadID, completedParts); err != nil {
			JSONErrorWithErr(w, "Failed to complete upload", err, http.StatusInternalServerError)
			return
		}
	}

	updatedMetaFields := map[string]interface{}{}
	for key, value := range entity.MetaFields {
		updatedMetaFields[key] = value
	}
	updatedMetaFields["size"] = totalPlaintextSize
	updatedMetaFields["chunk_count"] = len(parts)
	updatedMetaFields["upload_status"] = "complete"
	updatedMetaFields["stream_finalized"] = req.StreamFinalized

	updatedEntity, err := h.entityService.UpdateMetaFields(entity.ID, updatedMetaFields)
	if err != nil {
		JSONErrorWithErr(w, "Failed to update file metadata", err, http.StatusInternalServerError)
		return
	}

	if !isLocalUpload {
		_ = h.fileUploadPartService.DeletePartsForFile(fileID)
	}
	_ = h.fileUploadSessionService.DeleteSession(fileID)

	response, err := updatedEntity.ToResponse()
	if err != nil {
		JSONErrorWithErr(w, "Failed to serialize file entity", err, http.StatusInternalServerError)
		return
	}

	if h.entityBroadcastUseCase != nil {
		h.entityBroadcastUseCase.Execute(
			workspaceID,
			userID,
			response,
			services.SSEEntityUpdated,
			r.Header.Get("X-SSE-Client-ID"),
		)
	}
	h.appendChangeLogEntry(r.Context(), workspaceID, updatedEntity.EntityType, updatedEntity.ID, models.ChangeLogOperationUpdate, userID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// GetDownloadURL returns a presigned download URL for the file blob.
func (h *FileHandlers) GetDownloadURL(w http.ResponseWriter, r *http.Request) {
	workspaceID := mux.Vars(r)["workspaceId"]
	fileID := mux.Vars(r)["fileId"]
	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(fileID) == "" {
		JSONError(w, "Workspace ID and File ID are required", http.StatusBadRequest)
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

	entity, err := h.entityService.GetByIDInWorkspace(fileID, workspaceID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			JSONError(w, "File not found", http.StatusNotFound)
			return
		}
		JSONErrorWithErr(w, "Failed to load file entity", err, http.StatusInternalServerError)
		return
	}
	if entity.EntityType != "file" {
		JSONError(w, "Entity is not a file", http.StatusBadRequest)
		return
	}

	hasAccess, err := h.entityService.UserHasAccess(userID, entity)
	if err != nil {
		JSONErrorWithErr(w, "Failed to verify file permissions", err, http.StatusInternalServerError)
		return
	}
	if !hasAccess {
		JSONError(w, "Access denied", http.StatusForbidden)
		return
	}

	metaFields, err := parseFileMetaFields(entity.MetaFields)
	if err != nil {
		JSONError(w, err.Error(), http.StatusBadRequest)
		return
	}
	if strings.ToLower(metaFields.UploadStatus) != "complete" {
		JSONError(w, "File upload is not complete", http.StatusBadRequest)
		return
	}

	localDownloadURL, localErr := h.buildLocalDownloadDataURL(fileID)
	if localErr == nil {
		response := DownloadURLResponse{
			DownloadURL: localDownloadURL,
			ExpiresAt:   time.Now().Add(15 * time.Minute),
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
		return
	}

	if h.s3Service == nil {
		JSONErrorWithErr(w, "Failed to generate local download URL", localErr, http.StatusInternalServerError)
		return
	}

	downloadURL, err := h.s3Service.GenerateDownloadURL(services.BuildFileS3Key(workspaceID, fileID), 15*time.Minute)
	if err != nil {
		JSONErrorWithErr(w, "Failed to generate download URL", err, http.StatusInternalServerError)
		return
	}

	response := DownloadURLResponse{
		DownloadURL: downloadURL,
		ExpiresAt:   time.Now().Add(15 * time.Minute),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type fileMetaFields struct {
	StreamHeader    string
	SizeBytes       int64
	ChunkCount      int
	UploadStatus    string
	StreamFinalized bool
}

func parseFileMetaFields(metaFields datatypes.JSONMap) (fileMetaFields, error) {
	if metaFields == nil {
		return fileMetaFields{}, errors.New("meta_fields are required for file entities")
	}

	streamHeaderRaw, ok := metaFields["stream_header"]
	if !ok {
		return fileMetaFields{}, errors.New("meta_fields.stream_header is required for files")
	}
	streamHeader, ok := streamHeaderRaw.(string)
	if !ok || strings.TrimSpace(streamHeader) == "" {
		return fileMetaFields{}, errors.New("meta_fields.stream_header must be a non-empty string")
	}

	uploadStatusRaw, ok := metaFields["upload_status"]
	if !ok {
		return fileMetaFields{}, errors.New("meta_fields.upload_status is required for files")
	}
	uploadStatus, ok := uploadStatusRaw.(string)
	if !ok || strings.TrimSpace(uploadStatus) == "" {
		return fileMetaFields{}, errors.New("meta_fields.upload_status must be a string")
	}

	sizeValue, ok := normalizeJSONNumber(metaFields["size"])
	if !ok || sizeValue < 0 {
		return fileMetaFields{}, errors.New("meta_fields.size must be a non-negative number")
	}

	chunkValue, ok := normalizeJSONNumber(metaFields["chunk_count"])
	if !ok || chunkValue < 0 {
		return fileMetaFields{}, errors.New("meta_fields.chunk_count must be a non-negative number")
	}

	streamFinalizedRaw, ok := metaFields["stream_finalized"]
	if !ok {
		return fileMetaFields{}, errors.New("meta_fields.stream_finalized is required for files")
	}
	streamFinalized, ok := streamFinalizedRaw.(bool)
	if !ok {
		return fileMetaFields{}, errors.New("meta_fields.stream_finalized must be a boolean")
	}

	return fileMetaFields{
		StreamHeader:    streamHeader,
		SizeBytes:       sizeValue,
		ChunkCount:      int(chunkValue),
		UploadStatus:    uploadStatus,
		StreamFinalized: streamFinalized,
	}, nil
}

func normalizeJSONNumber(raw interface{}) (int64, bool) {
	switch value := raw.(type) {
	case float64:
		return int64(value), true
	case json.Number:
		parsed, err := value.Int64()
		if err != nil {
			return 0, false
		}
		return parsed, true
	case int:
		return int64(value), true
	case int64:
		return value, true
	case uint64:
		return int64(value), true
	case string:
		parsed, err := strconv.ParseInt(value, 10, 64)
		if err != nil {
			return 0, false
		}
		return parsed, true
	default:
		return 0, false
	}
}

const localUploadIDPrefix = "local-upload-"

func isLocalUploadID(uploadID string) bool {
	return strings.HasPrefix(uploadID, localUploadIDPrefix)
}

func shouldAllowLocalUploadFallback() bool {
	env := strings.ToLower(strings.TrimSpace(os.Getenv("ENVIRONMENT")))
	return env == "dev" || env == "development" || env == "test"
}

func isLocalS3EndpointUnavailable() bool {
	endpoint := strings.TrimSpace(os.Getenv("S3_ENDPOINT_URL"))
	if endpoint == "" {
		return false
	}

	parsed, err := url.Parse(endpoint)
	if err != nil {
		return false
	}

	host := strings.ToLower(strings.TrimSpace(parsed.Hostname()))
	if host != "localhost" && host != "127.0.0.1" && host != "::1" {
		return false
	}

	address := parsed.Host
	if !strings.Contains(address, ":") {
		switch strings.ToLower(parsed.Scheme) {
		case "https":
			address = net.JoinHostPort(address, "443")
		default:
			address = net.JoinHostPort(address, "80")
		}
	}

	conn, dialErr := net.DialTimeout("tcp", address, 200*time.Millisecond)
	if dialErr != nil {
		return true
	}
	_ = conn.Close()
	return false
}

func (h *FileHandlers) ensureLocalFileUploadSession(workspaceID string, fileID string) (*models.FileUploadSession, error) {
	if h.fileUploadSessionService == nil {
		return nil, errors.New("file upload session service unavailable")
	}

	session := &models.FileUploadSession{
		FileID:      fileID,
		WorkspaceID: workspaceID,
		UploadID:    localUploadIDPrefix + strconv.FormatInt(time.Now().UnixNano(), 10),
	}
	if err := h.fileUploadSessionService.CreateSession(session); err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			existing, fetchErr := h.fileUploadSessionService.GetSession(fileID)
			if fetchErr != nil {
				return nil, fetchErr
			}
			if existing.WorkspaceID != workspaceID {
				return nil, errors.New("upload session workspace mismatch")
			}
			return existing, nil
		}
		return nil, err
	}

	return session, nil
}

func (h *FileHandlers) buildLocalDownloadDataURL(fileID string) (string, error) {
	if h.fileUploadPartService == nil {
		return "", errors.New("file upload part service unavailable")
	}

	parts, err := h.fileUploadPartService.ListPartsForFile(fileID)
	if err != nil {
		return "", err
	}
	if len(parts) == 0 {
		return "", errors.New("no local upload parts recorded")
	}

	var totalEncryptedSize int64
	for _, part := range parts {
		if len(part.EncryptedBlob) == 0 {
			return "", errors.New("local upload parts missing encrypted payload")
		}
		totalEncryptedSize += int64(len(part.EncryptedBlob))
	}
	if totalEncryptedSize <= 0 {
		return "", errors.New("local upload payload is empty")
	}

	combined := make([]byte, 0, totalEncryptedSize)
	for _, part := range parts {
		combined = append(combined, part.EncryptedBlob...)
	}

	return "data:application/octet-stream;base64," + base64.StdEncoding.EncodeToString(combined), nil
}

func (h *FileHandlers) appendChangeLogEntry(
	ctx context.Context,
	workspaceID string,
	entityType string,
	entityID string,
	operation models.ChangeLogOperation,
	actorID string,
) {
	if h.changeLogService == nil {
		return
	}

	if _, err := h.changeLogService.AppendChange(ctx, services.AppendChangeParams{
		WorkspaceID: workspaceID,
		EntityType:  models.ChangeLogEntityType(entityType),
		EntityID:    entityID,
		Operation:   operation,
		ActorID:     actorID,
	}); err != nil {
		log.Printf(
			"file change log: failed to append workspace=%s entity=%s type=%s op=%s err=%v",
			workspaceID,
			entityID,
			entityType,
			operation,
			err,
		)
	}
}

func (h *FileHandlers) ensureFileUploadSession(workspaceID string, fileID string) (*models.FileUploadSession, error) {
	if h.fileUploadSessionService == nil {
		return nil, errors.New("file upload session service unavailable")
	}

	session, err := h.fileUploadSessionService.GetSession(fileID)
	if err == nil {
		if session.WorkspaceID != workspaceID {
			return nil, errors.New("upload session workspace mismatch")
		}
		return session, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	allowLocalFallback := shouldAllowLocalUploadFallback()
	if allowLocalFallback && isLocalS3EndpointUnavailable() {
		return h.ensureLocalFileUploadSession(workspaceID, fileID)
	}

	if h.s3Service == nil {
		if allowLocalFallback {
			return h.ensureLocalFileUploadSession(workspaceID, fileID)
		}
		return nil, errors.New("file storage is not configured")
	}

	s3Key := services.BuildFileS3Key(workspaceID, fileID)
	uploadID, err := h.s3Service.InitiateMultipartUpload(s3Key)
	if err != nil {
		if allowLocalFallback {
			log.Printf("file upload: falling back to local session workspace=%s file=%s err=%v", workspaceID, fileID, err)
			return h.ensureLocalFileUploadSession(workspaceID, fileID)
		}
		return nil, err
	}

	session = &models.FileUploadSession{
		FileID:      fileID,
		WorkspaceID: workspaceID,
		UploadID:    uploadID,
	}
	if err := h.fileUploadSessionService.CreateSession(session); err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			existing, fetchErr := h.fileUploadSessionService.GetSession(fileID)
			if fetchErr != nil {
				return nil, fetchErr
			}
			if existing.WorkspaceID != workspaceID {
				return nil, errors.New("upload session workspace mismatch")
			}
			return existing, nil
		}
		_ = h.s3Service.AbortMultipartUpload(s3Key, uploadID)
		if allowLocalFallback {
			log.Printf("file upload: falling back to local session after session create failure workspace=%s file=%s err=%v", workspaceID, fileID, err)
			return h.ensureLocalFileUploadSession(workspaceID, fileID)
		}
		return nil, err
	}

	return session, nil
}
