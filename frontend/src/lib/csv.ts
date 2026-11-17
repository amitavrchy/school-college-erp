/** Parses CSV (RFC 4180 quoting, comma or semicolon, optional BOM) into rows of strings. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const delimiter =
    (src.split(/\r?\n/, 1)[0].match(/;/g)?.length || 0) >
    (src.split(/\r?\n/, 1)[0].match(/,/g)?.length || 0)
      ? ';'
      : ',';
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}
const normalise = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
/** Maps a header row to field names using a dictionary of accepted spellings. */
export function mapRows(rows: string[][], aliases: Record<string, string[]>) {
  const [header, ...body] = rows;
  const index: Record<string, number> = {};
  header?.forEach((h, i) => {
    const key = normalise(h);
    for (const [field, names] of Object.entries(aliases))
      if (names.map(normalise).includes(key) && index[field] === undefined) index[field] = i;
  });
  const unknown = (header || []).filter(
    (h) => !Object.values(aliases).some((names) => names.map(normalise).includes(normalise(h))),
  );
  return {
    mapped: Object.keys(index),
    unknown,
    records: body.map((r) => {
      const out: Record<string, string> = {};
      for (const [field, i] of Object.entries(index)) if (r[i]?.trim()) out[field] = r[i].trim();
      return out;
    }),
  };
}
