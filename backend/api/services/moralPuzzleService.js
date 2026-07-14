const db = require('../config/database');

const SOURCE_TABLE = {
  gm: '"3000_rated_puzzles"',
  lichess: 'lichess_puzzles',
  chesscom: 'chesscom_random_puzzles',
};

function mapChesscomRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title || null,
    fen: row.fen,
    pgn: row.pgn || null,
    source_url: row.source_url || null,
    image_url: row.image_url || null,
    publish_time: row.publish_time != null ? Number(row.publish_time) : null,
    comments: row.comments || null,
    is_used: Boolean(Number(row.is_used)),
    created_at: row.created_at || null,
  };
}

/** Insert Chess.com puzzle by unique FEN; return existing row if fen already stored. */
async function upsertChesscomRandomPuzzle(payload = {}) {
  const fen = String(payload.fen || '').trim();
  if (!fen) throw new Error('FEN is required.');

  const existing = await db.query(
    `SELECT * FROM chesscom_random_puzzles WHERE fen = $1`,
    [fen]
  );
  if (existing.rows[0]) {
    return { puzzle: mapChesscomRow(existing.rows[0]), created: false };
  }

  const { rows } = await db.query(
    `INSERT INTO chesscom_random_puzzles
       (title, fen, pgn, source_url, image_url, publish_time, comments, is_used, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0, datetime('now'))
     RETURNING *`,
    [
      payload.title || null,
      fen,
      payload.pgn || null,
      payload.url || payload.source_url || null,
      payload.image || payload.image_url || null,
      payload.publish_time != null ? Number(payload.publish_time) : null,
      payload.comments || null,
    ]
  );
  return { puzzle: mapChesscomRow(rows[0]), created: true };
}

async function setSourceUsed(source, puzzleId, used) {
  const table = SOURCE_TABLE[source];
  if (!table) throw new Error(`Unknown source: ${source}`);
  await db.query(`UPDATE ${table} SET is_used = $1 WHERE id = $2`, [
    used ? 1 : 0,
    Number(puzzleId),
  ]);
}

async function refreshUsedFlag(source, puzzleId) {
  const { rows } = await db.query(
    `SELECT COUNT(*) AS c FROM moral_puzzle_assignments
     WHERE source = $1 AND puzzle_id = $2`,
    [source, Number(puzzleId)]
  );
  const used = Number(rows[0]?.c || 0) > 0;
  await setSourceUsed(source, puzzleId, used);
  return used;
}

async function assertPuzzleExists(source, puzzleId) {
  const table = SOURCE_TABLE[source];
  if (!table) throw new Error('Invalid source. Use gm, lichess, or chesscom.');
  const { rows } = await db.query(`SELECT id FROM ${table} WHERE id = $1`, [
    Number(puzzleId),
  ]);
  if (!rows[0]) throw new Error('Puzzle not found for that source.');
}

async function loadPuzzleDetails(source, puzzleId) {
  if (source === 'gm') {
    const { rows } = await db.query(
      `SELECT id, "Fen" AS fen, is_used, moral_id FROM "3000_rated_puzzles" WHERE id = $1`,
      [Number(puzzleId)]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      source: 'gm',
      id: row.id,
      fen: row.fen,
      is_used: Boolean(Number(row.is_used)),
      title: `GM #${row.id}`,
      moves: null,
      pgn: null,
      rating: null,
      url: null,
    };
  }
  if (source === 'lichess') {
    const { rows } = await db.query(
      `SELECT id, fen, moves, rating, themes, game_url, is_used
       FROM lichess_puzzles WHERE id = $1`,
      [Number(puzzleId)]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      source: 'lichess',
      id: row.id,
      fen: row.fen,
      is_used: Boolean(Number(row.is_used)),
      title: `Lichess #${row.id}${row.rating != null ? ` (${row.rating})` : ''}`,
      moves: row.moves,
      pgn: null,
      rating: row.rating,
      themes: row.themes,
      url: row.game_url,
    };
  }
  if (source === 'chesscom') {
    const { rows } = await db.query(
      `SELECT * FROM chesscom_random_puzzles WHERE id = $1`,
      [Number(puzzleId)]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      source: 'chesscom',
      id: row.id,
      fen: row.fen,
      is_used: Boolean(Number(row.is_used)),
      title: row.title || `Chess.com #${row.id}`,
      moves: null,
      pgn: row.pgn,
      rating: null,
      url: row.source_url,
      image_url: row.image_url,
    };
  }
  return null;
}

async function listAssignments(storyId, moralId) {
  const { rows } = await db.query(
    `SELECT id, story_id, moral_id, source, puzzle_id, display_order, assigned_at
     FROM moral_puzzle_assignments
     WHERE story_id = $1 AND moral_id = $2
     ORDER BY display_order ASC, id ASC`,
    [Number(storyId), Number(moralId)]
  );

  const puzzles = [];
  for (const row of rows) {
    const detail = await loadPuzzleDetails(row.source, row.puzzle_id);
    puzzles.push({
      assignment_id: row.id,
      story_id: Number(row.story_id),
      moral_id: Number(row.moral_id),
      source: row.source,
      puzzle_id: Number(row.puzzle_id),
      display_order: Number(row.display_order),
      assigned_at: row.assigned_at,
      puzzle: detail,
    });
  }
  return puzzles;
}

async function nextDisplayOrder(storyId, moralId) {
  const { rows } = await db.query(
    `SELECT COALESCE(MAX(display_order), -1) AS m
     FROM moral_puzzle_assignments
     WHERE story_id = $1 AND moral_id = $2`,
    [Number(storyId), Number(moralId)]
  );
  return Number(rows[0]?.m ?? -1) + 1;
}

async function resolveAssignedBy(assignedBy) {
  if (assignedBy == null || assignedBy === '') return null;
  const n = Number(assignedBy);
  if (!Number.isFinite(n)) return null;
  const { rows } = await db.query(`SELECT id FROM "Login" WHERE id = $1`, [n]);
  return rows[0] ? Number(rows[0].id) : null;
}

async function assignPuzzle({ storyId, moralId, source, puzzleId, assignedBy = null }) {
  if (!SOURCE_TABLE[source]) {
    throw new Error('Invalid source. Use gm, lichess, or chesscom.');
  }
  const pid = Number(puzzleId);
  if (!Number.isFinite(pid)) throw new Error('puzzle_id is required.');

  // Story must include this moral
  const link = await db.query(
    `SELECT 1 FROM story_moral_mapping WHERE story_id = $1 AND moral_id = $2`,
    [Number(storyId), Number(moralId)]
  );
  if (!link.rows[0]) {
    throw new Error('This moral is not linked to the story.');
  }

  await assertPuzzleExists(source, pid);

  const already = await db.query(
    `SELECT id, story_id, moral_id FROM moral_puzzle_assignments
     WHERE source = $1 AND puzzle_id = $2`,
    [source, pid]
  );
  if (already.rows[0]) {
    const a = already.rows[0];
    if (Number(a.story_id) === Number(storyId) && Number(a.moral_id) === Number(moralId)) {
      throw new Error('Puzzle is already assigned to this moral.');
    }
    throw new Error(
      `Puzzle is already used on story #${a.story_id}, moral #${a.moral_id}.`
    );
  }

  const order = await nextDisplayOrder(storyId, moralId);
  const assignedById = await resolveAssignedBy(assignedBy);
  const { rows } = await db.query(
    `INSERT INTO moral_puzzle_assignments
       (story_id, moral_id, source, puzzle_id, display_order, assigned_at, assigned_by)
     VALUES ($1, $2, $3, $4, $5, datetime('now'), $6)
     RETURNING id, story_id, moral_id, source, puzzle_id, display_order, assigned_at`,
    [Number(storyId), Number(moralId), source, pid, order, assignedById]
  );

  await setSourceUsed(source, pid, true);

  // Keep legacy GM moral_id in sync when assigning
  if (source === 'gm') {
    await db.query(`UPDATE "3000_rated_puzzles" SET moral_id = $1 WHERE id = $2`, [
      Number(moralId),
      pid,
    ]);
  }

  const detail = await loadPuzzleDetails(source, pid);
  return {
    assignment_id: rows[0].id,
    story_id: Number(rows[0].story_id),
    moral_id: Number(rows[0].moral_id),
    source: rows[0].source,
    puzzle_id: Number(rows[0].puzzle_id),
    display_order: Number(rows[0].display_order),
    assigned_at: rows[0].assigned_at,
    puzzle: detail,
  };
}

async function unassignPuzzle(assignmentId) {
  const { rows } = await db.query(
    `SELECT id, source, puzzle_id FROM moral_puzzle_assignments WHERE id = $1`,
    [Number(assignmentId)]
  );
  const row = rows[0];
  if (!row) return null;

  await db.query(`DELETE FROM moral_puzzle_assignments WHERE id = $1`, [row.id]);
  await refreshUsedFlag(row.source, row.puzzle_id);

  if (row.source === 'gm') {
    const still = await db.query(
      `SELECT 1 FROM moral_puzzle_assignments WHERE source = 'gm' AND puzzle_id = $1`,
      [row.puzzle_id]
    );
    if (!still.rows[0]) {
      await db.query(`UPDATE "3000_rated_puzzles" SET moral_id = NULL WHERE id = $1`, [
        row.puzzle_id,
      ]);
    }
  }

  return { id: row.id, source: row.source, puzzle_id: Number(row.puzzle_id) };
}

module.exports = {
  upsertChesscomRandomPuzzle,
  mapChesscomRow,
  listAssignments,
  assignPuzzle,
  unassignPuzzle,
  loadPuzzleDetails,
  refreshUsedFlag,
};
