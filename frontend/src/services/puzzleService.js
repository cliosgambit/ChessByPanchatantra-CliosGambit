import { Chess } from 'chess.js';
import { col } from '../lib/supabase/columnMapper';
import { fetchTable, insertRow, updateRow } from '../lib/supabase/crud';

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
    difficulty: col(row, 'difficulty'),
    notes: col(row, 'notes'),
    title: col(row, 'title'),
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

export async function createPuzzle({ principleId, fen, solution, difficulty, notes, title }) {
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
    principle_id: principleId,
    fen_with_move: fenTrimmed,
    answer: solutionTrimmed,
    isdone: 0,
  };

  if (difficulty) payload.difficulty = difficulty;
  if (notes?.trim()) payload.notes = notes.trim();
  if (title?.trim()) payload.title = title.trim();

  const row = await insertRow('chess_puzzle', payload);
  return mapPuzzle(row);
}

export async function updatePuzzle(puzzleId, { fen, solution, difficulty, notes, title }) {
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
    difficulty: difficulty || null,
    notes: notes?.trim() || null,
    title: title?.trim() || null,
  };

  const row = await updateRow('chess_puzzle', 'chess_puzzle_id', puzzleId, payload);
  return mapPuzzle(row);
}

export async function unlinkPuzzleFromPrinciple(puzzleId) {
  await updateRow('chess_puzzle', 'chess_puzzle_id', puzzleId, { principle_id: null });
}
