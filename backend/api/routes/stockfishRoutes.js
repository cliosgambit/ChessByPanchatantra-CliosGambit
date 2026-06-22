const express = require('express');
const { analyzePosition } = require('../services/stockfishService');

const router = express.Router();

router.post('/analyze', async (req, res) => {
  const body = req.body || {};
  const { depth, movetime, current_fen, previous_fen, multipv } = body;
  const currentFen = current_fen || body.fen || previous_fen;
  const previousFen = previous_fen || body.fen || current_fen;

  if (!currentFen || !previousFen) {
    res.status(400).json({ error: 'Both current_fen and previous_fen are required' });
    return;
  }

  try {
    const response = await analyzePosition({
      currentFen,
      previousFen,
      depth,
      movetime,
      multipv,
    });
    res.json(response);
  } catch (e) {
    console.error('[ANALYZE][ERR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
