const crypto = require('crypto');
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

const { runPool } = require('../../brilliance/utils/asyncPool');

const fetch = (...args) => import('node-fetch').then((mod) => mod.default(...args));
const CHESS_API = 'https://api.chess.com';
const ARCHIVE_FETCH_CONCURRENCY = 3;
const BULK_FETCH_CONCURRENCY = 10;
const RAW_INSERT_CHUNK = 50;
const PROFILE_SYNC_CONCURRENCY = 6;
const GAME_UPSERT_CHUNK = 100;
const MOVE_UPSERT_CHUNK = 40;
const QUICK_SYNC_RECENT_ARCHIVES = 3;
const PREVIEW_PGN_LIMIT = 12;
const DEFAULT_YESTERDAY_TZ = 'Asia/Kolkata';
const SYNC_CONCURRENCY = 4;

/** chessComId -> in-flight background sync promise */
const backgroundSyncs = new Map();
let yesterdaysSyncTask = null;

const GAME_LIST_COLUMNS = `
  chess_com_uuid, chess_com_id, game_url, played_at, time_class, time_control, time_control_label,
  rated, white_username, black_username, white_rating, black_rating,
  white_result, black_result, white_accuracy, black_accuracy,
  white_country_code, black_country_code, white_score, black_score,
  self_color, self_result, self_result_type, result_notation, opponent_username, move_count
`.replace(/\s+/g, ' ');

function gameListColumns(alias) {
  return GAME_LIST_COLUMNS.split(',')
    .map((col) => `${alias}.${col.trim()}`)
    .join(', ');
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

async function getExistingGameUuids(uuids) {
  if (!uuids.length) return new Set();
  const { rows } = await db.query(
    'SELECT chess_com_uuid FROM chess_com_games WHERE chess_com_uuid = ANY($1)',
    [uuids]
  );
  return new Set(rows.map((row) => row.chess_com_uuid));
}

async function upsertGamesBatch(
  chessComId,
  parsedGames,
  { skipExisting = false, existingUuids = null } = {}
) {
  let valid = parsedGames.filter((g) => g.chess_com_uuid && g.pgn);
  if (!valid.length) return 0;

  if (skipExisting) {
    const existing =
      existingUuids instanceof Set
        ? existingUuids
        : await getExistingGameUuids(valid.map((g) => g.chess_com_uuid));
    valid = valid.filter((g) => !existing.has(g.chess_com_uuid));
    if (!valid.length) return 0;
  }

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
  }

  return upserted;
}

async function getStoredMoveCount(chessComUuid) {
  const { rows } = await db.query(
    'SELECT COUNT(*)::int AS count FROM chess_com_moves WHERE chess_com_uuid = $1',
    [chessComUuid]
  );
  return rows[0]?.count || 0;
}

async function insertMovesForGame(chessComUuid, chessComId, pgn) {
  const moves = parsePgnToMoves(pgn);
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

    const { rowCount } = await db.query(
      `INSERT INTO chess_com_moves (
        chess_com_uuid, chess_com_id, ply, move_number, color, san,
        from_square, to_square, piece, captured, promotion,
        fen_before, fen_after, is_check, is_mate, is_capture,
        is_castle, is_en_passant, is_promotion
      ) VALUES ${valueRows.join(', ')}
      ON CONFLICT (chess_com_uuid, ply) DO NOTHING`,
      params
    );
    saved += rowCount || 0;
  }

  return saved;
}

/** Skip parse/insert when this game UUID already has moves (keyed by chess_com_uuid + ply). */
async function ensureMovesForGame(chessComUuid, chessComId, pgn, expectedMoveCount = 0) {
  const stored = await getStoredMoveCount(chessComUuid);
  if (stored > 0 && (expectedMoveCount <= 0 || stored >= expectedMoveCount)) {
    return 0;
  }
  return insertMovesForGame(chessComUuid, chessComId, pgn);
}

async function lazyParseAndStoreMoves(chessComId, uuid) {
  const { rows } = await db.query(
    `SELECT pgn, move_count FROM chess_com_games
     WHERE chess_com_id = $1 AND chess_com_uuid = $2
     LIMIT 1`,
    [chessComId.toLowerCase(), uuid]
  );
  if (!rows[0]?.pgn) return 0;
  return ensureMovesForGame(
    uuid,
    chessComId.toLowerCase(),
    rows[0].pgn,
    rows[0].move_count || 0
  );
}

async function backfillMissingMoves(chessComId, limit = 100) {
  const { rows } = await db.query(
    `SELECT g.chess_com_uuid, g.pgn, g.move_count
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

  let total = 0;
  for (const row of rows) {
    if (!row.pgn) continue;
    total += await ensureMovesForGame(
      row.chess_com_uuid,
      chessComId.toLowerCase(),
      row.pgn,
      row.move_count || 0
    );
  }
  return total;
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

function scheduleBackgroundSync(username) {
  const chessComId = username.trim().toLowerCase();
  if (backgroundSyncs.has(chessComId)) return backgroundSyncs.get(chessComId);

  const task = (async () => {
    await runBulkSync({ chessComIds: [chessComId], forceFull: false });
  })()
    .catch((err) => console.error(`[chess-com bg sync] ${username}:`, err.message))
    .finally(() => backgroundSyncs.delete(chessComId));

  backgroundSyncs.set(chessComId, task);
  return task;
}

async function quickSyncPlayer(username) {
  return runBulkSync({
    chessComIds: [username.trim().toLowerCase()],
    forceFull: false,
    maxRecentMonths: QUICK_SYNC_RECENT_ARCHIVES,
  });
}

function selectArchivesToFetch(allArchiveUrls, syncedArchives, { forceFull = false, maxRecentArchives = null } = {}) {
  let archiveUrls = allArchiveUrls;
  if (maxRecentArchives != null && !forceFull) {
    archiveUrls = allArchiveUrls.slice(-maxRecentArchives);
  }

  const toFetch = [];
  let archivesSkipped = 0;

  for (const archiveUrl of archiveUrls) {
    const meta = archiveMetaFromUrl(archiveUrl);
    if (!shouldFetchArchiveMonth(meta, syncedArchives, { forceFull })) {
      archivesSkipped += 1;
      continue;
    }
    toFetch.push({ archiveUrl, meta });
  }

  return { toFetch, archivesSkipped };
}

async function fetchAndStoreArchiveMonth(chessComId, apiUsername, { archiveUrl, meta }, { skipExisting = false } = {}) {
  const monthData = await fetchChessJson(meta.path);
  const games = monthData?.games || [];
  const parsedGames = [];

  for (const game of games) {
    if (!game.uuid || !game.pgn) continue;
    parsedGames.push(parseRawGame(game, apiUsername));
  }

  const gamesUpserted = await upsertGamesBatch(chessComId, parsedGames, { skipExisting });
  await upsertArchive(chessComId, archiveUrl, meta, games.length);

  return { gamesUpserted, gameCount: games.length };
}

function archiveApiPath(apiUsername, year, month) {
  return `/pub/player/${encodeURIComponent(apiUsername)}/games/${year}/${String(month).padStart(2, '0')}`;
}

function enumerateMonthsFromLastSync(lastSyncedAt, { forceFull = false, maxRecentMonths = null } = {}) {
  const { year: endYear, month: endMonth } = currentYearMonth();
  let startYear;
  let startMonth;

  if (forceFull && maxRecentMonths == null) {
    startYear = endYear - 15;
    startMonth = 1;
  } else if (forceFull) {
    const d = new Date(endYear, endMonth - 1 - (maxRecentMonths - 1), 1);
    startYear = d.getFullYear();
    startMonth = d.getMonth() + 1;
  } else if (lastSyncedAt) {
    const d = new Date(lastSyncedAt);
    startYear = d.getFullYear();
    startMonth = d.getMonth() + 1;
  } else {
    const d = new Date(endYear, endMonth - 1 - (QUICK_SYNC_RECENT_ARCHIVES - 1), 1);
    startYear = d.getFullYear();
    startMonth = d.getMonth() + 1;
  }

  const months = [];
  let y = startYear;
  let m = startMonth;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    months.push({ year: y, month: m, monthNum: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

/** Single query: all tracked players + last_synced_at + synced archive months. */
async function loadBulkSyncContext(filterChessComIds = null) {
  let playerIds = filterChessComIds?.map((id) => id.trim().toLowerCase()).filter(Boolean);
  if (!playerIds?.length) {
    playerIds = await getTrackedPlayerIds();
  }
  if (!playerIds.length) return [];

  const { rows: profileRows } = await db.query(
    `SELECT chess_com_id, username AS profile_username, last_synced_at
     FROM chess_com_profiles
     WHERE chess_com_id = ANY($1)`,
    [playerIds]
  );
  const { rows: archiveRows } = await db.query(
    `SELECT chess_com_id, archive_year, archive_month, last_fetched_at AS archive_last_fetched
     FROM chess_com_archives
     WHERE chess_com_id = ANY($1)
     ORDER BY chess_com_id, archive_year, archive_month`,
    [playerIds]
  );

  const profileById = new Map(profileRows.map((r) => [r.chess_com_id, r]));
  const players = new Map();
  for (const chessComId of playerIds) {
    const profile = profileById.get(chessComId);
    players.set(chessComId, {
      chessComId,
      apiUsername: profile?.profile_username || chessComId,
      lastSyncedAt: profile?.last_synced_at || null,
      syncedArchives: new Map(),
    });
  }
  for (const row of archiveRows) {
    const player = players.get(row.chess_com_id);
    if (!player) continue;
    if (row.archive_year != null && row.archive_month != null) {
      player.syncedArchives.set(archiveKey(row.archive_year, row.archive_month), {
        last_fetched_at: row.archive_last_fetched,
      });
    }
  }
  return [...players.values()];
}

function buildBulkFetchTasks(players, { forceFull = false, maxRecentMonths = null } = {}) {
  const tasks = [];
  let archivesSkipped = 0;

  for (const player of players) {
    const months = enumerateMonthsFromLastSync(player.lastSyncedAt, { forceFull, maxRecentMonths });
    for (const { year, month, monthNum } of months) {
      const meta = {
        year,
        monthNum,
        path: archiveApiPath(player.apiUsername, year, month),
      };
      if (!forceFull && !shouldFetchArchiveMonth(meta, player.syncedArchives, { forceFull: false })) {
        archivesSkipped += 1;
        continue;
      }
      tasks.push({
        chessComId: player.chessComId,
        apiUsername: player.apiUsername,
        archiveUrl: `${CHESS_API}${meta.path}`,
        meta,
      });
    }
  }

  return { tasks, archivesSkipped };
}

async function bulkInsertSyncRaw(batchId, rows) {
  if (!rows.length) return 0;

  let inserted = 0;
  for (let offset = 0; offset < rows.length; offset += RAW_INSERT_CHUNK) {
    const chunk = rows.slice(offset, offset + RAW_INSERT_CHUNK);
    const valueRows = [];
    const params = [];
    let paramIndex = 1;

    for (const row of chunk) {
      valueRows.push(
        `($${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++})`
      );
      params.push(
        batchId,
        row.chessComId,
        row.apiUsername,
        row.meta.year,
        row.meta.monthNum,
        row.archiveUrl,
        row.meta.path,
        JSON.stringify(row.rawJson),
        row.gameCount,
        row.status || 'fetched',
        row.fetchError || null
      );
    }

    await db.query(
      `INSERT INTO chess_com_sync_raw (
         sync_batch_id, chess_com_id, api_username, archive_year, archive_month,
         archive_url, api_path, raw_json, game_count, status, fetch_error
       ) VALUES ${valueRows.join(', ')}
       ON CONFLICT (sync_batch_id, chess_com_id, archive_year, archive_month) DO UPDATE SET
         raw_json = EXCLUDED.raw_json,
         game_count = EXCLUDED.game_count,
         status = EXCLUDED.status,
         fetch_error = EXCLUDED.fetch_error,
         fetched_at = NOW()`,
      params
    );
    inserted += chunk.length;
  }

  return inserted;
}

async function phase1FetchAndStoreRaw(batchId, tasks) {
  const fetchedRows = [];

  const { results } = await runPool(
    tasks,
    async (task) => {
      try {
        const monthData = await fetchChessJson(task.meta.path);
        if (monthData?.notFound) {
          return {
            chessComId: task.chessComId,
            apiUsername: task.apiUsername,
            meta: task.meta,
            archiveUrl: task.archiveUrl,
            rawJson: { games: [] },
            gameCount: 0,
            status: 'fetched',
          };
        }
        const games = monthData?.games || [];
        return {
          chessComId: task.chessComId,
          apiUsername: task.apiUsername,
          meta: task.meta,
          archiveUrl: task.archiveUrl,
          rawJson: monthData,
          gameCount: games.length,
          status: 'fetched',
        };
      } catch (err) {
        return {
          chessComId: task.chessComId,
          apiUsername: task.apiUsername,
          meta: task.meta,
          archiveUrl: task.archiveUrl,
          rawJson: { games: [], error: err.message },
          gameCount: 0,
          status: 'failed',
          fetchError: err.message,
        };
      }
    },
    { concurrency: BULK_FETCH_CONCURRENCY }
  );

  for (const result of results) {
    if (result && !result.error) {
      fetchedRows.push(result);
    }
  }

  await bulkInsertSyncRaw(batchId, fetchedRows);
  return {
    fetched: fetchedRows.filter((r) => r.status === 'fetched').length,
    failed: fetchedRows.filter((r) => r.status === 'failed').length,
  };
}

async function getExistingUuidsForPlayers(chessComIds) {
  if (!chessComIds.length) return new Set();
  const { rows } = await db.query(
    'SELECT chess_com_uuid FROM chess_com_games WHERE chess_com_id = ANY($1::text[])',
    [chessComIds]
  );
  return new Set(rows.map((row) => row.chess_com_uuid));
}

async function phase2ParseAndStoreGames(batchId, { skipExisting = true, chessComIds = [] } = {}) {
  const { rows: rawRows } = await db.query(
    `SELECT id, chess_com_id, api_username, archive_year, archive_month, archive_url, raw_json
     FROM chess_com_sync_raw
     WHERE sync_batch_id = $1 AND status = 'fetched'
     ORDER BY chess_com_id, archive_year, archive_month`,
    [batchId]
  );

  if (!rawRows.length) {
    return { gamesUpserted: 0, archivesProcessed: 0, parsedRows: 0 };
  }

  const existingUuids =
    skipExisting && chessComIds.length
      ? await getExistingUuidsForPlayers(chessComIds)
      : skipExisting
        ? await getExistingUuidsForPlayers([...new Set(rawRows.map((r) => r.chess_com_id))])
        : null;

  const gamesByPlayer = new Map();
  const archiveUpdates = [];
  const parsedIds = [];
  const failedIds = [];

  for (const row of rawRows) {
    try {
      const games = row.raw_json?.games || [];
      const apiUsername = row.api_username;
      if (!gamesByPlayer.has(row.chess_com_id)) {
        gamesByPlayer.set(row.chess_com_id, []);
      }
      const bucket = gamesByPlayer.get(row.chess_com_id);

      for (const game of games) {
        if (!game.uuid || !game.pgn) continue;
        bucket.push(parseRawGame(game, apiUsername));
      }

      archiveUpdates.push({
        chessComId: row.chess_com_id,
        archiveUrl: row.archive_url,
        meta: { year: row.archive_year, monthNum: row.archive_month },
        gameCount: games.length,
      });
      parsedIds.push(row.id);
    } catch (err) {
      failedIds.push({ id: row.id, error: err.message });
    }
  }

  let gamesUpserted = 0;
  for (const [chessComId, parsedGames] of gamesByPlayer) {
    gamesUpserted += await upsertGamesBatch(chessComId, parsedGames, {
      skipExisting,
      existingUuids,
    });
  }

  for (const archive of archiveUpdates) {
    await upsertArchive(
      archive.chessComId,
      archive.archiveUrl,
      archive.meta,
      archive.gameCount
    );
  }

  if (parsedIds.length) {
    await db.query(
      `UPDATE chess_com_sync_raw
       SET status = 'parsed', parsed_at = NOW(), parse_error = NULL
       WHERE id = ANY($1::bigint[])`,
      [parsedIds]
    );
  }

  for (const fail of failedIds) {
    await db.query(
      `UPDATE chess_com_sync_raw SET status = 'failed', parse_error = $2 WHERE id = $1`,
      [fail.id, fail.error]
    );
  }

  return {
    gamesUpserted,
    archivesProcessed: archiveUpdates.length,
    parsedRows: parsedIds.length,
    parseFailed: failedIds.length,
  };
}

async function ensureProfileStubs(players) {
  if (!players.length) return;

  const valueRows = [];
  const params = [];
  let paramIndex = 1;

  for (const player of players) {
    valueRows.push(`($${paramIndex++},$${paramIndex++},'syncing',NULL,NOW(),NOW())`);
    params.push(player.chessComId, player.apiUsername);
  }

  await db.query(
    `INSERT INTO chess_com_profiles (chess_com_id, username, sync_status, sync_error, updated_at, created_at)
     VALUES ${valueRows.join(', ')}
     ON CONFLICT (chess_com_id) DO UPDATE SET
       sync_status = 'syncing',
       sync_error = NULL,
       updated_at = NOW()`,
    params
  );
}

async function phase3SyncProfilesAndClubs(players) {
  const { results } = await runPool(
    players,
    async (player) => {
      const profileRaw = await fetchChessJson(
        `/pub/player/${encodeURIComponent(player.apiUsername)}`
      );
      if (profileRaw?.notFound) {
        throw new Error(`Chess.com player not found: ${player.apiUsername}`);
      }

      const apiUsername = profileRaw.username || player.apiUsername;
      const chessComId = apiUsername.toLowerCase();

      const [statsRaw, clubsRaw] = await Promise.all([
        fetchChessJson(`/pub/player/${encodeURIComponent(apiUsername)}/stats`),
        fetchChessJson(`/pub/player/${encodeURIComponent(apiUsername)}/clubs`),
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

      return { chessComId, apiUsername };
    },
    { concurrency: PROFILE_SYNC_CONCURRENCY }
  );

  const synced = [];
  const errors = [];
  for (const result of results) {
    if (!result || result.error) {
      errors.push(result?.error || 'Profile sync failed');
    } else {
      synced.push(result);
    }
  }
  return { synced, errors };
}

async function finalizeBulkSync(chessComIds) {
  if (!chessComIds.length) return;

  await db.query(
    `UPDATE chess_com_profiles p SET
       total_games_estimate = sub.cnt,
       last_synced_at = NOW(),
       sync_status = 'complete',
       sync_error = NULL,
       updated_at = NOW()
     FROM (
       SELECT chess_com_id, COUNT(*)::int AS cnt
       FROM chess_com_games
       WHERE chess_com_id = ANY($1::text[])
       GROUP BY chess_com_id
     ) sub
     WHERE p.chess_com_id = sub.chess_com_id`,
    [chessComIds]
  );

  await db.query(
    `UPDATE chess_com_profiles SET
       last_synced_at = NOW(),
       sync_status = 'complete',
       sync_error = NULL,
       updated_at = NOW()
     WHERE chess_com_id = ANY($1::text[])
       AND chess_com_id NOT IN (
         SELECT chess_com_id FROM chess_com_games WHERE chess_com_id = ANY($1::text[])
       )`,
    [chessComIds]
  );
}

/**
 * Two-phase bulk sync:
 * 1) One DB query for all players' last sync + archive state
 * 2) Parallel fetch → chess_com_sync_raw
 * 3) Batch parse → chess_com_games
 */
async function runBulkSync({
  chessComIds = null,
  forceFull = false,
  maxRecentMonths = null,
} = {}) {
  const batchId = crypto.randomUUID();
  const startedAt = Date.now();

  const players = await loadBulkSyncContext(chessComIds);
  if (!players.length) {
    return {
      batchId,
      players: 0,
      archivesFetched: 0,
      archivesSkipped: 0,
      gamesUpserted: 0,
      durationMs: 0,
    };
  }

  const ids = players.map((p) => p.chessComId);

  // Profiles must exist before chess_com_games / chess_com_archives inserts (FK).
  await ensureProfileStubs(players);

  const { tasks, archivesSkipped } = buildBulkFetchTasks(players, { forceFull, maxRecentMonths });

  console.log(
    `[chess-com bulk sync] batch ${batchId}: ${players.length} player(s), ${tasks.length} archive fetch(es), ${archivesSkipped} skipped`
  );

  const fetchStats = tasks.length
    ? await phase1FetchAndStoreRaw(batchId, tasks)
    : { fetched: 0, failed: 0 };

  const parseStats = await phase2ParseAndStoreGames(batchId, {
    skipExisting: !forceFull,
    chessComIds: ids,
  });

  const profileSync = await phase3SyncProfilesAndClubs(players);
  if (profileSync.errors.length && chessComIds?.length === 1) {
    throw new Error(profileSync.errors[0]);
  }
  await finalizeBulkSync(ids);

  const durationMs = Date.now() - startedAt;
  console.log(
    `[chess-com bulk sync] batch ${batchId} done in ${durationMs}ms: fetched ${fetchStats.fetched} month(s), upserted ${parseStats.gamesUpserted} game(s), parsed ${parseStats.parsedRows} raw row(s)`
  );

  return {
    batchId,
    players: players.length,
    archivesFetched: fetchStats.fetched,
    archivesFailed: fetchStats.failed,
    archivesSkipped,
    gamesUpserted: parseStats.gamesUpserted,
    archivesProcessed: parseStats.archivesProcessed,
    durationMs,
    incremental: !forceFull,
  };
}

async function syncPlayerFromChessCom(username, { forceFull = false, maxRecentArchives = null } = {}) {
  const chessComId = username.trim().toLowerCase();
  const result = await runBulkSync({
    chessComIds: [chessComId],
    forceFull,
    maxRecentMonths: maxRecentArchives,
  });

  const profileRow = await getProfileRow(chessComId);
  const { rows: countRows } = await db.query(
    'SELECT COUNT(*)::int AS count FROM chess_com_games WHERE chess_com_id = $1',
    [chessComId]
  );

  return {
    chessComId,
    username: profileRow?.username || username,
    incremental: result.incremental,
    quickSync: maxRecentArchives != null,
    archivesProcessed: result.archivesFetched,
    archivesSkipped: result.archivesSkipped,
    gamesUpserted: result.gamesUpserted,
    movesBackfilled: 0,
    totalGamesInDb: countRows[0]?.count || 0,
    batchId: result.batchId,
    durationMs: result.durationMs,
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

async function getProfileSummary(username) {
  const chessComId = username.trim().toLowerCase();
  const profileRow = await getProfileRow(chessComId);

  if (!profileRow) {
    scheduleBackgroundSync(username);
    return {
      linked: false,
      pending: true,
      username: username.trim(),
      profile: null,
      stats: null,
      totalGames: 0,
      backgroundSync: true,
      error: null,
    };
  }

  let backgroundSync = false;
  if (await needsSync(chessComId)) {
    scheduleBackgroundSync(username);
    backgroundSync = true;
  }

  const mapped = mapDbProfileRow(profileRow);
  return {
    linked: true,
    pending: false,
    profile: mapped.profile,
    stats: mapped.stats,
    totalGames: profileRow.total_games_estimate || 0,
    lastSyncedAt: profileRow.last_synced_at,
    syncStatus: profileRow.sync_status,
    backgroundSync,
    error: profileRow.sync_error,
  };
}

async function getBundle(username, { forceSync = false } = {}) {
  const chessComId = username.trim().toLowerCase();

  if (forceSync) {
    try {
      await syncPlayerFromChessCom(username, { forceFull: true });
    } catch (err) {
      const existing = await getProfileRow(chessComId);
      if (!existing) throw err;
    }
  }

  const summary = await getProfileSummary(username);
  if (!summary.linked) {
    return {
      ...summary,
      recentGames: [],
      archives: [],
      clubs: [],
    };
  }

  const [gamesRes, archivesRes, clubsRes] = await Promise.all([
    getRecentGames(chessComId, 25, { includeTotal: false }),
    getArchives(chessComId),
    getClubs(chessComId),
  ]);

  return {
    ...summary,
    recentGames: gamesRes.games,
    totalGames: summary.totalGames || gamesRes.total,
    archives: archivesRes,
    clubs: clubsRes,
  };
}

async function attachPreviewPgnsByUuids(games, previewLimit = PREVIEW_PGN_LIMIT) {
  const slice =
    previewLimit == null || previewLimit === Infinity
      ? games
      : games.slice(0, previewLimit);
  const uuids = slice.map((g) => g.uuid).filter(Boolean);
  if (!uuids.length) return games;

  const { rows } = await db.query(
    `SELECT chess_com_uuid, pgn FROM chess_com_games
     WHERE chess_com_uuid = ANY($1)`,
    [uuids]
  );
  const pgnByUuid = new Map(rows.map((row) => [row.chess_com_uuid, row.pgn]));
  return games.map((game) =>
    pgnByUuid.has(game.uuid) ? { ...game, pgn: pgnByUuid.get(game.uuid) } : game
  );
}

async function attachPreviewPgns(chessComId, games, previewLimit = PREVIEW_PGN_LIMIT) {
  const slice =
    previewLimit == null || previewLimit === Infinity
      ? games
      : games.slice(0, previewLimit);
  const uuids = slice.map((g) => g.uuid).filter(Boolean);
  if (!uuids.length) return games;

  const { rows } = await db.query(
    `SELECT chess_com_uuid, pgn FROM chess_com_games
     WHERE chess_com_id = $1 AND chess_com_uuid = ANY($2)`,
    [chessComId.toLowerCase(), uuids]
  );
  const pgnByUuid = new Map(rows.map((row) => [row.chess_com_uuid, row.pgn]));
  return games.map((game) =>
    pgnByUuid.has(game.uuid) ? { ...game, pgn: pgnByUuid.get(game.uuid) } : game
  );
}

async function getRecentGames(chessComId, limit = 25, { attachPreviewPgn = false, includeTotal = true } = {}) {
  const id = chessComId.toLowerCase();
  const { rows } = await db.query(
    `SELECT ${GAME_LIST_COLUMNS} FROM chess_com_games
     WHERE chess_com_id = $1
     ORDER BY played_at DESC NULLS LAST
     LIMIT $2`,
    [id, limit]
  );
  let games = rows.map(mapDbGameRow);
  if (attachPreviewPgn) {
    games = await attachPreviewPgns(id, games, games.length);
  }

  let total = games.length;
  if (includeTotal) {
    const { rows: countRows } = await db.query(
      'SELECT COUNT(*)::int AS count FROM chess_com_games WHERE chess_com_id = $1',
      [id]
    );
    total = countRows[0]?.count || 0;
  }

  return { games, total };
}

async function getGamePgn(chessComId, uuid) {
  const { rows } = await db.query(
    'SELECT pgn FROM chess_com_games WHERE chess_com_id = $1 AND chess_com_uuid = $2 LIMIT 1',
    [chessComId.toLowerCase(), uuid]
  );
  return rows[0]?.pgn || null;
}

async function getGameByUuid(chessComId, uuid) {
  const { rows } = await db.query(
    'SELECT * FROM chess_com_games WHERE chess_com_id = $1 AND chess_com_uuid = $2 LIMIT 1',
    [chessComId.toLowerCase(), uuid]
  );
  return rows[0] ? mapDbGameRow(rows[0]) : null;
}

async function getMovesForGame(chessComId, uuid) {
  const id = chessComId.toLowerCase();

  const stored = await getStoredMoveCount(uuid);
  if (stored === 0) {
    await lazyParseAndStoreMoves(id, uuid);
  }

  const { rows } = await db.query(
    `SELECT * FROM chess_com_moves
     WHERE chess_com_id = $1 AND chess_com_uuid = $2
     ORDER BY ply ASC`,
    [id, uuid]
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

async function getMonthlyGames(
  chessComId,
  maxMonths = 12,
  perMonth = 8,
  { attachPreviewPgn = false } = {}
) {
  const id = chessComId.toLowerCase();
  const { rows: archiveRows } = await db.query(
    `SELECT archive_year, archive_month, archive_url, game_count
     FROM chess_com_archives
     WHERE chess_com_id = $1
     ORDER BY archive_year DESC, archive_month DESC
     LIMIT $2`,
    [id, maxMonths]
  );

  if (!archiveRows.length) return [];

  const { rows: gameRows } = await db.query(
    `SELECT ${GAME_LIST_COLUMNS}, archive_year, archive_month FROM (
       SELECT ${gameListColumns('g')},
         a.archive_year,
         a.archive_month,
         ROW_NUMBER() OVER (
           PARTITION BY a.archive_year, a.archive_month
           ORDER BY g.played_at DESC NULLS LAST
         ) AS rn
       FROM chess_com_archives a
       JOIN chess_com_games g ON g.chess_com_id = a.chess_com_id
         AND EXTRACT(YEAR FROM g.played_at) = a.archive_year
         AND EXTRACT(MONTH FROM g.played_at) = a.archive_month
       WHERE a.chess_com_id = $1
     ) ranked
     WHERE rn <= $2
     ORDER BY archive_year DESC, archive_month DESC, played_at DESC NULLS LAST`,
    [id, perMonth]
  );

  const grouped = new Map();

  for (const row of gameRows) {
    const monthKey = `${row.archive_year}-${String(row.archive_month).padStart(2, '0')}`;
    if (!grouped.has(monthKey)) grouped.set(monthKey, []);
    grouped.get(monthKey).push(mapDbGameRow(row));
  }

  let months = archiveRows.map((archive) => {
    const monthKey = `${archive.archive_year}-${String(archive.archive_month).padStart(2, '0')}`;
    const monthIndex = archive.archive_month - 1;
    return {
      month: monthKey,
      label: new Date(archive.archive_year, monthIndex, 1).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
      archiveUrl: archive.archive_url,
      gameCount: archive.game_count || grouped.get(monthKey)?.length || 0,
      games: grouped.get(monthKey) || [],
    };
  });

  if (attachPreviewPgn) {
    const flatGames = months.flatMap((month) => month.games);
    if (flatGames.length) {
      const withPgn = await attachPreviewPgns(id, flatGames, flatGames.length);
      const pgnByUuid = new Map(
        withPgn.filter((game) => game.pgn).map((game) => [game.uuid, game.pgn])
      );
      months = months.map((month) => ({
        ...month,
        games: month.games.map((game) =>
          pgnByUuid.has(game.uuid) ? { ...game, pgn: pgnByUuid.get(game.uuid) } : game
        ),
      }));
    }
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

async function getTrackedPlayerIds() {
  const { rows } = await db.query(
    `SELECT DISTINCT LOWER(TRIM("Chess_com_ID")) AS chess_com_id
     FROM players
     WHERE "Chess_com_ID" IS NOT NULL AND TRIM("Chess_com_ID") <> ''`
  );
  return rows.map((row) => row.chess_com_id).filter(Boolean);
}

function formatDayLabelInTz(timeZone = DEFAULT_YESTERDAY_TZ, daysAgo = 0) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  const local = new Date(get('year'), get('month') - 1, get('day') - daysAgo);
  return local.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatGamePlayedAt(iso, timeZone = DEFAULT_YESTERDAY_TZ) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function buildDayFilterLabels(timeZone = DEFAULT_YESTERDAY_TZ) {
  return {
    today: formatDayLabelInTz(timeZone, 0),
    yesterday: formatDayLabelInTz(timeZone, 1),
    day_before: formatDayLabelInTz(timeZone, 2),
    all: 'All Days',
  };
}

function normalizeDayFilter(dayFilter) {
  const value = String(dayFilter || 'all').toLowerCase();
  if (value === 'today') return 'today';
  if (value === 'yesterday') return 'yesterday';
  if (value === 'day_before' || value === 'day-before' || value === 'daybefore') {
    return 'day_before';
  }
  return 'all';
}

function dayFilterToDaysAgo(dayFilter) {
  if (dayFilter === 'today') return 0;
  if (dayFilter === 'yesterday') return 1;
  if (dayFilter === 'day_before') return 2;
  return null;
}

/** YYYY-MM-DD for a calendar day in the given IANA timezone. */
function localDateString(timeZone = DEFAULT_YESTERDAY_TZ, daysAgo = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  const dt = new Date(get('year'), get('month') - 1, get('day') - daysAgo);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** UTC ISO bounds covering one local calendar day in `timeZone`. */
function localDayBounds(timeZone, daysAgo) {
  const day = localDateString(timeZone, daysAgo);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const localYmd = (ms) => formatter.format(new Date(ms)); // en-CA → YYYY-MM-DD

  let startMs = Date.UTC(...day.split('-').map(Number).map((n, i) => (i === 1 ? n - 1 : n))) - 14 * 3600 * 1000;
  while (localYmd(startMs) < day) startMs += 15 * 60 * 1000;
  while (localYmd(startMs) > day) startMs -= 15 * 60 * 1000;
  while (localYmd(startMs) === day) startMs -= 60 * 1000;
  startMs += 60 * 1000;
  let endMs = startMs;
  while (localYmd(endMs) === day) endMs += 60 * 1000;

  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

function formatYesterdayLabel(timeZone = DEFAULT_YESTERDAY_TZ) {
  return formatDayLabelInTz(timeZone, 1);
}

async function attachBrillianceRunStatus(games) {
  if (!games.length) return games;

  const uuids = games.map((game) => game.uuid).filter(Boolean);
  if (!uuids.length) return games;

  const { rows } = await db.query(
    `SELECT chess_com_uuid, stage4_status, stage4_error
     FROM chess_com_brilliance_runs
     WHERE chess_com_uuid = ANY($1::text[])`,
    [uuids]
  );

  const byUuid = new Map(rows.map((row) => [row.chess_com_uuid, row]));
  return games.map((game) => {
    const run = byUuid.get(game.uuid);
    if (!run) return game;
    return {
      ...game,
      brillianceRun: {
        stage4Status: run.stage4_status,
        stage4Error: run.stage4_error,
      },
    };
  });
}

async function getTrackedGamesByDay({
  dayFilter = 'all',
  timeZone = DEFAULT_YESTERDAY_TZ,
  attachPreviewPgn = true,
} = {}) {
  const filter = normalizeDayFilter(dayFilter);
  const daysAgo = dayFilterToDaysAgo(filter);
  const filterLabels = buildDayFilterLabels(timeZone);
  const playerIds = await getTrackedPlayerIds();

  if (!playerIds.length) {
    return {
      games: [],
      date: filter === 'all' ? filterLabels.all : filterLabels[filter],
      dayFilter: filter,
      filterLabels,
      playersCount: 0,
      timeZone,
    };
  }

  const params = [playerIds];
  let dateClause = '';

  if (daysAgo != null) {
    const { startIso, endIso } = localDayBounds(timeZone, daysAgo);
    params.push(startIso, endIso);
    dateClause = 'AND g.played_at >= $2 AND g.played_at < $3';
  }

  const { rows } = await db.query(
    `SELECT ${GAME_LIST_COLUMNS}
     FROM chess_com_games g
     WHERE g.chess_com_id = ANY($1)
       AND g.played_at IS NOT NULL
       ${dateClause}
     ORDER BY g.played_at DESC`,
    params
  );

  let games = rows.map((row) => {
    const game = mapDbGameRow(row);
    game.date = formatGamePlayedAt(game.playedAt, timeZone);
    return game;
  });

  if (attachPreviewPgn && games.length) {
    games = await attachPreviewPgnsByUuids(games, games.length);
  }

  games = await attachBrillianceRunStatus(games);

  return {
    games,
    date: filter === 'all' ? filterLabels.all : filterLabels[filter],
    dayFilter: filter,
    filterLabels,
    playersCount: playerIds.length,
    timeZone,
  };
}

async function getYesterdaysGames(options = {}) {
  return getTrackedGamesByDay({ ...options, dayFilter: 'yesterday' });
}

async function getBrilliancePipelineStats({
  dayFilter = 'all',
  timeZone = DEFAULT_YESTERDAY_TZ,
} = {}) {
  const { db: sqliteDb } = require('../../brilliance/db/database');
  const filter = normalizeDayFilter(dayFilter);
  const daysAgo = dayFilterToDaysAgo(filter);
  const filterLabels = buildDayFilterLabels(timeZone);
  const playerIds = await getTrackedPlayerIds();

  const emptyStats = {
    dayFilter: filter,
    dateLabel: filter === 'all' ? filterLabels.all : filterLabels[filter],
    filterLabels,
    playersCount: 0,
    timeZone,
    syncInProgress: isYesterdaysSyncInProgress(),
    gamesFetched: 0,
    analysisPending: 0,
    analysisRunning: 0,
    analysisCompleted: 0,
    analysisFailed: 0,
    brilliantMovesFound: 0,
    stagesRunning: { stage0: 0, stage1: 0, stage2: 0, stage3: 0, stage4: 0 },
  };

  if (!playerIds.length) return emptyStats;

  const params = [playerIds];
  let dateClause = '';

  if (daysAgo != null) {
    const { startIso, endIso } = localDayBounds(timeZone, daysAgo);
    params.push(startIso, endIso);
    dateClause = 'AND g.played_at >= $2 AND g.played_at < $3';
  }

  const { rows } = await db.query(
    `SELECT
       COUNT(DISTINCT g.chess_com_uuid) AS games_fetched,
       COUNT(DISTINCT CASE
         WHEN r.stage0_status = 'running' OR r.stage1_status = 'running'
           OR r.stage2_status = 'running' OR r.stage3_status = 'running'
           OR r.stage4_status = 'running'
         THEN g.chess_com_uuid END) AS analysis_running,
       COUNT(DISTINCT CASE WHEN r.stage4_status = 'completed' THEN g.chess_com_uuid END) AS analysis_completed,
       COUNT(DISTINCT CASE
         WHEN (r.stage0_status = 'failed' OR r.stage1_status = 'failed'
            OR r.stage2_status = 'failed' OR r.stage3_status = 'failed'
            OR r.stage4_status = 'failed')
           AND COALESCE(r.stage4_status, '') <> 'completed'
         THEN g.chess_com_uuid END) AS analysis_failed,
       COUNT(DISTINCT CASE WHEN s4.is_brilliant = 1 THEN s4.id END) AS brilliant_moves_found
     FROM chess_com_games g
     LEFT JOIN chess_com_brilliance_runs r ON r.chess_com_uuid = g.chess_com_uuid
     LEFT JOIN chess_com_brilliance_stage4 s4 ON s4.chess_com_uuid = g.chess_com_uuid
     WHERE g.chess_com_id = ANY($1)
       AND g.played_at IS NOT NULL
       ${dateClause}`,
    params
  );

  const { rows: uuidRows } = await db.query(
    `SELECT g.chess_com_uuid
     FROM chess_com_games g
     WHERE g.chess_com_id = ANY($1)
       AND g.played_at IS NOT NULL
       ${dateClause}`,
    params
  );

  const stagesRunning = { stage0: 0, stage1: 0, stage2: 0, stage3: 0, stage4: 0 };
  let sqliteRunningGames = 0;
  const uuids = uuidRows.map((row) => row.chess_com_uuid).filter(Boolean);

  for (let offset = 0; offset < uuids.length; offset += 400) {
    const chunk = uuids.slice(offset, offset + 400);
    if (!chunk.length) continue;

    const placeholders = chunk.map(() => '?').join(', ');
    const sqliteRows = sqliteDb
      .prepare(
        `SELECT stage0_status, stage1_status, stage2_status, stage3_status, stage4_status
         FROM lichess_pgn_games
         WHERE lichess_game_id IN (${placeholders})
           AND (
             stage0_status = 'running' OR stage1_status = 'running'
             OR stage2_status = 'running' OR stage3_status = 'running'
             OR stage4_status = 'running'
           )`
      )
      .all(...chunk);

    for (const row of sqliteRows) {
      sqliteRunningGames += 1;
      if (row.stage0_status === 'running') stagesRunning.stage0 += 1;
      if (row.stage1_status === 'running') stagesRunning.stage1 += 1;
      if (row.stage2_status === 'running') stagesRunning.stage2 += 1;
      if (row.stage3_status === 'running') stagesRunning.stage3 += 1;
      if (row.stage4_status === 'running') stagesRunning.stage4 += 1;
    }
  }

  const gamesFetched = rows[0]?.games_fetched || 0;
  const pgRunning = rows[0]?.analysis_running || 0;
  const analysisCompleted = rows[0]?.analysis_completed || 0;
  const analysisFailed = rows[0]?.analysis_failed || 0;
  const analysisRunning = pgRunning + sqliteRunningGames;
  const analysisPending = Math.max(0, gamesFetched - analysisCompleted - analysisRunning - analysisFailed);

  return {
    dayFilter: filter,
    dateLabel: filter === 'all' ? filterLabels.all : filterLabels[filter],
    filterLabels,
    playersCount: playerIds.length,
    timeZone,
    syncInProgress: isYesterdaysSyncInProgress(),
    gamesFetched,
    analysisPending,
    analysisRunning,
    analysisCompleted,
    analysisFailed,
    brilliantMovesFound: rows[0]?.brilliant_moves_found || 0,
    stagesRunning,
  };
}

async function syncTrackedPlayersRecent() {
  return runBulkSync({ forceFull: false });
}

function isYesterdaysSyncInProgress() {
  return Boolean(yesterdaysSyncTask);
}

function startYesterdaysSyncInBackground() {
  if (yesterdaysSyncTask) return yesterdaysSyncTask;

  yesterdaysSyncTask = syncTrackedPlayersRecent()
    .then((result) => {
      console.log('[chess-com yesterdays sync] complete:', result);
      return result;
    })
    .catch((err) => {
      console.error('[chess-com yesterdays sync] failed:', err.message);
      return { failed: true, error: err.message };
    })
    .finally(() => {
      yesterdaysSyncTask = null;
    });

  return yesterdaysSyncTask;
}

async function getRatingHistory(chessComId, months = 3) {
  const id = chessComId.toLowerCase();
  const safeMonths = Math.min(Math.max(Number(months) || 3, 1), 12);
  const since = new Date();
  since.setMonth(since.getMonth() - safeMonths);

  const { rows } = await db.query(
    `SELECT played_at, time_class, white_rating, black_rating, self_color, rated
     FROM chess_com_games
     WHERE chess_com_id = $1
       AND played_at >= $2
       AND rated = TRUE
     ORDER BY played_at ASC NULLS LAST`,
    [id, since.toISOString()]
  );

  const games = rows
    .map((row) => {
      const isWhite = row.self_color === 'white';
      const selfRating = isWhite ? row.white_rating : row.black_rating;
      return {
        timeClass: row.time_class,
        selfRating,
        playedAt: row.played_at ? new Date(row.played_at).toISOString() : null,
        date: row.played_at
          ? new Date(row.played_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : null,
      };
    })
    .filter((game) => game.timeClass && game.selfRating != null);

  return {
    months: safeMonths,
    since: since.toISOString(),
    games,
  };
}

function highestWinStreakFromResults(resultTypes) {
  let max = 0;
  let current = 0;

  for (const resultType of resultTypes) {
    if (resultType === 'win') {
      current += 1;
      if (current > max) max = current;
    } else {
      current = 0;
    }
  }

  return max;
}

async function getPlayerWinStreaks(chessComId, timeZone = DEFAULT_YESTERDAY_TZ) {
  const id = chessComId.toLowerCase();

  const { rows: allRows } = await db.query(
    `SELECT self_result_type
     FROM chess_com_games
     WHERE chess_com_id = $1 AND played_at IS NOT NULL
     ORDER BY played_at ASC`,
    [id]
  );

  const { startIso, endIso } = localDayBounds(timeZone, 1);
  const { rows: yesterdayRows } = await db.query(
    `SELECT self_result_type
     FROM chess_com_games
     WHERE chess_com_id = $1
       AND played_at IS NOT NULL
       AND played_at >= $2 AND played_at < $3
     ORDER BY played_at ASC`,
    [id, startIso, endIso]
  );

  return {
    timeZone,
    yesterday: {
      label: formatDayLabelInTz(timeZone, 1),
      gameCount: yesterdayRows.length,
      highestWinStreak: highestWinStreakFromResults(
        yesterdayRows.map((row) => row.self_result_type)
      ),
    },
    allTime: {
      gameCount: allRows.length,
      highestWinStreak: highestWinStreakFromResults(allRows.map((row) => row.self_result_type)),
    },
  };
}

async function getPlayerGamesByDay(
  chessComId,
  { dayFilter = 'yesterday', timeZone = DEFAULT_YESTERDAY_TZ } = {}
) {
  const id = chessComId.toLowerCase();
  const filter = normalizeDayFilter(dayFilter);
  const daysAgo = dayFilterToDaysAgo(filter);

  if (daysAgo == null) {
    return {
      games: [],
      dayFilter: filter,
      label: buildDayFilterLabels(timeZone).all,
      timeZone,
    };
  }

  const { startIso, endIso } = localDayBounds(timeZone, daysAgo);
  const { rows } = await db.query(
    `SELECT ${GAME_LIST_COLUMNS}
     FROM chess_com_games g
     WHERE g.chess_com_id = $1
       AND g.played_at IS NOT NULL
       AND g.played_at >= $2 AND g.played_at < $3
     ORDER BY g.played_at ASC`,
    [id, startIso, endIso]
  );

  const games = rows.map((row) => {
    const game = mapDbGameRow(row);
    game.playedAtLabel = formatGamePlayedAt(game.playedAt, timeZone);
    return game;
  });

  return {
    games,
    dayFilter: filter,
    label: formatDayLabelInTz(timeZone, daysAgo),
    timeZone,
  };
}

module.exports = {
  syncPlayerFromChessCom,
  quickSyncPlayer,
  scheduleBackgroundSync,
  getProfileSummary,
  getBundle,
  getRecentGames,
  getGameByUuid,
  getGamePgn,
  getMovesForGame,
  getArchives,
  getMonthlyGames,
  getRatingHistory,
  getClubs,
  getPlayerWinStreaks,
  getPlayerGamesByDay,
  getYesterdaysGames,
  getTrackedGamesByDay,
  getBrilliancePipelineStats,
  syncTrackedPlayersRecent,
  runBulkSync,
  startYesterdaysSyncInBackground,
  isYesterdaysSyncInProgress,
  needsSync,
  backfillMissingMoves,
};
