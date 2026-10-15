import type { Client } from "@libsql/client";

const EXPORT_TABLES = [
  "projects",
  "plans",
  "markdown_files",
  "activities",
  "attachments",
  "reviews",
  "feedback",
] as const;

export async function exportSnapshot(client: Client): Promise<{
  version: string;
  exportedAt: string;
  data: Record<string, any[]>;
}> {
  const data: Record<string, any[]> = {};

  for (const table of EXPORT_TABLES) {
    try {
      const result = await client.execute(`SELECT * FROM ${table}`);
      data[table] = result.rows as any[];
    } catch (err) {
      data[table] = [];
    }
  }

  return {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    data,
  };
}

export async function importSnapshot(
  client: Client,
  snapshot: { version: string; data: Record<string, any[]> },
): Promise<{ success: boolean; importedCounts: Record<string, number> }> {
  const importedCounts: Record<string, number> = {};

  if (!snapshot.data) {
    throw new Error("Invalid snapshot format: missing data field");
  }

  // Import projects first, then plans, then dependent tables
  for (const table of EXPORT_TABLES) {
    const rows = snapshot.data[table];
    if (!Array.isArray(rows) || rows.length === 0) {
      importedCounts[table] = 0;
      continue;
    }

    let count = 0;
    for (const row of rows) {
      const keys = Object.keys(row);
      const values = Object.values(row);
      const placeholders = keys.map(() => "?").join(", ");
      const columns = keys.join(", ");

      const sql = `INSERT OR REPLACE INTO ${table} (${columns}) VALUES (${placeholders})`;
      try {
        await client.execute({ sql, args: values as any[] });
        count++;
      } catch (err) {
        console.warn(`[Import] Failed to insert row into ${table}:`, err);
      }
    }
    importedCounts[table] = count;
  }

  return {
    success: true,
    importedCounts,
  };
}
