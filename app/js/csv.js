// Minimal CSV builder + browser download — no library, same
// zero-dependency approach the rest of this app uses for exports (see
// `exportCategoryPdf()`-style patterns: build a string, trigger a
// download via a synthetic element, nothing imported). Used by the
// Expenses and Goals tabs' "Export CSV" actions.

// RFC 4180-ish escaping: a field containing a comma, double quote, or
// newline gets wrapped in double quotes, with any internal double quote
// doubled. Anything else passes through unquoted.
function escapeCsvField(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// `columns` is [{ label, value(row) }]. `label` becomes the header row;
// `value(row)` produces that column's cell for each row. CRLF line
// endings, since that's what most spreadsheet apps expect from a .csv.
export function toCsv(rows, columns) {
  const header = columns.map((c) => escapeCsvField(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => escapeCsvField(c.value(row))).join(','));
  return [header, ...lines].join('\r\n');
}

// Triggers a browser download of `content` as `filename`, via a Blob +
// a temporary <a download> element — no server round-trip, nothing left
// behind once the click fires.
export function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Turns a goal/record title into a filesystem-safe filename fragment —
// lowercase, non-alphanumeric runs collapsed to a single hyphen, no
// leading/trailing hyphen. Falls back to "export" for a title that's
// entirely punctuation/whitespace (so a filename is never just "-.csv").
export function slugify(title) {
  const slug = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'export';
}
