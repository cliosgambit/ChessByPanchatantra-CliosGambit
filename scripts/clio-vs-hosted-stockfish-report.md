# CLIO vs Hosted Stockfish — comparison report

**CLIO local:** `stockfish-windows-x86-64-avx2.exe` via `stockfishService.analyzePosition` / `POST /api/analyze`  
**Hosted:** [stockfish-cbp.onrender.com](https://stockfish-cbp.onrender.com) · [docs](https://stockfish-cbp.onrender.com/docs) · Stockfish **18.1**  
**Primary benchmark:** 75-ply annotated game · `movetime=200` · `multipv=3` (2026-07-17)  
**Hosted ops probe:** 2026-07-18 live API test (single-engine pool)

---

## Verdict

| Question | Answer |
|----------|--------|
| Both engines usable? | **Yes** |
| Faster cold full-game (75 plies)? | **CLIO local ~1.6×** (57.9s vs 94.6s) |
| Faster warm/cached full-game? | **Hosted ~44×** (1.3s vs ~58s local re-run) |
| Faster single-ply interactive? | **Hosted** (~280ms vs ~740ms local avg) |
| Bestmove agreement (after-position)? | **65.3%** (49/75) — expected at shallow search |
| Avg / median eval gap | **26 / 17 cp** |
| Best product fit for full PGN review? | **Hosted `/analyze-game`** (one shot + timeline) |
| Best fit for live/incremental moves? | **CLIO local** (no network, no pool queue) |

**Bottom line:** Keep local for interactive analysis when the binary is present. Use hosted `/analyze-game` for full-game review and retries (cache is excellent). Do not fan out parallel hosted calls — the pool has **one** engine and queues can exceed 2 minutes.

---

## Architecture

| Dimension | CLIO local | Hosted (Render) |
|-----------|------------|-----------------|
| Engine binary | Windows AVX2 UCI on the CLIO server | Stockfish 18.1 in remote pool |
| Integration | Persistent Node UCI process | HTTP FastAPI |
| Main CLIO entry | `POST /api/analyze` → `analyzePosition` | Fallback via `HOSTED_STOCKFISH_API` in `stockfishRoutes.js` |
| Full-game mode | Loop ply-by-ply (75× analyze) | `POST /analyze-game` one shot |
| Threads / hash | Local machine defaults | **1 thread · 128 MB · 1 engine** |
| Cache | In-memory Map (max ~100) | Server-side FEN/PGN cache |
| Network | None | Yes — cold start + queue risk |
| Auth | None on stockfish routes | None |

### How CLIO uses hosted today

```
Local binary first
  └─ on failure → hosted POST /bestmove
       └─ on failure → stockfish.online
```

Interactive board analysis stays on local `POST /api/analyze`. Hosted is primarily a **best-move fallback**, not the default full-game path yet.

---

## Efficiency (75-ply game)

Settings: hosted `movetime=200`, `multipv=3` · local multipv=3 with short internal movetimes.

| Metric | Hosted `/analyze-game` | CLIO local `analyzePosition` ×75 |
|--------|------------------------|----------------------------------|
| Mode | 1 HTTP call → full timeline | Persistent UCI, ply-by-ply |
| **Cold total** | **94,577 ms (~94.6 s)** | **57,902 ms (~57.9 s)** |
| Warm / cached | **1,327 ms** | n/a (in-process only) |
| ms/ply (cold) | ~1,261 | ~772 |
| HTTP round-trips | **1** | 0 direct · 75 if via `/api/analyze` |
| Min / max ply | n/a | 0 / 835 ms |

### Single-ply `POST /analyze` sample (6 plies)

| Side | Avg latency |
|------|-------------|
| Hosted | **281 ms** |
| CLIO local | **737 ms** |

| Ply | SAN | Hosted ms | Local ms | Bestmove agree |
|-----|-----|-----------|----------|----------------|
| 1 | d3 | 313 | 0* | false |
| 14 | Be7 | 267 | 826 | true |
| 28 | Rac8 | 278 | 776 | true |
| 44 | Nf4 | 289 | 789 | true |
| 66 | h6 | 263 | 787 | true |
| 75 | Rg2 | 277 | 507 | true |

\*Ply 1 local ~0 ms reflects warm/cache edge case in that run.

### Efficiency takeaways

1. **Cold full-game:** local wins — no network, persistent UCI, stronger local CPU.
2. **Cached full-game:** hosted wins hard (~1.3s) — ideal for re-analysis / retry UX.
3. **Per-ply interactive:** hosted `/analyze` often faster at movetime=200 (network + remote cache).
4. **Payload richness:** hosted returns `is_best_move`, before/after evals, MultiPV, accuracy, phases in one response.

---

## Quality / agreement

Same 75 positions, shallow search (~200 ms/ply):

| Metric | Value |
|--------|-------|
| After-position bestmove matches | 49 / 75 (**65.3%**) |
| Before-position bestmove matches | 47 / 75 (**62.7%**) |
| Avg eval gap | 26 cp |
| Median eval gap | 17 cp |
| Gaps > 50 cp | 14 |
| Gaps > 100 cp | 1 |
| Played = engine best (hosted) | 30.7% |
| Played = engine best (local) | 32.0% |

Shallow MultiPV explains imperfect bestmove agreement — both sides are noisy at this depth, not a correctness failure.

### Annotated judgments (source NAGs)

Of Mistake / Blunder / Inaccuracy plies checked: **both engines marked the played move as not-best on 20/20** — good alignment with human annotations.

Notable:

| Ply | Move | Judgment | Local prev-best | Hosted prev-best | Engines agree | Hosted `is_best_move` |
|-----|------|----------|-----------------|------------------|---------------|------------------------|
| 28 | Rac8 | Blunder | f5e4 | f5e4 | yes | false |
| 44 | Nf4 | Good | d5f4 | d5f4 | yes | true |
| 66 | h6 | Blunder | e2f4 | e2f4 | yes | false |
| 12 | f5 | Mistake | f8e7 | h7h6 | no | false |
| 21 | Nc4 | Mistake | c3d4 | c3d4 | yes | false |

### Sample plies (after-position best)

| Ply | SAN | Played | Local best | Hosted best | Agree | Local eval | Hosted eval | Gap cp |
|-----|-----|--------|------------|-------------|-------|------------|-------------|--------|
| 1 | d3 | d2d3 | d7d5 | b8c6 | false | 0.06 | 0.13 | 7 |
| 14 | Be7 | f8e7 | g5e7 | g5e7 | true | -0.19 | -0.49 | 30 |
| 28 | Rac8 | a8c8 | a4b5 | a4b5 | true | 0.54 | 0.57 | 3 |
| 44 | Nf4 | d5f4 | h4f4 | h4f4 | true | -3.23 | -3.26 | 3 |
| 52 | Qxe5 | f6e5 | a4b5 | a4b5 | true | -2.13 | -1.66 | 47 |
| 66 | h6 | h7h6 | g4c8 | g4c8 | true | 2.63 | 2.12 | 51 |
| 75 | Rg2 | g4g2 | f3f6 | f3f6 | true | -3.97 | -4.10 | 13 |

---

## Feature / API surface

| Capability | CLIO local | Hosted |
|------------|------------|--------|
| Single FEN bestmove | Yes (`getBestMove`) | `POST /bestmove` |
| MultiPV lines | Yes | `POST /multipv` |
| FEN-pair analyze (current/previous) | Yes (`POST /api/analyze`) | `POST /analyze` |
| Full PGN → timeline | Manual loop | **`POST /analyze-game`** |
| `is_best_move` per ply | Derive locally | Built-in |
| Accuracy / phases / critical positions | Not in one payload | Built-in on `/analyze-game` |
| Health / stats | Process alive only | `GET /health`, `GET /stats` |
| Validation errors | App-level 400s | 422 missing fields · 400 invalid FEN |

Hosted timeline fields: `ply`, `played_move`, `engine_best_move`, `is_best_move`, `evaluation_before/after`, `before_analysis`, `after_analysis`, plus game-level `accuracy`, `game_phases`, `critical_positions`.

---

## Reliability (hosted ops — 2026-07-18)

| Finding | Detail |
|---------|--------|
| Pool size | **1 engine** · 1 thread · 128 MB |
| When busy | New analysis can wait **minutes** or time out with **0 bytes** |
| Observed queue wait | ~134 s before a short `/analyze-game` completed |
| Peak acquire wait (session) | ~553 s average (skewed by stuck lock) |
| Warm path | Once free + cached: `/bestmove`, `/analyze`, `/analyze-game` ~0.4 s |

CLIO local has no remote queue, but needs the Windows binary on the host and is process-bound to that machine.

---

## Recommendations for CLIO

1. **Full-PGN review** → hosted `POST /analyze-game` (`movetime` + `multipv`); map `timeline[]` into CLIO analysis shape; treat `total_plies: 0` as bad PGN.
2. **Live / incremental board** → keep local `analyzePosition` when the binary is available.
3. **Hosted fallback** → keep for bestmove when local fails; set HTTP timeouts **≥ 3 minutes** and **serialize** calls (never parallel storm the 1-engine pool).
4. **Cache-aware UX** → show progress on cold `/analyze-game`; retries of the same PGN will be cheap (~1s).
5. **Quality** → raise `movetime`/depth for brilliance classification; expect time to scale roughly linearly; shallow 200ms search will keep ~65% bestmove agreement between engines.

---

## Sources

| File | Contents |
|------|----------|
| `scripts/stockfish-pgn-efficiency-report.json` | 75-ply efficiency + agreement raw data |
| `scripts/stockfish-comparison-report.json` | Immortal Game spot checks (bestmove/multipv/analyze) |
| `scripts/stockfish-api-live-test-report.md` | Hosted endpoint live probe (2026-07-18) |
| `backend/api/services/stockfishService.js` | CLIO local UCI wrapper |
| `backend/api/routes/stockfishRoutes.js` | Local + hosted + online fallback cascade |

### Test PGN (75 plies)

```
1. d3 d5 2. Nf3 c5 3. c3 Nc6 4. Qc2 e5 5. e4 d4 6. Be2 f5 7. Bg5 Be7 8. Bxe7 Qxe7
9. Nbd2 Nf6 10. O-O O-O 11. Nc4 b5 12. Ncd2 Bb7 13. a4 a6 14. Ne1 Rac8 15. f4 fxe4
16. dxe4 exf4 17. Rxf4 Qd6 18. Rh4 c4 19. Qd1 d3 20. Bh5 Qe7 21. Qf3 Nd5 22. Qh3 Nf4
23. Qg4 Qf6 24. Nef3 Ne5 25. Nxe5 Ne2+ 26. Kh1 Qxe5 27. Nf3 Qf6 28. Qd7 Bc6 29. Qg4 Bb7
30. e5 Qe7 31. Qh3 Bxf3 32. gxf3 Qxe5 33. Bg4 h6 34. Bxc8 Rxc8 35. Qxc8+ Kh7 36. Rg4 Qd5
37. Qc7 Qxf3+ 38. Rg2 1-0
```
