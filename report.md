# Stockfish & Brilliant-Move Pipeline — Rebuild Blueprint

**Purpose:** Complete technical specification of CLIO’s brilliance detection and Stockfish usage, sufficient to re-implement the same behavior on a **hosted Stockfish** service (`https://stockfish-cbp.onrender.com` or equivalent).

**Source of truth (code):** `backend/brilliance/` (Python stages 0–4) + `backend/api/services/stockfishService.js` (separate CPL game-review path).

**Date of extraction:** 2026-07-17

---

## Table of contents

1. [System overview](#1-system-overview)
2. [Eval conventions (critical)](#2-eval-conventions-critical)
3. [Orchestration & I/O](#3-orchestration--io)
4. [Stage 0 — Board-only features](#4-stage-0--board-only-features)
5. [Stage 1 — Sacrifice classification](#5-stage-1--sacrifice-classification)
6. [Engine candidacy gates (into Stage 2)](#6-engine-candidacy-gates-into-stage-2)
7. [Stage 2 — Shallow Stockfish](#7-stage-2--shallow-stockfish)
8. [Stage 3 — Deep Stockfish](#8-stage-3--deep-stockfish)
9. [Stage 4 — Human perception / BRILLIANT](#9-stage-4--human-perception--brilliant)
10. [Parallel path: CPL game review](#10-parallel-path-cpl-game-review)
11. [Hosted Stockfish API contract](#11-hosted-stockfish-api-contract)
12. [Hosted rebuild search matrix](#12-hosted-rebuild-search-matrix)
13. [Database schema](#13-database-schema)
14. [Caching, resume, workers](#14-caching-resume-workers)
15. [Edge cases](#15-edge-cases)
16. [File index](#16-file-index)
17. [Threshold cheat-sheet](#17-threshold-cheat-sheet)

---

## 1. System overview

CLIO has **two independent Stockfish systems**:

| System | Engine entry | Purpose | Brilliant? |
|--------|--------------|---------|------------|
| **Brilliance pipeline** (Stages 0→4) | Stages 2–3 only (Python `python-chess` UCI) | Find sacrifice / quiet / defensive “brilliant” moves | Yes — Stage 4 |
| **Game analysis CPL** | Node `PersistentStockfish` via `POST /api/analyze` | Label every move best→blunder | No — no “brilliant” label |

```
PGN (clean_pgn) / Chess.com sync
        │
        ▼
parse → lichess_pgn_games + lichess_pgn_moves
        │
        ▼
┌──────────────────────────────────────────────────────────────┐
│ Brilliance Engine                                            │
│  S0 board features (no SF)                                   │
│  S1 sacrifice class (no SF)                                  │
│  S2 shallow SF d12 + MultiPV                                 │
│  S3 deep SF depth-curve d1–18 + ranks + defense              │
│  S4 human score → BRILLIANT / practical_brilliant / …        │
└──────────────────────────────────────────────────────────────┘
        │
        ▼
SQLite chess_analysis.db  (+ optional Postgres chess_com_brilliance_*)
```

**Local binary:** `stockfish/stockfish-windows-x86-64-avx2.exe` (not in git).

**Brilliance does not use WASM.** Stages 2–3 spawn Stockfish via `chess.engine.SimpleEngine.popen_uci(path)`.

---

## 2. Eval conventions (critical)

All brilliance engine scores are normalized before storage/gates.

**File:** `backend/brilliance/brilliance_eval.py`

| Concept | Rule |
|---------|------|
| Storage POV | **White** always (`+` = white better) |
| Mate | `mate_score=10000` → ±10000 cp |
| Mover POV | `to_mover_cp(white_cp, color)` → flip for black |
| Centipawn loss (CPL) | White: `best − our`; Black: `our − best` (always ≥0 when our ≤ best for mover) |
| Expected points (EP) | `1 / (1 + 10^(-cp/400))` on **mover** cp |
| Limit helper | `engine_limit(depth=…, time_s=…)` → engine stops at **depth OR time, whichever first** |

```python
MATE_SCORE = 10000
EVAL_PERSPECTIVE = "white"

STAGE2_SEARCH_TIME_S = 2.0
STAGE3_DEPTH_CURVE_TIME_S = 0.75
STAGE3_SEARCH_TIME_S = 1.5
STAGE3_MIN_DEPTH_EVAL_SPAN_CP = 100  # telemetry / Stage 4 score, NOT a hard gate
```

**UCI score interpretation via python-chess:**

```python
info["score"].white().score(mate_score=10000)  # always white POV
```

**Node CPL path** (`stockfishService.js`): UCI scores are **side-to-move**. Win% flips when turn is `b`.

---

## 3. Orchestration & I/O

### 3.1 Pipeline runner

**File:** `backend/brilliance/services/brilliancePipelineService.js`

Order: **S0 → S1 → S2 → S3 → S4**

- Concurrent requests for same `gameId` coalesce via `runningPipelines` Map.
- `force=true` clears stage tables from stage 1 onward before re-run.
- If Stage 2 analyzes **0** moves → mark Stage 3 & 4 empty-complete and stop.
- If Stage 3 analyzes **0** moves → mark Stage 4 empty-complete and stop.
- After S0, later stages are forced (`force: true`) so cascade always refreshes.

### 3.2 Python bridge

**File:** `backend/brilliance/utils/brilliancePython.js`

| Item | Value |
|------|--------|
| Invoke | `py -3` / `python` / `python3` + script path + **JSON string argv** |
| Timeout | **600_000 ms** (10 min) |
| Max stdout | 50 MB |
| Stockfish path passed | `engine_path` in JSON (S2/S3) |

### 3.3 Per-stage CLI input / output

| Stage | Input JSON | Output JSON (top-level) |
|------:|------------|-------------------------|
| 0 | `{ "pgn" \| "clean_pgn": "..." }` | `{ moves: [...], sacrifice_count, … }` |
| 1 | `{ "pgn" \| "clean_pgn": "..." }` | `{ moves: [...], proceed_to_stage2_count, … }` |
| 2 | `{ "pgn", "engine_path" }` | `{ moves: [...], proceed_to_stage3_count, … }` |
| 3 | `{ "pgn", "engine_path", "ply_indices": [int…] }` | `{ moves: [...], sound_count, … }` |
| 4 | `{ "moves": [ Stage4Input… ] }` | `{ moves: [...], brilliant_count, … }` — **no engine** |

Stage 3 with `ply_indices` set **skips** re-running Stage 2 gates (`skip_stage2_gate=True`).

---

## 4. Stage 0 — Board-only features

**Engine:** none  
**Files:** `brilliance_stage0.py`, `brillianceStage0Service.js`, `brilliance_gates.py` (`compute_engine_candidacy`)  
**Runs on:** every ply of the mainline

### 4.1 Input

- Full game PGN string → `chess.pgn.read_game` → iterate `mainline_moves()`
- `ply_index` is 0-based half-move index

### 4.2 Piece values (SEE / material)

```
P=100, N=305, B=333, R=563, Q=950, K=0
```

### 4.3 Game phase

From non-pawn piece material sum:

| Total | Phase |
|------:|-------|
| > 5800 | opening |
| > 2800 | middlegame |
| else | endgame |

### 4.4 What Stage 0 computes (per move)

Board features packed into `features_json`, including:

- Capture SEE (`see()`), net SEE for landing-en-prise captures
- Destination attackers/defenders
- King safety before/after (opponent) → `king_safety_delta`
- Tactical multiplexing score
- Expectation violation (`ev_score`)
- Piece harmony, quiet brilliance detector
- Defensive context (material deficit)
- Sacrifice exposure / hanging / defender-removal / fork-escape
- Flags: `is_sacrifice_candidate`, `proceed_to_stage1`, `proceed_to_engine`

### 4.5 Sacrifice candidate logic

Constants:

```
SACRIFICE_MIN_PIECE_VALUE = 300
SACRIFICE_SCAN_MIN_PIECE_VALUE = 100
OPP_PROFITABLE_SEE_THRESHOLD = 50
OPP_SEE_EN_PRISE_THRESHOLD = 0
WINNING_CAPTURE_SEE_THRESHOLD = 150
EQUAL_TRADE_SEE_THRESHOLD = -100
EARLY_GAME_PLY_CUTOFF = 10
OPENING_PHASE_THRESHOLD = 5800
PAWN_SACRIFICE_SEE_LIMIT = 200
OPENING_TM_BYPASS_THRESHOLD = 8
OPENING_KING_SAFETY_BYPASS = -100
PAWN_OPENING_OPP_SEE_THRESHOLD = 150
```

**Absolute block:** `ply_index < 10` → never a sacrifice (`early_game_blocked`, `opening_theory_zone`).

A move is a sacrifice candidate if any of:

1. **Negative SEE capture** that counts as sacrifice (not winning/equal trade after filters)
2. **Positional risk** — non-capture onto attacked square where opponent’s best capture SEE is profitable (stricter for opening pawns: opp SEE > 150)
3. **Hanging / verified exposure** — Stage 0 exposure audit finds abandoned pieces (and not a favorable trade)

**Suppressions:**

- `fork_escape_abandonment` → not a sac
- Opening-phase **pawn-level** sacs suppressed unless extraordinary: opp KS Δ ≤ −100 **or** multiplexing ≥ 8

### 4.6 Quiet brilliance (board-only)

`quiet_brilliant_detector` — for non-capture / scored regardless; formula mixes control gain, opp mobility loss, x-ray to king, zugzwang, domination, threat reduction.

- Soft flag: `proceed_to_engine` if quiet and `quiet_score > 3.0`
- **Direct Stage 2 entry** requires `quiet_score >= 4.5` (gate constant)

### 4.7 Defensive context

```
material_deficit = max(0, -material_balance)
is_defending = material_deficit > 150
```

### 4.8 Output / DB

Table `lichess_pgn_stage0` — columns for SEE, sac flags, scores + full `features_json`.  
Game counters: `stage0_status`, `stage0_sacrifice_count`.

---

## 5. Stage 1 — Sacrifice classification

**Engine:** none  
**File:** `brilliance_stage1.py`  
**Runs on:** moves where Stage 0 `is_sacrifice_candidate`

### 5.1 Input

Same PGN; internally re-computes Stage 0 sac check then classifies.

### 5.2 Hard disqualifiers (block Stage 2 unless overridden paths apply carefully)

```python
HARD_DISQUALIFIERS = {
  "winning_capture_not_sacrifice",      # raw SEE ≥ 150 (unless net-SEE path)
  "equal_trade_not_sacrifice",          # SEE ≥ −100 or standard trade (exchange sac excepted)
  "opening_gambit_pawn_sacrifice",
  "pawn_sacrifice_insufficient_justification",
}
```

Other soft disqualifiers (may still proceed via tactical/dynamic override):

- `cheapest_attacker_wins_material`
- `piece_already_lost_before_move` (blocked unless tactical bypass)

### 5.3 Gambit pattern (C3)

Pawn offer, move number ≤ **15**, phase material ≥ **4500**, no check, TM < 6, KS Δ > −80 → `opening_gambit_pawn_sacrifice`.

### 5.4 Pawn sac early gate (C4)

If `|SEE|` in 100–200, opening/middlegame, move ≤ **20**, require KS Δ ≤ −60 or TM ≥ 6 or endgame — else `pawn_sacrifice_insufficient_justification`.

### 5.5 Sac types

| Type | Typical meaning |
|------|-----------------|
| `queen_sacrifice` | Queen abandoned |
| `exchange_sacrifice` | Rook / exchange |
| `real_sacrifice` | Large negative SEE |
| `tactical_sacrifice` | Knight/bishop/tactical |
| `pseudo_sacrifice` | Likely recapture recovers material |
| `positional_piece_placement` | Non-capture placement risk |

Classification prefers **intentionally sacrificed asset** from Stage 0 exposure over the moving piece.

### 5.6 Forced move

`n_legal == 1` → `is_forced`, **never** proceeds to Stage 2.

### 5.7 Proceed to Stage 2

```
if only_legal_move → NO
if hard disqualifier → NO
if is_valid_sacrifice → YES
if tactical_bypass OR dynamic≥6 OR exchange_override(SEE≤−50) → YES (with caveats)
else if other disqualifiers → NO
else YES
```

**Tactical bypass:** check **or** multiplexing ≥ 6 **or** opp KS Δ ≤ −60.

**Dynamic score:**

```
king_pressure*0.4 + multiplexing*0.8 + quiet*0.5 + harmony*0.3
```

### 5.8 Output / DB

Table `lichess_pgn_stage1` — `sac_type`, disqualifiers, forced, `proceed_to_stage2`, `features_json`.

---

## 6. Engine candidacy gates (into Stage 2)

**File:** `brilliance_gates.py` — `resolve_engine_candidate`

Stage 2 does **not** only take Stage 1 passers. Four paths:

| Path | Condition |
|------|-----------|
| **quiet** | `quiet_score >= 4.5` (direct; skips needing Stage 1 proceed) |
| **sacrifice** | Stage 1 `proceed_to_stage2` |
| **alternative** | After Stage 1 fails/blocks: quiet≥4.0 **or** mux≥6 **or** opp KS≤−60 **or** EV≥5 **or** sac flags — unless blocked by forced / winning-capture / already-lost without tactical bypass |
| **defensive** | Defending (deficit>150) **and** (gives check **or** stalemate trap **or** perpetual **or** quiet>2) |

Constants:

```
QUIET_DIRECT_THRESHOLD = 4.5
ALT_QUIET_THRESHOLD = 4.0
```

---

## 7. Stage 2 — Shallow Stockfish

**First engine stage.**  
**File:** `brilliance_stage2.py`  
**JS:** `brillianceStage2Service.js` → passes `{ pgn, engine_path }`

### 7.1 Engine configure

```python
engine.configure({"Threads": 1, "Hash": 128, "MultiPV": 8})
```

(Equivalent UCI: `setoption name Threads/Hash/MultiPV`.)

### 7.2 Stage 2.0 — Piece preservation (before shallow features)

Only when Stage 0 marks piece **already lost before move** and en prise (skips intentional moving sacrifices).

| Param | Value |
|-------|------:|
| Depth | 8 |
| Time | 2.0 s |
| Survival plies | 4 |
| Loss threshold | `max(0.7 * piece_value, 150)` cp |

If engine confirms `already_lost_engine` → **fail Stage 2**, classification `unsound_sacrifice`, reason `piece_already_lost_engine_confirmed`. **No Stage 3.**

### 7.3 Shallow search matrix (`shallow_engine_features`)

All times = `STAGE2_SEARCH_TIME_S` (2.0s) unless noted.

| # | Position | Depth | MultiPV | Purpose |
|---|----------|------:|--------:|---------|
| 1 | **Before** move | 12 | 1 | Pre-move eval (mover + white) |
| 2 | **Before** move | 12 | **5** | Top-5 lines; find played move rank & scores |
| 3 | **After** move (only if played not in top 5) | 10 | 1 | Score our move |
| 4 | **After** move | 10 | **8** | Opponent response width |

**How Stockfish is interpreted:**

1. Take MultiPV-5 on position **before** move.
2. `best_score_cp` = white POV of line 1; `best_move` = PV[0].
3. If played UCI equals some PV[0], `our_score_cp` = that line’s white score, `our_rank_in_top5` = 1..5.
4. Else analyse after-move at d10 → `our_score_cp`, rank = 99.
5. `cpl_shallow = cpl_from_white_scores(best, our, color)`.
6. **Reasonable moves:** MultiPV lines with CPL ≤ **150** from best.  
   `is_forced_engine = (len(reasonable) ≤ 2)`.
7. `is_only_good_move = (len(reasonable) ≤ 1)`.
8. `is_best_or_near_best = (cpl_shallow ≤ 50)`.
9. EP delta: `ep(our_mover) − ep(best_mover)`; also store `ep_pre_position`.
10. **Response width:** count opp MultiPV-8 lines within **120 cp** of opp best (white abs diff).

### 7.4 Stage 2 hard gate (`apply_stage2_gate`)

Checked in order:

| Condition | Fail reason | Classification |
|-----------|-------------|----------------|
| `cpl_shallow > 300` | `cpl_too_high` | `unsound_sacrifice` |
| `is_forced_engine` and **not** bypassed | `forced_engine` | `forced_sacrifice` |
| `ep_delta_shallow < -0.15` | `ep_delta_too_negative` | `unsound_sacrifice` |

**Forced bypass** (`should_bypass_forced_engine`):

- Must be forced-engine **and** ≥2 reasonable moves (not only-good-move)
- Bypass if `is_best_or_near_best` **or** Stage1 `tactical_bypass`

Pass → `proceed_to_stage3 = true`.

### 7.5 Output / DB

Table `lichess_pgn_stage2` — best/our scores, CPL, EP delta, ranks, response width, gate fields, `engine_depth` default 12, full `features_json` (includes `top5_moves`, `candidate_path`, preservation check).

---

## 8. Stage 3 — Deep Stockfish

**File:** `brilliance_stage3.py`  
**JS:** `brillianceStage3Service.js` — only plies where Stage2 `proceed_to_stage3=1` **and** Stage1 `proceed_to_stage2=1` (quiet/defensive paths may still appear in Stage2 without Stage1 row — note join filters Stage1).

> Implementation note: `getStage3PasserPlies` joins Stage1 `proceed_to_stage2=1`. Quiet/defensive candidates that never had a Stage1 row are **not** selected by that SQL. Rebuilds should decide whether to pass all Stage2 passers or keep the join.

### 8.1 Engine configure

```python
engine.configure({"Threads": 1, "Hash": 256, "MultiPV": 10})
```

### 8.2 Depth curve

```python
DEPTH_CURVE = [1, 5, 10, 15, 18]
```

Position: **after** the played move. Each depth: `time_s=0.75`.

Derived:

| Field | Definition |
|-------|------------|
| `depth_evals` | white POV map `{"1": cp, … "18": cp}` |
| `depth_evals_mover` | mover POV |
| `depth_slope` | linear regression depth → mover eval |
| `early_eval_avg` | avg of first two curve points |
| `late_eval_avg` | avg of last two |
| `is_rising_curve` | early_avg < 0 **and** late_avg > 0 |
| `depth_gain` | late − early |
| `deep_eval_cp` | white score at d18 |
| `deep_eval_mover_cp` | mover at d18 |
| `is_sound` | mover d18 ≥ **−30** cp |
| `deep_eval_sound_score` | map (−200→0, −30→~7.5, +200→10): `(cp+200)/400*10` clamp 0–10 |
| `depth_eval_span_cp` | mover d1 − d18 |
| `depth_eval_span_score` | 10 if rising; else `min(10, |span|/100*10)` |
| Span “acceptable” | rising **or** `|span| ≥ 100` — **telemetry only, not a hard gate** |

### 8.3 Ranking searches (position **before** move)

| Search | Depth | Time | MultiPV | Output |
|--------|------:|-----:|--------:|--------|
| Shallow rank | 8 | 1.5s | **10** | `rank_at_depth8` (99 if not found) |
| Deep rank | 18 | 1.5s | **5** | `rank_at_depth22` (**legacy name**; depth is 18) |

```
rank_jump = rank_d8 − rank_d18
is_non_obvious = (rank_d8 ≥ 5) and (rank_d18 ≤ 2)
```

### 8.4 Opponent defenses (position **after** move)

| Depth | Time | MultiPV | Rule |
|------:|-----:|--------:|------|
| 18 | 1.5s | 8 | `good_defenses` = lines within **100 cp** of opp best |

```
defense_difficulty = 1 − good_defenses / max(1, len(opp_results))
```

### 8.5 Near-best deep + counterfactual

- `cpl_deep` from MultiPV-5 best vs **played move’s after-position d18 white score** (via `cpl_from_white_scores`)
- `is_near_best_deep = cpl_deep ≤ 50`
- If best alt ≠ played: push alt, analyse d18 → `counterfactual_delta = played_mover − alt_mover`

### 8.6 Non-obvious score (0–~10)

```
(1 if rising else 0)*3
+ min(depth_gain, 500)/500 * 3
+ min(max(rank_jump, 0), 8)/8 * 2
+ (1 if is_non_obvious else 0)*2
```

### 8.7 Stage 3 hard gate

**Only** hard gate to Stage 4:

```
proceed_to_stage4 ⇔ is_near_best_deep  (cpl_deep ≤ 50)
```

Else: `speculative_sacrifice`, reason `cpl_deep_too_high`.

Soundness and depth-span feed **Stage 4 scores**, not this gate.

### 8.8 Output / DB

Table `lichess_pgn_stage3` — deep eval, curve stats, ranks, defense, `proceed_to_stage4`, `depth_evals_json`, `eval_perspective='white'`.  
Schema default `engine_depth=25` is **stale**; runtime writes **18**.

---

## 9. Stage 4 — Human perception / BRILLIANT

**Engine:** none  
**File:** `brilliance_stage4.py`  
**JS builds inputs:** `brillianceStage4Service.js` → `buildStage4Inputs` from Stage 0–3 DB rows where `proceed_to_stage4=1`.

### 9.1 Stage 4 input object (per move)

| Field | Source |
|-------|--------|
| `ply_index`, `san_move`, `turn` | Stage 3 |
| `uci_move`, `fen_before` | Stage 0 features |
| `player_rating` | PGN WhiteElo/BlackElo by turn, default **1500** |
| `sac_type`, sacrificed/moving piece, mode | Stage 1 / Stage 3 |
| `ev_score`, `multiplexing_score`, `king_safety_delta`, `game_phase`, check/capture | Stage 0 |
| `quiet_score`, `material_deficit` | Stage 0 |
| `is_defensive` | deficit>150 **or** material_balance_before < −150 |
| `pre_move_eval_mover_cp` | Stage 2 engine |
| `good_moves_top5` | Stage 2 `n_reasonable_moves` |
| `legal_moves` | Stage 2 `n_legal` |
| `rank_at_depth8`, `non_obvious_score`, `defense_difficulty` | Stage 3 |
| `deep_eval_*`, span/sound scores, rising | Stage 3 |

### 9.2 Surprise score (0–10)

Rating factors:

| Rating | Factor |
|--------|-------:|
| <1100 | 0.4 |
| <1500 | 0.3 |
| <1900 | 0.2 |
| <2300 | 0.1 |
| <2700 | 0.05 |
| ≥2700 | 0.01 |

```
good_ratio = clamp(good_moves_top5,0..5) / 5
rank_ratio = (rank_d8 − 1) / (legal − 1)   # clamped 0..1; rank 99 → legal
engine_term = good_ratio * rank_ratio * rating_factor
ev_term = 0.15 * ev_score
surprise_unit = max(0, 1 − (engine_term + ev_term))
surprise_score = min(10, surprise_unit * 10)
brilliant_for_rating = surprise > 6.0
info_surprise_bits = −log2(max(0.001, 1 − surprise/10))
```

### 9.3 Practical brilliance

| Condition | Category | `pb_score` |
|-----------|----------|------------|
| `sound_score ≥ 7.5` | `objective_brilliant` | `(sound/10) * defense_difficulty * 10` |
| Tal zone: −200 ≤ deep_mover < −30 **and** defense > 0.7 | `practical_brilliant` | `defense*(min(tm,20)/20)*7` |
| else | `speculative_sacrifice` | `defense*(min(tm,20)/20)*3` |

### 9.4 Defensive brilliance (optional board probe)

If `is_defensive` and FEN+UCI present: perpetual / stalemate trap / fortress scoring.  
`is_defensive_brilliant` if `defensive_score ≥ 6`.

### 9.5 Final weighted brilliance score

| Component | Weight in sum |
|-----------|--------------:|
| `non_obvious_score` | × 0.27 |
| `surprise_score` | × 0.23 |
| `pb_score` | × 0.18 |
| `defense_difficulty * 10` | × 0.10 |
| `multiplexing_score` | × 0.08 |
| `deep_eval_sound_score` | × 0.06 |
| `depth_eval_span_score` | × 0.04 |
| `ev_score` | × 0.04 |

Bonuses:

- Quiet: if `quiet_score > 2` → `+(quiet/10)*2`
- Defensive: `+ min(deficit,500)/500 * 2`; if defensive_score≥6 → `+ defensive_score*0.15`

### 9.6 Classifications

```
sound_enough = deep_eval_sound_score ≥ 7.5

if brilliance ≥ 6.5 AND sound_enough → "BRILLIANT"
elif brilliance ≥ 5.0 OR defensive_score ≥ 6.0 → "practical_brilliant"
elif brilliance ≥ 3.5 → "great_sacrifice"
else → "good_sacrifice"

is_brilliant ⇔ classification == "BRILLIANT"
```

### 9.7 Archetypes

`quiet_masterstroke`, `endgame_revelation`, `defensive_brilliance`, `thunderbolt`, `strategic_masterstroke`, `ignition`, `endgame_coup`, `masterstroke`, plus defensive `perpetual_save` / `stalemate_brilliance` / `defensive_fortress`.

### 9.8 Output / DB

Table `lichess_pgn_stage4` — surprise, pb, archetype, brilliance_score, classification, `is_brilliant`, full JSON.

---

## 10. Parallel path: CPL game review

**Not part of brilliance.** Used by game viewer / Test Page.

| Piece | Location |
|-------|----------|
| Engine | `backend/api/services/stockfishService.js` — persistent CLI process |
| Route | `POST /api/analyze` |
| Labels | `frontend/src/utils/moveClassification.js` |

### 10.1 UCI sequence (Node)

```
ucinewgame
isready
setoption name MultiPV value N
position fen <fen>   OR   position startpos moves <uci…>
go movetime <ms> [searchmoves …]   OR   go depth <n>
```

Parse until `bestmove`; collect `info multipv/depth/score/pv`.

### 10.2 `analyzePosition` defaults

| Job | Movetime | MultiPV |
|-----|---------:|--------:|
| Current FEN (after move) | 200 ms | 1 |
| Previous FEN (best lines) | 80 ms | requested (default 3, cap 10) |
| First-move score refine | 200 / 150 / 100 ms | 1 |

Cache: in-memory Map, max **100** keys.

### 10.3 CPL labels (pawns from best)

| Label | Δ from best (pawns) |
|-------|---------------------|
| best | ≤ 0 |
| excellent | < 0.5 |
| good | < 1.0 |
| inaccuracy | < 3.0 |
| mistake | < 5.0 |
| blunder | ≥ 5.0 |

**No book / brilliant** on this path.

### 10.4 Best-move fallback chain

`GET /api/stockfish/online`: **stockfish.online → hosted `/bestmove` → local binary**.

---

## 11. Hosted Stockfish API contract

**Base:** `https://stockfish-cbp.onrender.com`  
**Docs:** `{base}/docs`

| Endpoint | Body | Role |
|----------|------|------|
| `POST /bestmove` | `{ fen, depth? }` | Single best move + cp/mate |
| `POST /multipv` | `{ fen, depth?, multipv? }` | MultiPV lines |
| `POST /analyze` | FEN pair / analysis payload | Position analysis |
| `POST /analyze-game` | `{ pgn, movetime?, depth?, multipv? }` | Full-game timeline |

**To rebuild brilliance on hosted:** do **not** rely on `/analyze-game` alone. Brilliance needs the **exact Stage 2/3 search matrix** (multiple MultiPV depths, before/after FENs, white-POV mate=10000). Prefer:

1. Hosted endpoints that accept `{ fen, depth, multipv, movetime }` returning lines with `{ score: {type,value}, pv }`, **or**
2. A dedicated hosted “brilliance search” that implements §12.

Score conversion for hosted UCI (side-to-move) → white POV:

```
white_cp = (turn == white) ? stm_cp : -stm_cp
mate → ±10000 white
```

---

## 12. Hosted rebuild search matrix

Implement these **exact** searches per candidate ply (FEN before / after from PGN).

### Stage 2 per candidate

| ID | fen | depth | time_s | multipv | Consume |
|----|-----|------:|-------:|--------:|---------|
| S2-pre | before | 12 | 2.0 | 1 | pre_move_eval |
| S2-top5 | before | 12 | 2.0 | 5 | best, our rank/score, reasonable≤150 |
| S2-our | after | 10 | 2.0 | 1 | only if not in top5 |
| S2-opp | after | 10 | 2.0 | 8 | response_width ≤120 |
| S2-pres* | before (+ saves) | 8 | 2.0 | 1 | preservation only if already-lost heuristic |

Then apply Stage 2 gates (§7.4).

### Stage 3 per Stage-2 passer

| ID | fen | depth | time_s | multipv | Consume |
|----|-----|------:|-------:|--------:|---------|
| S3-curve | after | 1,5,10,15,18 | 0.75 each | 1 | depth curve / sound / span |
| S3-rank8 | before | 8 | 1.5 | 10 | rank_at_depth8 |
| S3-rank18 | before | 18 | 1.5 | 5 | rank_at_depth22, cpl_deep |
| S3-def | after | 18 | 1.5 | 8 | good_defenses ≤100 |
| S3-alt | after best alt | 18 | 1.5 | 1 | counterfactual |

Then gate: `cpl_deep ≤ 50` → Stage 4.

### Stage 4

Pure CPU/JSON — can stay on app server; hosted Stockfish not required.

### Recommended hosted engine options

| Option | Stage 2 | Stage 3 |
|--------|--------:|--------:|
| Threads | 1 | 1 |
| Hash | 128 | 256 |
| MultiPV max | ≥8 | ≥10 |

Use **depth + movetime** together (stop at first limit), matching `chess.engine.Limit(depth=…, time=…)`.

---

## 13. Database schema

**SQLite:** `backend/brilliance/data/chess_analysis.db` (`backend/brilliance/db/schema.sql`)

| Table | Role |
|-------|------|
| `lichess_pgn_uploads` | Upload batch |
| `lichess_pgn_games` | Clean PGN + per-stage status counters |
| `lichess_pgn_moves` | Parsed plies (SAN/UCI/FEN) |
| `lichess_pgn_stage0` … `stage4` | Stage outputs |

**Postgres (Chess.com):** `backend/database/chess_com_brilliance_schema.sql` — `chess_com_brilliance_runs` + stage tables; sync via `chessComBrillianceService.js`.

Key Stage 4 columns: `brilliance_score`, `classification`, `is_brilliant`, surprise/pb fields.

---

## 14. Caching, resume, workers

| Mechanism | Behavior |
|-----------|----------|
| Per-stage `force=false` | Return completed rows if status=`completed` |
| `force=true` | Clear from that stage onward |
| Pipeline coalesce | One in-flight promise per gameId |
| Empty S2/S3 | Mark later stages completed empty |
| Chess.com | Skip recompute if stage4 completed unless force |
| Node analyze cache | ≤100 FEN-pair keys |
| Stage 3 | Only analyze passer `ply_indices` |
| Bulk | `BRILLIANCE_CPU_WORKERS` default min(12, cpus×2); `BRILLIANCE_SF_WORKERS` default min(3, floor(cpus/2)) |
| Python process | Whole stage one-shot; no mid-ply checkpoint |

---

## 15. Edge cases

| Case | Handling |
|------|----------|
| Castling | Legal UCI `e1g1` / `e8c8` via python-chess / chess.js |
| Promotions | UCI 5th char |
| Null moves | Not analyzed |
| ply < 10 | Absolute sac block |
| Opening pawns | Suppressed unless extraordinary tactics |
| Only legal move | Forced — no Stage 2 |
| Piece already lost | Heuristic S1; engine confirm S2.0 |
| Fork escape | Not intentional sac |
| Winning capture / equal trade | Hard disqualify |
| Short / empty games | Stages complete with 0 candidates |
| Mate scores | ±10000 white POV |
| Invalid PGN | Python returns `{error}` / parse throw |
| Missing Stockfish exe | `FileNotFoundError` |
| Net SEE (e.g. Bxh6 landing en prise) | Adjusts capture SEE before sac judgment |

---

## 16. File index

### Brilliance core

| Path | Role |
|------|------|
| `backend/brilliance/brilliance_eval.py` | Eval POV, limits, CPL, EP |
| `backend/brilliance/brilliance_gates.py` | Stage 2 entry paths |
| `backend/brilliance/brilliance_stage0.py` | Board features + sac candidates |
| `backend/brilliance/brilliance_stage1.py` | Sac classification |
| `backend/brilliance/brilliance_stage2.py` | Shallow SF |
| `backend/brilliance/brilliance_stage3.py` | Deep SF |
| `backend/brilliance/brilliance_stage4.py` | BRILLIANT scoring |

### Services / glue

| Path | Role |
|------|------|
| `backend/brilliance/services/brilliancePipelineService.js` | Full cascade |
| `backend/brilliance/services/brillianceStage{0-4}Service.js` | Persist + invoke Python |
| `backend/brilliance/services/brillianceBulkService.js` | Bulk workers |
| `backend/brilliance/utils/brilliancePython.js` | Subprocess bridge |
| `backend/api/services/chessComBrillianceService.js` | Chess.com sync |
| `backend/api/services/stockfishService.js` | CPL / MultiPV Node path |
| `backend/api/routes/stockfishRoutes.js` | `/api/analyze`, online/hosted fallback |

### Schemas / FE

| Path | Role |
|------|------|
| `backend/brilliance/db/schema.sql` | Local SQLite |
| `backend/database/chess_com_brilliance_schema.sql` | Postgres |
| `frontend/src/utils/moveClassification.js` | CPL labels |
| `frontend/src/utils/playedMoveClassification.js` | Played-move wiring |
| `frontend/src/hooks/useGameAnalysis.js` | Game analysis UI |

### Tests / comparison scripts

| Path | Role |
|------|------|
| `backend/brilliance/tests/test_stage*.py` | Gate/score unit tests |
| `scripts/stockfish-comparison-test.js` | Local vs hosted |
| `scripts/stockfish-pgn-efficiency-report.js` | Timing/agreement |
| `scripts/stockfish-analyze-game-test.js` | `/analyze-game` vs local |
| `EARLY_GAME_BRILLIANCE_FIX.md` | Opening suppression design |

---

## 17. Threshold cheat-sheet

```
EARLY_GAME_PLY_CUTOFF = 10
WINNING_CAPTURE_SEE = 150
EQUAL_TRADE_SEE = -100
QUIET_DIRECT = 4.5
ALT_QUIET = 4.0
DEFENSIVE_DEFICIT = 150
DEFENSIVE_QUIET = 2.0

S2 Threads/Hash/MultiPV config = 1 / 128 / 8
S2 depth/time = 12 / 2s (top5 MultiPV=5; fallbacks d10; opp MultiPV=8)
S2 cpl fail > 300
S2 ep_delta fail < -0.15
S2 forced = ≤2 moves within 150 cpl
S2 near-best = cpl ≤ 50
S2 response_width band = 120 cp

S3 Threads/Hash/MultiPV config = 1 / 256 / 10
S3 curve = [1,5,10,15,18] @ 0.75s
S3 rank = d8 MultiPV10 @ 1.5s; d18 MultiPV5 @ 1.5s
S3 defense = d18 MultiPV8 @ 1.5s; band 100 cp
S3 sound = mover ≥ -30 cp  → sound_score ≈ 7.5
S3 span telemetry = |d1−d18| ≥ 100 unless rising
S3 hard gate = cpl_deep ≤ 50

S4 BRILLIANT = brilliance ≥ 6.5 AND sound_score ≥ 7.5
S4 practical_brilliant = brilliance ≥ 5 OR defensive_score ≥ 6
S4 great_sacrifice = brilliance ≥ 3.5
MATE_SCORE = 10000
EVAL_POV = white
DEFAULT_RATING = 1500

CPL review (separate): 0 / 0.5 / 1 / 3 / 5 pawns → best…blunder
```

---

## Appendix A — End-to-end data flow (one move)

```
PGN ply N
  → S0: board features; maybe is_sacrifice_candidate / quiet / defensive flags
  → S1: (if sac) classify; maybe proceed_to_stage2
  → Gates: quiet≥4.5 | S1 proceed | alternative | defensive
  → S2: Stockfish d12 MultiPV… → cpl/ep/forced gates → proceed_to_stage3?
  → S3: depth curve + ranks + defense → cpl_deep≤50 → proceed_to_stage4?
  → S4: surprise + practical + weights → BRILLIANT?
```

## Appendix B — What “interpreting Stockfish” means in CLIO

1. **Always convert to white POV** before storing or comparing across colors.
2. **CPL is loss vs best** for the side that moved — not raw score delta.
3. **MultiPV ranks** are by engine preference order; “not in top N” falls back to analysing the **position after** the played move.
4. **Forced** means few *engine-competitive* alternatives (≤2 within 150 cp), not “only legal move” (that is Stage 1).
5. **Sound** at Stage 3 means deep mover eval not worse than −30 cp; **BRILLIANT** additionally requires weighted human score ≥ 6.5 **and** sound_score ≥ 7.5.
6. Brilliance is a **cascade filter** — Stockfish never runs on every ply; Stages 0–1 (and quiet/defensive heuristics) shrink the candidate set first.

---

*This document is intended as an implementation blueprint. When porting to hosted Stockfish, preserve the search matrix, POV rules, and gates above; Stage 0/1/4 can remain application-side Python/JS.*
