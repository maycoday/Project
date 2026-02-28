package services

import (
	"context"
	"fmt"

	"github.com/aawaaz/grievance-server/internal/models"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

// ActivityLogService handles activity log business logic
type ActivityLogService struct {
	db     *pgxpool.Pool
	logger *zap.SugaredLogger
}

// NewActivityLogService creates a new activity log service
func NewActivityLogService(db *pgxpool.Pool, logger *zap.SugaredLogger) *ActivityLogService {
	return &ActivityLogService{db: db, logger: logger}
}

// Log records an authority action
func (s *ActivityLogService) Log(ctx context.Context, entry *models.ActivityLogEntry) error {
	query := `
		INSERT INTO activity_logs (token_hash, complaint_id, activity_type, action_description, authority, metadata)
		VALUES ($1, $2, $3, $4, $5, $6)
	`

	_, err := s.db.Exec(ctx, query,
		entry.TokenHash,
		entry.ComplaintID,
		entry.ActivityType,
		entry.ActionDescription,
		entry.Authority,
		entry.Metadata,
	)

	if err != nil {
		return fmt.Errorf("insert activity log: %w", err)
	}

	s.logger.Infow("Activity logged",
		"authority", entry.Authority,
		"type", entry.ActivityType,
		"action", entry.ActionDescription,
	)

	return nil
}

// FetchByToken returns activity logs for a specific complaint token
func (s *ActivityLogService) FetchByToken(ctx context.Context, tokenHash string, limit int) ([]models.ActivityLog, error) {
	query := `
		SELECT id, complaint_id, token_hash, activity_type, action_description, authority, metadata, created_at
		FROM activity_logs
		WHERE token_hash = $1
		ORDER BY created_at DESC
		LIMIT $2
	`

	rows, err := s.db.Query(ctx, query, tokenHash, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []models.ActivityLog
	for rows.Next() {
		var log models.ActivityLog
		if err := rows.Scan(&log.ID, &log.ComplaintID, &log.TokenHash,
			&log.ActivityType, &log.ActionDescription, &log.Authority,
			&log.Metadata, &log.CreatedAt); err != nil {
			continue
		}
		logs = append(logs, log)
	}

	return logs, nil
}

// FetchRecent returns recent activity logs across all complaints
func (s *ActivityLogService) FetchRecent(ctx context.Context, limit int) ([]models.ActivityLog, error) {
	query := `
		SELECT id, complaint_id, token_hash, activity_type, action_description, authority, metadata, created_at
		FROM activity_logs
		ORDER BY created_at DESC
		LIMIT $1
	`

	rows, err := s.db.Query(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []models.ActivityLog
	for rows.Next() {
		var log models.ActivityLog
		if err := rows.Scan(&log.ID, &log.ComplaintID, &log.TokenHash,
			&log.ActivityType, &log.ActionDescription, &log.Authority,
			&log.Metadata, &log.CreatedAt); err != nil {
			continue
		}
		logs = append(logs, log)
	}

	return logs, nil
}
