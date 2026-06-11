const TEMPLATE_CSV = `principle
A knight on the rim is grim.
A rook on the seventh rank is powerful.
A bad plan is better than no plan at all.`;

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function extractPrincipleFromRecord(record) {
  const keys = Object.keys(record);
  const principleKey = keys.find((k) => ['principle', 'name', 'text'].includes(normalizeHeader(k)));

  if (principleKey) {
    const principle = String(record[principleKey] ?? '').trim();
    return principle || null;
  }

  if (keys.length === 1) {
    const principle = String(record[keys[0]] ?? '').trim();
    return principle || null;
  }

  return null;
}

export function parsePrinciplesCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    throw new Error('CSV must include a header row and at least one data row.');
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  let principleIdx = headers.findIndex((h) => ['principle', 'name', 'text'].includes(h));

  if (principleIdx === -1 && headers.length === 1) {
    principleIdx = 0;
  }

  if (principleIdx === -1) {
    throw new Error('CSV must include a "principle" column.');
  }

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    if (cols.every((c) => !c.trim())) continue;

    const principle = (cols[principleIdx] || '').trim();
    if (principle) rows.push(principle);
  }

  if (!rows.length) {
    throw new Error('No valid principle rows found in file.');
  }
  return rows;
}

export async function parsePrinciplesXlsx(file) {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Spreadsheet has no sheets.');
  }
  const sheet = workbook.Sheets[sheetName];
  const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const rows = jsonRows.map(extractPrincipleFromRecord).filter(Boolean);

  if (!rows.length) {
    throw new Error('No valid principle rows found in spreadsheet.');
  }
  return rows;
}

export async function parsePrinciplesFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'csv') {
    return parsePrinciplesCsv(await file.text());
  }
  if (ext === 'xlsx' || ext === 'xls') {
    return parsePrinciplesXlsx(file);
  }
  throw new Error('Unsupported file type. Upload a .csv or .xlsx file.');
}

export function downloadPrinciplesTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'principles_template.csv';
  link.click();
  URL.revokeObjectURL(url);
}
