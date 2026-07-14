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

/** GET /api/puzzles/lichess
 *  Query: unused=1, q=, limit= (default 200 when unused/q set, else all — capped at 2000)
 */
router.get('/puzzles/lichess', async (req, res) => {
  try {
    const unusedOnly = String(req.query.unused || '') === '1' || req.query.unused === 'true';
    const q = String(req.query.q || '').trim();
    const hasFilter = unusedOnly || q;
    const limit = Math.min(
      Math.max(Number(req.query.limit) || (hasFilter ? 100 : 2000), 1),
      2000
    );
    const params = [];
    let sql = `
      SELECT id, fen, moves, rating, rating_deviation, popularity, nb_plays,
             themes, game_url, opening_tags, is_used, created_at
      FROM lichess_puzzles
      WHERE 1=1`;
    if (unusedOnly) sql += ` AND IFNULL(is_used, 0) = 0`;
    if (q) {
      const like = `%${q}%`;
      params.push(like);
      const a = params.length;
      params.push(like);
      const b = params.length;
      params.push(like);
      const c = params.length;
      sql += ` AND (fen LIKE $${a} OR IFNULL(themes,'') LIKE $${b} OR CAST(id AS TEXT) LIKE $${c})`;
    }
    params.push(limit);
    sql += ` ORDER BY id ASC LIMIT $${params.length}`;
    const { rows } = await db.query(sql, params);
    return res.json({
      puzzles: rows.map(mapLichessPuzzle),
      count: rows.length,
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
