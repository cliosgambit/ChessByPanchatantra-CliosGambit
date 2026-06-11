const express = require('express');
const router = express.Router();
const controller = require('../controllers/courseControllers');

// --- Module, Chapter & Story Routes ---
router.get('/modules', controller.getModules);
router.get('/modules/:moduleId/chapters', controller.getChaptersForModule);
router.get('/chapters/:chapterId/stories', controller.getStoriesForChapter);
router.get('/stories', controller.getStories);
router.get('/stories/:storyId', controller.getStoryById);

// --- Principle Routes ---
router.get('/principle/:principleId', controller.getPrincipleById);

// --- Puzzle Routes ---
router.get('/puzzles/:puzzleId', controller.getPuzzleById);
router.get('/puzzle-answer/:puzzleId', controller.getPuzzleAnswer);
router.get('/3000-rated-puzzles/:principleId', controller.get3000RatedPuzzles);

// --- Story Mapping Routes ---
router.get('/story-mappings/:storyId', controller.getStoryMappings);


module.exports = router;