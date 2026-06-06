/**
 * scripts/validate-shared-types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Versi SOLID: menggunakan ts-morph (TypeScript AST) untuk membaca field DB
 * dari schema Drizzle ORM dan interface dari shared-types secara akurat.
 *
 * Cara kerja:
 *  1. Baca schema.ts → ekstrak nama kolom ASLI dari setiap pgTable() call
 *     menggunakan AST (bukan regex) sehingga nested {} tidak jadi masalah.
 *  2. Baca index.ts shared-types → ekstrak semua field dari setiap interface.
 *  3. Bandingkan dengan mapping eksplisit tabel→interface + field camelCase→snake_case.
 *  4. Tulis diff_report.md dan tampilkan summary di console.
 */

import { Project, SyntaxKind, Node, CallExpression, ObjectLiteralExpression } from "ts-morph";
import { promises as fs } from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Path Config ─────────────────────────────────────────────────────────────
const ROOT         = path.resolve(__dirname, "..");
const SCHEMA_FILE  = path.join(ROOT, "apps/backend/src/database/schema.ts");
const SHARED_FILE  = path.join(ROOT, "packages/shared-types/src/index.ts");
const REPORT_FILE  = path.join(ROOT, "artifacts/diff_report.md");

// ─── Mapping: DB table variable name → shared-types interface name ────────────
// Tabel yang tidak perlu diekspos ke contract cukup dikecualikan di sini.
const TABLE_TO_INTERFACE: Record<string, string | null> = {
  districts:            "District",
  branches:             "Branch",
  users:                "User",
  officers:             "Officer",
  dukuhs:               "Dukuh",
  cans:                 "Can",
  assignments:          "Assignment",
  collections:          "Collection",
  notifications:        "Notification",
  activityLogs:         null,   // internal only — skip
  syncQueues:           null,   // internal only — skip
  collectionSummaries:  "CollectionSummary",
};

// ─── Fields to exclude per table (internal / infra / sensitive) ───────────────
const EXCLUDED_DB_FIELDS: Record<string, string[]> = {
  users:               ["passwordHash", "lastLogin", "createdAt", "updatedAt"],
  officers:            ["createdAt", "updatedAt"],
  branches:            ["createdAt", "updatedAt"],
  districts:           ["createdAt", "updatedAt"],
  cans:                ["createdAt", "updatedAt", "lastCollectedAt"],
  assignments:         ["createdAt", "updatedAt"],
  collections:         ["syncedAt", "serverTimestamp", "createdAt", "updatedAt"],
  notifications:       ["errorMessage", "waMessageId", "createdAt", "updatedAt"],
  collectionSummaries: ["calculatedAt"],
  dukuhs:              ["createdAt", "updatedAt"],
};

// ─── camelCase → snake_case helper ───────────────────────────────────────────
function toSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

// ─── Step 1: Extract DB column names from schema.ts using AST ────────────────
function extractDbFields(schemaFile: string): Map<string, string[]> {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  project.addSourceFileAtPath(schemaFile);
  const source = project.getSourceFileOrThrow(schemaFile);

  const result = new Map<string, string[]>();

  // Walk all variable declarations that call pgTable(...)
  for (const varDecl of source.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const init = varDecl.getInitializer();
    if (!init || !Node.isCallExpression(init)) continue;

    const callExpr = init as CallExpression;
    const exprText = callExpr.getExpression().getText();
    if (!exprText.endsWith("Table") && exprText !== "pgTable") continue;

    // Variable name (e.g. "districts", "cans", "activityLogs")
    const varName = varDecl.getName();
    if (!(varName in TABLE_TO_INTERFACE)) continue;

    // Second argument is the columns object literal
    const args = callExpr.getArguments();
    if (args.length < 2) continue;
    const colsArg = args[1];
    if (!Node.isObjectLiteralExpression(colsArg)) continue;

    const colObj = colsArg as ObjectLiteralExpression;
    const fields: string[] = [];

    for (const prop of colObj.getProperties()) {
      if (Node.isPropertyAssignment(prop) || Node.isShorthandPropertyAssignment(prop)) {
        fields.push(prop.getName());
      }
    }

    result.set(varName, fields);
  }

  return result;
}

// ─── Step 2: Extract interface fields from shared-types using AST ─────────────
function extractInterfaceFields(sharedFile: string): Map<string, Set<string>> {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  project.addSourceFileAtPath(sharedFile);
  const source = project.getSourceFileOrThrow(sharedFile);

  const result = new Map<string, Set<string>>();

  for (const iface of source.getInterfaces()) {
    const name = iface.getName();
    const fields = new Set<string>();

    for (const member of iface.getMembers()) {
      if (Node.isPropertySignature(member)) {
        fields.add(member.getName());
      }
    }

    // Jika ada duplikat interface (merger), gabungkan
    const existing = result.get(name);
    if (existing) {
      for (const f of fields) existing.add(f);
    } else {
      result.set(name, fields);
    }
  }

  return result;
}

// ─── Step 3: Compare & generate report ───────────────────────────────────────
interface TableDiff {
  table: string;
  iface: string;
  missingInShared: string[];   // DB field ada, tapi tidak di interface
  missingInDb: string[];       // Interface field ada, tapi tidak di DB schema
}

function compare(
  dbFields:     Map<string, string[]>,
  ifaceFields:  Map<string, Set<string>>,
): TableDiff[] {
  const diffs: TableDiff[] = [];

  for (const [table, ifaceName] of Object.entries(TABLE_TO_INTERFACE)) {
    if (ifaceName === null) continue;   // explicitly skipped

    const dbCols = dbFields.get(table) ?? [];
    const excluded = EXCLUDED_DB_FIELDS[table] ?? [];
    const iface = ifaceFields.get(ifaceName) ?? new Set<string>();

    const missingInShared: string[] = [];
    const missingInDb:     string[] = [];

    // Check: every non-excluded DB field should appear in the interface (snake_case)
    for (const col of dbCols) {
      if (excluded.includes(col)) continue;
      const snake = toSnake(col);
      if (!iface.has(snake)) {
        missingInShared.push(`${col} → ${snake}`);
      }
    }

    // Check: every interface field should correspond to a DB column
    const dbSnakeSet = new Set(dbCols.map(toSnake));
    for (const f of iface) {
      // Skip nested object fields (e.g., can.qr_code) and special fields
      if (f.includes(".")) continue;
      if (!dbSnakeSet.has(f) && !excluded.includes(f)) {
        // Allow extra fields that are computed / join / mobile-only
        const ALLOWED_EXTRA: Record<string, string[]> = {
          Can: ["total_collected", "collection_count", "owner_whatsapp"],
          Collection: ["can", "device_info", "offline_id", "whatsapp_status",
                       "alasan_resubmit", "submit_sequence"],
          Officer: ["user_id"],
          Assignment: [],
          Branch: ["officer_id", "total_amount", "mode"],
          CollectionSummary: [],
        };
        const allowed = ALLOWED_EXTRA[ifaceName] ?? [];
        if (!allowed.includes(f)) {
          missingInDb.push(f);
        }
      }
    }

    if (missingInShared.length || missingInDb.length) {
      diffs.push({ table, iface: ifaceName, missingInShared, missingInDb });
    }
  }

  return diffs;
}

// ─── Step 4: Write markdown report ───────────────────────────────────────────
function buildReport(diffs: TableDiff[]): string {
  let md = "# Diff Report – Shared Types vs Database Schema\n\n";
  md += `_Generated: ${new Date().toISOString()}_\n\n`;

  if (diffs.length === 0) {
    md += "## ✅ Semua field sudah sinkron!\n\nTidak ada perbedaan yang terdeteksi antara shared-types dan database schema.\n";
    return md;
  }

  md += `## ❌ Ditemukan ${diffs.length} tabel dengan perbedaan\n\n`;

  for (const d of diffs) {
    md += `---\n\n### \`${d.table}\` → \`${d.iface}\`\n\n`;

    if (d.missingInShared.length) {
      md += "**Missing in shared-types** (ada di DB, belum di interface):\n\n";
      md += "| DB column (camelCase) → snake_case |\n|---|\n";
      for (const f of d.missingInShared) md += `| \`${f}\` |\n`;
      md += "\n";
    }

    if (d.missingInDb.length) {
      md += "**Extra in shared-types** (ada di interface, tidak ada di DB):\n\n";
      md += "| Interface field |\n|---|\n";
      for (const f of d.missingInDb) md += `| \`${f}\` |\n`;
      md += "\n";
    }
  }

  return md;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🔍 Membaca schema dan shared-types via AST (ts-morph)...\n");

  const dbFields    = extractDbFields(SCHEMA_FILE);
  const ifaceFields = extractInterfaceFields(SHARED_FILE);

  console.log(`📦 Tabel DB yang dibaca  : ${dbFields.size}`);
  console.log(`📝 Interface yang dibaca : ${ifaceFields.size}\n`);

  const diffs = compare(dbFields, ifaceFields);

  await fs.mkdir(path.dirname(REPORT_FILE), { recursive: true });
  const report = buildReport(diffs);
  await fs.writeFile(REPORT_FILE, report, "utf8");

  if (diffs.length === 0) {
    console.log("✅ Semua field sinkron — tidak ada diff!\n");
  } else {
    console.log(`❌ Ditemukan ${diffs.length} tabel dengan perbedaan:\n`);
    for (const d of diffs) {
      if (d.missingInShared.length)
        console.log(`  ${d.table} → missing in shared-types: ${d.missingInShared.join(", ")}`);
      if (d.missingInDb.length)
        console.log(`  ${d.table} → extra in interface: ${d.missingInDb.join(", ")}`);
    }
  }

  console.log(`\n📄 Laporan tersimpan di: ${REPORT_FILE}`);
  process.exit(diffs.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
