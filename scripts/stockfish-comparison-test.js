/**
 * Stockfish comparison: local binary vs hosted API (stockfish-cbp.onrender.com)
 * API docs: https://stockfish-cbp.onrender.com/docs
 *
 * Endpoints (from OpenAPI):
 *   POST /bestmove  { fen, depth? default 18 }
 *   POST /multipv   { fen, depth? default 18, multipv? default 3 }
 *   POST /analyze   { fen?, current_fen?, previous_fen?, depth?, movetime?, multipv? default 1 }
 *
 * Run: node scripts/stockfish-comparison-test.js
 */
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const FETCH_TIMEOUT_MS = 240_000;
const HOSTED_BASE = 'https://stockfish-cbp.onrender.com';
const LOCAL_SERVICE = require('../backend/api/services/stockfishService');

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const SAMPLE_PGN = `[Event "Immortal Game"]
[Site "London ENG"]
[Date "1851.06.21"]
[Round "?"]
[White "Anderssen, Adolf"]
[Black "Kieseritzky, Lionel"]
[Result "1-0"]

1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5
8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3
Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Qxa1+ 19. Ke2 Bxg1 20. e5
Na6 21. Ne7+ Kh8 22. Qg6 fxg6 23. Ne7# 1-0`;

function extractFensFromPgn(pgn) {
  return new Promise((resolve, reject) => {
    const pyScript = `
import chess.pgn, io, json, sys
game = chess.pgn.read_game(io.StringIO(sys.argv[1]))
if not game:
    print(json.dumps({"error": "bad pgn"}))
    sys.exit(1)
board = game.board()
fens = []
for i, move in enumerate(game.mainline_moves()):
    prev = board.fen()
    san = board.san(move)
    board.push(move)
    fens.append({"ply": i+1, "san": san, "previous_fen": prev, "current_fen": board.fen()})
print(json.dumps(fens))
`;
    const tmp = path.join(__dirname, '_extract_fens.py');
    fs.writeFileSync(tmp, pyScript);
    const proc = spawn('python', [tmp, pgn], { cwd: path.join(__dirname, '..') });
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => { err += d; });
    proc.on('close', (code) => {
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      if (code !== 0) return reject(new Error(err || 'python failed'));
      resolve(JSON.parse(out.trim()));
    });
  });
}

async function timed(label, fn) {
  const t0 = performance.now();
  let result = null;
  let error = null;
  try {
    result = await fn();
  } catch (e) {
    error = e.message || String(e);
  }
  const ms = Math.round(performance.now() - t0);
  return { label, ms, result, error };
}

async function hostedFetch(endpoint, body, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${HOSTED_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`${endpoint} HTTP ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

async function runLocalDirect({ fen, depth, movetime, multipv = 1 }) {
  const { spawn: sp } = require('child_process');
  const exe = path.join(__dirname, '..', 'stockfish', 'stockfish-windows-x86-64-avx2.exe');
  return new Promise((resolve, reject) => {
    const proc = sp(exe);
    const lines = [];
    let done = false;
    const finish = (err, val) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { proc.kill(); } catch { /* ignore */ }
      err ? reject(err) : resolve(val);
    };
    const timer = setTimeout(() => finish(new Error('local direct timeout')), 30_000);
    proc.stdout.on('data', (d) => {
      for (const line of d.toString().split(/\r?\n/)) {
        if (!line) continue;
        lines.push(line);
        if (line.startsWith('bestmove')) {
          const { parseEngineLines } = LOCAL_SERVICE;
          finish(null, parseEngineLines(lines));
        }
      }
    });
    proc.stdin.write('uci\n');
    proc.stdin.write('isready\n');
    proc.stdin.write(`setoption name MultiPV value ${multipv}\n`);
    proc.stdin.write(`position fen ${fen}\n`);
    const go = movetime ? `go movetime ${movetime}\n` : `go depth ${depth || 12}\n`;
    proc.stdin.write(go);
    proc.on('error', (e) => finish(e));
  });
}

function summarizeScore(score) {
  if (!score) return 'n/a';
  if (score.type === 'mate') return `M${score.value}`;
  return `${(score.value / 100).toFixed(2)}`;
}

function compareResults(local, hosted, endpoint) {
  const issues = [];
  const localBest = local?.bestmove;
  const hostedBest = hosted?.bestmove;
  if (localBest && hostedBest && localBest !== hostedBest) {
    issues.push(`bestmove: local=${localBest} hosted=${hostedBest}`);
  }
  const lcp = local?.score?.type === 'cp' ? local.score.value : null;
  const hcp = hosted?.score?.type === 'cp' ? hosted.score.value : null;
  if (lcp != null && hcp != null && Math.abs(lcp - hcp) > 50) {
    issues.push(`eval gap >50cp: local=${lcp} hosted=${hcp}`);
  }
  return {
    endpoint,
    localBest,
    hostedBest,
    localEval: summarizeScore(local?.score),
    hostedEval: summarizeScore(hosted?.score),
    localDepth: local?.depth,
    hostedDepth: hosted?.depth,
    localLines: local?.lines?.length || 0,
    hostedLines: hosted?.lines?.length || 0,
    issues,
  };
}

async function runBrillianceStage2Local(pgn) {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, '..', 'backend', 'brilliance', 'brilliance_stage2.py');
    const proc = spawn('python', [script, JSON.stringify({ pgn })], { cwd: path.join(__dirname, '..') });
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => { err += d; });
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(err || out || 'stage2 failed'));
      resolve(JSON.parse(out.trim()));
    });
  });
}

async function testHostedEndpointHealth() {
  const smokeTimeout = 90_000;
  const tests = [
    { name: 'GET /', fn: () => fetchWithTimeout(HOSTED_BASE, {}, 15_000).then((r) => r.json()) },
    {
      name: 'POST /bestmove depth=10',
      fn: () => hostedFetch('/bestmove', {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        depth: 10,
      }, smokeTimeout),
    },
    {
      name: 'POST /analyze movetime=500',
      fn: () => hostedFetch('/analyze', {
        current_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        previous_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        movetime: 500,
        multipv: 1,
      }, smokeTimeout),
    },
    {
      name: 'POST /multipv depth=10',
      fn: () => hostedFetch('/multipv', {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        depth: 10,
        multipv: 3,
      }, smokeTimeout),
    },
  ];

  const health = [];
  for (const t of tests) {
    const r = await timed(t.name, t.fn);
    health.push({
      test: t.name,
      ms: r.ms,
      ok: !r.error,
      error: r.error,
      sample: r.result ? JSON.stringify(r.result).slice(0, 400) : null,
    });
    console.log(`  ${t.name}: ${r.error ? `FAIL (${r.ms}ms) ${r.error}` : `OK ${r.ms}ms`}`);
    if (r.result && !r.error) console.log(`    -> ${JSON.stringify(r.result).slice(0, 200)}`);
  }
  return health;
}

async function main() {
  console.log('=== Stockfish Comparison Test ===');
  console.log(`Docs: ${HOSTED_BASE}/docs`);
  console.log(`Local: stockfish/stockfish-windows-x86-64-avx2.exe\n`);

  console.log('--- Hosted API smoke tests ---');
  const health = await testHostedEndpointHealth();
  const hostedWorks = health.some((h) => h.ok && h.test.startsWith('POST'));

  let positions;
  try {
    positions = await extractFensFromPgn(SAMPLE_PGN);
    console.log(`\nExtracted ${positions.length} plies from Immortal Game PGN`);
  } catch (e) {
    console.error('Failed to extract FENs:', e.message);
    process.exit(1);
  }

  const testIndices = [0, 4, 10, 16, 22, positions.length - 1].filter((i) => i < positions.length);
  const testPositions = testIndices.map((i) => positions[i]);

  const results = { bestmove: [], multipv: [], analyze: [] };

  for (const pos of testPositions) {
    console.log(`\n--- Ply ${pos.ply} (${pos.san}) ---`);
    const fen = pos.current_fen;
    const prev = pos.previous_fen;

    // /bestmove comparison (depth 12 to mirror puzzle client)
    const localBest = await timed('local bestmove d12', () =>
      runLocalDirect({ fen, depth: 12, multipv: 1 })
    );
    let hostedBest = { ms: null, result: null, error: 'skipped (hosted unavailable)' };
    if (hostedWorks) {
      hostedBest = await timed('hosted /bestmove d12', () =>
        hostedFetch('/bestmove', { fen, depth: 12 })
      );
    }
    results.bestmove.push({
      ply: pos.ply,
      san: pos.san,
      localMs: localBest.ms,
      hostedMs: hostedBest.ms,
      hostedError: hostedBest.error,
      ...compareResults(localBest.result, hostedBest.result, '/bestmove'),
    });
    console.log(`  /bestmove: local ${localBest.ms}ms | hosted ${hostedBest.error ? `FAIL ${hostedBest.ms}ms` : `${hostedBest.ms}ms`}`);
    if (!hostedBest.error) {
      console.log(`    moves: ${localBest.result?.bestmove} vs ${hostedBest.result?.bestmove}`);
    }

    // /multipv comparison
    const localMulti = await timed('local multipv d12', () =>
      runLocalDirect({ fen: prev, depth: 12, multipv: 3 })
    );
    let hostedMulti = { ms: null, result: null, error: 'skipped' };
    if (hostedWorks) {
      hostedMulti = await timed('hosted /multipv d12', () =>
        hostedFetch('/multipv', { fen: prev, depth: 12, multipv: 3 })
      );
    }
    results.multipv.push({
      ply: pos.ply,
      localMs: localMulti.ms,
      hostedMs: hostedMulti.ms,
      hostedError: hostedMulti.error,
      localLines: localMulti.result?.lines?.length || (localMulti.result?.pv ? 1 : 0),
      hostedLines: hostedMulti.result?.lines?.length || 0,
      hostedSample: hostedMulti.result ? JSON.stringify(hostedMulti.result).slice(0, 300) : null,
    });
    console.log(`  /multipv: local ${localMulti.ms}ms (${localMulti.result?.lines?.length || 1} lines) | hosted ${hostedMulti.error ? 'FAIL' : `${hostedMulti.ms}ms`}`);

    // /analyze — CLIO backend contract
    const localAnalyze = await timed('local analyzePosition', () =>
      LOCAL_SERVICE.analyzePosition({ currentFen: fen, previousFen: prev, multipv: 3 })
    );
    let hostedAnalyze = { ms: null, result: null, error: 'skipped' };
    if (hostedWorks) {
      hostedAnalyze = await timed('hosted /analyze', () =>
        hostedFetch('/analyze', {
          current_fen: fen,
          previous_fen: prev,
          movetime: 500,
          multipv: 3,
        })
      );
    }
    results.analyze.push({
      ply: pos.ply,
      localMs: localAnalyze.ms,
      hostedMs: hostedAnalyze.ms,
      hostedError: hostedAnalyze.error,
      ...compareResults(localAnalyze.result, hostedAnalyze.result, '/analyze'),
      localHasWinProb: !!localAnalyze.result?.winProbability,
      hostedHasWinProb: !!hostedAnalyze.result?.winProbability,
      localHasFirstMoveScores: (localAnalyze.result?.lines || []).some((l) => l.firstMoveScore),
    });
    console.log(`  /analyze: local ${localAnalyze.ms}ms | hosted ${hostedAnalyze.error ? `FAIL ${hostedAnalyze.ms}ms` : `${hostedAnalyze.ms}ms`}`);
  }

  console.log('\n--- Full PGN Brilliance Stage 2 (local only) ---');
  let stage2 = null;
  try {
    const s2 = await timed('stage2', () => runBrillianceStage2Local(SAMPLE_PGN));
    stage2 = { ms: s2.ms, ...s2.result };
    console.log(`  ${s2.ms}ms — ${stage2.analyzed_count} candidates, ${stage2.proceed_to_stage3_count} proceed to stage3`);
  } catch (e) {
    console.log(`  Stage2 failed: ${e.message}`);
  }

  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);
  const hostedBestmoveOk = results.bestmove.filter((r) => !r.hostedError).length;
  const hostedAnalyzeOk = results.analyze.filter((r) => !r.hostedError).length;

  const report = {
    meta: {
      date: new Date().toISOString(),
      hostedUrl: HOSTED_BASE,
      docsUrl: `${HOSTED_BASE}/docs`,
      hostedVersion: health.find((h) => h.test === 'GET /')?.sample,
      pgn: 'Immortal Game (Anderssen vs Kieseritzky 1851)',
      totalPlies: positions.length,
      testPlies: testPositions.map((p) => p.ply),
    },
    hostedHealth: health,
    hostedOperational: hostedWorks,
    comparisons: results,
    stage2Local: stage2
      ? {
          ms: stage2.ms,
          analyzed_count: stage2.analyzed_count,
          proceed_to_stage3_count: stage2.proceed_to_stage3_count,
          unsound_count: stage2.unsound_count,
        }
      : null,
    summary: {
      hostedEndpointsWorking: `${hostedBestmoveOk}/${results.bestmove.length} bestmove, ${hostedAnalyzeOk}/${results.analyze.length} analyze`,
      avgLocalBestmoveMs: avg(results.bestmove.map((r) => r.localMs)),
      avgHostedBestmoveMs: avg(results.bestmove.filter((r) => !r.hostedError).map((r) => r.hostedMs)),
      avgLocalAnalyzeMs: avg(results.analyze.map((r) => r.localMs)),
      avgHostedAnalyzeMs: avg(results.analyze.filter((r) => !r.hostedError).map((r) => r.hostedMs)),
      bestmoveAgreement: results.bestmove.filter((r) => !r.hostedError && r.issues.length === 0).length,
    },
  };

  const outPath = path.join(__dirname, 'stockfish-comparison-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n=== Report: ${outPath} ===`);
  console.log(JSON.stringify(report.summary, null, 2));
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
