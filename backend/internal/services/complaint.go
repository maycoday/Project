// Package services contains business logic layers.
// Services are called by handlers and interact with the database.
package services

import (
	"context"
	"fmt"
	"time"

	"github.com/aawaaz/grievance-server/internal/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

// ComplaintService handles complaint business logic
type ComplaintService struct {
	db     *pgxpool.Pool
	logger *zap.SugaredLogger
}

// NewComplaintService creates a new complaint service
func NewComplaintService(db *pgxpool.Pool, logger *zap.SugaredLogger) *ComplaintService {
	return &ComplaintService{db: db, logger: logger}
}

// Create stores a new encrypted complaint
func (s *ComplaintService) Create(ctx context.Context, req *models.ComplaintSubmission) (*models.ComplaintSecure, error) {
	id := uuid.New()
	reference := id.String()[:8]
	now := time.Now()

	query := `
		INSERT INTO complaints_secure (id, reference, created_at, token_hash, token_hint, ciphertext_b64, iv_b64, authorities, wrapped_keys, metadata)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id, created_at
	`

	var complaint models.ComplaintSecure
	complaint.ID = id
	complaint.Reference = reference
	complaint.CreatedAt = now

	_, err := s.db.Exec(ctx, query,
		id, reference, now,
		req.TokenHash, req.TokenHint,
		req.CiphertextB64, req.IVB64,
		req.Authorities, req.WrappedKeys,
		req.Metadata,
	)

	if err != nil {
		return nil, fmt.Errorf("insert complaint: %w", err)
	}

	return &complaint, nil
}

// FindByTokenHash looks up a complaint by its token hash
func (s *ComplaintService) FindByTokenHash(ctx context.Context, tokenHash string) (*models.ComplaintSecure, error) {
	query := `SELECT id, reference, created_at, token_hash, token_hint, ciphertext_b64, iv_b64, authorities, wrapped_keys, metadata
		FROM complaints_secure WHERE token_hash = $1`

	var c models.ComplaintSecure
	row := s.db.QueryRow(ctx, query, tokenHash)
	err := row.Scan(&c.ID, &c.Reference, &c.CreatedAt, &c.TokenHash, &c.TokenHint,
		&c.CiphertextB64, &c.IVB64, &c.Authorities, &c.WrappedKeys, &c.Metadata)
	if err != nil {
		return nil, fmt.Errorf("complaint not found: %w", err)
	}

	return &c, nil
}

// Count returns the total number of complaints
func (s *ComplaintService) Count(ctx context.Context) (int64, error) {
	var count int64
	err := s.db.QueryRow(ctx, "SELECT COUNT(*) FROM complaints_secure").Scan(&count)
	return count, err
}

// GetTrends returns complaint submission trends over the last N hours
func (s *ComplaintService) GetTrends(ctx context.Context, hours int) ([]models.AnalyticsTrend, error) {
	query := `
		SELECT DATE_TRUNC('hour', created_at)::TEXT as date, COUNT(*) as count
		FROM complaints_secure
		WHERE created_at > NOW() - INTERVAL '1 hour' * $1
		GROUP BY DATE_TRUNC('hour', created_at)
		ORDER BY date DESC
	`

	rows, err := s.db.Query(ctx, query, hours)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var trends []models.AnalyticsTrend
	for rows.Next() {
		var t models.AnalyticsTrend
		if err := rows.Scan(&t.Date, &t.Count); err != nil {
			continue
		}
		trends = append(trends, t)
	}
	return trends, nil
}

// GetCategoryDistribution returns complaint categories for analytics charts
func (s *ComplaintService) GetCategoryDistribution(ctx context.Context) ([]models.CategoryDistribution, error) {
	query := `
		SELECT metadata->>'category' as category, COUNT(*) as count
		FROM complaints_secure
		WHERE metadata->>'category' IS NOT NULL
		GROUP BY metadata->>'category'
		ORDER BY count DESC
	`

	rows, err := s.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cats []models.CategoryDistribution
	for rows.Next() {
		var c models.CategoryDistribution
		if err := rows.Scan(&c.Category, &c.Count); err != nil {
			continue
		}
		cats = append(cats, c)
	}
	return cats, nil
}

// GetDepartmentHeatmap returns department-level analytics
func (s *ComplaintService) GetDepartmentHeatmap(ctx context.Context) ([]models.DepartmentHeatmap, error) {
	query := `
		SELECT metadata->>'department' as department, COUNT(*) as count,
			AVG((metadata->>'urgency')::NUMERIC) as avg_urgency
		FROM complaints_secure
		WHERE metadata->>'department' IS NOT NULL
		GROUP BY metadata->>'department'
		ORDER BY count DESC
	`

	rows, err := s.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var depts []models.DepartmentHeatmap
	for rows.Next() {
		var d models.DepartmentHeatmap
		if err := rows.Scan(&d.Department, &d.Count, &d.Urgency); err != nil {
			continue
		}
		depts = append(depts, d)
	}
	return depts, nil
}
