const express = require('express');
const db = require('../api/config/database');
const { authenticate, authorizeRoles } = require('../middleware/authMiddleware');
const {
  uploadStoryImage,
  publicUrlForFilename,
} = require('../api/utils/storyImageUpload');

const router = express.Router();

router.use('/library', authenticate, authorizeRoles('admin'));

/** POST /api/library/upload — save image(s) under frontend/public/story_images */
router.post(
  '/library/upload',
  (req, res, next) => {
    uploadStoryImage.array('images', 20)(req, res, (err) => {
      if (err) {
        const status = err.code === 'LIMIT_FILE_SIZE' ? 400 : 400;
        return res.status(status).json({ message: err.message || 'Upload failed.' });
      }
      next();
    });
  },
  (req, res) => {
    try {
      const files = req.files || [];
      if (!files.length) {
        return res.status(400).json({ message: 'No image files uploaded.' });
      }
      const urls = files.map((f) => publicUrlForFilename(f.filename));
      return res.status(201).json({
        urls,
        url: urls[0],
      });
    } catch (err) {
      console.error('[library] upload:', err.message);
      return res.status(500).json({ message: err.message || 'Upload failed.' });
    }
  }
);

async function nextMoralCode() {
  const { rows } = await db.query(
    `SELECT moral_code FROM Morals ORDER BY id DESC LIMIT 1`
  );
  const last = rows[0]?.moral_code;
  let next = 1;
  if (last) {
    const m = String(last).match(/(\d+)/);
    if (m) next = Number(m[1]) + 1;
  }
  return `M_${String(next).padStart(3, '0')}`;
}

function normalizeMoralIds(moralIds) {
  const ids = Array.isArray(moralIds) ? moralIds : [];
  return [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id)))];
}

async function loadStoryBundle(storyId) {
  const id = Number(storyId);
  if (!Number.isFinite(id)) return null;

  const { rows } = await db.query(`SELECT * FROM Stories WHERE id = $1`, [id]);
  const story = rows[0];
  if (!story) return null;

  const images = await db.query(
    `SELECT id, story_id, image_url, display_order
     FROM Story_Images
     WHERE story_id = $1
     ORDER BY display_order ASC, id ASC`,
    [id]
  );
  const morals = await db.query(
    `SELECT m.id, m.moral_code, m.moral_name, m.created_at
     FROM story_moral_mapping sm
     JOIN Morals m ON m.id = sm.moral_id
     WHERE sm.story_id = $1
     ORDER BY m.id ASC`,
    [id]
  );

  return {
    id: Number(story.id),
    title: story.title,
    subheading: story.subheading,
    content: story.content,
    cover_image: story.cover_image,
    status: story.status,
    created_by: story.created_by,
    created_at: story.created_at,
    updated_at: story.updated_at,
    images: images.rows.map((row) => ({
      id: Number(row.id),
      story_id: Number(row.story_id),
      image_url: row.image_url,
      display_order: Number(row.display_order) || 0,
    })),
    morals: morals.rows.map((row) => ({
      id: Number(row.id),
      moral_code: row.moral_code,
      moral_name: row.moral_name,
      created_at: row.created_at,
    })),
  };
}

async function replaceStoryImages(storyId, images = []) {
  await db.query(`DELETE FROM Story_Images WHERE story_id = $1`, [storyId]);
  const list = Array.isArray(images) ? images : [];
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const url = typeof item === 'string' ? item : item?.image_url;
    if (!url || !String(url).trim()) continue;
    const order =
      typeof item === 'object' && item?.display_order != null ? Number(item.display_order) : i;
    await db.query(
      `INSERT INTO Story_Images (story_id, image_url, display_order)
       VALUES ($1, $2, $3)`,
      [storyId, String(url).trim(), order]
    );
  }
}

/** First gallery image is the cover. */
function coverFromImages(images = []) {
  const list = Array.isArray(images) ? images : [];
  for (const item of list) {
    const url = typeof item === 'string' ? item : item?.image_url;
    if (url && String(url).trim()) return String(url).trim();
  }
  return null;
}

async function replaceStoryMorals(storyId, moralIds = []) {
  const ids = normalizeMoralIds(moralIds);
  if (ids.length === 0) {
    const err = new Error('Each story must have at least one moral.');
    err.status = 400;
    throw err;
  }

  // Ensure all moral ids exist (avoid silent INSERT OR IGNORE skips)
  const { rows: existing } = await db.query(
    `SELECT id FROM Morals WHERE id IN (${ids.map((_, i) => `$${i + 1}`).join(',')})`,
    ids
  );
  const found = new Set(existing.map((r) => Number(r.id)));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    const err = new Error(`Unknown moral id(s): ${missing.join(', ')}`);
    err.status = 400;
    throw err;
  }

  await db.query(`DELETE FROM story_moral_mapping WHERE story_id = $1`, [storyId]);
  for (const moralId of ids) {
    await db.query(
      `INSERT INTO story_moral_mapping (story_id, moral_id) VALUES ($1, $2)`,
      [storyId, moralId]
    );
  }
}

/** GET /api/library/stories */
router.get('/library/stories', async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT s.*,
              (SELECT si.image_url
               FROM Story_Images si
               WHERE si.story_id = s.id
               ORDER BY si.display_order ASC, si.id ASC
               LIMIT 1) AS first_image_url,
              (SELECT COUNT(*) FROM Story_Images si WHERE si.story_id = s.id) AS image_count,
              (SELECT COUNT(*) FROM story_moral_mapping sm WHERE sm.story_id = s.id) AS moral_count
       FROM Stories s
       ORDER BY s.updated_at DESC, s.id DESC`
    );
    const stories = rows.map((row) => {
      const { first_image_url, ...story } = row;
      return {
        ...story,
        cover_image: first_image_url || story.cover_image || null,
      };
    });
    return res.json({ stories });
  } catch (err) {
    console.error('[library] list stories:', err.message);
    return res.status(500).json({ message: 'Failed to load stories.' });
  }
});

/** GET /api/library/stories/:id */
router.get('/library/stories/:id', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const story = await loadStoryBundle(Number(req.params.id));
    if (!story) return res.status(404).json({ message: 'Story not found.' });
    return res.json({ story });
  } catch (err) {
    console.error('[library] get story:', err.message);
    return res.status(500).json({ message: 'Failed to load story.' });
  }
});

/** POST /api/library/stories */
router.post('/library/stories', async (req, res) => {
  const {
    title,
    subheading,
    status,
    images,
    moral_ids,
  } = req.body || {};

  const trimmedTitle = String(title || '').trim();
  if (!trimmedTitle) {
    return res.status(400).json({ message: 'Title is required.' });
  }

  const moralIds = normalizeMoralIds(moral_ids);
  if (moralIds.length === 0) {
    return res.status(400).json({ message: 'Each story must have at least one moral.' });
  }

  const storyStatus = status === 'published' ? 'published' : 'draft';
  const createdBy = req.user?.id != null ? Number(req.user.id) : null;
  const coverImage = coverFromImages(images);

  try {
    await db.query('BEGIN');
    const { rows } = await db.query(
      `INSERT INTO Stories (title, subheading, content, cover_image, status, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, datetime('now'), datetime('now'))
       RETURNING id`,
      [
        trimmedTitle,
        subheading != null ? String(subheading) : null,
        null,
        coverImage,
        storyStatus,
        Number.isFinite(createdBy) ? createdBy : null,
      ]
    );
    const storyId = rows[0].id;
    await replaceStoryImages(storyId, images);
    await replaceStoryMorals(storyId, moralIds);
    await db.query('COMMIT');

    const story = await loadStoryBundle(storyId);
    return res.status(201).json({ story });
  } catch (err) {
    try {
      await db.query('ROLLBACK');
    } catch {}
    const statusCode = err.status || 500;
    if (statusCode !== 500) return res.status(statusCode).json({ message: err.message });
    console.error('[library] create story:', err.message);
    return res.status(500).json({ message: 'Failed to create story.' });
  }
});

/** PUT /api/library/stories/:id */
router.put('/library/stories/:id', async (req, res) => {
  const storyId = Number(req.params.id);
  const {
    title,
    subheading,
    status,
    images,
    moral_ids,
  } = req.body || {};

  const trimmedTitle = String(title || '').trim();
  if (!trimmedTitle) {
    return res.status(400).json({ message: 'Title is required.' });
  }

  if (moral_ids !== undefined && normalizeMoralIds(moral_ids).length === 0) {
    return res.status(400).json({ message: 'Each story must have at least one moral.' });
  }

  const storyStatus = status === 'published' ? 'published' : 'draft';
  const coverImage = images !== undefined ? coverFromImages(images) : undefined;

  try {
    const existing = await db.query(`SELECT id FROM Stories WHERE id = $1`, [storyId]);
    if (!existing.rows[0]) {
      return res.status(404).json({ message: 'Story not found.' });
    }

    await db.query('BEGIN');
    if (coverImage !== undefined) {
      await db.query(
        `UPDATE Stories
         SET title = $2,
             subheading = $3,
             content = NULL,
             cover_image = $4,
             status = $5,
             updated_at = datetime('now')
         WHERE id = $1`,
        [
          storyId,
          trimmedTitle,
          subheading != null ? String(subheading) : null,
          coverImage,
          storyStatus,
        ]
      );
    } else {
      await db.query(
        `UPDATE Stories
         SET title = $2,
             subheading = $3,
             content = NULL,
             status = $4,
             updated_at = datetime('now')
         WHERE id = $1`,
        [
          storyId,
          trimmedTitle,
          subheading != null ? String(subheading) : null,
          storyStatus,
        ]
      );
    }
    if (images !== undefined) await replaceStoryImages(storyId, images);
    if (moral_ids !== undefined) await replaceStoryMorals(storyId, moral_ids);
    await db.query('COMMIT');

    const story = await loadStoryBundle(storyId);
    return res.json({ story });
  } catch (err) {
    try {
      await db.query('ROLLBACK');
    } catch {}
    const statusCode = err.status || 500;
    if (statusCode !== 500) return res.status(statusCode).json({ message: err.message });
    console.error('[library] update story:', err.message);
    return res.status(500).json({ message: 'Failed to update story.' });
  }
});

/** DELETE /api/library/stories/:id */
router.delete('/library/stories/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query(`DELETE FROM Stories WHERE id = $1`, [
      Number(req.params.id),
    ]);
    if (!rowCount) return res.status(404).json({ message: 'Story not found.' });
    return res.json({ message: 'Story deleted.' });
  } catch (err) {
    console.error('[library] delete story:', err.message);
    return res.status(500).json({ message: 'Failed to delete story.' });
  }
});

/** GET /api/library/morals */
router.get('/library/morals', async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, moral_code, moral_name, created_at FROM Morals ORDER BY id ASC`
    );
    return res.json({ morals: rows });
  } catch (err) {
    console.error('[library] list morals:', err.message);
    return res.status(500).json({ message: 'Failed to load morals.' });
  }
});

/** POST /api/library/morals */
router.post('/library/morals', async (req, res) => {
  const name = String(req.body?.moral_name || '').trim();
  if (!name) {
    return res.status(400).json({ message: 'Moral name is required.' });
  }

  try {
    const moral_code = await nextMoralCode();
    const { rows } = await db.query(
      `INSERT INTO Morals (moral_code, moral_name, created_at)
       VALUES ($1, $2, datetime('now'))
       RETURNING id, moral_code, moral_name, created_at`,
      [moral_code, name]
    );
    return res.status(201).json({ moral: rows[0] });
  } catch (err) {
    console.error('[library] create moral:', err.message);
    return res.status(500).json({ message: 'Failed to create moral.' });
  }
});

/** DELETE /api/library/morals/:id */
router.delete('/library/morals/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query(`DELETE FROM Morals WHERE id = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Moral not found.' });
    return res.json({ message: 'Moral deleted.' });
  } catch (err) {
    console.error('[library] delete moral:', err.message);
    return res.status(500).json({ message: 'Failed to delete moral.' });
  }
});

/**
 * GET /api/library/stories/:storyId/morals/:moralId/puzzles
 * Assigned puzzles for a story+moral (ordered).
 */
router.get('/library/stories/:storyId/morals/:moralId/puzzles', async (req, res) => {
  try {
    const storyId = Number(req.params.storyId);
    const moralId = Number(req.params.moralId);
    const story = await loadStoryBundle(storyId);
    if (!story) return res.status(404).json({ message: 'Story not found.' });
    const moral = (story.morals || []).find((m) => Number(m.id) === moralId);
    if (!moral) {
      return res.status(404).json({ message: 'Moral is not linked to this story.' });
    }
    const moralPuzzleService = require('../api/services/moralPuzzleService');
    const assignments = await moralPuzzleService.listAssignments(storyId, moralId);
    return res.json({
      story,
      moral,
      assignments,
      first_puzzle: assignments[0]?.puzzle || null,
    });
  } catch (err) {
    console.error('[library] list moral puzzles:', err.message);
    return res.status(500).json({ message: err.message || 'Failed to load moral puzzles.' });
  }
});

/**
 * POST /api/library/stories/:storyId/morals/:moralId/puzzles
 * Body: { source: 'gm'|'lichess'|'chesscom', puzzle_id }
 */
router.post('/library/stories/:storyId/morals/:moralId/puzzles', async (req, res) => {
  try {
    const storyId = Number(req.params.storyId);
    const moralId = Number(req.params.moralId);
    const source = String(req.body?.source || '').trim();
    const puzzleId = Number(req.body?.puzzle_id);
    const moralPuzzleService = require('../api/services/moralPuzzleService');
    const assignment = await moralPuzzleService.assignPuzzle({
      storyId,
      moralId,
      source,
      puzzleId,
      assignedBy: req.user?.id != null ? Number(req.user.id) : null,
    });
    return res.status(201).json({ assignment });
  } catch (err) {
    console.error('[library] assign puzzle:', err.message);
    const status = /already|not found|not linked|Invalid/i.test(err.message) ? 400 : 500;
    return res.status(status).json({ message: err.message || 'Failed to assign puzzle.' });
  }
});

/**
 * DELETE /api/library/stories/:storyId/morals/:moralId/puzzles/:assignmentId
 */
router.delete(
  '/library/stories/:storyId/morals/:moralId/puzzles/:assignmentId',
  async (req, res) => {
    try {
      const moralPuzzleService = require('../api/services/moralPuzzleService');
      const removed = await moralPuzzleService.unassignPuzzle(req.params.assignmentId);
      if (!removed) return res.status(404).json({ message: 'Assignment not found.' });
      return res.json({ message: 'Puzzle removed from moral.', removed });
    } catch (err) {
      console.error('[library] unassign puzzle:', err.message);
      return res.status(500).json({ message: err.message || 'Failed to remove puzzle.' });
    }
  }
);

module.exports = router;
