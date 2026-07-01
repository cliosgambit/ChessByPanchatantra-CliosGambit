import { Chess } from 'chess.js';
import { col } from '../lib/supabase/columnMapper';
import { fetchTable, insertRow, updateRow } from '../lib/supabase/crud';
import {
  formatChapterNumberLabel,
  formatModuleNumberLabel,
} from './curriculumService';

export function mapPuzzle(row) {
  if (!row) return null;
  const id = col(row, 'chess_puzzle_id');
  return {
    id,
    chess_puzzle_id: id,
    principle_id: col(row, 'principle_id'),
    fen: col(row, 'fen_with_move'),
    fen_with_move: col(row, 'fen_with_move'),
    solution: col(row, 'answer'),
    answer: col(row, 'answer'),
  };
}

export function parsePuzzleIdNumber(id) {
  const match = String(id || '').match(/^CP?(\d+)$/i);
  return match ? parseInt(match[1], 10) : 0;
}

export function formatNextPuzzleId(num) {
  return `CP${String(num).padStart(4, '0')}`;
}

export async function getNextPuzzleId() {
  const rows = await fetchTable('chess_puzzle');
  const maxNum = rows.reduce((max, row) => {
    const n = parsePuzzleIdNumber(col(row, 'chess_puzzle_id'));
    return n > max ? n : max;
  }, 0);
  return formatNextPuzzleId(maxNum + 1);
}

export function validateFen(fen) {
  const trimmed = String(fen || '').trim();
  if (!trimmed) return false;
  try {
    const chess = new Chess(trimmed);
    return Boolean(chess.fen());
  } catch {
    return false;
  }
}

export async function fetchPuzzlesForPrinciple(principleId) {
  const rows = await fetchTable('chess_puzzle', { orderBy: 'chess_puzzle_id', ascending: true });
  return rows
    .map(mapPuzzle)
    .filter((p) => p?.principle_id === principleId && p.fen_with_move);
}

function parsePuzzleList(value) {
  if (!value || typeof value !== 'string') return [];
  return value
    .trim()
    .replace(/^\[|\]$/g, '')
    .replace(/'/g, '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function formatStoryUsageLabel(storyRow) {
  const title = col(storyRow, 'title');
  const storyNumber = col(storyRow, 'story_number');
  if (title) return title;
  if (storyNumber != null && storyNumber !== '') return `Story ${storyNumber}`;
  return col(storyRow, 'story_id') || '—';
}

function buildUsageMaps({
  puzzleRows,
  mappingRows,
  storyRows,
  chapterRows,
  moduleRows,
  principlePositionRows,
}) {
  const modulesById = new Map(
    moduleRows.map((row) => [col(row, 'module_id'), row]).filter(([id]) => id)
  );
  const chaptersById = new Map(
    chapterRows.map((row) => [col(row, 'chapter_id'), row]).filter(([id]) => id)
  );
  const storiesById = new Map(
    storyRows.map((row) => [col(row, 'story_id'), row]).filter(([id]) => id)
  );

  const puzzleToPrinciples = new Map();

  for (const row of puzzleRows) {
    const puzzleId = col(row, 'chess_puzzle_id');
    const principleId = col(row, 'principle_id');
    if (!puzzleId || !principleId) continue;
    if (!puzzleToPrinciples.has(puzzleId)) puzzleToPrinciples.set(puzzleId, new Set());
    puzzleToPrinciples.get(puzzleId).add(principleId);
  }

  for (const row of principlePositionRows) {
    const principleId = col(row, 'principle_id');
    if (!principleId) continue;
    for (const puzzleId of parsePuzzleList(col(row, 'puzzle_list'))) {
      if (!puzzleToPrinciples.has(puzzleId)) puzzleToPrinciples.set(puzzleId, new Set());
      puzzleToPrinciples.get(puzzleId).add(principleId);
    }
  }

  const usagesByPuzzle = new Map();

  for (const mappingRow of mappingRows) {
    const storyId = col(mappingRow, 'story_id');
    const principleId = col(mappingRow, 'principle_id');
    const mappingId = col(mappingRow, 'mapping_id');
    if (!storyId || !principleId || !mappingId) continue;

    const storyRow = storiesById.get(storyId);
    const chapterRow = storyRow ? chaptersById.get(col(storyRow, 'chapter_id')) : null;
    const moduleRow = storyRow ? modulesById.get(col(storyRow, 'module_id')) : null;

    const usage = {
      storyId,
      mappingId,
      principleId,
      storyLabel: storyRow ? formatStoryUsageLabel(storyRow) : storyId,
      moduleLabel: formatModuleNumberLabel(
        moduleRow
          ? {
              module_number: col(moduleRow, 'module_number'),
              module_id: col(moduleRow, 'module_id'),
            }
          : null,
        col(storyRow, 'module_id')
      ),
      chapterLabel: formatChapterNumberLabel(
        chapterRow ? { chapter_number: col(chapterRow, 'chapter_number') } : null,
        col(storyRow, 'chapter_id')
      ),
      viewPath: `/api/story/${encodeURIComponent(storyId)}/mapping/${encodeURIComponent(mappingId)}`,
    };

    for (const [puzzleId, principleIds] of puzzleToPrinciples.entries()) {
      if (!principleIds.has(principleId)) continue;
      if (!usagesByPuzzle.has(puzzleId)) usagesByPuzzle.set(puzzleId, []);
      usagesByPuzzle.get(puzzleId).push(usage);
    }
  }

  return { usagesByPuzzle, puzzleToPrinciples };
}

export async function fetchAllPuzzlesWithUsage() {
  const [puzzleRows, mappingRows, storyRows, chapterRows, moduleRows, principlePositionRows] =
    await Promise.all([
      fetchTable('chess_puzzle', { orderBy: 'chess_puzzle_id', ascending: true }),
      fetchTable('story_mapping'),
      fetchTable('story'),
      fetchTable('chapter'),
      fetchTable('module'),
      fetchTable('principle_position'),
    ]);

  const { usagesByPuzzle, puzzleToPrinciples } = buildUsageMaps({
    puzzleRows,
    mappingRows,
    storyRows,
    chapterRows,
    moduleRows,
    principlePositionRows,
  });

  return puzzleRows.map(mapPuzzle).filter(Boolean).map((puzzle) => {
    const usages = usagesByPuzzle.get(puzzle.chess_puzzle_id) || [];
    const primary = usages[0] || null;
    const linkedPrinciples = puzzleToPrinciples.get(puzzle.chess_puzzle_id);
    const isUsed = usages.length > 0;

    let viewPath = primary?.viewPath || null;
    if (!viewPath && puzzle.principle_id) {
      viewPath = `/principles/${encodeURIComponent(puzzle.principle_id)}`;
    }

    return {
      ...puzzle,
      isUsed,
      usageStatus: isUsed ? 'used' : 'unused',
      usages,
      usageCount: usages.length,
      storyLabel: primary?.storyLabel || '—',
      moduleLabel: primary?.moduleLabel || '—',
      chapterLabel: primary?.chapterLabel || '—',
      principleLabel: puzzle.principle_id || (linkedPrinciples?.size ? [...linkedPrinciples][0] : '—'),
      viewPath,
    };
  });
}

export async function createPuzzle({ principleId, fen, solution }) {
  const fenTrimmed = String(fen || '').trim();
  const solutionTrimmed = String(solution || '').trim();

  if (!validateFen(fenTrimmed)) {
    throw new Error('Please enter a valid FEN.');
  }
  if (!solutionTrimmed) {
    throw new Error('Solution moves are required.');
  }

  const chess_puzzle_id = await getNextPuzzleId();
  const payload = {
    chess_puzzle_id,
    principle_id: principleId || null,
    fen_with_move: fenTrimmed,
    answer: solutionTrimmed,
    isdone: 0,
  };

  const row = await insertRow('chess_puzzle', payload);
  return mapPuzzle(row);
}

export async function fetchAllRatedPuzzles() {
  const rows = await fetchTable('3000_rated_puzzles');
  return rows
    .map((row, index) => {
      const fen = col(row, 'Fen', 'fen');
      if (!fen) return null;
      const principleId = col(row, 'principle_id');
      const rowId = col(row, 'id');
      return {
        puzzleType: 'rated3000',
        id: rowId || `rated-${index}`,
        fen,
        fen_with_move: fen,
        principle_id: principleId,
        principleLabel: principleId || '—',
      };
    })
    .filter(Boolean);
}

export async function updatePuzzle(puzzleId, { fen, solution, principleId }) {
  const fenTrimmed = String(fen || '').trim();
  const solutionTrimmed = String(solution || '').trim();

  if (!validateFen(fenTrimmed)) {
    throw new Error('Please enter a valid FEN.');
  }
  if (!solutionTrimmed) {
    throw new Error('Solution moves are required.');
  }

  const payload = {
    fen_with_move: fenTrimmed,
    answer: solutionTrimmed,
    principle_id: principleId || null,
  };

  const row = await updateRow('chess_puzzle', 'chess_puzzle_id', puzzleId, payload);
  return mapPuzzle(row);
}

export async function unlinkPuzzleFromPrinciple(puzzleId) {
  await updateRow('chess_puzzle', 'chess_puzzle_id', puzzleId, { principle_id: null });
}

export async function fetchChessPuzzleById(puzzleId) {
  const puzzles = await fetchAllPuzzlesWithUsage();
  const puzzle = puzzles.find((row) => row.chess_puzzle_id === puzzleId);
  if (!puzzle) {
    throw new Error(`Puzzle ${puzzleId} not found.`);
  }
  return puzzle;
}

export async function pickRandomUnusedChessPuzzle(excludeId = null) {
  const puzzles = await fetchAllPuzzlesWithUsage();
  const candidates = puzzles.filter(
    (row) =>
      !row.isUsed &&
      row.fen_with_move &&
      row.chess_puzzle_id &&
      row.chess_puzzle_id !== excludeId
  );
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
