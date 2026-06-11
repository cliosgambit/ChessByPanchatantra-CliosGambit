// backend/api/controllers/courseController.js

// Import our single, unified database connection
const db = require('../config/database');

// --- Stories ---
exports.getStories = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM story');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getStoryById = async (req, res) => {
  const { storyId } = req.params;
  const sql = 'SELECT * FROM story WHERE story_id = $1'; // Use $1 for parameters
  try {
    const result = await db.query(sql, [storyId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: `Story with ID ${storyId} not found.` });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// --- Principles ---
exports.getPrincipleById = async (req, res) => {
  const { principleId } = req.params;
  const sql = 'SELECT * FROM principle_position WHERE principle_id = $1';
  try {
    const result = await db.query(sql, [principleId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: `Principle with ID ${principleId} not found.` });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// --- Story Mappings ---
exports.getStoryMappings = async (req, res) => {
  const { storyId } = req.params;
  const sql = 'SELECT * FROM story_mapping WHERE story_id = $1';
  try {
    const result = await db.query(sql, [storyId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// --- Puzzles ---
exports.getPuzzleById = async (req, res) => {
  const { puzzleId } = req.params;
  const sql = 'SELECT * FROM chess_puzzle WHERE chess_puzzle_id = $1';
  try {
    const result = await db.query(sql, [puzzleId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: `Puzzle with ID ${puzzleId} not found.` });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getPuzzleAnswer = async (req, res) => {
  const { puzzleId } = req.params;
  const sql = 'SELECT answer FROM chess_puzzle WHERE chess_puzzle_id = $1';
  try {
    const result = await db.query(sql, [puzzleId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: `Puzzle with ID ${puzzleId} not found.` });
    }
    res.json({ puzzleId, answer: result.rows[0].answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.get3000RatedPuzzles = async (req, res) => {
    const { principleId } = req.params;
    // Note: Quoted table name because it starts with a number
    const sql = 'SELECT "Fen" FROM "3000_rated_puzzles" WHERE "principle_id" = $1';
    try {
      const result = await db.query(sql, [principleId]);
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
};

// --- Modules & Chapters ---
exports.getModules = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM module');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getChaptersForModule = async (req, res) => {
  const { moduleId } = req.params;
  try {
    const moduleResult = await db.query('SELECT chapter_ids FROM module WHERE module_id = $1', [moduleId]);
    if (moduleResult.rows.length === 0) {
      return res.status(404).json({ error: `Module with ID ${moduleId} not found.` });
    }

    const chapterIds = (moduleResult.rows[0].chapter_ids || '').replace(/[\[\]']/g, '').split(',').map(id => id.trim()).filter(id => id);
    if (chapterIds.length === 0) return res.json([]);

    const placeholders = chapterIds.map((_, i) => `$${i + 1}`).join(',');
    const chaptersResult = await db.query(`SELECT * FROM chapter WHERE chapter_id IN (${placeholders})`, chapterIds);
    res.json(chaptersResult.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getStoriesForChapter = async (req, res) => {
  const { chapterId } = req.params;
  try {
    const chapterResult = await db.query('SELECT story_ids FROM chapter WHERE chapter_id = $1', [chapterId]);
    if (chapterResult.rows.length === 0) {
      return res.status(404).json({ error: `Chapter with ID ${chapterId} not found.` });
    }
    const storyIds = (chapterResult.rows[0].story_ids || '').replace(/[\[\]']/g, '').split(',').map(id => id.trim()).filter(id => id);
    if (storyIds.length === 0) return res.json([]);

    const placeholders = storyIds.map((_, i) => `$${i + 1}`).join(',');
    const storiesResult = await db.query(`SELECT * FROM story WHERE story_id IN (${placeholders})`, storyIds);
    res.json(storiesResult.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};