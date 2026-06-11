import { col } from '../lib/supabase/columnMapper';
import { deleteRow, fetchTable, insertRow, updateRow } from '../lib/supabase/crud';
import { subscribeToTable, unsubscribeChannel } from '../lib/supabase/realtime';

export const TABLES = {
  module: 'module',
  chapter: 'chapter',
  story: 'story',
};

export function parseModuleIdNumber(moduleId) {
  const match = String(moduleId || '').trim().match(/^MOD(\d+)$/i);
  return match ? parseInt(match[1], 10) : null;
}

function resolveModuleNumber(row) {
  const stored = col(row, 'module_number');
  if (stored != null && stored !== '') {
    const num = Number(stored);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return parseModuleIdNumber(col(row, 'module_id'));
}

function mapModule(row) {
  if (!row) return null;
  return {
    module_id: col(row, 'module_id'),
    module_name: col(row, 'module_name'),
    chapter_ids: col(row, 'chapter_ids'),
    module_number: resolveModuleNumber(row),
    themeKey: col(row, 'theme_key') || null,
    status: col(row, 'status') || 'active',
  };
}

export function sortModulesByNumber(modules) {
  return [...modules].sort((a, b) => {
    const an = Number(a.module_number);
    const bn = Number(b.module_number);
    if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
    if (Number.isFinite(an) && !Number.isFinite(bn)) return -1;
    if (!Number.isFinite(an) && Number.isFinite(bn)) return 1;
    return String(a.module_id).localeCompare(String(b.module_id));
  });
}

function resolveChapterNumber(row) {
  const stored = col(row, 'chapter_number');
  if (stored != null && stored !== '') {
    const num = Number(stored);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return null;
}

function mapChapter(row) {
  if (!row) return null;
  return {
    chapter_id: col(row, 'chapter_id'),
    chapter_name: col(row, 'chapter_name'),
    module_id: col(row, 'module_id'),
    story_ids: col(row, 'story_ids'),
    chapter_number: resolveChapterNumber(row),
    themeKey: col(row, 'theme_key') || null,
    status: col(row, 'status') || 'draft',
  };
}

export function sortChaptersByNumber(chapters) {
  return [...chapters].sort((a, b) => {
    const an = Number(a.chapter_number);
    const bn = Number(b.chapter_number);
    if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
    if (Number.isFinite(an) && !Number.isFinite(bn)) return -1;
    if (!Number.isFinite(an) && Number.isFinite(bn)) return 1;
    return String(a.chapter_id).localeCompare(String(b.chapter_id));
  });
}

function mapStory(row) {
  if (!row) return null;
  return {
    story_id: col(row, 'story_id'),
    title: col(row, 'title'),
    description: col(row, 'description'),
    chapter_id: col(row, 'chapter_id'),
    module_id: col(row, 'module_id'),
    status: col(row, 'status') || 'published',
    tags: col(row, 'tags'),
  };
}

export async function getNextModuleNumber() {
  const modules = await fetchModules();
  const max = modules.reduce(
    (highest, mod) => Math.max(highest, Number(mod.module_number) || 0),
    0
  );
  return max + 1;
}

export async function fetchModules() {
  const rows = await fetchTable(TABLES.module);
  const mapped = rows.map((row) => mapModule(row)).filter(Boolean);
  return sortModulesByNumber(mapped);
}

export async function getNextChapterNumber(moduleId) {
  const chapters = await fetchChaptersByModule(moduleId);
  const max = chapters.reduce(
    (highest, ch) => Math.max(highest, Number(ch.chapter_number) || 0),
    0
  );
  return max + 1;
}

export async function fetchChaptersByModule(moduleId) {
  const rows = await fetchTable(TABLES.chapter, { orderBy: 'chapter_id', ascending: true });
  const mapped = rows.map(mapChapter).filter((c) => c.module_id === moduleId);
  return sortChaptersByNumber(mapped);
}

export async function fetchStoriesByChapter(chapterId) {
  const rows = await fetchTable(TABLES.story, { orderBy: 'story_id', ascending: true });
  return rows.map(mapStory).filter((s) => s.chapter_id === chapterId);
}

function mapStoryMapping(row) {
  if (!row) return null;
  return {
    mapping_id: col(row, 'mapping_id'),
    story_id: col(row, 'story_id'),
    principle_id: col(row, 'principle_id'),
    story_text: col(row, 'story_text'),
  };
}

export async function fetchStoryById(storyId) {
  const rows = await fetchTable(TABLES.story);
  const row = rows.find((r) => col(r, 'story_id') === storyId);
  if (!row) {
    throw new Error(`Story with ID ${storyId} not found.`);
  }
  return mapStory(row);
}

export async function fetchStoryMappings(storyId) {
  const rows = await fetchTable('story_mapping', { orderBy: 'mapping_id', ascending: true });
  return rows.map(mapStoryMapping).filter((m) => m?.story_id === storyId);
}

function mapPrinciplePosition(row) {
  if (!row) return null;
  return {
    principle_id: col(row, 'principle_id'),
    principle: col(row, 'principle'),
    fen_with_move: col(row, 'fen_with_move'),
    puzzle_list: col(row, 'puzzle_list'),
  };
}

export async function fetchPrinciplePosition(principleId) {
  const rows = await fetchTable('principle_position');
  const row = rows.find((r) => col(r, 'principle_id') === principleId);
  if (!row) {
    throw new Error(`Principle with ID ${principleId} not found.`);
  }
  return mapPrinciplePosition(row);
}

export async function fetchRatedPuzzlesForPrinciple(principleId) {
  const rows = await fetchTable('3000_rated_puzzles');
  return rows.filter((r) => col(r, 'principle_id') === principleId && col(r, 'Fen'));
}

export async function fetchPuzzleById(puzzleId) {
  const rows = await fetchTable('chess_puzzle');
  const row = rows.find((r) => col(r, 'chess_puzzle_id') === puzzleId);
  if (!row) {
    throw new Error(`Puzzle with ID ${puzzleId} not found.`);
  }
  return {
    chess_puzzle_id: col(row, 'chess_puzzle_id'),
    fen_with_move: col(row, 'fen_with_move'),
    answer: col(row, 'answer'),
  };
}

export async function fetchPuzzleAnswer(puzzleId) {
  const puzzle = await fetchPuzzleById(puzzleId);
  return { puzzleId, answer: puzzle.answer || '' };
}

export async function createModule({ module_id, module_name, module_number, theme_key, status }) {
  const num = Number(module_number);
  if (!Number.isFinite(num) || num < 1) {
    throw new Error('Module number is required.');
  }

  const existing = await fetchTable(TABLES.module);
  const duplicate = existing.some((row) => {
    const existingNum = resolveModuleNumber(row);
    return existingNum === num;
  });
  if (duplicate) {
    throw new Error('Module number already exists.');
  }

  const id =
    module_id ||
    `MOD${num}`;

  const idTaken = existing.some((row) => col(row, 'module_id') === id);
  if (idTaken) {
    throw new Error('Module number already exists.');
  }

  return insertRow(TABLES.module, {
    module_id: id,
    module_name,
    chapter_ids: '[]',
    module_number: num,
    theme_key: theme_key || null,
    status: status || 'active',
  });
}

export async function updateModule(
  moduleId,
  { module_name, module_number, theme_key, status }
) {
  const num = Number(module_number);
  if (!Number.isFinite(num) || num < 1) {
    throw new Error('Module number is required.');
  }
  if (!module_name?.trim()) {
    throw new Error('Module title is required.');
  }
  if (!status) {
    throw new Error('Status is required.');
  }

  const existing = await fetchTable(TABLES.module);
  const currentRow = existing.find((row) => col(row, 'module_id') === moduleId);
  if (!currentRow) {
    throw new Error('Module not found.');
  }

  const duplicate = existing.some((row) => {
    if (col(row, 'module_id') === moduleId) return false;
    return resolveModuleNumber(row) === num;
  });
  if (duplicate) {
    throw new Error('Module number already exists.');
  }

  return updateRow(TABLES.module, 'module_id', moduleId, {
    module_name: module_name.trim(),
    module_number: num,
    theme_key: theme_key || null,
    status,
  });
}

export async function createChapter({
  chapter_id,
  chapter_name,
  module_id,
  chapter_number,
  theme_key,
  status,
}) {
  if (!chapter_name?.trim()) {
    throw new Error('Chapter title is required.');
  }
  if (!module_id) {
    throw new Error('Module is required.');
  }

  const num = chapter_number ?? (await getNextChapterNumber(module_id));
  const normalizedNum = Number(num);
  if (!Number.isFinite(normalizedNum) || normalizedNum < 1) {
    throw new Error('Chapter number is required.');
  }

  const existing = await fetchTable(TABLES.chapter);
  const duplicate = existing.some((row) => {
    if (col(row, 'module_id') !== module_id) return false;
    return resolveChapterNumber(row) === normalizedNum;
  });
  if (duplicate) {
    throw new Error('Chapter number already exists in this module.');
  }

  const id = chapter_id || `${module_id}-CH${String(normalizedNum).padStart(2, '0')}`;
  const idTaken = existing.some((row) => col(row, 'chapter_id') === id);
  if (idTaken) {
    throw new Error('Chapter could not be created. Please try again.');
  }

  const normalizedStatus = status === 'active' ? 'active' : 'draft';

  return insertRow(TABLES.chapter, {
    chapter_id: id,
    chapter_name: chapter_name.trim(),
    module_id,
    story_ids: '[]',
    chapter_number: normalizedNum,
    theme_key: theme_key || null,
    status: normalizedStatus,
  });
}

export async function updateChapter(chapterId, { chapter_name, theme_key, status }) {
  if (!chapter_name?.trim()) {
    throw new Error('Chapter title is required.');
  }
  if (!status) {
    throw new Error('Status is required.');
  }

  const rows = await fetchTable(TABLES.chapter);
  const existing = rows.find((row) => col(row, 'chapter_id') === chapterId);
  if (!existing) {
    throw new Error('Chapter not found.');
  }

  const normalizedStatus = status === 'active' ? 'active' : 'draft';

  return updateRow(TABLES.chapter, 'chapter_id', chapterId, {
    chapter_name: chapter_name.trim(),
    theme_key: theme_key || null,
    status: normalizedStatus,
  });
}

export async function createStory(payload) {
  const status = payload.status === 'draft' ? 'draft' : 'active';
  return insertRow(TABLES.story, {
    story_id: payload.story_id,
    title: payload.title,
    description: payload.description || '',
    chapter_id: payload.chapter_id,
    module_id: payload.module_id || '',
    status,
    tags: payload.tags || '[]',
  });
}

export async function updateStory(storyId, { title, description, status, tags }) {
  if (!title?.trim()) {
    throw new Error('Story title is required.');
  }
  if (!status) {
    throw new Error('Status is required.');
  }

  const rows = await fetchTable(TABLES.story);
  const existing = rows.find((row) => col(row, 'story_id') === storyId);
  if (!existing) {
    throw new Error('Story not found.');
  }

  const normalizedStatus = status === 'draft' ? 'draft' : 'active';

  return updateRow(TABLES.story, 'story_id', storyId, {
    title: title.trim(),
    description: description?.trim() || '',
    status: normalizedStatus,
    tags: tags ?? col(existing, 'tags') ?? '[]',
  });
}

export async function updateStoryStatus(storyId, status) {
  const normalizedStatus = status === 'draft' ? 'draft' : 'active';
  return updateRow(TABLES.story, 'story_id', storyId, { status: normalizedStatus });
}

/**
 * @typedef {{ hasContent: boolean, mappingCount: number, puzzleCount: number, principleCount: number }} StoryAssociationCheck
 */

/**
 * @param {string} storyId
 * @returns {Promise<StoryAssociationCheck>}
 */
export async function getStoryAssociatedContent(storyId) {
  const [mappingRows, puzzleRows] = await Promise.all([
    fetchTable('story_mapping'),
    fetchTable('chess_puzzle'),
  ]);

  const mappings = mappingRows.filter((row) => col(row, 'story_id') === storyId);
  const mappingCount = mappings.length;
  const principleIds = new Set(
    mappings.map((row) => col(row, 'principle_id')).filter(Boolean)
  );
  const puzzleCount = puzzleRows.filter((row) =>
    principleIds.has(col(row, 'principle_id'))
  ).length;

  const hasContent = mappingCount > 0 || puzzleCount > 0;
  return { hasContent, mappingCount, puzzleCount, principleCount: principleIds.size };
}

function storyDeletionReason(association) {
  if (association.mappingCount > 0) return 'contains principles';
  if (association.puzzleCount > 0) return 'contains puzzles';
  return 'contains associated content';
}

function formatStoryDeletionLabel(storyRow, index) {
  const title = col(storyRow, 'title');
  const num = index != null ? String(index + 1).padStart(2, '0') : col(storyRow, 'story_id');
  return `Story ${num}${title ? ` — ${title}` : ''}`;
}

/**
 * @typedef {{ storyId: string, label: string, reason: string }} StoryDeletionBlock
 * @typedef {{ blocked: StoryDeletionBlock[], safe: string[], canDeleteAll: boolean }} StoriesDeletionStatus
 */

/**
 * @param {string[]} storyIds
 * @returns {Promise<StoriesDeletionStatus>}
 */
export async function getStoriesDeletionStatus(storyIds) {
  if (!storyIds.length) {
    return { blocked: [], safe: [], canDeleteAll: true };
  }

  const [storyRows, mappingRows, puzzleRows] = await Promise.all([
    fetchTable(TABLES.story),
    fetchTable('story_mapping'),
    fetchTable('chess_puzzle'),
  ]);

  const blocked = [];
  const safe = [];

  for (const storyId of storyIds) {
    const storyRow = storyRows.find((row) => col(row, 'story_id') === storyId);
    if (!storyRow) {
      safe.push(storyId);
      continue;
    }

    const mappings = mappingRows.filter((row) => col(row, 'story_id') === storyId);
    const mappingCount = mappings.length;
    const principleIds = new Set(
      mappings.map((row) => col(row, 'principle_id')).filter(Boolean)
    );
    const puzzleCount = puzzleRows.filter((row) =>
      principleIds.has(col(row, 'principle_id'))
    ).length;

    const storyIndex = storyRows.findIndex((row) => col(row, 'story_id') === storyId);
    const hasContent = mappingCount > 0 || puzzleCount > 0;

    if (hasContent) {
      blocked.push({
        storyId,
        label: formatStoryDeletionLabel(storyRow, storyIndex),
        reason: storyDeletionReason({ mappingCount, puzzleCount }),
      });
    } else {
      safe.push(storyId);
    }
  }

  return { blocked, safe, canDeleteAll: blocked.length === 0 };
}

async function removeStoriesFromChapterList(chapterId, storyIdsToRemove) {
  if (!storyIdsToRemove.length) return;

  const chapterRows = await fetchTable(TABLES.chapter);
  const chapterRow = chapterRows.find((row) => col(row, 'chapter_id') === chapterId);
  if (!chapterRow) return;

  const removeSet = new Set(storyIdsToRemove);
  const ids = parseIdList(col(chapterRow, 'story_ids')).filter((id) => !removeSet.has(id));
  const story_ids =
    ids.length > 0 ? `[${ids.map((id) => `'${id}'`).join(',')}]` : '[]';
  await updateRow(TABLES.chapter, 'chapter_id', chapterId, { story_ids });
}

/**
 * @param {string[]} storyIds
 * @param {string} [chapterId]
 * @returns {Promise<void>}
 */
export async function deleteStories(storyIds, chapterId) {
  const uniqueIds = [...new Set(storyIds.filter(Boolean))];
  if (!uniqueIds.length) return;

  const status = await getStoriesDeletionStatus(uniqueIds);
  if (!status.canDeleteAll) {
    const err = new Error('Cannot delete selected stories.');
    err.blocked = status.blocked;
    throw err;
  }

  const storyRows = await fetchTable(TABLES.story);
  const rowsToDelete = uniqueIds
    .map((id) => storyRows.find((row) => col(row, 'story_id') === id))
    .filter(Boolean);

  await Promise.all(uniqueIds.map((id) => deleteRow(TABLES.story, 'story_id', id)));

  const byChapter = new Map();
  for (const row of rowsToDelete) {
    const chId = chapterId || col(row, 'chapter_id');
    const storyId = col(row, 'story_id');
    if (!chId || !storyId) continue;
    if (!byChapter.has(chId)) byChapter.set(chId, []);
    byChapter.get(chId).push(storyId);
  }

  await Promise.all(
    [...byChapter.entries()].map(([chId, ids]) => removeStoriesFromChapterList(chId, ids))
  );
}

/**
 * @typedef {{ hasContent: boolean, chapterCount: number, storyCount: number, chapterIdsCount: number }} ModuleAssociationCheck
 */

function parseIdList(value) {
  if (!value || typeof value !== 'string') return [];
  return value
    .trim()
    .replace(/^\[|\]$/g, '')
    .replace(/'/g, '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

/**
 * Returns whether a module has linked chapters, stories, or chapter_ids entries.
 * @param {string} moduleId
 * @returns {Promise<ModuleAssociationCheck>}
 */
export async function getModuleAssociatedContent(moduleId) {
  const [chapterRows, storyRows, moduleRows] = await Promise.all([
    fetchTable(TABLES.chapter),
    fetchTable(TABLES.story),
    fetchTable(TABLES.module),
  ]);

  const moduleRow = moduleRows.find((row) => col(row, 'module_id') === moduleId);
  const chapterCount = chapterRows.filter((row) => col(row, 'module_id') === moduleId).length;
  const storyCount = storyRows.filter((row) => col(row, 'module_id') === moduleId).length;
  const chapterIdsCount = parseIdList(col(moduleRow, 'chapter_ids')).length;

  const hasContent = chapterCount > 0 || storyCount > 0 || chapterIdsCount > 0;
  return { hasContent, chapterCount, storyCount, chapterIdsCount };
}

export async function deleteModule(moduleId) {
  const association = await getModuleAssociatedContent(moduleId);
  if (association.hasContent) {
    throw new Error(
      'This module contains associated content. Delete all associated content first.'
    );
  }
  return deleteRow(TABLES.module, 'module_id', moduleId);
}

function moduleDeletionReason(association) {
  if (association.chapterCount > 0) return 'contains chapters';
  if (association.storyCount > 0) return 'contains stories';
  if (association.chapterIdsCount > 0) return 'contains chapter references';
  return 'contains associated content';
}

function formatModuleDeletionLabel(moduleRow) {
  const num = resolveModuleNumber(moduleRow);
  const name = col(moduleRow, 'module_name');
  if (num != null) {
    return `Module ${String(num).padStart(2, '0')}${name ? ` — ${name}` : ''}`;
  }
  return name || col(moduleRow, 'module_id');
}

/**
 * @typedef {{ moduleId: string, label: string, reason: string }} ModuleDeletionBlock
 * @typedef {{ blocked: ModuleDeletionBlock[], safe: string[], canDeleteAll: boolean }} ModulesDeletionStatus
 */

/**
 * @param {string[]} moduleIds
 * @returns {Promise<ModulesDeletionStatus>}
 */
export async function getModulesDeletionStatus(moduleIds) {
  if (!moduleIds.length) {
    return { blocked: [], safe: [], canDeleteAll: true };
  }

  const [chapterRows, storyRows, moduleRows] = await Promise.all([
    fetchTable(TABLES.chapter),
    fetchTable(TABLES.story),
    fetchTable(TABLES.module),
  ]);

  const blocked = [];
  const safe = [];

  for (const moduleId of moduleIds) {
    const moduleRow = moduleRows.find((row) => col(row, 'module_id') === moduleId);
    if (!moduleRow) {
      safe.push(moduleId);
      continue;
    }

    const chapterCount = chapterRows.filter((row) => col(row, 'module_id') === moduleId).length;
    const storyCount = storyRows.filter((row) => col(row, 'module_id') === moduleId).length;
    const chapterIdsCount = parseIdList(col(moduleRow, 'chapter_ids')).length;
    const hasContent = chapterCount > 0 || storyCount > 0 || chapterIdsCount > 0;

    if (hasContent) {
      blocked.push({
        moduleId,
        label: formatModuleDeletionLabel(moduleRow),
        reason: moduleDeletionReason({ chapterCount, storyCount, chapterIdsCount }),
      });
    } else {
      safe.push(moduleId);
    }
  }

  return { blocked, safe, canDeleteAll: blocked.length === 0 };
}

/**
 * @param {string[]} moduleIds
 * @returns {Promise<void>}
 */
export async function deleteModules(moduleIds) {
  const uniqueIds = [...new Set(moduleIds.filter(Boolean))];
  if (!uniqueIds.length) return;

  const status = await getModulesDeletionStatus(uniqueIds);
  if (!status.canDeleteAll) {
    const err = new Error('Cannot delete selected modules.');
    err.blocked = status.blocked;
    throw err;
  }

  await Promise.all(uniqueIds.map((id) => deleteRow(TABLES.module, 'module_id', id)));
}

/**
 * @typedef {{ hasContent: boolean, storyCount: number, storyIdsCount: number, mappingCount: number, puzzleCount: number }} ChapterAssociationCheck
 */

/**
 * Returns whether a chapter has linked stories, principles, or puzzles.
 * @param {string} chapterId
 * @returns {Promise<ChapterAssociationCheck>}
 */
export async function getChapterAssociatedContent(chapterId) {
  const [chapterRows, storyRows, mappingRows, puzzleRows] = await Promise.all([
    fetchTable(TABLES.chapter),
    fetchTable(TABLES.story),
    fetchTable('story_mapping'),
    fetchTable('chess_puzzle'),
  ]);

  const chapterRow = chapterRows.find((row) => col(row, 'chapter_id') === chapterId);
  const storyIdsFromChapter = parseIdList(col(chapterRow, 'story_ids'));
  const storiesByChapterId = storyRows.filter((row) => col(row, 'chapter_id') === chapterId);
  const storyIds = new Set([
    ...storyIdsFromChapter,
    ...storiesByChapterId.map((row) => col(row, 'story_id')).filter(Boolean),
  ]);

  const mappings = mappingRows.filter((row) => storyIds.has(col(row, 'story_id')));
  const mappingCount = mappings.length;
  const principleIds = new Set(
    mappings.map((row) => col(row, 'principle_id')).filter(Boolean)
  );
  const puzzleCount = puzzleRows.filter((row) =>
    principleIds.has(col(row, 'principle_id'))
  ).length;

  const storyCount = storiesByChapterId.length;
  const storyIdsCount = storyIdsFromChapter.length;
  const hasContent =
    storyCount > 0 || storyIdsCount > 0 || mappingCount > 0 || puzzleCount > 0;

  return { hasContent, storyCount, storyIdsCount, mappingCount, puzzleCount };
}

async function removeChapterFromModuleList(moduleId, chapterId) {
  await removeChaptersFromModuleList(moduleId, [chapterId]);
}

async function removeChaptersFromModuleList(moduleId, chapterIdsToRemove) {
  if (!chapterIdsToRemove.length) return;

  const moduleRows = await fetchTable(TABLES.module);
  const moduleRow = moduleRows.find((row) => col(row, 'module_id') === moduleId);
  if (!moduleRow) return;

  const removeSet = new Set(chapterIdsToRemove);
  const ids = parseIdList(col(moduleRow, 'chapter_ids')).filter((id) => !removeSet.has(id));
  const chapter_ids =
    ids.length > 0 ? `[${ids.map((id) => `'${id}'`).join(',')}]` : '[]';
  await updateRow(TABLES.module, 'module_id', moduleId, { chapter_ids });
}

function chapterDeletionReason(association) {
  if (association.storyCount > 0 || association.storyIdsCount > 0) return 'contains stories';
  if (association.mappingCount > 0) return 'contains principles';
  if (association.puzzleCount > 0) return 'contains puzzles';
  return 'contains associated content';
}

function formatChapterDeletionLabel(chapterRow, index) {
  const name = col(chapterRow, 'chapter_name');
  const num = index != null ? String(index + 1).padStart(2, '0') : col(chapterRow, 'chapter_id');
  return `Chapter ${num}${name ? ` — ${name}` : ''}`;
}

/**
 * @typedef {{ chapterId: string, label: string, reason: string }} ChapterDeletionBlock
 * @typedef {{ blocked: ChapterDeletionBlock[], safe: string[], canDeleteAll: boolean }} ChaptersDeletionStatus
 */

/**
 * @param {string[]} chapterIds
 * @returns {Promise<ChaptersDeletionStatus>}
 */
export async function getChaptersDeletionStatus(chapterIds) {
  if (!chapterIds.length) {
    return { blocked: [], safe: [], canDeleteAll: true };
  }

  const [chapterRows, storyRows, mappingRows, puzzleRows] = await Promise.all([
    fetchTable(TABLES.chapter),
    fetchTable(TABLES.story),
    fetchTable('story_mapping'),
    fetchTable('chess_puzzle'),
  ]);

  const blocked = [];
  const safe = [];

  for (const chapterId of chapterIds) {
    const chapterRow = chapterRows.find((row) => col(row, 'chapter_id') === chapterId);
    if (!chapterRow) {
      safe.push(chapterId);
      continue;
    }

    const storyIdsFromChapter = parseIdList(col(chapterRow, 'story_ids'));
    const storiesByChapterId = storyRows.filter((row) => col(row, 'chapter_id') === chapterId);
    const storyIds = new Set([
      ...storyIdsFromChapter,
      ...storiesByChapterId.map((row) => col(row, 'story_id')).filter(Boolean),
    ]);

    const mappings = mappingRows.filter((row) => storyIds.has(col(row, 'story_id')));
    const mappingCount = mappings.length;
    const principleIds = new Set(
      mappings.map((row) => col(row, 'principle_id')).filter(Boolean)
    );
    const puzzleCount = puzzleRows.filter((row) =>
      principleIds.has(col(row, 'principle_id'))
    ).length;

    const storyCount = storiesByChapterId.length;
    const storyIdsCount = storyIdsFromChapter.length;
    const hasContent =
      storyCount > 0 || storyIdsCount > 0 || mappingCount > 0 || puzzleCount > 0;

    const chapterIndex = chapterRows.findIndex((row) => col(row, 'chapter_id') === chapterId);

    if (hasContent) {
      blocked.push({
        chapterId,
        label: formatChapterDeletionLabel(chapterRow, chapterIndex),
        reason: chapterDeletionReason({ storyCount, storyIdsCount, mappingCount, puzzleCount }),
      });
    } else {
      safe.push(chapterId);
    }
  }

  return { blocked, safe, canDeleteAll: blocked.length === 0 };
}

/**
 * @param {string[]} chapterIds
 * @returns {Promise<void>}
 */
export async function deleteChapters(chapterIds) {
  const uniqueIds = [...new Set(chapterIds.filter(Boolean))];
  if (!uniqueIds.length) return;

  const status = await getChaptersDeletionStatus(uniqueIds);
  if (!status.canDeleteAll) {
    const err = new Error('Cannot delete selected chapters.');
    err.blocked = status.blocked;
    throw err;
  }

  const chapterRows = await fetchTable(TABLES.chapter);
  const rowsToDelete = uniqueIds
    .map((id) => chapterRows.find((row) => col(row, 'chapter_id') === id))
    .filter(Boolean);

  await Promise.all(uniqueIds.map((id) => deleteRow(TABLES.chapter, 'chapter_id', id)));

  const byModule = new Map();
  for (const row of rowsToDelete) {
    const moduleId = col(row, 'module_id');
    const chapterId = col(row, 'chapter_id');
    if (!moduleId || !chapterId) continue;
    if (!byModule.has(moduleId)) byModule.set(moduleId, []);
    byModule.get(moduleId).push(chapterId);
  }

  await Promise.all(
    [...byModule.entries()].map(([moduleId, ids]) =>
      removeChaptersFromModuleList(moduleId, ids)
    )
  );
}

export async function deleteChapter(chapterId) {
  const association = await getChapterAssociatedContent(chapterId);
  if (association.hasContent) {
    throw new Error(
      'This chapter contains associated content. Please delete or move the associated content first.'
    );
  }

  const chapterRows = await fetchTable(TABLES.chapter);
  const chapterRow = chapterRows.find((row) => col(row, 'chapter_id') === chapterId);
  const moduleId = col(chapterRow, 'module_id');

  await deleteRow(TABLES.chapter, 'chapter_id', chapterId);

  if (moduleId) {
    await removeChapterFromModuleList(moduleId, chapterId);
  }
}

export function subscribeToModules(callbacks) {
  return subscribeToTable(TABLES.module, 'public:module-admin', {
    onInsert: (raw) => callbacks.onChange?.(mapModule(raw)),
    onUpdate: (raw) => callbacks.onChange?.(mapModule(raw)),
    onDelete: () => callbacks.onRefetch?.(),
    onError: callbacks.onError,
  });
}

export function subscribeToChapters(moduleId, callbacks) {
  return subscribeToTable(TABLES.chapter, `public:chapter-${moduleId}`, {
    onInsert: (raw) => {
      const ch = mapChapter(raw);
      if (ch?.module_id === moduleId) callbacks.onChange?.(ch);
    },
    onUpdate: (raw) => {
      const ch = mapChapter(raw);
      if (ch?.module_id === moduleId) callbacks.onChange?.(ch);
    },
    onDelete: () => callbacks.onRefetch?.(),
    onError: callbacks.onError,
  });
}

export function subscribeToStories(chapterId, callbacks) {
  return subscribeToTable(TABLES.story, `public:story-${chapterId}`, {
    onInsert: (raw) => {
      const s = mapStory(raw);
      if (s?.chapter_id === chapterId) callbacks.onChange?.(s);
    },
    onUpdate: (raw) => {
      const s = mapStory(raw);
      if (s?.chapter_id === chapterId) callbacks.onChange?.(s);
    },
    onDelete: () => callbacks.onRefetch?.(),
    onError: callbacks.onError,
  });
}

export { unsubscribeChannel };
