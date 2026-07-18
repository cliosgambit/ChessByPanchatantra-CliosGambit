# Stockfish CBP API — live test report

**Target:** [https://stockfish-cbp.onrender.com/docs](https://stockfish-cbp.onrender.com/docs)  
**Tested:** 2026-07-18 ~15:00–15:30 IST  
**Engine:** Stockfish 18.1 · FastAPI 0.1.0 · OpenAPI 3.1

## Verdict

Service is **online and functionally correct**. All 7 documented endpoints work when the pool is free. The hard limit is a **single-engine pool** (1 thread, 128 MB hash): when busy, callers can wait minutes or time out with 0 bytes.

| Metric | Result |
|--------|--------|
| Endpoints reachable | 7/7 |
| Warm cases passed | 11/11 |
| Warm analysis latency | ~400 ms |
| Queue wait when busy | ~134 s (first `/analyze-game` success) |

## Service snapshot

| Field | Value |
|-------|--------|
| Base URL | `https://stockfish-cbp.onrender.com` |
| Docs | https://stockfish-cbp.onrender.com/docs |
| Engine | Stockfish 18.1 |
| Threads | 1 |
| Hash | 128 MB |
| Pool size | 1 engine |

**Pool / cache (end of warm pass):** available 1 / busy 0 · cache entries 178 · hit rate ~21% · peak busy engines 1.

## Critical finding: single-engine contention

While the sole engine is busy (`busy_engines=1`, `available_engines=0`), new analysis requests receive **no response bytes** until the lock frees. Clients that time out at 90–180s fail even though `/health` still reports healthy.

During this run, pool `average_acquire_wait_ms` peaked around **553 seconds**. Prefer `movetime` over deep `depth`, keep client timeouts high, and avoid parallel callers against this host.

## Endpoint results (warm pool)

Starting FEN: `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`

| Endpoint | Case | HTTP | Latency | Notes |
|----------|------|------|---------|--------|
| `GET /` | Home | 200 | 380 ms | `status: online`, SF 18.1 |
| `GET /health` | Pool health | 200 | 464 ms | healthy · 1 engine |
| `GET /stats` | Counters | 200 | 341 ms | requests + cache stats |
| `POST /bestmove` | depth=8 | 200 | 466 ms | bestmove `e2e4` · cached |
| `POST /multipv` | depth=8 · multipv=3 | 200 | 531 ms | 3 lines · e4 / d4 / c4 |
| `POST /analyze` | movetime=200 | 200 | 437 ms | cp +41 · depth 12 · cached |
| `POST /analyze` | current+previous FEN | 200 | 452 ms | `previous_fen_bestmove: e2e4` |
| `POST /analyze-game` | 5-ply PGN · movetime=200 | 200 | 386 ms | warm/cached · full timeline |
| `POST /bestmove` | missing fen | 422 | 384 ms | Field required (expected) |
| `POST /bestmove` | invalid fen | 400 | 404 ms | `Invalid FEN.` (expected) |
| `POST /analyze-game` | missing pgn | 422 | 466 ms | Field required (expected) |

## Busy-pool vs warm latency

Same short game PGN with `movetime=200`:

| Condition | Wall time | Notes |
|-----------|-----------|--------|
| Busy / queued | **134.6 s** | Mostly queue wait; engine work ~1.29 s; server total execution ~3.5 s once lock held |
| Warm / cached | **386 ms** | Immediate re-request |

Earlier `POST /bestmove`, `/multipv`, and `/analyze` all timed out at **180 s with 0 bytes** while `busy_engines=1`.

## Functional checks

### Happy-path response shapes

| Call | Key response fields |
|------|---------------------|
| `/bestmove` | `bestmove`, `ponder`, `depth`, `cp`, `mate`, `win_probability`, `pv`, `cached` |
| `/multipv` | `moves[]` with `rank`, `cp`, `pv`, `bestmove` per line |
| `/analyze` | `analysis[]`, `previous_fen_bestmove`, `win_probability` |
| `/analyze-game` | `timeline[]`, `accuracy`, `game_phases`, `critical_positions` |

Short Ruy Lopez sample (5 plies): Bb5 marked `is_best_move: false` (engine preferred `d2d4`); white accuracy 100%, black ~97%.

### Validation / errors

| Input | Status | Detail |
|-------|--------|--------|
| No `fen` on `/bestmove` | 422 | `body.fen` Field required |
| Garbage fen | 400 | `Invalid FEN.` |
| No `pgn` on `/analyze-game` | 422 | `body.pgn` Field required |

**Minor quirk:** one cached `/bestmove` reply returned `bestmove: "e2e4"` while `pv[0]` was `e2e3`. Prefer the top-level `bestmove` field (CLIO already does).

## API surface (from OpenAPI)

| Method | Path | Required body | Purpose |
|--------|------|---------------|---------|
| GET | `/` | — | Liveness + engine version |
| GET | `/health` | — | Engine pool health |
| GET | `/stats` | — | Request / cache counters |
| POST | `/bestmove` | `fen` · `depth?` | Single best move |
| POST | `/multipv` | `fen` · `depth?` · `multipv?` | Top-N lines |
| POST | `/analyze` | `fen` \| `current_fen`/`previous_fen` · `depth?` · `movetime?` · `multipv?` | Position analysis (CLIO-shaped) |
| POST | `/analyze-game` | `pgn` · `depth?` · `movetime?` · `multipv?` | Full-game timeline + accuracy |

## Verdict for CLIO

All documented endpoints work and return rich Stockfish 18.1 payloads. Validation is correct. Caching makes warm calls ~0.4 s.

The hard limit is the single-engine pool: concurrent or long depth searches starve other callers (including CLIO’s hosted fallback in `stockfishRoutes.js`). For production brilliance / game review:

1. Prefer hosted `POST /analyze-game` with `movetime` (e.g. 200)
2. Serialize traffic to this host
3. Set HTTP timeouts well above 3 minutes when the pool may be busy

---

*Test harness: live curl/PowerShell against https://stockfish-cbp.onrender.com · no auth · starting position + 5-ply sample PGN*
