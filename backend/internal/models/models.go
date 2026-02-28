// Package models defines the data structures used across the application.
// These map to the Supabase PostgreSQL schema.
package models

import (
	"time"

	"github.com/google/uuid"
)

// ComplaintSecure represents an encrypted complaint stored in the database.
// IMPORTANT: The server NEVER has access to plaintext — only ciphertext.
type ComplaintSecure struct {
	ID            uuid.UUID              `json:"id" db:"id"`
	Reference     string                 `json:"reference" db:"reference"`
	CreatedAt     time.Time              `json:"created_at" db:"created_at"`
	TokenHash     string                 `json:"token_hash" db:"token_hash"`
	TokenHint     string                 `json:"token_hint" db:"token_hint"`
	CiphertextB64 string                 `json:"ciphertext_b64" db:"ciphertext_b64"`
	IVB64         string                 `json:"iv_b64" db:"iv_b64"`
	Authorities   []string               `json:"authorities" db:"authorities"`
	WrappedKeys   map[string]string      `json:"wrapped_keys" db:"wrapped_keys"`
	Metadata      map[string]interface{} `json:"metadata,omitempty" db:"metadata"`
}

// ComplaintSubmission is the request body for filing a new complaint
type ComplaintSubmission struct {
	CiphertextB64 string                 `json:"ciphertext_b64" validate:"required"`
	IVB64         string                 `json:"iv_b64" validate:"required"`
	TokenHash     string                 `json:"token_hash" validate:"required"`
	TokenHint     string                 `json:"token_hint"`
	Authorities   []string               `json:"authorities" validate:"required,min=1"`
	WrappedKeys   map[string]string      `json:"wrapped_keys" validate:"required"`
	Metadata      map[string]interface{} `json:"metadata,omitempty"`
}

// ActivityLog represents an authority action for accountability tracking
type ActivityLog struct {
	ID                uuid.UUID  `json:"id" db:"id"`
	ComplaintID       *uuid.UUID `json:"complaint_id,omitempty" db:"complaint_id"`
	TokenHash         string     `json:"token_hash" db:"token_hash"`
	ActivityType      string     `json:"activity_type" db:"activity_type"`
	ActionDescription string     `json:"action_description" db:"action_description"`
	Authority         string     `json:"authority" db:"authority"`
	Metadata          string     `json:"metadata,omitempty" db:"metadata"`
	CreatedAt         time.Time  `json:"created_at" db:"created_at"`
}

// ActivityLogEntry is the request body for logging an activity
type ActivityLogEntry struct {
	ComplaintID       *uuid.UUID `json:"complaint_id,omitempty"`
	TokenHash         string     `json:"token_hash" validate:"required"`
	ActivityType      string     `json:"activity_type" validate:"required"`
	ActionDescription string     `json:"action_description" validate:"required"`
	Authority         string     `json:"authority" validate:"required"`
	Metadata          string     `json:"metadata,omitempty"`
}

// MerkleProof contains the Merkle proof for a specific complaint
type MerkleProof struct {
	LeafHash string      `json:"leaf_hash"`
	Root     string      `json:"root"`
	Proof    []ProofStep `json:"proof"`
	Index    int         `json:"index"`
	Verified bool        `json:"verified"`
}

// ProofStep is a single step in a Merkle proof path
type ProofStep struct {
	Hash     string `json:"hash"`
	Position string `json:"position"` // "left" | "right"
}

// AnalyticsTrend represents aggregated complaint trend data
type AnalyticsTrend struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

// CategoryDistribution for pie/bar charts
type CategoryDistribution struct {
	Category string `json:"category"`
	Count    int    `json:"count"`
}

// DepartmentHeatmap for department analysis
type DepartmentHeatmap struct {
	Department string  `json:"department"`
	Count      int     `json:"count"`
	Urgency    float64 `json:"avg_urgency"`
}

// HealthStatus represents the server health check response
type HealthStatus struct {
	Status     string `json:"status"`
	Version    string `json:"version"`
	Uptime     string `json:"uptime"`
	Database   string `json:"database"`
	MerkleRoot string `json:"merkle_root,omitempty"`
}
