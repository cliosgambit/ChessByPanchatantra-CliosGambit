/**
 * Test hosted POST /analyze-game (full PGN) vs local ply-by-ply /api/analyze
 * Docs: https://stockfish-cbp.onrender.com/docs
 */
const path = require('path');
const fs = require('fs');
const { Chess } = require(path.join(__dirname, '../backend/node_modules/chess.js'));

const HOSTED = 'https://stockfish-cbp.onrender.com';
const LOCAL = 'http://127.0.0.1:10000';

const PGN = `1. d3 d5 2. Nf3 c5 3. c3 Nc6 4. Qc2 e5 5. e4 d4 6. Be2 f5 7. Bg5 Be7 8. Bxe7
Qxe7 9. Nbd2 Nf6 10. O-O O-O 11. Nc4 b5 12. Ncd2 Bb7 13. a4 a6 14. Ne1
Rac8 15. f4 fxe4 16. dxe4 exf4 17. Rxf4 Qd6 18. Rh4 c4 19. Qd1 d3 20.
Bh5 Qe7 21. Qf3 Nd5 22. Qh3 Nf4 23. Qg4 Qf6 24. Nef3 Ne5 25. Nxe5 Ne2+
26. Kh1 Qxe5 27. Nf3 Qf6 28. Qd7 Bc6 29. Qg4 Bb7 30. e5 Qe7 31. Qh3 Bxf3 32.
gxf3 Qxe5 33. Bg4 h6 34. Bxc8 Rxc8 35. Qxc8+ Kh7 36. Rg4 Qd5 37. Qc7
Qxf3+ 38. Rg2 1-0`;

function parsePlies(pgn) {
  const game = new Chess();
  game.loadPgn(pgn);
  const history = game.history({ verbose: true });
  const replay = new Chess();
  const plies = [];
  for (let i = 0; i < history.length; i++) {
    const previous_fen = replay.fen();
    const m = history[i];
    replay.move(m);
    plies.push({
      ply: i + 1,
      san: m.san,
      uci: m.from + m.to + (m.promotion || ''),
      previous_fen,
      current_fen: replay.fen(),
    });
  }
  return plies;
}

async function timed(fn) {
  const t0 = Date.now();
  try {
    const result = await fn();
    return { ok: true, ms: Date.now() - t0, result };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: e.message || String(e) };
  }
}

async function hosted(endpoint, body, timeoutMs = 300000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${HOSTED}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 500) };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function localAnalyze(previous_fen, current_fen, multipv = 3) {
  const res = await fetch(`${LOCAL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ previous_fen, current_fen, multipv }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  return json;
}

function summarizeGameResponse(data) {
  if (!data || typeof data !== 'object') return { type: typeof data };
  const keys = Object.keys(data);
  const moves = data.moves || data.analysis || data.plies || data.positions || null;
  const moveCount = Array.isArray(moves) ? moves.length : null;
  let sampleMove = null;
  if (Array.isArray(moves) && moves.length) {
    const mid = moves[Math.min(13, moves.length - 1)];
    sampleMove = mid;
  }
  return {
    topKeys: keys,
    moveArrayKey: Array.isArray(data.moves)
      ? 'moves'
      : Array.isArray(data.analysis)
        ? 'analysis'
        : Array.isArray(data.plies)
          ? 'plies'
          : Array.isArray(data.positions)
            ? 'positions'
            : null,
    moveCount,
    sampleMoveKeys: sampleMove ? Object.keys(sampleMove) : null,
    sampleMove,
    meta: {
      total_plies: data.total_plies ?? data.ply_count ?? data.move_count ?? null,
      depth: data.depth ?? data.requested_depth ?? null,
      movetime: data.movetime ?? data.requested_movetime ?? null,
      multipv: data.multipv ?? null,
      engine: data.engine ?? data.version ?? null,
      cached: data.cached ?? null,
    },
  };
}

function normalizeUci(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (s.startsWith('bestmove ')) return s.split(/\s+/)[1] || null;
  return s.split(/\s+/)[0] || null;
}

(async () => {
  const report = {
    meta: {
      date: new Date().toISOString(),
      hosted: HOSTED,
      docs: `${HOSTED}/docs`,
      local: `${LOCAL}/api/analyze`,
      pgnPlies: null,
    },
    health: {},
    analyzeGame: {},
    perPlyCompare: [],
    shapeDiff: {},
    recommendations: [],
  };

  console.log('=== Health ===');
  const health = await timed(() => fetch(HOSTED).then((r) => r.json()));
  report.health = health;
  console.log(JSON.stringify(health));

  const plies = parsePlies(PGN);
  report.meta.pgnPlies = plies.length;
  console.log(`Parsed ${plies.length} plies from PGN`);

  // --- Test /analyze-game with movetime (faster) ---
  console.log('\n=== POST /analyze-game movetime=200 multipv=3 ===');
  const gameMt = await timed(() =>
    hosted('/analyze-game', { pgn: PGN, movetime: 200, multipv: 3 }, 600000)
  );
  report.analyzeGame.movetime200 = {
    ok: gameMt.ok,
    ms: gameMt.ms,
    error: gameMt.error || null,
    summary: gameMt.ok ? summarizeGameResponse(gameMt.result) : null,
    rawTopKeys: gameMt.ok ? Object.keys(gameMt.result || {}) : null,
  };
  console.log(
    gameMt.ok
      ? `OK ${gameMt.ms}ms keys=${Object.keys(gameMt.result || {})}`
      : `FAIL ${gameMt.ms}ms ${gameMt.error}`
  );
  if (gameMt.ok) {
    console.log('summary:', JSON.stringify(report.analyzeGame.movetime200.summary, null, 2).slice(0, 3000));
  }

  // --- Also try depth=10 on a shorter subset if full failed, or on full if movetime worked ---
  // Use first ~10 plies mini-pgn for depth test if full game is slow
  const miniPgn = `1. d3 d5 2. Nf3 c5 3. c3 Nc6 4. Qc2 e5 5. e4 d4 1-0`;
  console.log('\n=== POST /analyze-game depth=10 (mini PGN 9 plies) ===');
  const gameD = await timed(() =>
    hosted('/analyze-game', { pgn: miniPgn, depth: 10, multipv: 3 }, 300000)
  );
  report.analyzeGame.depth10Mini = {
    ok: gameD.ok,
    ms: gameD.ms,
    error: gameD.error || null,
    summary: gameD.ok ? summarizeGameResponse(gameD.result) : null,
  };
  console.log(
    gameD.ok
      ? `OK ${gameD.ms}ms`
      : `FAIL ${gameD.ms}ms ${gameD.error}`
  );

  // --- Invalid PGN ---
  console.log('\n=== POST /analyze-game invalid PGN ===');
  const bad = await timed(() =>
    hosted('/analyze-game', { pgn: 'not a real pgn', movetime: 100 }, 60000)
  );
  report.analyzeGame.invalidPgn = {
    ok: bad.ok,
    ms: bad.ms,
    error: bad.error || null,
    body: bad.result || null,
  };
  console.log(bad.ok ? `unexpected OK` : `expected fail: ${bad.error}`);

  // --- Per-ply compare: sample plies local vs hosted /analyze vs /analyze-game entry ---
  const sampleIdx = [0, 13, 34, Math.min(74, plies.length - 1)].filter((i) => i < plies.length);
  const gameMoves =
    gameMt.ok &&
    (gameMt.result.moves || gameMt.result.analysis || gameMt.result.plies || gameMt.result.positions);

  console.log('\n=== Per-ply compare (local /api/analyze vs hosted /analyze vs analyze-game) ===');
  for (const i of sampleIdx) {
    const p = plies[i];
    const local = await timed(() => localAnalyze(p.previous_fen, p.current_fen, 3));
    const hostedOne = await timed(() =>
      hosted('/analyze', {
        previous_fen: p.previous_fen,
        current_fen: p.current_fen,
        movetime: 300,
        multipv: 3,
      })
    );

    let gameEntry = null;
    if (Array.isArray(gameMoves)) {
      // try match by ply index or fen
      gameEntry =
        gameMoves[i] ||
        gameMoves.find((m) => m.ply === p.ply || m.ply_index === i || m.fen === p.current_fen) ||
        null;
    }

    const row = {
      ply: p.ply,
      san: p.san,
      playedUci: p.uci,
      local: local.ok
        ? {
            ms: local.ms,
            bestmove: normalizeUci(local.result.bestmove),
            previousFenBestmove: normalizeUci(local.result.previousFenBestmove),
            score: local.result.score,
            winProbability: local.result.winProbability,
            linesCount: (local.result.lines || []).length,
          }
        : { error: local.error, ms: local.ms },
      hostedAnalyze: hostedOne.ok
        ? {
            ms: hostedOne.ms,
            bestmove: normalizeUci(hostedOne.result.bestmove),
            previous_fen_bestmove: normalizeUci(hostedOne.result.previous_fen_bestmove),
            win_probability: hostedOne.result.win_probability,
            analysisCount: (hostedOne.result.analysis || []).length,
            topCp: hostedOne.result.analysis?.[0]?.cp ?? null,
          }
        : { error: hostedOne.error, ms: hostedOne.ms },
      analyzeGameEntry: gameEntry
        ? {
            keys: Object.keys(gameEntry),
            bestmove: normalizeUci(
              gameEntry.bestmove || gameEntry.best_move || gameEntry.engine_bestmove
            ),
            previous_best:
              normalizeUci(
                gameEntry.previous_fen_bestmove ||
                  gameEntry.previousFenBestmove ||
                  gameEntry.best_move_before
              ) || null,
            played: gameEntry.played || gameEntry.san || gameEntry.move || null,
            cp: gameEntry.cp ?? gameEntry.score?.value ?? gameEntry.eval ?? null,
            classification: gameEntry.classification || gameEntry.judgment || null,
          }
        : null,
      agreement: {
        bestmoveLocalVsHosted:
          local.ok && hostedOne.ok
            ? normalizeUci(local.result.bestmove) === normalizeUci(hostedOne.result.bestmove)
            : null,
        prevBestLocalVsHosted:
          local.ok && hostedOne.ok
            ? normalizeUci(local.result.previousFenBestmove) ===
              normalizeUci(hostedOne.result.previous_fen_bestmove)
            : null,
      },
    };
    report.perPlyCompare.push(row);
    console.log(
      `ply ${p.ply} ${p.san}: local=${row.local.bestmove || row.local.error} hosted=${row.hostedAnalyze.bestmove || row.hostedAnalyze.error} agree=${row.agreement.bestmoveLocalVsHosted}`
    );
  }

  // Shape mapping for CLIO
  report.shapeDiff = {
    localAnalyzeShape: [
      'bestmove',
      'ponder',
      'score{type,value}',
      'depth',
      'winProbability{white,black}',
      'lines[{multipv,depth,score,pv,firstMoveScore}]',
      'previousFenBestmove',
    ],
    hostedAnalyzeShape: [
      'fen',
      'bestmove',
      'ponder',
      'previous_fen_bestmove',
      'requested_depth',
      'requested_movetime',
      'multipv',
      'win_probability{white,black}',
      'analysis[{rank,bestmove,cp,mate,depth,pv[],first_move_score}]',
      'cached',
    ],
    analyzeGameInput: { pgn: 'string', depth: 'int?', movetime: 'int?', multipv: 'int default 3' },
    analyzeGameObserved: report.analyzeGame.movetime200?.summary || report.analyzeGame.depth10Mini?.summary,
  };

  report.recommendations = [
    'Hosted has POST /analyze-game which accepts full PGN — local CLIO has no equivalent; game UI loops /api/analyze per ply.',
    'To use hosted for live game analysis: either (A) call /analyze-game once and map response into analysis[] by ply, or (B) keep per-ply /analyze with a response adapter.',
    'Adapter needed: hosted win_probability → local winProbability; previous_fen_bestmove → previousFenBestmove; analysis[] → lines[] with multipv=rank, score from cp/mate, pv string join.',
    'Local analyze ignores client depth/movetime (fixed short movetimes). Hosted respects depth/movetime — better for tunable quality.',
    'Render cold starts: /analyze-game on full games can be slow; prefer movetime over deep depth for interactive UI.',
    'stockfish.online has no PGN endpoint; do not use it for full-game analysis.',
    'Safest integration: backend proxy POST /api/analyze-game → hosted /analyze-game with local fallback that expands PGN and calls getBestMove/analyzePosition per ply.',
  ];

  const outPath = path.join(__dirname, 'stockfish-analyze-game-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}`);
  console.log(JSON.stringify({
    healthOk: report.health.ok,
    analyzeGameOk: report.analyzeGame.movetime200?.ok,
    analyzeGameMs: report.analyzeGame.movetime200?.ms,
    moveCount: report.analyzeGame.movetime200?.summary?.moveCount,
    miniOk: report.analyzeGame.depth10Mini?.ok,
    compareRows: report.perPlyCompare.length,
  }, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
