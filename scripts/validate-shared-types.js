// scripts/validate-shared-types.js
// ------------------------------------------------------------
// Purpose: Compare the TypeScript interfaces defined in
// `packages/shared-types` with the database schema defined in
// `apps/backend/src/database/schema.ts`. Differences are written to a
// Markdown artefact `artifacts/diff_report.md` and a short summary is
// printed to console.
// ------------------------------------------------------------

const fs = require('fs').promises;
const path = require('path');

// ------------------------------------------------------------------
// Configuration – adjust paths if the project structure changes.
// ------------------------------------------------------------------
const SCHEMA_FILE = path.resolve(__dirname, '../apps/backend/src/database/schema.ts');
const SHARED_TYPES_FILE = path.resolve(__dirname, '../packages/shared-types/src/index.ts');
const DIFF_ARTIFACT = path.resolve(__dirname, '../artifacts/diff_report.md');

// Fields that are intentionally *excluded* from the contract.
const EXCLUDED_FIELDS = {
  users: ['password_hash', 'last_login', 'created_at', 'updated_at'],
  officers: ['photo_url', 'assigned_zone', 'created_at', 'updated_at'],
  branches: ['created_at', 'updated_at'],
  districts: ['created_at', 'updated_at'],
  cans: ['created_at', 'updated_at', 'last_collected_at'],
  assignments: ['created_at', 'updated_at'],
  collections: ['synced_at', 'server_timestamp', 'created_at', 'updated_at'],
  activity_logs: ['*'],
  notifications: ['error_message', 'wa_message_id', 'created_at', 'updated_at'],
  sync_queues: ['*'],
  collection_summaries: ['calculated_at'],
};

/** Utility: extract field names from a simple TypeScript/SQL table definition. */
function extractFieldsFromContent(content) {
  const tableMap = new Map();
  const tableRegex = /export\s+const\s+(\w+)\s*=\s*\w+Table\s*\(\s*['"]\w+['"]\s*,\s*\{([^}]*)\}\)/gs;
  let match;
  while ((match = tableRegex.exec(content)) !== null) {
    const tableName = match[1];
    const fieldsBlock = match[2];
    const fieldSet = new Set();
    const fieldRegex = /([a-zA-Z0-9_]+)\s*:/g;
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(fieldsBlock)) !== null) {
      fieldSet.add(fieldMatch[1]);
    }
    tableMap.set(tableName, fieldSet);
  }
  return tableMap;
}

/** Extract interface fields from shared‑types file. */
function extractInterfaces(content) {
  const ifaceMap = new Map();
  const ifaceRegex = /export\s+interface\s+(\w+)\s*\{([^}]*)\}/gs;
  let m;
  while ((m = ifaceRegex.exec(content)) !== null) {
    const ifaceName = m[1];
    const body = m[2];
    const set = new Set();
    const fieldRegex = /([a-zA-Z0-9_]+)\s*:/g;
    let f;
    while ((f = fieldRegex.exec(body)) !== null) {
      set.add(f[1]);
    }
    ifaceMap.set(ifaceName, set);
  }
  return ifaceMap;
}

function isExcluded(table, field) {
  const exclusions = EXCLUDED_FIELDS[table];
  if (!exclusions) return false;
  return exclusions.includes('*') || exclusions.includes(field);
}

function markdownTable(headers, rows) {
  const headerLine = `| ${headers.join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map(r => `| ${r.join(' | ')} |`).join('\n');
  return `${headerLine}\n${separator}\n${body}`;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

async function main() {
  try {
    const [schemaContent, sharedContent] = await Promise.all([
      fs.readFile(SCHEMA_FILE, 'utf8'),
      fs.readFile(SHARED_TYPES_FILE, 'utf8'),
    ]);

    const schemaTables = extractFieldsFromContent(schemaContent);
    const sharedIfaces = extractInterfaces(sharedContent);

    const tableDiffs = [];
    for (const [table, schemaFields] of schemaTables.entries()) {
      const ifaceFields = sharedIfaces.get(capitalize(table)) || new Set();
      const missingInShared = [];
      const missingInSchema = [];
      for (const f of schemaFields) {
        if (isExcluded(table, f)) continue;
        if (!ifaceFields.has(f)) missingInShared.push(f);
      }
      for (const f of ifaceFields) {
        if (isExcluded(table, f)) continue;
        if (!schemaFields.has(f)) missingInSchema.push(f);
      }
      if (missingInShared.length || missingInSchema.length) {
        tableDiffs.push({ table, missingInShared, missingInSchema });
      }
    }

    let markdown = '# Diff Report – Shared Types vs Database Schema\n\n';
    if (tableDiffs.length === 0) {
      markdown += '✅ Semua field sudah sinkron. Tidak ada perbedaan yang terdeteksi.\n';
    } else {
      for (const d of tableDiffs) {
        markdown += `## Table / Interface: ${d.table}\n`;
        if (d.missingInShared.length) {
          markdown += '### Missing in shared‑types (present in DB)\n';
          markdown += markdownTable(['Field'], d.missingInShared.map(f => [f]));
          markdown += '\n\n';
        }
        if (d.missingInSchema.length) {
          markdown += '### Missing in DB schema (present in shared‑types)\n';
          markdown += markdownTable(['Field'], d.missingInSchema.map(f => [f]));
          markdown += '\n\n';
        }
      }
    }
    await fs.mkdir(path.dirname(DIFF_ARTIFACT), { recursive: true });
    await fs.writeFile(DIFF_ARTIFACT, markdown, 'utf8');
    console.log(`Diff report generated: ${DIFF_ARTIFACT}`);
    console.log(`Tables with differences: ${tableDiffs.length}`);
  } catch (err) {
    console.error('Error while generating diff report', err);
    process.exit(1);
  }
}

main();
