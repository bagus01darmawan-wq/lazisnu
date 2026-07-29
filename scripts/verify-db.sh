#!/bin/bash
echo '========================================'
echo ' DB VERIFICATION'
echo '========================================'

# Load env
set -a
source /opt/lazisnu/.env.backup 2>/dev/null || true
set +a

echo ''
echo '--- user_role ENUM ---'
psql "$DIRECT_URL" -c "SELECT unnest(enum_range(NULL::user_role)) as role" 2>&1

echo ''
echo '--- device_id COLUMN ---'
psql "$DIRECT_URL" -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='user_sessions' AND column_name='device_id'" 2>&1

echo ''
echo '--- sync_queues CHECK ---'
psql "$DIRECT_URL" -c "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='sync_queues')" 2>&1

echo ''
echo '--- user_sessions.fcm_token ---'
psql "$DIRECT_URL" -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='users' AND column_name='fcm_token'" 2>&1

echo ''
echo '========================================'
echo ' DONE'
echo '========================================'
