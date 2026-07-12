import ExcelJS from "exceljs";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "./client.js";
import { importRows, parseWorkbook } from "./import-tmf.js";

/**
 * Structure-level test of the TMF RM importer with a synthetic workbook that
 * mimics the official spreadsheet's layout (header row, merged-cell zone and
 * section names, sub-artifact rows). Content authenticity is out of scope by
 * design (ADR-0005): the real content comes verbatim from the CDISC file at
 * import time. Zone 98 codes avoid the seeded taxonomy.
 */

const { sql } = createDb();
afterAll(async () => {
  await sql`DELETE FROM tmf_artifact WHERE code LIKE '98.%'`;
  await sql`DELETE FROM tmf_section WHERE code LIKE '98.%'`;
  await sql`DELETE FROM tmf_zone WHERE number = 98`;
  await sql.end();
});

function syntheticWorkbook(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const notes = workbook.addWorksheet("Cover Notes"); // decoy sheet, no headers
  notes.addRow(["TMF Reference Model", "synthetic fixture"]);
  const sheet = workbook.addWorksheet("TMF RM");
  sheet.addRow(["Trial Master File Reference Model", "", "", "Version 98.7"]); // title above header
  sheet.addRow([
    "Zone #",
    "Zone Name",
    "Section #",
    "Section Name",
    "Artifact #",
    "Artifact Name",
    "Purpose",
    "Unique ID Number",
  ]);
  sheet.addRow([98, "Synthetic Zone", "98.01", "Synthetic Section One", "98.01.01", "Synthetic Artifact A", "Testing", 980101]);
  // merged-cell style: zone/section names blank on continuation rows
  sheet.addRow(["", "", "", "", "98.01.02", "Synthetic Artifact B", "", 980102]);
  sheet.addRow(["", "", "98.02", "Synthetic Section Two", "98.02.01", "Synthetic Artifact C", "", ""]);
  sheet.addRow(["", "", "", "", "98.01.01.01", "Sub-artifact (skipped)", "", ""]);
  sheet.addRow(["", "", "", "", "98.02.02", "", "", ""]); // nameless: skipped
  return workbook;
}

describe("TMF RM importer", () => {
  it("finds the header row, carries merged names forward, skips non-artifacts", () => {
    const { rows, skipped, sheetName, modelVersion } = parseWorkbook(syntheticWorkbook());
    expect(sheetName).toBe("TMF RM");
    expect(rows).toHaveLength(3);
    expect(skipped).toBe(2);
    expect(rows[1]).toMatchObject({
      zoneNumber: 98,
      zoneName: "Synthetic Zone",
      sectionCode: "98.01",
      sectionName: "Synthetic Section One",
      artifactCode: "98.01.02",
      artifactName: "Synthetic Artifact B",
      uniqueId: 980102,
    });
    expect(rows[2]!.sectionName).toBe("Synthetic Section Two");
    // Blank Unique ID cell stays NULL — never invented (ADR-0024).
    expect(rows[2]!.uniqueId).toBeNull();
    // Model version read verbatim from the banner above the header row.
    expect(modelVersion).toBe("98.7");
  });

  it("rejects a workbook with no recognizable TMF RM sheet", () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Nothing").addRow(["just", "noise"]);
    expect(() => parseWorkbook(workbook)).toThrow(/Refusing to guess/);
  });

  it("upserts idempotently: re-import updates names in place, no duplicates", async () => {
    const { rows } = parseWorkbook(syntheticWorkbook());
    const first = await importRows(sql, rows);
    expect(first).toEqual({ zones: 1, sections: 2, artifacts: 3 });

    const renamed = rows.map((r) =>
      r.artifactCode === "98.01.01" ? { ...r, artifactName: "Synthetic Artifact A (rev)" } : r,
    );
    await importRows(sql, renamed);

    const [artifact] = await sql`
      SELECT a.name, a.unique_id, s.code AS section_code FROM tmf_artifact a
      JOIN tmf_section s ON s.id = a.section_id WHERE a.code = '98.01.01'`;
    expect(artifact!.name).toBe("Synthetic Artifact A (rev)");
    expect(artifact!.section_code).toBe("98.01");
    expect(artifact!.unique_id).toBe(980101);
    const [count] = await sql`
      SELECT count(*)::int AS n FROM tmf_artifact WHERE code LIKE '98.%'`;
    expect(count!.n).toBe(3);
  });
});
