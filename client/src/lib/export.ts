export type CsvColumn<T> = { key: keyof T | string; label: string; format?: (row: T) => string | number | null | undefined };

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Build a CSV string from rows and column definitions. */
export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const body = rows.map((row) =>
    columns
      .map((c) => escapeCell(c.format ? c.format(row) : (row as Record<string, unknown>)[c.key as string]))
      .join(",")
  );
  return [header, ...body].join("\r\n");
}

/** Trigger a browser download of the given rows as a CSV file. */
export function downloadCsv<T extends Record<string, unknown>>(filename: string, rows: T[], columns: CsvColumn<T>[]): void {
  const csv = toCsv(rows, columns);
  // Prepend a BOM so Excel reads UTF-8 (acentuação) correctly.
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
