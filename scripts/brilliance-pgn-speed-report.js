/**
 * Brilliance pipeline speed report for a single PGN.
 * Times stages 0–4, reports funnel (incl. S2 path split + S3 JOIN gate),
 * and benchmarks Stage 3 on raw S2 passers when the S1∩S2 JOIN empties the set.
 *
 * Run: node scripts/brilliance-pgn-speed-report.js
 */
const { db } = require('../backend/brilliance/db/database');
const { importOrGetGameForPgn, getGame } = require('../backend/brilliance/services/lichessPgnService');
const { runStage0ForGame, getStage0Features } = require('../backend/brilliance/services/brillianceStage0Service');
const { runStage1ForGame, getStage1Features } = require('../backend/brilliance/services/brillianceStage1Service');
const { runStage2ForGame, getStage2Features } = require('../backend/brilliance/services/brillianceStage2Service');
const { runStage3ForGame, getStage3Features } = require('../backend/brilliance/services/brillianceStage3Service');
const { runStage4ForGame, getStage4Features } = require('../backend/brilliance/services/brillianceStage4Service');
const {
  clearStageTablesFrom,
  resetStageGameCounters,
} = require('../backend/brilliance/services/brilliancePipelineUtils');
const { runPythonScript, STOCKFISH_EXE } = require('../backend/brilliance/utils/brilliancePython');
const path = require('path');

const PGN = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2025.10.01"]
[Round "?"]
[White "Akshajdec2013"]
[Black "IlyaGerman2020"]
[Result "1/2-1/2"]
[TimeControl "600"]
[WhiteElo "740"]
[BlackElo "760"]
[Termination "Game drawn by repetition"]
[ECO "C57"]
[EndTime "9:33:02 GMT+0000"]
[Link "https://www.chess.com/game/live/143769403598"]

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
Bb1 74. Bd6 Be4 75. Bf8 Bb1 76. Bg7 Be4 77. Bf8 Bb1 1/2-1/2`;

const STAGE3_SCRIPT = path.join(__dirname, '..', 'backend', 'brilliance', 'brilliance_stage3.py');

const STAGE_NAMES = {
  0: 'Board features (python-chess)',
  1: 'Sacrifice classification',
  2: 'Shallow Stockfish (~d12)',
  3: 'Deep Stockfish (depth curve)',
  4: 'Human perception scoring',
};

function fmtMs(ms) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)} s`;
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(1);
  return `${m}m ${s}s`;
}

function pct(part, whole) {
  if (!whole) return '0%';
  return `${((100 * part) / whole).toFixed(1)}%`;
}

async function timed(label, fn) {
  const t0 = performance.now();
  process.stdout.write(`\n▶ ${label} ... `);
  try {
    const result = await fn();
    const ms = performance.now() - t0;
    console.log(`done in ${fmtMs(ms)}`);
    return { ok: true, ms, result };
  } catch (e) {
    const ms = performance.now() - t0;
    console.log(`FAILED after ${fmtMs(ms)}`);
    console.error(`  ${e.message || e}`);
    return { ok: false, ms, error: e.message || String(e) };
  }
}

function pathCounts(moves) {
  return (moves || []).reduce((acc, m) => {
    const p = m.candidate_path || m.features?.candidate_path || '?';
    acc[p] = (acc[p] || 0) + 1;
    return acc;
  }, {});
}

function getJoinEligiblePlies(gameId) {
  return db
    .prepare(
      `SELECT s2.ply_index
       FROM lichess_pgn_stage2 s2
       WHERE s2.game_id = ?
         AND s2.proceed_to_stage3 = 1
       ORDER BY s2.ply_index ASC`
    )
    .all(gameId)
    .map((r) => r.ply_index);
}

async function main() {
  console.log('='.repeat(64));
  console.log('BRILLIANCE PIPELINE — SPEED REPORT');
  console.log('='.repeat(64));
  console.log(`Started: ${new Date().toISOString()}`);

  const importTimed = await timed('Import / upsert PGN into SQLite', async () =>
    importOrGetGameForPgn(PGN, { originalFilename: 'speed_report_fried_liver_draw.pgn' })
  );
  if (!importTimed.ok) process.exit(1);

  const game = importTimed.result;
  const gameId = game.id;
  console.log(`  game_id=${gameId}  moves=${game.move_count ?? '?'}`);

  clearStageTablesFrom(gameId, 1);
  resetStageGameCounters(gameId, 1);

  const s0 = await timed(`Stage 0 — ${STAGE_NAMES[0]}`, () => runStage0ForGame(gameId, { force: true }));
  if (!s0.ok) process.exit(1);

  const s1 = await timed(`Stage 1 — ${STAGE_NAMES[1]}`, () => runStage1ForGame(gameId, { force: true }));
  if (!s1.ok) process.exit(1);

  const s2 = await timed(`Stage 2 — ${STAGE_NAMES[2]}`, () => runStage2ForGame(gameId, { force: true }));
  if (!s2.ok) process.exit(1);

  const f0 = getStage0Features(gameId);
  const f1 = getStage1Features(gameId);
  const f2 = getStage2Features(gameId);

  const moveCount = f0?.moves?.length ?? game.move_count ?? 0;
  const sac0 = f0?.moves?.filter((m) => m.is_sacrifice_candidate).length ?? 0;
  const s1Rows = f1?.moves?.length ?? 0;
  const toS2 = f1?.moves?.filter((m) => m.proceed_to_stage2).length ?? 0;
  const s2Analyzed = f2?.moves?.length ?? 0;
  const rawToS3 = f2?.moves?.filter((m) => m.proceed_to_stage3).length ?? 0;
  const joinToS3 = getJoinEligiblePlies(gameId);
  const s2PathsAll = pathCounts(f2?.moves);
  const s2PathsPass = pathCounts(f2?.moves?.filter((m) => m.proceed_to_stage3));

  let s3 = { ok: true, ms: 0, result: null, skipped: false, mode: 'pipeline' };
  let s4 = { ok: true, ms: 0, result: null, skipped: false };
  let s3Bench = null;

  if (joinToS3.length === 0) {
    console.log(
      `\n⏭ Stage 3 pipeline skipped — S1∩S2 JOIN has 0 plies (raw S2→S3 passers: ${rawToS3})`
    );
    s3.skipped = true;
    s4.skipped = true;

    // Benchmark Stage 3 on raw S2 passers (what the engine work would cost)
    if (rawToS3 > 0) {
      const plies = f2.moves.filter((m) => m.proceed_to_stage3).map((m) => m.ply_index);
      const fresh = getGame(gameId);
      s3Bench = await timed(
        `Stage 3 BENCH — deep SF on ${plies.length} raw S2 passers (bypass JOIN)`,
        () =>
          runPythonScript(
            STAGE3_SCRIPT,
            JSON.stringify({
              pgn: fresh.clean_pgn,
              engine_path: STOCKFISH_EXE,
              ply_indices: plies,
            })
          )
      );
      if (s3Bench.ok) {
        const analyzed = s3Bench.result?.analyzed_count ?? s3Bench.result?.moves?.length ?? 0;
        const sound = s3Bench.result?.sound_count ?? 0;
        console.log(`  analyzed=${analyzed}  sound=${sound}`);
      }
    }
  } else {
    s3 = await timed(`Stage 3 — ${STAGE_NAMES[3]} (${joinToS3.length} S2 passers)`, () =>
      runStage3ForGame(gameId, { force: true })
    );
    if (!s3.ok) process.exit(1);

    const s3n = getStage3Features(gameId)?.moves?.length ?? 0;
    if (s3n === 0) {
      console.log('\n⏭ Stage 4 skipped (no Stage 3 rows)');
      s4.skipped = true;
    } else {
      s4 = await timed(`Stage 4 — ${STAGE_NAMES[4]}`, () => runStage4ForGame(gameId, { force: true }));
      if (!s4.ok) process.exit(1);
    }
  }

  const f3 = getStage3Features(gameId);
  const f4 = getStage4Features(gameId);
  const s3n = f3?.moves?.length ?? 0;
  const brilliantN = f4?.moves?.filter((m) => m.is_brilliant).length ?? 0;

  const pipelineMs = (s0.ms || 0) + (s1.ms || 0) + (s2.ms || 0) + (s3.ms || 0) + (s4.ms || 0);
  const totalMs = importTimed.ms + pipelineMs + (s3Bench?.ms || 0);

  console.log('\n' + '='.repeat(64));
  console.log('FUNNEL');
  console.log('='.repeat(64));
  console.log(`  Moves in game                 ${moveCount}`);
  console.log(`  Stage 0 sac candidates        ${sac0}  (${pct(sac0, moveCount)})`);
  console.log(`  Stage 1 rows / → Stage 2      ${s1Rows} / ${toS2}`);
  console.log(`  Stage 2 analyzed (all paths)  ${s2Analyzed}`);
  console.log(`    paths (all):                ${JSON.stringify(s2PathsAll)}`);
  console.log(`  Stage 2 → Stage 3 (raw)       ${rawToS3}`);
  console.log(`    paths (passed):             ${JSON.stringify(s2PathsPass)}`);
  console.log(`  Stage 3 S2 passers (eligible) ${joinToS3.length}`);
  console.log(`  Stage 3 analyzed (pipeline)   ${s3n}`);
  console.log(`  Stage 4 BRILLIANT             ${brilliantN}`);

  console.log('\n' + '='.repeat(64));
  console.log('TIMING');
  console.log('='.repeat(64));
  console.log(`  Import PGN             ${fmtMs(importTimed.ms).padStart(10)}  ${pct(importTimed.ms, totalMs)}`);
  console.log(`  Stage 0                ${fmtMs(s0.ms).padStart(10)}  ${pct(s0.ms, totalMs)}`);
  console.log(`  Stage 1                ${fmtMs(s1.ms).padStart(10)}  ${pct(s1.ms, totalMs)}`);
  console.log(`  Stage 2 (Stockfish)    ${fmtMs(s2.ms).padStart(10)}  ${pct(s2.ms, totalMs)}`);
  console.log(
    `  Stage 3 (pipeline)     ${s3.skipped ? '   skipped' : fmtMs(s3.ms).padStart(10)}  ${s3.skipped ? '' : pct(s3.ms, totalMs)}`
  );
  if (s3Bench) {
    console.log(`  Stage 3 (bench raw)    ${fmtMs(s3Bench.ms).padStart(10)}  ${pct(s3Bench.ms, totalMs)}`);
  }
  console.log(
    `  Stage 4                ${s4.skipped ? '   skipped' : fmtMs(s4.ms).padStart(10)}  ${s4.skipped ? '' : pct(s4.ms, totalMs)}`
  );
  console.log('  ' + '-'.repeat(44));
  console.log(`  Pipeline (0–4 official) ${fmtMs(pipelineMs).padStart(10)}`);
  console.log(`  TOTAL (incl. bench)    ${fmtMs(totalMs).padStart(10)}`);

  if (s2Analyzed > 0) {
    console.log(`\n  Stage 2 per candidate   ${fmtMs(s2.ms / s2Analyzed)}  (${s2Analyzed} candidates)`);
  }
  if (s3Bench?.ok && rawToS3 > 0) {
    console.log(`  Stage 3 bench / cand    ${fmtMs(s3Bench.ms / rawToS3)}  (${rawToS3} candidates)`);
  } else if (!s3.skipped && joinToS3.length > 0) {
    console.log(`  Stage 3 per candidate   ${fmtMs(s3.ms / joinToS3.length)}  (${joinToS3.length} candidates)`);
  }

  // S1 passers detail
  const s1Pass = (f1?.moves || []).filter((m) => m.proceed_to_stage2);
  if (s1Pass.length) {
    console.log('\n' + '='.repeat(64));
    console.log('STAGE 1 → STAGE 2 (sacrifice path only)');
    console.log('='.repeat(64));
    for (const m of s1Pass) {
      const s2m = f2?.moves?.find((x) => x.ply_index === m.ply_index);
      console.log(
        `  ply ${String(m.ply_index).padStart(3)}  ${(m.san_move || '').padEnd(8)}  S2: ${
          s2m
            ? `${s2m.proceed_to_stage3 ? '→S3' : 'fail'} path=${s2m.candidate_path || '?'} reason=${s2m.gate_fail_reason || '-'}`
            : 'not in S2'
        }`
      );
    }
  }

  if (s3Bench?.ok && s3Bench.result?.moves?.length) {
    const sound = s3Bench.result.moves.filter((m) => m.engine?.is_sound || m.is_sound);
    console.log('\n' + '='.repeat(64));
    console.log(`STAGE 3 BENCH SOUND MOVES (${sound.length}/${s3Bench.result.moves.length})`);
    console.log('='.repeat(64));
    for (const m of sound.slice(0, 20)) {
      const eng = m.engine || m;
      console.log(
        `  ply ${String(m.ply_index).padStart(3)}  ${(m.san_move || '').padEnd(8)}  deep=${eng.deep_eval_cp ?? '?'}  non_obv=${eng.is_non_obvious ?? '?'}`
      );
    }
    if (sound.length > 20) console.log(`  ... +${sound.length - 20} more`);
  }

  const brilliant = (f4?.moves || [])
    .filter((m) => m.is_brilliant)
    .map((m) => ({
      ply: m.ply_index,
      san: m.san_move,
      score: m.brilliance_score,
      classification: m.classification,
    }));
  if (brilliant.length) {
    console.log('\nBRILLIANT:', JSON.stringify(brilliant));
  }

  const summary = {
    gameId,
    moveCount,
    funnel: {
      sac0,
      s1Rows,
      toS2,
      s2Analyzed,
      rawToS3,
      joinToS3: joinToS3.length,
      s3n,
      brilliantN,
      s2PathsAll,
      s2PathsPass,
    },
    timingMs: {
      import: Math.round(importTimed.ms),
      stage0: Math.round(s0.ms),
      stage1: Math.round(s1.ms),
      stage2: Math.round(s2.ms),
      stage3Pipeline: Math.round(s3.ms || 0),
      stage3Bench: s3Bench ? Math.round(s3Bench.ms) : null,
      stage4: Math.round(s4.ms || 0),
      pipeline: Math.round(pipelineMs),
      total: Math.round(totalMs),
    },
    note:
      joinToS3.length === 0 && rawToS3 > 0
        ? 'Stage 3 pipeline blocked by S1∩S2 JOIN; bench timed deep SF on raw S2 passers'
        : null,
  };
  console.log('\n' + '='.repeat(64));
  console.log(`Finished: ${new Date().toISOString()}`);
  console.log('JSON_SUMMARY ' + JSON.stringify(summary));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
