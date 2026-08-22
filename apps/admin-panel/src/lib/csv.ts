/**
 * No CSV/export utility existed anywhere in this codebase before this —
 * grepped both admin-panel and api. Deliberately minimal: exports exactly
 * what's already rendered in a table (respecting whatever filter is
 * currently applied), nothing more — no server round-trip, no separate
 * report-configuration system.
 */
export type CsvColumn<T> = { header: string; value: (row: T) => string | number };

function escapeCsvValue(value: string | number) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Pure — no DOM/Blob side effects — so this is the part that's actually
 * unit-tested; downloadCsv below is a thin wrapper around it. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [
    columns.map((c) => escapeCsvValue(c.header)).join(','),
    ...rows.map((row) => columns.map((c) => escapeCsvValue(c.value(row))).join(',')),
  ];
  return lines.join('\r\n');
}

export function downloadCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]) {
  const csv = toCsv(rows, columns);
  // Leading BOM so Excel (still the realistic destination for this) opens
  // UTF-8 content — BDT's ৳ sign, Bangla store names — without mangling it.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
