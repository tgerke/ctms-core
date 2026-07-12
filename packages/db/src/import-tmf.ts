/**
 * Import the official CDISC TMF Reference Model spreadsheet, verbatim.
 *
 * ADR-0005: the seeded taxonomy is an illustrative subset because reproducing
 * the full model from an LLM's memory risks hallucinated artifact numbers.
 * This importer is the sanctioned path to the full model: the user downloads
 * the Excel from CDISC (it is licensed; do not vendor it into the repo) and
 * every zone/section/artifact row is loaded exactly as the file states it.
 * Numbering matches the seed's scheme, so rows upsert over the subset with no
 * data migration.
 *
 * Usage: pnpm db:import-tmf -- path/to/TMF_Reference_Model.xlsx
 */
import ExcelJS from "exceljs";
import { createDb } from "./client.js";

interface ArtifactRow {
  zoneNumber: number;
  zoneName: string;
  sectionCode: string;
  sectionName: string;
  artifactCode: string;
  artifactName: string;
  purpose: string | null;
  /** TMF RM "Unique ID Number" — the eTMF-EMS <UNIQUEID> (ADR-0024). */
  uniqueId: number | null;
}

const ARTIFACT_CODE = /^(\d{2})\.(\d{2})\.(\d{2,})$/;

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object" && "richText" in value) {
    return value.richText.map((r) => r.text).join("");
  }
  if (typeof value === "object" && "result" in value) return String(value.result ?? "");
  return String(value);
}

interface HeaderMap {
  headerRow: number;
  cols: {
    zoneNumber?: number;
    zoneName?: number;
    sectionNumber?: number;
    sectionName?: number;
    artifactNumber: number;
    artifactName: number;
    purpose?: number;
    uniqueId?: number;
  };
}

/**
 * Locate the header row by its column names rather than assuming a fixed
 * layout — CDISC has reshuffled columns between model versions. Fails loudly
 * (listing what it did find) rather than guessing.
 */
function findHeader(sheet: ExcelJS.Worksheet): HeaderMap | null {
  for (let r = 1; r <= Math.min(sheet.rowCount, 25); r++) {
    const row = sheet.getRow(r);
    const headers = new Map<string, number>();
    row.eachCell((cell, col) => {
      const text = cellText(cell.value).toLowerCase().replace(/\s+/g, " ").trim();
      if (text) headers.set(text, col);
    });
    const find = (...patterns: RegExp[]) => {
      for (const [text, col] of headers) {
        if (patterns.every((p) => p.test(text))) return col;
      }
      return undefined;
    };
    const artifactNumber = find(/artifact/, /(number|num\b|#)/);
    const artifactName = find(/artifact/, /(name|title)/);
    if (artifactNumber && artifactName) {
      return {
        headerRow: r,
        cols: {
          artifactNumber,
          artifactName,
          zoneNumber: find(/zone/, /(number|num\b|#)/),
          zoneName: find(/zone/, /name/),
          sectionNumber: find(/section/, /(number|num\b|#)/),
          sectionName: find(/section/, /name/),
          purpose: find(/purpose/),
          uniqueId: find(/unique/, /id/),
        },
      };
    }
  }
  return null;
}

/**
 * The model version as the sheet states it (e.g. a "Version 3.3.1" banner
 * cell above the header row) — recorded to app_meta as the eTMF-EMS
 * TMFRMVERSION (ADR-0024). Verbatim or nothing; never guessed.
 */
function findModelVersion(sheet: ExcelJS.Worksheet, headerRow: number): string | null {
  for (let r = 1; r < headerRow; r++) {
    const row = sheet.getRow(r);
    let found: string | null = null;
    row.eachCell((cell) => {
      const m = cellText(cell.value).match(/version\s*:?\s*(\d+(?:\.\d+){0,2})\b/i);
      if (m && !found) found = m[1]!;
    });
    if (found) return found;
  }
  return null;
}

export function parseWorkbook(workbook: ExcelJS.Workbook): {
  rows: ArtifactRow[];
  skipped: number;
  sheetName: string;
  modelVersion: string | null;
} {
  for (const sheet of workbook.worksheets) {
    const header = findHeader(sheet);
    if (!header) continue;
    const { cols } = header;
    const rows: ArtifactRow[] = [];
    let skipped = 0;
    // Zone/section names may appear only on their first row (merged cells);
    // carry the last seen value forward.
    let lastZoneName = "";
    let lastSectionName = "";
    for (let r = header.headerRow + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const at = (col?: number) => (col ? cellText(row.getCell(col).value).trim() : "");
      const code = at(cols.artifactNumber);
      if (!code) continue; // spacer/heading rows
      const match = code.match(ARTIFACT_CODE);
      if (!match) {
        skipped++;
        continue;
      }
      if (at(cols.zoneName)) lastZoneName = at(cols.zoneName);
      if (at(cols.sectionName)) lastSectionName = at(cols.sectionName);
      const name = at(cols.artifactName);
      if (!name) {
        skipped++;
        continue;
      }
      const uniqueIdText = at(cols.uniqueId);
      rows.push({
        zoneNumber: Number(match[1]),
        zoneName: lastZoneName || `Zone ${Number(match[1])}`,
        sectionCode: `${match[1]}.${match[2]}`,
        sectionName: lastSectionName || `Section ${match[1]}.${match[2]}`,
        artifactCode: code,
        artifactName: name,
        purpose: at(cols.purpose) || null,
        uniqueId: /^\d+$/.test(uniqueIdText) ? Number(uniqueIdText) : null,
      });
    }
    if (rows.length > 0) {
      return {
        rows,
        skipped,
        sheetName: sheet.name,
        modelVersion: findModelVersion(sheet, header.headerRow),
      };
    }
  }
  const sheets = workbook.worksheets.map((s) => s.name).join(", ");
  throw new Error(
    `No sheet with recognizable TMF RM columns (artifact number + artifact name) found. Sheets present: ${sheets}. ` +
      "Refusing to guess at the layout — check that this is the official CDISC TMF Reference Model export.",
  );
}

export async function importRows(
  sql: ReturnType<typeof createDb>["sql"],
  rows: ArtifactRow[],
  modelVersion?: string | null,
): Promise<{ zones: number; sections: number; artifacts: number }> {
  const zones = new Map<number, string>();
  const sections = new Map<string, { zoneNumber: number; name: string }>();
  for (const row of rows) {
    zones.set(row.zoneNumber, row.zoneName);
    sections.set(row.sectionCode, { zoneNumber: row.zoneNumber, name: row.sectionName });
  }

  await sql.begin(async (tx) => {
    await tx`SELECT set_config('ctms.actor_label', 'tmf-import', true)`;
    for (const [number, name] of zones) {
      await tx`
        INSERT INTO tmf_zone (number, name) VALUES (${number}, ${name})
        ON CONFLICT (number) DO UPDATE SET name = EXCLUDED.name`;
    }
    for (const [code, section] of sections) {
      await tx`
        INSERT INTO tmf_section (zone_id, code, name)
        VALUES ((SELECT id FROM tmf_zone WHERE number = ${section.zoneNumber}), ${code}, ${section.name})
        ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id`;
    }
    for (const row of rows) {
      await tx`
        INSERT INTO tmf_artifact (section_id, code, name, purpose, unique_id)
        VALUES ((SELECT id FROM tmf_section WHERE code = ${row.sectionCode}), ${row.artifactCode}, ${row.artifactName}, ${row.purpose}, ${row.uniqueId})
        ON CONFLICT (code) DO UPDATE
          SET name = EXCLUDED.name, section_id = EXCLUDED.section_id,
              purpose = coalesce(EXCLUDED.purpose, tmf_artifact.purpose),
              unique_id = coalesce(EXCLUDED.unique_id, tmf_artifact.unique_id)`;
    }
    if (modelVersion) {
      await tx`
        INSERT INTO app_meta (key, value, updated_at)
        VALUES ('tmf_rm_version', ${modelVersion}, now())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
    }
  });
  return { zones: zones.size, sections: sections.size, artifacts: rows.length };
}

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: pnpm db:import-tmf -- path/to/TMF_Reference_Model.xlsx");
    process.exit(2);
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const { rows, skipped, sheetName, modelVersion } = parseWorkbook(workbook);

  const { sql } = createDb();
  const counts = await importRows(sql, rows, modelVersion);

  console.log(`sheet: ${sheetName}`);
  console.log(
    modelVersion
      ? `model version: ${modelVersion} (recorded as app_meta.tmf_rm_version)`
      : "model version: not found in sheet — EMS export will refuse until app_meta.tmf_rm_version is set",
  );
  console.log(
    `imported: ${counts.zones} zones, ${counts.sections} sections, ${counts.artifacts} artifacts` +
      (skipped ? ` (${skipped} non-artifact rows skipped, e.g. sub-artifacts/notes)` : ""),
  );
  const perZone = await sql`
    SELECT z.number, z.name, count(a.id)::int AS artifacts
    FROM tmf_zone z
    LEFT JOIN tmf_section s ON s.zone_id = z.id
    LEFT JOIN tmf_artifact a ON a.section_id = s.id
    GROUP BY z.number, z.name ORDER BY z.number`;
  for (const zone of perZone) {
    console.log(`  zone ${String(zone.number).padStart(2, "0")} ${zone.name}: ${zone.artifacts}`);
  }
  await sql.end();
}

// Run only as a CLI, not when imported by tests.
if (process.argv[1]?.endsWith("import-tmf.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
