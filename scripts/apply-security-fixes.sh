#!/usr/bin/env bash
#
# WaffleWeather - Apply Security Fixes on Raspberry Pi
#
# One-shot script to harden the live Pi deployment:
#   1. Generate new DB password, update PostgreSQL + .env
#   2. Enable MQTT authentication (password_file + ACL)
#   3. Patch nginx.conf (remove /docs proxy, don't overwrite)
#   4. Add WW_ENABLE_DOCS=false and MQTT creds to .env
#   5. Restart all affected services
#
# Run from your Mac: ./scripts/apply-security-fixes.sh
#
set -euo pipefail

PI_HOST="user@your-pi.local"
PI_DIR="/opt/waffleweather"

echo "========================================="
echo " WaffleWeather - Security Fixes"
echo "========================================="
echo ""

# ------------------------------------------
# 1. Generate new database password
# ------------------------------------------
echo "[1/5] Generating new database password..."

DB_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)

ssh "${PI_HOST}" "sudo -u postgres psql -c \"ALTER USER waffleweather WITH PASSWORD '${DB_PASSWORD}';\""
echo "  PostgreSQL password updated."

# Update .env — replace the old DB connection string password
ssh "${PI_HOST}" "sudo sed -i \"s|waffleweather:[^@]*@|waffleweather:${DB_PASSWORD}@|g\" ${PI_DIR}/.env"
echo "  .env database URLs updated."

# ------------------------------------------
# 2. Enable MQTT authentication
# ------------------------------------------
echo ""
echo "[2/5] Setting up MQTT authentication..."

MQTT_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)

# Create password file with mosquitto_passwd
ssh "${PI_HOST}" "sudo sh -c '
    touch /etc/mosquitto/passwd
    chown root:mosquitto /etc/mosquitto/passwd
    chmod 640 /etc/mosquitto/passwd
    mosquitto_passwd -b /etc/mosquitto/passwd waffleweather \"${MQTT_PASSWORD}\"
'"
echo "  MQTT user 'waffleweather' created."

# Create ACL file
ssh "${PI_HOST}" "sudo sh -c '
    tee /etc/mosquitto/acls.conf > /dev/null << ACLEOF
# WaffleWeather MQTT ACLs
user waffleweather
topic readwrite #
ACLEOF
    chown root:mosquitto /etc/mosquitto/acls.conf
    chmod 640 /etc/mosquitto/acls.conf
'"
echo "  MQTT ACL file created."

# Patch mosquitto.conf in-place: replace allow_anonymous line and add auth config
ssh "${PI_HOST}" "sudo sh -c '
    CONF=/etc/mosquitto/conf.d/waffleweather.conf
    # Replace allow_anonymous true with false
    sed -i \"s/allow_anonymous true/allow_anonymous false/\" \"\$CONF\"
    # Add password_file and acl_file if not already present
    grep -q password_file \"\$CONF\" || echo \"password_file /etc/mosquitto/passwd\" >> \"\$CONF\"
    grep -q acl_file \"\$CONF\" || echo \"acl_file /etc/mosquitto/acls.conf\" >> \"\$CONF\"
'"
echo "  mosquitto.conf patched (anonymous access disabled)."

# Add MQTT credentials to .env if not already present
ssh "${PI_HOST}" "sudo sh -c '
    grep -q WW_MQTT_USERNAME ${PI_DIR}/.env 2>/dev/null || cat >> ${PI_DIR}/.env << MQTTEOF

# MQTT Authentication
WW_MQTT_USERNAME=waffleweather
WW_MQTT_PASSWORD=${MQTT_PASSWORD}
MQTTEOF
'"
echo "  MQTT credentials added to .env."

# ------------------------------------------
# 3. Patch nginx.conf (remove /docs proxy)
# ------------------------------------------
echo ""
echo "[3/5] Patching nginx.conf..."

# Remove the /docs and /openapi.json location blocks without overwriting the file
ssh "${PI_HOST}" "sudo sh -c '
    CONF=/etc/nginx/sites-available/waffleweather
    # Remove the docs block (location /docs { ... })
    sed -i \"/# OpenAPI docs/,/^    }$/d\" \"\$CONF\"
    # Remove the openapi.json block
    sed -i \"/location \\/openapi.json/,/^    }$/d\" \"\$CONF\"
'"
echo "  Removed /docs and /openapi.json proxy blocks from nginx."

# Verify nginx config
ssh "${PI_HOST}" "sudo nginx -t"
echo "  nginx config test passed."

# ------------------------------------------
# 4. Add WW_ENABLE_DOCS to .env
# ------------------------------------------
echo ""
echo "[4/5] Adding docs toggle to .env..."

ssh "${PI_HOST}" "sudo sh -c \"grep -q WW_ENABLE_DOCS ${PI_DIR}/.env 2>/dev/null || echo 'WW_ENABLE_DOCS=false' >> ${PI_DIR}/.env\""
echo "  WW_ENABLE_DOCS=false set."

# Lock down .env permissions
ssh "${PI_HOST}" "sudo chmod 600 ${PI_DIR}/.env && sudo chown waffleweather:waffleweather ${PI_DIR}/.env"
echo "  .env permissions set to 600."

# ------------------------------------------
# 5. Restart services
# ------------------------------------------
echo ""
echo "[5/5] Restarting services..."

ssh "${PI_HOST}" "sudo systemctl restart mosquitto"
echo "  Mosquitto restarted."

ssh "${PI_HOST}" "sudo systemctl restart nginx"
echo "  Nginx restarted."

ssh "${PI_HOST}" "sudo systemctl restart waffleweather-backend waffleweather-frontend"
echo "  Backend + Frontend restarted."

# ------------------------------------------
# Done
# ------------------------------------------
echo ""
echo "========================================="
echo " Security fixes applied!"
echo "========================================="
echo ""
echo " Changes made:"
echo "   - PostgreSQL password rotated"
echo "   - MQTT: anonymous access disabled, auth enabled"
echo "   - Nginx: /docs and /openapi.json removed"
echo "   - Swagger docs disabled in FastAPI"
echo "   - .env permissions locked to 600"
echo ""
echo " Credentials (save these if needed for debugging):"
echo "   DB password:   ${DB_PASSWORD}"
echo "   MQTT password: ${MQTT_PASSWORD}"
echo ""
echo " To re-enable Swagger docs for debugging:"
echo "   Set WW_ENABLE_DOCS=true in ${PI_DIR}/.env and restart backend"
echo ""
