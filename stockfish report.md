# Stockfish Engine Report — CLIO

Detailed per–use-case report of every Stockfish integration in this repo: what the frontend/backend sends, what is expected back, engine settings, and how results are handled.

**Binary (local):** `stockfish/stockfish-windows-x86-64-avx2.exe` (not in git; ~109 MB)  
**Cloud API:** `https://stockfish.online/api/s/v2.php`  
**Local backend route:** `POST /api/analyze` → `backend/api/services/stockfishService.js`

There are **three independent paths**:

| Path | Engine | Used for |
|------|--------|----------|
| A | Local `.exe` via Node UCI | Game analysis, AI move from `/api/analyze` |
| B | Cloud `stockfish.online` from browser | Puzzle opponent, polls, some legacy pages |
| C | Local `.exe` via Python `chess.engine` | Brilliance Stages 2–3 |

---

## Table of contents

1. [Use case A1 — Timeline game analysis (`useChessGame`)](#use-case-a1--timeline-game-analysis-usechessgame)
2. [Use case A2 — Game analysis hook (`useGameAnalysis`)](#use-case-a2--game-analysis-hook-usegameanalysis)
3. [Use case A3 — AI reply move (`requestAIMove`)](#use-case-a3--ai-reply-move-requestaimove)
4. [Use case A4 — Backend `/api/analyze` internals](#use-case-a4--backend-apianalyze-internals)
5. [Use case B1 — Puzzle vs Stockfish (`ChroniclesPuzzleBoard`)](#use-case-b1--puzzle-vs-stockfish-chroniclespuzzleboard)
6. [Use case B2 — Puzzle board view (`PuzzleBoardView`)](#use-case-b2--puzzle-board-view-puzzleboardview)
7. [Use case B3 — Puzzle poll options (`puzzlePollUtils`)](#use-case-b3--puzzle-poll-options-puzzlepollutils)
8. [Use case B4 — MappingDetails solution / eval](#use-case-b4--mappingdetails-solution--eval)
9. [Use case B5 — ChessGame page AI](#use-case-b5--chessgame-page-ai)
10. [Use case C1 — Brilliance Stage 2](#use-case-c1--brilliance-stage-2)
11. [Use case C2 — Brilliance Stage 3](#use-case-c2--brilliance-stage-3)
12. [Shared: cloud API contract](#shared-cloud-api-contract)
13. [Shared: local UCI process control](#shared-local-uci-process-control)

---

## Use case A1 — Timeline game analysis (`useChessGame`)

**Where:** `frontend/src/hooks/useChessGame.js`  
**When:** Analysis enabled; user loads / navigates a game. A queue analyzes each ply (current nav index prioritized).

### What we send

```http
POST ${VITE_API_BASE || ''}/api/analyze
Content-Type: application/json
```

```json
{
  "previous_fen": "<FEN before this ply (or same as current at ply 0)>",
  "current_fen": "<FEN after this ply>",
  "multipv": 3
}
```

| Field | Source | Notes |
|-------|--------|-------|
| `current_fen` | `positionToFEN(pos, turn, castling, ep)` for timeline index `idx` | Built from board state |
| `previous_fen` | Same helper on `timeline[idx - 1]`, or equals `current_fen` at start | Used for MultiPV best lines |
| `multipv` | `options.multipv \|\| 3` | Passed through; backend clamps 1–10 |

**Auth:** none (route has no `authenticate` middleware).

### Skips (no API call)

| Condition | Client-side result stored |
|-----------|---------------------------|
| Already analyzed / has `score` or `error` | Skip |
| `chess.js` game over (checkmate) | `{ score: { type: 'mate', value: 0 }, depth: 0, lines: [] }` |
| Game over (draw) | `{ score: { type: 'cp', value: 0 }, depth: 0, lines: [] }` |
| Empty board FEN `8/8/...` | Zero score object |

### What we expect as output

Success JSON from `/api/analyze` (see [A4](#use-case-a4--backend-apianalyze-internals)), roughly:

```json
{
  "bestmove": "e2e4",
  "ponder": "e7e5",
  "score": { "type": "cp", "value": 35 },
  "depth": 18,
  "winProbability": { "white": 56, "black": 44 },
  "lines": [
    {
      "multipv": 1,
      "score": { "type": "cp", "value": 40 },
      "pv": "e2e4 e7e5 g1f3",
      "depth": 12,
      "firstMoveScore": { "type": "cp", "value": 38 }
    }
  ],
  "previousFenBestmove": "e2e4",
  "warning": ["optional string array if a sub-analysis failed"]
}
```

### How we handle the response

1. `setAnalysis` at index `idx` with full payload.
2. Separately calls `POST /ai/pipeline` with `{ fen }` (not Stockfish; AI narrative pipeline).
3. On failure: `{ error: "<message>", depth: 0, lines: [] }` so the queue does not retry forever.
4. Queue control: `isAnalyzing` lock; one ply at a time; `navIndex` sorted to front.

### Stockfish settings (effective, via backend)

Frontend does **not** send `depth` / `movetime`. Backend uses fixed movetimes (see A4).

---

## Use case A2 — Game analysis hook (`useGameAnalysis`)

**Where:** `frontend/src/hooks/useGameAnalysis.js`  
**When:** Chess.com / analysis UIs that pass `history` + `moveHistory` and `enabled !== false`.

### What we send

Identical shape to A1:

```json
{
  "previous_fen": "<timeline[idx-1].fen or current>",
  "current_fen": "<timeline[idx].fen>",
  "multipv": 3
}
```

`API_BASE` is hard-coded `''` (same-origin / Vite proxy → backend).

### What we expect / how we handle

Same as A1 for the analyze payload. **Does not** call `/ai/pipeline`.  
Used for eval bar, move classification helpers (`classifyPlayedMoveAtNavIndex`, etc.).

### Settings

| Setting | Value |
|---------|-------|
| Default MultiPV | 3 |
| Queue | Serial, navIndex prioritized |
| Game-over skip | Same mate/cp=0 local objects |

---

## Use case A3 — AI reply move (`requestAIMove`)

**Where:** `useChessGame.js` → `requestAIMove`  
**When:** White AI / Black AI toggled and it is that side’s turn at the live end of the timeline.

### What we send

Same `POST /api/analyze`:

```json
{
  "previous_fen": "<previous timeline FEN or current>",
  "current_fen": "<live position FEN>",
  "multipv": 3
}
```

Rate limit: waits so at least **100 ms** between AI requests (`lastAiMs`).

### What we expect

Uses **`bestmove`** (or legacy `data.move`) as a UCI string:

- Length ≥ 4: `from = slice(0,2)`, `to = slice(2,4)`, optional promo = 5th char uppercased.
- Must be in legal moves for `from` before applying.

### How we handle

```text
API bestmove "e7e5"
  → { from: "e7", to: "e5" }
  → legality check → apply on board
```

If missing/illegal/error: returns `null` (no move).

### Settings

Same backend movetime MultiPV analysis as A1 (not a dedicated “go movetime for best only” API). MultiPV still requested; only `bestmove` is used for the reply.

---

## Use case A4 — Backend `/api/analyze` internals

**Route:** `backend/api/routes/stockfishRoutes.js`  
**Service:** `backend/api/services/stockfishService.js`  
**Mount:** `app.use('/api', stockfishRoutes)` → `POST /api/analyze`

### Request body (accepted fields)

| Field | Required | Used? |
|-------|----------|-------|
| `current_fen` | Yes* | Yes — position to score |
| `previous_fen` | Yes* | Yes — MultiPV lines |
| `fen` | Alias | Falls back for either FEN |
| `multipv` | No (default 3) | Yes — clamped 1–10 |
| `depth` | Optional | Accepted by route, **ignored** by `analyzePosition` |
| `movetime` | Optional | Accepted by route, **ignored** by `analyzePosition` |

\*Both current and previous must resolve; else `400 { "error": "Both current_fen and previous_fen are required" }`.

### Engine binary & process model

| Item | Value |
|------|-------|
| Executable | `stockfish/stockfish-windows-x86-64-avx2.exe` |
| Processes | `sfEngine` (main) + `sfBackgroundEngine` (first-move scores) |
| Protocol | UCI |
| Init | `uci` → `isready` → wait `readyok` |
| Concurrency | One job at a time per process; FIFO queue |
| Cache | In-memory Map key `current\|previous\|multipv`, max 100 entries |

### UCI commands per job

```text
ucinewgame
isready
setoption name MultiPV value <N>
position fen <FEN>
go movetime <ms>          # preferred path
# fallback may use: go depth <n>
```

### Settings used inside `analyzePosition`

| Sub-job | Engine | MultiPV | Primary limit | Fallbacks |
|---------|--------|---------|---------------|-----------|
| Current FEN | Foreground | 1 | movetime **200** ms | movetime 100; then depth 10 + movetime 1500 |
| Previous FEN | Foreground | requested N (≤10) | movetime **80** ms | movetime 50 MultiPV≤3; then depth 10 + movetime 1500 |
| Each PV first move | Background | 1 | movetime **200 / 150 / 100** ms by line index | half movetime; then depth 10 + 1500 |

**Timeouts (Node-side):**

- Movetime job: `max(3000, movetime + 3000)` ms  
- Depth job: `max(15000, depth * 1000)` ms  

### Response fields (detailed)

| Field | Meaning |
|-------|---------|
| `bestmove` | UCI best move from **current** FEN analysis (or first PV move fallback) |
| `ponder` | Optional ponder move from engine |
| `score` | `{ type: "cp"\|"mate", value }` for **current** FEN (side-to-move engine score convention as parsed) |
| `depth` | Reported search depth from current analysis |
| `winProbability.white` / `.black` | Derived from current score via `scoreToWhiteWinProbability` (0–100) |
| `lines[]` | MultiPV lines from **previous** FEN: `multipv`, `score`, `pv`, `depth`, `firstMoveScore` |
| `previousFenBestmove` | Best move from previous-FEN search |
| `warning` | Array of strings if current or previous settled as rejected |

### Error responses

| Status | Body |
|--------|------|
| 400 | `{ "error": "Both current_fen and previous_fen are required" }` |
| 500 | `{ "error": "<exception message>" }` e.g. binary missing |

### Score → win probability (control logic)

- Mate for side to move → 100 / 0 white win accordingly (with turn flip).  
- CP mapped in bands (±0, ±4, ±8 pawns) to 0–100 white win %.

---

## Use case B1 — Puzzle vs Stockfish (`ChroniclesPuzzleBoard`)

**Where:** `frontend/src/components/chronicles/ChroniclesPuzzleBoard.jsx`  
**Helper:** `frontend/src/utils/stockfishClient.js` → `fetchStockfishMove`  
**When:** Play mode = `stockfish`; it is the engine’s turn.

### What we send

```http
GET https://stockfish.online/api/s/v2.php?fen=<ENCODED_FEN>&depth=12
```

| Param | Value |
|-------|-------|
| `fen` | `game.fen()` after human move |
| `depth` | Default **12**, capped at **15** |

**Does not** go through CLIO backend.

### What we expect

Cloud JSON (see [Shared cloud contract](#shared-cloud-api-contract)):

```json
{
  "success": true,
  "bestmove": "bestmove e7e5 ponder e2e4",
  "evaluation": 0.32,
  "mate": null
}
```

Client parses `bestmove` string → second token UCI → `{ from, to, promotion? }`.

### How we handle

1. Wait **600 ms** debounce after turn flips to engine.  
2. Call `fetchStockfishMove(currentFen)`.  
3. If FEN unchanged and game not over → `makeMove(bestMove)`.  
4. Clear “Stockfish thinking…” state.  
5. On null/error → no move (thinking flag cleared).

### Settings

| Setting | Value |
|---------|-------|
| Depth | 12 (max 15) |
| Debounce | 600 ms |
| Opponent | Engine plays opposite of `humanColor` |

---

## Use case B2 — Puzzle board view (`PuzzleBoardView`)

**Where:** `frontend/src/components/puzzles/PuzzleBoardView.jsx`  
**When:** Opponent mode `stockfish` on library / view-puzzle boards.

### What we send

Same cloud API (local duplicate of client, not imported helper):

```http
GET https://stockfish.online/api/s/v2.php?fen=...&depth=12
```

`STOCKFISH_DEPTH = 12`, capped at 15.

### What we expect / handle

Same as B1: parse UCI bestmove → apply when it is engine’s turn and puzzle is live.

### Settings

Identical cloud depth/cap; local `fetchStockfishMove` function inside the component.

---

## Use case B3 — Puzzle poll options (`puzzlePollUtils`)

**Where:** `frontend/src/utils/puzzlePollUtils.js` → `buildPollOptionsForPuzzle(fen)`  
**Helper:** `fetchEvaluationAtDepth` from `stockfishClient.js`  
**When:** Building “top 4 moves” poll for a puzzle position (e.g. Chronicles poll UI).

### What we send

For **every legal move**:

1. Apply move locally with `chess.js`.  
2. Request eval of resulting FEN:

```http
GET https://stockfish.online/api/s/v2.php?fen=<after_move_FEN>&depth=12
```

### What we expect per call

```json
{ "success": true, "evaluation": 0.45, "mate": null }
```

Client maps to `{ evaluation, mate }` or `{ error }`.

### How we handle

1. Filter rows with numeric `evaluation`.  
2. Sort: White to move → higher eval first; Black → lower first.  
3. Top 4 → options; rank 1 = `isAnswer: true`.  
4. Pad with unevaluated legal moves if &lt; 4 evals.  
5. **Shuffle** the four options before return (answer not always first in UI).

### Settings

| Setting | Value |
|---------|-------|
| Depth | 12 |
| Parallelism | `Promise.all` over all legal moves (can be many cloud calls) |
| Output count | Up to 4 shuffled choices |

---

## Use case B4 — MappingDetails solution / eval

**Where:** `frontend/src/pages/MappingDetails.jsx`

### B4a — Multi-move solution (`fetchPuzzleSolution`)

**Send (loop):** for each ply in a sequence:

```http
GET https://stockfish.online/api/s/v2.php?fen=<current>&depth=<min(depth,15)>
```

**Expect:** `success` + `bestmove` string → take UCI token → `tempGame.move(uci)` → push to `solutionMoves`.

**Handle:** Stop early if game over; throw on bad format / illegal engine move.

### B4b — Eval after candidate move

**Send:**

```http
GET https://stockfish.online/api/s/v2.php?fen=<newFen>&depth=10
```

**Expect:** `{ evaluation, mate }`  
**Handle:** Attach eval to candidate rows for UI ranking/display.

### Settings

| Call | Depth |
|------|-------|
| Solution walk | Caller `depth`, capped 15 |
| Single eval | **10** |

---

## Use case B5 — ChessGame page AI

**Where:** `frontend/src/pages/ChessGame.jsx` → `fetchBestMove`  
**When:** In-page AI opponent (legacy/standalone game page).

### What we send

```http
GET https://stockfish.online/api/s/v2.php?fen=<FEN>&depth=<min(maxDepth, 15)>
```

`maxDepth` comes from UI state; hard cap 15.

### What we expect / handle

Parse `bestmove` → `{ from, to, promotion }` same as B1.  
Logs `[ChessGame] AI Fetch (Online API @ Depth: N)`.

### Settings

Cloud only; no CLIO `/api/analyze`.

---

## Use case C1 — Brilliance Stage 2

**Where:**  
- Service: `backend/brilliance/services/brillianceStage2Service.js`  
- Script: `backend/brilliance/brilliance_stage2.py`  
- Runner: `backend/brilliance/utils/brilliancePython.js`

**When:** Brilliance pipeline runs Stage 2 for a PGN/game after Stage 1 candidates exist. **Frontend does not call Stockfish**; it triggers/polls brilliance HTTP APIs.

### What Node sends to Python

```json
{
  "pgn": "<full PGN text>",
  "engine_path": "<absolute path to stockfish-windows-x86-64-avx2.exe>"
}
```

Spawn: `py -3 script.py '<json>'` (Windows fallbacks: `python`, `python3`).  
Timeout: **600000 ms**, maxBuffer 50 MB.

### Stockfish settings inside Stage 2 (Python `chess.engine`)

From `brilliance_eval.py` / `brilliance_stage2.py`:

| Setting | Value |
|---------|-------|
| Search time cap | `STAGE2_SEARCH_TIME_S = 2.0` s |
| Primary depth | **12** (MultiPV **5** for top lines) |
| Fallback depth | **10** (also MultiPV **8** in some gates) |
| Preservation / survival | depth 8 (`STAGE20_ENGINE_DEPTH`), time 2s; survival checks depth ≥6 |
| Limit semantics | `chess.engine.Limit(depth=…, time=…)` — stops at depth **or** time |
| Eval POV | White (+ = white better); gates convert with `to_mover_cp` |

### What we expect from Python stdout

JSON analysis object including per-move features, e.g.:

- `best_move`, `best_score_cp`, `our_score_cp`, `our_rank_in_top5`  
- `cpl_shallow`, `ep_delta_shallow`, `proceed_to_stage3`  
- `engine_depth`, `features_json` (top5, n_legal, etc.)  
- `stockfish_path`

### How Node handles

1. Parse stdout JSON.  
2. Persist rows into `lichess_pgn_stage2` (or chess.com brilliance tables depending on pipeline).  
3. Update game status counters (`stage2_status`, analyzed/proceed counts).  
4. Frontend reads via brilliance REST — never UCI.

---

## Use case C2 — Brilliance Stage 3

**Where:** `brilliance_stage3.py` + `brillianceStage3Service.js`  
**When:** Only moves with `proceed_to_stage3` from Stage 2.

### What Node sends to Python

Same pattern: JSON with `pgn` + `engine_path` (and game context as implemented by the service).

### Stockfish settings

| Setting | Value |
|---------|-------|
| Depth curve | **1, 5, 10, 15, 18** |
| Curve movetime | `STAGE3_DEPTH_CURVE_TIME_S = 0.75` s per depth |
| Main search time | `STAGE3_SEARCH_TIME_S = 1.5` s |
| Rank @ d8 | MultiPV **10**, depth 8 |
| Deep @ d18 | MultiPV **5** (and MultiPV **8** in defense paths) |
| Min depth-eval span | `STAGE3_MIN_DEPTH_EVAL_SPAN_CP = 100` (scored in Stage 4) |
| Deep sound threshold | `DEEP_EVAL_SOUND_THRESHOLD_CP = -30` (mover POV) |

### What we expect / handle

Python returns deep features (`depth_evals`, `depth_evals_mover`, ranks, defense lines, gate flags).  
Node saves to Stage 3 tables; Stage 4 consumes scores (no new Stockfish in Stage 0–1/4 heuristics).

---

## Shared: cloud API contract

**URL:** `https://stockfish.online/api/s/v2.php`

### Request

| Query | Type | Notes |
|-------|------|-------|
| `fen` | string | URL-encoded FEN |
| `depth` | int | Clients cap at **15** |

### Typical success body

```json
{
  "success": true,
  "evaluation": 0.42,
  "mate": null,
  "bestmove": "bestmove e2e4 ponder e7e5",
  "continuation": "optional PV text"
}
```

| Field | Used by |
|-------|---------|
| `bestmove` | Move reply use cases (B1, B2, B4a, B5) — parse token after `bestmove` |
| `evaluation` | Poll / ranking (B3, B4b) — pawn units, white POV as returned by API |
| `mate` | Optional mate in N |
| `success: false` / missing fields | Treated as error / null move |

### Failure handling (clients)

- HTTP not OK → `null` or `{ error: "HTTP …" }`  
- Network throw → `null` / `{ error: message }`  
- Invalid `bestmove` format → skip move / throw (MappingDetails)

---

## Shared: local UCI process control

**File:** `backend/api/services/stockfishService.js`

| Control | Behavior |
|---------|----------|
| Missing binary | Reject init: `Stockfish not found at …` |
| Queue | Jobs wait until previous `bestmove` or timeout |
| MultiPV option | Reset every job (`setoption name MultiPV value N`) |
| Unexpected exit | Reject current task; next `ensureInitialized` respawns |
| Parallel HTTP | Multiple `/api/analyze` share the same two engines → serialized internally |
| Cache | Identical FEN pair + multipv returns previous JSON without UCI |

### UCI parse rules

From `info` lines:

- `score cp <n>` / `score mate <n>`  
- `depth <n>`  
- `multipv <k>` + `pv <moves…>`  
- Final `bestmove <uci> [ponder <uci>]`

---

## Quick reference — which path for which UI

| UI / feature | Path | Endpoint / target |
|--------------|------|-------------------|
| Custom / Chess.com game analysis bars | A | `POST /api/analyze` |
| AI side in `useChessGame` | A | `POST /api/analyze` |
| Chronicles / library puzzle vs engine | B | `stockfish.online` |
| Puzzle poll top-4 | B | `stockfish.online` × N legal moves |
| MappingDetails | B | `stockfish.online` |
| ChessGame.jsx AI | B | `stockfish.online` |
| Brilliant move Stages 2–3 | C | Local exe via Python |

---

## Operational notes

1. **Local analysis requires the Windows AVX2 binary** at `stockfish/stockfish-windows-x86-64-avx2.exe`. Without it, Path A and Path C fail.  
2. **`/api/analyze` is unauthenticated** — any client that can reach the backend can load the engine.  
3. Path A frontend **cannot set depth/movetime** today; only MultiPV is honored.  
4. Path B depends on **external availability** of stockfish.online and is capped at depth 15.  
5. Brilliance Stage 2–3 can run **many** engine searches per game (minutes); Node timeout for the Python child is 10 minutes.
---

*Generated from the CLIO codebase as of the report date. Paths relative to repo root.*
