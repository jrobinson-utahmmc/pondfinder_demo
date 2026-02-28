#!/usr/bin/env bash
# =============================================================================
# Pond Finder — Debian Production Deployment Script
# =============================================================================
#
# Prerequisites: Repo already cloned on a Debian machine.
# Cloudflare Tunnel handles HTTPS/domain — we only run HTTP.
#
# Usage:
#   chmod +x deploy.sh
#   sudo ./deploy.sh
#
# What this script does:
#   1. Installs Node.js 22 LTS (via NodeSource)
#   2. Installs & configures MongoDB 7
#   3. Installs npm dependencies (root + frontend)
#   4. Builds the backend (TypeScript → dist/)
#   5. Builds the frontend (Next.js production build)
#   6. Generates a production .env (prompts for JWT secret)
#   7. Creates systemd services for backend + frontend
#   8. Enables & starts everything
#
# Re-running is safe — it skips steps that are already done.
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; }

# ---------------------------------------------------------------------------
# Must be root
# ---------------------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
  err "This script must be run as root (sudo ./deploy.sh)"
  exit 1
fi

# ---------------------------------------------------------------------------
# Resolve project directory (where this script lives)
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
FRONTEND_DIR="$PROJECT_DIR/frontend"
BACKEND_DIR="$PROJECT_DIR/backend"

# The user who owns the repo (run services as this user, not root)
REPO_OWNER="$(stat -c '%U' "$PROJECT_DIR")"
REPO_GROUP="$(stat -c '%G' "$PROJECT_DIR")"

info "Project directory: $PROJECT_DIR"
info "Will run services as user: $REPO_OWNER"

# ---------------------------------------------------------------------------
# 1. Install Node.js 22 LTS
# ---------------------------------------------------------------------------
if command -v node &>/dev/null; then
  NODE_VER="$(node -v)"
  ok "Node.js already installed: $NODE_VER"
else
  info "Installing Node.js 22 LTS via NodeSource..."
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs
  ok "Node.js $(node -v) installed"
fi

# ---------------------------------------------------------------------------
# 2. Install MongoDB 7
# ---------------------------------------------------------------------------
if command -v mongod &>/dev/null; then
  ok "MongoDB already installed"
else
  info "Installing MongoDB 7..."
  apt-get install -y -qq gnupg curl
  curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc \
    | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
  # Detect Debian version
  DEBIAN_CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
  echo "deb [signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg] http://repo.mongodb.org/apt/debian ${DEBIAN_CODENAME}/mongodb-org/7.0 main" \
    > /etc/apt/sources.list.d/mongodb-org-7.0.list
  apt-get update -qq
  apt-get install -y -qq mongodb-org
  ok "MongoDB installed"
fi

# Enable & start MongoDB
systemctl daemon-reload
systemctl enable mongod
systemctl start mongod || true
ok "MongoDB running"

# ---------------------------------------------------------------------------
# 3. Install npm dependencies
# ---------------------------------------------------------------------------
info "Installing backend dependencies..."
cd "$PROJECT_DIR"
sudo -u "$REPO_OWNER" npm ci --omit=dev 2>/dev/null || sudo -u "$REPO_OWNER" npm install --omit=dev
ok "Backend dependencies installed"

info "Installing frontend dependencies..."
cd "$FRONTEND_DIR"
sudo -u "$REPO_OWNER" npm ci 2>/dev/null || sudo -u "$REPO_OWNER" npm install
ok "Frontend dependencies installed"

# ---------------------------------------------------------------------------
# 4. Build backend (TypeScript → dist/)
# ---------------------------------------------------------------------------
info "Building backend..."
cd "$PROJECT_DIR"
# Need devDependencies (typescript) for build, reinstall with them
sudo -u "$REPO_OWNER" npm install
sudo -u "$REPO_OWNER" npx tsc
ok "Backend built → dist/"

# ---------------------------------------------------------------------------
# 5. Build frontend (Next.js)
# ---------------------------------------------------------------------------
info "Building frontend..."
cd "$FRONTEND_DIR"
sudo -u "$REPO_OWNER" npx next build
ok "Frontend built"

# ---------------------------------------------------------------------------
# 6. Generate production .env
# ---------------------------------------------------------------------------
ENV_FILE="$PROJECT_DIR/.env"

if [[ -f "$ENV_FILE" ]] && grep -q "NODE_ENV=production" "$ENV_FILE" 2>/dev/null; then
  ok ".env already configured for production"
else
  info "Creating production .env..."

  # Generate a random JWT secret
  JWT_SECRET="$(openssl rand -hex 32)"

  cat > "$ENV_FILE" <<ENVEOF
# =============================================================================
# Pond Finder — Production Environment
# Generated by deploy.sh on $(date -Is)
# =============================================================================

# Backend API Server
PORT=3001
NODE_ENV=production

# MongoDB
MONGO_URI=mongodb://localhost:27017/pond-finder

# JWT Authentication
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=24h

# CORS — Next.js frontend (same machine, accessed via Cloudflare Tunnel)
CORS_ORIGIN=http://localhost:3000

# =============================================================================
# Frontend (Next.js)
# =============================================================================

# Backend API URL — frontend calls backend on the same machine
NEXT_PUBLIC_API_URL=http://localhost:3001

# NOTE: API keys (Google Maps, Smarty, Census) are stored in the database.
# Configure them via the Settings panel after first login.
ENVEOF

  chown "$REPO_OWNER:$REPO_GROUP" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  ok ".env created (JWT_SECRET auto-generated)"
fi

# ---------------------------------------------------------------------------
# 7. Create systemd services
# ---------------------------------------------------------------------------
info "Installing systemd services..."

# --- Backend service ---
cat > /etc/systemd/system/pond-finder-backend.service <<UNITEOF
[Unit]
Description=Pond Finder Backend API (Express)
After=network.target mongod.service
Requires=mongod.service

[Service]
Type=simple
User=${REPO_OWNER}
Group=${REPO_GROUP}
WorkingDirectory=${PROJECT_DIR}
ExecStart=$(command -v node) dist/backend/server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=pond-finder-backend

# Environment
EnvironmentFile=${ENV_FILE}

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${PROJECT_DIR}
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNITEOF

# --- Frontend service ---
cat > /etc/systemd/system/pond-finder-frontend.service <<UNITEOF
[Unit]
Description=Pond Finder Frontend (Next.js)
After=network.target pond-finder-backend.service

[Service]
Type=simple
User=${REPO_OWNER}
Group=${REPO_GROUP}
WorkingDirectory=${FRONTEND_DIR}
ExecStart=$(command -v npx) next start -p 3000
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=pond-finder-frontend

# Environment
EnvironmentFile=${ENV_FILE}
Environment=NODE_ENV=production

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${FRONTEND_DIR}
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNITEOF

ok "Systemd unit files created"

# ---------------------------------------------------------------------------
# 8. Enable & start services
# ---------------------------------------------------------------------------
systemctl daemon-reload

systemctl enable pond-finder-backend
systemctl enable pond-finder-frontend

systemctl restart pond-finder-backend
sleep 2
systemctl restart pond-finder-frontend

ok "Services started"

# ---------------------------------------------------------------------------
# 9. Verify
# ---------------------------------------------------------------------------
echo ""
echo "=============================================="
echo -e "${GREEN}  Pond Finder deployed successfully!${NC}"
echo "=============================================="
echo ""
echo "  Backend API:  http://localhost:3001"
echo "  Frontend:     http://localhost:3000"
echo ""
echo "  Point your Cloudflare Tunnel to:"
echo "    http://localhost:3000"
echo ""
echo "  Service commands:"
echo "    sudo systemctl status pond-finder-backend"
echo "    sudo systemctl status pond-finder-frontend"
echo "    sudo journalctl -u pond-finder-backend -f"
echo "    sudo journalctl -u pond-finder-frontend -f"
echo ""
echo "  First-time setup:"
echo "    1. Open the app in your browser"
echo "    2. Create the admin account on the setup wizard"
echo "    3. Go to Settings → API Keys to configure:"
echo "       - Google Maps API Key"
echo "       - Smarty Auth ID + Token (for property lookups)"
echo "       - Census API Key (optional)"
echo ""
echo "  To redeploy after code changes:"
echo "    sudo ./deploy.sh"
echo ""
echo "=============================================="

# Quick health check
sleep 3
if curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then
  ok "Backend health check passed ✓"
else
  warn "Backend not responding yet — check: sudo journalctl -u pond-finder-backend -f"
fi

if curl -sf http://localhost:3000 > /dev/null 2>&1; then
  ok "Frontend health check passed ✓"
else
  warn "Frontend not responding yet — check: sudo journalctl -u pond-finder-frontend -f"
fi
