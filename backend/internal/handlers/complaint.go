// Package handlers contains HTTP request handlers for the Aawaaz API.
// Handlers parse requests, call services, and return JSON responses.
package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/aawaaz/grievance-server/internal/models"
	"github.com/aawaaz/grievance-server/internal/services"
	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

// ComplaintHandler handles complaint-related HTTP endpoints
type ComplaintHandler struct {
	complaintSvc *services.ComplaintService
	activitySvc  *services.ActivityLogService
	logger       *zap.SugaredLogger
}

// NewComplaintHandler creates a new complaint handler
func NewComplaintHandler(cs *services.ComplaintService, as *services.ActivityLogService, logger *zap.SugaredLogger) *ComplaintHandler {
	return &ComplaintHandler{complaintSvc: cs, activitySvc: as, logger: logger}
}

// Submit handles POST /api/v1/complaints
// Accepts encrypted complaint payload and stores it.
// Server receives ONLY ciphertext — zero plaintext exposure.
func (h *ComplaintHandler) Submit(w http.ResponseWriter, r *http.Request) {
	var req models.ComplaintSubmission
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate required fields
	if req.CiphertextB64 == "" || req.TokenHash == "" || len(req.Authorities) == 0 {
		respondError(w, http.StatusBadRequest, "Missing required fields: ciphertext_b64, token_hash, authorities")
		return
	}

	complaint, err := h.complaintSvc.Create(r.Context(), &req)
	if err != nil {
		h.logger.Errorw("Failed to create complaint", "error", err)
		respondError(w, http.StatusInternalServerError, "Failed to submit complaint")
		return
	}

	// Log the submission activity
	_ = h.activitySvc.Log(r.Context(), &models.ActivityLogEntry{
		TokenHash:         req.TokenHash,
		ActivityType:      "submission",
		ActionDescription: "Encrypted complaint received by server",
		Authority:         "SYSTEM",
	})

	h.logger.Infow("Complaint submitted",
		"id", complaint.ID,
		"authorities", req.Authorities,
		"has_metadata", req.Metadata != nil,
	)

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"id":         complaint.ID,
		"reference":  complaint.Reference,
		"created_at": complaint.CreatedAt,
		"message":    "Complaint encrypted and stored — server cannot read content",
	})
}

// Lookup handles GET /api/v1/complaints/lookup/{tokenHash}
func (h *ComplaintHandler) Lookup(w http.ResponseWriter, r *http.Request) {
	tokenHash := chi.URLParam(r, "tokenHash")
	if tokenHash == "" {
		respondError(w, http.StatusBadRequest, "Token hash required")
		return
	}

	complaint, err := h.complaintSvc.FindByTokenHash(r.Context(), tokenHash)
	if err != nil {
		respondError(w, http.StatusNotFound, "Complaint not found")
		return
	}

	respondJSON(w, http.StatusOK, complaint)
}

// Count handles GET /api/v1/complaints/count
func (h *ComplaintHandler) Count(w http.ResponseWriter, r *http.Request) {
	count, err := h.complaintSvc.Count(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to get count")
		return
	}
	respondJSON(w, http.StatusOK, map[string]int64{"count": count})
}

// Trends handles GET /api/v1/analytics/trends
func (h *ComplaintHandler) Trends(w http.ResponseWriter, r *http.Request) {
	trends, err := h.complaintSvc.GetTrends(r.Context(), 72)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch trends")
		return
	}
	respondJSON(w, http.StatusOK, trends)
}

// Categories handles GET /api/v1/analytics/categories
func (h *ComplaintHandler) Categories(w http.ResponseWriter, r *http.Request) {
	cats, err := h.complaintSvc.GetCategoryDistribution(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch categories")
		return
	}
	respondJSON(w, http.StatusOK, cats)
}

// Departments handles GET /api/v1/analytics/departments
func (h *ComplaintHandler) Departments(w http.ResponseWriter, r *http.Request) {
	depts, err := h.complaintSvc.GetDepartmentHeatmap(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch departments")
		return
	}
	respondJSON(w, http.StatusOK, depts)
}

// Helper: respond with JSON
func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// Helper: respond with error
func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}
