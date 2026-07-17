/**
 * Detailed PGN efficiency report:
 * Hosted https://stockfish-cbp.onrender.com vs local Stockfish binary.
 *
 * Run: node scripts/stockfish-pgn-efficiency-report.js
 */
const path = require('path');
const fs = require('fs');
const { Chess } = require(path.join(__dirname, '../backend/node_modules/chess.js'));
const LOCAL = require('../backend/api/services/stockfishService');

const HOSTED = 'https://stockfish-cbp.onrender.com';

// Real game PGN (user-provided) with NAG judgments preserved in comments for reference
const PGN = `1. d3 d5 2. Nf3 c5 3. c3 Nc6 4. Qc2 e5 5. e4 d4 6. Be2 f5 7. Bg5 Be7 8. Bxe7
Qxe7 9. Nbd2 Nf6 10. O-O O-O 11. Nc4 b5 12. Ncd2 Bb7 13. a4 a6 14. Ne1
Rac8 15. f4 fxe4 16. dxe4 exf4 17. Rxf4 Qd6 18. Rh4 c4 19. Qd1 d3 20.
Bh5 Qe7 21. Qf3 Nd5 22. Qh3 Nf4 23. Qg4 Qf6 24. Nef3 Ne5 25. Nxe5 Ne2+
26. Kh1 Qxe5 27. Nf3 Qf6 28. Qd7 Bc6 29. Qg4 Bb7 30. e5 Qe7 31. Qh3 Bxf3 32.
gxf3 Qxe5 33. Bg4 h6 34. Bxc8 Rxc8 35. Qxc8+ Kh7 36. Rg4 Qd5 37. Qc7
Qxf3+ 38. Rg2 1-0`;

/** NAG labels from the annotated source (ply → judgment) */
const ANNOTATED = {
  12: { san: 'f5', nag: '$2', label: 'Mistake' },
  13: { san: 'Bg5', nag: '$6', label: 'Inaccuracy' },
  21: { san: 'Nc4', nag: '$2', label: 'Mistake' },
  22: { san: 'b5', nag: '$6', label: 'Inaccuracy' },
  24: { san: 'Bb7', nag: '$2', label: 'Mistake' },
  25: { san: 'a4', nag: '$6', label: 'Inaccuracy' },
  26: { san: 'a6', nag: '$2', label: 'Mistake' },
  27: { san: 'Ne1', nag: '$2', label: 'Mistake' },
  28: { san: 'Rac8', nag: '$4', label: 'Blunder' },
  29: { san: 'f4', nag: '$9', label: 'Interesting' },
  31: { san: 'dxe4', nag: '$6', label: 'Inaccuracy' },
  32: { san: 'exf4', nag: '$2', label: 'Mistake' },
  33: { san: 'Rxf4', nag: '$9', label: 'Interesting' },
  42: { san: 'Nd5', nag: '$2', label: 'Mistake' },
  43: { san: 'Qh3', nag: '$2', label: 'Mistake' },
  44: { san: 'Nf4', nag: '$1', label: 'Good' },
  45: { san: 'Qg4', nag: '$6', label: 'Inaccuracy' },
  46: { san: 'Qf6', nag: '$6', label: 'Inaccuracy' },
  52: { san: 'Qxe5', nag: '$1', label: 'Good' },
  61: { san: 'Qh3', nag: '$6', label: 'Inaccuracy' },
  62: { san: 'Bxf3', nag: '$2', label: 'Mistake' },
  63: { san: 'gxf3', nag: '$9', label: 'Interesting' },
  65: { san: 'Bg4', nag: '$6', label: 'Inaccuracy' },
  66: { san: 'h6', nag: '$4', label: 'Blunder' },
  68: { san: 'Rxc8', nag: '$2', label: 'Mistake' },
};

async function timed(fn) {
  const t0 = performance.now();
  try {
    const result = await fn();
    return { ok: true, ms: Math.round(performance.now() - t0), result };
  } catch (e) {
    return { ok: false, ms: Math.round(performance.now() - t0), error: e.message || String(e) };
  }
}

async function hostedFetch(endpoint, body, timeoutMs = 600_000) {
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
      color: m.color,
      previous_fen,
      current_fen: replay.fen(),
    });
  }
  return plies;
}

function normalizeUci(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (s.startsWith('bestmove ')) return s.split(/\s+/)[1] || null;
  return s.split(/\s+/)[0] || null;
}

function hostedScore(analysis) {
  if (!analysis) return null;
  const top = analysis.analysis?.[0];
  if (!top) return null;
  if (top.mate != null) return { type: 'mate', value: top.mate };
  if (top.cp != null) return { type: 'cp', value: top.cp };
  return null;
}

function scoreNum(score) {
  if (!score) return null;
  if (score.type === 'mate') return score.value > 0 ? 10000 : -10000;
  return score.value;
}

function avg(arr) {
  return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
}

function pct(n, d) {
  return d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a';
}

(async () => {
  console.log('=== Stockfish PGN Efficiency Comparison ===');
  console.log(`Hosted: ${HOSTED}`);
  console.log(`Local:  stockfish-windows-x86-64-avx2.exe via stockfishService\n`);

  const report = {
    meta: {
      date: new Date().toISOString(),
      hosted: HOSTED,
      docs: `${HOSTED}/docs`,
      localEngine: 'stockfish-windows-x86-64-avx2.exe',
      pgnSource: 'user-provided annotated game (NAGs stripped for engine input)',
      result: '1-0',
    },
    health: {},
    hostedFullGame: {},
    localFullGame: {},
    perPly: [],
    annotatedFocus: [],
    efficiency: {},
    agreement: {},
    verdict: {},
  };

  // --- Health ---
  console.log('--- Health ---');
  const health = await timed(() => fetch(HOSTED, { signal: AbortSignal.timeout(20000) }).then((r) => r.json()));
  report.health = health;
  console.log(health.ok ? `OK ${health.ms}ms ${JSON.stringify(health.result)}` : `FAIL ${health.error}`);

  const plies = parsePlies(PGN);
  report.meta.totalPlies = plies.length;
  console.log(`Parsed ${plies.length} plies\n`);

  // --- Hosted full-game /analyze-game ---
  console.log('--- Hosted POST /analyze-game (movetime=200, multipv=3) ---');
  const hostedGame = await timed(() =>
    hostedFetch('/analyze-game', { pgn: PGN, movetime: 200, multipv: 3 }, 600_000)
  );
  report.hostedFullGame = {
    ok: hostedGame.ok,
    ms: hostedGame.ms,
    error: hostedGame.error || null,
    total_plies: hostedGame.result?.total_plies ?? null,
    timelineLen: hostedGame.result?.timeline?.length ?? null,
    msPerPly:
      hostedGame.ok && hostedGame.result?.timeline?.length
        ? Math.round(hostedGame.ms / hostedGame.result.timeline.length)
        : null,
  };
  console.log(
    hostedGame.ok
      ? `OK ${hostedGame.ms}ms — ${report.hostedFullGame.total_plies} plies (~${report.hostedFullGame.msPerPly} ms/ply)`
      : `FAIL ${hostedGame.ms}ms ${hostedGame.error}`
  );

  // Warm local engine once
  console.log('\n--- Local warm-up ---');
  const warm = await timed(() =>
    LOCAL.analyzePosition({
      currentFen: plies[0].current_fen,
      previousFen: plies[0].previous_fen,
      multipv: 3,
    })
  );
  console.log(warm.ok ? `warm ${warm.ms}ms` : `warm FAIL ${warm.error}`);

  // --- Local full-game ply loop ---
  console.log('\n--- Local full-game analyzePosition (multipv=3) ---');
  const localTimeline = [];
  const localT0 = performance.now();
  let localErrors = 0;

  for (const p of plies) {
    const r = await timed(() =>
      LOCAL.analyzePosition({
        currentFen: p.current_fen,
        previousFen: p.previous_fen,
        multipv: 3,
      })
    );
    if (!r.ok) localErrors += 1;
    localTimeline.push({
      ply: p.ply,
      san: p.san,
      played: p.uci,
      ms: r.ms,
      ok: r.ok,
      bestmove: r.ok ? normalizeUci(r.result.bestmove) : null,
      previousFenBestmove: r.ok ? normalizeUci(r.result.previousFenBestmove) : null,
      score: r.ok ? r.result.score : null,
      depth: r.ok ? r.result.depth : null,
      winProbability: r.ok ? r.result.winProbability : null,
      lines: r.ok ? (r.result.lines || []).length : 0,
      error: r.error || null,
    });
    if (p.ply % 10 === 0 || p.ply === plies.length) {
      console.log(`  local ply ${p.ply}/${plies.length} … last ${r.ms}ms`);
    }
  }
  const localTotalMs = Math.round(performance.now() - localT0);
  report.localFullGame = {
    ok: localErrors === 0,
    ms: localTotalMs,
    errors: localErrors,
    analyzed: localTimeline.length,
    msPerPly: Math.round(localTotalMs / localTimeline.length),
    avgPlyMs: avg(localTimeline.map((x) => x.ms)),
    minPlyMs: Math.min(...localTimeline.map((x) => x.ms)),
    maxPlyMs: Math.max(...localTimeline.map((x) => x.ms)),
  };
  console.log(
    `Local done: ${localTotalMs}ms total (~${report.localFullGame.msPerPly} ms/ply avg ${report.localFullGame.avgPlyMs}ms)`
  );

  // --- Per-ply compare ---
  const hostedTimeline = hostedGame.ok ? hostedGame.result.timeline || [] : [];
  let bestAgree = 0;
  let prevBestAgree = 0;
  let compared = 0;
  let evalGaps = [];

  for (let i = 0; i < plies.length; i++) {
    const p = plies[i];
    const loc = localTimeline[i];
    const ht = hostedTimeline[i] || null;
    const ha = ht?.analysis || null;

    const hostedBest = normalizeUci(ha?.bestmove);
    const hostedPrev = normalizeUci(ha?.previous_fen_bestmove);
    const hScore = hostedScore(ha);
    const lScore = loc.score;

    const bestMatch = loc.bestmove && hostedBest ? loc.bestmove === hostedBest : null;
    const prevMatch =
      loc.previousFenBestmove && hostedPrev ? loc.previousFenBestmove === hostedPrev : null;

    if (bestMatch != null) {
      compared += 1;
      if (bestMatch) bestAgree += 1;
    }
    if (prevMatch === true) prevBestAgree += 1;

    const lNum = scoreNum(lScore);
    const hNum = scoreNum(hScore);
    let evalGapCp = null;
    if (lNum != null && hNum != null && Math.abs(lNum) < 9000 && Math.abs(hNum) < 9000) {
      evalGapCp = Math.abs(lNum - hNum);
      evalGaps.push(evalGapCp);
    }

    const playedWasBestLocal = loc.previousFenBestmove && loc.previousFenBestmove === p.uci;
    const playedWasBestHosted = hostedPrev && hostedPrev === p.uci;

    const row = {
      ply: p.ply,
      san: p.san,
      played: p.uci,
      localMs: loc.ms,
      localBest: loc.bestmove,
      localPrevBest: loc.previousFenBestmove,
      localEval: lScore,
      localDepth: loc.depth,
      localWinProb: loc.winProbability,
      hostedBest,
      hostedPrevBest: hostedPrev,
      hostedEval: hScore,
      hostedDepth: ha?.analysis?.[0]?.depth ?? ha?.requested_depth ?? null,
      hostedWinProb: ha?.win_probability ?? null,
      hostedLines: ha?.analysis?.length ?? 0,
      bestmoveAgree: bestMatch,
      prevBestAgree: prevMatch,
      evalGapCp,
      playedWasEngineBest: {
        local: playedWasBestLocal,
        hosted: playedWasBestHosted,
      },
      annotation: ANNOTATED[p.ply] || null,
    };
    report.perPly.push(row);
  }

  // Annotated focus rows
  report.annotatedFocus = report.perPly
    .filter((r) => r.annotation)
    .map((r) => ({
      ply: r.ply,
      san: r.san,
      played: r.played,
      judgment: r.annotation.label,
      nag: r.annotation.nag,
      localPrevBest: r.localPrevBest,
      hostedPrevBest: r.hostedPrevBest,
      enginesAgreeOnBest: r.prevBestAgree,
      playedMatchedLocalBest: r.playedWasEngineBest.local,
      playedMatchedHostedBest: r.playedWasEngineBest.hosted,
      localEvalAfter: r.localEval,
      hostedEvalAfter: r.hostedEval,
      evalGapCp: r.evalGapCp,
    }));

  report.agreement = {
    pliesCompared: compared,
    bestmoveMatches: bestAgree,
    bestmoveAgreementRate: pct(bestAgree, compared),
    prevBestMatches: prevBestAgree,
    prevBestAgreementRate: pct(prevBestAgree, report.perPly.filter((r) => r.prevBestAgree != null).length),
    avgEvalGapCp: avg(evalGaps),
    medianEvalGapCp: evalGaps.length
      ? [...evalGaps].sort((a, b) => a - b)[Math.floor(evalGaps.length / 2)]
      : null,
    evalGapsOver50cp: evalGaps.filter((g) => g > 50).length,
    evalGapsOver100cp: evalGaps.filter((g) => g > 100).length,
  };

  const hostedMs = report.hostedFullGame.ms;
  const localMs = report.localFullGame.ms;
  report.efficiency = {
    hosted: {
      mode: 'POST /analyze-game one-shot',
      settings: { movetime: 200, multipv: 3 },
      totalMs: hostedMs,
      msPerPly: report.hostedFullGame.msPerPly,
      networkRoundTrips: 1,
    },
    local: {
      mode: 'analyzePosition loop (persistent UCI)',
      settings: { multipv: 3, internalMovetimes: 'current~200ms + prev MultiPV~80ms + first-move scores' },
      totalMs: localMs,
      msPerPly: report.localFullGame.msPerPly,
      avgPlyMs: report.localFullGame.avgPlyMs,
      minPlyMs: report.localFullGame.minPlyMs,
      maxPlyMs: report.localFullGame.maxPlyMs,
      networkRoundTrips: 0,
      httpEquivalentIfProxied: `${plies.length} × POST /api/analyze`,
    },
    speedup: {
      hostedVsLocalTotal:
        localMs && hostedMs ? `${(localMs / hostedMs).toFixed(2)}x (local/hosted; >1 means hosted faster)` : null,
      localVsHostedTotal:
        localMs && hostedMs ? `${(hostedMs / localMs).toFixed(2)}x (hosted/local; >1 means local faster)` : null,
      winner:
        hostedMs && localMs
          ? hostedMs < localMs
            ? 'hosted faster for full-game batch'
            : 'local faster for full-game batch'
          : 'incomplete',
    },
  };

  // Classification-style signal: how often annotated mistakes were NOT engine best
  const ann = report.annotatedFocus;
  const mistakes = ann.filter((a) => ['Mistake', 'Blunder', 'Inaccuracy'].includes(a.judgment));
  report.verdict = {
    hostedOnline: health.ok,
    hostedAnalyzeGameOk: hostedGame.ok,
    localFullGameOk: report.localFullGame.ok,
    bestmoveAgreement: report.agreement.bestmoveAgreementRate,
    avgEvalGapCp: report.agreement.avgEvalGapCp,
    fullGameHostedMs: hostedMs,
    fullGameLocalMs: localMs,
    efficiencyWinner: report.efficiency.speedup.winner,
    annotatedJudgmentsChecked: ann.length,
    annotatedMistakesWherePlayedNotLocalBest: mistakes.filter((m) => m.playedMatchedLocalBest === false).length,
    annotatedMistakesWherePlayedNotHostedBest: mistakes.filter((m) => m.playedMatchedHostedBest === false).length,
    notes: [
      'Hosted /analyze-game is one HTTP call for the whole PGN; local CLIO analyzes ply-by-ply.',
      'Local analyzePosition uses short movetimes (quality tuned for interactive UI, not deep search).',
      'Hosted movetime=200 per ply is shallow; deeper depth would change evals and latency.',
      'Bestmove differences at low depth are expected; agreement rate is the key quality signal.',
    ],
  };

  // Slim JSON for readability (full perPly kept; drop huge raw hosted timeline)
  const out = {
    ...report,
    hostedSampleTimelineEntry: hostedTimeline[13] || hostedTimeline[0] || null,
  };

  const jsonPath = path.join(__dirname, 'stockfish-pgn-efficiency-report.json');
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));

  // Markdown report
  const md = buildMarkdown(out);
  const mdPath = path.join(__dirname, '..', 'stockfish-pgn-efficiency-report.md');
  fs.writeFileSync(mdPath, md);

  console.log(`\n=== Wrote ${jsonPath}`);
  console.log(`=== Wrote ${mdPath}`);
  console.log('\nSUMMARY');
  console.log(JSON.stringify(report.verdict, null, 2));
  console.log('\nEFFICIENCY');
  console.log(JSON.stringify(report.efficiency, null, 2));
  console.log('\nAGREEMENT');
  console.log(JSON.stringify(report.agreement, null, 2));

  try {
    LOCAL.shutdown?.();
  } catch {
    /* ignore */
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

function buildMarkdown(r) {
  const e = r.efficiency;
  const a = r.agreement;
  const v = r.verdict;
  const lines = [];
  lines.push('# Stockfish PGN Efficiency Report — Local vs Hosted');
  lines.push('');
  lines.push(`**Date:** ${r.meta.date}`);
  lines.push(`**Hosted API:** [${r.meta.hosted}](${r.meta.hosted}) · [docs](${r.meta.docs})`);
  lines.push(`**Local engine:** \`${r.meta.localEngine}\``);
  lines.push(`**Game:** ${r.meta.totalPlies} plies · Result ${r.meta.result}`);
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  lines.push(`- Hosted health: **${v.hostedOnline ? 'online' : 'down'}**`);
  lines.push(`- Hosted \`/analyze-game\`: **${v.hostedAnalyzeGameOk ? 'OK' : 'FAIL'}** in **${v.fullGameHostedMs} ms**`);
  lines.push(`- Local full-game loop: **${v.localFullGameOk ? 'OK' : 'FAIL'}** in **${v.fullGameLocalMs} ms**`);
  lines.push(`- Efficiency winner (batch full game): **${v.efficiencyWinner}**`);
  lines.push(`- Bestmove agreement (local vs hosted): **${v.bestmoveAgreement}**`);
  lines.push(`- Average eval gap: **${v.avgEvalGapCp ?? 'n/a'} cp**`);
  lines.push('');
  lines.push('## Test PGN');
  lines.push('');
  lines.push('User-provided game (NAGs stripped for engine; judgments used for focus section):');
  lines.push('');
  lines.push('```');
  lines.push(PGN.replace(/\n/g, ' ').trim());
  lines.push('```');
  lines.push('');
  lines.push('## Efficiency comparison');
  lines.push('');
  lines.push('| Metric | Hosted `/analyze-game` | Local `analyzePosition` loop |');
  lines.push('|--------|------------------------|------------------------------|');
  lines.push(`| Mode | ${e.hosted.mode} | ${e.local.mode} |`);
  lines.push(`| Settings | movetime=200, multipv=3 | multipv=3, short internal movetimes |`);
  lines.push(`| Total wall time | **${e.hosted.totalMs} ms** | **${e.local.totalMs} ms** |`);
  lines.push(`| ms / ply | ${e.hosted.msPerPly} | ${e.local.msPerPly} (avg call ${e.local.avgPlyMs}) |`);
  lines.push(`| HTTP round-trips | ${e.hosted.networkRoundTrips} | ${e.local.networkRoundTrips} (or ${r.meta.totalPlies} if via API) |`);
  lines.push(`| Min / max ply | n/a (batched) | ${e.local.minPlyMs} / ${e.local.maxPlyMs} ms |`);
  lines.push('');
  lines.push(`**Speed ratio:** local/hosted = ${e.speedup.hostedVsLocalTotal}; hosted/local = ${e.speedup.localVsHostedTotal}`);
  lines.push('');
  lines.push('### Efficiency notes');
  lines.push('');
  lines.push('- Hosted wins on **batch convenience**: one request returns the full timeline.');
  lines.push('- Local avoids network/Render cold-start variance and can be faster or slower depending on CPU vs remote load.');
  lines.push('- If CLIO keeps calling local via HTTP once per ply from the browser, effective latency is N round-trips; hosted `/analyze-game` collapses that to 1.');
  lines.push('');
  lines.push('## Quality / agreement');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Plies compared | ${a.pliesCompared} |`);
  lines.push(`| Bestmove matches | ${a.bestmoveMatches} (${a.bestmoveAgreementRate}) |`);
  lines.push(`| Previous-fen bestmove matches | ${a.prevBestMatches} (${a.prevBestAgreementRate}) |`);
  lines.push(`| Avg \\|eval\\| gap | ${a.avgEvalGapCp} cp |`);
  lines.push(`| Median eval gap | ${a.medianEvalGapCp} cp |`);
  lines.push(`| Gaps > 50 cp | ${a.evalGapsOver50cp} |`);
  lines.push(`| Gaps > 100 cp | ${a.evalGapsOver100cp} |`);
  lines.push('');
  lines.push('## Annotated moves focus');
  lines.push('');
  lines.push('Judgments from the source PGN vs whether engines considered the played move best:');
  lines.push('');
  lines.push('| Ply | Move | Judgment | Local best | Hosted best | Agree | Played=local? | Played=hosted? | Eval gap |');
  lines.push('|-----|------|----------|------------|-------------|-------|---------------|----------------|----------|');
  for (const row of r.annotatedFocus) {
    lines.push(
      `| ${row.ply} | ${row.san} | ${row.judgment} | ${row.localPrevBest || '—'} | ${row.hostedPrevBest || '—'} | ${row.enginesAgreeOnBest} | ${row.playedMatchedLocalBest} | ${row.playedMatchedHostedBest} | ${row.evalGapCp ?? '—'} |`
    );
  }
  lines.push('');
  lines.push(`Of ${v.annotatedJudgmentsChecked} annotated plies with Mistake/Blunder/Inaccuracy labels, played move was **not** local best on **${v.annotatedMistakesWherePlayedNotLocalBest}** and **not** hosted best on **${v.annotatedMistakesWherePlayedNotHostedBest}**.`);
  lines.push('');
  lines.push('## Sample mid-game plies');
  lines.push('');
  const samples = [1, 14, 28, 43, 51, 66, r.meta.totalPlies].map((p) => r.perPly.find((x) => x.ply === p)).filter(Boolean);
  lines.push('| Ply | SAN | Played | Local best | Hosted best | Agree | Local ms | Local eval | Hosted eval |');
  lines.push('|-----|-----|--------|------------|-------------|-------|----------|------------|-------------|');
  for (const s of samples) {
    const le = s.localEval ? (s.localEval.type === 'mate' ? `M${s.localEval.value}` : (s.localEval.value / 100).toFixed(2)) : '—';
    const he = s.hostedEval ? (s.hostedEval.type === 'mate' ? `M${s.hostedEval.value}` : (s.hostedEval.value / 100).toFixed(2)) : '—';
    lines.push(
      `| ${s.ply} | ${s.san} | ${s.played} | ${s.localBest || '—'} | ${s.hostedBest || '—'} | ${s.bestmoveAgree} | ${s.localMs} | ${le} | ${he} |`
    );
  }
  lines.push('');
  lines.push('## API surface');
  lines.push('');
  lines.push('| Endpoint | Role |');
  lines.push('|----------|------|');
  lines.push('| `GET /` | Health — Stockfish 18.1 |');
  lines.push('| `POST /bestmove` | Single FEN best move |');
  lines.push('| `POST /multipv` | MultiPV lines |');
  lines.push('| `POST /analyze` | FEN pair (same idea as CLIO `/api/analyze`) |');
  lines.push('| `POST /analyze-game` | **Full PGN** → `{ total_plies, timeline[] }` |');
  lines.push('');
  lines.push('## Recommendations for CLIO');
  lines.push('');
  lines.push('1. Use hosted **`/analyze-game`** when a full PGN is available (one shot, map `timeline[i].analysis` → UI analysis array).');
  lines.push('2. Keep local **`/api/analyze`** for live / incremental moves.');
  lines.push('3. Adapter: `win_probability`→`winProbability`, `previous_fen_bestmove`→`previousFenBestmove`, `analysis[]`→`lines[]`.');
  lines.push('4. Treat `total_plies: 0` as invalid PGN (hosted returns HTTP 200).');
  lines.push('5. For deeper quality, raise hosted `movetime` or `depth` — expect linear time growth.');
  lines.push('');
  lines.push('---');
  lines.push(`Raw JSON: \`scripts/stockfish-pgn-efficiency-report.json\``);
  lines.push('');
  return lines.join('\n');
}
