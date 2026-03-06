package models

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// UserType represents the classification of a user account. We only allow
// explicitly enumerated values so downstream authorization checks can rely on
// exhaustiveness rather than loosely comparing arbitrary strings.
type UserType string

const (
	// UserTypeHuman represents a real end user account.
	UserTypeHuman UserType = "human"
	// UserTypeGlobalAgent represents the system-wide Shape agent account.
	UserTypeGlobalAgent UserType = "global_agent"
)

// Global agent constants are shared across the application so multiple services
// can coordinate on the same principal without duplicating literals.
const (
	GlobalAgentName  = "Shape Agent"
	GlobalAgentEmail = "agent@shape.work"
)

// User represents an authenticated user in the system.
// The ServerPassword field stores a bcrypt hash of the derived server_password, NOT the raw user password.
// The raw password never leaves the client; instead the client derives a server_password using Argon2id
// and sends that to the server for authentication.
type User struct {
	ID                string            `json:"uuid" gorm:"primaryKey;type:uuid"`
	Email             string            `json:"email" gorm:"uniqueIndex;not null"`
	ServerPassword    string            `json:"-" gorm:"column:server_password;not null"` // bcrypt hash of derived server_password
	UserType          UserType          `json:"user_type" gorm:"type:text;not null;default:'human'"`
	SignupAttribution datatypes.JSONMap `json:"signup_attribution" gorm:"type:jsonb"`

	// Cryptographic identity fields - these enable end-to-end encryption.
	// The encrypted key bundle contains the user's boxSeed and signSeed, encrypted with
	// a key derived from their password. This allows the user to recover their identity
	// keys from any device by entering their password.
	CryptoBundleID    string `json:"crypto_bundle_id,omitempty" gorm:"type:uuid"`            // Unique identifier for the key bundle
	ProtocolVersion   int    `json:"protocol_version,omitempty" gorm:"default:1"`            // Encryption protocol version (currently 1)
	PwSalt            string `json:"-" gorm:"column:pw_salt"`                                // 16 bytes hex - Argon2id salt for KDF
	EncKeyBundleNonce string `json:"-" gorm:"column:enc_key_bundle_nonce"`                   // 24 bytes hex - XChaCha20 nonce for bundle encryption
	EncKeyBundle      string `json:"-" gorm:"column:enc_key_bundle;type:text"`               // base64 - Encrypted JSON containing boxSeed and signSeed
	BoxPublicKey      string `json:"box_public_key" gorm:"column:box_public_key;not null"`   // 32 bytes hex - X25519 public key for encryption
	SignPublicKey     string `json:"sign_public_key" gorm:"column:sign_public_key;not null"` // 32 bytes hex - Ed25519 public key for signatures

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// CreateUserParams holds the parameters needed to create a new user.
// The ServerPassword field contains the derived server_password from the client,
// NOT the user's raw password. The server will bcrypt hash this for storage.
// The ID is client-generated and cryptographically bound to the encrypted key bundle.
type CreateUserParams struct {
	ID                string // Client-generated UUID, bound to encrypted payload
	Email             string
	ServerPassword    string // Derived key from client, not raw password
	SignupAttribution map[string]string
	// Cryptographic fields for E2EE identity
	CryptoFields *UserCryptoFields
}

// UserCryptoFields contains the cryptographic identity data sent during registration.
// These fields enable the user to recover their encryption keys from any device.
type UserCryptoFields struct {
	CryptoBundleID    string `json:"crypto_bundle_id"`     // UUID for the key bundle
	ProtocolVersion   int    `json:"protocol_version"`     // Encryption protocol version
	PwSalt            string `json:"pw_salt"`              // 16 bytes hex - Argon2id salt
	EncKeyBundleNonce string `json:"enc_key_bundle_nonce"` // 24 bytes hex - XChaCha20 nonce
	EncKeyBundle      string `json:"enc_key_bundle"`       // base64 - Encrypted key bundle
	BoxPublicKey      string `json:"box_public_key"`       // 32 bytes hex - X25519 public key
	SignPublicKey     string `json:"sign_public_key"`      // 32 bytes hex - Ed25519 public key
}

// UserCryptoFieldsResponse is returned to the client after successful login.
// It contains all the data needed to decrypt the user's identity keys.
type UserCryptoFieldsResponse struct {
	CryptoBundleID    string `json:"crypto_bundle_id"`
	PwSalt            string `json:"pw_salt"`
	ProtocolVersion   int    `json:"protocol_version"`
	EncKeyBundleNonce string `json:"enc_key_bundle_nonce"`
	EncKeyBundle      string `json:"enc_key_bundle"`
}

// UserService provides methods for managing users.
type UserService struct {
	db *gorm.DB
}

// NewUserService creates a new user service instance.
func NewUserService(db *gorm.DB) *UserService {
	return &UserService{db: db}
}

// Create registers a new user with hashed server_password and crypto identity fields.
// The params.ServerPassword should be the derived server_password from the client, NOT the raw password.
// This server_password is bcrypt hashed before storage.
// The params.ID is client-generated and MUST be used as-is because it's cryptographically
// bound to the encrypted key bundle. If there's a UUID collision, creation will fail.
func (s *UserService) Create(params CreateUserParams) (*User, error) {
	// Validate the client-provided ID.
	if params.ID == "" {
		return nil, fmt.Errorf("user ID is required")
	}
	// Validate UUID format.
	if _, err := uuid.Parse(params.ID); err != nil {
		return nil, fmt.Errorf("invalid user ID format: must be a valid UUID")
	}

	// Hash the server_password (which is already a derived key from the client)
	hashedServerPassword, err := bcrypt.GenerateFromPassword([]byte(params.ServerPassword), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	var signupAttribution datatypes.JSONMap
	if len(params.SignupAttribution) > 0 {
		signupAttribution = datatypes.JSONMap{}
		for key, value := range params.SignupAttribution {
			trimmedKey := strings.TrimSpace(key)
			trimmedValue := strings.TrimSpace(value)
			if trimmedKey == "" || trimmedValue == "" {
				continue
			}
			signupAttribution[trimmedKey] = trimmedValue
		}
		if len(signupAttribution) == 0 {
			signupAttribution = nil
		}
	}

	// Use the client-provided ID - it's cryptographically bound to the encrypted payload.
	user := &User{
		ID:                params.ID,
		Email:             params.Email,
		ServerPassword:    string(hashedServerPassword),
		UserType:          UserTypeHuman,
		SignupAttribution: signupAttribution,
	}

	// Cryptographic identity fields are required for E2EE.
	if params.CryptoFields == nil {
		return nil, fmt.Errorf("crypto fields are required")
	}
	if params.CryptoFields.BoxPublicKey == "" {
		return nil, fmt.Errorf("box public key is required")
	}
	if params.CryptoFields.SignPublicKey == "" {
		return nil, fmt.Errorf("sign public key is required")
	}
	user.CryptoBundleID = params.CryptoFields.CryptoBundleID
	user.ProtocolVersion = params.CryptoFields.ProtocolVersion
	user.PwSalt = params.CryptoFields.PwSalt
	user.EncKeyBundleNonce = params.CryptoFields.EncKeyBundleNonce
	user.EncKeyBundle = params.CryptoFields.EncKeyBundle
	user.BoxPublicKey = params.CryptoFields.BoxPublicKey
	user.SignPublicKey = params.CryptoFields.SignPublicKey

	if err := s.db.Create(user).Error; err != nil {
		return nil, err
	}

	return user, nil
}

// GetCryptoFieldsResponse returns the crypto fields needed for the client to decrypt identity keys.
func (u *User) GetCryptoFieldsResponse() *UserCryptoFieldsResponse {
	if u.CryptoBundleID == "" {
		return nil
	}
	return &UserCryptoFieldsResponse{
		CryptoBundleID:    u.CryptoBundleID,
		PwSalt:            u.PwSalt,
		ProtocolVersion:   u.ProtocolVersion,
		EncKeyBundleNonce: u.EncKeyBundleNonce,
		EncKeyBundle:      u.EncKeyBundle,
	}
}

// GetByEmail retrieves a user by their email address.
func (s *UserService) GetByEmail(email string) (*User, error) {
	var user User
	if err := s.db.Where("email = ?", email).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

// GetByID retrieves a user by their unique identifier.
func (s *UserService) GetByID(id string) (*User, error) {
	var user User
	if err := s.db.Where("id = ?", id).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

// GetByIDs retrieves all users matching the provided IDs.
// Returns an empty slice when no IDs are provided.
func (s *UserService) GetByIDs(ids []string) ([]*User, error) {
	if len(ids) == 0 {
		return []*User{}, nil
	}

	var users []*User
	if err := s.db.Where("id IN ?", ids).Find(&users).Error; err != nil {
		return nil, err
	}
	return users, nil
}

// CheckServerPassword verifies if the provided server_password matches the user's stored hash.
func (u *User) CheckServerPassword(serverPassword string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(u.ServerPassword), []byte(serverPassword))
	return err == nil
}

// UpdateServerPassword sets a new bcrypt-hashed server_password for the user with the given id.
func (s *UserService) UpdateServerPassword(id string, newServerPassword string) error {
	if len(newServerPassword) < 6 {
		return gorm.ErrInvalidData
	}
	hashedServerPassword, err := bcrypt.GenerateFromPassword([]byte(newServerPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	return s.db.Model(&User{}).Where("id = ?", id).Update("server_password", string(hashedServerPassword)).Error
}

// UpdateServerPasswordAndCryptoFields updates the server_password hash and E2EE crypto fields together.
// This is used when rotating password-derived encryption without changing identity keys.
func (s *UserService) UpdateServerPasswordAndCryptoFields(
	id string,
	newServerPassword string,
	cryptoFields *UserCryptoFields,
) error {
	if len(newServerPassword) < 6 {
		return gorm.ErrInvalidData
	}
	if cryptoFields == nil {
		return fmt.Errorf("crypto fields are required")
	}

	hashedServerPassword, err := bcrypt.GenerateFromPassword([]byte(newServerPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	updates := map[string]interface{}{
		"server_password":      string(hashedServerPassword),
		"crypto_bundle_id":     cryptoFields.CryptoBundleID,
		"protocol_version":     cryptoFields.ProtocolVersion,
		"pw_salt":              cryptoFields.PwSalt,
		"enc_key_bundle_nonce": cryptoFields.EncKeyBundleNonce,
		"enc_key_bundle":       cryptoFields.EncKeyBundle,
		"box_public_key":       cryptoFields.BoxPublicKey,
		"sign_public_key":      cryptoFields.SignPublicKey,
	}

	return s.db.Model(&User{}).Where("id = ?", id).Updates(updates).Error
}

// DB returns the underlying database handle.
func (s *UserService) DB() *gorm.DB {
	return s.db
}
