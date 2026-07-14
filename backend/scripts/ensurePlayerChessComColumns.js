const { addColumnIfNotExists } = require('../api/config/database');

async function ensurePlayerChessComColumns() {
  addColumnIfNotExists('players', 'tactics_highest', 'tactics_highest INTEGER');
  addColumnIfNotExists('players', 'puzzle_rush_best', 'puzzle_rush_best INTEGER');
  addColumnIfNotExists('players', 'chess_profile_url', 'chess_profile_url TEXT');
  addColumnIfNotExists('players', 'chess_country_url', 'chess_country_url TEXT');
  addColumnIfNotExists('players', 'chess_com_fetch_status', 'chess_com_fetch_status TEXT');
  addColumnIfNotExists('players', 'chess_com_fetch_error', 'chess_com_fetch_error TEXT');
  addColumnIfNotExists('players', 'chess_com_fetch_blocked_at', 'chess_com_fetch_blocked_at TEXT');
  console.log('✅ players chess.com columns ready');
}

module.exports = { ensurePlayerChessComColumns };
