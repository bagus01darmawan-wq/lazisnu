#!/usr/bin/env bash
# Phase 2 — Docker Build Cache + Dangling Prune
# Eksekusi: 2026-07-30
set -e

echo "=== Phase 2.1: Prune build cache ==="
echo "Before:"
sudo docker builder du
echo ""
echo "Executing: docker builder prune -af"
sudo docker builder prune -af
echo ""
echo "After:"
sudo docker system df

echo ""
echo "=== Phase 2.2: Prune dangling images ==="
echo "Before:"
sudo docker images -f "dangling=true"
echo ""
echo "Executing: docker image prune -f"
sudo docker image prune -f
echo ""
echo "After:"
sudo docker images -f "dangling=true"
echo "(empty = OK)"

echo ""
echo "=== Post-Phase 2: disk & service check ==="
df -h /
sudo docker ps --format "table {{.Names}}\t{{.Status}}"
echo ""
echo "curl public endpoints:"
echo -n "  api.lazisnu.site/health/ready: "
curl -s -o /dev/null -w "%{http_code}\n" --max-time 5 https://api.lazisnu.site/health/ready
echo -n "  dashboard.lazisnu.site: "
curl -s -o /dev/null -w "%{http_code}\n" --max-time 5 https://dashboard.lazisnu.site
echo -n "  prometheus: "
curl -s -o /dev/null -w "%{http_code}\n" --max-time 5 http://127.0.0.1:9090/-/ready
echo -n "  grafana: "
curl -s -o /dev/null -w "%{http_code}\n" --max-time 5 http://127.0.0.1:3030/api/health
echo -n "  uptime-kuma: "
curl -s -o /dev/null -w "%{http_code}\n" --max-time 5 http://127.0.0.1:3002/
