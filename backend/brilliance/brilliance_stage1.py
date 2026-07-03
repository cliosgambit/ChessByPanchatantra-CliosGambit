"""
Brilliance Engine — Stage 1 sacrifice classification.
Runs only on Stage 0 sacrifice candidates. No engine (Stockfish enters at Stage 2).

Philosophy: filter only obvious nonsense; let Stages 2–3 decide brilliance.
"""
import io
import json
import sys

import chess
import chess.pgn

from brilliance_stage0 import (
    PIECE_NAMES,
    PIECE_VALUES,
    analyze_piece_vulnerability,
    expectation_violation,
    game_phase,
    is_sacrifice_candidate,
    king_safety,
    phase_material,
    piece_harmony,
    quiet_brilliant_detector,
    effective_capture_see,
    see,
    tactical_multiplexing,
)

HARD_DISQUALIFIERS = frozenset({
    "winning_capture_not_sacrifice",
    "opening_gambit_pawn_sacrifice",
    "pawn_sacrifice_insufficient_justification",
})
SACRIFICE_UNCERTAINTY_CAP = 25.0

# Gambit / early pawn sacrifice gates (see EARLY_GAME_BRILLIANCE_FIX.md)
GAMBIT_MOVE_NUMBER_LIMIT = 15
GAMBIT_PHASE_THRESHOLD = 4500
PAWN_SAC_MIN_MOVE_NUMBER = 20
PAWN_SAC_KING_SAFETY_BYPASS = -60
PAWN_SAC_TM_BYPASS = 6


def _variance(values):
    if len(values) <= 1:
        return 0.0
    mean = sum(values) / len(values)
    return sum((x - mean) ** 2 for x in values) / len(values)


def _sacrifice_uncertainty(scenarios):
    if len(scenarios) <= 1:
        return 0.0
    normalized = [x / 100.0 for x in scenarios]
    return round(min(_variance(normalized), SACRIFICE_UNCERTAINTY_CAP), 2)


def is_recapture(board, move):
    """Previous move landed on the same square this capture targets (telemetry only)."""
    if not board.is_capture(move) or not board.move_stack:
        return False
    last_move = board.peek()
    return last_move.to_square == move.to_square


def _move_context(board, move, color):
    board_after = board.copy()
    board_after.push(move)
    tm = tactical_multiplexing(board, board_after, color)
    harmony = piece_harmony(board, board_after, color)
    quiet = quiet_brilliant_detector(board, move, color)
    ev = expectation_violation(board, move, color)
    ks_before = king_safety(board, not color)
    ks_after = king_safety(board_after, not color)
    return {
        "multiplexing_score": tm["multiplexing_score"],
        "harmony_score": harmony["harmony_score"],
        "quiet_score": quiet["quiet_score"],
        "ev_score": ev["ev_score"],
        "opp_king_safety_delta": ks_after["total_safety"] - ks_before["total_safety"],
        "move_gives_check": board_after.is_check(),
    }


def compute_dynamic_score(ctx):
    king_pressure = max(0.0, -ctx["opp_king_safety_delta"])
    return (
        king_pressure * 0.4
        + ctx["multiplexing_score"] * 0.8
        + ctx["quiet_score"] * 0.5
        + ctx["harmony_score"] * 0.3
    )


def tactical_bypass(ctx):
    return (
        ctx["move_gives_check"]
        or ctx["multiplexing_score"] >= 6
        or ctx["opp_king_safety_delta"] <= -60
    )


def _infer_sac_type(board, move, color, see_value, is_pseudo, cap_val, if_val, moving_piece, stage0=None):
    """Classify sacrifice from intentionally abandoned piece (Stage 0), not the mover."""
    classification = _classify_sacrifice_from_stage0(
        board, move, see_value, is_pseudo, moving_piece, stage0
    )
    if classification:
        return classification

    if moving_piece and moving_piece.piece_type == chess.QUEEN:
        return _build_sacrifice_classification(
            sac_type="queen_sacrifice",
            moving_piece_type=_piece_type_name(moving_piece),
            sacrificed_piece_type=_piece_type_name(moving_piece),
            sacrificed_piece_square=chess.square_name(move.to_square) if moving_piece else None,
            sacrifice_mode="direct",
        )
    if moving_piece and moving_piece.piece_type == chess.ROOK and cap_val < 400:
        return _build_sacrifice_classification(
            sac_type="exchange_sacrifice",
            moving_piece_type=_piece_type_name(moving_piece),
            sacrificed_piece_type=_piece_type_name(moving_piece),
            sacrificed_piece_square=chess.square_name(move.to_square),
            sacrifice_mode="direct",
        )
    if not board.is_capture(move):
        return _build_sacrifice_classification(
            sac_type="positional_piece_placement",
            moving_piece_type=_piece_type_name(moving_piece),
            sacrificed_piece_type=None,
            sacrificed_piece_square=None,
            sacrifice_mode="positional",
        )
    if see_value < -300:
        sac_type = "real_sacrifice"
    elif is_pseudo:
        sac_type = "pseudo_sacrifice"
    else:
        sac_type = "tactical_sacrifice"
    return _build_sacrifice_classification(
        sac_type=sac_type,
        moving_piece_type=_piece_type_name(moving_piece),
        sacrificed_piece_type=_piece_type_name(moving_piece),
        sacrificed_piece_square=chess.square_name(move.to_square) if board.is_capture(move) else None,
        sacrifice_mode="direct",
    )


def _piece_type_name(piece):
    if not piece:
        return None
    return PIECE_NAMES.get(piece.piece_type)


def _build_sacrifice_classification(
    sac_type,
    moving_piece_type,
    sacrificed_piece_type,
    sacrificed_piece_square,
    sacrifice_mode,
):
    return {
        "sac_type": sac_type,
        "moving_piece_type": moving_piece_type,
        "sacrificed_piece_type": sacrificed_piece_type,
        "sacrificed_piece_square": sacrificed_piece_square,
        "sacrifice_mode": sacrifice_mode,
    }


def _resolve_sacrificed_asset(stage0, move, moving_piece):
    """Return abandoned piece metadata from Stage 0 when distinct from the mover."""
    if not stage0:
        return None

    sacrificed_type = (
        stage0.get("newly_exposed_piece_type")
        or stage0.get("exposed_piece_type")
        or stage0.get("newly_exposed_piece")
    )
    sacrificed_square = (
        stage0.get("newly_exposed_piece_square")
        or stage0.get("exposed_piece_square")
    )
    if not sacrificed_type or not sacrificed_square:
        return None

    intentional = (
        stage0.get("hanging_sacrifice")
        or stage0.get("defender_removal_sacrifice")
        or stage0.get("indirect_sacrifice_candidate")
        or stage0.get("newly_exposed_sacrifice")
    )
    if not intentional:
        return None

    moving_square = chess.square_name(move.from_square)
    moving_type = _piece_type_name(moving_piece)
    if sacrificed_square == moving_square and sacrificed_type == moving_type:
        return None

    return {
        "sacrificed_piece_type": sacrificed_type,
        "sacrificed_piece_square": sacrificed_square,
    }


def _infer_sacrifice_mode(stage0, moving_piece_type, sacrificed_piece_type):
    if not sacrificed_piece_type:
        return None
    if moving_piece_type and moving_piece_type == sacrificed_piece_type:
        return "direct"
    if stage0 and stage0.get("defender_removal_sacrifice"):
        return "indirect"
    if stage0 and stage0.get("indirect_sacrifice_candidate"):
        return "indirect"
    if stage0 and stage0.get("positional_risk") and not stage0.get("is_capture"):
        return "positional"
    if stage0 and stage0.get("newly_exposed_sacrifice"):
        return "indirect"
    return "temporary"


def _sac_type_from_piece_name(piece_type_name, see_value, is_pseudo, is_capture):
    if piece_type_name == "queen":
        return "queen_sacrifice"
    if piece_type_name == "rook":
        return "exchange_sacrifice"
    if piece_type_name in ("knight", "bishop"):
        return "tactical_sacrifice"
    if piece_type_name == "pawn":
        if see_value < -300:
            return "real_sacrifice"
        return "tactical_sacrifice"
    if not is_capture:
        return "positional_piece_placement"
    if see_value < -300:
        return "real_sacrifice"
    if is_pseudo:
        return "pseudo_sacrifice"
    return "tactical_sacrifice"


def _classify_sacrifice_from_stage0(board, move, see_value, is_pseudo, moving_piece, stage0):
    asset = _resolve_sacrificed_asset(stage0, move, moving_piece)
    if not asset:
        return None

    moving_type = _piece_type_name(moving_piece)
    sacrificed_type = asset["sacrificed_piece_type"]
    sacrifice_mode = _infer_sacrifice_mode(stage0, moving_type, sacrificed_type)
    sac_type = _sac_type_from_piece_name(
        sacrificed_type,
        see_value,
        is_pseudo,
        board.is_capture(move),
    )

    return _build_sacrifice_classification(
        sac_type=sac_type,
        moving_piece_type=moving_type,
        sacrificed_piece_type=sacrificed_type,
        sacrificed_piece_square=asset["sacrificed_piece_square"],
        sacrifice_mode=sacrifice_mode,
    )


def _full_move_number(ply_index):
    if ply_index is None:
        return 99
    return (ply_index // 2) + 1


def is_gambit_pattern(
    board,
    move,
    full_move_number,
    phase_mat,
    tm_score,
    is_check_after,
    king_safety_delta,
):
    """
    C3: structural opening gambit — pawn offer without immediate tactical payoff.
    """
    moving_piece = board.piece_at(move.from_square)
    if not moving_piece:
        return False, ""

    is_capture = board.is_capture(move)

    if is_capture:
        captured = board.piece_at(move.to_square)
        if not captured or moving_piece.piece_type != chess.PAWN:
            return False, ""

    if full_move_number > GAMBIT_MOVE_NUMBER_LIMIT:
        return False, ""

    if phase_mat < GAMBIT_PHASE_THRESHOLD:
        return False, ""

    if moving_piece.piece_type != chess.PAWN:
        return False, ""

    if is_check_after:
        return False, ""
    if (tm_score or 0) >= 6:
        return False, ""
    if (king_safety_delta or 0) <= -80:
        return False, ""

    return True, "opening_gambit_pawn_sacrifice"


def classify_sacrifice_type(
    board,
    move,
    color,
    see_value=0,
    ply_index=None,
    game_phase_val=None,
    phase_mat=None,
    ctx=None,
    stage0=None,
):
    to_sq = move.to_square
    from_sq = move.from_square
    moving_piece = board.piece_at(from_sq)
    captured = board.piece_at(to_sq)

    if board.is_capture(move) and stage0:
        see_value = effective_capture_see(stage0)

    if_val = PIECE_VALUES.get(moving_piece.piece_type, 0) if moving_piece else 0
    cap_val = PIECE_VALUES.get(captured.piece_type, 0) if captured else 0

    board_after = board.copy()
    board_after.push(move)
    recaptures = [m for m in board_after.legal_moves if m.to_square == to_sq]
    is_pseudo = (
        len(recaptures) > 0
        and cap_val > 0
        and cap_val >= if_val * 0.8
    )

    sac_classification = _infer_sac_type(
        board, move, color, see_value, is_pseudo, cap_val, if_val, moving_piece, stage0=stage0
    )
    sac_type = sac_classification["sac_type"]
    is_exchange_sac = sac_type == "exchange_sacrifice"

    disqualifiers = []

    if board.is_capture(move):
        if see_value >= 150:
            disqualifiers.append("winning_capture_not_sacrifice")
        elif see_value >= -100 and not is_exchange_sac:
            disqualifiers.append("equal_trade_not_sacrifice")

    if board.is_capture(move) and captured:
        our_attackers = [
            m
            for m in board.generate_pseudo_legal_moves()
            if m.to_square == to_sq
            and board.piece_at(m.from_square)
            and board.piece_at(m.from_square).color == color
            and board.is_legal(m)
        ]
        if our_attackers:
            lva_m = min(
                our_attackers,
                key=lambda m: PIECE_VALUES.get(
                    board.piece_at(m.from_square).piece_type, 0
                ),
            )
            lva_see = see(board, lva_m)
            lva_piece_val = PIECE_VALUES.get(
                board.piece_at(lva_m.from_square).piece_type, 0
            )
            if lva_see > 0 and if_val == lva_piece_val and not is_exchange_sac:
                disqualifiers.append("cheapest_attacker_wins_material")

    vuln = analyze_piece_vulnerability(board, from_sq, color)
    if vuln["already_lost_before_move"]:
        disqualifiers.append(
            vuln.get("disqualify_reason") or "piece_already_lost_before_move"
        )

    ctx = ctx or {}
    full_move_number = _full_move_number(ply_index)
    phase_mat = phase_mat if phase_mat is not None else phase_material(board)
    game_phase_val = game_phase_val or game_phase(board)

    is_gambit, gambit_reason = is_gambit_pattern(
        board,
        move,
        full_move_number,
        phase_mat,
        ctx.get("multiplexing_score"),
        ctx.get("move_gives_check"),
        ctx.get("opp_king_safety_delta"),
    )
    if is_gambit:
        disqualifiers.append(gambit_reason)

    # C4: pawn-only sacrifice minimum value gate (early game)
    is_pawn_sacrifice = 100 <= abs(see_value) <= 200
    if (
        is_pawn_sacrifice
        and game_phase_val in ("opening", "middlegame")
        and full_move_number <= PAWN_SAC_MIN_MOVE_NUMBER
    ):
        passes_bypass = (
            (ctx.get("opp_king_safety_delta") or 0) <= PAWN_SAC_KING_SAFETY_BYPASS
            or (ctx.get("multiplexing_score") or 0) >= PAWN_SAC_TM_BYPASS
            or game_phase_val == "endgame"
        )
        if not passes_bypass:
            disqualifiers.append("pawn_sacrifice_insufficient_justification")

    scenarios = [see_value if board.is_capture(move) else cap_val - if_val]
    for rc in recaptures[:5]:
        b2 = board_after.copy()
        b2.push(rc)
        p_left = b2.piece_at(to_sq)
        val_diff = PIECE_VALUES.get(p_left.piece_type, 0) - if_val if p_left else -if_val
        scenarios.append(val_diff)

    return {
        **sac_classification,
        "disqualifiers": disqualifiers,
        "is_valid_sacrifice": len(disqualifiers) == 0,
        "is_pseudo": is_pseudo,
        "is_recapture": is_recapture(board, move),
        "material_loss_cp": see_value if board.is_capture(move) else 0,
        "sacrifice_uncertainty": _sacrifice_uncertainty(scenarios),
        "recapture_options": len(recaptures),
        "piece_vulnerability": vuln,
    }


def is_forced_move(board, move):
    total_legal = list(board.legal_moves)
    n_moves = len(total_legal)

    if n_moves == 1:
        return {"is_forced": True, "reason": "only_legal_move", "n_legal": n_moves}

    return {"is_forced": False, "reason": None, "n_legal": n_moves}


def _should_proceed_to_stage2(stage0, sac_class, forced, ctx):
    if forced["is_forced"]:
        return False, "only_legal_move"

    disqualifiers = sac_class.get("disqualifiers") or []
    if HARD_DISQUALIFIERS.intersection(disqualifiers):
        return False, disqualifiers[0]

    if sac_class.get("is_valid_sacrifice"):
        return True, None

    see_value = effective_capture_see(stage0)
    sac_type = sac_class.get("sac_type")
    dynamic = compute_dynamic_score(ctx)
    tactical = tactical_bypass(ctx)
    exchange_override = sac_type == "exchange_sacrifice" and see_value <= -50

    if tactical or dynamic >= 6 or exchange_override:
        if "piece_already_lost_before_move" in disqualifiers and not tactical:
            return False, disqualifiers[0]
        reason = "tactical_bypass" if tactical else (
            "dynamic_compensation_override" if dynamic >= 6 else "exchange_sacrifice_override"
        )
        return True, reason

    if disqualifiers:
        return False, disqualifiers[0]

    return True, None


def analyze_stage1_move(board, move, ply_index):
    color = board.turn
    stage0 = is_sacrifice_candidate(board, move, color, ply_index=ply_index)

    if not stage0["is_sacrifice_candidate"]:
        return None

    ctx = _move_context(board, move, color)
    sac_class = classify_sacrifice_type(
        board,
        move,
        color,
        see_value=effective_capture_see(stage0),
        ply_index=ply_index,
        game_phase_val=game_phase(board),
        phase_mat=phase_material(board),
        ctx=ctx,
        stage0=stage0,
    )
    forced = is_forced_move(board, move)

    proceed_to_stage2, override_reason = _should_proceed_to_stage2(
        stage0, sac_class, forced, ctx
    )

    gate_fail_reason = None
    if not proceed_to_stage2:
        gate_fail_reason = override_reason or forced.get("reason")

    return {
        "ply_index": ply_index,
        "san_move": board.san(move),
        "uci_move": move.uci(),
        "turn": "white" if color == chess.WHITE else "black",
        "stage0": stage0,
        "sacrifice_class": sac_class,
        "forced": forced,
        "is_valid_sacrifice": sac_class["is_valid_sacrifice"],
        "is_forced": forced["is_forced"],
        "proceed_to_stage2": proceed_to_stage2,
        "gate_fail_reason": gate_fail_reason,
        "stage1_context": ctx,
        "dynamic_score": round(compute_dynamic_score(ctx), 2),
        "tactical_bypass": tactical_bypass(ctx),
        "proceed_override_reason": override_reason if proceed_to_stage2 and not sac_class["is_valid_sacrifice"] else None,
        "engine_used": False,
    }


def analyze_pgn_stage1(pgn_text):
    game = chess.pgn.read_game(io.StringIO(pgn_text))
    if game is None:
        raise ValueError("Could not parse PGN")

    board = game.board()
    candidates = []

    for ply_index, move in enumerate(game.mainline_moves()):
        result = analyze_stage1_move(board, move, ply_index)
        if result:
            candidates.append(result)
        board.push(move)

    valid_count = sum(1 for c in candidates if c["is_valid_sacrifice"])
    proceed_count = sum(1 for c in candidates if c["proceed_to_stage2"])
    forced_count = sum(1 for c in candidates if c["is_forced"])

    return {
        "engine_used": False,
        "candidate_count": len(candidates),
        "valid_sacrifice_count": valid_count,
        "proceed_to_stage2_count": proceed_count,
        "forced_move_count": forced_count,
        "disqualified_count": len(candidates) - valid_count,
        "moves": candidates,
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "input_json is required"}))
        return 1

    try:
        payload = json.loads(sys.argv[1])
    except Exception as e:
        print(json.dumps({"error": f"Invalid JSON: {e}"}))
        return 1

    pgn = payload.get("pgn") or payload.get("clean_pgn")
    if not pgn:
        print(json.dumps({"error": "pgn is required"}))
        return 1

    try:
        result = analyze_pgn_stage1(pgn)
        print(json.dumps(result))
        return 0
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
