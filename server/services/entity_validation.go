package services

import (
	"errors"
	"strings"

	"shape/models"
	"shape/repositories"
)

// EntityCreateValidator validates entity-type-specific create invariants.
type EntityCreateValidator interface {
	Validate(params models.CreateEntityParams) error
}

// EntityUpdateValidator validates entity-type-specific update invariants.
type EntityUpdateValidator interface {
	Validate(entity *models.Entity, params models.UpdateEntityParams) error
}

func buildEntityCreateValidators(repository repositories.EntityRepository) map[string][]EntityCreateValidator {
	return map[string][]EntityCreateValidator{
		"user-profile": {
			&userProfileCreateValidator{repository: repository},
		},
	}
}

func buildEntityUpdateValidators() map[string][]EntityUpdateValidator {
	return map[string][]EntityUpdateValidator{
		"user-profile": {
			&userProfileUpdateValidator{},
		},
	}
}

func (s *EntityService) validateCreateByEntityType(params models.CreateEntityParams) error {
	for _, validator := range s.createValidatorsByType[params.EntityType] {
		if err := validator.Validate(params); err != nil {
			return err
		}
	}
	return nil
}

func (s *EntityService) validateUpdateByEntityType(entity *models.Entity, params models.UpdateEntityParams) error {
	for _, validator := range s.updateValidatorsByType[entity.EntityType] {
		if err := validator.Validate(entity, params); err != nil {
			return err
		}
	}
	return nil
}

type userProfileCreateValidator struct {
	repository repositories.EntityRepository
}

func (v *userProfileCreateValidator) Validate(params models.CreateEntityParams) error {
	if params.ParentID != nil && strings.TrimSpace(*params.ParentID) != "" {
		return errors.New("user-profile cannot have a parent")
	}
	if params.ParentType != nil && strings.TrimSpace(*params.ParentType) != "" {
		return errors.New("user-profile cannot have a parent_type")
	}
	if params.WrappingKeyType != "workspace" {
		return errors.New("user-profile must use workspace wrapping")
	}

	existing, err := v.repository.QueryEntities(
		params.WorkspaceID,
		"entity_type = ? AND creator_id = ?",
		[]interface{}{"user-profile", params.CreatorID},
	)
	if err != nil {
		return err
	}
	if len(existing) > 0 {
		return models.ErrUserProfileAlreadyExists
	}

	return nil
}

type userProfileUpdateValidator struct{}

func (v *userProfileUpdateValidator) Validate(_ *models.Entity, params models.UpdateEntityParams) error {
	if params.WrappingKeyType != "workspace" {
		return errors.New("user-profile must use workspace wrapping")
	}
	return nil
}
