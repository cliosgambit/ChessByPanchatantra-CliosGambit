/**
 * Migrate Supabase `story` (+ principles / story_mapping) into local Library tables.
 * Does NOT migrate puzzles.
 *
 * Also links cover images from frontend/public/story_images/{n}.png
 * (legacy convention: ST001 → 1.png).
 *
 * Requires DATABASE_URL in backend/.env.
 *
 * Usage (from repo root or backend/):
 *   node backend/scripts/migrateStories.js
 */
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
});

// Prefer local `pg` if installed; fall back to _version_1 for one-off migrations.
let Pool;
try {
  ({ Pool } = require('pg'));
} catch {
  const requireFromVersion1 = createRequire(
    path.join(__dirname, '..', '..', '_version_1', 'backend', 'package.json')
  );
  ({ Pool } = requireFromVersion1('pg'));
}

const localDb = require('../api/config/database');
const { ensureLibraryTables } = require('./ensureLibraryTables');
const { STORY_IMAGES_DIR, ensureStoryImagesDir } = require('../api/utils/storyImageUpload');

function storyNumericId(storyId) {
  const n = parseInt(String(storyId || '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function mapStatus(status) {
  const s = String(status || '').toLowerCase().trim();
  if (s === 'published' || s === 'active') return 'published';
  return 'draft';
}

function localImageUrlForStory(storyId) {
  const n = storyNumericId(storyId);
  if (!n) return null;
  const filename = `${n}.png`;
  const abs = path.join(STORY_IMAGES_DIR, filename);
  if (!fs.existsSync(abs)) return null;
  return `/story_images/${filename}`;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL missing in backend/.env');
  }

  ensureStoryImagesDir();
  await ensureLibraryTables();

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const { rows: stories } = await pool.query(`
      SELECT *
      FROM story
      ORDER BY
        COALESCE(story_number, 2147483647) ASC,
        story_id ASC
    `);
    console.log('Fetched remote stories:', stories.length);

    const { rows: principles } = await pool.query(`SELECT id, name FROM principles`);
    console.log('Fetched remote principles:', principles.length);

    const { rows: mappings } = await pool.query(`
      SELECT story_id, principle_id, story_text, mapping_id
      FROM story_mapping
      ORDER BY story_id, mapping_id
    `);
    console.log('Fetched remote story_mapping rows:', mappings.length);

    const principleById = new Map(
      principles.map((p) => [String(p.id), String(p.name || p.id).trim() || String(p.id)])
    );

    const mappingsByStory = new Map();
    for (const row of mappings) {
      const sid = String(row.story_id);
      if (!mappingsByStory.has(sid)) mappingsByStory.set(sid, []);
      mappingsByStory.get(sid).push(row);
    }

    // Admin creator if present
    const adminRes = await localDb.query(
      `SELECT id FROM "Login" WHERE lower("Role") = 'admin' ORDER BY id ASC LIMIT 1`
    );
    const createdBy = adminRes.rows[0]?.id != null ? Number(adminRes.rows[0].id) : null;

    await localDb.query('BEGIN');
    try {
      // Full replace of library story data (puzzles tables left intact; assignments cascade)
      await localDb.query(`DELETE FROM Stories`);
      await localDb.query(`DELETE FROM Morals`);

      // Upsert morals from principles used by any story mapping
      const usedPrincipleIds = [
        ...new Set(mappings.map((m) => String(m.principle_id)).filter(Boolean)),
      ].sort((a, b) => {
        const an = parseInt(String(a).replace(/\D/g, ''), 10) || 0;
        const bn = parseInt(String(b).replace(/\D/g, ''), 10) || 0;
        return an - bn || String(a).localeCompare(String(b));
      });

      const moralIdByPrinciple = new Map();
      let moralSeq = 0;
      for (const principleId of usedPrincipleIds) {
        moralSeq += 1;
        const moralCode = `M_${String(moralSeq).padStart(3, '0')}`;
        const moralName = principleById.get(principleId) || principleId;
        const { rows } = await localDb.query(
          `INSERT INTO Morals (moral_code, moral_name, created_at)
           VALUES ($1, $2, datetime('now'))
           RETURNING id`,
          [moralCode, moralName]
        );
        moralIdByPrinciple.set(principleId, Number(rows[0].id));
      }

      // Fallback moral for any story with no mappings (should not happen, but safe)
      let fallbackMoralId = null;
      async function getFallbackMoralId() {
        if (fallbackMoralId != null) return fallbackMoralId;
        moralSeq += 1;
        const moralCode = `M_${String(moralSeq).padStart(3, '0')}`;
        const { rows } = await localDb.query(
          `INSERT INTO Morals (moral_code, moral_name, created_at)
           VALUES ($1, $2, datetime('now'))
           RETURNING id`,
          [moralCode, 'General']
        );
        fallbackMoralId = Number(rows[0].id);
        return fallbackMoralId;
      }

      let inserted = 0;
      let withImage = 0;
      let withoutImage = 0;

      for (const row of stories) {
        const remoteId = String(row.story_id);
        const title = String(row.title || '').trim() || remoteId;
        const subheading =
          row.description != null && String(row.description).trim()
            ? String(row.description).trim()
            : null;
        const status = mapStatus(row.status);
        const imageUrl = localImageUrlForStory(remoteId);

        const storyMaps = mappingsByStory.get(remoteId) || [];
        const contentParts = storyMaps
          .map((m) => (m.story_text != null ? String(m.story_text).trim() : ''))
          .filter(Boolean);
        const content = contentParts.length ? contentParts.join('\n\n') : null;

        const { rows: insertedRows } = await localDb.query(
          `INSERT INTO Stories
             (title, subheading, content, cover_image, status, created_by, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, datetime('now'), datetime('now'))
           RETURNING id`,
          [
            title,
            subheading,
            content,
            imageUrl,
            status,
            Number.isFinite(createdBy) ? createdBy : null,
          ]
        );
        const storyId = Number(insertedRows[0].id);

        if (imageUrl) {
          await localDb.query(
            `INSERT INTO Story_Images (story_id, image_url, display_order)
             VALUES ($1, $2, 0)`,
            [storyId, imageUrl]
          );
          withImage += 1;
        } else {
          withoutImage += 1;
        }

        const principleIds = [
          ...new Set(storyMaps.map((m) => String(m.principle_id)).filter(Boolean)),
        ];
        if (principleIds.length === 0) {
          const mid = await getFallbackMoralId();
          await localDb.query(
            `INSERT INTO story_moral_mapping (story_id, moral_id) VALUES ($1, $2)`,
            [storyId, mid]
          );
        } else {
          for (const pid of principleIds) {
            const mid = moralIdByPrinciple.get(pid);
            if (mid == null) continue;
            await localDb.query(
              `INSERT OR IGNORE INTO story_moral_mapping (story_id, moral_id) VALUES ($1, $2)`,
              [storyId, mid]
            );
          }
        }

        inserted += 1;
      }

      await localDb.query('COMMIT');

      const localStories = await localDb.query(`SELECT COUNT(*) AS c FROM Stories`);
      const localMorals = await localDb.query(`SELECT COUNT(*) AS c FROM Morals`);
      const localImages = await localDb.query(`SELECT COUNT(*) AS c FROM Story_Images`);
      const localMaps = await localDb.query(`SELECT COUNT(*) AS c FROM story_moral_mapping`);

      console.log('Inserted stories:', inserted);
      console.log('With local image:', withImage, '| Without image:', withoutImage);
      console.log('Local counts:', {
        Stories: localStories.rows[0]?.c,
        Morals: localMorals.rows[0]?.c,
        Story_Images: localImages.rows[0]?.c,
        story_moral_mapping: localMaps.rows[0]?.c,
      });
      console.log('Images directory:', STORY_IMAGES_DIR);
    } catch (err) {
      await localDb.query('ROLLBACK');
      throw err;
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
