# Stockfish PGN Efficiency Report — Local vs Hosted

**Date:** 2026-07-17T05:41:14.638Z
**Hosted:** [stockfish-cbp.onrender.com](https://stockfish-cbp.onrender.com/) · [docs](https://stockfish-cbp.onrender.com/docs) · Stockfish **18.1**
**Local:** `stockfish-windows-x86-64-avx2.exe` via CLIO `stockfishService.analyzePosition`
**Game:** 75 plies · Result 1-0

## Verdict

| Question | Answer |
|----------|--------|
| Hosted online? | Yes — Stockfish 18.1 |
| `POST /analyze-game` accepts this PGN? | **Yes** |
| Hosted full-game (cold) | **94577 ms** (~94.6 s) |
| Hosted full-game (warm/cached) | **1327 ms** |
| Local full-game loop | **57902 ms** (~57.9 s) |
| Faster on cold batch | **Local (~1.63×)** |
| Faster when hosted cache hits | **Hosted (~44×)** |
| After-position bestmove agreement | **65.3%** (49/75) |
| Before-move bestmove agreement | **62.7%** |
| Avg / median eval gap | **26 / 17 cp** |

## Test PGN

```
1. d3 d5 2. Nf3 c5 3. c3 Nc6 4. Qc2 e5 5. e4 d4 6. Be2 f5 7. Bg5 Be7 8. Bxe7 Qxe7 9. Nbd2 Nf6 10. O-O O-O 11. Nc4 b5 12. Ncd2 Bb7 13. a4 a6 14. Ne1 Rac8 15. f4 fxe4 16. dxe4 exf4 17. Rxf4 Qd6 18. Rh4 c4 19. Qd1 d3 20. Bh5 Qe7 21. Qf3 Nd5 22. Qh3 Nf4 23. Qg4 Qf6 24. Nef3 Ne5 25. Nxe5 Ne2+ 26. Kh1 Qxe5 27. Nf3 Qf6 28. Qd7 Bc6 29. Qg4 Bb7 30. e5 Qe7 31. Qh3 Bxf3 32. gxf3 Qxe5 33. Bg4 h6 34. Bxc8 Rxc8 35. Qxc8+ Kh7 36. Rg4 Qd5 37. Qc7 Qxf3+ 38. Rg2 1-0
```

## Efficiency comparison

| Metric | Hosted `/analyze-game` | Local `analyzePosition` ×75 |
|--------|------------------------|------------------------------|
| Mode | One HTTP call, full timeline | Persistent UCI, ply-by-ply |
| Settings | movetime=200, multipv=3 | multipv=3, short internal movetimes |
| **Cold total** | **94577 ms** | **57902 ms** |
| Warm/cached total | **1327 ms** | n/a (in-process only) |
| ms/ply (cold) | 1261 | 772 |
| HTTP round-trips | **1** | 0 direct · **75** via `/api/analyze` |
| Min/max ply call | n/a | 0 / 835 ms |

**Single-ply `POST /analyze` sample (6 plies):** avg hosted **281 ms**, avg local **737 ms**.

### Efficiency takeaways

1. **Cold full-game:** local CPU wins (~58s vs ~95s hosted). Hosted pays network + remote sequential search.
2. **Cached full-game:** hosted returns the same PGN in ~1.3s — excellent for re-analysis / retry UX.
3. **Per-ply interactive:** hosted `/analyze` ~280ms vs local ~740ms on samples (hosted often faster per call at movetime=200).
4. **Product shape:** hosted returns `is_best_move`, before/after evals, MultiPV in one payload.

## Quality / agreement

| Metric | Value |
|--------|-------|
| After-position bestmove matches | 49 / 75 (**65.3%**) |
| Before-position bestmove matches | 47 (**62.7%**) |
| Avg eval gap | 26 cp |
| Median eval gap | 17 cp |
| Gaps > 50 cp | 14 |
| Gaps > 100 cp | 1 |
| Played = engine best (hosted) | 30.7% |
| Played = engine best (local) | 32.0% |

Shallow search (≈200ms/ply) explains ~65% bestmove agreement — both engines are noisy at this depth.

## Annotated moves (source NAGs)

| Ply | Move | Judgment | Local best | Hosted best | Agree | =local? | =hosted? | Hosted is_best | Gap |
|-----|------|----------|------------|-------------|-------|---------|-----------|----------------|-----|
| 12 | f5 | Mistake | f8e7 | h7h6 | false | false | false | false | 2 |
| 13 | Bg5 | Inaccuracy | c2b3 | c2b3 | true | false | false | false | 30 |
| 21 | Nc4 | Mistake | c3d4 | c3d4 | true | false | false | false | 58 |
| 22 | b5 | Inaccuracy | f5e4 | f5e4 | true | false | false | false | 26 |
| 24 | Bb7 | Mistake | f5e4 | f5e4 | true | false | false | false | 1 |
| 25 | a4 | Inaccuracy | c2b3 | c2b3 | true | false | false | false | 27 |
| 26 | a6 | Mistake | b5b4 | b5b4 | true | false | false | false | 16 |
| 27 | Ne1 | Mistake | a4b5 | e4f5 | false | false | false | false | 10 |
| 28 | Rac8 | Blunder | f5e4 | f5e4 | true | false | false | false | 3 |
| 29 | f4 | Interesting | a4b5 | a4b5 | true | false | false | false | 77 |
| 31 | dxe4 | Inaccuracy | a4b5 | a4b5 | true | false | false | false | 6 |
| 32 | exf4 | Mistake | c5c4 | c5c4 | true | false | false | false | 10 |
| 33 | Rxf4 | Interesting | a4b5 | a4b5 | true | false | false | false | 52 |
| 42 | Nd5 | Mistake | g7g5 | e7c5 | false | false | false | false | 14 |
| 43 | Qh3 | Mistake | f3g3 | f3g3 | true | false | false | false | 24 |
| 44 | Nf4 | Good | d5f4 | d5f4 | true | true | true | true | 3 |
| 45 | Qg4 | Inaccuracy | h4f4 | h4f4 | true | false | false | false | 35 |
| 46 | Qf6 | Inaccuracy | c6e5 | f4e2 | false | false | false | false | 10 |
| 52 | Qxe5 | Good | f6e5 | f6e5 | true | true | true | true | 47 |
| 61 | Qh3 | Inaccuracy | a4b5 | a4b5 | true | false | false | false | 8 |
| 62 | Bxf3 | Mistake | e2f4 | e2f4 | true | false | false | false | 16 |
| 63 | gxf3 | Interesting | h5f3 | h5f3 | true | false | false | false | 58 |
| 65 | Bg4 | Inaccuracy | a4b5 | h5g6 | false | false | false | false | 7 |
| 66 | h6 | Blunder | e2f4 | e2f4 | true | false | false | false | 51 |
| 68 | Rxc8 | Mistake | e5c7 | g8h8 | false | false | false | false | 99 |

Both engines flagged **20/20** Mistake/Blunder/Inaccuracy plies as *not* their best move — good alignment with the human annotations at this depth.

### Notable moments

- **Ply 28 Rac8 ($4 Blunder):** both engines preferred other moves; hosted `is_best_move=false`.
- **Ply 44 Nf4 ($1 Good):** tactical resource — see sample table.
- **Ply 66 h6 ($4 Blunder):** both engines disagree with the played move.

## Sample plies

| Ply | SAN | Played | Local best | Hosted best | Agree | Local ms | Local eval | Hosted eval | Gap |
|-----|-----|--------|------------|-------------|-------|----------|------------|-------------|-----|
| 1 | d3 | d2d3 | d7d5 | b8c6 | false | 0 | 0.06 | 0.13 | 7 |
| 14 | Be7 | f8e7 | g5e7 | g5e7 | true | 826 | -0.19 | -0.49 | 30 |
| 28 | Rac8 | a8c8 | a4b5 | a4b5 | true | 776 | 0.54 | 0.57 | 3 |
| 44 | Nf4 | d5f4 | h4f4 | h4f4 | true | 789 | -3.23 | -3.26 | 3 |
| 52 | Qxe5 | f6e5 | a4b5 | a4b5 | true | 781 | -2.13 | -1.66 | 47 |
| 66 | h6 | h7h6 | g4c8 | g4c8 | true | 787 | 2.63 | 2.12 | 51 |
| 75 | Rg2 | g4g2 | f3f6 | f3f6 | true | 507 | -3.97 | -4.10 | 13 |

## Single-ply latency (`POST /analyze`)

| Ply | SAN | Hosted ms | Local ms | Agree |
|-----|-----|-----------|----------|-------|
| 1 | d3 | 313 | 0 | false |
| 14 | Be7 | 267 | 826 | true |
| 28 | Rac8 | 278 | 776 | true |
| 44 | Nf4 | 289 | 789 | true |
| 66 | h6 | 263 | 787 | true |
| 75 | Rg2 | 277 | 507 | true |

## Hosted API

| Endpoint | Role |
|----------|------|
| GET / | Health |
| POST /bestmove | Single FEN |
| POST /multipv | MultiPV |
| POST /analyze | FEN pair (CLIO-like) |
| POST /analyze-game | Full PGN → timeline |

Timeline fields observed: `ply, move_number, side, played_move, played_move_san, before_fen, after_fen, engine_best_move, engine_ponder, is_best_move, evaluation_before, evaluation_after, engine_info_before, engine_info_after, before_analysis, after_analysis`

## Recommendations for CLIO

1. Use hosted `/analyze-game` for full-PGN review (one shot + `is_best_move` + before/after).
2. Keep local for live/incremental moves when the binary is available.
3. Map hosted timeline → CLIO analysis[]; treat `total_plies:0` as bad PGN.
4. Expect cold starts ~1–2 min for ~75 plies at movetime=200; cache makes repeats cheap.
5. Raise movetime/depth for classification quality; time scales roughly linearly.

---
Raw JSON: `scripts/stockfish-pgn-efficiency-report.json`
