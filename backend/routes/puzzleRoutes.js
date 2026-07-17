const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const db = require('../api/config/database');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

router.use('/puzzles', authenticate);

const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const name = String(file.originalname || '').toLowerCase();
    const ok =
      name.endsWith('.xlsx') ||
      name.endsWith('.xls') ||
      name.endsWith('.csv') ||
      file.mimetype.includes('sheet') ||
      file.mimetype.includes('excel') ||
      file.mimetype.includes('csv');
    if (!ok) {
      cb(new Error('Upload an Excel (.xlsx/.xls) or CSV file.'));
      return;
    }
    cb(null, true);
  },
});

function mapRatedPuzzle(row) {
  return {
    id: row.id,
    moral_id: row.moral_id != null ? Number(row.moral_id) : null,
    moral_code: row.moral_code || null,
    moral_name: row.moral_name || null,
    fen: row.Fen || row.fen || null,
    is_used: Boolean(Number(row.is_used)),
    created_at: row.created_at || null,
  };
}

function mapLichessPuzzle(row) {
  return {
    id: row.id,
    fen: row.fen || null,
    moves: row.moves || null,
    rating: row.rating != null ? Number(row.rating) : null,
    rating_deviation:
      row.rating_deviation != null ? Number(row.rating_deviation) : null,
    popularity: row.popularity != null ? Number(row.popularity) : null,
    nb_plays: row.nb_plays != null ? Number(row.nb_plays) : null,
    themes: row.themes || null,
    game_url: row.game_url || null,
    opening_tags: row.opening_tags || null,
    is_used: Boolean(Number(row.is_used)),
    created_at: row.created_at || null,
  };
}

function parseOptionalInt(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function lichessSortClause(sort) {
  switch (String(sort || '').toLowerCase()) {
    case 'rating_desc':
      return 'rating DESC NULLS LAST, id ASC';
    case 'rating_asc':
      return 'rating ASC NULLS LAST, id ASC';
    case 'popularity_desc':
      return 'popularity DESC NULLS LAST, id ASC';
    case 'nb_plays_desc':
      return 'nb_plays DESC NULLS LAST, id ASC';
    default:
      return 'id ASC';
  }
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]+/g, '');
}

function pickField(row, aliases) {
  const entries = Object.entries(row || {});
  for (const alias of aliases) {
    const want = normalizeHeader(alias);
    const hit = entries.find(([key]) => normalizeHeader(key) === want);
    if (hit && hit[1] != null && String(hit[1]).trim() !== '') return hit[1];
  }
  // partial match (e.g. RatingDevi → ratingdeviation, OpeningTa → openingtags)
  for (const alias of aliases) {
    const want = normalizeHeader(alias);
    const hit = entries.find(([key]) => {
      const k = normalizeHeader(key);
      return k.startsWith(want) || want.startsWith(k);
    });
    if (hit && hit[1] != null && String(hit[1]).trim() !== '') return hit[1];
  }
  return null;
}

function toIntOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toTextOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

/** GET /api/puzzles/gm — list all 3000-rated GM puzzles
 *  Query: unused=1, q=, limit=
 */
router.get('/puzzles/gm', async (req, res) => {
  try {
    const unusedOnly = String(req.query.unused || '') === '1' || req.query.unused === 'true';
    const q = String(req.query.q || '').trim();
    const limitRaw = req.query.limit != null ? Number(req.query.limit) : null;
    const params = [];
    let sql = `
      SELECT p.id, p.moral_id, p."Fen", p.is_used, p.created_at,
             m.moral_code, m.moral_name
      FROM "3000_rated_puzzles" p
      LEFT JOIN Morals m ON m.id = p.moral_id
      WHERE 1=1`;
    if (unusedOnly) sql += ` AND IFNULL(p.is_used, 0) = 0`;
    if (q) {
      const like = `%${q}%`;
      params.push(like);
      const a = params.length;
      params.push(like);
      const b = params.length;
      sql += ` AND (p."Fen" LIKE $${a} OR CAST(p.id AS TEXT) LIKE $${b})`;
    }
    sql += ` ORDER BY p.id ASC`;
    if (Number.isFinite(limitRaw) && limitRaw > 0) {
      params.push(Math.min(limitRaw, 500));
      sql += ` LIMIT $${params.length}`;
    }
    const { rows } = await db.query(sql, params);
    return res.json({
      puzzles: rows.map(mapRatedPuzzle),
      count: rows.length,
    });
  } catch (err) {
    console.error('[puzzles] list gm:', err.message);
    return res.status(500).json({ message: 'Failed to load GM puzzles.' });
  }
});

/** GET /api/puzzles/gm/:id */
router.get('/puzzles/gm/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT p.id, p.moral_id, p."Fen", p.is_used, p.created_at,
              m.moral_code, m.moral_name
       FROM "3000_rated_puzzles" p
       LEFT JOIN Morals m ON m.id = p.moral_id
       WHERE p.id = $1`,
      [Number(req.params.id)]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Puzzle not found.' });
    return res.json({ puzzle: mapRatedPuzzle(rows[0]) });
  } catch (err) {
    console.error('[puzzles] get gm:', err.message);
    return res.status(500).json({ message: 'Failed to load puzzle.' });
  }
});

/** GET /api/puzzles/lichess/filters — facet data for picker UI */
router.get('/puzzles/lichess/filters', async (req, res) => {
  try {
    const unusedOnly = String(req.query.unused || '') === '1' || req.query.unused === 'true';
    const usedClause = unusedOnly ? ' AND COALESCE(is_used, 0) = 0' : '';

    const ratingBounds = await db.query(
      `SELECT MIN(rating) AS min_rating, MAX(rating) AS max_rating
       FROM lichess_puzzles
       WHERE rating IS NOT NULL${usedClause}`
    );

    const themeRows = await db.query(
      `SELECT theme, COUNT(*)::int AS count
       FROM lichess_puzzles,
       LATERAL unnest(string_to_array(themes, ' ')) AS theme
       WHERE themes IS NOT NULL AND themes <> ''${usedClause}
       GROUP BY theme
       ORDER BY count DESC, theme ASC
       LIMIT 80`
    );

    const openingRows = await db.query(
      `SELECT opening, COUNT(*)::int AS count
       FROM lichess_puzzles,
       LATERAL unnest(string_to_array(opening_tags, ' ')) AS opening
       WHERE opening_tags IS NOT NULL AND opening_tags <> ''${usedClause}
       GROUP BY opening
       ORDER BY count DESC, opening ASC
       LIMIT 50`
    );

    return res.json({
      rating_min: ratingBounds.rows[0]?.min_rating != null
        ? Number(ratingBounds.rows[0].min_rating)
        : null,
      rating_max: ratingBounds.rows[0]?.max_rating != null
        ? Number(ratingBounds.rows[0].max_rating)
        : null,
      themes: themeRows.rows.map((row) => ({
        value: row.theme,
        count: Number(row.count) || 0,
      })),
      openings: openingRows.rows.map((row) => ({
        value: row.opening,
        count: Number(row.count) || 0,
      })),
    });
  } catch (err) {
    console.error('[puzzles] lichess filters:', err.message);
    return res.status(500).json({ message: 'Failed to load Lichess puzzle filters.' });
  }
});

/** Build WHERE clause + params for lichess_puzzles list filters. */
function buildLichessWhere(query) {
  const unusedOnly = String(query.unused || '') === '1' || query.unused === 'true';
  const usedOnly = String(query.used || '') === '1' || query.used === 'true';
  const q = String(query.q || '').trim();
  const ratingMin = parseOptionalInt(query.rating_min);
  const ratingMax = parseOptionalInt(query.rating_max);
  const theme = String(query.theme || '').trim();
  const opening = String(query.opening || '').trim();
  const params = [];
  let where = ' WHERE 1=1';
  if (unusedOnly) where += ` AND IFNULL(is_used, 0) = 0`;
  if (usedOnly) where += ` AND IFNULL(is_used, 0) = 1`;
  if (ratingMin != null) {
    params.push(ratingMin);
    where += ` AND rating >= $${params.length}`;
  }
  if (ratingMax != null) {
    params.push(ratingMax);
    where += ` AND rating <= $${params.length}`;
  }
  if (theme) {
    params.push(`%${theme}%`);
    where += ` AND IFNULL(themes,'') LIKE $${params.length}`;
  }
  if (opening) {
    params.push(`%${opening}%`);
    where += ` AND IFNULL(opening_tags,'') LIKE $${params.length}`;
  }
  if (q) {
    const like = `%${q}%`;
    params.push(like);
    const a = params.length;
    params.push(like);
    const b = params.length;
    params.push(like);
    const c = params.length;
    params.push(like);
    const d = params.length;
    where += ` AND (fen LIKE $${a} OR IFNULL(themes,'') LIKE $${b} OR IFNULL(opening_tags,'') LIKE $${c} OR CAST(id AS TEXT) LIKE $${d})`;
  }
  const hasFilter =
    unusedOnly ||
    usedOnly ||
    q ||
    ratingMin != null ||
    ratingMax != null ||
    theme ||
    opening;
  return { where, params, hasFilter };
}

/** GET /api/puzzles/lichess
 *  Query: unused=1, used=1, q=, limit=, offset=, random=1,
 *         rating_min=, rating_max=, theme=, opening=, sort=
 */
router.get('/puzzles/lichess', async (req, res) => {
  try {
    const sort = String(req.query.sort || 'id_asc');
    const wantRandom =
      String(req.query.random || '') === '1' || req.query.random === 'true';
    const { where, params, hasFilter } = buildLichessWhere(req.query);
    const limit = Math.min(
      Math.max(Number(req.query.limit) || (hasFilter ? 100 : 25), 1),
      500
    );
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM lichess_puzzles${where}`,
      params
    );
    const total = Number(countResult.rows[0]?.total) || 0;

    const usageResult = await db.query(
      `SELECT
         COUNT(*)::int AS total_all,
         COUNT(*) FILTER (WHERE COALESCE(is_used, 0) = 1)::int AS total_used,
         COUNT(*) FILTER (WHERE COALESCE(is_used, 0) = 0)::int AS total_unused
       FROM lichess_puzzles`
    );
    const usageRow = usageResult.rows[0] || {};
    const usage = {
      all: Number(usageRow.total_all) || 0,
      used: Number(usageRow.total_used) || 0,
      unused: Number(usageRow.total_unused) || 0,
    };

    if (wantRandom) {
      if (total === 0) {
        return res.json({
          puzzles: [],
          count: 0,
          total: 0,
          offset: 0,
          limit: 1,
          usage,
        });
      }
      const skip = Math.floor(Math.random() * total);
      const randomParams = [...params, 1, skip];
      const { rows } = await db.query(
        `SELECT id, fen, moves, rating, rating_deviation, popularity, nb_plays,
                themes, game_url, opening_tags, is_used, created_at
         FROM lichess_puzzles
         ${where}
         ORDER BY ${lichessSortClause(sort)}
         LIMIT $${randomParams.length - 1} OFFSET $${randomParams.length}`,
        randomParams
      );
      return res.json({
        puzzles: rows.map(mapLichessPuzzle),
        count: rows.length,
        total,
        offset: skip,
        limit: 1,
        usage,
      });
    }

    const listParams = [...params, limit, offset];
    const { rows } = await db.query(
      `SELECT id, fen, moves, rating, rating_deviation, popularity, nb_plays,
              themes, game_url, opening_tags, is_used, created_at
       FROM lichess_puzzles
       ${where}
       ORDER BY ${lichessSortClause(sort)}
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );
    return res.json({
      puzzles: rows.map(mapLichessPuzzle),
      count: rows.length,
      total,
      offset,
      limit,
      usage,
    });
  } catch (err) {
    console.error('[puzzles] list lichess:', err.message);
    return res.status(500).json({ message: 'Failed to load Lichess puzzles.' });
  }
});

/** GET /api/puzzles/lichess/:id */
router.get('/puzzles/lichess/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, fen, moves, rating, rating_deviation, popularity, nb_plays,
              themes, game_url, opening_tags, is_used, created_at
       FROM lichess_puzzles
       WHERE id = $1`,
      [Number(req.params.id)]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Puzzle not found.' });
    return res.json({ puzzle: mapLichessPuzzle(rows[0]) });
  } catch (err) {
    console.error('[puzzles] get lichess:', err.message);
    return res.status(500).json({ message: 'Failed to load puzzle.' });
  }
});

/**
 * POST /api/puzzles/lichess/upload
 * Excel/CSV with columns: FEN, Moves, Rating, RatingDeviation, Popularity,
 * NbPlays, Themes, GameUrl, OpeningTags (PuzzleId ignored — we generate ids).
 */
router.post(
  '/puzzles/lichess/upload',
  (req, res, next) => {
    uploadExcel.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: err.message || 'Upload failed.' });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ message: 'No file uploaded.' });
      }

      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        return res.status(400).json({ message: 'Workbook has no sheets.' });
      }
      const sheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });
      if (!rawRows.length) {
        return res.status(400).json({ message: 'No data rows found in the file.' });
      }

      let inserted = 0;
      let updated = 0;
      let skipped = 0;

      for (const raw of rawRows) {
        const fen = toTextOrNull(pickField(raw, ['FEN', 'fen']));
        if (!fen) {
          skipped += 1;
          continue;
        }

        const moves = toTextOrNull(pickField(raw, ['Moves', 'moves']));
        const rating = toIntOrNull(pickField(raw, ['Rating', 'rating']));
        const ratingDeviation = toIntOrNull(
          pickField(raw, ['RatingDeviation', 'RatingDevi', 'rating_deviation'])
        );
        const popularity = toIntOrNull(
          pickField(raw, ['Popularity', 'popularity'])
        );
        const nbPlays = toIntOrNull(pickField(raw, ['NbPlays', 'nb_plays', 'Nb Plays']));
        const themes = toTextOrNull(pickField(raw, ['Themes', 'themes']));
        const gameUrl = toTextOrNull(
          pickField(raw, ['GameUrl', 'Game Url', 'game_url'])
        );
        const openingTags = toTextOrNull(
          pickField(raw, ['OpeningTags', 'OpeningTa', 'opening_tags', 'Opening Tags'])
        );

        const existing = await db.query(
          `SELECT id FROM lichess_puzzles WHERE fen = $1`,
          [fen]
        );

        if (existing.rows[0]) {
          await db.query(
            `UPDATE lichess_puzzles
             SET moves = $2,
                 rating = $3,
                 rating_deviation = $4,
                 popularity = $5,
                 nb_plays = $6,
                 themes = $7,
                 game_url = $8,
                 opening_tags = $9
             WHERE fen = $1`,
            [
              fen,
              moves,
              rating,
              ratingDeviation,
              popularity,
              nbPlays,
              themes,
              gameUrl,
              openingTags,
            ]
          );
          updated += 1;
        } else {
          await db.query(
            `INSERT INTO lichess_puzzles
               (fen, moves, rating, rating_deviation, popularity, nb_plays, themes, game_url, opening_tags)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              fen,
              moves,
              rating,
              ratingDeviation,
              popularity,
              nbPlays,
              themes,
              gameUrl,
              openingTags,
            ]
          );
          inserted += 1;
        }
      }

      const countRes = await db.query(
        `SELECT COUNT(*) AS c FROM lichess_puzzles`
      );

      return res.status(201).json({
        message: 'Lichess puzzles uploaded.',
        inserted,
        updated,
        skipped,
        total: Number(countRes.rows[0]?.c) || 0,
      });
    } catch (err) {
      console.error('[puzzles] lichess upload:', err.message);
      return res.status(500).json({ message: err.message || 'Upload failed.' });
    }
  }
);

module.exports = router;
