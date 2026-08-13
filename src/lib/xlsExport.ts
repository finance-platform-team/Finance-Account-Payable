// src/lib/xlsExport.ts

/* ════════════════════════════════════════
   XLS EXPORT — shared helper
   Source of truth: CFM_APNew.html
     - escapeXlsCell()      (line ~13161)
     - exportRowsToXLS()    (line ~13169)
     - exportFilenameStamp() (line ~13231)

   Builds a "fake XLS" (an HTML table saved with an .xls extension and the
   application/vnd.ms-excel MIME type) — Excel opens this natively, and it
   needs no library. Exactly mirrors the legacy implementation.
════════════════════════════════════════ */

export type XlsCell = string | number | null | undefined;

function escapeXlsCell(val: XlsCell): string {
  if (val === null || val === undefined) return "";
  return String(val).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** "yyyy-mm-dd_hhmm" — mirrors exportFilenameStamp(). */
export function exportFilenameStamp(): string {
  const d = new Date();
  const pad = (n: number) => (n < 10 ? "0" + n : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/**
 * Exports rows to a downloadable .xls file — mirrors exportRowsToXLS().
 * Returns false (and shows nothing itself — caller toasts) when there's
 * nothing to export, so callers can show their own "Nothing to Export" message.
 */
export function exportRowsToXLS(filename: string, headers: string[], rows: XlsCell[][]): boolean {
  if (!rows || rows.length === 0) return false;

  let html =
    "<table><thead><tr>" +
    headers
      .map(
        (h) =>
          `<th style="background:#A5845B;color:#ffffff;font-weight:bold;padding:6px 10px;border:1px solid #8a6c48;">${escapeXlsCell(h)}</th>`,
      )
      .join("") +
    "</tr></thead><tbody>";

  rows.forEach((r) => {
    html += "<tr>" + r.map((c) => `<td style="padding:5px 10px;border:1px solid #ddd;">${escapeXlsCell(c)}</td>`).join("") + "</tr>";
  });

  html += "</tbody></table>";

  const template =
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">' +
    `<head><meta charset="UTF-8" /></head><body>${html}</body></html>`;

  const blob = new Blob([template], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.toLowerCase().endsWith(".xls") ? filename : filename + ".xls";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return true;
}
