# Early-Game Pawn Sacrifice Suppression — Research & Fix Report

**File:** `EARLY_GAME_BRILLIANCE_FIX.md`  
**Problem:** Opening pawn sacrifices (gambits) and early-game sacrifices reaching BRILLIANT classification  
**Stages affected:** Stage 0, Stage 1, Stage 4  
**No engine changes required — all fixes are board-only logic**

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Research Findings](#2-research-findings)
3. [Chess Domain Analysis](#3-chess-domain-analysis)
4. [Root Cause in Current Pipeline](#4-root-cause-in-current-pipeline)
5. [Complete Fix Set — All 7 Constraints](#5-complete-fix-set--all-7-constraints)
6. [Implementation by Stage](#6-implementation-by-stage)
7. [New Feature: Novelty Score](#7-new-feature-novelty-score)
8. [Updated Threshold Reference](#8-updated-threshold-reference)
9. [Test Cases & Expected Behavior](#9-test-cases--expected-behavior)

---

## 1. Problem Statement

In positions with fewer than **5–8 full moves played**, pawn sacrifices (gambits) are being classified as sacrifice candidates by Stage 0, surviving Stage 1 disqualifiers, and in some cases reaching Stage 4 brilliance scoring.

**Concrete examples of false brilliant moves currently possible:**

| Move | Position | Why it's WRONG |
|------|----------|----------------|
| `f4` (King's Gambit) | After 1.e4 e5, move 2 | Known gambit since 1600s, no novelty |
| `d4` (Queen's Gambit) | After 1.d4 d5, move 2 | Pseudo-gambit, not even a real sacrifice |
| `c4` (Smith-Morra) | After 1.e4 c5 2.d4 cxd4, move 3 | Pure opening theory |
| `b4` (Polish Gambit) | After 1.e4 e5, move 2 | Known gambit trap |
| Any pawn push to attacked center square | Moves 1–5 | Almost always opening theory |

**Why this violates the definition of brilliance:**
- Brilliant moves require **novelty** — a move a player at that level would not normally find
- Opening gambits are **studied theory** known by every club player
- A move cannot be "difficult to spot" if it's been played millions of times

---

## 2. Research Findings

### From Chess.com's own definition

> *"Brilliant moves only occur in competitive positions. If you've already won a lot of material and then start to sacrifice, it probably won't be classified as a brilliant combination."*

The corollary: a move cannot be brilliant if it's already known to be the "right" move from chess theory. Opening pawn sacrifices (gambits) are universally known strategies — they fail the novelty test.

### From Chess.com's review system

Chess.com explicitly marks early opening moves as **"Book"** moves — a completely separate classification that **overrides** brilliant, great, excellent, etc. A book move cannot simultaneously be brilliant.

> *"The initial moves by both players are typically marked as 'book.' They are the initial moves known as openings that occur well before the other two phases."*

### From opening book theory

Opening databases (ECO, MCO, PolyGlot) contain well-analyzed positions typically to depth 15–25 moves for main lines. Pawn sacrifices in moves 1–10 almost always appear in these databases with well-known compensation plans.

Key insight from chessprogramming.org:
> *"Chess programs stop playing from book if a position occurred less than a certain number of times before."*  
The inverse applies: if a position (with pawn sacrifice) has been played millions of times, it is definitionally NOT brilliant.

### From academic research (Zaidi & Guerzhoy 2024)

The machine learning model for brilliant move detection was trained on **post-opening positions**. Opening positions were filtered from training data precisely because:
1. Opening theory sacrifices are well-known → low surprise score
2. Early positions have less developed tactical complexity
3. Engine eval in pure openings is unreliable (most material on board, king unsafe, pieces undeveloped)

---

## 3. Chess Domain Analysis

### Why early pawn sacrifices are structurally different

```
                    GAMBIT (opening theory)
                    ┌─────────────────────────────────┐
                    │ - Known compensation plan exists │
                    │ - Published in databases         │
                    │ - Standard response is known     │
                    │ - Opponent likely prepared       │
                    │ - Move requires minimal novelty  │
                    └─────────────────────────────────┘
                                  ≠
                    TRUE SACRIFICE (brilliant candidate)
                    ┌─────────────────────────────────┐
                    │ - Non-obvious to opponent        │
                    │ - Requires original calculation  │
                    │ - Engine confirms at depth 20+   │
                    │ - Rating-relative surprise high  │
                    │ - Emerges from game complexity   │
                    └─────────────────────────────────┘
```

### The "competitive position" requirement

A position is NOT competitive enough for brilliance when:
- The position has been in every opening book for 50+ years (King's Gambit f4)
- Both sides have full material with 6+ pieces each still undeveloped
- The king is still on the original square (castling hasn't happened yet)
- The position could be played by any club player from memory

### Minimum ply thresholds across established analysis platforms

| Platform | Book move range | Effectively no brilliance before |
|----------|-----------------|----------------------------------|
| Chess.com | First 10–15 moves (typical) | Ply ~10–20 |
| Lichess | Opening book depth variable | Ply ~10+ |
| CLIO (current, broken) | No lower limit | ply 0 (!!) |
| CLIO (target) | See below | **ply 10** |

### Piece value requirements per game phase

| Phase | Min sacrifice value for brilliance consideration |
|-------|--------------------------------------------------|
| Opening (phase_mat > 5800) | ≥ Minor piece (305 cp) |
| Early middlegame (ply < 20) | ≥ Pawn + tactical bonus condition |
| Middlegame | Standard (pawn OK with conditions) |
| Endgame | Pawn sacrifice OK (passed pawn → promotion) |

---

## 4. Root Cause in Current Pipeline

### How pawn gambits enter the pipeline (the broken path)

**Stage 0 — `is_sacrifice_candidate` fires on King's Gambit f4:**

```
Position: 1.e4 e5 2.f4 (White plays f4)
─────────────────────────────────────────
is_capture      = False  (f4 is a pawn advance, not a capture)
dest_attackers  = 1      (black e5 pawn attacks f4!)
positional_risk = True   (opponent SEE of exf4 = +100 > 50)

→ is_sacrifice_candidate = True  ← Stage 0 passes f4 as sacrifice candidate
```

**Stage 1 — No disqualifier catches it:**

```
Disqualifier 1: see_value = 0 ≥ 150? No → not winning_capture
Disqualifier 2: see_value = 0 ≥ -100? (but is_capture=False) → N/A
Disqualifier 3: recapture check → N/A (no previous capture)
Disqualifier 4: LVA check → N/A (no capture)
Disqualifier 5: was piece hanging? → No

sac_type = "positional_piece_placement"
is_valid_sacrifice = True
proceed_to_stage2 = True  ← f4 proceeds to engine analysis
```

**Stage 2 — Stockfish might pass it:**

```
King's Gambit is debated at top level: Stockfish eval ~ -0.2 to -0.4
cpl_shallow ≈ 30–80 (it's not terrible)
ep_delta ≈ -0.02 to -0.06 (slightly negative but within threshold -0.15)

→ If cpl_shallow ≤ 300 AND ep_delta ≥ -0.15: proceed_to_stage3 = True
```

**Stage 4 — Could score as brilliant for a 1000-rated player:**

```
surprise_score: for 1000 Elo player, type_multiplier = 2.0 (positional_piece_placement)
               rating_factor = 0.3–0.4 (low Elo), base_non_obvious varies
               → surprise_score could reach 5–7

If brilliance_score ≥ 6.5 AND is_sound → BRILLIANT !!
```

This is the broken path. A King's Gambit pawn move on move 2 could get classified as BRILLIANT for a 1000-rated player.

---

## 5. Complete Fix Set — All 7 Constraints

### Summary

| # | Name | Stage | Type | Severity |
|---|------|-------|------|----------|
| C1 | Absolute early-game block | Stage 0 | Hard gate | 🔴 Critical |
| C2 | Opening pawn sacrifice suppression | Stage 0 | Threshold filter | 🔴 Critical |
| C3 | Gambit pattern disqualifier | Stage 1 | Disqualifier | 🔴 Critical |
| C4 | Pawn sacrifice piece minimum | Stage 1 | Threshold gate | 🟠 High |
| C5 | Novelty score (new feature) | Stage 0+4 | Scaling factor | 🟠 High |
| C6 | Stage 4 early-game discount | Stage 4 | Score scaling | 🟠 High |
| C7 | Positional_risk pawn move guard | Stage 0 | Sub-condition | 🟡 Medium |

---

## 6. Implementation by Stage

### Stage 0 — `brilliance_stage0.py`

#### C1: Absolute Early-Game Block

**No sacrifice candidates in the first 5 full moves (ply ≤ 10).**

Justification: Moves 1–5 are pure opening theory by definition. Every pawn push, piece development, and gambit in this range has been played millions of times. No move in this range can be "non-obvious" to even a 400-rated player who has studied any opening.

```python
# ─── C1: ABSOLUTE EARLY-GAME BLOCK ──────────────────────────────────────────
# No sacrifice candidates before ply 10 (full move 5).
# Opening theory covers essentially all positions at this depth.
# A King's Gambit pawn on move 2 is not brilliant — it is in every chess book.

EARLY_GAME_PLY_CUTOFF = 10  # full moves 1–5

if ply_index < EARLY_GAME_PLY_CUTOFF:
    return {
        "is_sacrifice_candidate": False,
        "proceed_to_stage1": False,
        "early_game_blocked": True,
        "early_game_reason": "opening_theory_zone",
        # ... rest of features still computed for telemetry
    }
```

#### C2: Opening Phase Pawn Sacrifice Suppression

**In the opening game phase, pawn-level sacrifices require extraordinary tactical justification.**

Justification: A pawn sacrifice in the opening is almost always a gambit. Gambits are well-known strategies with understood compensation. They require no brilliance to play — they require memorization, not calculation.

```python
# ─── C2: OPENING PHASE PAWN SACRIFICE SUPPRESSION ────────────────────────────
# In the opening (phase_material > 5800), pawn-level sacrifices (|SEE| ≤ 200)
# are suppressed UNLESS there is extraordinary tactical justification.
#
# Extraordinary justification = any of:
#   - King safety delta ≤ -100 (opponent king immediately endangered)
#   - TM score ≥ 8 (multiple simultaneous high-value threats)
#   - Direct attack on undefended opponent piece worth ≥ 305 cp
#   - Checkmate threat within 3 moves

OPENING_PHASE_THRESHOLD = 5800
PAWN_SACRIFICE_SEE_LIMIT = -200   # pawn-level material loss
OPENING_TM_BYPASS_THRESHOLD = 8
OPENING_KING_SAFETY_BYPASS = -100

is_opening_phase = (phase_material > OPENING_PHASE_THRESHOLD)
is_pawn_level_sac = (abs(see_val) <= 200 or  # capture SEE between -100 and -200
                     (not is_capture and positional_risk and
                      moving_piece.piece_type == chess.PAWN))

if is_opening_phase and is_pawn_level_sac and is_sac_candidate:
    # Check for extraordinary justification
    extraordinary = (
        opp_king_safety_delta <= OPENING_KING_SAFETY_BYPASS or
        multiplexing_score >= OPENING_TM_BYPASS_THRESHOLD
    )
    if not extraordinary:
        is_sac_candidate = False
        proceed_to_stage1 = False
        suppression_reason = "opening_pawn_sacrifice_no_extraordinary_justification"
```

#### C7: Positional Risk Pawn Move Guard

**A pawn advancing into an attacked square in the opening is not a sacrifice — it is opening play.**

```python
# ─── C7: POSITIONAL_RISK PAWN MOVE GUARD ─────────────────────────────────────
# A pawn advancing to an attacked square triggers positional_risk,
# but in the opening this is just normal center control (e4, d4, f4, c4, etc.)
# These pawns are often "offered" as gambits — but gambits are not brilliant.
#
# Additional condition: if moving piece is a PAWN and phase is opening,
# require higher opp_see threshold (opponent must profit by MORE than 100cp
# to consider this a genuine sacrifice, not just a gambit offer).

PAWN_OPENING_OPP_SEE_THRESHOLD = 150  # was 50 for all pieces; pawns need 150

if (not is_capture and moving_piece.piece_type == chess.PAWN
        and is_opening_phase):
    # Re-evaluate positional_risk with stricter threshold for pawn moves
    if best_opp_cap and board_after.is_legal(best_opp_cap):
        opp_see = see(board_after, best_opp_cap)
        positional_risk = (opp_see > PAWN_OPENING_OPP_SEE_THRESHOLD)
    # If opponent only gains 100cp (one pawn) by taking → normal gambit, not sacrifice
```

---

### Stage 1 — `brilliance_stage1.py`

#### C3: Gambit Pattern Disqualifier

**Identify and disqualify known opening gambit patterns by structural analysis.**

A gambit is structurally identified by:
- Non-capture pawn advance to a square attacked by opponent
- In opening phase (high phase material)
- Move number ≤ 15 (allowing for deeper gambits)
- No immediate king attack consequence

```python
# ─── C3: GAMBIT PATTERN DISQUALIFIER ─────────────────────────────────────────
# Applied in classify_sacrifice_type() after existing disqualifiers.
#
# A "gambit" in the opening is:
#   1. A pawn (or piece) placed on a square the opponent can profitably take
#   2. In the opening phase (lots of material still on board)
#   3. Without an immediate forced tactical payoff (check, mate threat, fork)
#
# Gambits are well-known theory → not brilliant → disqualify.

GAMBIT_MOVE_NUMBER_LIMIT = 15   # full moves; gambits can extend to move 15
GAMBIT_PHASE_THRESHOLD = 4500   # phase_material above this = opening/early middlegame

def is_gambit_pattern(board, move, color, move_number, phase_material,
                      tm_score, is_check_after, king_safety_delta):
    """
    Detect if this move is a structural gambit (known opening sacrifice pattern).
    Returns (is_gambit: bool, reason: str)
    """
    moving_piece = board.piece_at(move.from_square)
    if not moving_piece:
        return False, ""

    is_capture = board.is_capture(move)

    # Only flag non-captures (true gambit pawn pushes) or
    # pawn captures that sacrifice material for nothing immediate
    if is_capture:
        captured = board.piece_at(move.to_square)
        if not captured:
            return False, ""
        # Pawn takes piece: might be gambit if SEE very negative
        # but only in opening and without tactical compensation
        if moving_piece.piece_type != chess.PAWN:
            return False, ""  # Only pawn-based gambits

    # Must be in early game
    if move_number > GAMBIT_MOVE_NUMBER_LIMIT:
        return False, ""

    # Must be in opening/early middlegame phase
    if phase_material < GAMBIT_PHASE_THRESHOLD:
        return False, ""  # Endgame pawn sacrifices can be brilliant

    # Must be a pawn or low-value piece
    if moving_piece.piece_type not in (chess.PAWN,):
        return False, ""  # Piece sacrifices in opening CAN be brilliant (e.g. Bxf7+)

    # Disqualify if there IS an immediate tactical payoff
    # (check, direct fork, king attack → these might still be brilliant even in opening)
    if is_check_after:
        return False, ""  # A checking sacrifice in opening might be brilliant
    if tm_score >= 6:
        return False, ""  # Multiple threats created → might be brilliant
    if king_safety_delta <= -80:
        return False, ""  # Significant king danger → might be brilliant

    return True, "opening_gambit_pawn_sacrifice"

# ─── Apply in classify_sacrifice_type() ──────────────────────────────────────
is_gambit, gambit_reason = is_gambit_pattern(
    board, move, color,
    full_move_number,  # pass from pipeline context
    phase_material,    # from game_phase calculation
    tm_score,          # from Stage 0 multiplexing
    is_check_after,    # board_after.is_check()
    king_safety_delta  # from Stage 0
)
if is_gambit:
    disqualifiers.append(gambit_reason)
```

#### C4: Pawn-Only Sacrifice Minimum Piece Value Gate

**In the opening and early middlegame, pawn-only sacrifices (|SEE| ≤ 150) require explicit tactical validation.**

```python
# ─── C4: PAWN SACRIFICE MINIMUM VALUE GATE ───────────────────────────────────
# A sacrifice of only a single pawn (SEE between -100 and -200cp) in the
# opening or early middlegame is too common to be brilliant without strong
# tactical justification.
#
# Exception conditions (pawn sacrifice CAN proceed):
#   - Creates a passed pawn in endgame (game_phase == "endgame")
#   - Directly attacks opponent king (king_safety_delta ≤ -60)
#   - Creates multiple simultaneous threats (TM ≥ 6)
#   - Move number > 20 (past opening theory range)

PAWN_SAC_MIN_MOVE_NUMBER = 20
PAWN_SAC_KING_SAFETY_BYPASS = -60
PAWN_SAC_TM_BYPASS = 6

is_pawn_sacrifice = (
    abs(see_value) <= 200 and   # pawn-level material loss
    abs(see_value) >= 100        # but IS a genuine loss (not just positional)
)

if (is_pawn_sacrifice
        and game_phase in ("opening", "middlegame")
        and full_move_number <= PAWN_SAC_MIN_MOVE_NUMBER):

    # Check bypass conditions
    passes_bypass = (
        king_safety_delta <= PAWN_SAC_KING_SAFETY_BYPASS or
        tm_score >= PAWN_SAC_TM_BYPASS or
        game_phase == "endgame"
    )

    if not passes_bypass:
        disqualifiers.append("pawn_sacrifice_insufficient_justification")
```

---

### Stage 4 — `brilliance_stage4.py`

#### C5 + C6: Novelty Score and Stage 4 Early-Game Discount

**Even if a move somehow passes Stages 0–3, Stage 4 should apply a heavy discount to early-game moves and a novelty multiplier based on move number.**

```python
# ─── C5+C6: NOVELTY SCORE + EARLY-GAME DISCOUNT ─────────────────────────────
# brilliance_score is multiplied by novelty_score before final classification.
#
# novelty_score formula:
#   ply ≤ 10  (moves 1–5)   →  0.0   (no brilliant possible)
#   ply 11–20 (moves 6–10)  →  0.0 to 0.3  (early theory range, very suppressed)
#   ply 21–30 (moves 11–15) →  0.3 to 0.7  (opening/middlegame transition)
#   ply 31–40 (moves 16–20) →  0.7 to 0.9  (mostly post-theory)
#   ply > 40  (moves 20+)   →  1.0   (full brilliance eligible)
#
# Additionally:
#   - Opening game phase → extra multiplier 0.6 (regardless of ply)
#   - Pawn sacrifice type → extra multiplier 0.5 in opening phase

def compute_novelty_score(ply_index: int, game_phase: str, sac_type: str) -> float:
    """
    Returns a novelty multiplier [0.0, 1.0] that scales the brilliance score.
    0.0 = definitely opening theory = cannot be brilliant
    1.0 = clearly post-theory = full brilliance eligible
    """
    # Hard blocks: first 10 plies are always opening theory
    if ply_index <= 10:
        return 0.0

    # Linear interpolation from ply 11 to ply 40
    if ply_index <= 40:
        raw_score = (ply_index - 10) / 30.0   # 0.0 at ply 11, 1.0 at ply 41
    else:
        raw_score = 1.0

    # Phase-based discount
    if game_phase == "opening":
        raw_score *= 0.6   # Opening phase: heavy discount even if move number is OK

    # Pawn sacrifice type discount
    if sac_type in ("positional_piece_placement",) and game_phase == "opening":
        raw_score *= 0.5   # Pawn pushes in opening: halved again

    return min(1.0, max(0.0, round(raw_score, 3)))


# ─── Apply in Stage 4 final scoring ──────────────────────────────────────────
novelty_score = compute_novelty_score(ply_index, game_phase, sac_type)

# Apply novelty multiplier to raw brilliance score
brilliance_score_raw = (
    non_obvious_score * 0.30 +
    surprise_score    * 0.25 +
    pb_score          * 0.20 +
    defense_difficulty * 10 * 0.10 +
    multiplexing_score * 0.10 +
    ev_score           * 0.05
    # + quiet/defensive bonuses
)

# Apply novelty discount
brilliance_score = round(brilliance_score_raw * novelty_score, 2)

# Hard block: if novelty_score == 0.0, move CANNOT be brilliant
# (even if somehow all previous stages passed)
if novelty_score == 0.0:
    brilliance_score = 0.0
    classification = "good_sacrifice"   # or "book_sacrifice" if you add a type
    is_brilliant = False
```

---

## 7. New Feature: Novelty Score

Add `novelty_score` as a first-class Stage 0 feature and Stage 4 scaling factor.

### Formula (complete)

```
NOVELTY_SCORE(ply_index, game_phase, sac_type):

    # Step 1: Ply-based base score
    if ply_index <= 10:
        base = 0.0                           # hard block: opening theory
    elif ply_index <= 40:
        base = (ply_index - 10) / 30.0      # linear 0→1 from ply 11→41
    else:
        base = 1.0                           # fully post-theory

    # Step 2: Phase-based adjustment
    phase_mult = 1.0 if game_phase != "opening" else 0.6

    # Step 3: Pawn move type adjustment
    sac_type_mult = 0.5 if (sac_type == "positional_piece_placement"
                             and game_phase == "opening") else 1.0

    # Step 4: Final
    novelty_score = clamp(base × phase_mult × sac_type_mult, 0.0, 1.0)
```

### Novelty score table (examples)

| Move # | Phase | Sac Type | Base | Phase mult | Sac mult | Final |
|--------|-------|----------|------|------------|----------|-------|
| 2 | opening | positional (pawn) | 0.00 | 0.6 | 0.5 | **0.00** |
| 5 | opening | positional (pawn) | 0.00 | 0.6 | 0.5 | **0.00** |
| 8 | opening | real_sacrifice | 0.23 | 0.6 | 1.0 | **0.14** |
| 12 | opening | queen_sacrifice | 0.43 | 0.6 | 1.0 | **0.26** |
| 15 | middlegame | exchange_sacrifice | 0.57 | 1.0 | 1.0 | **0.57** |
| 20 | middlegame | real_sacrifice | 0.73 | 1.0 | 1.0 | **0.73** |
| 25 | middlegame | queen_sacrifice | 0.90 | 1.0 | 1.0 | **0.90** |
| 30+ | middlegame | any | 1.00 | 1.0 | 1.0 | **1.00** |
| 40+ | endgame | any | 1.00 | 1.0 | 1.0 | **1.00** |

### Key insight on Queen/Bishop sacrifices in the opening

Note that **piece sacrifices** (queen, bishop, rook) in the opening are **not suppressed** by the gambit disqualifier (C3 only applies to pawns). This is intentional:

- Bishop sacrifice on f7 (move 8): `novelty_score ≈ 0.14 × ...` — still highly discounted
- Queen sacrifice on move 3 (Scholar's Mate variant): novelty_score = 0 if ply ≤ 10
- Genuine brilliant piece sacrifice on move 12: `novelty_score ≈ 0.26` — very suppressed but not zero

This ensures even spectacular-looking early sacrifices score very low, while truly brilliant non-opening piece sacrifices retain their value.

---

## 8. Updated Threshold Reference

### Stage 0 additions

| Threshold | Value | Purpose |
|-----------|-------|---------|
| `EARLY_GAME_PLY_CUTOFF` | 10 | Hard block: no sacrifice candidates before ply 10 |
| `OPENING_PHASE_THRESHOLD` | 5800 | Phase material above this = opening |
| `PAWN_SACRIFICE_SEE_LIMIT` | −200 | Pawn-level sacrifice in opening: needs extra justification |
| `OPENING_TM_BYPASS_THRESHOLD` | 8 | TM ≥ 8 bypasses opening pawn suppression |
| `OPENING_KING_SAFETY_BYPASS` | −100 | King safety Δ ≤ −100 bypasses opening pawn suppression |
| `PAWN_OPENING_OPP_SEE_THRESHOLD` | 150 | Stricter positional_risk for pawns in opening (was 50) |

### Stage 1 additions

| Threshold | Value | Purpose |
|-----------|-------|---------|
| `GAMBIT_MOVE_NUMBER_LIMIT` | 15 | Full moves; gambit pattern check applies up to move 15 |
| `GAMBIT_PHASE_THRESHOLD` | 4500 | Phase material above this = opening/early middlegame |
| `PAWN_SAC_MIN_MOVE_NUMBER` | 20 | Pawn sacrifices before move 20 need tactical bypass |
| `PAWN_SAC_KING_SAFETY_BYPASS` | −60 | King safety Δ ≤ −60 bypasses pawn sac restriction |
| `PAWN_SAC_TM_BYPASS` | 6 | TM ≥ 6 bypasses pawn sac restriction |

### Stage 4 additions

| Threshold | Value | Purpose |
|-----------|-------|---------|
| `NOVELTY_PLY_HARD_BLOCK` | 10 | novelty_score = 0 for ply ≤ 10 |
| `NOVELTY_PLY_FULL` | 40 | novelty_score = 1.0 for ply ≥ 40 (post-theory) |
| `NOVELTY_OPENING_PHASE_MULT` | 0.6 | Discount for opening phase |
| `NOVELTY_PAWN_TYPE_MULT` | 0.5 | Extra discount for pawn placements in opening |

---

## 9. Test Cases & Expected Behavior

### Cases that should be BLOCKED (currently passing incorrectly)

| Game | Move | Ply | Expected after fix |
|------|------|-----|-------------------|
| `1.e4 e5 2.f4` | f4 | 3 | Blocked at C1 (ply ≤ 10) |
| `1.d4 d5 2.c4` | c4 | 3 | Blocked at C1 (ply ≤ 10) |
| `1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 4.Ng5` | Ng5 | 7 | Blocked at C1 (ply ≤ 10) if ply < 10, else C3 gambit check |
| `1.e4 c5 2.d4 cxd4 3.c3` | c3 | 5 | Blocked at C1 (ply ≤ 10) |
| Any pawn gambit before move 5 | any | ≤ 10 | Hard blocked by C1 |
| Pawn sac on move 8, no king attack | any pawn | 16 | Blocked by C3/C4 |

### Cases that should PASS (currently correct, must remain correct)

| Game | Move | Ply | Expected after fix |
|------|------|-----|-------------------|
| Bxf7+ on move 8 with 2 dest_attackers | Bxf7+ | 15 | Allowed (bishop, not pawn; C3 doesn't apply; novelty_score~0.14 reduces score but doesn't block) |
| Queen sacrifice on move 15 | Qxf7 | 29 | Allowed (novelty_score~0.57; standard gates apply) |
| Rook sac on move 20 | Rxh6+ | 39 | Allowed (novelty_score~0.97; full evaluation) |
| Any sacrifice move > 20 | any | > 40 | Fully allowed (novelty_score = 1.0) |
| Pawn sac on move 12 that gives check | Pawn+check | 23 | Allowed (C3 bypass: is_check_after = True) |
| Pawn sac on move 10 with TM ≥ 8 | Pawn | 19 | Allowed (C4 bypass: TM ≥ 6) |

### Endgame pawn sacrifice — must NOT be blocked

```
Special case: Endgame pawn sacrifice for promotion/zugzwang
  game_phase = "endgame"
  sac_type = "real_sacrifice" or "positional_piece_placement"
  
→ C2: phase_material < 5800 → no opening suppression ✓
→ C3: phase_material < 4500 → gambit check doesn't apply ✓  
→ C4: game_phase == "endgame" → bypass condition met ✓
→ C5: phase_mult = 1.0 → no phase discount ✓
→ Endgame pawn sacrifices are correctly allowed
```

---

## Files to Change

| File | Section | Change |
|------|---------|--------|
| `brilliance_stage0.py` | `is_sacrifice_candidate()` | Add C1 (hard block ply ≤ 10) |
| `brilliance_stage0.py` | `is_sacrifice_candidate()` | Add C2 (opening pawn suppression) |
| `brilliance_stage0.py` | `is_sacrifice_candidate()` | Add C7 (stricter positional_risk for pawns) |
| `brilliance_stage0.py` | Output schema | Add `novelty_score`, `early_game_blocked`, fields |
| `brilliance_stage1.py` | `classify_sacrifice_type()` | Add C3 (gambit pattern disqualifier) |
| `brilliance_stage1.py` | `classify_sacrifice_type()` | Add C4 (pawn sac minimum value gate) |
| `brilliance_stage4.py` | Final scoring | Add C5+C6 (novelty multiplier + discount) |
| `brilliance_stage4.py` | Output schema | Add `novelty_score`, `novelty_discounted` fields |

### No changes needed in

- `brilliance_stage2.py` — Stage 2 CPL gates correctly reject bad gambits anyway
- `brilliance_stage3.py` — Stage 3 soundness gates correctly reject unsound gambits
- `brilliance_eval.py` — Eval helpers unchanged
- `brilliance_gates.py` — Alternative paths unchanged (quiet, defensive still work)

---

## Summary: The Two-Layer Defence

The fix operates at two levels:

```
LAYER 1 — Hard Structural Blocks (Stages 0 & 1)
    ├── C1: ply ≤ 10 → never a candidate (absolute block)
    ├── C2: opening phase + pawn + no tactical justification → blocked
    ├── C3: gambit pattern (move ≤ 15, opening, pawn, no tactical bypass) → disqualified  
    └── C4: pawn sac before move 20 without king attack/TM ≥ 6 → disqualified

LAYER 2 — Soft Scoring Discount (Stage 4)
    ├── C5: novelty_score multiplier [0.0–1.0] based on ply + phase + type
    └── C6: brilliance_score × novelty_score → naturally suppresses early moves
             even if they somehow slipped through Stages 0–3
```

If a move somehow passes all Stage 0–3 gates (e.g., a spectacular piece sacrifice on move 8 that creates a forced win), Layer 2 ensures the final `brilliance_score` is heavily discounted. It could only reach BRILLIANT (≥ 6.5) if the underlying raw score is very high (≥ 6.5 / 0.14 ≈ 46.4 for a piece sac on move 8) — which would only happen for a genuinely extraordinary novelty, not a standard gambit.

---

*Compiled from: Chess.com documentation, opening book theory, Zaidi & Guerzhoy (2024) academic research, and domain analysis of the CLIO pipeline.*
