const express = require('express');
const db = require('../api/config/database');
const { authenticate, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

function isAdmin(req) {
  return (req.user?.role || '').toLowerCase() === 'admin';
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const s = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return fallback;
}

function mapModule(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description || null,
    visible_to_students: Boolean(row.visible_to_students),
    story_count: Number(row.story_count) || 0,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function mapModuleStory(row) {
  if (!row) return null;
  return {
    id: row.link_id || row.id,
    module_id: row.module_id,
    story_id: row.story_id,
    visible_to_students: Boolean(row.link_visible ?? row.visible_to_students),
    display_order: Number(row.display_order) || 0,
    added_at: row.added_at || null,
    title: row.title || null,
    subheading: row.subheading || null,
    cover_image: row.cover_image || row.first_image_url || null,
    status: row.status || null,
    moral_count: Number(row.moral_count) || 0,
    image_count: Number(row.image_count) || 0,
  };
}

async function loadStoryBundle(storyId) {
  const { rows } = await db.query(`SELECT * FROM Stories WHERE id = $1`, [storyId]);
  const story = rows[0];
  if (!story) return null;

  const { rows: images } = await db.query(
    `SELECT id, story_id, image_url, display_order
     FROM Story_Images
     WHERE story_id = $1
     ORDER BY display_order ASC, id ASC`,
    [storyId]
  );
  const { rows: morals } = await db.query(
    `SELECT m.id, m.moral_code, m.moral_name
     FROM story_moral_mapping sm
     INNER JOIN Morals m ON m.id = sm.moral_id
     WHERE sm.story_id = $1
     ORDER BY m.moral_code ASC`,
    [storyId]
  );

  return {
    ...story,
    cover_image: images[0]?.image_url || story.cover_image || null,
    images,
    morals,
  };
}

async function getModuleOr404(id) {
  const { rows } = await db.query(`SELECT * FROM modules WHERE id = $1`, [id]);
  return rows[0] || null;
}

router.use('/modules', authenticate);

/** GET /api/modules */
router.get('/modules', async (req, res) => {
  try {
    const admin = isAdmin(req);
    const sql = admin
      ? `SELECT m.*,
                (SELECT COUNT(*) FROM module_stories ms WHERE ms.module_id = m.id) AS story_count
         FROM modules m
         ORDER BY m.updated_at DESC, m.id DESC`
      : `SELECT m.*,
                (SELECT COUNT(*) FROM module_stories ms
                 WHERE ms.module_id = m.id AND ms.visible_to_students = 1) AS story_count
         FROM modules m
         WHERE m.visible_to_students = 1
         ORDER BY m.updated_at DESC, m.id DESC`;

    const { rows } = await db.query(sql);
    return res.json({ modules: rows.map(mapModule) });
  } catch (err) {
    console.error('[modules] list:', err.message);
    return res.status(500).json({ message: 'Failed to load modules.' });
  }
});

/** POST /api/modules — admin */
router.post('/modules', authorizeRoles('admin'), async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) {
    return res.status(400).json({ message: 'Module name is required.' });
  }
  const description =
    req.body?.description != null ? String(req.body.description).trim() || null : null;
  const visible = toBool(req.body?.visible_to_students, false) ? 1 : 0;

  try {
    const { rows } = await db.query(
      `INSERT INTO modules (name, description, visible_to_students, created_at, updated_at)
       VALUES ($1, $2, $3, datetime('now'), datetime('now'))
       RETURNING *`,
      [name, description, visible]
    );
    return res.status(201).json({ module: mapModule({ ...rows[0], story_count: 0 }) });
  } catch (err) {
    console.error('[modules] create:', err.message);
    return res.status(500).json({ message: 'Failed to create module.' });
  }
});

/** GET /api/modules/:id */
router.get('/modules/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ message: 'Invalid module id.' });
  }

  try {
    const mod = await getModuleOr404(id);
    if (!mod) return res.status(404).json({ message: 'Module not found.' });

    const admin = isAdmin(req);
    if (!admin && !mod.visible_to_students) {
      return res.status(404).json({ message: 'Module not found.' });
    }

    const storySql = admin
      ? `SELECT ms.id AS link_id, ms.module_id, ms.story_id, ms.visible_to_students AS link_visible,
                ms.display_order, ms.added_at,
                s.title, s.subheading, s.status, s.cover_image,
                (SELECT si.image_url FROM Story_Images si
                 WHERE si.story_id = s.id
                 ORDER BY si.display_order ASC, si.id ASC LIMIT 1) AS first_image_url,
                (SELECT COUNT(*) FROM Story_Images si WHERE si.story_id = s.id) AS image_count,
                (SELECT COUNT(*) FROM story_moral_mapping sm WHERE sm.story_id = s.id) AS moral_count
         FROM module_stories ms
         INNER JOIN Stories s ON s.id = ms.story_id
         WHERE ms.module_id = $1
         ORDER BY ms.display_order ASC, ms.added_at ASC, ms.id ASC`
      : `SELECT ms.id AS link_id, ms.module_id, ms.story_id, ms.visible_to_students AS link_visible,
                ms.display_order, ms.added_at,
                s.title, s.subheading, s.status, s.cover_image,
                (SELECT si.image_url FROM Story_Images si
                 WHERE si.story_id = s.id
                 ORDER BY si.display_order ASC, si.id ASC LIMIT 1) AS first_image_url,
                (SELECT COUNT(*) FROM Story_Images si WHERE si.story_id = s.id) AS image_count,
                (SELECT COUNT(*) FROM story_moral_mapping sm WHERE sm.story_id = s.id) AS moral_count
         FROM module_stories ms
         INNER JOIN Stories s ON s.id = ms.story_id
         WHERE ms.module_id = $1 AND ms.visible_to_students = 1
         ORDER BY ms.display_order ASC, ms.added_at ASC, ms.id ASC`;

    const { rows: storyRows } = await db.query(storySql, [id]);
    const stories = storyRows.map(mapModuleStory);

    return res.json({
      module: mapModule({ ...mod, story_count: stories.length }),
      stories,
    });
  } catch (err) {
    console.error('[modules] get:', err.message);
    return res.status(500).json({ message: 'Failed to load module.' });
  }
});

/** PUT /api/modules/:id — admin */
router.put('/modules/:id', authorizeRoles('admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ message: 'Invalid module id.' });
  }

  try {
    const mod = await getModuleOr404(id);
    if (!mod) return res.status(404).json({ message: 'Module not found.' });

    const name =
      req.body?.name !== undefined ? String(req.body.name || '').trim() : mod.name;
    if (!name) {
      return res.status(400).json({ message: 'Module name is required.' });
    }
    const description =
      req.body?.description !== undefined
        ? String(req.body.description || '').trim() || null
        : mod.description;
    const visible =
      req.body?.visible_to_students !== undefined
        ? toBool(req.body.visible_to_students, false)
          ? 1
          : 0
        : mod.visible_to_students;

    const { rows } = await db.query(
      `UPDATE modules
       SET name = $1,
           description = $2,
           visible_to_students = $3,
           updated_at = datetime('now')
       WHERE id = $4
       RETURNING *`,
      [name, description, visible, id]
    );

    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) AS c FROM module_stories WHERE module_id = $1`,
      [id]
    );

    return res.json({
      module: mapModule({ ...rows[0], story_count: Number(countRows[0]?.c) || 0 }),
    });
  } catch (err) {
    console.error('[modules] update:', err.message);
    return res.status(500).json({ message: 'Failed to update module.' });
  }
});

/** DELETE /api/modules/:id — admin */
router.delete('/modules/:id', authorizeRoles('admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ message: 'Invalid module id.' });
  }

  try {
    const mod = await getModuleOr404(id);
    if (!mod) return res.status(404).json({ message: 'Module not found.' });

    await db.query(`DELETE FROM modules WHERE id = $1`, [id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[modules] delete:', err.message);
    return res.status(500).json({ message: 'Failed to delete module.' });
  }
});

/** POST /api/modules/:id/stories — admin: add library story */
router.post('/modules/:id/stories', authorizeRoles('admin'), async (req, res) => {
  const moduleId = Number(req.params.id);
  const storyId = Number(req.body?.story_id);
  if (!Number.isFinite(moduleId) || !Number.isFinite(storyId)) {
    return res.status(400).json({ message: 'Module id and story_id are required.' });
  }

  try {
    const mod = await getModuleOr404(moduleId);
    if (!mod) return res.status(404).json({ message: 'Module not found.' });

    const { rows: storyRows } = await db.query(`SELECT id FROM Stories WHERE id = $1`, [
      storyId,
    ]);
    if (!storyRows[0]) {
      return res.status(404).json({ message: 'Library story not found.' });
    }

    const { rows: existing } = await db.query(
      `SELECT id FROM module_stories WHERE module_id = $1 AND story_id = $2`,
      [moduleId, storyId]
    );
    if (existing[0]) {
      return res.status(409).json({ message: 'Story is already in this module.' });
    }

    const visible = toBool(req.body?.visible_to_students, true) ? 1 : 0;
    const { rows: orderRows } = await db.query(
      `SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order
       FROM module_stories WHERE module_id = $1`,
      [moduleId]
    );
    const displayOrder = Number(orderRows[0]?.next_order) || 0;

    const { rows } = await db.query(
      `INSERT INTO module_stories
         (module_id, story_id, visible_to_students, display_order, added_at)
       VALUES ($1, $2, $3, $4, datetime('now'))
       RETURNING *`,
      [moduleId, storyId, visible, displayOrder]
    );

    await db.query(
      `UPDATE modules SET updated_at = datetime('now') WHERE id = $1`,
      [moduleId]
    );

    const bundle = await loadStoryBundle(storyId);
    return res.status(201).json({
      story: mapModuleStory({
        ...rows[0],
        link_id: rows[0].id,
        link_visible: rows[0].visible_to_students,
        title: bundle?.title,
        subheading: bundle?.subheading,
        status: bundle?.status,
        cover_image: bundle?.cover_image,
      }),
    });
  } catch (err) {
    console.error('[modules] add story:', err.message);
    return res.status(500).json({ message: 'Failed to add story to module.' });
  }
});

/** PATCH /api/modules/:id/stories/:storyId — admin: visibility */
router.patch(
  '/modules/:id/stories/:storyId',
  authorizeRoles('admin'),
  async (req, res) => {
    const moduleId = Number(req.params.id);
    const storyId = Number(req.params.storyId);
    if (!Number.isFinite(moduleId) || !Number.isFinite(storyId)) {
      return res.status(400).json({ message: 'Invalid module or story id.' });
    }

    try {
      const { rows: linkRows } = await db.query(
        `SELECT * FROM module_stories WHERE module_id = $1 AND story_id = $2`,
        [moduleId, storyId]
      );
      const link = linkRows[0];
      if (!link) {
        return res.status(404).json({ message: 'Story is not in this module.' });
      }

      const visible =
        req.body?.visible_to_students !== undefined
          ? toBool(req.body.visible_to_students, true)
            ? 1
            : 0
          : link.visible_to_students;

      const { rows } = await db.query(
        `UPDATE module_stories
         SET visible_to_students = $1
         WHERE module_id = $2 AND story_id = $3
         RETURNING *`,
        [visible, moduleId, storyId]
      );

      await db.query(
        `UPDATE modules SET updated_at = datetime('now') WHERE id = $1`,
        [moduleId]
      );

      const bundle = await loadStoryBundle(storyId);
      return res.json({
        story: mapModuleStory({
          ...rows[0],
          link_id: rows[0].id,
          link_visible: rows[0].visible_to_students,
          title: bundle?.title,
          subheading: bundle?.subheading,
          status: bundle?.status,
          cover_image: bundle?.cover_image,
        }),
      });
    } catch (err) {
      console.error('[modules] patch story:', err.message);
      return res.status(500).json({ message: 'Failed to update story visibility.' });
    }
  }
);

/** DELETE /api/modules/:id/stories/:storyId — admin */
router.delete(
  '/modules/:id/stories/:storyId',
  authorizeRoles('admin'),
  async (req, res) => {
    const moduleId = Number(req.params.id);
    const storyId = Number(req.params.storyId);
    if (!Number.isFinite(moduleId) || !Number.isFinite(storyId)) {
      return res.status(400).json({ message: 'Invalid module or story id.' });
    }

    try {
      const { rows } = await db.query(
        `DELETE FROM module_stories
         WHERE module_id = $1 AND story_id = $2
         RETURNING id`,
        [moduleId, storyId]
      );
      if (!rows[0]) {
        return res.status(404).json({ message: 'Story is not in this module.' });
      }

      await db.query(
        `UPDATE modules SET updated_at = datetime('now') WHERE id = $1`,
        [moduleId]
      );

      return res.json({ ok: true });
    } catch (err) {
      console.error('[modules] remove story:', err.message);
      return res.status(500).json({ message: 'Failed to remove story from module.' });
    }
  }
);

/**
 * GET /api/modules/:id/stories/:storyId/morals/:moralId/puzzles
 * Same payload as library moral puzzles; students need visible module + story.
 */
router.get(
  '/modules/:id/stories/:storyId/morals/:moralId/puzzles',
  async (req, res) => {
    const moduleId = Number(req.params.id);
    const storyId = Number(req.params.storyId);
    const moralId = Number(req.params.moralId);
    if (![moduleId, storyId, moralId].every(Number.isFinite)) {
      return res.status(400).json({ message: 'Invalid module, story, or moral id.' });
    }

    try {
      const mod = await getModuleOr404(moduleId);
      if (!mod) return res.status(404).json({ message: 'Module not found.' });

      const admin = isAdmin(req);
      if (!admin && !mod.visible_to_students) {
        return res.status(404).json({ message: 'Module not found.' });
      }

      const { rows: linkRows } = await db.query(
        `SELECT * FROM module_stories WHERE module_id = $1 AND story_id = $2`,
        [moduleId, storyId]
      );
      const link = linkRows[0];
      if (!link) {
        return res.status(404).json({ message: 'Story is not in this module.' });
      }
      if (!admin && !link.visible_to_students) {
        return res.status(404).json({ message: 'Story is not in this module.' });
      }

      const story = await loadStoryBundle(storyId);
      if (!story) return res.status(404).json({ message: 'Story not found.' });

      const moral = (story.morals || []).find((m) => Number(m.id) === moralId);
      if (!moral) {
        return res.status(404).json({ message: 'Moral is not linked to this story.' });
      }

      const moralPuzzleService = require('../api/services/moralPuzzleService');
      const assignments = await moralPuzzleService.listAssignments(storyId, moralId);

      return res.json({
        module: mapModule(mod),
        story,
        moral,
        assignments,
        first_puzzle: assignments[0]?.puzzle || null,
      });
    } catch (err) {
      console.error('[modules] moral puzzles:', err.message);
      return res.status(500).json({ message: 'Failed to load moral puzzles.' });
    }
  }
);

/** GET /api/modules/:id/stories/:storyId — view story (students: must be visible) */
router.get('/modules/:id/stories/:storyId', async (req, res) => {
  const moduleId = Number(req.params.id);
  const storyId = Number(req.params.storyId);
  if (!Number.isFinite(moduleId) || !Number.isFinite(storyId)) {
    return res.status(400).json({ message: 'Invalid module or story id.' });
  }

  try {
    const mod = await getModuleOr404(moduleId);
    if (!mod) return res.status(404).json({ message: 'Module not found.' });

    const admin = isAdmin(req);
    if (!admin && !mod.visible_to_students) {
      return res.status(404).json({ message: 'Module not found.' });
    }

    const { rows: linkRows } = await db.query(
      `SELECT * FROM module_stories WHERE module_id = $1 AND story_id = $2`,
      [moduleId, storyId]
    );
    const link = linkRows[0];
    if (!link) {
      return res.status(404).json({ message: 'Story is not in this module.' });
    }
    if (!admin && !link.visible_to_students) {
      return res.status(404).json({ message: 'Story is not in this module.' });
    }

    const story = await loadStoryBundle(storyId);
    if (!story) return res.status(404).json({ message: 'Story not found.' });

    return res.json({
      module: mapModule(mod),
      link: {
        visible_to_students: Boolean(link.visible_to_students),
        added_at: link.added_at,
        display_order: link.display_order,
      },
      story,
    });
  } catch (err) {
    console.error('[modules] get story:', err.message);
    return res.status(500).json({ message: 'Failed to load story.' });
  }
});

module.exports = router;
