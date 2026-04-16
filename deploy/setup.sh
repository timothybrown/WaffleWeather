#!/usr/bin/env bash
#
# WaffleWeather - Raspberry Pi Setup Script
#
# Installs and configures all dependencies on Raspberry Pi OS (Debian trixie/arm64).
# Run as your normal user (uses sudo internally where needed).
#
# Usage: bash deploy/setup.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================="
echo " WaffleWeather - Pi Setup"
echo "========================================="
echo ""

# -------------------------------------------
# 1. Stop and disable Apache2 and WeeWx
# -------------------------------------------
echo "[1/9] Stopping Apache2 and WeeWx..."

if systemctl is-active --quiet apache2 2>/dev/null; then
    sudo systemctl disable --now apache2
    echo "  Apache2 stopped and disabled."
else
    echo "  Apache2 not running, skipping."
fi

if systemctl is-active --quiet weewx 2>/dev/null; then
    sudo systemctl disable --now weewx
    echo "  WeeWx stopped and disabled."
else
    echo "  WeeWx not running, skipping."
fi

# -------------------------------------------
# 2. Install system packages
# -------------------------------------------
echo ""
echo "[2/9] Installing system packages..."

sudo apt update
sudo apt install -y \
    git \
    curl \
    nginx \
    postgresql-17 \
    postgresql-client-17 \
    python3-dev \
    python3-venv \
    build-essential

echo "  System packages installed."

# -------------------------------------------
# 3. Add TimescaleDB repository and install
# -------------------------------------------
echo ""
echo "[3/9] Installing TimescaleDB..."

# TimescaleDB doesn't have a trixie repo yet, use bookworm (confirmed compatible)
sudo mkdir -p /etc/apt/keyrings/
curl -fsSL https://packagecloud.io/timescale/timescaledb/gpgkey \
    | gpg --dearmor \
    | sudo tee /etc/apt/keyrings/timescale_timescaledb-archive-keyring.gpg >/dev/null

echo "deb [signed-by=/etc/apt/keyrings/timescale_timescaledb-archive-keyring.gpg] https://packagecloud.io/timescale/timescaledb/debian bookworm main" \
    | sudo tee /etc/apt/sources.list.d/timescale_timescaledb.list >/dev/null

sudo apt update

# Try PG17 first (matches trixie's native postgresql), fall back to PG16
if apt-cache show timescaledb-2-postgresql-17 &>/dev/null; then
    sudo apt install -y timescaledb-2-postgresql-17
    PG_VERSION=17
    echo "  TimescaleDB installed for PostgreSQL 17."
elif apt-cache show timescaledb-2-postgresql-16 &>/dev/null; then
    echo "  PG17 package not available, installing for PG16..."
    sudo apt install -y postgresql-16 timescaledb-2-postgresql-16
    PG_VERSION=16
    echo "  TimescaleDB installed for PostgreSQL 16."
else
    echo "ERROR: No compatible TimescaleDB package found!"
    exit 1
fi

# Install timescaledb-tune
sudo apt install -y timescaledb-tools || echo "  timescaledb-tools not available, skipping tune."

# -------------------------------------------
# 4. Configure PostgreSQL + TimescaleDB
# -------------------------------------------
echo ""
echo "[4/9] Configuring PostgreSQL..."

# Run timescaledb-tune for Pi 4 optimisation
if command -v timescaledb-tune &>/dev/null; then
    sudo timescaledb-tune --yes --quiet
    echo "  PostgreSQL tuned for TimescaleDB."
else
    # Manual minimal tuning for Pi 4 (4GB RAM)
    PG_CONF="/etc/postgresql/${PG_VERSION}/main/postgresql.conf"
    if [ -f "$PG_CONF" ]; then
        sudo tee -a "$PG_CONF" > /dev/null <<EOF

# WaffleWeather tuning for Pi 4 (4GB RAM)
shared_preload_libraries = 'timescaledb'
shared_buffers = 512MB
effective_cache_size = 2GB
work_mem = 16MB
maintenance_work_mem = 256MB
EOF
        echo "  PostgreSQL manually configured."
    fi
fi

# Ensure shared_preload_libraries includes timescaledb
PG_CONF="/etc/postgresql/${PG_VERSION}/main/postgresql.conf"
if ! grep -q "shared_preload_libraries.*timescaledb" "$PG_CONF" 2>/dev/null; then
    echo "shared_preload_libraries = 'timescaledb'" | sudo tee -a "$PG_CONF" >/dev/null
fi

# Restart PostgreSQL to load TimescaleDB
sudo systemctl restart postgresql

# Create waffleweather database and user with random password
DB_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
sudo -u postgres psql -c "CREATE USER waffleweather WITH PASSWORD '${DB_PASSWORD}';" 2>/dev/null || echo "  User waffleweather already exists."
echo "  Database password generated (will be written to .env)."
sudo -u postgres psql -c "CREATE DATABASE waffleweather OWNER waffleweather;" 2>/dev/null || echo "  Database waffleweather already exists."
sudo -u postgres psql -d waffleweather -c "CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;"

echo "  PostgreSQL configured. TimescaleDB extension enabled."

# -------------------------------------------
# 5. Configure Mosquitto
# -------------------------------------------
echo ""
echo "[5/9] Configuring Mosquitto..."

# Mosquitto is already installed on this Pi, just update config
# Remove any conflicting configs (e.g. old WeeWx Belchertown config)
for f in /etc/mosquitto/conf.d/*.conf; do
    [ "$f" = "/etc/mosquitto/conf.d/waffleweather.conf" ] && continue
    echo "  Removing conflicting config: $f"
    sudo rm -f "$f"
done
sudo cp "${SCRIPT_DIR}/mosquitto.conf" /etc/mosquitto/conf.d/waffleweather.conf

# Create MQTT password file and user if not already present
MQTT_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
if [ ! -f /etc/mosquitto/passwd ]; then
    sudo touch /etc/mosquitto/passwd
    sudo mosquitto_passwd -b /etc/mosquitto/passwd waffleweather "${MQTT_PASSWORD}"
    echo "  Created MQTT user 'waffleweather' with generated password."
    echo "  MQTT password: ${MQTT_PASSWORD} (save this — needed for WW_MQTT_* env vars)"
else
    echo "  MQTT password file already exists, skipping user creation."
fi

# Create ACL file: waffleweather user can read/write ecowitt2mqtt topics
# and read $SYS/broker/+ for health telemetry. Narrowed from wildcard-all
# to contain blast radius if the MQTT credential is ever compromised.
if [ ! -f /etc/mosquitto/acls.conf ]; then
    sudo tee /etc/mosquitto/acls.conf > /dev/null <<EOF
# WaffleWeather MQTT ACLs
user waffleweather
topic readwrite ecowitt2mqtt/#
topic read \$SYS/broker/+
EOF
    echo "  MQTT ACL file created."
fi

sudo systemctl restart mosquitto

echo "  Mosquitto configured with authentication and restarted."

# -------------------------------------------
# 6. Configure Nginx
# -------------------------------------------
echo ""
echo "[6/9] Configuring Nginx..."

sudo cp "${SCRIPT_DIR}/nginx.conf" /etc/nginx/sites-available/waffleweather
sudo ln -sf /etc/nginx/sites-available/waffleweather /etc/nginx/sites-enabled/waffleweather
sudo rm -f /etc/nginx/sites-enabled/default

# Create API key and nginx snippet
API_KEY=$(openssl rand -base64 32 | tr -d '/+=' | head -c 48)
sudo mkdir -p /etc/nginx/snippets
if [ ! -f /etc/nginx/snippets/waffleweather-apikey.conf ]; then
    echo "set \$ww_api_key \"${API_KEY}\";" | sudo tee /etc/nginx/snippets/waffleweather-apikey.conf > /dev/null
    sudo chmod 640 /etc/nginx/snippets/waffleweather-apikey.conf
    sudo chown root:www-data /etc/nginx/snippets/waffleweather-apikey.conf
    echo "  API key generated and written to nginx snippet."
fi

sudo nginx -t
sudo systemctl enable --now nginx

echo "  Nginx configured and started."

# -------------------------------------------
# 7. Install Node.js and pnpm
# -------------------------------------------
echo ""
echo "[7/9] Setting up Node.js and pnpm..."

# Node.js 20 LTS is available from Debian trixie repos (already installed above or available)
if ! command -v node &>/dev/null; then
    sudo apt install -y nodejs npm
fi

# Install pnpm
if ! command -v pnpm &>/dev/null; then
    sudo npm install -g pnpm
fi

echo "  Node.js $(node --version) + pnpm $(pnpm --version) ready."

# -------------------------------------------
# 8. Install uv (Python package manager)
# -------------------------------------------
echo ""
echo "[8/9] Installing uv..."

if ! command -v uv &>/dev/null; then
    curl -LsSf https://astral.sh/uv/install.sh | sh
    # Add to PATH for this session
    export PATH="$HOME/.local/bin:$PATH"
fi

echo "  uv $(uv --version) ready."

# -------------------------------------------
# 9. Create waffleweather system user and directories
# -------------------------------------------
echo ""
echo "[9/9] Setting up project directory..."

# Create system user if it doesn't exist
if ! id waffleweather &>/dev/null; then
    sudo useradd --system --create-home --shell /usr/sbin/nologin waffleweather
    echo "  Created waffleweather system user."
fi

# Create project directory
sudo mkdir -p /opt/waffleweather
sudo chown waffleweather:waffleweather /opt/waffleweather

# Copy .env if it doesn't exist
if [ ! -f /opt/waffleweather/.env ]; then
    cp "${PROJECT_DIR}/.env.example" /opt/waffleweather/.env
    # Replace placeholder passwords with generated ones
    sed -i "s/POSTGRES_PASSWORD=changeme/POSTGRES_PASSWORD=${DB_PASSWORD}/" /opt/waffleweather/.env
    sed -i "s|waffleweather:changeme@|waffleweather:${DB_PASSWORD}@|g" /opt/waffleweather/.env
    sed -i "s/MQTT_PASSWORD=changeme/MQTT_PASSWORD=${MQTT_PASSWORD}/" /opt/waffleweather/.env
    sed -i "s/WW_MQTT_PASSWORD=changeme/WW_MQTT_PASSWORD=${MQTT_PASSWORD}/" /opt/waffleweather/.env
    sed -i "s/WW_API_KEY=/WW_API_KEY=${API_KEY}/" /opt/waffleweather/.env
    chmod 600 /opt/waffleweather/.env
    echo "  Created /opt/waffleweather/.env with generated password (chmod 600)."
fi

# Create ecowitt2mqtt system user and venv
if ! id ecowitt2mqtt &>/dev/null; then
    sudo useradd --system --create-home --home-dir /opt/ecowitt2mqtt --shell /usr/sbin/nologin ecowitt2mqtt
    echo "  Created ecowitt2mqtt system user."
fi

sudo mkdir -p /opt/ecowitt2mqtt
sudo python3 -m venv /opt/ecowitt2mqtt/venv
sudo /opt/ecowitt2mqtt/venv/bin/pip install --quiet ecowitt2mqtt
sudo chown -R ecowitt2mqtt:ecowitt2mqtt /opt/ecowitt2mqtt
echo "  ecowitt2mqtt installed in /opt/ecowitt2mqtt/venv."

# Install systemd service files
sudo cp "${SCRIPT_DIR}/waffleweather-backend.service" /etc/systemd/system/
sudo cp "${SCRIPT_DIR}/waffleweather-frontend.service" /etc/systemd/system/
sudo cp "${SCRIPT_DIR}/ecowitt2mqtt.service" /etc/systemd/system/
sudo systemctl daemon-reload

echo "  Systemd services installed (not started yet -- enable after deploying code)."

# -------------------------------------------
# Done!
# -------------------------------------------
echo ""
echo "========================================="
echo " Setup complete!"
echo "========================================="
echo ""
echo " Services running:"
echo "   - PostgreSQL ${PG_VERSION} + TimescaleDB"
echo "   - Mosquitto (MQTT on :1883, WebSocket on :9001)"
echo "   - Nginx (port :80, proxying to backend + frontend)"
echo ""
echo " Services stopped:"
echo "   - Apache2 (disabled)"
echo "   - WeeWx (disabled)"
echo ""
echo " Next steps:"
echo "   1. Deploy code: ./scripts/deploy.sh (from Mac)"
echo "   2. Set up backend venv: cd /opt/waffleweather/backend && uv sync"
echo "   3. Run migrations: alembic upgrade head"
echo "   4. Start services: sudo systemctl enable --now waffleweather-backend waffleweather-frontend"
echo ""
