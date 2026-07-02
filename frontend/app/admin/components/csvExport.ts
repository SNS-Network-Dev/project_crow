// Client-side CSV export. No backend round-trip — builds a string from the
// already-loaded rows and downloads it via a Blob.

export interface CsvColumn<T> {
  key: string;
  header: string;
  // Optional formatter that receives the whole row (lets you render dates, etc.).
  fmt?: (row: T) => string;
}

function escapeCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => escapeCell(c.header)).join(",");
  const body = rows
    .map((r) =>
      columns
        .map((c) => {
          const raw = c.fmt ? c.fmt(r) : (r[c.key as keyof T] ?? null);
          return escapeCell(raw);
        })
        .join(","),
    )
    .join("\n");
  return `${head}\n${body}\n`;
}

export function downloadCSV(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}