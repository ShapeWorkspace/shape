package database

import (
	"fmt"
	"strings"

	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"shape/models"
	"shape/utils"
)

// InitDB initializes the database connection based on the provided URL.
// Supports both PostgreSQL and SQLite connections.
func InitDB(databaseURL string) (*gorm.DB, error) {
	var db *gorm.DB
	var err error

	gormConfig := &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	}

	if strings.HasPrefix(databaseURL, "sqlite://") {
		// SQLite connection for local development
		sqlitePath := strings.TrimPrefix(databaseURL, "sqlite://")
		db, err = gorm.Open(sqlite.Open(sqlitePath), gormConfig)
		if err != nil {
			return nil, fmt.Errorf("failed to connect to SQLite database: %w", err)
		}
		sqlDB, err := db.DB()
		if err != nil {
			return nil, fmt.Errorf("failed to access SQLite database handle: %w", err)
		}
		// SQLite only supports a single writer, so serialize writes from this process.
		sqlDB.SetMaxOpenConns(1)
		sqlDB.SetMaxIdleConns(1)
		for _, pragma := range []string{
			"PRAGMA journal_mode=WAL;",
			"PRAGMA synchronous=NORMAL;",
			"PRAGMA busy_timeout=10000;",
			"PRAGMA foreign_keys=ON;",
		} {
			if execErr := db.Exec(pragma).Error; execErr != nil {
				return nil, fmt.Errorf("failed to configure SQLite (%s): %w", pragma, execErr)
			}
		}
		utils.Info("Connected to SQLite database")
	} else {
		// PostgreSQL connection for production
		db, err = gorm.Open(postgres.Open(databaseURL), gormConfig)
		if err != nil {
			return nil, fmt.Errorf("failed to connect to PostgreSQL database: %w", err)
		}
		utils.Info("Connected to PostgreSQL database")
	}

	return db, nil
}

// DefaultModelSet returns the set of models that should be auto-migrated.
// These are the foundational models required by the application.
func DefaultModelSet() []interface{} {
	return []interface{}{
		// Core user and workspace models
		&models.User{},
		&models.UserSetting{},
		&models.Workspace{},
		&models.WorkspaceMember{},
		&models.WorkspaceInvite{},
		&models.WorkspaceEmailInvite{},
		&models.WorkspaceUserInvite{},
		&models.WorkspaceLinkInvite{},
		&models.Team{},
		&models.TeamMember{},
		&models.ACLEntry{},

		// ACL performance infrastructure
		&models.EntityClosure{},
		&models.EffectiveResourceAccess{},

		// Workspace key models for E2EE
		&models.WorkspaceKey{},
		&models.WorkspaceKeyShare{},

		// Unified entity models with E2EE
		&models.Entity{},
		&models.EntityBlock{},
		&models.EntityLink{},

		// File upload infrastructure (multipart tracking for file entities)
		&models.FileUploadSession{},
		&models.FileUploadPart{},

		// Sync infrastructure
		&models.ChangeLogEntry{},

		// Notification models
		&models.EntitySubscription{},
		&models.InAppNotification{},
		&models.PushNotification{},
		&models.NotificationPreference{},
		&models.DeviceToken{},

		// Subscription and billing models
		&models.WorkspaceSubscription{},
		&models.StripeSubscriptionInfo{},
		&models.StripePayment{},
		&models.StripeEventLog{},
		&models.SubscriptionCredit{},

		// Authentication models
		&models.PasswordResetToken{},
		&models.AppRefreshToken{},
		&models.InviteCode{},
	}
}

// RunMigrations runs all pending migrations on the database.
func RunMigrations(db *gorm.DB) error {
	utils.Info("Running database migrations...")

	modelSet := DefaultModelSet()
	for _, model := range modelSet {
		if err := db.AutoMigrate(model); err != nil {
			return fmt.Errorf("failed to migrate model %T: %w", model, err)
		}
	}

	utils.Info("Database migrations completed successfully")
	return nil
}
