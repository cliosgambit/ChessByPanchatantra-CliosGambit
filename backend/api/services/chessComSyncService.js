const db = require('../config/database');
const {
  parseProfile,
  parseStats,
  parseRawGame,
  archiveMetaFromUrl,
  mapDbGameRow,
  mapDbProfileRow,
  mapDbMoveRow,
} = require('./chessComParser');
const { parsePgnToMoves } = require('./chessComPgnParser');

const fetch = (...args) => import('node-fetch').then((mod) => mod.default(...args));
const CHESS_API = 'https://api.chess.com';
const ARCHIVE_DELAY_MS = 250;
const GAME_UPSERT_CHUNK = 20;
const MOVE_UPSERT_CHUNK = 40;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function archiveKey(year, month) {
  return `${year}-${month}`;
}

function currentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

async function getSyncedArchiveMap(chessComId) {
  const { rows } = await db.query(
    `SELECT archive_year, archive_month, game_count, last_fetched_at
     FROM chess_com_archives
     WHERE chess_com_id = $1`,
    [chessComId]
  );
  const map = new Map();
  for (const row of rows) {
    map.set(archiveKey(row.archive_year, row.archive_month), row);
  }
  return map;
}

function shouldFetchArchiveMonth(meta, syncedArchives, { forceFull = false } = {}) {
  if (forceFull) return true;
  if (!meta.year || !meta.monthNum) return true;

  const key = archiveKey(meta.year, meta.monthNum);
  if (!syncedArchives.has(key)) return true;

  const { year, month } = currentYearMonth();
  // Current month may still have new games played today
  return meta.year === year && meta.monthNum === month;
}

async function fetchChessJson(apiPath) {
  const response = await fetch(`${CHESS_API}${apiPath}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'CLIO-ChessAcademy/1.0' },
  });
  if (response.status === 404) return { notFound: true };
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Chess.com API error (${response.status}): ${text.slice(0, 120)}`);
  }
  return response.json();
}

async function upsertProfile(chessComId, profile, stats) {
  await db.query(
    `INSERT INTO chess_com_profiles (
      chess_com_id, username, name, avatar_url, title, country_url, country_code, location,
      followers, league, membership_status, verified, is_streamer, twitch_url, is_online,
      last_online_at, joined_at, profile_url, profile_json, stats_json,
      rapid_rating, rapid_best, blitz_rating, blitz_best, bullet_rating, bullet_best,
      daily_rating, daily_best, puzzle_rush_best, tactics_highest,
      last_synced_at, sync_status, sync_error, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
      $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,NOW(),'syncing',NULL,NOW()
    )
    ON CONFLICT (chess_com_id) DO UPDATE SET
      username = EXCLUDED.username,
      name = EXCLUDED.name,
      avatar_url = EXCLUDED.avatar_url,
      title = EXCLUDED.title,
      country_url = EXCLUDED.country_url,
      country_code = EXCLUDED.country_code,
      location = EXCLUDED.location,
      followers = EXCLUDED.followers,
      league = EXCLUDED.league,
      membership_status = EXCLUDED.membership_status,
      verified = EXCLUDED.verified,
      is_streamer = EXCLUDED.is_streamer,
      twitch_url = EXCLUDED.twitch_url,
      is_online = EXCLUDED.is_online,
      last_online_at = EXCLUDED.last_online_at,
      joined_at = EXCLUDED.joined_at,
      profile_url = EXCLUDED.profile_url,
      profile_json = EXCLUDED.profile_json,
      stats_json = EXCLUDED.stats_json,
      rapid_rating = EXCLUDED.rapid_rating,
      rapid_best = EXCLUDED.rapid_best,
      blitz_rating = EXCLUDED.blitz_rating,
      blitz_best = EXCLUDED.blitz_best,
      bullet_rating = EXCLUDED.bullet_rating,
      bullet_best = EXCLUDED.bullet_best,
      daily_rating = EXCLUDED.daily_rating,
      daily_best = EXCLUDED.daily_best,
      puzzle_rush_best = EXCLUDED.puzzle_rush_best,
      tactics_highest = EXCLUDED.tactics_highest,
      sync_status = 'syncing',
      sync_error = NULL,
      updated_at = NOW()`,
    [
      chessComId,
      profile.username,
      profile.name,
      profile.avatar,
      profile.title,
      profile.country,
      profile.countryCode,
      profile.location,
      profile.followers,
      profile.league,
      profile.status,
      profile.verified,
      profile.isStreamer,
      profile.twitchUrl,
      profile.isOnline,
      profile.lastOnlineAt,
      profile.joinedAt,
      profile.profileUrl,
      JSON.stringify(profile),
      JSON.stringify(stats),
      stats.rapid?.current ?? null,
      stats.rapid?.best ?? null,
      stats.blitz?.current ?? null,
      stats.blitz?.best ?? null,
      stats.bullet?.current ?? null,
      stats.bullet?.best ?? null,
      stats.daily?.current ?? null,
      stats.daily?.best ?? null,
      stats.puzzleRush ?? null,
      stats.puzzleScore ?? null,
    ]
  );

  // Keep legacy players table in sync for other parts of the app
  await db.query(
    `INSERT INTO players ("Chess_com_ID", "Player_Name", rapid_rating, rapid_best, blitz_rating, blitz_best,
      bullet_rating, bullet_best, tactics_highest, puzzle_rush_best, chess_last_synced_at, chess_profile_url, chess_country_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),$11,$12)
     ON CONFLICT ("Chess_com_ID") DO UPDATE SET
       "Player_Name" = EXCLUDED."Player_Name",
       rapid_rating = EXCLUDED.rapid_rating,
       rapid_best = EXCLUDED.rapid_best,
       blitz_rating = EXCLUDED.blitz_rating,
       blitz_best = EXCLUDED.blitz_best,
       bullet_rating = EXCLUDED.bullet_rating,
       bullet_best = EXCLUDED.bullet_best,
       tactics_highest = EXCLUDED.tactics_highest,
       puzzle_rush_best = EXCLUDED.puzzle_rush_best,
       chess_last_synced_at = NOW(),
       chess_profile_url = EXCLUDED.chess_profile_url,
       chess_country_url = EXCLUDED.chess_country_url`,
    [
      profile.username,
      profile.name || profile.username,
      stats.rapid?.current ?? null,
      stats.rapid?.best ?? null,
      stats.blitz?.current ?? null,
      stats.blitz?.best ?? null,
      stats.bullet?.current ?? null,
      stats.bullet?.best ?? null,
      stats.puzzleScore ?? null,
      stats.puzzleRush ?? null,
      profile.profileUrl,
      profile.country,
    ]
  ).catch(() => {
    // players row may not exist yet — ignore
  });
}

async function upsertGamesBatch(chessComId, parsedGames) {
  const valid = parsedGames.filter((g) => g.chess_com_uuid && g.pgn);
  if (!valid.length) return 0;

  let upserted = 0;

  for (let offset = 0; offset < valid.length; offset += GAME_UPSERT_CHUNK) {
    const chunk = valid.slice(offset, offset + GAME_UPSERT_CHUNK);
    const valueRows = [];
    const params = [];
    let paramIndex = 1;

    for (const parsed of chunk) {
      valueRows.push(
        `($${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},NOW())`
      );
      params.push(
        parsed.chess_com_uuid,
        chessComId,
        parsed.game_url,
        parsed.played_at,
        parsed.time_class,
        parsed.time_control,
        parsed.time_control_label,
        parsed.rated,
        parsed.pgn,
        parsed.white_username,
        parsed.black_username,
        parsed.white_rating,
        parsed.black_rating,
        parsed.white_result,
        parsed.black_result,
        parsed.white_accuracy,
        parsed.black_accuracy,
        parsed.white_country_code,
        parsed.black_country_code,
        parsed.white_score,
        parsed.black_score,
        parsed.self_color,
        parsed.self_result,
        parsed.self_result_type,
        parsed.result_notation,
        parsed.opponent_username,
        parsed.move_count,
        JSON.stringify(parsed.game_json)
      );
    }

    await db.query(
      `INSERT INTO chess_com_games (
        chess_com_uuid, chess_com_id, game_url, played_at, time_class, time_control, time_control_label,
        rated, pgn, white_username, black_username, white_rating, black_rating,
        white_result, black_result, white_accuracy, black_accuracy,
        white_country_code, black_country_code, white_score, black_score,
        self_color, self_result, self_result_type, result_notation, opponent_username,
        move_count, game_json, synced_at
      ) VALUES ${valueRows.join(', ')}
      ON CONFLICT (chess_com_uuid) DO UPDATE SET
        game_url = EXCLUDED.game_url,
        played_at = EXCLUDED.played_at,
        white_accuracy = EXCLUDED.white_accuracy,
        black_accuracy = EXCLUDED.black_accuracy,
        pgn = EXCLUDED.pgn,
        game_json = EXCLUDED.game_json,
        synced_at = NOW()`,
      params
    );
    upserted += chunk.length;
    await saveMovesForGames(chessComId, chunk);
  }

  return upserted;
}

async function replaceMovesForGame(chessComUuid, chessComId, pgn) {
  const moves = parsePgnToMoves(pgn);
  await db.query('DELETE FROM chess_com_moves WHERE chess_com_uuid = $1', [chessComUuid]);
  if (!moves.length) return 0;

  let saved = 0;

  for (let offset = 0; offset < moves.length; offset += MOVE_UPSERT_CHUNK) {
    const chunk = moves.slice(offset, offset + MOVE_UPSERT_CHUNK);
    const valueRows = [];
    const params = [chessComUuid, chessComId];
    let paramIndex = 3;

    for (const move of chunk) {
      valueRows.push(
        `($1,$2,$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++})`
      );
      params.push(
        move.ply,
        move.move_number,
        move.color,
        move.san,
        move.from_square,
        move.to_square,
        move.piece,
        move.captured,
        move.promotion,
        move.fen_before,
        move.fen_after,
        move.is_check,
        move.is_mate,
        move.is_capture,
        move.is_castle,
        move.is_en_passant,
        move.is_promotion
      );
    }

    await db.query(
      `INSERT INTO chess_com_moves (
        chess_com_uuid, chess_com_id, ply, move_number, color, san,
        from_square, to_square, piece, captured, promotion,
        fen_before, fen_after, is_check, is_mate, is_capture,
        is_castle, is_en_passant, is_promotion
      ) VALUES ${valueRows.join(', ')}`,
      params
    );
    saved += chunk.length;
  }

  return saved;
}

async function saveMovesForGames(chessComId, parsedGames) {
  let total = 0;
  for (const game of parsedGames) {
    if (!game.chess_com_uuid || !game.pgn) continue;
    total += await replaceMovesForGame(game.chess_com_uuid, chessComId, game.pgn);
  }
  return total;
}

async function backfillMissingMoves(chessComId, limit = 100) {
  const { rows } = await db.query(
    `SELECT g.chess_com_uuid, g.pgn
     FROM chess_com_games g
     WHERE g.chess_com_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM chess_com_moves m WHERE m.chess_com_uuid = g.chess_com_uuid
       )
     ORDER BY g.played_at DESC NULLS LAST
     LIMIT $2`,
    [chessComId, limit]
  );

  if (!rows.length) return 0;

  const games = rows.map((row) => ({
    chess_com_uuid: row.chess_com_uuid,
    pgn: row.pgn,
  }));
  return saveMovesForGames(chessComId, games);
}

async function upsertGame(chessComId, parsed) {
  return upsertGamesBatch(chessComId, [parsed]) > 0;
}

async function upsertArchive(chessComId, archiveUrl, meta, gameCount) {
  if (!meta.year || !meta.monthNum) return;
  await db.query(
    `INSERT INTO chess_com_archives (chess_com_id, archive_year, archive_month, archive_url, game_count, last_fetched_at)
     VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT (chess_com_id, archive_year, archive_month) DO UPDATE SET
       archive_url = EXCLUDED.archive_url,
       game_count = EXCLUDED.game_count,
       last_fetched_at = NOW()`,
    [chessComId, meta.year, meta.monthNum, archiveUrl, gameCount]
  );
}

async function upsertClubs(chessComId, clubs) {
  await db.query('DELETE FROM chess_com_clubs WHERE chess_com_id = $1', [chessComId]);
  for (const club of clubs) {
    await db.query(
      `INSERT INTO chess_com_clubs (chess_com_id, name, url, icon_url, member_count, synced_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (chess_com_id, name) DO UPDATE SET
         url = EXCLUDED.url,
         icon_url = EXCLUDED.icon_url,
         member_count = EXCLUDED.member_count,
         synced_at = NOW()`,
      [chessComId, club.name, club.url, club.icon, club.members]
    );
  }
}

async function syncPlayerFromChessCom(username, { forceFull = false } = {}) {
  const safeName = username.trim();
  const profileRaw = await fetchChessJson(`/pub/player/${encodeURIComponent(safeName)}`);
  if (profileRaw?.notFound) {
    throw new Error('Chess.com player not found.');
  }

  const apiUsername = profileRaw.username || safeName;
  const chessComId = apiUsername.toLowerCase();

  const [statsRaw, archivesRaw, clubsRaw, syncedArchives] = await Promise.all([
    fetchChessJson(`/pub/player/${encodeURIComponent(apiUsername)}/stats`),
    fetchChessJson(`/pub/player/${encodeURIComponent(apiUsername)}/games/archives`),
    fetchChessJson(`/pub/player/${encodeURIComponent(apiUsername)}/clubs`),
    getSyncedArchiveMap(apiUsername.toLowerCase()),
  ]);

  const profile = parseProfile(profileRaw, apiUsername);
  const stats = parseStats(statsRaw?.notFound ? {} : statsRaw);

  await upsertProfile(chessComId, profile, stats);

  const clubs = (clubsRaw?.clubs || []).map((club) => ({
    name: club.name,
    url: club.url,
    icon: club.icon || null,
    members: club.members ?? null,
  }));
  await upsertClubs(chessComId, clubs);

  const archiveUrls = archivesRaw?.archives || [];
  let gamesUpserted = 0;
  let archivesFetched = 0;
  let archivesSkipped = 0;

  for (const archiveUrl of archiveUrls) {
    const meta = archiveMetaFromUrl(archiveUrl);

    if (!shouldFetchArchiveMonth(meta, syncedArchives, { forceFull })) {
      archivesSkipped += 1;
      continue;
    }

    const monthData = await fetchChessJson(meta.path);
    const games = monthData?.games || [];
    const parsedGames = [];

    for (const game of games) {
      if (!game.uuid || !game.pgn) continue;
      parsedGames.push(parseRawGame(game, apiUsername));
    }

    gamesUpserted += await upsertGamesBatch(chessComId, parsedGames);
    await upsertArchive(chessComId, archiveUrl, meta, games.length);
    archivesFetched += 1;
    await sleep(ARCHIVE_DELAY_MS);
  }

  const { rows: countRows } = await db.query(
    'SELECT COUNT(*)::int AS count FROM chess_com_games WHERE chess_com_id = $1',
    [chessComId]
  );

  await db.query(
    `UPDATE chess_com_profiles SET
      total_games_estimate = $2,
      last_synced_at = NOW(),
      sync_status = 'complete',
      sync_error = NULL,
      updated_at = NOW()
     WHERE chess_com_id = $1`,
    [chessComId, countRows[0].count]
  );

  console.log(
    `[chess-com sync] ${apiUsername}: fetched ${archivesFetched} month(s), skipped ${archivesSkipped}, upserted ${gamesUpserted} game(s)`
  );

  const movesBackfilled = await backfillMissingMoves(chessComId);
  if (movesBackfilled > 0) {
    console.log(`[chess-com sync] ${apiUsername}: backfilled ${movesBackfilled} move(s) from existing games`);
  }

  return {
    chessComId,
    username: apiUsername,
    incremental: !forceFull,
    archivesProcessed: archivesFetched,
    archivesSkipped,
    gamesUpserted,
    movesBackfilled,
    totalGamesInDb: countRows[0].count,
  };
}

async function getProfileRow(chessComId) {
  const { rows } = await db.query('SELECT * FROM chess_com_profiles WHERE chess_com_id = $1', [
    chessComId.toLowerCase(),
  ]);
  return rows[0] || null;
}

async function needsSync(chessComId, maxAgeHours = 24) {
  const row = await getProfileRow(chessComId);
  if (!row || row.sync_status !== 'complete' || !row.last_synced_at) return true;
  const ageMs = Date.now() - new Date(row.last_synced_at).getTime();
  if (ageMs > maxAgeHours * 60 * 60 * 1000) return true;

  // New calendar month since last sync — fetch only the new month on next run
  const lastSync = new Date(row.last_synced_at);
  const now = new Date();
  return (
    lastSync.getFullYear() !== now.getFullYear() || lastSync.getMonth() !== now.getMonth()
  );
}

async function getBundle(username, { forceSync = false } = {}) {
  const chessComId = username.trim().toLowerCase();

  if (forceSync || (await needsSync(chessComId))) {
    try {
      await syncPlayerFromChessCom(username);
    } catch (err) {
      const existing = await getProfileRow(chessComId);
      if (!existing) throw err;
    }
  }

  const profileRow = await getProfileRow(chessComId);
  if (!profileRow) {
    return { linked: false, profile: null, error: 'Player not synced. Try syncing again.' };
  }

  const mapped = mapDbProfileRow(profileRow);
  const [gamesRes, archivesRes, clubsRes, monthsRes] = await Promise.all([
    getRecentGames(chessComId, 25),
    getArchives(chessComId),
    getClubs(chessComId),
    getMonthlyGames(chessComId, 12),
  ]);

  return {
    linked: true,
    profile: mapped.profile,
    stats: mapped.stats,
    recentGames: gamesRes.games,
    totalGames: profileRow.total_games_estimate || gamesRes.total,
    archives: archivesRes,
    monthlyGames: monthsRes,
    clubs: clubsRes,
    lastSyncedAt: profileRow.last_synced_at,
    syncStatus: profileRow.sync_status,
    error: profileRow.sync_error,
  };
}

async function getRecentGames(chessComId, limit = 25) {
  const { rows } = await db.query(
    `SELECT * FROM chess_com_games
     WHERE chess_com_id = $1
     ORDER BY played_at DESC NULLS LAST
     LIMIT $2`,
    [chessComId.toLowerCase(), limit]
  );
  const { rows: countRows } = await db.query(
    'SELECT COUNT(*)::int AS count FROM chess_com_games WHERE chess_com_id = $1',
    [chessComId.toLowerCase()]
  );
  return {
    games: rows.map(mapDbGameRow),
    total: countRows[0]?.count || 0,
  };
}

async function getGameByUuid(chessComId, uuid) {
  const { rows } = await db.query(
    'SELECT * FROM chess_com_games WHERE chess_com_id = $1 AND chess_com_uuid = $2 LIMIT 1',
    [chessComId.toLowerCase(), uuid]
  );
  return rows[0] ? mapDbGameRow(rows[0]) : null;
}

async function getMovesForGame(chessComId, uuid) {
  const { rows } = await db.query(
    `SELECT * FROM chess_com_moves
     WHERE chess_com_id = $1 AND chess_com_uuid = $2
     ORDER BY ply ASC`,
    [chessComId.toLowerCase(), uuid]
  );
  return rows.map(mapDbMoveRow);
}

async function getArchives(chessComId) {
  const { rows } = await db.query(
    `SELECT archive_url, archive_year, archive_month, game_count
     FROM chess_com_archives
     WHERE chess_com_id = $1
     ORDER BY archive_year, archive_month`,
    [chessComId.toLowerCase()]
  );
  return rows.map((row) => {
    const monthIndex = row.archive_month - 1;
    return {
      url: row.archive_url,
      month: `${row.archive_year}-${String(row.archive_month).padStart(2, '0')}`,
      label: new Date(row.archive_year, monthIndex, 1).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
      gameCount: row.game_count,
    };
  });
}

async function getMonthlyGames(chessComId, maxMonths = 12) {
  const { rows: archiveRows } = await db.query(
    `SELECT archive_year, archive_month, archive_url, game_count
     FROM chess_com_archives
     WHERE chess_com_id = $1
     ORDER BY archive_year DESC, archive_month DESC
     LIMIT $2`,
    [chessComId.toLowerCase(), maxMonths]
  );

  const months = [];
  for (const archive of archiveRows) {
    const monthKey = `${archive.archive_year}-${String(archive.archive_month).padStart(2, '0')}`;
    const { rows: gameRows } = await db.query(
      `SELECT * FROM chess_com_games
       WHERE chess_com_id = $1
         AND EXTRACT(YEAR FROM played_at) = $2
         AND EXTRACT(MONTH FROM played_at) = $3
       ORDER BY played_at DESC`,
      [chessComId.toLowerCase(), archive.archive_year, archive.archive_month]
    );

    const monthIndex = archive.archive_month - 1;
    months.push({
      month: monthKey,
      label: new Date(archive.archive_year, monthIndex, 1).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
      archiveUrl: archive.archive_url,
      gameCount: archive.game_count || gameRows.length,
      games: gameRows.map(mapDbGameRow),
    });
  }

  return months;
}

async function getClubs(chessComId) {
  const { rows } = await db.query(
    'SELECT name, url, icon_url, member_count FROM chess_com_clubs WHERE chess_com_id = $1 ORDER BY name',
    [chessComId.toLowerCase()]
  );
  return rows.map((row) => ({
    name: row.name,
    url: row.url,
    icon: row.icon_url,
    members: row.member_count,
  }));
}

module.exports = {
  syncPlayerFromChessCom,
  getBundle,
  getRecentGames,
  getGameByUuid,
  getMovesForGame,
  getArchives,
  getMonthlyGames,
  getClubs,
  needsSync,
  backfillMissingMoves,
};
