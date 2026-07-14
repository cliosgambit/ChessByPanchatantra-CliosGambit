"""
Brilliance Engine — Stage 4 human perception model.
Runs on Stage 3 passers. No engine — rating-relative surprise, practical brilliance, archetype.
"""
import json
import math
import sys

import chess

from brilliance_stage3 import (
    deep_eval_sound_score as compute_deep_eval_sound_score,
    depth_eval_span_score as compute_depth_eval_span_score,
)

RATING_BRACKETS = [
    (0, 1100, 0.4),
    (1100, 1500, 0.3),
    (1500, 1900, 0.2),
    (1900, 2300, 0.1),
    (2300, 2700, 0.05),
    (2700, 9999, 0.01),
]

TYPE_MULTIPLIERS = {
    "queen_sacrifice": 2.5,
    "exchange_sacrifice": 1.8,
    "real_sacrifice": 1.6,
    "positional_piece_placement": 2.0,
    "tactical_sacrifice": 1.2,
    "pseudo_sacrifice": 0.8,
}


def _scoring_sac_type(sac_type, sacrificed_piece_type=None):
    """
    Score surprise/archetype from the intentionally sacrificed piece, not the mover.
    Falls back to sac_type when no abandoned asset was identified.
    """
    if not sacrificed_piece_type:
        return sac_type or "unknown"

    piece_map = {
        "queen": "queen_sacrifice",
        "rook": "exchange_sacrifice",
        "knight": "tactical_sacrifice",
        "bishop": "tactical_sacrifice",
        "pawn": "real_sacrifice",
    }
    return piece_map.get(sacrificed_piece_type, sac_type or "unknown")


def _surprise_rating_factor(player_rating):
    for lo, hi, factor in RATING_BRACKETS:
        if lo <= player_rating < hi:
            return factor
    return 0.2


def rating_relative_surprise(
    player_rating,
    ev_score,
    rank_at_d8,
    good_moves_top5=None,
    legal_moves=None,
    sac_type=None,
    sacrificed_piece_type=None,
):
    """
    Recommended surprise formula:
      1 − (good_moves_top5/5 × (rank−1)/(legal_moves−1) × rating_factor + 0.15 × EV)

    Scaled to 0–10 for Stage 4: surprise_score = 10 × max(0, 1 − inner)
    """
    good = max(0, min(5, int(good_moves_top5 or 1)))
    legal = max(2, int(legal_moves or 20))
    rank = int(rank_at_d8 or 99)
    if rank >= 99:
        rank = legal

    rating_factor = _surprise_rating_factor(int(player_rating or 1500))

    good_ratio = good / 5.0
    rank_ratio = (rank - 1) / max(legal - 1, 1)
    rank_ratio = min(1.0, max(0.0, rank_ratio))

    engine_term = good_ratio * rank_ratio * rating_factor
    ev_term = 0.15 * (ev_score or 0)
    inner_sum = engine_term + ev_term
    surprise_unit = max(0.0, 1.0 - inner_sum)
    surprise = min(10.0, round(surprise_unit * 10.0, 2))

    p_find = max(0.001, 1.0 - (surprise / 10.0))
    info_surprise = -math.log2(p_find)

    return {
        "player_rating": int(player_rating or 1500),
        "good_moves_top5": good,
        "legal_moves": legal,
        "rank_at_depth8": rank if rank_at_d8 is not None and rank_at_d8 < 99 else rank_at_d8,
        "good_ratio": round(good_ratio, 3),
        "rank_ratio": round(rank_ratio, 3),
        "rating_factor": rating_factor,
        "engine_term": round(engine_term, 3),
        "ev_term": round(ev_term, 3),
        "inner_sum": round(inner_sum, 3),
        "surprise_unit": round(surprise_unit, 3),
        "product_term": round(engine_term, 3),
        "base_non_obvious": round(rank_ratio, 3),
        "type_multiplier": None,
        "surprise_score": surprise,
        "info_surprise_bits": round(info_surprise, 2),
        "brilliant_for_rating": surprise > 6.0,
    }


def practical_brilliance_score(defense_difficulty, deep_eval_sound_score, deep_eval_mover_cp, tm_score):
    deep_eval_mover_cp = deep_eval_mover_cp or 0
    defense_difficulty = defense_difficulty or 0.0
    tm_score = tm_score or 0
    sound_score = deep_eval_sound_score or 0

    obj_quality = max(0.0, min(1.0, sound_score / 10.0))
    practical_value = defense_difficulty * (min(tm_score, 20) / 20.0)
    tal_zone = -200 <= deep_eval_mover_cp < -30

    if sound_score >= 7.5:
        pb_score = obj_quality * defense_difficulty * 10.0
        category = "objective_brilliant"
    elif tal_zone and defense_difficulty > 0.7:
        pb_score = practical_value * 7.0
        category = "practical_brilliant"
    else:
        pb_score = practical_value * 3.0
        category = "speculative_sacrifice"

    return {
        "category": category,
        "obj_quality": round(obj_quality, 3),
        "practical_value": round(practical_value, 3),
        "pb_score": round(pb_score, 2),
        "is_tal_zone": tal_zone,
        "deep_eval_sound_score": round(sound_score, 2),
    }


def brilliance_archetype(
    sac_type,
    is_check,
    is_quiet,
    game_phase_val,
    king_safety_delta,
    is_defensive=False,
    sacrificed_piece_type=None,
):
    scoring_type = _scoring_sac_type(sac_type, sacrificed_piece_type)
    if is_quiet and not is_check:
        if game_phase_val == "endgame":
            return "endgame_revelation"
        return "quiet_masterstroke"

    if is_defensive:
        return "defensive_brilliance"

    if scoring_type == "queen_sacrifice" and (king_safety_delta or 0) < -100:
        return "thunderbolt"

    if scoring_type == "exchange_sacrifice":
        return "strategic_masterstroke"

    if is_check and (king_safety_delta or 0) < -80:
        return "ignition"

    if game_phase_val == "endgame":
        return "endgame_coup"

    return "masterstroke"


def detect_stalemate_trap(board, move, color):
    board_after = board.copy()
    board_after.push(move)
    opp = not color
    board_after.turn = opp

    traps_found = []
    for opp_move in list(board_after.legal_moves)[:15]:
        b2 = board_after.copy()
        b2.push(opp_move)
        if b2.is_stalemate():
            traps_found.append(board_after.san(opp_move))

    return {
        "stalemate_traps": traps_found,
        "trap_count": len(traps_found),
        "has_trap": len(traps_found) > 0,
    }


def detect_perpetual_check(board, move, color, max_depth=10):
    board_after = board.copy()
    board_after.push(move)

    if not board_after.is_check():
        return {"has_perpetual": False}

    def _push_copy(b, m):
        bc = b.copy()
        bc.push(m)
        return bc

    def recurse(b, checker, depth, seen_positions):
        if depth >= max_depth:
            return True
        fen = b.fen().split(" ")[0]
        if fen in seen_positions:
            return True
        seen_positions.add(fen)
        if b.is_checkmate():
            return False
        if b.is_stalemate():
            return True
        b.turn = checker
        check_moves = [m for m in b.legal_moves if b.gives_check(m)]
        if not check_moves:
            return False
        for cm in check_moves[:5]:
            b2 = b.copy()
            b2.push(cm)
            b2.turn = not checker
            opp_responses = list(b2.legal_moves)[:5]
            if not opp_responses:
                continue
            if all(recurse(_push_copy(b2, r), checker, depth + 2, seen_positions.copy()) for r in opp_responses):
                return True
        return False

    has_perp = recurse(board_after.copy(), color, 0, set())
    return {
        "has_perpetual": has_perp,
        "starts_with_check": True,
        "depth_searched": max_depth,
    }


def defensive_brilliance_score(board_before, move, color, pre_move_eval_cp, post_move_eval_cp):
    pre_move_eval_cp = pre_move_eval_cp or 0
    post_move_eval_cp = post_move_eval_cp or 0

    is_losing = pre_move_eval_cp < -150
    is_clearly_losing = pre_move_eval_cp < -400
    eval_rescue = post_move_eval_cp - pre_move_eval_cp
    achieves_draw = -50 <= post_move_eval_cp <= 50

    perpetual = detect_perpetual_check(board_before, move, color)
    stalemate = detect_stalemate_trap(board_before, move, color)

    base = 0.0
    archetype = "normal_defense"

    if is_losing:
        if perpetual["has_perpetual"]:
            base += 8.0
            archetype = "perpetual_save"
        if stalemate["has_trap"]:
            base += 9.0
            archetype = "stalemate_brilliance"
        if achieves_draw and not perpetual["has_perpetual"] and not stalemate["has_trap"]:
            base += 5.0
            archetype = "defensive_fortress"
        if is_clearly_losing:
            base += 2.0
        rescue_bonus = min(3.0, eval_rescue / 200)
        base += rescue_bonus

    return {
        "is_losing_position": is_losing,
        "pre_move_eval": pre_move_eval_cp,
        "post_move_eval": post_move_eval_cp,
        "eval_rescue_cp": eval_rescue,
        "achieves_draw": achieves_draw,
        "perpetual": perpetual,
        "stalemate_trap": stalemate,
        "defensive_score": round(base, 2),
        "defensive_archetype": archetype,
        "is_defensive_brilliant": base >= 6.0,
    }


def compute_brilliance_classification(
    non_obvious_score,
    surprise_score,
    pb_score,
    defense_difficulty,
    multiplexing_score,
    ev_score,
    deep_eval_sound_score=0,
    depth_eval_span_score=0,
    quiet_score=0,
    is_defensive=False,
    material_deficit=0,
    defensive_score=0,
):
    nob = non_obvious_score or 0
    surprise = surprise_score or 0
    pb = pb_score or 0
    def_diff = defense_difficulty or 0
    tm = multiplexing_score or 0
    ev = ev_score or 0
    sound_score = deep_eval_sound_score or 0
    span_score = depth_eval_span_score or 0

    w_nob = nob * 0.27
    w_surprise = surprise * 0.23
    w_pb = pb * 0.18
    w_def = def_diff * 10 * 0.10
    w_tm = tm * 0.08
    w_ev = ev * 0.04
    w_sound = sound_score * 0.06
    w_span = span_score * 0.04

    brilliance_raw = w_nob + w_surprise + w_pb + w_def + w_tm + w_ev + w_sound + w_span
    quiet_bonus = 0.0
    defensive_bonus = 0.0

    if quiet_score and quiet_score > 2.0:
        quiet_bonus = (quiet_score / 10.0) * 2.0
        brilliance_raw += quiet_bonus

    if is_defensive:
        defensive_bonus += min(material_deficit, 500) / 500 * 2.0
        if defensive_score >= 6.0:
            defensive_bonus += defensive_score * 0.15
        brilliance_raw += defensive_bonus

    brilliance_raw = round(brilliance_raw, 2)
    brilliance = brilliance_raw

    score_breakdown = {
        "components": {
            "non_obvious_score": round(nob, 2),
            "surprise_score": round(surprise, 2),
            "pb_score": round(pb, 2),
            "defense_difficulty": round(def_diff, 3),
            "multiplexing_score": round(tm, 2),
            "ev_score": round(ev, 2),
            "deep_eval_sound_score": round(sound_score, 2),
            "depth_eval_span_score": round(span_score, 2),
        },
        "weights": {
            "non_obvious_score": 0.27,
            "surprise_score": 0.23,
            "pb_score": 0.18,
            "defense_difficulty": 1.0,
            "multiplexing_score": 0.08,
            "ev_score": 0.04,
            "deep_eval_sound_score": 0.06,
            "depth_eval_span_score": 0.04,
        },
        "weighted": {
            "non_obvious_score": round(w_nob, 3),
            "surprise_score": round(w_surprise, 3),
            "pb_score": round(w_pb, 3),
            "defense_difficulty": round(w_def, 3),
            "multiplexing_score": round(w_tm, 3),
            "ev_score": round(w_ev, 3),
            "deep_eval_sound_score": round(w_sound, 3),
            "depth_eval_span_score": round(w_span, 3),
        },
        "quiet_bonus": round(quiet_bonus, 3),
        "defensive_bonus": round(defensive_bonus, 3),
        "brilliance_score_raw": brilliance_raw,
        "brilliance_score": brilliance,
    }

    sound_enough = sound_score >= 7.5

    if brilliance >= 6.5 and sound_enough:
        classification = "BRILLIANT"
    elif brilliance >= 5.0 or defensive_score >= 6.0:
        classification = "practical_brilliant"
    elif brilliance >= 3.5:
        classification = "great_sacrifice"
    else:
        classification = "good_sacrifice"

    return brilliance_raw, brilliance, classification, score_breakdown


def analyze_stage4_move(move_input):
    player_rating = int(move_input.get("player_rating") or 1500)
    ev_score = move_input.get("ev_score") or 0
    rank_at_d8 = move_input.get("rank_at_depth8") or 99
    sac_type = move_input.get("sac_type") or "unknown"
    sacrificed_piece_type = move_input.get("sacrificed_piece_type")
    scoring_sac_type = _scoring_sac_type(sac_type, sacrificed_piece_type)

    deep_eval_mover = move_input.get("deep_eval_mover_cp")
    if deep_eval_mover is None and move_input.get("deep_eval_cp") is not None:
        cp = move_input["deep_eval_cp"]
        deep_eval_mover = cp if move_input.get("turn") == "white" else -cp

    sound_score_val = move_input.get("deep_eval_sound_score")
    if sound_score_val is None and deep_eval_mover is not None:
        sound_score_val = compute_deep_eval_sound_score(deep_eval_mover)

    span_score_val = move_input.get("depth_eval_span_score")
    if span_score_val is None:
        span_score_val = compute_depth_eval_span_score(
            move_input.get("depth_eval_span_cp"),
            bool(move_input.get("is_rising_curve")),
        )

    game_phase_val = move_input.get("game_phase") or "middlegame"

    surprise = rating_relative_surprise(
        player_rating,
        ev_score,
        rank_at_d8,
        good_moves_top5=move_input.get("good_moves_top5"),
        legal_moves=move_input.get("legal_moves"),
        sac_type=sac_type,
        sacrificed_piece_type=sacrificed_piece_type,
    )
    pb = practical_brilliance_score(
        move_input.get("defense_difficulty"),
        sound_score_val,
        deep_eval_mover,
        move_input.get("multiplexing_score"),
    )

    is_quiet = not move_input.get("is_capture") and not move_input.get("is_check")
    archetype = brilliance_archetype(
        sac_type,
        bool(move_input.get("is_check")),
        is_quiet,
        move_input.get("game_phase") or "middlegame",
        move_input.get("king_safety_delta"),
        bool(move_input.get("is_defensive")),
        sacrificed_piece_type=sacrificed_piece_type,
    )

    defensive = None
    fen_before = move_input.get("fen_before")
    move_uci = move_input.get("uci_move")
    if move_input.get("is_defensive") and fen_before and move_uci:
        try:
            board_before = chess.Board(fen_before)
            move = chess.Move.from_uci(move_uci)
            color = chess.WHITE if move_input.get("turn") == "white" else chess.BLACK
            pre_eval = move_input.get("pre_move_eval_mover_cp")
            post_eval = deep_eval_mover
            if pre_eval is not None and post_eval is not None:
                defensive = defensive_brilliance_score(
                    board_before, move, color, pre_eval, post_eval
                )
                if defensive.get("is_defensive_brilliant"):
                    archetype = defensive.get("defensive_archetype") or "defensive_brilliance"
        except Exception:
            defensive = None

    brilliance_score_raw, brilliance_score, classification, score_breakdown = (
        compute_brilliance_classification(
            move_input.get("non_obvious_score"),
            surprise["surprise_score"],
            pb["pb_score"],
            move_input.get("defense_difficulty"),
            move_input.get("multiplexing_score"),
            ev_score,
            deep_eval_sound_score=sound_score_val,
            depth_eval_span_score=span_score_val,
            quiet_score=move_input.get("quiet_score") or 0,
            is_defensive=bool(move_input.get("is_defensive")),
            material_deficit=move_input.get("material_deficit") or 0,
            defensive_score=(defensive or {}).get("defensive_score") or 0,
        )
    )

    return {
        "ply_index": move_input.get("ply_index"),
        "san_move": move_input.get("san_move"),
        "turn": move_input.get("turn"),
        "sac_type": sac_type,
        "sacrificed_piece_type": sacrificed_piece_type,
        "moving_piece_type": move_input.get("moving_piece_type"),
        "sacrifice_mode": move_input.get("sacrifice_mode"),
        "scoring_sac_type": scoring_sac_type,
        "surprise": surprise,
        "practical": pb,
        "defensive": defensive,
        "archetype": archetype,
        "brilliance_score_raw": brilliance_score_raw,
        "brilliance_score": brilliance_score,
        "score_breakdown": score_breakdown,
        "classification": classification,
        "is_brilliant": classification == "BRILLIANT",
        "engine_used": False,
    }


def analyze_stage4_batch(moves_input):
    moves_out = []
    for m in moves_input or []:
        moves_out.append(analyze_stage4_move(m))

    brilliant_count = sum(1 for m in moves_out if m["is_brilliant"])
    practical_count = sum(
        1 for m in moves_out if m["classification"] in ("BRILLIANT", "practical_brilliant")
    )

    return {
        "engine_used": False,
        "analyzed_count": len(moves_out),
        "brilliant_count": brilliant_count,
        "practical_brilliant_count": practical_count,
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

    moves = payload.get("moves")
    if not moves:
        print(json.dumps({"error": "moves array is required"}))
        return 1

    try:
        result = analyze_stage4_batch(moves)
        print(json.dumps(result))
        return 0
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
