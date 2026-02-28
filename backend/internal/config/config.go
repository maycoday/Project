// Package config handles loading and validation of application configuration
// from environment variables. Supports .env files via godotenv.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

// Config holds all application configuration
type Config struct {
	// Server settings
	Port        int
	Environment string // "development" | "staging" | "production"

	// Database
	DatabaseURL string
	SupabaseURL string
	SupabaseKey string

	// Security
	JWTSecret      string
	AllowedOrigins []string
	RateLimitRPM   int

	// Redis (for rate limiting & caching)
	RedisURL string

	// Merkle tree
	MerkleRebuildInterval int // minutes
}

// Load reads configuration from environment variables
func Load() (*Config, error) {
	// Load .env file if it exists (development)
	_ = godotenv.Load()

	cfg := &Config{
		Port:        getEnvInt("PORT", 8080),
		Environment: getEnv("ENVIRONMENT", "development"),

		DatabaseURL: getEnv("DATABASE_URL", ""),
		SupabaseURL: getEnv("SUPABASE_URL", ""),
		SupabaseKey: getEnv("SUPABASE_ANON_KEY", ""),

		JWTSecret:      getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		AllowedOrigins: strings.Split(getEnv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000"), ","),
		RateLimitRPM:   getEnvInt("RATE_LIMIT_RPM", 60),

		RedisURL: getEnv("REDIS_URL", "redis://localhost:6379"),

		MerkleRebuildInterval: getEnvInt("MERKLE_REBUILD_INTERVAL", 5),
	}

	// Validate required fields in production
	if cfg.Environment == "production" {
		if cfg.DatabaseURL == "" {
			return nil, fmt.Errorf("DATABASE_URL is required in production")
		}
		if cfg.JWTSecret == "dev-secret-change-in-production" {
			return nil, fmt.Errorf("JWT_SECRET must be set in production")
		}
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if val := os.Getenv(key); val != "" {
		if i, err := strconv.Atoi(val); err == nil {
			return i
		}
	}
	return fallback
}
