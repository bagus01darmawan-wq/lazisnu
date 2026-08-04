#!/bin/sh
# Test health endpoints from within redis-staging container
echo "=== /health ==="
wget -q -O- http://backend-staging:4001/health
echo ""
echo "=== /health/live ==="
wget -q -O- http://backend-staging:4001/health/live
echo ""
echo "=== /health/ready ==="
wget -q -O- http://backend-staging:4001/health/ready
echo ""
echo "=== Test Redis direct ==="
echo PING | nc -w 2 redis-staging 6379
echo ""
echo "=== Test Redis direct from backend-staging ==="
echo PING | nc -w 2 backend-staging 6379 2>&1 || echo "nc to backend-staging 6379 failed (expected)"
echo ""
echo "=== DNS test ==="
nslookup redis-staging 2>/dev/null || echo "nslookup not available"
nslookup backend-staging 2>/dev/null || echo "nslookup not available"
