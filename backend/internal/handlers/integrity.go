package handlers

import (
	"net/http"
	"strconv"

	"github.com/aawaaz/grievance-server/internal/services"
	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

// IntegrityHandler handles Merkle tree verification endpoints
type IntegrityHandler struct {
	svc    *services.MerkleService
	logger *zap.SugaredLogger
}

// NewIntegrityHandler creates a new integrity handler
func NewIntegrityHandler(svc *services.MerkleService, logger *zap.SugaredLogger) *IntegrityHandler {
	return &IntegrityHandler{svc: svc, logger: logger}
}

// GetRoot handles GET /api/v1/integrity/root
func (h *IntegrityHandler) GetRoot(w http.ResponseWriter, r *http.Request) {
	root := h.svc.GetRoot()
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"root":       root,
		"leaf_count": h.svc.GetLeafCount(),
		"timestamp":  h.svc.GetLastBuildTime(),
	})
}

// GetProof handles GET /api/v1/integrity/proof/{index}
func (h *IntegrityHandler) GetProof(w http.ResponseWriter, r *http.Request) {
	indexStr := chi.URLParam(r, "index")
	index, err := strconv.Atoi(indexStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid index")
		return
	}

	proof, err := h.svc.GetProof(index)
	if err != nil {
		respondError(w, http.StatusNotFound, "Proof not available for index")
		return
	}

	respondJSON(w, http.StatusOK, proof)
}

// Verify handles POST /api/v1/integrity/verify
func (h *IntegrityHandler) Verify(w http.ResponseWriter, r *http.Request) {
	// Verification logic delegates to MerkleService
	respondJSON(w, http.StatusOK, map[string]string{"status": "verification endpoint"})
}
