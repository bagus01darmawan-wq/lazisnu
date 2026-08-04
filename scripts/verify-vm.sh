#!/bin/bash
echo '========================================'
echo ' VERIFICATION REPORT'
echo '========================================'

echo ''
echo '--- 1. LOG FORMAT ---'
sudo docker logs lazisnu-backend-1 --tail 2 2>&1 | head -2
echo ''

echo '--- 2. FIELD SENSITIF CHECK ---'
SENSITIVE=$(sudo docker logs lazisnu-backend-1 --tail 200 2>&1 | grep -ic 'password\|otp\|authorization' || true)
echo "Lines with sensitive keywords: $SENSITIVE (0 = clean)"
echo ''

echo '--- 3. CORS_ORIGINS ---'
grep CORS_ORIGINS /opt/lazisnu/apps/backend/.env
echo ''

echo '--- 4. SCHEDULER NO KEY ---'
RESP=$(curl -sk -X POST https://api.lazisnu.site/v1/scheduler/generate-tasks 2>&1)
echo "$RESP"
echo ''

echo '--- 5. SCHEDULER WRONG KEY ---'
RESP2=$(curl -sk -X POST -H 'x-api-key: wrongkey123' https://api.lazisnu.site/v1/scheduler/generate-tasks 2>&1)
echo "$RESP2"
echo ''

echo '--- 6. BACKEND HEALTH (internal) ---'
sudo docker exec lazisnu-backend-1 node -e '
var http = require("http");
http.get("http://127.0.0.1:3001/health/ready", function(res) {
  var data = "";
  res.on("data", function(c) { data += c; });
  res.on("end", function() { console.log("STATUS:", res.statusCode, data); });
}).on("error", function(e) { console.log("ERR:", e.message); });
'
echo ''

echo '--- 7. /metrics ENDPOINT ---'
sudo docker exec lazisnu-backend-1 node -e '
var http = require("http");
http.get("http://127.0.0.1:3001/metrics", function(res) {
  var data = "";
  res.on("data", function(c) { data += c; });
  res.on("end", function() {
    console.log("STATUS:", res.statusCode);
    if (res.statusCode === 501) {
      console.log("METRICS_NOT_IMPLEMENTED");
    } else {
      var lines = data.split("\n").slice(0, 20);
      lines.forEach(function(l) { console.log(l); });
    }
  });
}).on("error", function(e) { console.log("ERR:", e.message); });
'
echo ''

echo '--- 8. SECURITY HEADERS ---'
curl -skI https://api.lazisnu.site 2>&1 | grep -i 'x-frame\|hsts\|x-content'
echo ''

echo '--- 9. ALL CONTAINERS ---'
sudo docker compose -f /opt/lazisnu/docker-compose.yml ps --format 'table {{.Service}}\t{{.Status}}' 2>&1
echo ''

echo '--- 10. WORKER INDEPENDENT ---'
echo 'Backend restart test - cek worker tetap jalan:'
sudo docker compose -f /opt/lazisnu/docker-compose.yml restart backend 2>&1 | tail -1
sleep 3
sudo docker ps --filter name=worker --format '{{.Names}}\t{{.Status}}' 2>&1
echo ''

echo '--- 11. REDIS KEY CHECK ---'
sudo docker exec lazisnu-redis-1 redis-cli KEYS "refresh:*" 2>&1 | head -20
echo ''

echo '--- 12. DB: user_role ENUM ---'
sudo docker exec lazisnu-backend-1 node -e '
var pg = require("pg");
var client = new pg.Client({connectionString: process.env.DATABASE_URL, ssl: {rejectUnauthorized: false}});
client.connect(function(err) {
  if (err) { console.log("DB_ERR:", err.message); return; }
  client.query("SELECT unnest(enum_range(NULL::user_role)) as role", function(err2, result) {
    if (err2) { console.log("QUERY_ERR:", err2.message); }
    else { result.rows.forEach(function(r) { console.log("  " + r.role); }); }
    client.end();
  });
});
'
echo ''

echo '--- 13. DB: device_id COLUMN ---'
sudo docker exec lazisnu-backend-1 node -e '
var pg = require("pg");
var client = new pg.Client({connectionString: process.env.DATABASE_URL, ssl: {rejectUnauthorized: false}});
client.connect(function(err) {
  if (err) { console.log("DB_ERR:", err.message); return; }
  client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name=\047user_sessions\047 AND column_name=\047device_id\047", function(err2, result) {
    if (err2) { console.log("QUERY_ERR:", err2.message); }
    else if (result.rows.length > 0) { console.log("FOUND:", JSON.stringify(result.rows[0])); }
    else { console.log("NOT_FOUND"); }
    client.end();
  });
});
'
echo ''

echo '========================================'
echo ' DONE'
echo '========================================'
