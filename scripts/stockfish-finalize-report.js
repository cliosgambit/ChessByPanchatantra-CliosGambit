const fs = require('fs');
const path = require('path');

const reportPath = path.join(__dirname, 'stockfish-pgn-efficiency-report.json');
const r = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

const HOSTED_COLD_MS = 94577;
const HOSTED_WARM_MS = r.hostedFullGame.ms;
const LOCAL_MS = r.localFullGame.ms;

r.hostedFullGame.coldMs = HOSTED_COLD_MS;
r.hostedFullGame.warmCachedMs = HOSTED_WARM_MS;
r.hostedFullGame.ms = HOSTED_COLD_MS;
r.hostedFullGame.msPerPly = Math.round(HOSTED_COLD_MS / 75);
r.hostedFullGame.note =
  'Cold first call ~94.6s; immediate re-call returned cached result in ~1.3s';

r.efficiency.hosted.totalMs = HOSTED_COLD_MS;
r.efficiency.hosted.msPerPly = Math.round(HOSTED_COLD_MS / 75);
r.efficiency.hosted.warmCachedMs = HOSTED_WARM_MS;
r.efficiency.hosted.coldMs = HOSTED_COLD_MS;
r.efficiency.speedup = {
  cold: {
    hostedVsLocalTotal: `${(LOCAL_MS / HOSTED_COLD_MS).toFixed(2)}x (local/hosted)`,
    localVsHostedTotal: `${(HOSTED_COLD_MS / LOCAL_MS).toFixed(2)}x (hosted/local)`,
    winner: HOSTED_COLD_MS < LOCAL_MS ? 'hosted faster (cold)' : 'local faster (cold)',
  },
  warmCached: {
    hostedVsLocalTotal: `${(LOCAL_MS / HOSTED_WARM_MS).toFixed(2)}x (local/hosted)`,
    winner: 'hosted much faster when cached',
  },
  winner: HOSTED_COLD_MS < LOCAL_MS ? 'hosted faster (cold)' : 'local faster (cold)',
};

const a = r.agreement;
r.verdict.fullGameHostedMs = HOSTED_COLD_MS;
r.verdict.fullGameHostedWarmCachedMs = HOSTED_WARM_MS;
r.verdict.fullGameLocalMs = LOCAL_MS;
r.verdict.efficiencyWinner = r.efficiency.speedup.winner;
r.verdict.notes = [
  'Hosted /analyze-game COLD: ~94.6s for 75 plies at movetime=200 multipv=3.',
  'Hosted /analyze-game WARM/CACHED: ~1.3s for same PGN on immediate re-request.',
  'Local full-game loop: ~57.9s on this machine (persistent UCI, no network).',
  'Cold batch: LOCAL faster (~1.6x). Cached batch: HOSTED much faster.',
  `Bestmove agreement after-position: ${a.bestmoveAgreementRate} at shallow search.`,
  `Avg eval gap: ${a.avgEvalGapCp} cp (median ${a.medianEvalGapCp}).`,
];

fs.writeFileSync(reportPath, JSON.stringify(r, null, 2));

const PGN =
  '1. d3 d5 2. Nf3 c5 3. c3 Nc6 4. Qc2 e5 5. e4 d4 6. Be2 f5 7. Bg5 Be7 8. Bxe7 Qxe7 9. Nbd2 Nf6 10. O-O O-O 11. Nc4 b5 12. Ncd2 Bb7 13. a4 a6 14. Ne1 Rac8 15. f4 fxe4 16. dxe4 exf4 17. Rxf4 Qd6 18. Rh4 c4 19. Qd1 d3 20. Bh5 Qe7 21. Qf3 Nd5 22. Qh3 Nf4 23. Qg4 Qf6 24. Nef3 Ne5 25. Nxe5 Ne2+ 26. Kh1 Qxe5 27. Nf3 Qf6 28. Qd7 Bc6 29. Qg4 Bb7 30. e5 Qe7 31. Qh3 Bxf3 32. gxf3 Qxe5 33. Bg4 h6 34. Bxc8 Rxc8 35. Qxc8+ Kh7 36. Rg4 Qd5 37. Qc7 Qxf3+ 38. Rg2 1-0';

function fmt(s) {
  if (!s) return '—';
  if (s.type === 'mate') return `M${s.value}`;
  return (s.value / 100).toFixed(2);
}

const e = r.efficiency;
const v = r.verdict;
const samples = [1, 14, 28, 44, 52, 66, 75]
  .map((p) => r.perPly.find((x) => x.ply === p))
  .filter(Boolean);

const md = [];
md.push('# Stockfish PGN Efficiency Report — Local vs Hosted');
md.push('');
md.push(`**Date:** ${r.meta.date}`);
md.push(
  '**Hosted:** [stockfish-cbp.onrender.com](https://stockfish-cbp.onrender.com/) · [docs](https://stockfish-cbp.onrender.com/docs) · Stockfish **18.1**'
);
md.push(
  '**Local:** `stockfish-windows-x86-64-avx2.exe` via CLIO `stockfishService.analyzePosition`'
);
md.push('**Game:** 75 plies · Result 1-0');
md.push('');
md.push('## Verdict');
md.push('');
md.push('| Question | Answer |');
md.push('|----------|--------|');
md.push('| Hosted online? | Yes — Stockfish 18.1 |');
md.push('| `POST /analyze-game` accepts this PGN? | **Yes** |');
md.push(`| Hosted full-game (cold) | **${HOSTED_COLD_MS} ms** (~94.6 s) |`);
md.push(`| Hosted full-game (warm/cached) | **${HOSTED_WARM_MS} ms** |`);
md.push(`| Local full-game loop | **${LOCAL_MS} ms** (~57.9 s) |`);
md.push('| Faster on cold batch | **Local (~1.63×)** |');
md.push('| Faster when hosted cache hits | **Hosted (~44×)** |');
md.push(
  `| After-position bestmove agreement | **${a.bestmoveAgreementRate}** (${a.bestmoveMatches}/${a.pliesCompared}) |`
);
md.push(`| Before-move bestmove agreement | **${a.prevBestAgreementRate}** |`);
md.push(`| Avg / median eval gap | **${a.avgEvalGapCp} / ${a.medianEvalGapCp} cp** |`);
md.push('');
md.push('## Test PGN');
md.push('');
md.push('```');
md.push(PGN);
md.push('```');
md.push('');
md.push('## Efficiency comparison');
md.push('');
md.push('| Metric | Hosted `/analyze-game` | Local `analyzePosition` ×75 |');
md.push('|--------|------------------------|------------------------------|');
md.push('| Mode | One HTTP call, full timeline | Persistent UCI, ply-by-ply |');
md.push('| Settings | movetime=200, multipv=3 | multipv=3, short internal movetimes |');
md.push(`| **Cold total** | **${HOSTED_COLD_MS} ms** | **${LOCAL_MS} ms** |`);
md.push(`| Warm/cached total | **${HOSTED_WARM_MS} ms** | n/a (in-process only) |`);
md.push(`| ms/ply (cold) | ${Math.round(HOSTED_COLD_MS / 75)} | ${e.local.msPerPly} |`);
md.push('| HTTP round-trips | **1** | 0 direct · **75** via `/api/analyze` |');
md.push(`| Min/max ply call | n/a | ${e.local.minPlyMs} / ${e.local.maxPlyMs} ms |`);
md.push('');
md.push(
  `**Single-ply \`POST /analyze\` sample (6 plies):** avg hosted **${e.singlePlyAvg.hostedAnalyzeMs} ms**, avg local **${e.singlePlyAvg.localAnalyzeMs} ms**.`
);
md.push('');
md.push('### Efficiency takeaways');
md.push('');
md.push(
  '1. **Cold full-game:** local CPU wins (~58s vs ~95s hosted). Hosted pays network + remote sequential search.'
);
md.push(
  '2. **Cached full-game:** hosted returns the same PGN in ~1.3s — excellent for re-analysis / retry UX.'
);
md.push(
  '3. **Per-ply interactive:** hosted `/analyze` ~280ms vs local ~740ms on samples (hosted often faster per call at movetime=200).'
);
md.push(
  '4. **Product shape:** hosted returns `is_best_move`, before/after evals, MultiPV in one payload.'
);
md.push('');
md.push('## Quality / agreement');
md.push('');
md.push('| Metric | Value |');
md.push('|--------|-------|');
md.push(
  `| After-position bestmove matches | ${a.bestmoveMatches} / ${a.pliesCompared} (**${a.bestmoveAgreementRate}**) |`
);
md.push(
  `| Before-position bestmove matches | ${a.prevBestMatches} (**${a.prevBestAgreementRate}**) |`
);
md.push(`| Avg eval gap | ${a.avgEvalGapCp} cp |`);
md.push(`| Median eval gap | ${a.medianEvalGapCp} cp |`);
md.push(`| Gaps > 50 cp | ${a.evalGapsOver50cp} |`);
md.push(`| Gaps > 100 cp | ${a.evalGapsOver100cp} |`);
md.push(`| Played = engine best (hosted) | ${a.isBestMoveRateHosted} |`);
md.push(`| Played = engine best (local) | ${a.isBestMoveRateLocal} |`);
md.push('');
md.push(
  'Shallow search (≈200ms/ply) explains ~65% bestmove agreement — both engines are noisy at this depth.'
);
md.push('');
md.push('## Annotated moves (source NAGs)');
md.push('');
md.push(
  '| Ply | Move | Judgment | Local best | Hosted best | Agree | =local? | =hosted? | Hosted is_best | Gap |'
);
md.push(
  '|-----|------|----------|------------|-------------|-------|---------|-----------|----------------|-----|'
);
for (const row of r.annotatedFocus) {
  md.push(
    `| ${row.ply} | ${row.san} | ${row.judgment} | ${row.localPrevBest || '—'} | ${row.hostedPrevBest || '—'} | ${row.enginesAgreeOnBest} | ${row.playedMatchedLocalBest} | ${row.playedMatchedHostedBest} | ${row.hostedIsBestMove} | ${row.evalGapCp ?? '—'} |`
  );
}
md.push('');
md.push(
  'Both engines flagged **20/20** Mistake/Blunder/Inaccuracy plies as *not* their best move — good alignment with the human annotations at this depth.'
);
md.push('');
md.push('### Notable moments');
md.push('');
md.push(
  '- **Ply 28 Rac8 ($4 Blunder):** both engines preferred other moves; hosted `is_best_move=false`.'
);
md.push('- **Ply 44 Nf4 ($1 Good):** tactical resource — see sample table.');
md.push('- **Ply 66 h6 ($4 Blunder):** both engines disagree with the played move.');
md.push('');
md.push('## Sample plies');
md.push('');
md.push(
  '| Ply | SAN | Played | Local best | Hosted best | Agree | Local ms | Local eval | Hosted eval | Gap |'
);
md.push(
  '|-----|-----|--------|------------|-------------|-------|----------|------------|-------------|-----|'
);
for (const s of samples) {
  md.push(
    `| ${s.ply} | ${s.san} | ${s.played} | ${s.localBest || '—'} | ${s.hostedBest || '—'} | ${s.bestmoveAgree} | ${s.localMs} | ${fmt(s.localEval)} | ${fmt(s.hostedEval)} | ${s.evalGapCp ?? '—'} |`
  );
}
md.push('');

if (r.singlePlyHostedAnalyzeVsLocal) {
  md.push('## Single-ply latency (`POST /analyze`)');
  md.push('');
  md.push('| Ply | SAN | Hosted ms | Local ms | Agree |');
  md.push('|-----|-----|-----------|----------|-------|');
  for (const s of r.singlePlyHostedAnalyzeVsLocal) {
    md.push(
      `| ${s.ply} | ${s.san} | ${s.hostedAnalyzeMs} | ${s.localAnalyzeMs} | ${s.agree} |`
    );
  }
  md.push('');
}

md.push('## Hosted API');
md.push('');
md.push('| Endpoint | Role |');
md.push('|----------|------|');
md.push('| GET / | Health |');
md.push('| POST /bestmove | Single FEN |');
md.push('| POST /multipv | MultiPV |');
md.push('| POST /analyze | FEN pair (CLIO-like) |');
md.push('| POST /analyze-game | Full PGN → timeline |');
md.push('');
md.push(
  `Timeline fields observed: \`${(r.hostedFullGame.responseKeys || []).join(', ')}\``
);
md.push('');
md.push('## Recommendations for CLIO');
md.push('');
md.push(
  '1. Use hosted `/analyze-game` for full-PGN review (one shot + `is_best_move` + before/after).'
);
md.push('2. Keep local for live/incremental moves when the binary is available.');
md.push('3. Map hosted timeline → CLIO analysis[]; treat `total_plies:0` as bad PGN.');
md.push(
  '4. Expect cold starts ~1–2 min for ~75 plies at movetime=200; cache makes repeats cheap.'
);
md.push('5. Raise movetime/depth for classification quality; time scales roughly linearly.');
md.push('');
md.push('---');
md.push('Raw JSON: `scripts/stockfish-pgn-efficiency-report.json`');
md.push('');

fs.writeFileSync(path.join(__dirname, '..', 'stockfish-pgn-efficiency-report.md'), md.join('\n'));
console.log(
  JSON.stringify(
    {
      cold: HOSTED_COLD_MS,
      warm: HOSTED_WARM_MS,
      local: LOCAL_MS,
      agree: a.bestmoveAgreementRate,
      avgGap: a.avgEvalGapCp,
    },
    null,
    2
  )
);
