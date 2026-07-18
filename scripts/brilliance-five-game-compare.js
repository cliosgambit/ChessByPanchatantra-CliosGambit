/**
 * Compare CURRENT brilliance funnel vs _version_1 (old JOIN semantics + old Stage0/1 Python).
 * Does NOT modify main pipeline code.
 *
 * Run: node scripts/brilliance-five-game-compare.js
 *
 * Outputs:
 *  - Why Stage1-fail moves can still reach S4 (multi-path)
 *  - Per-game funnel CURRENT vs OLD (JOIN)
 *  - Move-wise pass table
 *  - Timing for current full pipeline
 *  - Stage0/1 candidate counts: current Python vs _version_1 Python
 */
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { performance } = require('perf_hooks');

process.chdir(path.join(__dirname, '..', 'backend'));

const { importOrGetGameForPgn } = require('../backend/brilliance/services/lichessPgnService');
const { runStage0ForGame, getStage0Features } = require('../backend/brilliance/services/brillianceStage0Service');
const { runStage1ForGame, getStage1Features } = require('../backend/brilliance/services/brillianceStage1Service');
const { runStage2ForGame, getStage2Features } = require('../backend/brilliance/services/brillianceStage2Service');
const { runStage3ForGame, getStage3Features } = require('../backend/brilliance/services/brillianceStage3Service');
const { runStage4ForGame, getStage4Features } = require('../backend/brilliance/services/brillianceStage4Service');
const {
  clearStageTablesFrom,
  resetStageGameCounters,
} = require('../backend/brilliance/services/brilliancePipelineUtils');
const { db } = require('../backend/brilliance/db/database');

const ROOT = path.join(__dirname, '..');
const V1_BRILLIANCE = path.join(ROOT, '_version_1', 'backend', 'brilliance');
const OUT_DIR = path.join(ROOT, 'scripts', 'brilliance-compare-out');
const STOCKFISH = path.join(ROOT, 'stockfish', 'stockfish-windows-x86-64-avx2.exe');

const GAMES = [
  {
    id: 'fried_liver_draw',
    label: 'Akshajdec2013 vs IlyaGerman2020 (Fried Liver draw)',
    pgn: `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2025.10.01"]
[White "Akshajdec2013"]
[Black "IlyaGerman2020"]
[Result "1/2-1/2"]
[WhiteElo "740"]
[BlackElo "760"]
[ECO "C57"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Ke8
8. Bxd5 Qe7 9. O-O Qf6 10. Bxc6+ bxc6 11. Qxf6 gxf6 12. Nc3 Bf5 13. d3 Bb4 14.
a3 Bxc3 15. bxc3 e4 16. dxe4 Bxe4 17. Ra2 Kf7 18. Re1 Rae8 19. c4 Rhg8 20. c3
Rxg2+ 21. Kf1 Rg6 22. f3 Bd3+ 23. Kf2 Rxe1 24. Kxe1 Rg1+ 25. Kd2 Bxc4 26. Rb2
Rg2+ 27. Ke3 Rxb2 28. Bxb2 Ke6 29. f4 f5 30. Kd4 Bd5 31. c4 Be4 32. a4 a5 33. c5
Bc2 34. Bc3 Bxa4 35. Bxa5 Kd7 36. Ke5 Bc2 37. Kf6 Bd3 38. h4 Kd8 39. h5 Ke8 40.
h6 Kf8 41. Bxc7 Bc2 42. Bd6+ Kg8 43. Kg5 Kf7 44. Be5 Be4 45. Bf6 Bf3 46. Bg7 Be4
47. Bf6 Bb1 48. Ba1 Bc2 49. Be5 Be4 50. Bd6 Ke6 51. Kh5 Bf3+ 52. Kg5 Bg4 53. Kh4
Kf6 54. Kg3 Kg6 55. Kh4 Bd1 56. Bf8 Be2 57. Bg7 Bg4 58. Bf8 Bd1 59. Bg7 Bg4 60.
Kg3 Kh5 61. Kf2 Bh3 62. Ke3 Kg4 63. Bf8 Bg2 64. Bg7 Be4 65. Bf8 Bd5 66. Bd6 Be4
67. Be5 Bd5 68. Bg7 Be4 69. Be5 Kh5 70. Bg7 Bb1 71. Kd4 Kg4 72. Ke5 Ba2 73. Bf8
Bb1 74. Bd6 Be4 75. Bf8 Bb1 76. Bg7 Be4 77. Bf8 Bb1 1/2-1/2`,
  },
  {
    id: 'gandharv_karan',
    label: 'GandharvDev_21 vs KaranBhai5857',
    pgn: `[Event "Live Chess"]
[White "GandharvDev_21"]
[Black "KaranBhai5857"]
[Result "1-0"]
[WhiteElo "593"]
[BlackElo "556"]
[ECO "C41"]

1. e4 e5 2. Nf3 d6 3. d4 exd4 4. Nxd4 c5 5. Nb5 Nf6 6. Bc4 Be7 7. e5 dxe5 8. O-O
O-O 9. Bd3 Bg4 10. f3 Bh5 11. g4 a6 12. N5c3 e4 13. fxe4 Bxg4 14. Ne2 Bd6 15.
Bg5 h6 16. Bxf6 gxf6 17. Nbc3 f5 18. Qe1 fxe4 19. Nxe4 Bh3 20. Nxd6 Qxd6 21. Qf2
f6 22. Rad1 Qd5 23. Bh7+ Kxh7 24. Rxd5 Bxf1 25. Qxf1 Nc6 26. Qf5+ Kh8 27. Qh5
Ne7 28. Qxh6+ Kg8 29. Rh5 Kf7 30. Qh7+ Ke8 31. Qe4 Rg8+ 32. Kf1 f5 33. Rxf5 b5
34. Qxa8+ Kd7 35. Rd5+ Ke6 36. Nf4+ Kf6 37. Qxa6+ Kf7 38. Qe6+ Kf8 39. Qf6+ Ke8
40. Rxc5 Rf8 41. Rc8+ Kd7 42. Qxf8 Nxc8 43. Qf7+ Kd8 44. Qd5+ Kc7 45. Qxb5 Nb6
46. Ne6+ Kb7 47. Nc5+ Kc7 48. a4 Kd6 49. a5 Nd5 50. a6 Nc7 51. Qb6+ Kd5 52. Qxc7
Kd4 53. a7 1-0`,
  },
  {
    id: 'varun_pullela',
    label: 'Varunvallinathan vs Pullela09',
    pgn: `[Event "Live Chess"]
[White "Varunvallinathan"]
[Black "Pullela09"]
[Result "1-0"]
[WhiteElo "1273"]
[BlackElo "1758"]
[ECO "B07"]

1. e4 d6 2. d4 Nf6 3. Nc3 c6 4. f4 Qa5 5. Nf3 Nxe4 6. Bd2 Nxd2 7. Qxd2 Bg4 8. Bd3
Bxf3 9. gxf3 e5 10. fxe5 dxe5 11. dxe5 Qxe5+ 12. Kf2 Bc5+ 13. Kg2 O-O 14. Ne4 Be7
15. Rae1 Qxb2 16. Rhg1 Nd7 17. Kh1 Kh8 18. Qg2 Bf6 19. Qh3 Rad8 20. Qf5 Qe5 21.
Qh3 Qf4 22. Ng5 h6 23. Re4 Qd6 24. Rh4 Bxg5 25. Rxg5 Ne5 26. Rxe5 Qxe5 27. Rxh6+
Kg8 28. Rh8# 1-0`,
  },
  {
    id: 'pidipl_raghavendra',
    label: 'pidipl vs Raghavendra_k (Englund)',
    pgn: `[Event "Live Chess"]
[White "pidipl"]
[Black "Raghavendra_k"]
[Result "1-0"]
[WhiteElo "1209"]
[BlackElo "1171"]
[ECO "A40"]

1. d4 e5 2. c4 $9 exd4 3. Qxd4 Nc6 4. Qd1 Nf6 5. Nc3 Bb4 6. Nf3 $6 O-O $6 7. Bg5 d6
8. Qb3 Bf5 9. a3 Bxc3+ $6 10. Qxc3 Re8 11. e3 Qd7 $2 12. Bxf6 $1 gxf6 13. Qxf6 Re6
14. Qg5+ $6 Rg6 15. Qf4 Re8 $2 16. Nh4 $1 Rf6 $2 17. Nxf5 $9 Rxf5 18. Qg3+ Kh8 19. Bd3
Rf6 $6 20. O-O $9 Rg8 $9 21. Qh4 h6 $6 22. Qxf6+ Rg7 23. Qxh6+ Kg8 24. Rad1 Qg4 25.
g3 Ne5 26. Bc2 Nf3+ 27. Kg2 $2 Ng5 $9 28. Rd4 Qf3+ 29. Kg1 Qe2 30. Bd1 Nf3+ 31.
Kg2 $1 Ne1+ 32. Rxe1 Qxe1 33. Bf3 Qa5 34. Qh4 c5 $6 35. Rxd6 Qc7 $6 36. Qd8+ Qxd8
37. Rxd8+ Kh7 38. Bxb7 f5 39. Bd5 Kg6 40. Rg8 Rxg8 41. Bxg8 Kf6 42. Bd5 Ke5 43.
b3 Kd6 44. Kf3 Ke5 45. h4 Kf6 46. Kf4 Kg6 47. Ke5 Kh5 $6 48. Kxf5 a5 49. e4 a4
50. bxa4 Kh6 51. a5 1-0`,
  },
  {
    id: 'pullela_karademamao',
    label: 'Pullela09 vs karademamao',
    pgn: `[Event "Live Chess"]
[White "Pullela09"]
[Black "karademamao"]
[Result "1-0"]
[WhiteElo "1616"]
[BlackElo "1599"]
[ECO "A06"]

1. d3 d5 2. Nf3 c5 3. c3 Nc6 4. Qc2 e5 5. e4 d4 6. Be2 f5 $2 7. Bg5 $6 Be7 8. Bxe7
Qxe7 9. Nbd2 Nf6 10. O-O O-O 11. Nc4 $2 b5 $6 12. Ncd2 Bb7 $2 13. a4 $6 a6 $2 14. Ne1 $2
Rac8 $4 15. f4 $9 fxe4 16. dxe4 $6 exf4 $2 17. Rxf4 $9 Qd6 18. Rh4 c4 19. Qd1 d3 20.
Bh5 Qe7 21. Qf3 Nd5 $2 22. Qh3 $2 Nf4 $1 23. Qg4 $6 Qf6 $6 24. Nef3 Ne5 25. Nxe5 Ne2+
26. Kh1 Qxe5 $1 27. Nf3 Qf6 28. Qd7 Bc6 29. Qg4 Bb7 30. e5 Qe7 31. Qh3 $6 Bxf3 $2 32.
gxf3 $9 Qxe5 33. Bg4 $6 h6 $4 34. Bxc8 Rxc8 $2 35. Qxc8+ Kh7 36. Rg4 Qd5 37. Qc7
Qxf3+ 38. Rg2 1-0`,
  },
];

function fmtMs(ms) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)} s`;
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(1);
  return `${m}m ${s}s`;
}

function runPy(scriptPath, payload, cwd) {
  const json = JSON.stringify(payload);
  const tmp = path.join(
    require('os').tmpdir(),
    `brill-cmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
  fs.writeFileSync(tmp, json, 'utf8');
  const arg = `--input-file=${tmp}`;
  // v1 scripts may not support --input-file; fall back to inline if small
  const useFile = fs.existsSync(path.join(path.dirname(scriptPath), 'brilliance_input.py'));
  const args = useFile
    ? [scriptPath, arg]
    : [scriptPath, json.length > 6000 ? arg : json];

  // If v1 and large payload without brilliance_input, write a tiny wrapper via stdin approach:
  // For v1 without input helper, always pass JSON if short; else write file and patch by reading in node and using short pgn-only for s0/s1.
  return new Promise((resolve, reject) => {
    const tryArgs = useFile || json.length <= 6000 ? args : [scriptPath, JSON.stringify({ pgn: payload.pgn })];
    execFile(
      'py',
      ['-3', ...tryArgs],
      { cwd: cwd || path.dirname(scriptPath), timeout: 600000, maxBuffer: 50 * 1024 * 1024 },
      (err, stdout, stderr) => {
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* ignore */
        }
        if (err) {
          reject(new Error(stderr || err.message));
          return;
        }
        try {
          resolve(JSON.parse(String(stdout || '').trim() || '{}'));
        } catch (e) {
          reject(new Error(`Invalid JSON from ${path.basename(scriptPath)}: ${e.message}`));
        }
      }
    );
  });
}

function oldJoinPlies(gameId) {
  return db
    .prepare(
      `SELECT s2.ply_index, s2.san_move, s2.proceed_to_stage3
       FROM lichess_pgn_stage2 s2
       INNER JOIN lichess_pgn_stage1 s1
         ON s1.game_id = s2.game_id AND s1.ply_index = s2.ply_index
       WHERE s2.game_id = ?
         AND s1.proceed_to_stage2 = 1
         AND s2.proceed_to_stage3 = 1
       ORDER BY s2.ply_index`
    )
    .all(gameId);
}

function newS3Plies(gameId) {
  return db
    .prepare(
      `SELECT ply_index, san_move FROM lichess_pgn_stage2
       WHERE game_id = ? AND proceed_to_stage3 = 1
       ORDER BY ply_index`
    )
    .all(gameId);
}

function moveWiseRows(gameId) {
  const s0 = getStage0Features(gameId)?.moves || [];
  const s1 = getStage1Features(gameId)?.moves || [];
  const s2 = getStage2Features(gameId)?.moves || [];
  const s3 = getStage3Features(gameId)?.moves || [];
  const s4 = getStage4Features(gameId)?.moves || [];
  const by = (arr) => new Map(arr.map((m) => [m.ply_index, m]));
  const m0 = by(s0);
  const m1 = by(s1);
  const m2 = by(s2);
  const m3 = by(s3);
  const m4 = by(s4);
  const plies = [...new Set([...m0.keys(), ...m1.keys(), ...m2.keys(), ...m3.keys(), ...m4.keys()])].sort(
    (a, b) => a - b
  );

  return plies
    .map((ply) => {
      const a = m0.get(ply);
      const b = m1.get(ply);
      const c = m2.get(ply);
      const d = m3.get(ply);
      const e = m4.get(ply);
      const s0sac = Boolean(a?.is_sacrifice_candidate || a?.proceed_to_stage1);
      const s1ok = Boolean(b?.proceed_to_stage2);
      const s2ok = Boolean(c?.proceed_to_stage3);
      const s3ok = Boolean(d?.proceed_to_stage4);
      const path = c?.candidate_path || a?.engine_candidate_path || null;
      const oldS3 = s1ok && s2ok;
      const newS3 = s2ok;
      if (!s0sac && !s1ok && !c && !d && !e) return null;
      return {
        ply,
        san: a?.san_move || b?.san_move || c?.san_move || d?.san_move || e?.san_move,
        path,
        S0_sac: s0sac,
        S1_proceed: s1ok,
        S2_analyzed: Boolean(c),
        S2_proceed: s2ok,
        S3_proceed: s3ok,
        S4_class: e?.classification || null,
        S4_score: e?.brilliance_score ?? null,
        S4_brilliant: Boolean(e?.is_brilliant),
        OLD_would_reach_S3: oldS3,
        NEW_reaches_S3: newS3,
        reached_S4_without_S1: s3ok && !s1ok,
      };
    })
    .filter(Boolean);
}

async function runCurrentPipeline(pgn, filename) {
  const t0 = performance.now();
  const game = importOrGetGameForPgn(pgn, { originalFilename: filename });
  const gameId = game.id;
  clearStageTablesFrom(gameId, 1);
  resetStageGameCounters(gameId, 1);

  const t = {};
  let mark = performance.now();
  await runStage0ForGame(gameId, { force: true });
  t.stage0 = performance.now() - mark;
  mark = performance.now();
  await runStage1ForGame(gameId, { force: true });
  t.stage1 = performance.now() - mark;
  mark = performance.now();
  await runStage2ForGame(gameId, { force: true });
  t.stage2 = performance.now() - mark;
  mark = performance.now();
  await runStage3ForGame(gameId, { force: true });
  t.stage3 = performance.now() - mark;
  mark = performance.now();
  await runStage4ForGame(gameId, { force: true });
  t.stage4 = performance.now() - mark;
  t.total = performance.now() - t0;

  return { gameId, timing: t, moveCount: game.move_count };
}

async function compareStage01Python(pgn) {
  const curScript0 = path.join(ROOT, 'backend', 'brilliance', 'brilliance_stage0.py');
  const curScript1 = path.join(ROOT, 'backend', 'brilliance', 'brilliance_stage1.py');
  const v1Script0 = path.join(V1_BRILLIANCE, 'brilliance_stage0.py');
  const v1Script1 = path.join(V1_BRILLIANCE, 'brilliance_stage1.py');

  const t0 = performance.now();
  const cur0 = await runPy(curScript0, { pgn }, path.dirname(curScript0));
  const cur0ms = performance.now() - t0;
  const t1 = performance.now();
  const cur1 = await runPy(curScript1, { pgn }, path.dirname(curScript1));
  const cur1ms = performance.now() - t1;

  const t2 = performance.now();
  const v10 = await runPy(v1Script0, { pgn }, V1_BRILLIANCE);
  const v10ms = performance.now() - t2;
  const t3 = performance.now();
  const v11 = await runPy(v1Script1, { pgn }, V1_BRILLIANCE);
  const v11ms = performance.now() - t3;

  return {
    current: {
      move_count: cur0.move_count,
      sac0: cur0.sacrifice_candidate_count,
      engine_cands: cur0.engine_candidate_count,
      s1_candidates: cur1.candidate_count,
      s1_proceed: cur1.proceed_to_stage2_count,
      stage0_ms: Math.round(cur0ms),
      stage1_ms: Math.round(cur1ms),
    },
    version1: {
      move_count: v10.move_count,
      sac0: v10.sacrifice_candidate_count,
      engine_cands: v10.engine_candidate_count,
      s1_candidates: v11.candidate_count,
      s1_proceed: v11.proceed_to_stage2_count,
      stage0_ms: Math.round(v10ms),
      stage1_ms: Math.round(v11ms),
    },
  };
}

function printGameReport(gameMeta, pipe, rows, pyCmp) {
  const s0 = getStage0Features(pipe.gameId);
  const s1 = getStage1Features(pipe.gameId);
  const s2 = getStage2Features(pipe.gameId);
  const s3 = getStage3Features(pipe.gameId);
  const s4 = getStage4Features(pipe.gameId);
  const oldPlies = oldJoinPlies(pipe.gameId);
  const newPlies = newS3Plies(pipe.gameId);
  const withoutS1 = rows.filter((r) => r.reached_S4_without_S1);
  const brilliant = rows.filter((r) => r.S4_brilliant);

  console.log('\n' + '='.repeat(72));
  console.log(gameMeta.label);
  console.log('='.repeat(72));
  console.log(`game_id=${pipe.gameId}  moves=${pipe.moveCount}`);
  console.log('\nTIMING (CURRENT full pipeline)');
  console.log(
    `  S0 ${fmtMs(pipe.timing.stage0)} | S1 ${fmtMs(pipe.timing.stage1)} | S2 ${fmtMs(pipe.timing.stage2)} | S3 ${fmtMs(pipe.timing.stage3)} | S4 ${fmtMs(pipe.timing.stage4)} | TOTAL ${fmtMs(pipe.timing.total)}`
  );

  console.log('\nFUNNEL COUNTS');
  console.log('  CURRENT (new JOIN = all S2→S3 passers):');
  console.log(
    `    S0 sac ${s0?.moves?.filter((m) => m.is_sacrifice_candidate).length ?? 0} | S1→S2 ${s1?.moves?.filter((m) => m.proceed_to_stage2).length ?? 0} | S2 analyzed ${s2?.moves?.length ?? 0} | S2→S3 ${newPlies.length} | S3→S4 ${s3?.moves?.filter((m) => m.proceed_to_stage4).length ?? 0} | S4 rows ${s4?.moves?.length ?? 0} | BRILLIANT ${brilliant.length}`
  );
  console.log('  OLD (_version_1 JOIN = S1∩S2 only for Stage 3):');
  console.log(
    `    same S0–S2 data → Stage3 eligible would be ${oldPlies.length} (vs ${newPlies.length} now)`
  );
  console.log(
    `    Extra S3 candidates unlocked by JOIN fix: ${newPlies.length - oldPlies.length}`
  );
  console.log(`    S4-without-S1 (quiet/alt/def path): ${withoutS1.length}`);

  if (pyCmp) {
    console.log('\nSTAGE 0/1 PYTHON: CURRENT vs _version_1 (board-only, no SF)');
    console.log(
      `  CURRENT  sac0=${pyCmp.current.sac0} engine=${pyCmp.current.engine_cands} s1_cand=${pyCmp.current.s1_candidates} s1→s2=${pyCmp.current.s1_proceed}  (${fmtMs(pyCmp.current.stage0_ms)} + ${fmtMs(pyCmp.current.stage1_ms)})`
    );
    console.log(
      `  VERSION1 sac0=${pyCmp.version1.sac0} engine=${pyCmp.version1.engine_cands} s1_cand=${pyCmp.version1.s1_candidates} s1→s2=${pyCmp.version1.s1_proceed}  (${fmtMs(pyCmp.version1.stage0_ms)} + ${fmtMs(pyCmp.version1.stage1_ms)})`
    );
  }

  console.log('\nMOVE-WISE (only plies touching brilliance funnel)');
  console.log(
    '  ply  san        path         S0  S1  S2a S2→  S3→  OLD_S3  NEW_S3  S4class              score'
  );
  for (const r of rows) {
    if (!(r.S0_sac || r.S2_analyzed || r.S3_proceed || r.S4_class)) continue;
    console.log(
      `  ${String(r.ply).padStart(3)}  ${(r.san || '').padEnd(10)} ${(r.path || '—').padEnd(12)} ${r.S0_sac ? 'Y' : '.'}   ${r.S1_proceed ? 'Y' : '.'}   ${r.S2_analyzed ? 'Y' : '.'}   ${r.S2_proceed ? 'Y' : '.'}   ${r.S3_proceed ? 'Y' : '.'}   ${r.OLD_would_reach_S3 ? 'Y' : '.'}      ${r.NEW_reaches_S3 ? 'Y' : '.'}      ${(r.S4_class || '—').padEnd(20)} ${r.S4_score ?? '—'}`
    );
  }

  if (withoutS1.length) {
    console.log('\n  ★ Reached Stage 4 WITHOUT Stage 1 proceed (multi-path):');
    for (const r of withoutS1) {
      console.log(
        `    ply ${r.ply} ${r.san} path=${r.path} class=${r.S4_class} score=${r.S4_score}`
      );
    }
  }

  return {
    gameId: pipe.gameId,
    label: gameMeta.label,
    timing: pipe.timing,
    funnel: {
      current: {
        sac0: s0?.moves?.filter((m) => m.is_sacrifice_candidate).length ?? 0,
        s1_to_s2: s1?.moves?.filter((m) => m.proceed_to_stage2).length ?? 0,
        s2_analyzed: s2?.moves?.length ?? 0,
        s2_to_s3: newPlies.length,
        s3_to_s4: s3?.moves?.filter((m) => m.proceed_to_stage4).length ?? 0,
        s4_rows: s4?.moves?.length ?? 0,
        brilliant: brilliant.length,
      },
      old_join_s3_eligible: oldPlies.length,
      extra_s3_from_join_fix: newPlies.length - oldPlies.length,
      s4_without_s1: withoutS1.length,
    },
    pyCmp,
    moves: rows,
    brilliant: brilliant.map((r) => ({ ply: r.ply, san: r.san, score: r.S4_score, path: r.path })),
  };
}

async function main() {
  if (!fs.existsSync(V1_BRILLIANCE)) {
    console.error('Missing _version_1 brilliance at', V1_BRILLIANCE);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('OLDER CODE: YES — _version_1/backend/brilliance (S1∩S2 JOIN for Stage 3)');
  console.log('CURRENT CODE: working tree (S2-only Stage 3 + feature pack)');
  console.log('Stockfish:', fs.existsSync(STOCKFISH) ? STOCKFISH : 'MISSING');

  console.log(`\n${'='.repeat(72)}`);
  console.log('WHY hxg5-STYLE MOVES REACH STAGE 4 AFTER FAILING STAGE 1');
  console.log('='.repeat(72));
  console.log(`
Stage 0 can flag a capture as a "hanging/indirect" sac candidate even when
raw SEE is largely positive (winning capture), via exposure on the landing
square (e.g. verified pawn@g5). That opens Stage 1.

Stage 1 correctly STOPS many of these (winning_capture / invalid sac).

Stage 2 still admits quiet / alternative / defensive paths without Stage 1.
So a move can show: S1 Stop · S2 → S3 · S3 → S4 · S4 practical_brilliant.

OLD (_version_1) Stage 3 JOIN required Stage 1 proceed — those moves never
reached deep SF / Stage 4. CURRENT JOIN fix lets them through.
`);

  const summaries = [];
  for (const g of GAMES) {
    console.log(`\n>>> Running CURRENT pipeline: ${g.id} ...`);
    const pipe = await runCurrentPipeline(g.pgn, `compare_${g.id}.pgn`);
    console.log(`>>> Comparing Stage0/1 Python vs _version_1 for ${g.id} ...`);
    let pyCmp = null;
    try {
      pyCmp = await compareStage01Python(g.pgn);
    } catch (e) {
      console.warn(`  Stage0/1 v1 compare failed: ${e.message}`);
    }
    const rows = moveWiseRows(pipe.gameId);
    const summary = printGameReport(g, pipe, rows, pyCmp);
    summaries.push(summary);
    fs.writeFileSync(
      path.join(OUT_DIR, `${g.id}.json`),
      JSON.stringify(summary, null, 2),
      'utf8'
    );
  }

  console.log('\n' + '='.repeat(72));
  console.log('AGGREGATE SUMMARY');
  console.log('='.repeat(72));
  let totCur = 0;
  let totOldS3 = 0;
  let totNewS3 = 0;
  let totExtra = 0;
  let totS4NoS1 = 0;
  for (const s of summaries) {
    totCur += s.timing.total;
    totOldS3 += s.funnel.old_join_s3_eligible;
    totNewS3 += s.funnel.current.s2_to_s3;
    totExtra += s.funnel.extra_s3_from_join_fix;
    totS4NoS1 += s.funnel.s4_without_s1;
    console.log(
      `  ${s.label.slice(0, 42).padEnd(42)}  pipeline ${fmtMs(s.timing.total).padStart(8)}  S3 old/new ${s.funnel.old_join_s3_eligible}/${s.funnel.current.s2_to_s3}  BRILL ${s.funnel.current.brilliant}  S4noS1 ${s.funnel.s4_without_s1}`
    );
  }
  console.log(
    `\n  Total CURRENT wall: ${fmtMs(totCur)} | S3 eligible old=${totOldS3} new=${totNewS3} (+${totExtra}) | S4-without-S1=${totS4NoS1}`
  );

  const allPath = path.join(OUT_DIR, 'ALL_SUMMARY.json');
  fs.writeFileSync(allPath, JSON.stringify({ generatedAt: new Date().toISOString(), summaries }, null, 2));
  console.log(`\nWrote JSON reports to ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
