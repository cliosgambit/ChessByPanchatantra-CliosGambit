/**
 * Rebuild agreement stats using current hosted /analyze-game response shape
 * against previously captured local per-ply results.
 */
const path = require('path');
const fs = require('fs');

const HOSTED = 'https://stockfish-cbp.onrender.com';
const PGN = `1. d3 d5 2. Nf3 c5 3. c3 Nc6 4. Qc2 e5 5. e4 d4 6. Be2 f5 7. Bg5 Be7 8. Bxe7
Qxe7 9. Nbd2 Nf6 10. O-O O-O 11. Nc4 b5 12. Ncd2 Bb7 13. a4 a6 14. Ne1
Rac8 15. f4 fxe4 16. dxe4 exf4 17. Rxf4 Qd6 18. Rh4 c4 19. Qd1 d3 20.
Bh5 Qe7 21. Qf3 Nd5 22. Qh3 Nf4 23. Qg4 Qf6 24. Nef3 Ne5 25. Nxe5 Ne2+
26. Kh1 Qxe5 27. Nf3 Qf6 28. Qd7 Bc6 29. Qg4 Bb7 30. e5 Qe7 31. Qh3 Bxf3 32.
gxf3 Qxe5 33. Bg4 h6 34. Bxc8 Rxc8 35. Qxc8+ Kh7 36. Rg4 Qd5 37. Qc7
Qxf3+ 38. Rg2 1-0`;

const ANNOTATED = {
  12: 'Mistake',
  13: 'Inaccuracy',
  21: 'Mistake',
  22: 'Inaccuracy',
  24: 'Mistake',
  25: 'Inaccuracy',
  26: 'Mistake',
  27: 'Mistake',
  28: 'Blunder',
  29: 'Interesting',
  31: 'Inaccuracy',
  32: 'Mistake',
  33: 'Interesting',
  42: 'Mistake',
  43: 'Mistake',
  44: 'Good',
  45: 'Inaccuracy',
  46: 'Inaccuracy',
  52: 'Good',
  61: 'Inaccuracy',
  62: 'Mistake',
  63: 'Interesting',
  65: 'Inaccuracy',
  66: 'Blunder',
  68: 'Mistake',
};

function normalizeUci(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (s.startsWith('bestmove ')) return s.split(/\s+/)[1] || null;
  return s.split(/\s+/)[0] || null;
}

function scoreFromEval(e) {
  if (!e) return null;
  if (e.mate != null) return { type: 'mate', value: e.mate };
  if (e.cp != null) return { type: 'cp', value: e.cp };
  return null;
}

function scoreNum(s) {
  if (!s) return null;
  if (s.type === 'mate') return s.value > 0 ? 10000 : -10000;
  return s.value;
}

function avg(a) {
  return a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
}

function pct(n, d) {
  return d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a';
}

function fmtScore(s) {
  if (!s) return '—';
  if (s.type === 'mate') return `M${s.value}`;
  return (s.value / 100).toFixed(2);
}

(async () => {
  const reportPath = path.join(__dirname, 'stockfish-pgn-efficiency-report.json');
  const prev = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

  console.log('Re-fetching hosted /analyze-game...');
  const t0 = Date.now();
  const res = await fetch(`${HOSTED}/analyze-game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pgn: PGN, movetime: 200, multipv: 3 }),
    signal: AbortSignal.timeout(600000),
  });
  const hosted = await res.json();
  const hostedMs = Date.now() - t0;
  console.log(`Hosted ${hostedMs}ms — ${hosted.total_plies} plies`);

  const perPly = [];
  let bestAgree = 0;
  let compared = 0;
  let prevAgree = 0;
  let prevCompared = 0;
  const evalGaps = [];

  for (let i = 0; i < prev.perPly.length; i++) {
    const loc = prev.perPly[i];
    const ht = hosted.timeline[i];
    const after = ht?.after_analysis || null;
    const before = ht?.before_analysis || null;

    const hostedPrevBest =
      normalizeUci(ht?.engine_best_move) || normalizeUci(before?.bestmove);
    const hostedAfterBest = normalizeUci(after?.bestmove);
    const hScore =
      scoreFromEval(ht?.evaluation_after) ||
      (after?.analysis?.[0]
        ? scoreFromEval({ cp: after.analysis[0].cp, mate: after.analysis[0].mate })
        : null);

    const bestMatch =
      loc.localBest && hostedAfterBest ? loc.localBest === hostedAfterBest : null;
    const prevMatch =
      loc.localPrevBest && hostedPrevBest ? loc.localPrevBest === hostedPrevBest : null;

    if (bestMatch != null) {
      compared += 1;
      if (bestMatch) bestAgree += 1;
    }
    if (prevMatch != null) {
      prevCompared += 1;
      if (prevMatch) prevAgree += 1;
    }

    const lNum = scoreNum(loc.localEval);
    const hNum = scoreNum(hScore);
    let gap = null;
    if (lNum != null && hNum != null && Math.abs(lNum) < 9000 && Math.abs(hNum) < 9000) {
      gap = Math.abs(lNum - hNum);
      evalGaps.push(gap);
    }

    const annLabel = loc.annotation?.label || ANNOTATED[loc.ply] || null;

    perPly.push({
      ...loc,
      hostedBest: hostedAfterBest,
      hostedPrevBest,
      hostedEval: hScore,
      hostedDepth: ht?.engine_info_after?.depth ?? after?.analysis?.[0]?.depth ?? null,
      hostedWinProb: after?.win_probability ?? null,
      hostedLines: after?.analysis?.length ?? 0,
      hostedIsBestMove: ht?.is_best_move ?? null,
      hostedEvalBefore: scoreFromEval(ht?.evaluation_before),
      hostedNodesAfter: ht?.engine_info_after?.nodes ?? null,
      hostedTimeMsAfter: ht?.engine_info_after?.time_ms ?? null,
      bestmoveAgree: bestMatch,
      prevBestAgree: prevMatch,
      evalGapCp: gap,
      playedWasEngineBest: {
        local: loc.localPrevBest === loc.played,
        hosted: !!(hostedPrevBest && hostedPrevBest === loc.played),
      },
      annotation: annLabel ? { label: annLabel } : null,
    });
  }

  const annotatedFocus = perPly
    .filter((r) => r.annotation)
    .map((r) => ({
      ply: r.ply,
      san: r.san,
      played: r.played,
      judgment: r.annotation.label,
      localPrevBest: r.localPrevBest,
      hostedPrevBest: r.hostedPrevBest,
      enginesAgreeOnBest: r.prevBestAgree,
      playedMatchedLocalBest: r.playedWasEngineBest.local,
      playedMatchedHostedBest: r.playedWasEngineBest.hosted,
      hostedIsBestMove: r.hostedIsBestMove,
      localEvalAfter: r.localEval,
      hostedEvalAfter: r.hostedEval,
      evalGapCp: r.evalGapCp,
    }));

  const mistakes = annotatedFocus.filter((a) =>
    ['Mistake', 'Blunder', 'Inaccuracy'].includes(a.judgment)
  );

  const agreement = {
    pliesCompared: compared,
    bestmoveMatches: bestAgree,
    bestmoveAgreementRate: pct(bestAgree, compared),
    prevBestMatches: prevAgree,
    prevBestAgreementRate: pct(prevAgree, prevCompared),
    avgEvalGapCp: avg(evalGaps),
    medianEvalGapCp: evalGaps.length
      ? [...evalGaps].sort((a, b) => a - b)[Math.floor(evalGaps.length / 2)]
      : null,
    evalGapsOver50cp: evalGaps.filter((g) => g > 50).length,
    evalGapsOver100cp: evalGaps.filter((g) => g > 100).length,
    isBestMoveRateHosted: pct(
      perPly.filter((p) => p.hostedIsBestMove === true).length,
      perPly.length
    ),
    isBestMoveRateLocal: pct(
      perPly.filter((p) => p.playedWasEngineBest.local === true).length,
      perPly.length
    ),
  };

  console.log('\n--- Sample single-ply POST /analyze ---');
  const sampleIdx = [0, 13, 27, 43, 65, 74];
  const singlePly = [];
  for (const i of sampleIdx) {
    const p = perPly[i];
    const ht = hosted.timeline[i];
    const t1 = Date.now();
    const ha = await fetch(`${HOSTED}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        previous_fen: ht.before_fen,
        current_fen: ht.after_fen,
        movetime: 200,
        multipv: 3,
      }),
      signal: AbortSignal.timeout(120000),
    });
    const hj = await ha.json();
    const row = {
      ply: p.ply,
      san: p.san,
      hostedAnalyzeMs: Date.now() - t1,
      localAnalyzeMs: p.localMs,
      hostedBest: normalizeUci(hj.bestmove),
      localBest: p.localBest,
      agree: normalizeUci(hj.bestmove) === p.localBest,
    };
    singlePly.push(row);
    console.log(
      `  ply ${row.ply} ${row.san}: hosted ${row.hostedAnalyzeMs}ms local ${row.localAnalyzeMs}ms agree=${row.agree}`
    );
  }

  const localMs = prev.localFullGame.ms;
  const out = {
    ...prev,
    meta: {
      ...prev.meta,
      date: new Date().toISOString(),
      hostedEngine: 'Stockfish 18.1',
      hostedResponseShape:
        'timeline[] with engine_best_move, is_best_move, before_analysis, after_analysis',
    },
    hostedFullGame: {
      ok: true,
      ms: hostedMs,
      total_plies: hosted.total_plies,
      timelineLen: hosted.timeline.length,
      msPerPly: Math.round(hostedMs / hosted.timeline.length),
      settings: { movetime: 200, multipv: 3 },
      responseKeys: Object.keys(hosted.timeline[0] || {}),
    },
    perPly,
    annotatedFocus,
    agreement,
    singlePlyHostedAnalyzeVsLocal: singlePly,
    efficiency: {
      hosted: {
        mode: 'POST /analyze-game one-shot',
        settings: { movetime: 200, multipv: 3 },
        totalMs: hostedMs,
        msPerPly: Math.round(hostedMs / hosted.timeline.length),
        networkRoundTrips: 1,
      },
      local: prev.efficiency.local,
      speedup: {
        hostedVsLocalTotal: `${(localMs / hostedMs).toFixed(2)}x (local/hosted; >1 means hosted faster)`,
        localVsHostedTotal: `${(hostedMs / localMs).toFixed(2)}x (hosted/local; >1 means local faster)`,
        winner:
          hostedMs < localMs
            ? 'hosted faster for full-game batch'
            : 'local faster for full-game batch',
      },
      singlePlyAvg: {
        hostedAnalyzeMs: avg(singlePly.map((s) => s.hostedAnalyzeMs)),
        localAnalyzeMs: avg(singlePly.map((s) => s.localAnalyzeMs).filter((m) => m > 0)),
      },
    },
    verdict: {
      hostedOnline: true,
      hostedAnalyzeGameOk: true,
      localFullGameOk: true,
      bestmoveAgreement: agreement.bestmoveAgreementRate,
      prevBestAgreement: agreement.prevBestAgreementRate,
      avgEvalGapCp: agreement.avgEvalGapCp,
      fullGameHostedMs: hostedMs,
      fullGameLocalMs: localMs,
      efficiencyWinner:
        hostedMs < localMs
          ? 'hosted faster for full-game batch'
          : 'local faster for full-game batch',
      annotatedJudgmentsChecked: annotatedFocus.length,
      annotatedMistakesWherePlayedNotLocalBest: mistakes.filter(
        (m) => m.playedMatchedLocalBest === false
      ).length,
      annotatedMistakesWherePlayedNotHostedBest: mistakes.filter(
        (m) => m.playedMatchedHostedBest === false
      ).length,
      hostedIsBestMoveTrueCount: perPly.filter((p) => p.hostedIsBestMove === true).length,
      notes: [
        'Hosted /analyze-game returns rich timeline (best move, is_best_move, before/after evals).',
        'Local wall-clock was faster on this machine for the full 75-ply batch.',
        'Hosted wins on convenience: 1 HTTP call vs 75 local analyzePosition calls.',
        'Disagreements at movetime≈200 are normal; both engines are shallow.',
      ],
    },
    hostedSampleTimelineEntry: hosted.timeline[13],
  };

  fs.writeFileSync(reportPath, JSON.stringify(out, null, 2));

  const md = buildMarkdown(out, fmtScore);
  const mdPath = path.join(__dirname, '..', 'stockfish-pgn-efficiency-report.md');
  fs.writeFileSync(mdPath, md);

  console.log(`\nWrote ${reportPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log('\nAGREEMENT', JSON.stringify(agreement, null, 2));
  console.log('\nVERDICT', JSON.stringify(out.verdict, null, 2));
  console.log('\nEFFICIENCY', JSON.stringify(out.efficiency, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

function buildMarkdown(r, fmtScore) {
  const e = r.efficiency;
  const a = r.agreement;
  const v = r.verdict;
  const lines = [];
  lines.push('# Stockfish PGN Efficiency Report — Local vs Hosted');
  lines.push('');
  lines.push(`**Date:** ${r.meta.date}`);
  lines.push(
    `**Hosted API:** [${r.meta.hosted}](${r.meta.hosted}) · [docs](${r.meta.docs}) · Stockfish **18.1**`
  );
  lines.push(`**Local engine:** \`${r.meta.localEngine}\``);
  lines.push(`**Game:** ${r.meta.totalPlies} plies · Result ${r.meta.result}`);
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  lines.push(`| Question | Answer |`);
  lines.push(`|----------|--------|`);
  lines.push(`| Hosted online? | Yes (Stockfish 18.1) |`);
  lines.push(`| \`/analyze-game\` works with this PGN? | **Yes** — ${v.fullGameHostedMs} ms |`);
  lines.push(`| Local full-game analysis | **Yes** — ${v.fullGameLocalMs} ms |`);
  lines.push(`| Faster for full-game batch | **${v.efficiencyWinner}** |`);
  lines.push(`| After-position bestmove agreement | **${v.bestmoveAgreement}** |`);
  lines.push(`| Before-move (played) bestmove agreement | **${v.prevBestAgreement}** |`);
  lines.push(`| Avg eval gap (cp) | **${v.avgEvalGapCp}** |`);
  lines.push('');
  lines.push('## Test PGN');
  lines.push('');
  lines.push(
    'Real annotated game (NAGs stripped for engine input; source judgments used in focus table):'
  );
  lines.push('');
  lines.push('```');
  lines.push(PGN.replace(/\s+/g, ' ').trim());
  lines.push('```');
  lines.push('');
  lines.push('## Efficiency');
  lines.push('');
  lines.push('| Metric | Hosted `/analyze-game` | Local `analyzePosition` loop |');
  lines.push('|--------|------------------------|------------------------------|');
  lines.push(`| Mode | ${e.hosted.mode} | ${e.local.mode} |`);
  lines.push(
    `| Settings | movetime=200, multipv=3 | multipv=3, short internal movetimes |`
  );
  lines.push(`| **Total wall time** | **${e.hosted.totalMs} ms** | **${e.local.totalMs} ms** |`);
  lines.push(
    `| ms / ply | ${e.hosted.msPerPly} | ${e.local.msPerPly} (avg call ${e.local.avgPlyMs}) |`
  );
  lines.push(
    `| HTTP round-trips | **1** | 0 direct / **75** if via \`/api/analyze\` |`
  );
  lines.push(`| Min / max ply latency | n/a (batched) | ${e.local.minPlyMs} / ${e.local.maxPlyMs} ms |`);
  lines.push('');
  if (e.singlePlyAvg) {
    lines.push(
      `**Single-ply \`POST /analyze\` (hosted) vs local:** avg hosted **${e.singlePlyAvg.hostedAnalyzeMs} ms**, avg local **${e.singlePlyAvg.localAnalyzeMs} ms** (sample of 6 plies).`
    );
    lines.push('');
  }
  lines.push(`**Ratio:** hosted took **${e.speedup.localVsHostedTotal}** of local time.`);
  lines.push('');
  lines.push('### Interpretation');
  lines.push('');
  lines.push(
    '- On this Windows machine, **local was ~1.6× faster** for analyzing all 75 plies.'
  );
  lines.push(
    '- Hosted still wins for **product integration**: one call returns a full annotated timeline (`is_best_move`, before/after evals, MultiPV).'
  );
  lines.push(
    '- If the UI calls local over HTTP once per ply from the browser, network overhead can erase the local CPU advantage.'
  );
  lines.push('');
  lines.push('## Quality / agreement');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Plies compared | ${a.pliesCompared} |`);
  lines.push(`| After-position bestmove matches | ${a.bestmoveMatches} (${a.bestmoveAgreementRate}) |`);
  lines.push(
    `| Before-position bestmove matches | ${a.prevBestMatches} (${a.prevBestAgreementRate}) |`
  );
  lines.push(`| Avg \\|eval\\| gap | ${a.avgEvalGapCp} cp |`);
  lines.push(`| Median eval gap | ${a.medianEvalGapCp} cp |`);
  lines.push(`| Gaps > 50 cp | ${a.evalGapsOver50cp} |`);
  lines.push(`| Gaps > 100 cp | ${a.evalGapsOver100cp} |`);
  lines.push(`| Played was engine best (hosted \`is_best_move\`) | ${a.isBestMoveRateHosted} |`);
  lines.push(`| Played was engine best (local) | ${a.isBestMoveRateLocal} |`);
  lines.push('');
  lines.push('## Annotated moves (source NAGs vs engines)');
  lines.push('');
  lines.push(
    '| Ply | Move | Judgment | Local best | Hosted best | Engines agree | Played=local? | Played=hosted? | Hosted is_best | Gap cp |'
  );
  lines.push(
    '|-----|------|----------|------------|-------------|---------------|---------------|----------------|----------------|--------|'
  );
  for (const row of r.annotatedFocus) {
    lines.push(
      `| ${row.ply} | ${row.san} | ${row.judgment} | ${row.localPrevBest || '—'} | ${row.hostedPrevBest || '—'} | ${row.enginesAgreeOnBest} | ${row.playedMatchedLocalBest} | ${row.playedMatchedHostedBest} | ${row.hostedIsBestMove} | ${row.evalGapCp ?? '—'} |`
    );
  }
  lines.push('');
  lines.push(
    `Among Mistake/Blunder/Inaccuracy labels: played ≠ local best on **${v.annotatedMistakesWherePlayedNotLocalBest}/${mistakesCount(r)}**, played ≠ hosted best on **${v.annotatedMistakesWherePlayedNotHostedBest}/${mistakesCount(r)}**.`
  );
  lines.push('');
  lines.push('## Sample plies (detail)');
  lines.push('');
  const samples = [1, 14, 28, 44, 52, 66, r.meta.totalPlies]
    .map((p) => r.perPly.find((x) => x.ply === p))
    .filter(Boolean);
  lines.push(
    '| Ply | SAN | Played | Local best (after) | Hosted best (after) | Agree | Local ms | Local eval | Hosted eval | Gap |'
  );
  lines.push(
    '|-----|-----|--------|--------------------|---------------------|-------|----------|------------|-------------|-----|'
  );
  for (const s of samples) {
    lines.push(
      `| ${s.ply} | ${s.san} | ${s.played} | ${s.localBest || '—'} | ${s.hostedBest || '—'} | ${s.bestmoveAgree} | ${s.localMs} | ${fmtScore(s.localEval)} | ${fmtScore(s.hostedEval)} | ${s.evalGapCp ?? '—'} |`
    );
  }
  lines.push('');
  if (r.singlePlyHostedAnalyzeVsLocal?.length) {
    lines.push('## Single-ply latency sample (`POST /analyze`)');
    lines.push('');
    lines.push('| Ply | SAN | Hosted ms | Local ms | Best agree |');
    lines.push('|-----|-----|-----------|----------|------------|');
    for (const s of r.singlePlyHostedAnalyzeVsLocal) {
      lines.push(
        `| ${s.ply} | ${s.san} | ${s.hostedAnalyzeMs} | ${s.localAnalyzeMs} | ${s.agree} |`
      );
    }
    lines.push('');
  }
  lines.push('## Hosted API surface');
  lines.push('');
  lines.push('| Endpoint | Role |');
  lines.push('|----------|------|');
  lines.push('| [`GET /`](https://stockfish-cbp.onrender.com/) | Health — Stockfish 18.1 |');
  lines.push('| `POST /bestmove` | Single FEN best move |');
  lines.push('| `POST /multipv` | MultiPV lines |');
  lines.push('| `POST /analyze` | FEN pair (similar to CLIO `/api/analyze`) |');
  lines.push(
    '| `POST /analyze-game` | **Full PGN** → `{ total_plies, timeline[] }` with before/after analysis |'
  );
  lines.push('');
  lines.push('### Hosted timeline entry fields (observed)');
  lines.push('');
  lines.push('```');
  lines.push((r.hostedFullGame.responseKeys || []).join(', '));
  lines.push('```');
  lines.push('');
  lines.push('## Recommendations for CLIO');
  lines.push('');
  lines.push(
    '1. Prefer hosted **`/analyze-game`** when a full PGN is available — one shot, includes `is_best_move` + before/after evals.'
  );
  lines.push(
    '2. Keep local **`analyzePosition` / `/api/analyze`** for live incremental moves (lower latency per ply on this machine).'
  );
  lines.push(
    '3. Adapter: map `engine_best_move` / `before_analysis` / `after_analysis` into CLIO analysis array shape.'
  );
  lines.push('4. Treat `total_plies: 0` as invalid/empty PGN (hosted may still return HTTP 200).');
  lines.push(
    '5. For higher quality, increase hosted `movetime` or use `depth` — expect roughly linear time growth.'
  );
  lines.push('');
  lines.push('---');
  lines.push('Raw data: `scripts/stockfish-pgn-efficiency-report.json`');
  lines.push('');
  return lines.join('\n');
}

function mistakesCount(r) {
  return r.annotatedFocus.filter((a) =>
    ['Mistake', 'Blunder', 'Inaccuracy'].includes(a.judgment)
  ).length;
}
