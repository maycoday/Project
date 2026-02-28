// Package main is the entry point for the Aawaaz grievance backend server.
// It provides a REST API for encrypted complaint submission, retrieval,
// activity logging, and integrity verification via Merkle proofs.
//
// Architecture:
//   - All complaints are stored encrypted (AES-256-GCM ciphertext)
//   - Server has NO decryption capability (architecturally blind)
//   - Token-based lookup with SHA-256 hashed tracking tokens
//   - Activity logs provide authority accountability
//   - Merkle tree root published for tamper detection
//
// The server acts as a "blind relay" — it stores and serves encrypted
// blobs but cannot read any complaint content.
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/aawaaz/grievance-server/internal/config"
	"github.com/aawaaz/grievance-server/internal/database"
	"github.com/aawaaz/grievance-server/internal/handlers"
	"github.com/aawaaz/grievance-server/internal/middleware"
	"github.com/aawaaz/grievance-server/internal/services"
	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"go.uber.org/zap"
)

func main() {
	// Initialize structured logger
	logger, _ := zap.NewProduction()
	defer logger.Sync()
	sugar := logger.Sugar()

	// Load configuration from environment
	cfg, err := config.Load()
	if err != nil {
		sugar.Fatalf("Failed to load config: %v", err)
	}

	sugar.Infow("Starting Aawaaz Grievance Server",
		"port", cfg.Port,
		"env", cfg.Environment,
		"supabase_url", cfg.SupabaseURL,
	)

	// Initialize database connection pool
	db, err := database.NewPool(cfg.DatabaseURL)
	if err != nil {
		sugar.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Initialize services
	complaintSvc := services.NewComplaintService(db, sugar)
	activitySvc := services.NewActivityLogService(db, sugar)
	merkleSvc := services.NewMerkleService(sugar)
	integrityWorker := services.NewIntegrityWorker(merkleSvc, complaintSvc, sugar)

	// Start background integrity worker (rebuilds Merkle tree periodically)
	go integrityWorker.Start(context.Background(), 5*time.Minute)

	// Initialize handlers
	complaintHandler := handlers.NewComplaintHandler(complaintSvc, activitySvc, sugar)
	activityHandler := handlers.NewActivityHandler(activitySvc, sugar)
	integrityHandler := handlers.NewIntegrityHandler(merkleSvc, sugar)
	healthHandler := handlers.NewHealthHandler(db, sugar)

	// Build router
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(middleware.StructuredLogger(logger))
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(30 * time.Second))
	r.Use(middleware.StripIPHeaders()) // Remove IP-identifying headers
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.AllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-ID"},
		ExposedHeaders:   []string{"X-Request-ID", "X-Merkle-Root"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	// Rate limiting
	r.Use(middleware.RateLimit(cfg.RateLimitRPM))

	// API Routes
	r.Route("/api/v1", func(r chi.Router) {
		// Health check
		r.Get("/health", healthHandler.Check)
		r.Get("/health/ready", healthHandler.Ready)

		// Complaint endpoints (public — no auth required)
		r.Route("/complaints", func(r chi.Router) {
			r.Post("/", complaintHandler.Submit)                  // Submit encrypted complaint
			r.Get("/lookup/{tokenHash}", complaintHandler.Lookup) // Lookup by token hash
			r.Get("/count", complaintHandler.Count)               // Get total count
		})

		// Activity log endpoints
		r.Route("/activity", func(r chi.Router) {
			r.Post("/", activityHandler.Log)                     // Log an action
			r.Get("/token/{tokenHash}", activityHandler.ByToken) // Get logs by token
			r.Get("/recent", activityHandler.Recent)             // Recent activity (admin)
		})

		// Integrity endpoints (Merkle tree)
		r.Route("/integrity", func(r chi.Router) {
			r.Get("/root", integrityHandler.GetRoot)           // Current Merkle root
			r.Get("/proof/{index}", integrityHandler.GetProof) // Proof for specific leaf
			r.Post("/verify", integrityHandler.Verify)         // Verify a proof
		})

		// Analytics endpoints (metadata only — no plaintext access)
		r.Route("/analytics", func(r chi.Router) {
			r.Use(middleware.RequireAuth(cfg.JWTSecret))
			r.Get("/trends", complaintHandler.Trends)
			r.Get("/categories", complaintHandler.Categories)
			r.Get("/departments", complaintHandler.Departments)
		})
	})

	// Serve static files (frontend build)
	r.Handle("/*", http.FileServer(http.Dir("../dist")))

	// Create HTTP server
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	done := make(chan os.Signal, 1)
	signal.Notify(done, os.Interrupt, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		sugar.Infof("Server listening on :%d", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			sugar.Fatalf("Server error: %v", err)
		}
	}()

	<-done
	sugar.Info("Shutting down gracefully...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		sugar.Fatalf("Forced shutdown: %v", err)
	}

	sugar.Info("Server stopped")
}
