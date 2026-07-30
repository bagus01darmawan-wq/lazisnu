#!/usr/bin/env bash
# Idempotent setup monitors & bindings untuk Uptime Kuma.
# Aman re-run: monitor & binding akan di-recreate bersih (delete-by-name lalu insert).
# Usage: bash kuma-setup-monitors.sh
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SQL_FILE="$(mktemp)"
trap "rm -f '$SQL_FILE'" EXIT

cat > "$SQL_FILE" <<'SQL'
-- =============================================================================
-- Idempotent Uptime Kuma — Setup Monitor & Notification Binding
-- =============================================================================
-- Strategi: hapus monitor+binding by name, lalu insert ulang
-- Aman re-run. Untuk production monitoring 4 service: API, Web, Staging API, Staging Web

-- Hapus binding dari monitor lama (by name)
DELETE FROM monitor_notification
WHERE monitor_id IN (
  SELECT id FROM monitor WHERE name IN (
    'Lazisnu API', 'Lazisnu Web Dashboard', 'Staging API', 'Staging Web'
  )
);

-- Hapus monitor lama (by name)
DELETE FROM monitor WHERE name IN (
  'Lazisnu API', 'Lazisnu Web Dashboard', 'Staging API', 'Staging Web'
);

-- Monitor 1: Lazisnu API
INSERT INTO monitor (
  name, type, url, interval, accepted_statuscodes_json,
  method, maxredirects, user_id, active, weight
) VALUES (
  'Lazisnu API', 'http', 'https://api.lazisnu.site/health/ready', 60,
  '["200-299"]', 'GET', 0, 1, 1, 2000
);

-- Monitor 2: Lazisnu Web Dashboard (Next.js redirect 307)
INSERT INTO monitor (
  name, type, url, interval, accepted_statuscodes_json,
  method, maxredirects, user_id, active, weight
) VALUES (
  'Lazisnu Web Dashboard', 'http', 'https://dashboard.lazisnu.site', 60,
  '["200-299","300-399"]', 'GET', 0, 1, 1, 2000
);

-- Monitor 3: Staging API
INSERT INTO monitor (
  name, type, url, interval, method, user_id, active, weight
) VALUES (
  'Staging API', 'http', 'https://staging-api.lazisnu.site/health', 120,
  'GET', 1, 1, 2000
);

-- Monitor 4: Staging Web (Next.js redirect 307)
INSERT INTO monitor (
  name, type, url, interval, accepted_statuscodes_json,
  method, maxredirects, user_id, active, weight
) VALUES (
  'Staging Web', 'http', 'https://staging.lazisnu.site', 120,
  '["200-299","300-399"]', 'GET', 0, 1, 1, 2000
);

-- Bind 4 monitor ke notification id=1 (Discord)
-- Skip jika binding sudah ada
INSERT INTO monitor_notification (monitor_id, notification_id)
SELECT m.id, 1
FROM monitor m
WHERE m.name IN ('Lazisnu API', 'Lazisnu Web Dashboard', 'Staging API', 'Staging Web')
  AND NOT EXISTS (
    SELECT 1 FROM monitor_notification mn
    WHERE mn.monitor_id = m.id AND mn.notification_id = 1
  );

-- Post-flight
SELECT '=== MONITORS ===' AS phase;
SELECT id, name, type, url, interval, active FROM monitor
WHERE name IN ('Lazisnu API', 'Lazisnu Web Dashboard', 'Staging API', 'Staging Web')
ORDER BY id;

SELECT '=== BINDINGS ===' AS phase;
SELECT m.id AS monitor_id, m.name AS monitor_name, n.name AS notif_name
FROM monitor_notification mn
JOIN monitor m ON m.id = mn.monitor_id
JOIN notification n ON n.id = mn.notification_id
WHERE m.name IN ('Lazisnu API', 'Lazisnu Web Dashboard', 'Staging API', 'Staging Web')
ORDER BY m.id;
SQL

# Apply ke uptime-kuma container
sudo docker exec -i uptime-kuma sqlite3 -header -column /app/data/kuma.db < "$SQL_FILE"

echo ""
echo "=== Restart Kuma untuk apply perubahan ==="
sudo docker restart uptime-kuma
echo "Kuma restarted. Tunggu ~15s untuk healthy."
