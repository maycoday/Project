package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/aawaaz/grievance-server/internal/models"
	"github.com/aawaaz/grievance-server/internal/services"
	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

// ActivityHandler handles activity log endpoints
type ActivityHandler struct {
	svc    *services.ActivityLogService
	logger *zap.SugaredLogger
}

// NewActivityHandler creates a new activity handler
func NewActivityHandler(svc *services.ActivityLogService, logger *zap.SugaredLogger) *ActivityHandler {
	return &ActivityHandler{svc: svc, logger: logger}
}

// Log handles POST /api/v1/activity
func (h *ActivityHandler) Log(w http.ResponseWriter, r *http.Request) {
	var entry models.ActivityLogEntry
	if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := h.svc.Log(r.Context(), &entry); err != nil {
		h.logger.Errorw("Failed to log activity", "error", err)
		respondError(w, http.StatusInternalServerError, "Failed to log activity")
		return
	}

	respondJSON(w, http.StatusCreated, map[string]string{"status": "logged"})
}

// ByToken handles GET /api/v1/activity/token/{tokenHash}
func (h *ActivityHandler) ByToken(w http.ResponseWriter, r *http.Request) {
	tokenHash := chi.URLParam(r, "tokenHash")
	if tokenHash == "" {
		respondError(w, http.StatusBadRequest, "Token hash required")
		return
	}

	logs, err := h.svc.FetchByToken(r.Context(), tokenHash, 50)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch logs")
		return
	}

	respondJSON(w, http.StatusOK, logs)
}

// Recent handles GET /api/v1/activity/recent
func (h *ActivityHandler) Recent(w http.ResponseWriter, r *http.Request) {
	logs, err := h.svc.FetchRecent(r.Context(), 100)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch recent activity")
		return
	}

	respondJSON(w, http.StatusOK, logs)
}
