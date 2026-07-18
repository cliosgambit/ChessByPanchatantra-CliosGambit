const express = require('express');
const db = require('../api/config/database');
const {
  authenticate,
  authorizeRoles,
  canManageContent,
} = require('../middleware/authMiddleware');

const router = express.Router();

function isAdmin(req) {
  return canManageContent(req.user?.role);
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
    chapter_count: Number(row.chapter_count) || 0,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function mapChapter(row) {
  if (!row) return null;
  return {
    id: row.id,
    module_id: row.module_id,
    name: row.name,
    description: row.description || null,
    visible_to_students: Boolean(row.visible_to_students),
    story_count: Number(row.story_count) || 0,
    display_order: Number(row.display_order) || 0,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function mapModuleStory(row) {
  if (!row) return null;
  return {
    id: row.link_id || row.id,
    module_id: row.module_id,
    chapter_id: row.chapter_id,
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

async function getChapterOr404(chapterId, moduleId) {
  const { rows } = await db.query(
    `SELECT * FROM module_chapters WHERE id = $1 AND module_id = $2`,
    [chapterId, moduleId]
  );
  return rows[0] || null;
}

async function assertModuleAccess(moduleId, req) {
  const mod = await getModuleOr404(moduleId);
  if (!mod) return { error: { status: 404, message: 'Module not found.' } };
  const admin = isAdmin(req);
  if (!admin && !mod.visible_to_students) {
    return { error: { status: 404, message: 'Module not found.' } };
  }
  return { mod, admin };
}

async function assertChapterAccess(moduleId, chapterId, req) {
  const access = await assertModuleAccess(moduleId, req);
  if (access.error) return access;

  const chapter = await getChapterOr404(chapterId, moduleId);
  if (!chapter) return { error: { status: 404, message: 'Chapter not found.' } };
  if (!access.admin && !chapter.visible_to_students) {
    return { error: { status: 404, message: 'Chapter not found.' } };
  }

  return { ...access, chapter };
}

const MODULE_STORY_LIST_SQL = `
  SELECT ms.id AS link_id, ms.module_id, ms.chapter_id, ms.story_id,
         ms.visible_to_students AS link_visible,
         ms.display_order, ms.added_at,
         s.title, s.subheading, s.status, s.cover_image,
         COALESCE(s.cover_image, fi.image_url) AS first_image_url,
         COALESCE(ic.cnt, 0)::int AS image_count,
         COALESCE(mc.cnt, 0)::int AS moral_count
  FROM module_stories ms
  INNER JOIN Stories s ON s.id = ms.story_id
  LEFT JOIN LATERAL (
    SELECT si.image_url
    FROM Story_Images si
    WHERE si.story_id = s.id
    ORDER BY si.display_order ASC, si.id ASC
    LIMIT 1
  ) fi ON true
  LEFT JOIN (
    SELECT story_id, COUNT(*)::int AS cnt
    FROM Story_Images
    GROUP BY story_id
  ) ic ON ic.story_id = s.id
  LEFT JOIN (
    SELECT story_id, COUNT(*)::int AS cnt
    FROM story_moral_mapping
    GROUP BY story_id
  ) mc ON mc.story_id = s.id
  WHERE ms.chapter_id = $1`;

async function loadStoryForPuzzles(storyId) {
  const id = Number(storyId);
  if (!Number.isFinite(id)) return null;

  const { rows } = await db.query(
    `SELECT id, title, subheading, content, cover_image, status
     FROM Stories WHERE id = $1`,
    [id]
  );
  const story = rows[0];
  if (!story) return null;

  const { rows: morals } = await db.query(
    `SELECT m.id, m.moral_code, m.moral_name
     FROM story_moral_mapping sm
     INNER JOIN Morals m ON m.id = sm.moral_id
     WHERE sm.story_id = $1
     ORDER BY m.moral_code ASC`,
    [id]
  );

  return {
    id: Number(story.id),
    title: story.title,
    subheading: story.subheading,
    content: story.content,
    cover_image: story.cover_image,
    status: story.status,
    morals,
  };
}

router.use('/modules', authenticate);

/** GET /api/modules */
router.get('/modules', async (req, res) => {
  try {
    const admin = isAdmin(req);
    const storyJoin = admin
      ? `LEFT JOIN (
           SELECT mc.module_id, COUNT(ms.id)::int AS cnt
           FROM module_stories ms
           INNER JOIN module_chapters mc ON mc.id = ms.chapter_id
           GROUP BY mc.module_id
         ) sc ON sc.module_id = m.id`
      : `LEFT JOIN (
           SELECT mc.module_id, COUNT(ms.id)::int AS cnt
           FROM module_stories ms
           INNER JOIN module_chapters mc ON mc.id = ms.chapter_id
           WHERE ms.visible_to_students = 1 AND mc.visible_to_students = 1
           GROUP BY mc.module_id
         ) sc ON sc.module_id = m.id`;

    const chapterJoin = admin
      ? `LEFT JOIN (
           SELECT module_id, COUNT(*)::int AS cnt
           FROM module_chapters
           GROUP BY module_id
         ) cc ON cc.module_id = m.id`
      : `LEFT JOIN (
           SELECT module_id, COUNT(*)::int AS cnt
           FROM module_chapters
           WHERE visible_to_students = 1
           GROUP BY module_id
         ) cc ON cc.module_id = m.id`;

    const where = admin ? '' : 'WHERE m.visible_to_students = 1';

    const sql = `SELECT m.id, m.name, m.description, m.visible_to_students, m.created_at, m.updated_at,
                        COALESCE(sc.cnt, 0)::int AS story_count,
                        COALESCE(cc.cnt, 0)::int AS chapter_count
                 FROM modules m
                 ${storyJoin}
                 ${chapterJoin}
                 ${where}
                 ORDER BY m.created_at ASC, m.id ASC`;

    const { rows } = await db.query(sql);
    return res.json({ modules: rows.map(mapModule) });
  } catch (err) {
    console.error('[modules] list:', err.message);
    return res.status(500).json({ message: 'Failed to load modules.' });
  }
});

/** POST /api/modules — admin */
router.post('/modules', authorizeRoles('admin', 'coach'), async (req, res) => {
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
    return res.status(201).json({
      module: mapModule({ ...rows[0], story_count: 0, chapter_count: 0 }),
    });
  } catch (err) {
    console.error('[modules] create:', err.message);
    return res.status(500).json({ message: 'Failed to create module.' });
  }
});

/** GET /api/modules/:id — module + chapters */
router.get('/modules/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ message: 'Invalid module id.' });
  }

  try {
    const access = await assertModuleAccess(id, req);
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message });
    }

    const { mod, admin } = access;
    const chapterSql = admin
      ? `SELECT mc.*, COALESCE(sc.cnt, 0)::int AS story_count
         FROM module_chapters mc
         LEFT JOIN (
           SELECT chapter_id, COUNT(*)::int AS cnt
           FROM module_stories
           GROUP BY chapter_id
         ) sc ON sc.chapter_id = mc.id
         WHERE mc.module_id = $1
         ORDER BY mc.display_order ASC, mc.created_at ASC, mc.id ASC`
      : `SELECT mc.*, COALESCE(sc.cnt, 0)::int AS story_count
         FROM module_chapters mc
         LEFT JOIN (
           SELECT chapter_id, COUNT(*)::int AS cnt
           FROM module_stories
           WHERE visible_to_students = 1
           GROUP BY chapter_id
         ) sc ON sc.chapter_id = mc.id
         WHERE mc.module_id = $1 AND mc.visible_to_students = 1
         ORDER BY mc.display_order ASC, mc.created_at ASC, mc.id ASC`;

    const { rows: chapterRows } = await db.query(chapterSql, [id]);
    const chapters = chapterRows.map(mapChapter);
    const storyCount = chapters.reduce((sum, ch) => sum + (ch.story_count || 0), 0);

    const payload = {
      module: mapModule({ ...mod, story_count: storyCount, chapter_count: chapters.length }),
      chapters,
    };

    if (admin) {
      const { rows: attachedRows } = await db.query(
        `SELECT story_id FROM module_stories WHERE module_id = $1`,
        [id]
      );
      payload.attached_story_ids = attachedRows.map((r) => Number(r.story_id));
    }

    return res.json(payload);
  } catch (err) {
    console.error('[modules] get:', err.message);
    return res.status(500).json({ message: 'Failed to load module.' });
  }
});

/** PUT /api/modules/:id — admin */
router.put('/modules/:id', authorizeRoles('admin', 'coach'), async (req, res) => {
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
    const { rows: chapterCountRows } = await db.query(
      `SELECT COUNT(*) AS c FROM module_chapters WHERE module_id = $1`,
      [id]
    );

    return res.json({
      module: mapModule({
        ...rows[0],
        story_count: Number(countRows[0]?.c) || 0,
        chapter_count: Number(chapterCountRows[0]?.c) || 0,
      }),
    });
  } catch (err) {
    console.error('[modules] update:', err.message);
    return res.status(500).json({ message: 'Failed to update module.' });
  }
});

/** DELETE /api/modules/:id — admin */
router.delete('/modules/:id', authorizeRoles('admin', 'coach'), async (req, res) => {
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

/** POST /api/modules/:id/chapters — admin */
router.post('/modules/:id/chapters', authorizeRoles('admin', 'coach'), async (req, res) => {
  const moduleId = Number(req.params.id);
  if (!Number.isFinite(moduleId)) {
    return res.status(400).json({ message: 'Invalid module id.' });
  }

  const name = String(req.body?.name || '').trim();
  if (!name) {
    return res.status(400).json({ message: 'Chapter name is required.' });
  }

  try {
    const mod = await getModuleOr404(moduleId);
    if (!mod) return res.status(404).json({ message: 'Module not found.' });

    const description =
      req.body?.description != null ? String(req.body.description).trim() || null : null;
    const visible = toBool(req.body?.visible_to_students, false) ? 1 : 0;
    const { rows: orderRows } = await db.query(
      `SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order
       FROM module_chapters WHERE module_id = $1`,
      [moduleId]
    );
    const displayOrder = Number(orderRows[0]?.next_order) || 0;

    const { rows } = await db.query(
      `INSERT INTO module_chapters
         (module_id, name, description, visible_to_students, display_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, datetime('now'), datetime('now'))
       RETURNING *`,
      [moduleId, name, description, visible, displayOrder]
    );

    await db.query(
      `UPDATE modules SET updated_at = datetime('now') WHERE id = $1`,
      [moduleId]
    );

    return res.status(201).json({
      chapter: mapChapter({ ...rows[0], story_count: 0 }),
    });
  } catch (err) {
    console.error('[modules] create chapter:', err.message);
    return res.status(500).json({ message: 'Failed to create chapter.' });
  }
});

/** GET /api/modules/:id/chapters/:chapterId — chapter + stories */
router.get('/modules/:id/chapters/:chapterId', async (req, res) => {
  const moduleId = Number(req.params.id);
  const chapterId = Number(req.params.chapterId);
  if (!Number.isFinite(moduleId) || !Number.isFinite(chapterId)) {
    return res.status(400).json({ message: 'Invalid module or chapter id.' });
  }

  try {
    const access = await assertChapterAccess(moduleId, chapterId, req);
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message });
    }

    const { mod, chapter, admin } = access;
    const storySql = admin
      ? `${MODULE_STORY_LIST_SQL}
         ORDER BY ms.display_order ASC, ms.added_at ASC, ms.id ASC`
      : `${MODULE_STORY_LIST_SQL} AND ms.visible_to_students = 1
         ORDER BY ms.display_order ASC, ms.added_at ASC, ms.id ASC`;

    const { rows: storyRows } = await db.query(storySql, [chapterId]);
    const stories = storyRows.map(mapModuleStory);

    return res.json({
      module: mapModule(mod),
      chapter: mapChapter({ ...chapter, story_count: stories.length }),
      stories,
    });
  } catch (err) {
    console.error('[modules] get chapter:', err.message);
    return res.status(500).json({ message: 'Failed to load chapter.' });
  }
});

/** PUT /api/modules/:id/chapters/:chapterId — admin */
router.put(
  '/modules/:id/chapters/:chapterId',
  authorizeRoles('admin', 'coach'),
  async (req, res) => {
    const moduleId = Number(req.params.id);
    const chapterId = Number(req.params.chapterId);
    if (!Number.isFinite(moduleId) || !Number.isFinite(chapterId)) {
      return res.status(400).json({ message: 'Invalid module or chapter id.' });
    }

    try {
      const chapter = await getChapterOr404(chapterId, moduleId);
      if (!chapter) return res.status(404).json({ message: 'Chapter not found.' });

      const name =
        req.body?.name !== undefined ? String(req.body.name || '').trim() : chapter.name;
      if (!name) {
        return res.status(400).json({ message: 'Chapter name is required.' });
      }
      const description =
        req.body?.description !== undefined
          ? String(req.body.description || '').trim() || null
          : chapter.description;
      const visible =
        req.body?.visible_to_students !== undefined
          ? toBool(req.body.visible_to_students, false)
            ? 1
            : 0
          : chapter.visible_to_students;

      const { rows } = await db.query(
        `UPDATE module_chapters
         SET name = $1,
             description = $2,
             visible_to_students = $3,
             updated_at = datetime('now')
         WHERE id = $4 AND module_id = $5
         RETURNING *`,
        [name, description, visible, chapterId, moduleId]
      );

      const { rows: countRows } = await db.query(
        `SELECT COUNT(*) AS c FROM module_stories WHERE chapter_id = $1`,
        [chapterId]
      );

      await db.query(
        `UPDATE modules SET updated_at = datetime('now') WHERE id = $1`,
        [moduleId]
      );

      return res.json({
        chapter: mapChapter({
          ...rows[0],
          story_count: Number(countRows[0]?.c) || 0,
        }),
      });
    } catch (err) {
      console.error('[modules] update chapter:', err.message);
      return res.status(500).json({ message: 'Failed to update chapter.' });
    }
  }
);

/** DELETE /api/modules/:id/chapters/:chapterId — admin */
router.delete(
  '/modules/:id/chapters/:chapterId',
  authorizeRoles('admin', 'coach'),
  async (req, res) => {
    const moduleId = Number(req.params.id);
    const chapterId = Number(req.params.chapterId);
    if (!Number.isFinite(moduleId) || !Number.isFinite(chapterId)) {
      return res.status(400).json({ message: 'Invalid module or chapter id.' });
    }

    try {
      const chapter = await getChapterOr404(chapterId, moduleId);
      if (!chapter) return res.status(404).json({ message: 'Chapter not found.' });

      await db.query(
        `DELETE FROM module_chapters WHERE id = $1 AND module_id = $2`,
        [chapterId, moduleId]
      );
      await db.query(
        `UPDATE modules SET updated_at = datetime('now') WHERE id = $1`,
        [moduleId]
      );

      return res.json({ ok: true });
    } catch (err) {
      console.error('[modules] delete chapter:', err.message);
      return res.status(500).json({ message: 'Failed to delete chapter.' });
    }
  }
);

/** POST /api/modules/:id/chapters/:chapterId/stories — admin */
router.post(
  '/modules/:id/chapters/:chapterId/stories',
  authorizeRoles('admin', 'coach'),
  async (req, res) => {
    const moduleId = Number(req.params.id);
    const chapterId = Number(req.params.chapterId);
    const storyId = Number(req.body?.story_id);
    if (!Number.isFinite(moduleId) || !Number.isFinite(chapterId) || !Number.isFinite(storyId)) {
      return res.status(400).json({ message: 'Module id, chapter id, and story_id are required.' });
    }

    try {
      const chapter = await getChapterOr404(chapterId, moduleId);
      if (!chapter) return res.status(404).json({ message: 'Chapter not found.' });

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
         FROM module_stories WHERE chapter_id = $1`,
        [chapterId]
      );
      const displayOrder = Number(orderRows[0]?.next_order) || 0;

      const { rows } = await db.query(
        `INSERT INTO module_stories
           (module_id, chapter_id, story_id, visible_to_students, display_order, added_at)
         VALUES ($1, $2, $3, $4, $5, datetime('now'))
         RETURNING *`,
        [moduleId, chapterId, storyId, visible, displayOrder]
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
      return res.status(500).json({ message: 'Failed to add story to chapter.' });
    }
  }
);

/** PATCH /api/modules/:id/chapters/:chapterId/stories/:storyId — admin */
router.patch(
  '/modules/:id/chapters/:chapterId/stories/:storyId',
  authorizeRoles('admin', 'coach'),
  async (req, res) => {
    const moduleId = Number(req.params.id);
    const chapterId = Number(req.params.chapterId);
    const storyId = Number(req.params.storyId);
    if (![moduleId, chapterId, storyId].every(Number.isFinite)) {
      return res.status(400).json({ message: 'Invalid module, chapter, or story id.' });
    }

    try {
      const { rows: linkRows } = await db.query(
        `SELECT * FROM module_stories
         WHERE module_id = $1 AND chapter_id = $2 AND story_id = $3`,
        [moduleId, chapterId, storyId]
      );
      const link = linkRows[0];
      if (!link) {
        return res.status(404).json({ message: 'Story is not in this chapter.' });
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
         WHERE module_id = $2 AND chapter_id = $3 AND story_id = $4
         RETURNING *`,
        [visible, moduleId, chapterId, storyId]
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

/** DELETE /api/modules/:id/chapters/:chapterId/stories/:storyId — admin */
router.delete(
  '/modules/:id/chapters/:chapterId/stories/:storyId',
  authorizeRoles('admin', 'coach'),
  async (req, res) => {
    const moduleId = Number(req.params.id);
    const chapterId = Number(req.params.chapterId);
    const storyId = Number(req.params.storyId);
    if (![moduleId, chapterId, storyId].every(Number.isFinite)) {
      return res.status(400).json({ message: 'Invalid module, chapter, or story id.' });
    }

    try {
      const { rows } = await db.query(
        `DELETE FROM module_stories
         WHERE module_id = $1 AND chapter_id = $2 AND story_id = $3
         RETURNING id`,
        [moduleId, chapterId, storyId]
      );
      if (!rows[0]) {
        return res.status(404).json({ message: 'Story is not in this chapter.' });
      }

      await db.query(
        `UPDATE modules SET updated_at = datetime('now') WHERE id = $1`,
        [moduleId]
      );

      return res.json({ ok: true });
    } catch (err) {
      console.error('[modules] remove story:', err.message);
      return res.status(500).json({ message: 'Failed to remove story from chapter.' });
    }
  }
);

/**
 * GET /api/modules/:id/chapters/:chapterId/stories/:storyId/morals/:moralId/puzzles
 */
router.get(
  '/modules/:id/chapters/:chapterId/stories/:storyId/morals/:moralId/puzzles',
  async (req, res) => {
    const moduleId = Number(req.params.id);
    const chapterId = Number(req.params.chapterId);
    const storyId = Number(req.params.storyId);
    const moralId = Number(req.params.moralId);
    if (![moduleId, chapterId, storyId, moralId].every(Number.isFinite)) {
      return res.status(400).json({ message: 'Invalid module, chapter, story, or moral id.' });
    }

    try {
      const access = await assertChapterAccess(moduleId, chapterId, req);
      if (access.error) {
        return res.status(access.error.status).json({ message: access.error.message });
      }

      const { mod, chapter } = access;

      const { rows: linkRows } = await db.query(
        `SELECT * FROM module_stories
         WHERE module_id = $1 AND chapter_id = $2 AND story_id = $3`,
        [moduleId, chapterId, storyId]
      );
      const link = linkRows[0];
      if (!link) {
        return res.status(404).json({ message: 'Story is not in this chapter.' });
      }
      if (!access.admin && !link.visible_to_students) {
        return res.status(404).json({ message: 'Story is not in this chapter.' });
      }

      const story = await loadStoryForPuzzles(storyId);
      if (!story) return res.status(404).json({ message: 'Story not found.' });

      const moral = (story.morals || []).find((m) => Number(m.id) === moralId);
      if (!moral) {
        return res.status(404).json({ message: 'Moral is not linked to this story.' });
      }

      const moralPuzzleService = require('../api/services/moralPuzzleService');
      const assignments = await moralPuzzleService.listAssignments(storyId, moralId);

      return res.json({
        module: mapModule(mod),
        chapter: mapChapter(chapter),
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

/** GET /api/modules/:id/chapters/:chapterId/stories/:storyId */
router.get(
  '/modules/:id/chapters/:chapterId/stories/:storyId',
  async (req, res) => {
    const moduleId = Number(req.params.id);
    const chapterId = Number(req.params.chapterId);
    const storyId = Number(req.params.storyId);
    if (![moduleId, chapterId, storyId].every(Number.isFinite)) {
      return res.status(400).json({ message: 'Invalid module, chapter, or story id.' });
    }

    try {
      const access = await assertChapterAccess(moduleId, chapterId, req);
      if (access.error) {
        return res.status(access.error.status).json({ message: access.error.message });
      }

      const { mod, chapter } = access;

      const { rows: linkRows } = await db.query(
        `SELECT * FROM module_stories
         WHERE module_id = $1 AND chapter_id = $2 AND story_id = $3`,
        [moduleId, chapterId, storyId]
      );
      const link = linkRows[0];
      if (!link) {
        return res.status(404).json({ message: 'Story is not in this chapter.' });
      }
      if (!access.admin && !link.visible_to_students) {
        return res.status(404).json({ message: 'Story is not in this chapter.' });
      }

      const story = await loadStoryBundle(storyId);
      if (!story) return res.status(404).json({ message: 'Story not found.' });

      return res.json({
        module: mapModule(mod),
        chapter: mapChapter(chapter),
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
  }
);

module.exports = router;
