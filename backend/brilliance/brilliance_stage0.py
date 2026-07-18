"""
Brilliance Engine — Stage 0 board-only feature extraction.
Runs on every move with zero engine calls (python-chess only).
"""
import io
import json
import sys

import chess
import chess.pgn

PIECE_VALUES = {
    chess.PAWN: 100,
    chess.KNIGHT: 305,
    chess.BISHOP: 333,
    chess.ROOK: 563,
    chess.QUEEN: 950,
    chess.KING: 0,
}

PIECE_NAMES = {
    chess.PAWN: "pawn",
    chess.KNIGHT: "knight",
    chess.BISHOP: "bishop",
    chess.ROOK: "rook",
    chess.QUEEN: "queen",
    chess.KING: "king",
}


def material_count(board, color):
    return sum(
        PIECE_VALUES[pt] * len(board.pieces(pt, color))
        for pt in PIECE_VALUES
        if pt != chess.KING
    )


def material_balance(board, color):
    return material_count(board, color) - material_count(board, not color)


def game_phase(board):
    total = sum(
        PIECE_VALUES.get(pt, 0) * len(board.pieces(pt, c))
        for pt in [chess.QUEEN, chess.ROOK, chess.BISHOP, chess.KNIGHT]
        for c in [chess.WHITE, chess.BLACK]
    )
    if total > 5800:
        return "opening"
    if total > 2800:
        return "middlegame"
    return "endgame"


def game_phase_code(phase):
    return {"opening": 0, "middlegame": 1, "endgame": 2}.get(phase, 1)


def phase_material(board):
    """Total non-pawn piece material on board (same basis as game_phase)."""
    return sum(
        PIECE_VALUES.get(pt, 0) * len(board.pieces(pt, c))
        for pt in [chess.QUEEN, chess.ROOK, chess.BISHOP, chess.KNIGHT]
        for c in [chess.WHITE, chess.BLACK]
    )


def compute_novelty_score(ply_index, game_phase, sac_type=None):
    """
    Novelty multiplier [0.0, 1.0] — opening theory telemetry (Stage 0 only).
    No longer applied to Stage 4 final score.
    """
    ply = ply_index if ply_index is not None else 999

    if ply <= 10:
        raw_score = 0.0
    elif ply <= 40:
        raw_score = (ply - 10) / 30.0
    else:
        raw_score = 1.0

    if game_phase == "opening":
        raw_score *= 0.6

    if sac_type == "positional_piece_placement" and game_phase == "opening":
        raw_score *= 0.5

    return min(1.0, max(0.0, round(raw_score, 3)))


def _infer_novelty_sac_type(board, move, see_val, moving_piece):
    """Rough sacrifice type for novelty scoring before Stage 1 classification."""
    if not moving_piece:
        return "unknown"
    if moving_piece.piece_type == chess.QUEEN:
        return "queen_sacrifice"
    if moving_piece.piece_type == chess.ROOK:
        return "exchange_sacrifice"
    if not board.is_capture(move):
        return "positional_piece_placement"
    if see_val < -300:
        return "real_sacrifice"
    return "tactical_sacrifice"


def see(board, move):
    to_sq = move.to_square
    from_sq = move.from_square
    captured = board.piece_at(to_sq)
    moving_piece = board.piece_at(from_sq)

    if captured is None or moving_piece is None:
        return 0

    gain = [PIECE_VALUES.get(captured.piece_type, 0)]
    b = board.copy()
    b.push(move)

    def lva(b2, sq, color):
        min_val, best_m = float("inf"), None
        for m in b2.legal_moves:
            if m.to_square == sq:
                p = b2.piece_at(m.from_square)
                if p and p.color == color:
                    v = PIECE_VALUES.get(p.piece_type, 0)
                    if v < min_val:
                        min_val, best_m = v, m
        return best_m, min_val

    depth = 0
    while depth < 8:
        opp_color = b.turn
        m, _attacker_val = lva(b, to_sq, opp_color)
        if m is None:
            break
        piece_on_sq = b.piece_at(to_sq)
        gain.append(PIECE_VALUES.get(piece_on_sq.piece_type, 0) if piece_on_sq else 0)
        b.push(m)
        depth += 1

    result = 0
    for i in range(len(gain) - 1, -1, -1):
        result = gain[i] - max(0, result)
    return result


SACRIFICE_MIN_PIECE_VALUE = 300
SACRIFICE_SCAN_MIN_PIECE_VALUE = 100  # pawns included in full-board audit
OPP_PROFITABLE_SEE_THRESHOLD = 50
OPP_SEE_EN_PRISE_THRESHOLD = 0
WINNING_CAPTURE_SEE_THRESHOLD = 150
EQUAL_TRADE_SEE_THRESHOLD = -100

# Early-game / opening gambit suppression (see EARLY_GAME_BRILLIANCE_FIX.md)
EARLY_GAME_PLY_CUTOFF = 10
OPENING_PHASE_THRESHOLD = 5800
PAWN_SACRIFICE_SEE_LIMIT = 200
OPENING_TM_BYPASS_THRESHOLD = 8
OPENING_KING_SAFETY_BYPASS = -100
PAWN_OPENING_OPP_SEE_THRESHOLD = 150


def _cheapest_piece_value(board, squares, color):
    values = [
        PIECE_VALUES.get(board.piece_at(sq).piece_type, 0)
        for sq in squares
        if board.piece_at(sq) and board.piece_at(sq).color == color
    ]
    return min(values) if values else None


def piece_hanging_status(board, square, color):
    """
    Per-piece hanging snapshot using SEE (not just attacker/defender counts).
    en_prise = opponent has a profitable capture (SEE > 0 from our POV).
    """
    piece = board.piece_at(square)
    if not piece or piece.color != color:
        return None

    opp = not color
    atk_sqs = board.attackers(opp, square)
    def_sqs = board.attackers(color, square)
    see_val = opponent_capture_see(board, square, color) if atk_sqs else 0

    return {
        "square": chess.square_name(square),
        "piece_type": PIECE_NAMES.get(piece.piece_type),
        "piece_value": PIECE_VALUES.get(piece.piece_type, 0),
        "attackers": len(atk_sqs),
        "defenders": len(def_sqs),
        "cheapest_attacker": _cheapest_piece_value(board, atk_sqs, opp),
        "cheapest_defender": _cheapest_piece_value(board, def_sqs, color),
        "see": see_val,
        "en_prise": see_val > OPP_SEE_EN_PRISE_THRESHOLD,
    }


def _sacrifice_exposure_empty():
    return {
        "newly_exposed_piece": None,
        "newly_exposed_piece_square": None,
        "newly_exposed_piece_type": None,
        "newly_exposed_piece_value": 0,
        "defender_removed": False,
        "defender_removal_sacrifice": False,
        "indirect_sacrifice_candidate": False,
        "pre_move_attackers": 0,
        "pre_move_defenders": 0,
        "post_move_attackers": 0,
        "post_move_defenders": 0,
        "pre_move_see": 0,
        "post_move_see": 0,
        # Backward-compatible aliases
        "exposed_piece_square": None,
        "exposed_piece_type": None,
        "exposed_piece_value": 0,
        "defender_removed_by_move": False,
        "sacrifice_risk": 0,
        "remaining_defender_value": 0,
        "opponent_profitable_capture_exists": False,
        "favorable_trade": False,
        "compensation_piece_value": 0,
        "compensation_piece_square": None,
        "compensation_piece_type": None,
        "risk_worsened": False,
        "defense_weakened": False,
        "became_lost": False,
        "capture_landing_sacrifice": False,
        "all_sacrifice_candidates": [],
        "verified_sacrifice_pieces": [],
        "sacrifice_piece_audit": [],
    }


def _side_capture_see(board, square, color):
    """
    SEE for color's LVA capture on square.
    Sets side-to-move so defender recaptures are priced correctly.
    Returns None when no legal capture exists.
    """
    lva = opponent_lva_capture_move(board, square, color)
    if not lva:
        return None
    b = board.copy()
    b.turn = color
    return see(b, lva)


def _compensation_from_attacked_squares(board, attack_squares, color):
    """
    Highest-value enemy piece on attack_squares that we can actually win.

    Merely attacking is not compensation: the piece must be legal to capture
    with SEE > 0. Defended pieces (any same-color defender) are excluded —
    attacking a guarded queen does not compensate a hanging knight.
    """
    opp = not color
    best_value = 0
    best_square = None
    best_type = None

    for sq in attack_squares:
        piece = board.piece_at(sq)
        if not piece or piece.color != opp or piece.piece_type == chess.KING:
            continue

        # Defended = not real hanging compensation (SEE of RxQ can still be > 0).
        if board.attackers(opp, sq):
            continue

        capture_see = _side_capture_see(board, sq, color)
        if capture_see is None or capture_see <= OPP_SEE_EN_PRISE_THRESHOLD:
            continue

        piece_val = PIECE_VALUES.get(piece.piece_type, 0)
        if piece_val > best_value:
            best_value = piece_val
            best_square = sq
            best_type = piece.piece_type

    return {
        "compensation_piece_value": best_value,
        "compensation_piece_square": chess.square_name(best_square) if best_square is not None else None,
        "compensation_piece_type": PIECE_NAMES.get(best_type) if best_type is not None else None,
    }


def _enemy_compensation_from_square(board, square, color):
    """Highest-value enemy piece we can profitably win from square's attacks."""
    return _compensation_from_attacked_squares(board, board.attacks(square), color)


def _enemy_compensation_from_move(board_before, board_after, move, color):
    """
    Highest-value enemy piece newly winable from the mover's destination.
    Used to detect favorable trades (e.g. abandon bishop but fork a hanging rook).
    """
    from_sq = move.from_square
    to_sq = move.to_square
    new_attack_squares = board_after.attacks(to_sq) - board_before.attacks(from_sq)
    return _compensation_from_attacked_squares(board_after, new_attack_squares, color)


def _merge_compensation(*comps):
    """Keep the highest-value compensation threat across sources."""
    best = {
        "compensation_piece_value": 0,
        "compensation_piece_square": None,
        "compensation_piece_type": None,
    }
    for comp in comps:
        if comp["compensation_piece_value"] > best["compensation_piece_value"]:
            best = comp
    return best


def _compensation_for_piece(board_after, piece_sq, color, mover_compensation):
    """
    Compensation for abandoning piece_sq: mover's new winable threats plus the
    piece's own winable attacks (e.g. pawn@b7 taking an undefended queen).
    """
    piece_comp = _enemy_compensation_from_square(board_after, piece_sq, color)
    return _merge_compensation(mover_compensation, piece_comp)


def _is_favorable_trade(exposed_value, compensation_value):
    """True when winable enemy material >= abandoned friendly material."""
    return (
        exposed_value >= SACRIFICE_SCAN_MIN_PIECE_VALUE
        and compensation_value >= exposed_value
    )


def _is_standard_piece_trade(board, move, see_val=None):
    """
    Forced recapture exchange (e.g. Bxc6 bxc6): raw SEE already prices the full
    capture/recapture sequence (~−28 for bishop vs knight). Not a sacrifice.
    """
    if not board.is_capture(move):
        return False

    if see_val is None:
        see_val = see(board, move)
    if see_val < EQUAL_TRADE_SEE_THRESHOLD:
        return False

    from_sq = move.from_square
    to_sq = move.to_square
    moving = board.piece_at(from_sq)
    captured = board.piece_at(to_sq)
    if not moving or not captured:
        return False

    if_val = PIECE_VALUES.get(moving.piece_type, 0)
    cap_val = PIECE_VALUES.get(captured.piece_type, 0)

    board_after = board.copy()
    board_after.push(move)
    if not any(m.to_square == to_sq for m in board_after.legal_moves):
        return False

    similar_pieces = (
        if_val >= SACRIFICE_MIN_PIECE_VALUE
        and cap_val >= if_val * 0.75
    )
    minor_for_major = (
        if_val >= SACRIFICE_MIN_PIECE_VALUE
        and cap_val >= SACRIFICE_SCAN_MIN_PIECE_VALUE
        and abs(if_val - cap_val) <= 50
    )
    return similar_pieces or minor_for_major


def _capture_see_counts_as_sacrifice(is_capture, see_val, net_info, *, is_standard_trade=False):
    """
    Stage 0 capture SEE gate (mirrors Stage 1 disqualifiers at board-only level).
    Winning captures (SEE >= 150) and equal trades (SEE >= -100) are never sacrifices.
    Net SEE only applies when raw SEE misprices a landing loss (Bxh6), not Bxc6 bxc6.
    """
    if not is_capture:
        return False
    if is_standard_trade or see_val >= EQUAL_TRADE_SEE_THRESHOLD:
        return False
    if see_val >= WINNING_CAPTURE_SEE_THRESHOLD:
        return False
    if net_info.get("net_see_applied"):
        return net_info["net_see_value"] < EQUAL_TRADE_SEE_THRESHOLD
    return see_val < EQUAL_TRADE_SEE_THRESHOLD


def _remaining_defender_value(board_after, sq, color):
    return sum(
        PIECE_VALUES.get(board_after.piece_at(d).piece_type, 0)
        for d in board_after.attackers(color, sq)
        if board_after.piece_at(d) and board_after.piece_at(d).color == color
    )


def _is_defended_equal_exchange(before, after):
    """
    Opponent can capture but we still have >= defenders vs attackers and SEE is
    only a minor trade edge (e.g. Nxf3 Qxf3 ≈ +28). Not an intentional sacrifice.
    """
    if not after or after["attackers"] == 0:
        return False
    if after["defenders"] < after["attackers"]:
        return False
    return after["see"] <= OPP_PROFITABLE_SEE_THRESHOLD


def _defender_removal_sacrifice_path(defender_removed, before, after, defense_weakened, risk_worsened):
    """
    Moving piece stopped defending a square — only counts when defense or SEE
    actually worsened (queen relocalizing while keeping 2v1 coverage is not a sac).
    """
    if not defender_removed:
        return False
    if after["piece_type"] not in ("bishop", "knight", "rook", "queen"):
        return False
    if _is_defended_equal_exchange(before, after):
        return False
    return defense_weakened or risk_worsened


def _audit_rejection_reason(
    piece_val,
    vuln_before,
    before,
    after,
    newly_exposed,
    defender_removal,
    became_lost,
    capture_landing,
    favorable_trade,
):
    if piece_val < SACRIFICE_SCAN_MIN_PIECE_VALUE:
        return "below_min_piece_value"
    if vuln_before.get("already_lost_before_move"):
        return "already_lost_before_move"
    if not after or not after["en_prise"]:
        return "not_en_prise_after"
    if favorable_trade:
        return "favorable_trade_compensation"
    if _is_defended_equal_exchange(before, after):
        return "defended_equal_exchange"
    if not (newly_exposed or defender_removal or became_lost or capture_landing):
        return "no_valid_sacrifice_path"
    if newly_exposed and after["see"] <= OPP_SEE_EN_PRISE_THRESHOLD:
        return "newly_exposed_see_not_profitable"
    return "conditions_not_met"


def _verify_intentional_sacrifice_piece(
    board,
    board_after,
    color,
    move,
    compensation,
    *,
    before,
    after,
    vuln_before,
    defender_removed,
    is_mover_landing=False,
):
    """
    Triple-check one friendly piece against all intentional-sacrifice paths.
    Returns audit dict with sacrifice_modes when verified, else None.
    """
    if not before or not after:
        return None

    piece_val = after["piece_value"]
    if piece_val < SACRIFICE_SCAN_MIN_PIECE_VALUE:
        return None

    if vuln_before.get("already_lost_before_move"):
        return None

    if board.is_capture(move) and _is_standard_piece_trade(board, move):
        return None

    if not after["en_prise"]:
        return None

    audit_sq = chess.parse_square(after["square"])
    piece_compensation = _compensation_for_piece(
        board_after, audit_sq, color, compensation
    )
    favorable = _is_favorable_trade(
        piece_val, piece_compensation["compensation_piece_value"]
    )
    if favorable:
        return None

    if _is_defended_equal_exchange(before, after):
        return None

    newly_exposed = not before["en_prise"] and after["en_prise"]
    risk_worsened = after["see"] > before["see"]
    defense_weakened = after["defenders"] < before["defenders"]

    vuln_after = analyze_piece_vulnerability(board_after, audit_sq, color)
    already_lost_after = vuln_after["already_lost_before_move"]
    became_lost = (
        not vuln_before.get("already_lost_before_move")
        and already_lost_after
        and after["en_prise"]
    )

    defender_removal = _defender_removal_sacrifice_path(
        defender_removed, before, after, defense_weakened, risk_worsened
    )

    capture_landing = False
    if is_mover_landing and board.is_capture(move):
        capture_landing = (
            newly_exposed
            or became_lost
            or (
                after["see"] > OPP_PROFITABLE_SEE_THRESHOLD
                and (already_lost_after or risk_worsened)
            )
        )

    if not (newly_exposed or defender_removal or became_lost or capture_landing):
        return None

    audit_sq = chess.parse_square(after["square"])
    if _fork_escape_abandonment(board, board_after, move, color, audit_sq):
        return None

    if newly_exposed:
        if before["see"] > OPP_SEE_EN_PRISE_THRESHOLD:
            return None
        if after["see"] <= OPP_SEE_EN_PRISE_THRESHOLD:
            return None

    sacrifice_modes = []
    if newly_exposed:
        sacrifice_modes.append("newly_exposed")
    if defender_removal:
        sacrifice_modes.append("defender_removed")
    if became_lost:
        sacrifice_modes.append("tactical_abandonment")
    if capture_landing:
        sacrifice_modes.append("capture_landing")

    remaining_def = _remaining_defender_value(board_after, audit_sq, color)

    return {
        "square": after["square"],
        "piece_type": after["piece_type"],
        "piece_value": piece_val,
        "sacrifice_modes": sacrifice_modes,
        "newly_exposed_piece": after["piece_type"],
        "newly_exposed_piece_square": after["square"],
        "newly_exposed_piece_type": after["piece_type"],
        "newly_exposed_piece_value": piece_val,
        "defender_removed": defender_removed,
        "defender_removal_sacrifice": defender_removal,
        "capture_landing_sacrifice": capture_landing,
        "risk_worsened": risk_worsened,
        "defense_weakened": defense_weakened,
        "became_lost": became_lost,
        "pre_move_attackers": before["attackers"],
        "pre_move_defenders": before["defenders"],
        "post_move_attackers": after["attackers"],
        "post_move_defenders": after["defenders"],
        "pre_move_see": before["see"],
        "post_move_see": after["see"],
        "exposed_piece_square": after["square"],
        "exposed_piece_type": after["piece_type"],
        "exposed_piece_value": piece_val,
        "defender_removed_by_move": defender_removed,
        "sacrifice_risk": piece_val - remaining_def,
        "remaining_defender_value": remaining_def,
        "opponent_profitable_capture_exists": after["see"] > OPP_SEE_EN_PRISE_THRESHOLD,
        "already_lost_after": already_lost_after,
        "_sort_key": (piece_val, after["see"] - before["see"]),
    }


def effective_capture_see(sac):
    """
    SEE used for capture sacrifice gates (Stage 0–1).
    Net-adjusted when the mover is abandoned on the landing square (e.g. Bxh6).
    """
    if not sac:
        return 0
    if sac.get("net_see_applied"):
        return sac.get("net_see_value", sac.get("see_value", 0))
    return sac.get("see_value", 0)


def _net_capture_see_empty(see_val):
    return {
        "net_see_value": see_val,
        "net_see_applied": False,
        "net_see_reason": None,
        "moving_piece_landing_square": None,
        "landing_post_move_see": 0,
        "landing_en_prise": False,
    }


def _compute_net_capture_see(board, move, color, see_val):
    """
    Net SEE for capture moves that abandon the moving piece (e.g. Bxh6).
    Immediate capture SEE can be positive (+pawn) while the mover is lost (-bishop).
    """
    if not board.is_capture(move):
        return _net_capture_see_empty(see_val)

    from_sq = move.from_square
    to_sq = move.to_square
    moving_piece = board.piece_at(from_sq)
    captured = board.piece_at(to_sq)
    if moving_piece is None or captured is None:
        return _net_capture_see_empty(see_val)

    mover_val = PIECE_VALUES.get(moving_piece.piece_type, 0)
    if mover_val < SACRIFICE_MIN_PIECE_VALUE:
        return _net_capture_see_empty(see_val)

    if analyze_piece_vulnerability(board, from_sq, color)["already_lost_before_move"]:
        return _net_capture_see_empty(see_val)

    board_after = board.copy()
    board_after.push(move)
    landing = piece_hanging_status(board_after, to_sq, color)
    landing_en_prise = bool(landing and landing["en_prise"])

    # Only net-adjust when landing is en prise and this is not a forced recapture trade.
    # Bxh6: raw +pawn SEE while bishop is lost. Bxc6 bxc6: raw SEE ~−28 already complete.
    if landing_en_prise and not _is_standard_piece_trade(board, move, see_val):
        return {
            "net_see_value": see_val - mover_val,
            "net_see_applied": True,
            "net_see_reason": "landing_en_prise",
            "moving_piece_landing_square": chess.square_name(to_sq),
            "landing_post_move_see": landing.get("see", 0) if landing else 0,
            "landing_en_prise": landing_en_prise,
        }

    return _net_capture_see_empty(see_val)


def _build_mover_landing_candidate(board, board_after, move, color, compensation):
    """Capture landing: verify the moving piece abandoned on to_square."""
    from_sq = move.from_square
    to_sq = move.to_square
    moving_piece = board.piece_at(from_sq)
    piece_after = board_after.piece_at(to_sq)
    if moving_piece is None or piece_after is None or piece_after.color != color:
        return None

    if _is_standard_piece_trade(board, move):
        return None

    before = piece_hanging_status(board, from_sq, color)
    after = piece_hanging_status(board_after, to_sq, color)
    if not before or not after:
        return None

    vuln_before = analyze_piece_vulnerability(board, from_sq, color)
    return _verify_intentional_sacrifice_piece(
        board,
        board_after,
        color,
        move,
        compensation,
        before=before,
        after=after,
        vuln_before=vuln_before,
        defender_removed=False,
        is_mover_landing=True,
    )


def _build_sacrifice_piece_audit(board, board_after, move, color, compensation, verified_by_square):
    """Audit every friendly piece (>= min value) — verified or rejected with reason."""
    audit = []
    for sq in chess.SQUARES:
        piece_after = board_after.piece_at(sq)
        if not piece_after or piece_after.color != color or piece_after.piece_type == chess.KING:
            continue

        piece_val = PIECE_VALUES.get(piece_after.piece_type, 0)
        if piece_val < SACRIFICE_SCAN_MIN_PIECE_VALUE:
            continue

        sq_name = chess.square_name(sq)
        if sq_name in verified_by_square:
            verified = verified_by_square[sq_name]
            audit.append({
                "square": sq_name,
                "piece_type": verified["piece_type"],
                "piece_value": verified["piece_value"],
                "verdict": "verified_sacrifice",
                "sacrifice_modes": verified["sacrifice_modes"],
                "pre_move_see": verified["pre_move_see"],
                "post_move_see": verified["post_move_see"],
                "reason": None,
            })
            continue

        if sq == move.to_square and board.is_capture(move):
            before = piece_hanging_status(board, move.from_square, color)
            after = piece_hanging_status(board_after, sq, color)
            vuln_before = analyze_piece_vulnerability(board, move.from_square, color)
            defender_removed = False
        else:
            piece_before = board.piece_at(sq)
            if not piece_before or piece_before.color != color:
                continue
            before = piece_hanging_status(board, sq, color)
            after = piece_hanging_status(board_after, sq, color)
            vuln_before = analyze_piece_vulnerability(board, sq, color)
            defender_removed = (
                move.from_square in board.attackers(color, sq)
                and move.from_square not in board_after.attackers(color, sq)
            )

        if not after:
            continue

        newly_exposed = before and not before["en_prise"] and after["en_prise"]
        risk_worsened = before and after["see"] > before["see"]
        defense_weakened = before and after["defenders"] < before["defenders"]
        vuln_after = analyze_piece_vulnerability(board_after, sq, color)
        became_lost = (
            before
            and not vuln_before.get("already_lost_before_move")
            and vuln_after.get("already_lost_before_move")
            and after.get("en_prise")
        )
        defender_removal = _defender_removal_sacrifice_path(
            defender_removed, before, after, defense_weakened, risk_worsened
        )
        capture_landing = (
            sq == move.to_square
            and board.is_capture(move)
            and (
                newly_exposed
                or became_lost
                or (
                    after["see"] > OPP_PROFITABLE_SEE_THRESHOLD
                    and vuln_after.get("already_lost_before_move")
                )
            )
        )
        piece_compensation = _compensation_for_piece(
            board_after, sq, color, compensation
        )
        favorable = _is_favorable_trade(
            piece_val, piece_compensation["compensation_piece_value"]
        )

        if _fork_escape_abandonment(board, board_after, move, color, sq):
            audit.append({
                "square": sq_name,
                "piece_type": PIECE_NAMES.get(piece_after.piece_type),
                "piece_value": piece_val,
                "verdict": "not_sacrifice",
                "sacrifice_modes": [],
                "pre_move_see": before["see"] if before else 0,
                "post_move_see": after["see"],
                "pre_en_prise": bool(before and before["en_prise"]),
                "post_en_prise": bool(after["en_prise"]),
                "already_lost_before": bool(vuln_before.get("already_lost_before_move")),
                "already_lost_after": bool(vuln_after.get("already_lost_before_move")),
                "reason": "fork_escape_abandonment",
            })
            continue

        audit.append({
            "square": sq_name,
            "piece_type": PIECE_NAMES.get(piece_after.piece_type),
            "piece_value": piece_val,
            "verdict": "not_sacrifice",
            "sacrifice_modes": [],
            "pre_move_see": before["see"] if before else 0,
            "post_move_see": after["see"],
            "pre_en_prise": bool(before and before["en_prise"]),
            "post_en_prise": bool(after["en_prise"]),
            "already_lost_before": bool(vuln_before.get("already_lost_before_move")),
            "already_lost_after": bool(vuln_after.get("already_lost_before_move")),
            "reason": _audit_rejection_reason(
                piece_val,
                vuln_before,
                before,
                after,
                newly_exposed,
                defender_removal,
                became_lost,
                capture_landing,
                favorable,
            ),
        })

    return audit


def analyze_sacrifice_exposure(board, move, color):
    """
    Scan ALL friendly pieces (>= min value) and verify intentional sacrifice paths.

    Each piece is triple-checked:
    1. Not already lost before the move
    2. En prise after with profitable opponent capture (SEE > 0)
    3. Valid path: newly exposed, defender removed, tactical abandonment, or
       capture landing (mover lost on square — not safe winning captures)
    """
    empty = _sacrifice_exposure_empty()

    from_sq = move.from_square
    moving_piece = board.piece_at(from_sq)
    if moving_piece is None or moving_piece.color != color:
        return empty

    board_after = board.copy()
    board_after.push(move)
    compensation = _enemy_compensation_from_move(board, board_after, move, color)

    verified = []
    suppressed_favorable = None

    for sq in chess.SQUARES:
        piece = board.piece_at(sq)
        if not piece or piece.color != color or piece.piece_type == chess.KING:
            continue

        piece_after = board_after.piece_at(sq)
        if not piece_after or piece_after.color != color:
            continue

        before = piece_hanging_status(board, sq, color)
        after = piece_hanging_status(board_after, sq, color)
        if not before or not after:
            continue

        vuln_before = analyze_piece_vulnerability(board, sq, color)
        defender_removed = (
            from_sq in board.attackers(color, sq)
            and from_sq not in board_after.attackers(color, sq)
        )

        piece_compensation = _compensation_for_piece(
            board_after, sq, color, compensation
        )
        if after["en_prise"] and not vuln_before["already_lost_before_move"]:
            if _is_favorable_trade(
                after["piece_value"],
                piece_compensation["compensation_piece_value"],
            ):
                record = {
                    **empty,
                    "newly_exposed_piece": after["piece_type"],
                    "newly_exposed_piece_square": after["square"],
                    "newly_exposed_piece_type": after["piece_type"],
                    "newly_exposed_piece_value": after["piece_value"],
                    "exposed_piece_square": after["square"],
                    "exposed_piece_type": after["piece_type"],
                    "exposed_piece_value": after["piece_value"],
                    "defender_removed": defender_removed,
                    "pre_move_see": before["see"],
                    "post_move_see": after["see"],
                    "favorable_trade": True,
                    "compensation_piece_value": piece_compensation["compensation_piece_value"],
                    "compensation_piece_square": piece_compensation["compensation_piece_square"],
                    "compensation_piece_type": piece_compensation["compensation_piece_type"],
                }
                if (
                    suppressed_favorable is None
                    or after["piece_value"] > suppressed_favorable["newly_exposed_piece_value"]
                ):
                    suppressed_favorable = record
                continue

        cand = _verify_intentional_sacrifice_piece(
            board,
            board_after,
            color,
            move,
            compensation,
            before=before,
            after=after,
            vuln_before=vuln_before,
            defender_removed=defender_removed,
            is_mover_landing=False,
        )
        if cand:
            verified.append(cand)

    mover_cand = _build_mover_landing_candidate(board, board_after, move, color, compensation)
    if mover_cand:
        verified.append(mover_cand)

    verified_by_square = {v["square"]: v for v in verified}
    piece_audit = _build_sacrifice_piece_audit(
        board, board_after, move, color, compensation, verified_by_square
    )

    if not verified:
        result = suppressed_favorable if suppressed_favorable else empty
        result["sacrifice_piece_audit"] = piece_audit
        result["verified_sacrifice_pieces"] = []
        result["opponent_forks_before"] = find_opponent_forks(board, color)
        result["fork_escape_abandonment"] = any(
            a.get("reason") == "fork_escape_abandonment" for a in piece_audit
        )
        return result

    all_candidates = [
        {
            "piece_type": v["piece_type"],
            "square": v["square"],
            "value": v["piece_value"],
            "modes": v["sacrifice_modes"],
        }
        for v in verified
    ]

    best = max(verified, key=lambda c: c["_sort_key"])
    best = {k: v for k, v in best.items() if k != "_sort_key"}

    best["indirect_sacrifice_candidate"] = (
        best["newly_exposed_piece_value"] >= SACRIFICE_MIN_PIECE_VALUE
        and best["opponent_profitable_capture_exists"]
    )
    best["favorable_trade"] = False
    best["compensation_piece_value"] = compensation["compensation_piece_value"]
    best["compensation_piece_square"] = compensation["compensation_piece_square"]
    best["compensation_piece_type"] = compensation["compensation_piece_type"]
    best["all_sacrifice_candidates"] = all_candidates
    best["verified_sacrifice_pieces"] = [
        {k: v for k, v in p.items() if k != "_sort_key"} for p in verified
    ]
    best["sacrifice_piece_audit"] = piece_audit
    best["opponent_forks_before"] = find_opponent_forks(board, color)
    best["fork_escape_abandonment"] = any(
        a.get("reason") == "fork_escape_abandonment" for a in piece_audit
    )

    return best


def is_sacrifice_candidate(board, move, color, ply_index=None):
    to_sq = move.to_square
    from_sq = move.from_square
    moving_piece = board.piece_at(from_sq)
    captured = board.piece_at(to_sq)
    opp = not color
    is_capture = board.is_capture(move)

    phase_mat = phase_material(board)
    phase_name = game_phase(board)
    is_opening_phase = phase_mat > OPENING_PHASE_THRESHOLD

    # C1: absolute early-game block — opening theory zone
    if ply_index is not None and ply_index < EARLY_GAME_PLY_CUTOFF:
        return {
            "is_capture": is_capture,
            "see_value": see(board, move) if is_capture else 0,
            "is_sacrifice_candidate": False,
            "proceed_to_stage1": False,
            "early_game_blocked": True,
            "early_game_reason": "opening_theory_zone",
            "suppression_reason": None,
            "moving_piece_type": PIECE_NAMES.get(moving_piece.piece_type) if moving_piece else None,
            "moving_piece_value": PIECE_VALUES.get(moving_piece.piece_type, 0) if moving_piece else 0,
            "captured_value": PIECE_VALUES.get(captured.piece_type, 0) if captured else 0,
            "dest_attackers": 0,
            "dest_defenders": 0,
            "positional_risk": False,
            "negative_see_sacrifice": False,
            "newly_exposed_sacrifice": False,
            "hanging_sacrifice": False,
            **_sacrifice_exposure_empty(),
        }

    see_val = see(board, move) if is_capture else 0
    net_info = _compute_net_capture_see(board, move, color, see_val)
    net_see_val = net_info["net_see_value"]
    net_see_applied = net_info["net_see_applied"]

    dest_attackers = len(board.attackers(opp, to_sq))
    dest_defenders = len(board.attackers(color, to_sq))

    positional_risk = False
    board_after = board.copy()
    board_after.push(move)

    if not is_capture and dest_attackers > 0 and moving_piece is not None:
        min_opp_atk = float("inf")
        best_opp_cap = None
        for atk_sq in board_after.attackers(opp, to_sq):
            ap = board_after.piece_at(atk_sq)
            if ap:
                v = PIECE_VALUES.get(ap.piece_type, 0)
                if v < min_opp_atk:
                    min_opp_atk = v
                    best_opp_cap = chess.Move(atk_sq, to_sq)
        if best_opp_cap and board_after.is_legal(best_opp_cap):
            opp_see = see(board_after, best_opp_cap)
            # C7: stricter threshold for pawn pushes in the opening
            risk_threshold = OPP_PROFITABLE_SEE_THRESHOLD
            if (
                moving_piece.piece_type == chess.PAWN
                and is_opening_phase
            ):
                risk_threshold = PAWN_OPENING_OPP_SEE_THRESHOLD
            positional_risk = opp_see > risk_threshold
            if positional_risk:
                mover_comp = _enemy_compensation_from_move(
                    board, board_after, move, color
                )
                mover_val = PIECE_VALUES.get(moving_piece.piece_type, 0)
                if _is_favorable_trade(
                    mover_val, mover_comp["compensation_piece_value"]
                ):
                    positional_risk = False

    exposure = analyze_sacrifice_exposure(board, move, color)
    verified_pieces = exposure.get("verified_sacrifice_pieces") or []
    standard_trade = _is_standard_piece_trade(board, move, see_val) if is_capture else False
    negative_see_sacrifice = _capture_see_counts_as_sacrifice(
        is_capture, see_val, net_info, is_standard_trade=standard_trade
    )

    newly_exposed_sacrifice = any(
        "newly_exposed" in p.get("sacrifice_modes", []) for p in verified_pieces
    )
    defender_removal_sacrifice = any(
        "defender_removed" in p.get("sacrifice_modes", []) for p in verified_pieces
    )
    capture_landing_sacrifice = any(
        "capture_landing" in p.get("sacrifice_modes", []) for p in verified_pieces
    )

    hanging_sacrifice = len(verified_pieces) > 0 and not exposure.get("favorable_trade")

    is_sac = (
        negative_see_sacrifice
        or positional_risk
        or hanging_sacrifice
    )

    suppression_reason = None

    if is_sac and exposure.get("fork_escape_abandonment"):
        is_sac = False
        suppression_reason = "fork_escape_abandonment"

    # C2: opening phase pawn sacrifice suppression (pawn moves only — not Bxh6-style piece sacs)
    if is_sac and is_opening_phase:
        is_pawn_level_sac = (
            moving_piece is not None
            and moving_piece.piece_type == chess.PAWN
            and (
                abs(see_val) <= PAWN_SACRIFICE_SEE_LIMIT
                or (not is_capture and positional_risk)
            )
        )
        if is_pawn_level_sac:
            ks_before = king_safety(board, not color)
            ks_after = king_safety(board_after, not color)
            opp_king_safety_delta = ks_after["total_safety"] - ks_before["total_safety"]
            tm = tactical_multiplexing(board, board_after, color)
            extraordinary = (
                opp_king_safety_delta <= OPENING_KING_SAFETY_BYPASS
                or tm["multiplexing_score"] >= OPENING_TM_BYPASS_THRESHOLD
            )
            if not extraordinary:
                is_sac = False
                suppression_reason = "opening_pawn_sacrifice_no_extraordinary_justification"

    return {
        "is_capture": is_capture,
        "see_value": see_val,
        "net_see_value": net_see_val if net_see_applied else see_val,
        "net_see_applied": net_see_applied,
        "is_sacrifice_candidate": is_sac,
        "proceed_to_stage1": is_sac,
        "early_game_blocked": False,
        "early_game_reason": None,
        "suppression_reason": suppression_reason,
        "moving_piece_type": PIECE_NAMES.get(moving_piece.piece_type) if moving_piece else None,
        "moving_piece_value": PIECE_VALUES.get(moving_piece.piece_type, 0) if moving_piece else 0,
        "captured_piece_type": PIECE_NAMES.get(captured.piece_type) if captured else None,
        "captured_piece_square": chess.square_name(to_sq) if captured else None,
        "captured_value": PIECE_VALUES.get(captured.piece_type, 0) if captured else 0,
        "dest_attackers": dest_attackers,
        "dest_defenders": dest_defenders,
        "positional_risk": positional_risk,
        "negative_see_sacrifice": negative_see_sacrifice,
        "newly_exposed_sacrifice": newly_exposed_sacrifice,
        "hanging_sacrifice": hanging_sacrifice,
        **net_info,
        **exposure,
    }


# --- Piece vulnerability: en prise (local) vs already lost (global) ---

SAFE_SQUARE_SEE_THRESHOLD = 0
CAPTURE_OUT_SEE_MIN = -100
MIN_ESCAPE_MOBILITY = 2


def opponent_lva_capture_move(board, square, opp):
    """Legal opponent LVA capture on square, or None (evaluated with opponent to move)."""
    b = board.copy()
    b.turn = opp
    legal_captures = [
        m
        for m in b.generate_pseudo_legal_moves()
        if m.to_square == square
        and b.piece_at(m.from_square)
        and b.piece_at(m.from_square).color == opp
        and b.is_legal(m)
    ]
    if not legal_captures:
        return None
    return min(
        legal_captures,
        key=lambda m: PIECE_VALUES.get(b.piece_at(m.from_square).piece_type, 0),
    )


def opponent_capture_see(board, square, color):
    """SEE for opponent's best legal capture on square (from our POV: positive SEE = bad for us)."""
    opp = not color
    lva = opponent_lva_capture_move(board, square, opp)
    if not lva:
        return 0
    return see(board, lva)


def is_piece_en_prise(board, square, color):
    """
    Local tactical fact: opponent has a profitable capture on this square now.
    Does NOT imply the piece is inevitably lost.
    """
    piece = board.piece_at(square)
    if not piece or piece.color != color:
        return False
    opp = not color
    if not board.attackers(opp, square):
        return False
    return opponent_capture_see(board, square, color) > OPP_SEE_EN_PRISE_THRESHOLD


def is_absolute_pin(board, square, color):
    """True if removing the piece would leave our king in check (pinned to king)."""
    if not board.is_pinned(color, square):
        return False
    b = board.copy()
    b.remove_piece_at(square)
    return b.is_check()


def count_piece_legal_moves(board, square, color):
    return sum(1 for m in board.legal_moves if m.from_square == square)


def is_safe_escape_square(board, move, color):
    """
    Escape is survivable if destination passes SEE, has defense/tactical justification,
    and leaves the piece with sufficient mobility (avoids trapped-on-safe-SEE squares).
    """
    if move.from_square == move.to_square:
        return False
    if not board.is_legal(move):
        return False

    b = board.copy()
    b.push(move)
    dest = move.to_square
    piece = b.piece_at(dest)
    if not piece or piece.color != color:
        return False

    opp = not color
    dest_opp_see = opponent_capture_see(b, dest, color)
    if dest_opp_see > SAFE_SQUARE_SEE_THRESHOLD:
        return False

    defenders = len(b.attackers(color, dest))
    attackers = len(b.attackers(opp, dest))
    tactically_justified = b.is_check() or b.is_checkmate()
    defended_or_justified = defenders > 0 or tactically_justified or attackers == 0

    mobility = count_piece_legal_moves(b, dest, color)
    if mobility < MIN_ESCAPE_MOBILITY and attackers > 0:
        return False

    if attackers > 0 and not defended_or_justified:
        return False

    return True


def has_capture_out(board, square, color):
    """Desperado / zwischenzug / liquidation — capture that is not a blunder trade."""
    for m in board.legal_moves:
        if m.from_square != square or not board.is_capture(m):
            continue
        if see(board, m) >= CAPTURE_OUT_SEE_MIN:
            return True
    return False


def analyze_piece_vulnerability(board, square, color):
    """
    Returns en_prise (tactical vulnerability) vs already_lost (heuristic inevitability).
    Only already_lost should disqualify sacrifices in Stage 1.
    """
    piece = board.piece_at(square)
    empty = {
        "en_prise_before_move": False,
        "already_lost_before_move": False,
        "safe_escape_squares": 0,
        "has_capture_out": False,
        "absolute_pin": False,
        "disqualify_reason": None,
    }
    if not piece or piece.color != color:
        return empty

    en_prise = is_piece_en_prise(board, square, color)
    fork_info = piece_in_opponent_fork(board, square, color)
    safe_escapes = sum(
        1
        for m in board.legal_moves
        if m.from_square == square and is_safe_escape_square(board, m, color)
    )
    capture_out = has_capture_out(board, square, color)
    absolute_pin = is_absolute_pin(board, square, color)

    already_lost = False
    reason = None

    if en_prise:
        if fork_info and safe_escapes == 0 and not capture_out:
            already_lost = True
            reason = "fork_victim"
        elif safe_escapes > 0 or capture_out:
            already_lost = False
        elif absolute_pin and safe_escapes == 0 and not capture_out:
            already_lost = True
            reason = "piece_already_lost_before_move"
        elif not absolute_pin and safe_escapes == 0 and not capture_out:
            already_lost = True
            reason = "piece_already_lost_before_move"

    return {
        **empty,
        "en_prise_before_move": en_prise,
        "already_lost_before_move": already_lost,
        "in_opponent_fork": fork_info is not None,
        "opponent_fork": fork_info,
        "safe_escape_squares": safe_escapes,
        "has_capture_out": capture_out,
        "absolute_pin": absolute_pin,
        "disqualify_reason": reason,
    }


def was_piece_hanging(board, square, color):
    """Deprecated alias — returns (already_lost, reason) for Stage 1 compatibility."""
    vuln = analyze_piece_vulnerability(board, square, color)
    if vuln["already_lost_before_move"]:
        return True, vuln.get("disqualify_reason") or "piece_already_lost_before_move"
    return False, ""


def king_safety(board, color):
    king_sq = board.king(color)
    if king_sq is None:
        return {
            "pawn_shield": 0,
            "open_files_near": 0,
            "zone_attack_score": 0,
            "castled": False,
            "total_safety": 0,
        }

    opp = not color
    kf = chess.square_file(king_sq)
    kr = chess.square_rank(king_sq)
    direction = 1 if color == chess.WHITE else -1

    pawn_shield = 0
    for df in (-1, 0, 1):
        for dr, strength in ((1, 2), (2, 1)):
            f, r = kf + df, kr + dr * direction
            if 0 <= f <= 7 and 0 <= r <= 7:
                sq = chess.square(f, r)
                p = board.piece_at(sq)
                if p and p.piece_type == chess.PAWN and p.color == color:
                    pawn_shield += strength

    open_file_penalty = 0
    for df in (-1, 0, 1):
        f = kf + df
        if 0 <= f <= 7:
            own_pawn = any(
                board.piece_at(chess.square(f, r)) == chess.Piece(chess.PAWN, color)
                for r in range(8)
            )
            opp_pawn = any(
                board.piece_at(chess.square(f, r)) == chess.Piece(chess.PAWN, opp)
                for r in range(8)
            )
            if not own_pawn and not opp_pawn:
                open_file_penalty += 3
            elif not own_pawn:
                open_file_penalty += 1

    attack_weights = {
        chess.QUEEN: 5,
        chess.ROOK: 3,
        chess.BISHOP: 2,
        chess.KNIGHT: 2,
    }
    king_zone_attack = 0
    for df in range(-2, 3):
        for dr in range(-2, 3):
            f, r = kf + df, kr + dr
            if 0 <= f <= 7 and 0 <= r <= 7:
                zone_sq = chess.square(f, r)
                for pt, w in attack_weights.items():
                    if board.is_attacked_by(opp, zone_sq):
                        king_zone_attack += w
                        break

    if_castled = king_sq in (
        {chess.G1, chess.C1} if color == chess.WHITE else {chess.G8, chess.C8}
    )

    total = (pawn_shield * 10) - (open_file_penalty * 15) - (king_zone_attack * 5)

    return {
        "pawn_shield": pawn_shield,
        "open_files_near": open_file_penalty,
        "zone_attack_score": king_zone_attack,
        "castled": if_castled,
        "total_safety": total,
    }


def find_opponent_forks(board, color):
    """
    Opponent pieces simultaneously attacking 2+ of our valuable pieces.
    Classic knight forks on two rooks are the main case this catches.
    """
    opp = not color
    forks = []
    seen = set()
    for sq in chess.SQUARES:
        atk = board.piece_at(sq)
        if not atk or atk.color != opp:
            continue
        targets = [
            t
            for t in board.attacks(sq)
            if board.piece_at(t)
            and board.piece_at(t).color == color
            and PIECE_VALUES.get(board.piece_at(t).piece_type, 0) >= SACRIFICE_MIN_PIECE_VALUE
        ]
        if len(targets) < 2:
            continue
        key = tuple(sorted(chess.square_name(t) for t in targets))
        if key in seen:
            continue
        seen.add(key)
        forks.append(
            {
                "attacker_square": chess.square_name(sq),
                "attacker_type": PIECE_NAMES.get(atk.piece_type),
                "target_squares": [chess.square_name(t) for t in targets],
                "target_values": sum(
                    PIECE_VALUES.get(board.piece_at(t).piece_type, 0) for t in targets
                ),
            }
        )
    return forks


def piece_in_opponent_fork(board, square, color):
    """Fork record if square is one of 2+ targets of the same opponent attacker."""
    sq_name = chess.square_name(square)
    for fork in find_opponent_forks(board, color):
        if sq_name in fork["target_squares"]:
            return fork
    return None


def _fork_escape_abandonment(board, board_after, move, color, audit_sq):
    """
    Mover escaped one fork target by moving, leaving a sibling fork target doomed.
    Losing the remaining forked piece is not an intentional sacrifice.
    """
    forks = find_opponent_forks(board, color)
    if not forks:
        return False

    from_sq = move.from_square
    for fork in forks:
        targets = [chess.parse_square(t) for t in fork["target_squares"]]
        if from_sq not in targets or audit_sq not in targets or from_sq == audit_sq:
            continue
        after = piece_hanging_status(board_after, audit_sq, color)
        if not after or not after["en_prise"]:
            continue
        vuln_after = analyze_piece_vulnerability(board_after, audit_sq, color)
        if (
            vuln_after.get("already_lost_before_move")
            or after["see"] > OPP_PROFITABLE_SEE_THRESHOLD
        ):
            return True
    return False


def tactical_multiplexing(board_before, board_after, color):
    opp = not color

    def attacked_enemy_pieces(b):
        attacked = {}
        for sq in chess.SQUARES:
            p = b.piece_at(sq)
            if p and p.color == opp and p.piece_type != chess.KING:
                if b.is_attacked_by(color, sq):
                    attacked[sq] = {
                        "value": PIECE_VALUES.get(p.piece_type, 0),
                        "undefended": len(b.attackers(opp, sq)) == 0,
                    }
        return attacked

    before_atk = attacked_enemy_pieces(board_before)
    after_atk = attacked_enemy_pieces(board_after)
    new_attacks = {sq: d for sq, d in after_atk.items() if sq not in before_atk}
    new_hanging = [d for d in new_attacks.values() if d["undefended"]]

    def forks(b):
        result = []
        for piece_sq in chess.SQUARES:
            atk = b.piece_at(piece_sq)
            if not atk or atk.color != color:
                continue
            valuable = [
                sq
                for sq in b.attacks(piece_sq)
                if b.piece_at(sq)
                and b.piece_at(sq).color == opp
                and PIECE_VALUES.get(b.piece_at(sq).piece_type, 0) >= 305
            ]
            if len(valuable) >= 2:
                result.append(piece_sq)
        return result

    new_forks = [sq for sq in forks(board_after) if sq not in forks(board_before)]
    opp_forks_before = find_opponent_forks(board_before, color)
    opp_forks_after = find_opponent_forks(board_after, color)

    pins_before = sum(
        1
        for sq in chess.SQUARES
        if board_before.piece_at(sq)
        and board_before.piece_at(sq).color == opp
        and board_before.is_pinned(opp, sq)
    )
    pins_after = sum(
        1
        for sq in chess.SQUARES
        if board_after.piece_at(sq)
        and board_after.piece_at(sq).color == opp
        and board_after.is_pinned(opp, sq)
    )
    new_pins = max(0, pins_after - pins_before)

    is_check = board_after.is_check()
    is_checkmate = board_after.is_checkmate()

    tm_score = (
        len(new_hanging) * 3
        + len(new_forks) * 4
        + new_pins * 2
        + (999 if is_checkmate else 0)
        + (5 if is_check else 0)
        + len(new_attacks) * 1
    )

    return {
        "new_attacks": len(new_attacks),
        "new_hanging": len(new_hanging),
        "new_forks": len(new_forks),
        "new_pins": new_pins,
        "opponent_forks_before": len(opp_forks_before),
        "opponent_forks_after": len(opp_forks_after),
        "opponent_fork_details_before": opp_forks_before,
        "is_check": is_check,
        "is_checkmate": is_checkmate,
        "multiplexing_score": tm_score,
    }


def expectation_violation(board, move, color):
    from_sq, to_sq = move.from_square, move.to_square
    piece = board.piece_at(from_sq)
    if not piece:
        return {"violations": [], "ev_score": 0}

    to_r = chess.square_rank(to_sq)
    from_r = chess.square_rank(from_sq)
    to_f = chess.square_file(to_sq)
    is_backward = (to_r < from_r) if color == chess.WHITE else (to_r > from_r)

    board_after = board.copy()
    board_after.push(move)
    violations = []

    if is_backward and not board.is_capture(move) and piece.piece_type != chess.KING:
        violations.append(("backward_non_capture", 2))

    if piece.piece_type == chess.QUEEN and is_backward and not board.is_capture(move):
        violations.append(("queen_retreat", 3))

    if to_f in (0, 7) and piece.piece_type == chess.KNIGHT:
        violations.append(("knight_to_rim", 2))
    elif to_f in (0, 7) and piece.piece_type in (chess.BISHOP, chess.QUEEN):
        violations.append(("major_piece_to_rim", 1))

    if piece.piece_type == chess.KING and game_phase(board) == "middlegame":
        violations.append(("king_walk_middlegame", 4))

    if board.is_pinned(color, from_sq):
        violations.append(("moving_apparent_pin", 5))

    if not board.is_capture(move) and not board_after.is_check():
        violations.append(("quiet_waiting_move", 2))

    ev_score = sum(w for _, w in violations)
    return {"violations": [v[0] for v in violations], "ev_score": ev_score}


def detect_zugzwang_setup(board_after, attacker_color):
    """Does the resulting position put the opponent in zugzwang (or near-zugzwang)?"""
    opp = not attacker_color
    b = board_after.copy()
    b.turn = opp

    opp_moves = list(b.legal_moves)
    if not opp_moves:
        return {"zugzwang_score": 0.0, "is_likely_zugzwang": False, "moves_sampled": 0}

    def_mat_before = sum(
        PIECE_VALUES.get(pt, 0) * len(board_after.pieces(pt, opp))
        for pt in PIECE_VALUES
        if pt != chess.KING
    )

    moves_that_worsen = 0
    sample_moves = opp_moves[:16]

    for m in sample_moves:
        b2 = b.copy()
        b2.push(m)
        def_mat_after = sum(
            PIECE_VALUES.get(pt, 0) * len(b2.pieces(pt, opp))
            for pt in PIECE_VALUES
            if pt != chess.KING
        )
        b2.turn = opp
        mob_after = len(list(b2.legal_moves))
        loses_mat = def_mat_after < def_mat_before - 30
        loses_mobility = mob_after < max(1, len(opp_moves)) * 0.5
        if loses_mat or loses_mobility:
            moves_that_worsen += 1

    ratio = moves_that_worsen / len(sample_moves)
    return {
        "zugzwang_score": round(ratio, 3),
        "is_likely_zugzwang": ratio > 0.7,
        "moves_sampled": len(sample_moves),
    }


def detect_domination(board_after, attacker_color):
    """One piece traps another of equal or higher value."""
    opp = not attacker_color
    dominated = []

    for target_sq in chess.SQUARES:
        target = board_after.piece_at(target_sq)
        if not target or target.color != opp or target.piece_type == chess.KING:
            continue

        b_test = board_after.copy()
        b_test.turn = opp
        piece_moves = [m for m in b_test.legal_moves if m.from_square == target_sq]
        if not piece_moves:
            continue

        safe_escapes = sum(
            1
            for m in piece_moves
            if not board_after.is_attacked_by(attacker_color, m.to_square)
        )

        if safe_escapes == 0 and len(piece_moves) >= 2:
            piece_value = PIECE_VALUES.get(target.piece_type, 0)
            if piece_value >= PIECE_VALUES[chess.KNIGHT]:
                dominated.append({
                "square": chess.square_name(target_sq),
                "type": target.symbol(),
                "value": PIECE_VALUES.get(target.piece_type, 0),
                "n_moves": len(piece_moves),
            })

    return {
        "dominated_pieces": dominated,
        "domination_count": len(dominated),
        "has_domination": len(dominated) > 0,
        "dominated_value": sum(d["value"] for d in dominated),
    }


def quiet_brilliant_detector(board, move, color):
    """Quiet brilliance detection for non-capture, non-check moves."""
    board_after = board.copy()
    board_after.push(move)

    is_capture = board.is_capture(move)
    is_check = board_after.is_check()
    is_quiet = not is_capture and not is_check

    to_sq = move.to_square
    from_sq = move.from_square
    piece = board.piece_at(from_sq)
    opp = not color

    ctrl_before = sum(1 for sq in chess.SQUARES if board.is_attacked_by(color, sq))
    ctrl_after = sum(1 for sq in chess.SQUARES if board_after.is_attacked_by(color, sq))
    ctrl_gain = ctrl_after - ctrl_before

    b_opp_before = board.copy()
    b_opp_before.turn = opp
    b_opp_after = board_after.copy()
    b_opp_after.turn = opp
    opp_mob_loss = len(list(b_opp_before.legal_moves)) - len(list(b_opp_after.legal_moves))

    xray_alignment = False
    if piece:
        to_r, to_f = chess.square_rank(to_sq), chess.square_file(to_sq)
        opp_king = board.king(opp)
        if opp_king is not None:
            opp_kr, opp_kf = chess.square_rank(opp_king), chess.square_file(opp_king)
            if piece.piece_type in (chess.ROOK, chess.QUEEN):
                xray_alignment = to_r == opp_kr or to_f == opp_kf
            elif piece.piece_type in (chess.BISHOP, chess.QUEEN):
                xray_alignment = abs(to_r - opp_kr) == abs(to_f - opp_kf)

    phase = game_phase(board)
    zugzwang = {"zugzwang_score": 0.0, "is_likely_zugzwang": False}
    if phase == "endgame":
        zugzwang = detect_zugzwang_setup(board_after, color)

    domination = detect_domination(board_after, color)

    opp_threats_before = sum(
        1
        for m in list(b_opp_before.legal_moves)[:20]
        if board.gives_check(m)
    )
    opp_threats_after = sum(
        1
        for m in list(b_opp_after.legal_moves)[:20]
        if board_after.gives_check(m)
    )
    threat_reduction = opp_threats_before - opp_threats_after

    quiet_score = (
        ctrl_gain * 0.3
        + opp_mob_loss * 0.4
        + (5 if xray_alignment else 0)
        + zugzwang["zugzwang_score"] * 8.0
        + domination["domination_count"] * 4.0
        + threat_reduction * 1.0
    )

    archetype = "quiet_move"
    if zugzwang["is_likely_zugzwang"]:
        archetype = "zugzwang_creation"
    elif domination["has_domination"]:
        archetype = "domination"
    elif xray_alignment:
        archetype = "hidden_battery"
    elif threat_reduction > 2:
        archetype = "prophylaxis"
    elif opp_mob_loss > 5:
        archetype = "restriction"

    return {
        "is_quiet": is_quiet,
        "ctrl_gain": ctrl_gain,
        "opp_mob_loss": opp_mob_loss,
        "xray_alignment": xray_alignment,
        "zugzwang": zugzwang,
        "domination": domination,
        "threat_reduction": threat_reduction,
        "quiet_score": round(quiet_score, 2),
        "quiet_archetype": archetype,
        "proceed_to_engine": is_quiet and quiet_score > 3.0,
    }


def defensive_context(board, color):
    """Material deficit before move — triggers defensive brilliance branch."""
    bal = material_balance(board, color)
    material_deficit = max(0, -bal)
    return {
        "material_deficit": material_deficit,
        "is_defending": material_deficit > 150,
    }


def piece_harmony(board_before, board_after, color):
    def controlled(b, c):
        return sum(1 for sq in chess.SQUARES if b.is_attacked_by(c, sq))

    ctrl_delta = controlled(board_after, color) - controlled(board_before, color)

    def mobility(b, c):
        b2 = b.copy()
        b2.turn = c
        pieces = sum(
            1
            for sq in chess.SQUARES
            if b2.piece_at(sq) and b2.piece_at(sq).color == c and b2.piece_at(sq).piece_type != chess.KING
        )
        return len(list(b2.legal_moves)) / max(1, pieces)

    act_delta = mobility(board_after, color) - mobility(board_before, color)

    return {
        "control_delta": ctrl_delta,
        "activity_delta": round(act_delta, 2),
        "harmony_score": round(ctrl_delta * 0.3 + act_delta * 2.0, 2),
    }


def analyze_move(board, move, ply_index):
    color = board.turn
    board_after = board.copy()
    board_after.push(move)

    phase = game_phase(board)
    sac = is_sacrifice_candidate(board, move, color, ply_index=ply_index)
    vuln = analyze_piece_vulnerability(board, move.from_square, color)

    king_s_before_opp = king_safety(board, not color)
    king_s_after_opp = king_safety(board_after, not color)
    king_s_delta_opp = king_s_after_opp["total_safety"] - king_s_before_opp["total_safety"]

    tm = tactical_multiplexing(board, board_after, color)
    ev = expectation_violation(board, move, color)
    harmony = piece_harmony(board, board_after, color)
    quiet = quiet_brilliant_detector(board, move, color)
    def_ctx = defensive_context(board, color)

    mat_before = material_balance(board, color)
    mat_after = material_balance(board_after, color)

    moving_piece = board.piece_at(move.from_square)
    novelty_sac_type = _infer_novelty_sac_type(
        board, move, sac.get("see_value") or 0, moving_piece
    )
    novelty_score = compute_novelty_score(ply_index, phase, novelty_sac_type)

    from brilliance_gates import compute_engine_candidacy

    candidacy = compute_engine_candidacy(board, move, ply_index)

    return {
        "ply_index": ply_index,
        "san_move": board.san(move),
        "uci_move": move.uci(),
        "fen_before": board.fen(),
        "turn": "white" if color == chess.WHITE else "black",
        "setup": {
            "game_phase": phase,
            "game_phase_code": game_phase_code(phase),
            "phase_material": phase_material(board),
            "material_balance_before": mat_before,
            "material_balance_after": mat_after,
            "material_delta": mat_after - mat_before,
        },
        "see": sac,
        "piece_vulnerability": vuln,
        "piece_hanging": vuln,
        "king_safety": {
            "opp_before": king_s_before_opp,
            "opp_after": king_s_after_opp,
            "opp_king_safety_delta": king_s_delta_opp,
        },
        "tactical_multiplexing": tm,
        "expectation_violation": ev,
        "piece_harmony": harmony,
        "quiet_brilliance": quiet,
        "defensive_context": def_ctx,
        "novelty_score": novelty_score,
        "early_game_blocked": sac.get("early_game_blocked", False),
        "early_game_reason": sac.get("early_game_reason"),
        "suppression_reason": sac.get("suppression_reason"),
        "is_sacrifice_candidate": sac["is_sacrifice_candidate"],
        "proceed_to_stage1": sac["is_sacrifice_candidate"],
        "proceed_to_engine": candidacy["proceed_to_engine"],
        "engine_candidate_path": candidacy.get("engine_candidate_path"),
    }


def analyze_pgn(pgn_text):
    game = chess.pgn.read_game(io.StringIO(pgn_text))
    if game is None:
        raise ValueError("Could not parse PGN")

    board = game.board()
    moves_out = []

    for ply_index, move in enumerate(game.mainline_moves()):
        moves_out.append(analyze_move(board, move, ply_index))
        board.push(move)

    sacrifice_count = sum(1 for m in moves_out if m["is_sacrifice_candidate"])
    engine_candidate_count = sum(1 for m in moves_out if m["proceed_to_engine"])

    return {
        "move_count": len(moves_out),
        "sacrifice_candidate_count": sacrifice_count,
        "engine_candidate_count": engine_candidate_count,
        "moves": moves_out,
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
        result = analyze_pgn(pgn)
        print(json.dumps(result))
        return 0
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
