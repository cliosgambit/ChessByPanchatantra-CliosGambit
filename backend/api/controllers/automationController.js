const db = require('../config/database');
const fetch = (...args) => import('node-fetch').then(mod => mod.default(...args));

function formatDate(date) {
  // YYYY-MM-DD
  return date.toISOString().slice(0, 10);
}

function isToday(dateStr) {
  const today = new Date();
  const d = new Date(dateStr);
  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
}

exports.autoCompleteActivityTracker = async (req, res) => {
  try {
    // 1. Fetch all players with activity_tracker
    const { rows: players } = await db.query('SELECT "Chess_com_ID", "activity_tracker" FROM players WHERE "Chess_com_ID" IS NOT NULL AND "Chess_com_ID" != \'\'');
    let updatedCount = 0;
    let errors = [];
    for (const player of players) {
      if (!player.activity_tracker) continue;
      let tracker = typeof player.activity_tracker === 'string' ? JSON.parse(player.activity_tracker) : player.activity_tracker;
      let needsUpdate = false;
      for (const dateKey of Object.keys(tracker)) {
        const entry = tracker[dateKey];
        if (entry.lock === false) {
          // Fetch games for that month
          const [yyyy, mm, dd] = dateKey.split('-');
          const mmPadded = mm.padStart ? mm.padStart(2, '0') : ('0' + mm).slice(-2);
          try {
            const url = `https://api.chess.com/pub/player/${player.Chess_com_ID}/games/${yyyy}/${mmPadded}`;
            console.log('Fetching:', url);
            const response = await fetch(url);
            if (!response.ok) {
              const text = await response.text();
              console.error('Fetch failed:', response.status, text);
              throw new Error('Chess.com API error');
            }
            const data = await response.json();
            const games = (data.games || []).filter(g => g.end_time);
            // Filter games for this date and (optionally) only rated games
            const gamesOnDate = games.filter(g => {
              const gameDate = new Date(g.end_time * 1000);
              return formatDate(gameDate) === dateKey && g.rated;
            });
            if (gamesOnDate.length === 0) {
              // No games for this date
              entry.total_games = 0;
              entry.types = { Blitz: {}, Rapid: {} };
              if (!isToday(dateKey)) entry.lock = true;
              needsUpdate = true;
            } else {
              let blitzRatings = [], rapidRatings = [];
              gamesOnDate.forEach(g => {
                if (g.time_class === 'blitz') {
                  if (g.white?.username?.toLowerCase() === player.Chess_com_ID.toLowerCase()) blitzRatings.push(g.white.rating);
                  else if (g.black?.username?.toLowerCase() === player.Chess_com_ID.toLowerCase()) blitzRatings.push(g.black.rating);
                }
                if (g.time_class === 'rapid') {
                  if (g.white?.username?.toLowerCase() === player.Chess_com_ID.toLowerCase()) rapidRatings.push(g.white.rating);
                  else if (g.black?.username?.toLowerCase() === player.Chess_com_ID.toLowerCase()) rapidRatings.push(g.black.rating);
                }
              });
              entry.total_games = gamesOnDate.length;
              entry.types = {
                Blitz: {
                  ratings: blitzRatings,
                  last_rating: blitzRatings.length ? blitzRatings[blitzRatings.length - 1] : null
                },
                Rapid: {
                  ratings: rapidRatings,
                  last_rating: rapidRatings.length ? rapidRatings[rapidRatings.length - 1] : null
                }
              };
              if (!isToday(dateKey)) entry.lock = true;
              needsUpdate = true;
            }
          } catch (err) {
            errors.push({ player: player.Chess_com_ID, date: dateKey, error: err.message });
          }
        }
      }
      if (needsUpdate) {
        await db.query('UPDATE players SET activity_tracker = $1 WHERE "Chess_com_ID" = $2', [JSON.stringify(tracker), player.Chess_com_ID]);
        updatedCount++;
      }
    }
    res.json({ message: 'Automation complete', updatedCount, errors });
  } catch (err) {
    console.error('Automation error:', err);
    res.status(500).json({ error: 'Automation error', details: err.message });
  }
};

exports.testSingleFetchAndSave = async (req, res) => {
  const debug = [];
  try {
    const { id, date } = req.body;
    debug.push({ step: 'input', id, date });
    if (!id || !date) return res.status(400).json({ error: 'Missing id or date', debug });
    // Fetch player
    debug.push({ step: 'db_query', query: 'SELECT "activity_tracker" FROM players WHERE "Chess_com_ID" = $1', params: [id] });
    const { rows } = await db.query('SELECT "activity_tracker" FROM players WHERE "Chess_com_ID" = $1', [id]);
    debug.push({ step: 'db_result', rows });
    if (!rows.length) return res.status(404).json({ error: 'Player not found', debug });
    let tracker = typeof rows[0].activity_tracker === 'string' ? JSON.parse(rows[0].activity_tracker) : rows[0].activity_tracker;
    if (!tracker[date]) return res.status(404).json({ error: 'Date not found in activity_tracker', debug });
    const [yyyy, mm, dd] = date.split('-');
    const mmPadded = mm.padStart ? mm.padStart(2, '0') : ('0' + mm).slice(-2);
    let error = null;
    try {
      const url = `https://api.chess.com/pub/player/${id}/games/${yyyy}/${mmPadded}`;
      debug.push({ step: 'fetch_url', url });
      const response = await fetch(url);
      debug.push({ step: 'fetch_response', status: response.status });
      if (!response.ok) {
        const text = await response.text();
        error = `Fetch failed: ${response.status} ${text}`;
        debug.push({ step: 'fetch_error', error });
        throw new Error(error);
      }
      const data = await response.json();
      debug.push({ step: 'fetch_data', games: data.games ? data.games.length : 0 });
      const games = (data.games || []).filter(g => g.end_time);
      const gamesOnDate = games.filter(g => {
        const gameDate = new Date(g.end_time * 1000);
        return formatDate(gameDate) === date && g.rated;
      });
      debug.push({ step: 'games_on_date', count: gamesOnDate.length });
      if (gamesOnDate.length === 0) {
        tracker[date].total_games = 0;
        tracker[date].types = { Blitz: {}, Rapid: {} };
        if (!isToday(date)) tracker[date].lock = true;
      } else {
        let blitzRatings = [], rapidRatings = [];
        gamesOnDate.forEach(g => {
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
            last_rating: blitzRatings.length ? blitzRatings[blitzRatings.length - 1] : null
          },
          Rapid: {
            ratings: rapidRatings,
            last_rating: rapidRatings.length ? rapidRatings[rapidRatings.length - 1] : null
          }
        };
        if (!isToday(date)) tracker[date].lock = true;
      }
      debug.push({ step: 'db_update', tracker_date: tracker[date] });
      await db.query('UPDATE players SET activity_tracker = $1 WHERE "Chess_com_ID" = $2', [JSON.stringify(tracker), id]);
    } catch (err) {
      error = err.message;
      debug.push({ step: 'catch_error', error });
    }
    res.json({ updated: tracker[date], error, debug });
  } catch (err) {
    res.status(500).json({ error: err.message, debug });
  }
}; 