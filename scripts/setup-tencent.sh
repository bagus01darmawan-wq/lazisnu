#!/bin/bash
# Setup Lazisnu on Tencent Cloud CVM (Singapore)
# Run as root: sudo bash setup-tencent.sh

set -e

DOMAIN_API="api.lazisnu.site"
DOMAIN_WEB="dashboard.lazisnu.site"
EMAIL="admin@lazisnu.site"

echo "=== 1. Install Docker ==="
apt-get update
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "=== 2. Create app directory ==="
mkdir -p /opt/lazisnu
cd /opt/lazisnu

echo "=== 3. Setup nginx SSL directories ==="
mkdir -p nginx/certbot/conf nginx/certbot/www

echo "=== 4. Open firewall ports ==="
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "=== 5. Pull & start ==="
echo "# Copy .env ke /opt/lazisnu/apps/backend/.env"
echo "# Copy seluruh repo ke /opt/lazisnu (atau git clone)"
echo "# Lalu jalankan: docker compose up -d --build"
echo ""
echo "=== Setup selesai ==="
echo "Next steps:"
echo "1. scp apps/backend/.env ke /opt/lazisnu/apps/backend/.env"
echo "2. cd /opt/lazisnu && docker compose up -d --build"
echo "3. certbot --nginx -d $DOMAIN_API -d $DOMAIN_WEB --email $EMAIL --agree-tos"
