// Package middleware provides HTTP middleware for the Aawaaz server.
package middleware

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"go.uber.org/zap"
)

// StructuredLogger returns a middleware that logs HTTP requests with zap
func StructuredLogger(logger *zap.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()

			// Wrap response writer to capture status code
			ww := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
			next.ServeHTTP(ww, r)

			logger.Info("HTTP Request",
				zap.String("method", r.Method),
				zap.String("path", r.URL.Path),
				zap.Int("status", ww.statusCode),
				zap.Duration("latency", time.Since(start)),
				zap.String("request_id", r.Header.Get("X-Request-ID")),
			)
		})
	}
}

// StripIPHeaders removes IP-identifying headers for privacy
// This is critical for the zero-knowledge architecture
func StripIPHeaders() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Remove headers that could identify the user
			r.Header.Del("X-Forwarded-For")
			r.Header.Del("X-Real-IP")
			r.Header.Del("CF-Connecting-IP")
			r.Header.Del("True-Client-IP")
			r.Header.Del("X-Client-IP")

			// Set privacy headers on response
			w.Header().Set("X-Privacy", "no-ip-logging")
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("X-Frame-Options", "DENY")
			w.Header().Set("Referrer-Policy", "no-referrer")

			next.ServeHTTP(w, r)
		})
	}
}

// RequireAuth validates JWT tokens for protected routes
func RequireAuth(secret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				http.Error(w, `{"error": "Authorization required"}`, http.StatusUnauthorized)
				return
			}

			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
			token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
				return []byte(secret), nil
			})

			if err != nil || !token.Valid {
				http.Error(w, `{"error": "Invalid or expired token"}`, http.StatusUnauthorized)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// RateLimit implements a simple in-memory rate limiter using sliding window
func RateLimit(requestsPerMinute int) func(http.Handler) http.Handler {
	type client struct {
		count    int
		lastSeen time.Time
	}

	var (
		mu      sync.Mutex
		clients = make(map[string]*client)
	)

	// Cleanup stale entries every 5 minutes
	go func() {
		for {
			time.Sleep(5 * time.Minute)
			mu.Lock()
			for ip, c := range clients {
				if time.Since(c.lastSeen) > 2*time.Minute {
					delete(clients, ip)
				}
			}
			mu.Unlock()
		}
	}()

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Use a generic key since we strip IPs — rate limit by request pattern
			key := r.URL.Path

			mu.Lock()
			c, exists := clients[key]
			if !exists {
				clients[key] = &client{count: 1, lastSeen: time.Now()}
				mu.Unlock()
				next.ServeHTTP(w, r)
				return
			}

			if time.Since(c.lastSeen) > time.Minute {
				c.count = 1
				c.lastSeen = time.Now()
			} else {
				c.count++
			}

			if c.count > requestsPerMinute {
				mu.Unlock()
				http.Error(w, `{"error": "Rate limit exceeded"}`, http.StatusTooManyRequests)
				return
			}

			mu.Unlock()
			next.ServeHTTP(w, r)
		})
	}
}

// responseWriter wraps http.ResponseWriter to capture status code
type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (w *responseWriter) WriteHeader(code int) {
	w.statusCode = code
	w.ResponseWriter.WriteHeader(code)
}
