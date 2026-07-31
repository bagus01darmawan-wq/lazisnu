#!/usr/bin/env bash
# Idempotent setup Status Page untuk Uptime Kuma (Lapis 4b).
# Aman re-run: status page + group + relasi di-recreate bersih (delete-by-slug lalu insert).
# Struktur Kuma 1.23.x: status_page -> group (public, status_page_id) -> monitor_group.
# Usage: bash kuma-setup-status-page.sh
set -e
SQL_FILE="$(mktemp)"
trap "rm -f '$SQL_FILE'" EXIT

cat > "$SQL_FILE" <<'SQL'
-- =============================================================================
-- Idempotent Uptime Kuma — Setup Status Page 'lazisnu'
-- =============================================================================
-- Strategi: hapus status page by slug (beserta group & relasi monitor_group),
-- lalu insert ulang. Aman re-run.

-- 1. Hapus relasi lama (monitor_group dari group milik status page ini)
DELETE FROM monitor_group
WHERE group_id IN (
  SELECT id FROM [group] WHERE status_page_id IN (
    SELECT id FROM status_page WHERE slug = 'lazisnu'
  )
);

-- 2. Hapus group lama
DELETE FROM [group] WHERE status_page_id IN (
  SELECT id FROM status_page WHERE slug = 'lazisnu'
);

-- 3. Hapus status page lama
DELETE FROM status_page WHERE slug = 'lazisnu';

-- 4. Buat status page baru
INSERT INTO status_page (
  slug, title, description, icon, theme, published, search_engine_index,
  show_tags, password, created_date, modified_date, footer_text, custom_css,
  show_powered_by, google_analytics_tag_id, show_certificate_expiry
) VALUES (
  'lazisnu', 'Lazisnu Status',
  'Status sistem Lazisnu - monitoring real-time backend API, web dashboard, dan staging.',
  '/icon.svg', 'light', 1, 1, 1, NULL,
  datetime('now'), datetime('now'), NULL, NULL,
  0, NULL, 0
);

-- 5. Buat group public untuk status page ini
INSERT INTO [group] (name, created_date, public, active, weight, status_page_id)
SELECT 'Lazisnu Status', datetime('now'), 1, 1, 0, id FROM status_page WHERE slug = 'lazisnu';

-- 6. Hubungkan 4 monitor ke group
INSERT INTO monitor_group (monitor_id, group_id, weight, send_url)
SELECT m.id, g.id, 0, 1
FROM monitor m
JOIN [group] g ON g.status_page_id = (SELECT id FROM status_page WHERE slug = 'lazisnu')
WHERE m.name IN ('Lazisnu API', 'Lazisnu Web Dashboard', 'Staging API', 'Staging Web')
  AND NOT EXISTS (
    SELECT 1 FROM monitor_group mg WHERE mg.monitor_id = m.id AND mg.group_id = g.id
  );

-- Post-flight
SELECT '=== STATUS PAGE ===' AS phase;
SELECT id, slug, title, theme, published, show_tags, show_powered_by FROM status_page WHERE slug = 'lazisnu';

SELECT '=== GROUP ===' AS phase;
SELECT id, name, public, active, status_page_id FROM [group] WHERE status_page_id = (SELECT id FROM status_page WHERE slug = 'lazisnu');

SELECT '=== MONITOR GROUP ===' AS phase;
SELECT m.id AS monitor_id, m.name AS monitor_name, g.name AS group_name
FROM monitor_group mg
JOIN monitor m ON m.id = mg.monitor_id
JOIN [group] g ON g.id = mg.group_id
WHERE g.status_page_id = (SELECT id FROM status_page WHERE slug = 'lazisnu')
ORDER BY m.id;
SQL

# Apply ke uptime-kuma container
sudo docker exec -i uptime-kuma sqlite3 -header -column /app/data/kuma.db < "$SQL_FILE"

echo ""
echo "=== Restart Kuma untuk apply perubahan ==="
sudo docker restart uptime-kuma
echo "Kuma restarted. Tunggu ~15s untuk healthy."
