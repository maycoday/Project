package handlers

import (
	"net/http"
	"time"

	"github.com/aawaaz/grievance-server/internal/models"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

var startTime = time.Now()

// HealthHandler provides health check endpoints
type HealthHandler struct {
	db     *pgxpool.Pool
	logger *zap.SugaredLogger
}

// NewHealthHandler creates a new health handler
func NewHealthHandler(db *pgxpool.Pool, logger *zap.SugaredLogger) *HealthHandler {
	return &HealthHandler{db: db, logger: logger}
}

// Check handles GET /api/v1/health (liveness probe)
func (h *HealthHandler) Check(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, models.HealthStatus{
		Status:  "ok",
		Version: "2.4.0",
		Uptime:  time.Since(startTime).String(),
	})
}

// Ready handles GET /api/v1/health/ready (readiness probe)
func (h *HealthHandler) Ready(w http.ResponseWriter, r *http.Request) {
	dbStatus := "connected"
	if err := h.db.Ping(r.Context()); err != nil {
		dbStatus = "disconnected"
		respondJSON(w, http.StatusServiceUnavailable, models.HealthStatus{
			Status:   "not ready",
			Version:  "2.4.0",
			Database: dbStatus,
		})
		return
	}

	respondJSON(w, http.StatusOK, models.HealthStatus{
		Status:   "ready",
		Version:  "2.4.0",
		Uptime:   time.Since(startTime).String(),
		Database: dbStatus,
	})
}
