const db = require('../config/database');
const fetch = (...args) => import('node-fetch').then((mod) => mod.default(...args));

const CHESS_API = 'https://api.chess.com';
const BLOCKED_STATUSES = new Set(['not_found', 'blocked']);

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function isToday(dateStr) {
  const today = new Date();
  const d = new Date(dateStr);
  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
}

function parseTracker(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function lockAllUnlockedDates(tracker, reason) {
  for (const dateKey of Object.keys(tracker)) {
    const entry = tracker[dateKey];
    if (!entry || typeof entry !== 'object') continue;
    if (entry.lock === false) {
      entry.lock = true;
      entry.fetch_error = reason;
    }
  }
  return tracker;
}

async function markPlayerChessComBlocked(chessComId, status, errorMessage, tracker) {
  const lockedTracker = lockAllUnlockedDates(tracker, status);
  await db.query(
    `UPDATE players SET
      activity_tracker = $1,
      chess_com_fetch_status = $2,
      chess_com_fetch_error = $3,
      chess_com_fetch_blocked_at = NOW()
     WHERE "Chess_com_ID" = $4`,
    [JSON.stringify(lockedTracker), status, errorMessage, chessComId]
  );
  console.log(`[activity-tracker] Marked ${chessComId} as ${status}: ${errorMessage}`);
}

async function verifyChessComPlayerExists(chessComId) {
  const response = await fetch(`${CHESS_API}/pub/player/${encodeURIComponent(chessComId)}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'CLIO-ChessAcademy/1.0' },
  });
  if (response.status === 404) {
    const text = await response.text();
    return { exists: false, message: text || 'Chess.com ID not found.' };
  }
  if (!response.ok) {
    const text = await response.text();
    return { exists: null, message: `Chess.com API error (${response.status}): ${text.slice(0, 120)}` };
  }
  return { exists: true };
}

exports.autoCompleteActivityTracker = async (req, res) => {
  try {
    const { rows: players } = await db.query(
      `SELECT "Chess_com_ID", activity_tracker, chess_com_fetch_status
       FROM players
       WHERE "Chess_com_ID" IS NOT NULL
         AND "Chess_com_ID" != ''
         AND (chess_com_fetch_status IS NULL OR chess_com_fetch_status NOT IN ('not_found', 'blocked'))`
    );

    let updatedCount = 0;
    let skippedBlocked = 0;
    const errors = [];

    for (const player of players) {
      if (!player.activity_tracker) continue;

      let tracker = parseTracker(player.activity_tracker);
      let needsUpdate = false;
      let playerSkipped = false;

      const verification = await verifyChessComPlayerExists(player.Chess_com_ID);
      if (verification.exists === false) {
        await markPlayerChessComBlocked(
          player.Chess_com_ID,
          'not_found',
          'Chess.com ID not found.',
          tracker
        );
        errors.push({
          player: player.Chess_com_ID,
          error: 'Chess.com ID not found — marked and skipped until retry.',
        });
        continue;
      }

      if (verification.exists === null) {
        errors.push({
          player: player.Chess_com_ID,
          error: verification.message,
        });
        continue;
      }

      for (const dateKey of Object.keys(tracker)) {
        const entry = tracker[dateKey];
        if (!entry || entry.lock !== false) continue;

        const [yyyy, mm] = dateKey.split('-');
        const mmPadded = mm.padStart ? mm.padStart(2, '0') : `0${mm}`.slice(-2);

        try {
          const url = `${CHESS_API}/pub/player/${encodeURIComponent(player.Chess_com_ID)}/games/${yyyy}/${mmPadded}`;
          console.log('Fetching:', url);
          const response = await fetch(url, {
            headers: { Accept: 'application/json', 'User-Agent': 'CLIO-ChessAcademy/1.0' },
          });

          if (response.status === 404) {
            await markPlayerChessComBlocked(
              player.Chess_com_ID,
              'not_found',
              'Chess.com ID not found.',
              tracker
            );
            errors.push({
              player: player.Chess_com_ID,
              date: dateKey,
              error: 'Chess.com ID not found — marked and skipped until retry.',
            });
            playerSkipped = true;
            break;
          }

          if (!response.ok) {
            const text = await response.text();
            console.error('Fetch failed:', response.status, text);
            throw new Error(`Chess.com API error (${response.status})`);
          }

          const data = await response.json();
          const games = (data.games || []).filter((g) => g.end_time);
          const gamesOnDate = games.filter((g) => {
            const gameDate = new Date(g.end_time * 1000);
            return formatDate(gameDate) === dateKey && g.rated;
          });

          if (gamesOnDate.length === 0) {
            entry.total_games = 0;
            entry.types = { Blitz: {}, Rapid: {} };
            if (!isToday(dateKey)) entry.lock = true;
            needsUpdate = true;
          } else {
            const blitzRatings = [];
            const rapidRatings = [];
            gamesOnDate.forEach((g) => {
              if (g.time_class === 'blitz') {
                if (g.white?.username?.toLowerCase() === player.Chess_com_ID.toLowerCase()) {
                  blitzRatings.push(g.white.rating);
                } else if (g.black?.username?.toLowerCase() === player.Chess_com_ID.toLowerCase()) {
                  blitzRatings.push(g.black.rating);
                }
              }
              if (g.time_class === 'rapid') {
                if (g.white?.username?.toLowerCase() === player.Chess_com_ID.toLowerCase()) {
                  rapidRatings.push(g.white.rating);
                } else if (g.black?.username?.toLowerCase() === player.Chess_com_ID.toLowerCase()) {
                  rapidRatings.push(g.black.rating);
                }
              }
            });
            entry.total_games = gamesOnDate.length;
            entry.types = {
              Blitz: {
                ratings: blitzRatings,
                last_rating: blitzRatings.length ? blitzRatings[blitzRatings.length - 1] : null,
              },
              Rapid: {
                ratings: rapidRatings,
                last_rating: rapidRatings.length ? rapidRatings[rapidRatings.length - 1] : null,
              },
            };
            if (!isToday(dateKey)) entry.lock = true;
            needsUpdate = true;
          }
        } catch (err) {
          errors.push({ player: player.Chess_com_ID, date: dateKey, error: err.message });
        }
      }

      if (playerSkipped) continue;

      if (needsUpdate) {
        await db.query('UPDATE players SET activity_tracker = $1 WHERE "Chess_com_ID" = $2', [
          JSON.stringify(tracker),
          player.Chess_com_ID,
        ]);
        updatedCount += 1;
      }
    }

    const { rows: blockedRows } = await db.query(
      `SELECT COUNT(*)::int AS count FROM players WHERE chess_com_fetch_status IN ('not_found', 'blocked')`
    );
    skippedBlocked = blockedRows[0]?.count || 0;

    res.json({
      message: 'Automation complete',
      updatedCount,
      skippedBlocked,
      errors,
    });
  } catch (err) {
    console.error('Automation error:', err);
    res.status(500).json({ error: 'Automation error', details: err.message });
  }
};

exports.clearChessComFetchBlock = async (req, res) => {
  const chessComId = req.params.chessComId || req.params.id;
  if (!chessComId?.trim()) {
    return res.status(400).json({ error: 'Chess.com ID is required.' });
  }

  try {
    const { rows } = await db.query(
      `UPDATE players SET
        chess_com_fetch_status = NULL,
        chess_com_fetch_error = NULL,
        chess_com_fetch_blocked_at = NULL
       WHERE "Chess_com_ID" = $1
       RETURNING "Chess_com_ID", "Player_Name"`,
      [chessComId.trim()]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    res.json({
      ok: true,
      message: `Chess.com fetch block cleared for ${rows[0].Chess_com_ID}. Automation will retry on next run.`,
      player: rows[0],
    });
  } catch (err) {
    console.error('Clear chess.com block error:', err);
    res.status(500).json({ error: 'Failed to clear fetch block.' });
  }
};

exports.testSingleFetchAndSave = async (req, res) => {
  const debug = [];
  try {
    const { id, date, force = false } = req.body;
    debug.push({ step: 'input', id, date, force });
    if (!id || !date) return res.status(400).json({ error: 'Missing id or date', debug });

    const { rows } = await db.query(
      'SELECT activity_tracker, chess_com_fetch_status FROM players WHERE "Chess_com_ID" = $1',
      [id]
    );
    debug.push({ step: 'db_result', rows });
    if (!rows.length) return res.status(404).json({ error: 'Player not found', debug });

    if (!force && BLOCKED_STATUSES.has(rows[0].chess_com_fetch_status)) {
      return res.status(409).json({
        error: `Player is marked as ${rows[0].chess_com_fetch_status}. Send force: true to retry.`,
        status: rows[0].chess_com_fetch_status,
        debug,
      });
    }

    let tracker = parseTracker(rows[0].activity_tracker);
    if (!tracker[date]) return res.status(404).json({ error: 'Date not found in activity_tracker', debug });

    const [yyyy, mm] = date.split('-');
    const mmPadded = mm.padStart ? mm.padStart(2, '0') : `0${mm}`.slice(-2);
    let error = null;

    try {
      const url = `${CHESS_API}/pub/player/${encodeURIComponent(id)}/games/${yyyy}/${mmPadded}`;
      debug.push({ step: 'fetch_url', url });
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'CLIO-ChessAcademy/1.0' },
      });
      debug.push({ step: 'fetch_response', status: response.status });

      if (response.status === 404) {
        await markPlayerChessComBlocked(id, 'not_found', 'Chess.com ID not found.', tracker);
        return res.status(404).json({
          error: 'Chess.com ID not found — player marked and blocked until retry.',
          debug,
        });
      }

      if (!response.ok) {
        const text = await response.text();
        error = `Fetch failed: ${response.status} ${text}`;
        debug.push({ step: 'fetch_error', error });
        throw new Error(error);
      }

      const data = await response.json();
      debug.push({ step: 'fetch_data', games: data.games ? data.games.length : 0 });
      const games = (data.games || []).filter((g) => g.end_time);
      const gamesOnDate = games.filter((g) => {
        const gameDate = new Date(g.end_time * 1000);
        return formatDate(gameDate) === date && g.rated;
      });
      debug.push({ step: 'games_on_date', count: gamesOnDate.length });

      if (gamesOnDate.length === 0) {
        tracker[date].total_games = 0;
        tracker[date].types = { Blitz: {}, Rapid: {} };
        if (!isToday(date)) tracker[date].lock = true;
      } else {
        const blitzRatings = [];
        const rapidRatings = [];
        gamesOnDate.forEach((g) => {
          if (g.time_class === 'blitz') {
            if (g.white?.username?.toLowerCase() === id.toLowerCase()) blitzRatings.push(g.white.rating);
            else if (g.black?.username?.toLowerCase() === id.toLowerCase()) blitzRatings.push(g.black.rating);
          }
          if (g.time_class === 'rapid') {
            if (g.white?.username?.toLowerCase() === id.toLowerCase()) rapidRatings.push(g.white.rating);
            else if (g.black?.username?.toLowerCase() === id.toLowerCase()) rapidRatings.push(g.black.rating);
          }
        });
        tracker[date].total_games = gamesOnDate.length;
        tracker[date].types = {
          Blitz: {
            ratings: blitzRatings,
            last_rating: blitzRatings.length ? blitzRatings[blitzRatings.length - 1] : null,
          },
          Rapid: {
            ratings: rapidRatings,
            last_rating: rapidRatings.length ? rapidRatings[rapidRatings.length - 1] : null,
          },
        };
        if (!isToday(date)) tracker[date].lock = true;
      }

      await db.query(
        `UPDATE players SET
          activity_tracker = $1,
          chess_com_fetch_status = NULL,
          chess_com_fetch_error = NULL,
          chess_com_fetch_blocked_at = NULL
         WHERE "Chess_com_ID" = $2`,
        [JSON.stringify(tracker), id]
      );
      debug.push({ step: 'db_update', tracker_date: tracker[date] });
    } catch (err) {
      error = err.message;
      debug.push({ step: 'catch_error', error });
    }

    res.json({ updated: tracker[date], error, debug });
  } catch (err) {
    res.status(500).json({ error: err.message, debug });
  }
};
