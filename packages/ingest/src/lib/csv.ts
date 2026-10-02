/**
 * A small RFC 4180 CSV reader. It is a generator over the text, so a 65 MB government file is
 * walked row by row instead of being turned into millions of strings at once.
 *
 *  - quoted fields may contain commas, quotes ("" → ") and newlines;
 *  - CRLF and LF line endings;
 *  - a UTF-8 byte-order mark is ignored;
 *  - blank lines are skipped.
 */
export function* parseCsv(text: string): Generator<string[]> {
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = text.length;
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let fieldStarted = false;

  const endField = () => {
    row.push(field);
    field = '';
    fieldStarted = false;
  };

  for (; i < n; i++) {
    const c = text[i] as string;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"' && !fieldStarted) {
      quoted = true;
      fieldStarted = true;
    } else if (c === ',') {
      endField();
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      if (fieldStarted || field !== '' || row.length > 0) {
        endField();
        yield row;
      }
      row = [];
    } else {
      field += c;
      fieldStarted = true;
    }
  }
  if (fieldStarted || field !== '' || row.length > 0) {
    endField();
    yield row;
  }
}

/** Rows as objects keyed by the header row. Short rows get empty strings, long rows are truncated. */
export function* parseCsvRecords(text: string): Generator<Record<string, string>> {
  let header: string[] | null = null;
  for (const row of parseCsv(text)) {
    if (!header) {
      header = row.map((h) => h.trim());
      continue;
    }
    const record: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) record[header[c] as string] = row[c] ?? '';
    yield record;
  }
}
