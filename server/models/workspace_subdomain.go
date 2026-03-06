package models

import (
	"errors"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

	"gorm.io/gorm"
)

const (
	workspaceSubdomainMaxLength = 63
	workspaceSubdomainFallback  = "workspace"
)

var workspaceSubdomainSanitizer = regexp.MustCompile(`[^a-z0-9]+`)

// GenerateUniqueWorkspaceSubdomain normalizes the provided workspace name into a DNS-safe label and
// appends a numeric suffix when necessary to preserve global uniqueness across all workspaces.
// Uses a single query to find the next available suffix instead of iterating through each one.
func GenerateUniqueWorkspaceSubdomain(db *gorm.DB, workspaceName string) (string, error) {
	if db == nil {
		return "", errors.New("workspace subdomain: db handle is nil")
	}

	base := NormalizeWorkspaceSubdomainSource(workspaceName)
	if base == "" {
		base = workspaceSubdomainFallback
	}

	// First check if the base subdomain is available (most common case for unique names)
	exists, err := workspaceSubdomainExists(db, base)
	if err != nil {
		return "", err
	}
	if !exists {
		return base, nil
	}

	// Base is taken - find the max existing suffix in a single query.
	// Pattern matches: base, base-1, base-2, ..., base-N
	// We extract the numeric suffix and find the maximum.
	maxSuffix, err := findMaxSubdomainSuffix(db, base)
	if err != nil {
		return "", err
	}

	// Use max + 1 as the new suffix
	nextSuffix := maxSuffix + 1
	return FormatWorkspaceSubdomainCandidate(base, nextSuffix), nil
}

// findMaxSubdomainSuffix finds the highest numeric suffix for subdomains matching the given base.
// Returns 0 if only the base exists (no suffixed versions), or the max suffix number found.
// Uses PostgreSQL regex syntax since that's our production database.
func findMaxSubdomainSuffix(db *gorm.DB, base string) (int, error) {
	dialect := strings.ToLower(strings.TrimSpace(db.Dialector.Name()))
	if dialect != "postgres" && dialect != "postgresql" {
		return findMaxSubdomainSuffixScan(db, base)
	}

	pattern := base + "-%"
	prefixLen := len(base) + 2 // +2 for the "-" and 1-based indexing in SQL

	var maxSuffix *int64
	// PostgreSQL query using ~ regex operator to ensure only numeric suffixes are considered.
	// SUBSTR extracts everything after "base-", regex validates it's numeric, then we cast to bigint.
	query := `
		SELECT MAX(CAST(SUBSTR(LOWER(subdomain), $1) AS BIGINT))
		FROM workspaces
		WHERE LOWER(subdomain) LIKE $2
		  AND SUBSTR(LOWER(subdomain), $1) ~ '^[0-9]+$'
	`

	err := db.Raw(query, prefixLen, pattern).Scan(&maxSuffix).Error
	if err != nil {
		return findMaxSubdomainSuffixScan(db, base)
	}

	if maxSuffix == nil {
		return 0, nil
	}
	if *maxSuffix > int64(math.MaxInt) {
		return math.MaxInt, nil
	}
	return int(*maxSuffix), nil
}

// findMaxSubdomainSuffixScan is a fallback that scans matching records in-memory.
// Uses ORDER BY and LIMIT to avoid loading excessive records.
func findMaxSubdomainSuffixScan(db *gorm.DB, base string) (int, error) {
	pattern := base + "-%"
	var subdomains []string

	// Fetch subdomains ordered by length descending (longer = higher number typically)
	// then by subdomain descending. Limit to a reasonable set.
	err := db.Model(&Workspace{}).
		Select("subdomain").
		Where("LOWER(subdomain) LIKE ?", pattern).
		Order("LENGTH(subdomain) DESC, subdomain DESC").
		Limit(1000).
		Pluck("subdomain", &subdomains).Error
	if err != nil {
		return 0, err
	}

	maxSuffix := 0
	prefix := base + "-"
	for _, subdomain := range subdomains {
		lower := strings.ToLower(subdomain)
		if !strings.HasPrefix(lower, prefix) {
			continue
		}
		suffixStr := lower[len(prefix):]
		if suffix, err := strconv.Atoi(suffixStr); err == nil && suffix > maxSuffix {
			maxSuffix = suffix
		}
	}

	return maxSuffix, nil
}

// workspaceSubdomainExists checks if a subdomain is already taken.
func workspaceSubdomainExists(db *gorm.DB, candidate string) (bool, error) {
	var count int64
	if err := db.Model(&Workspace{}).
		Where("LOWER(subdomain) = ?", strings.ToLower(candidate)).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

// NormalizeWorkspaceSubdomainSource converts a raw workspace name into a DNS-safe slug base.
func NormalizeWorkspaceSubdomainSource(raw string) string {
	lower := strings.ToLower(strings.TrimSpace(raw))
	if lower == "" {
		return ""
	}

	cleaned := workspaceSubdomainSanitizer.ReplaceAllString(lower, "-")
	cleaned = strings.Trim(cleaned, "-")
	if len(cleaned) > workspaceSubdomainMaxLength {
		cleaned = cleaned[:workspaceSubdomainMaxLength]
		cleaned = strings.Trim(cleaned, "-")
	}

	return cleaned
}

// FormatWorkspaceSubdomainCandidate appends a numeric suffix to the provided base while respecting length limits.
func FormatWorkspaceSubdomainCandidate(base string, suffix int) string {
	if suffix < 1 {
		suffix = 1
	}

	token := fmt.Sprintf("-%d", suffix)
	maxBaseLength := workspaceSubdomainMaxLength - len(token)
	if maxBaseLength < 1 {
		maxBaseLength = 1
	}

	trimmedBase := base
	if len(trimmedBase) > maxBaseLength {
		trimmedBase = trimmedBase[:maxBaseLength]
		trimmedBase = strings.Trim(trimmedBase, "-")
	}
	if trimmedBase == "" {
		if len(workspaceSubdomainFallback) > maxBaseLength {
			trimmedBase = workspaceSubdomainFallback[:maxBaseLength]
		} else {
			trimmedBase = workspaceSubdomainFallback
		}
		trimmedBase = strings.Trim(trimmedBase, "-")
		if trimmedBase == "" {
			trimmedBase = workspaceSubdomainFallback
		}
	}

	candidate := trimmedBase + token
	candidate = strings.Trim(candidate, "-")
	if candidate == "" {
		candidate = fmt.Sprintf("%s-%d", workspaceSubdomainFallback, suffix)
		candidate = strings.Trim(candidate, "-")
	}

	return candidate
}
