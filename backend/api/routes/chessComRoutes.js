const express = require('express');
const controller = require('../controllers/chessComController');

const router = express.Router();

router.post('/chess-com/sync/:username', controller.syncPlayer);
router.get('/chess-com/yesterdays-games', controller.getYesterdaysGames);
router.post('/chess-com/yesterdays-games/sync', controller.syncYesterdaysGames);
router.get('/chess-com/:username/profile', controller.getProfile);
router.get('/chess-com/:username/bundle', controller.getBundle);
router.get('/chess-com/:username/monthly-games', controller.getMonthlyGames);
router.get('/chess-com/:username/rating-history', controller.getRatingHistory);
router.get('/chess-com/:username/win-streaks', controller.getWinStreaks);
router.get('/chess-com/:username/games-by-day', controller.getPlayerGamesByDay);
router.get('/chess-com/:username/archives', controller.getArchives);
router.get('/chess-com/:username/clubs', controller.getClubs);
router.get('/chess-com/:username/games/:uuid/pgn', controller.getGamePgn);
router.get('/chess-com/:username/games/:uuid/moves', controller.getGameMoves);
router.get('/chess-com/:username/games/:uuid', controller.getGame);
router.get('/chess-com/:username/games/:uuid/brilliance', controller.getBrilliance);
router.post('/chess-com/:username/games/:uuid/brilliance/run', controller.runBrilliance);
router.get('/chess-com/brilliant-moves', controller.getBrilliantMoves);
router.get('/chess-com/brilliance-pipeline-stats', controller.getBrilliancePipelineStats);
router.get('/chess-com/brilliant-moves/:moveId', controller.getBrilliantMove);
router.get('/chess-com/brilliant-puzzles', controller.getBrilliantPuzzles);
router.get('/chess-com/brilliant-puzzles/by-id/:puzzleId', controller.getBrilliantPuzzleById);
router.get('/chess-com/brilliant-puzzles/by-move/:moveId', controller.getBrilliantPuzzleByMove);
router.post('/chess-com/brilliant-puzzles/:moveId/verify', controller.verifyBrilliantPuzzle);
router.post('/chess-com/brilliant-puzzles/:moveId/save', controller.saveBrilliantPuzzle);
router.post('/chess-com/brilliant-puzzles/:moveId/unsave', controller.unsaveBrilliantPuzzle);
router.get('/chess-com/:username/games', controller.getGames);

module.exports = router;
