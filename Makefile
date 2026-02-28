.PHONY: help dev build run test lint clean docker-up docker-down

# ─── Variables ──────────────────────────────────────────
GO        := go
NPM       := npm
BINARY    := server
BACKEND   := ./backend
FRONTEND  := .

# ─── Help ───────────────────────────────────────────────
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

# ─── Development ────────────────────────────────────────
dev: ## Start frontend + backend in development mode
	@echo "Starting Vite dev server..."
	$(NPM) run dev &
	@echo "Starting Go server..."
	cd $(BACKEND) && $(GO) run ./cmd/server

frontend: ## Start only the Vite dev server
	$(NPM) run dev

backend: ## Start only the Go server
	cd $(BACKEND) && $(GO) run ./cmd/server

# ─── Build ──────────────────────────────────────────────
build: build-frontend build-backend ## Build everything

build-frontend: ## Build the Vite/React frontend
	$(NPM) run build

build-backend: ## Build the Go binary
	cd $(BACKEND) && CGO_ENABLED=0 $(GO) build -ldflags="-s -w" -o ../dist/$(BINARY) ./cmd/server

# ─── Test ───────────────────────────────────────────────
test: ## Run all tests
	cd $(BACKEND) && $(GO) test -v -race -count=1 ./...

test-coverage: ## Run tests with coverage
	cd $(BACKEND) && $(GO) test -coverprofile=coverage.out ./...
	cd $(BACKEND) && $(GO) tool cover -html=coverage.out -o coverage.html

lint: ## Run linters
	cd $(BACKEND) && golangci-lint run ./...
	$(NPM) run lint

# ─── Docker ─────────────────────────────────────────────
docker-up: ## Start all services with Docker Compose
	docker compose up -d

docker-down: ## Stop all Docker services
	docker compose down

docker-build: ## Build Docker images
	docker compose build

docker-logs: ## View Docker logs
	docker compose logs -f

# ─── Database ───────────────────────────────────────────
db-migrate: ## Apply database migrations
	psql $(DATABASE_URL) -f supabase_schema.sql

db-reset: ## Reset database (DESTRUCTIVE)
	@echo "⚠️  This will destroy all data. Press Ctrl+C to cancel."
	@sleep 3
	psql $(DATABASE_URL) -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
	psql $(DATABASE_URL) -f supabase_schema.sql

# ─── Clean ──────────────────────────────────────────────
clean: ## Remove build artifacts
	rm -rf dist/ node_modules/.vite
	cd $(BACKEND) && rm -f coverage.out coverage.html
