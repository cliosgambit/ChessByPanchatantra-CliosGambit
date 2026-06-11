import { col } from '../lib/supabase/columnMapper';
import { countTable, deleteRow, fetchTable, insertRow, updateRow } from '../lib/supabase/crud';
import { subscribeToTable, unsubscribeChannel } from '../lib/supabase/realtime';
import { fetchPuzzlesForPrinciple, mapPuzzle } from './puzzleService';

export { fetchPuzzlesForPrinciple, mapPuzzle };

export function mapPrinciple(row, fullText) {
  if (!row) return null;
  const id = col(row, 'id') || col(row, 'principle_id');
  const name = col(row, 'name');
  const principle = fullText || col(row, 'principle') || name;
  if (!id && !principle) return null;
  return { id, name: principle, principle };
}

function normalizePrincipleText(value) {
  return String(value || '').trim();
}

async function fetchPrinciplePositionMap() {
  const rows = await fetchTable('principle_position');
  const map = new Map();
  for (const row of rows) {
    const id = col(row, 'principle_id');
    const text = normalizePrincipleText(col(row, 'principle'));
    if (id && text) map.set(id, text);
  }
  return map;
}

async function mergeWithFullPrincipleText(mappedRows) {
  const positionMap = await fetchPrinciplePositionMap();
  return mappedRows.map((row) => {
    if (!row?.id) return row;
    const full = positionMap.get(row.id);
    if (!full) return row;
    return { ...row, principle: full, name: full };
  });
}

async function fetchExistingPrincipleTexts() {
  const [principles, positions] = await Promise.all([
    fetchTable('principles'),
    fetchTable('principle_position'),
  ]);
  const texts = new Set();
  for (const row of positions) {
    const text = normalizePrincipleText(col(row, 'principle'));
    if (text) texts.add(text.toLowerCase());
  }
  for (const row of principles) {
    const text = normalizePrincipleText(col(row, 'name'));
    if (text) texts.add(text.toLowerCase());
  }
  return texts;
}

async function upsertPrinciplePosition(id, text) {
  const positions = await fetchTable('principle_position');
  const exists = positions.some((row) => col(row, 'principle_id') === id);
  if (exists) {
    await updateRow('principle_position', 'principle_id', id, { principle: text });
  } else {
    await insertRow('principle_position', {
      principle_id: id,
      principle: text,
      isdone: 0,
    });
  }
}

export function parsePrincipleIdNumber(id) {
  const str = String(id || '').trim();
  const match = str.match(/^P?(\d+)$/i);
  return match ? parseInt(match[1], 10) : 0;
}

export function formatNextPrincipleId(num) {
  return `P${String(num).padStart(3, '0')}`;
}

export async function getNextPrincipleId() {
  const rows = await fetchTable('principles');
  if (!rows.length) return 'P001';

  const maxNum = rows.reduce((max, row) => {
    const n = parsePrincipleIdNumber(col(row, 'id'));
    return n > max ? n : max;
  }, 0);

  return formatNextPrincipleId(maxNum + 1);
}

export function sortPrinciplesById(principles) {
  return [...principles].sort((a, b) => {
    const diff = parsePrincipleIdNumber(a.id) - parsePrincipleIdNumber(b.id);
    if (diff !== 0) return diff;
    return String(a.id).localeCompare(String(b.id));
  });
}

export async function fetchPrinciples() {
  const rows = await fetchTable('principles', { orderBy: 'id', ascending: true });
  const mapped = rows.map((row) => mapPrinciple(row)).filter(Boolean);
  const merged = await mergeWithFullPrincipleText(mapped);
  return sortPrinciplesById(merged);
}

export async function fetchPrincipleById(principleId) {
  const rows = await fetchTable('principles');
  const row = rows.find((r) => col(r, 'id') === principleId);
  if (!row) return null;

  const mapped = mapPrinciple(row);
  const positionMap = await fetchPrinciplePositionMap();
  const full = positionMap.get(principleId);
  if (full) {
    return { ...mapped, principle: full, name: full };
  }
  return mapped;
}

export async function fetchPrincipleStats() {
  const [principles, puzzles, ratedPuzzles, positions] = await Promise.all([
    countTable('principles'),
    countTable('chess_puzzle'),
    countTable('3000_rated_puzzles'),
    countTable('principle_position'),
  ]);
  return { principles, puzzles, ratedPuzzles, positions };
}

export async function createPrinciple({ name, id }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    throw new Error('Principle text is required.');
  }

  const nextId = id || (await getNextPrincipleId());
  const row = await insertRow('principles', { id: nextId, name: trimmed });
  await upsertPrinciplePosition(nextId, trimmed);
  return mapPrinciple(row, trimmed);
}

export async function updatePrinciple(id, { name }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    throw new Error('Principle text is required.');
  }

  const row = await updateRow('principles', 'id', id, { name: trimmed });
  await upsertPrinciplePosition(id, trimmed);
  return mapPrinciple(row, trimmed);
}

export async function deletePrinciple(id) {
  await deleteRow('principles', 'id', id);
  try {
    await deleteRow('principle_position', 'principle_id', id);
  } catch {
    // position row may not exist for legacy records
  }
}

export async function bulkImportPrinciples(principleTexts) {
  const texts = principleTexts
    .map((row) => (typeof row === 'string' ? row : row?.principle))
    .map(normalizePrincipleText)
    .filter(Boolean);

  if (!texts.length) {
    throw new Error('No valid principle rows found to import.');
  }

  const existingTexts = await fetchExistingPrincipleTexts();
  const existingRows = await fetchTable('principles');

  let nextNum = existingRows.reduce((max, row) => {
    const n = parsePrincipleIdNumber(col(row, 'id'));
    return n > max ? n : max;
  }, 0);

  const seenInFile = new Set();
  const result = { imported: 0, skipped: 0 };

  for (const text of texts) {
    const key = text.toLowerCase();

    if (seenInFile.has(key) || existingTexts.has(key)) {
      result.skipped += 1;
      continue;
    }

    try {
      nextNum += 1;
      const id = formatNextPrincipleId(nextNum);
      await insertRow('principles', { id, name: text });
      await upsertPrinciplePosition(id, text);
      seenInFile.add(key);
      existingTexts.add(key);
      result.imported += 1;
    } catch {
      result.skipped += 1;
    }
  }

  if (result.imported === 0) {
    throw new Error('No principles were imported. All rows were empty or duplicates.');
  }

  return result;
}

export function subscribeToPrinciples(callbacks) {
  return subscribeToTable('principles', 'public:principles-admin', {
    onInsert: () => callbacks.onRefetch?.(),
    onUpdate: () => callbacks.onRefetch?.(),
    onDelete: () => callbacks.onRefetch?.(),
    onError: callbacks.onError,
  });
}

export { unsubscribeChannel };
