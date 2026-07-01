import { col } from '../lib/supabase/columnMapper';
import { fetchTable, insertRow } from '../lib/supabase/crud';

export function mapPollResponse(row) {
  if (!row) return null;
  return {
    id: col(row, 'id'),
    chess_puzzle_id: col(row, 'chess_puzzle_id'),
    selected_move: col(row, 'selected_move'),
    is_correct: Boolean(col(row, 'is_correct')),
    poll_options: col(row, 'poll_options'),
    created_at: col(row, 'created_at'),
  };
}

export async function fetchPollResponsesForPuzzle(puzzleId) {
  const rows = await fetchTable('chess_puzzle_poll_response', {
    orderBy: 'created_at',
    ascending: false,
  });
  return rows
    .map(mapPollResponse)
    .filter((row) => row?.chess_puzzle_id === puzzleId);
}

export async function savePollResponse({ puzzleId, selectedMove, isCorrect, pollOptions }) {
  const row = await insertRow('chess_puzzle_poll_response', {
    chess_puzzle_id: puzzleId,
    selected_move: selectedMove,
    is_correct: Boolean(isCorrect),
    poll_options: pollOptions || null,
  });
  return mapPollResponse(row);
}

export function summarizePollResponses(responses) {
  const total = responses.length;
  const correct = responses.filter((row) => row.is_correct).length;
  return { total, correct, incorrect: total - correct };
}
