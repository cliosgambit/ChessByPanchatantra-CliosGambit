const express = require('express');
const controller = require('../controllers/chessComController');

const router = express.Router();

router.post('/chess-com/sync/:username', controller.syncPlayer);
router.get('/chess-com/:username/bundle', controller.getBundle);
router.get('/chess-com/:username/games/:uuid/moves', controller.getGameMoves);
router.get('/chess-com/:username/games/:uuid', controller.getGame);
router.get('/chess-com/:username/games', controller.getGames);

module.exports = router;
