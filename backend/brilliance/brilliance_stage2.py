"""
Brilliance Engine — Stage 2 shallow Stockfish validation.
Runs only on Stage 1 proceed_to_stage2 moves. Depth 12 multipv + depth 10 fallbacks.
"""
import io
import json
import os
import sys

import chess
import chess.engine
import chess.pgn

from brilliance_gates import resolve_engine_candidate
from brilliance_stage1 import mover_rating_from_headers
from brilliance_eval import (
    EVAL_PERSPECTIVE,
    STAGE2_SEARCH_TIME_S,
    cp_from_info_white,
    cp_to_ep,
    cpl_from_white_scores,
    engine_limit,
    to_mover_cp,
)
from brilliance_stage0 import PIECE_VALUES, analyze_piece_vulnerability

STOCKFISH_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "stockfish", "stockfish-windows-x86-64-avx2.exe")
)

PIECE_SURVIVAL_PLIES = 4
LOSS_THRESHOLD_FLOOR = 150
LOSS_THRESHOLD_PIECE_FRACTION = 0.7
STAGE20_ENGINE_DEPTH = 8


def cp_from_info(info):
    return cp_from_info_white(info)


def piece_track_square_after_move(board, move, square, color, piece_type):
    """Square where the tracked piece sits immediately after `move`, or None."""
    piece = board.piece_at(square)
    if not piece or piece.color != color or piece.piece_type != piece_type:
        return None

    track = move.to_square if move.from_square == square else square
    b = board.copy()
    b.push(move)
    after = b.piece_at(track)
    if after and after.color == color and after.piece_type == piece_type:
        return track
    return None


def preservation_candidate_moves(board, square, color, piece_type):
    """
    All legal moves where the threatened piece still exists after our move.
    Includes retreats, defenses, blocks, and counterattacks — not only piece moves.
    """
    candidates = []
    seen = set()
    for move in board.legal_moves:
        track = piece_track_square_after_move(board, move, square, color, piece_type)
        if track is None:
            continue
        key = move.uci()
        if key in seen:
            continue
        seen.add(key)
        candidates.append((move, track))
    return candidates


def should_skip_preservation_check(board, move, color, stage1):
    """
    Only engine-confirm pieces that Stage 0 already marks as inevitably lost
    before the move. Skip intentional moving sacrifices (e.g. Bh7+).
    """
    vuln = analyze_piece_vulnerability(board, move.from_square, color)
    if not vuln.get("already_lost_before_move"):
        return True, "not_already_lost_before_heuristic"

    if not vuln.get("en_prise_before_move"):
        return True, "not_en_prise"

    stage0 = (stage1 or {}).get("stage0") or {}
    if stage0.get("became_lost"):
        landing = chess.square_name(move.to_square)
        for piece in stage0.get("verified_sacrifice_pieces") or []:
            modes = piece.get("sacrifice_modes") or []
            if "tactical_abandonment" in modes and piece.get("square") == landing:
                return True, "intentional_moving_sacrifice"

    return False, None


def piece_survives_plies(board, start_sq, color, piece_type, engine, depth, plies):
    """
    Follow engine best lines; piece must remain on board for `plies` half-moves.
    Tracks the piece from start_sq through captures/moves.
    """
    b = board.copy()
    sq = start_sq

    for _ in range(plies):
        p = b.piece_at(sq)
        if not p or p.color != color or p.piece_type != piece_type:
            return False

        info = engine.analyse(
            b,
            engine_limit(depth=max(6, depth - 2), time_s=1.0),
        )
        pv = info.get("pv") or []
        if not pv:
            return True
        move = pv[0]
        if move.to_square == sq:
            return False
        if move.from_square == sq:
            sq = move.to_square
        b.push(move)

    p = b.piece_at(sq)
    return p is not None and p.color == color and p.piece_type == piece_type


def engine_piece_preservation_check(
    board,
    square,
    color,
    engine,
    *,
    played_move=None,
    stage1=None,
    depth=STAGE20_ENGINE_DEPTH,
):
    """
    Stage 2.0: engine confirmation that a piece was already inevitably lost
    BEFORE the played move.

    Only runs when Stage 0 heuristic already_lost_before_move is true.
    Searches every legal move that keeps the piece on the board (retreats,
    defenses, blocks, counterattacks). If any line preserves the piece for
    PIECE_SURVIVAL_PLIES with eval within threshold of current, NOT already lost.

    already_lost_engine iff no such save exists OR best save delta < -T where
    T = max(0.7 * piece_value, 150).
    """
    piece = board.piece_at(square)
    if not piece:
        return {"already_lost_engine": False, "skipped": True, "reason": "no_piece"}

    if played_move is not None:
        skip, skip_reason = should_skip_preservation_check(
            board, played_move, color, stage1
        )
        if skip:
            vuln = analyze_piece_vulnerability(board, square, color)
            return {
                "already_lost_engine": False,
                "skipped": True,
                "reason": skip_reason,
                "already_lost_before_heuristic": bool(
                    vuln.get("already_lost_before_move")
                ),
                "en_prise_before_move": bool(vuln.get("en_prise_before_move")),
                "search_scope": "skipped",
            }

    vuln = analyze_piece_vulnerability(board, square, color)
    if not vuln["en_prise_before_move"]:
        return {"already_lost_engine": False, "skipped": True, "reason": "not_en_prise"}

    piece_val = PIECE_VALUES.get(piece.piece_type, 0)
    piece_type = piece.piece_type
    threshold = max(LOSS_THRESHOLD_PIECE_FRACTION * piece_val, LOSS_THRESHOLD_FLOOR)

    root_info = engine.analyse(
        board,
        engine_limit(depth=depth, time_s=STAGE2_SEARCH_TIME_S),
    )
    current_mover = to_mover_cp(cp_from_info_white(root_info), color)
    if current_mover is None:
        current_mover = 0

    best_save_eval = None
    best_save_move = None
    best_save_via = None
    candidates = preservation_candidate_moves(board, square, color, piece_type)
    save_exists = False

    for m, track_sq in candidates:
        b = board.copy()
        b.push(m)
        if not piece_survives_plies(
            b, track_sq, color, piece_type, engine, depth, PIECE_SURVIVAL_PLIES
        ):
            continue
        info = engine.analyse(
            b,
            engine_limit(depth=depth, time_s=STAGE2_SEARCH_TIME_S),
        )
        ev = to_mover_cp(cp_from_info_white(info), color)
        if ev is None:
            continue
        delta = ev - current_mover
        if delta >= -threshold:
            save_exists = True
        if best_save_eval is None or ev > best_save_eval:
            best_save_eval = ev
            best_save_move = m
            best_save_via = "piece_move" if m.from_square == square else "other_move"

    if save_exists:
        already_lost = False
        delta = (best_save_eval - current_mover) if best_save_eval is not None else 0
    elif best_save_eval is None:
        already_lost = True
        delta = -threshold - 1
    else:
        delta = best_save_eval - current_mover
        already_lost = delta < -threshold

    return {
        "already_lost_engine": already_lost,
        "skipped": False,
        "preservation_delta_cp": round(delta, 1),
        "preservation_threshold_cp": round(threshold, 1),
        "best_preservation_move": board.san(best_save_move) if best_save_move else None,
        "best_preservation_via": best_save_via,
        "save_line_exists": save_exists or (best_save_eval is not None and not already_lost),
        "candidates_considered": len(candidates),
        "current_eval_mover_cp": current_mover,
        "best_preservation_eval_mover_cp": best_save_eval,
        "survival_plies_required": PIECE_SURVIVAL_PLIES,
        "engine_depth": depth,
        "en_prise_before_move": True,
        "already_lost_before_heuristic": True,
        "search_scope": "all_legal_piece_alive",
    }


def shallow_engine_features(board_before, move, color, engine):
    root_info = engine.analyse(
        board_before,
        engine_limit(depth=12, time_s=STAGE2_SEARCH_TIME_S),
    )
    pre_move_eval_white = cp_from_info_white(root_info)
    pre_move_eval_mover = to_mover_cp(pre_move_eval_white, color)

    results = engine.analyse(
        board_before,
        engine_limit(depth=12, time_s=STAGE2_SEARCH_TIME_S),
        multipv=5,
    )
    if not isinstance(results, list):
        results = [results]

    best_score = cp_from_info_white(results[0])
    best_move = results[0]["pv"][0]

    our_score_white = None
    our_rank = 99
    for i, info in enumerate(results):
        if info["pv"] and info["pv"][0] == move:
            our_score_white = cp_from_info_white(info)
            our_rank = i + 1
            break

    board_after = board_before.copy()
    board_after.push(move)

    if our_score_white is None:
        info2 = engine.analyse(
            board_after,
            engine_limit(depth=10, time_s=STAGE2_SEARCH_TIME_S),
        )
        our_score_white = cp_from_info_white(info2)
        our_rank = 99

    cpl = cpl_from_white_scores(best_score, our_score_white, color)

    reasonable = [
        r
        for r in results
        if best_score is not None
        and cp_from_info_white(r) is not None
        and cpl_from_white_scores(best_score, cp_from_info_white(r), color) <= 150
    ]
    is_forced_engine = len(reasonable) <= 2

    best_mover = to_mover_cp(best_score, color)
    our_mover = to_mover_cp(our_score_white, color)

    top5_moves = []
    for i, info in enumerate(results):
        if not info.get("pv"):
            continue
        pv_move = info["pv"][0]
        score_white = cp_from_info_white(info)
        score_mover = to_mover_cp(score_white, color)
        cpl_from_best = (
            0
            if i == 0
            else cpl_from_white_scores(best_score, score_white, color)
        )
        top5_moves.append(
            {
                "rank": i + 1,
                "san": board_before.san(pv_move),
                "uci": pv_move.uci(),
                "score_cp": score_white,
                "score_mover_cp": score_mover,
                "cpl_from_best": cpl_from_best,
                "is_played": pv_move == move,
                "within_150cp": cpl_from_best <= 150,
            }
        )

    if our_rank >= 99 and our_score_white is not None:
        top5_moves.append(
            {
                "rank": None,
                "san": board_before.san(move),
                "uci": move.uci(),
                "score_cp": our_score_white,
                "score_mover_cp": our_mover,
                "cpl_from_best": cpl_from_white_scores(best_score, our_score_white, color),
                "is_played": True,
                "within_150cp": cpl_from_white_scores(best_score, our_score_white, color) <= 150,
                "outside_top5": True,
            }
        )

    n_legal = board_before.legal_moves.count()

    ep_before = cp_to_ep(best_mover)
    ep_after = cp_to_ep(our_mover) if our_mover is not None else 0.0
    ep_delta = ep_after - ep_before
    ep_pre_position = cp_to_ep(pre_move_eval_mover)

    opp = not color
    opp_results = engine.analyse(
        board_after,
        engine_limit(depth=10, time_s=STAGE2_SEARCH_TIME_S),
        multipv=8,
    )
    if not isinstance(opp_results, list):
        opp_results = [opp_results]

    opp_best_score = cp_from_info_white(opp_results[0])
    response_width = sum(
        1
        for r in opp_results
        if abs(opp_best_score - cp_from_info_white(r)) <= 120
    )

    return {
        "best_move": board_before.san(best_move),
        "best_move_uci": best_move.uci(),
        "best_score_cp": best_score,
        "our_score_cp": our_score_white,
        "our_rank_in_top5": our_rank,
        "cpl_shallow": cpl,
        "ep_delta_shallow": round(ep_delta, 3),
        "ep_before": round(ep_before, 3),
        "ep_after": round(ep_after, 3),
        "ep_pre_position": round(ep_pre_position, 3),
        "pre_move_eval_mover_cp": pre_move_eval_mover,
        "pre_move_eval_white_cp": pre_move_eval_white,
        "is_forced_engine": is_forced_engine,
        "n_reasonable_moves": len(reasonable),
        "is_only_good_move": len(reasonable) <= 1,
        "n_legal": n_legal,
        "top5_moves": top5_moves,
        "response_width": response_width,
        "is_best_or_near_best": cpl <= 50,
        "engine_depth": 12,
        "engine_used": True,
        "eval_perspective": EVAL_PERSPECTIVE,
    }


def should_bypass_forced_engine(engine_features, stage1=None):
    """
    Engine-forced positions (≤2 moves within 150cp) can still be brilliant when
    the player had a real choice among several sound tries. Never bypass when
    only one move is reasonable — playing the only good move is not brilliant.
    """
    if not engine_features.get("is_forced_engine"):
        return False
    if engine_features.get("is_only_good_move") or (engine_features.get("n_reasonable_moves") or 99) <= 1:
        return False
    if engine_features.get("is_best_or_near_best"):
        return True
    if stage1 and stage1.get("tactical_bypass"):
        return True
    return False


def apply_stage2_gate(engine_features, stage1=None):
    fail = None
    classification = None
    forced_bypassed = False

    if engine_features["cpl_shallow"] > 300:
        fail = "cpl_too_high"
        classification = "unsound_sacrifice"
    elif engine_features.get("is_forced_engine"):
        forced_bypassed = should_bypass_forced_engine(engine_features, stage1)
        if not forced_bypassed:
            fail = "forced_engine"
            classification = "forced_sacrifice"
    elif engine_features["ep_delta_shallow"] < -0.15:
        fail = "ep_delta_too_negative"
        classification = "unsound_sacrifice"

    return {
        "proceed_to_stage3": fail is None,
        "gate_fail_reason": fail,
        "classification_if_fail": classification,
        "forced_engine_bypassed": forced_bypassed,
    }


def analyze_stage2_move(board, move, ply_index, engine, player_rating=None):
    color = board.turn
    stage1, candidate_path = resolve_engine_candidate(
        board, move, ply_index, player_rating=player_rating
    )
    if not stage1 or not stage1["proceed_to_stage2"]:
        return None

    preservation = engine_piece_preservation_check(
        board,
        move.from_square,
        color,
        engine,
        played_move=move,
        stage1=stage1,
    )
    if preservation.get("already_lost_engine") and not preservation.get("skipped"):
        sac_class = stage1.get("sacrifice_class") or {}
        return {
            "ply_index": ply_index,
            "san_move": board.san(move),
            "uci_move": move.uci(),
            "turn": "white" if color == chess.WHITE else "black",
            "candidate_path": candidate_path or "sacrifice",
            "stage1": {
                "sac_type": sac_class.get("sac_type"),
                "is_valid_sacrifice": stage1.get("is_valid_sacrifice"),
            },
            "preservation_check": preservation,
            "engine": {"engine_used": True, "stage20_only": True},
            "proceed_to_stage3": False,
            "gate_fail_reason": "piece_already_lost_engine_confirmed",
            "classification_if_fail": "unsound_sacrifice",
            "engine_used": True,
        }

    engine_feats = shallow_engine_features(board, move, color, engine)
    gate = apply_stage2_gate(engine_feats, stage1=stage1)

    sac_class = stage1.get("sacrifice_class") or {}
    return {
        "ply_index": ply_index,
        "san_move": board.san(move),
        "uci_move": move.uci(),
        "turn": "white" if color == chess.WHITE else "black",
        "candidate_path": candidate_path or "sacrifice",
        "stage1": {
            "sac_type": sac_class.get("sac_type"),
            "is_valid_sacrifice": stage1.get("is_valid_sacrifice"),
            "tactical_bypass": stage1.get("tactical_bypass"),
        },
        "preservation_check": preservation,
        "engine": engine_feats,
        "proceed_to_stage3": gate["proceed_to_stage3"],
        "gate_fail_reason": gate["gate_fail_reason"],
        "classification_if_fail": gate["classification_if_fail"],
        "forced_engine_bypassed": gate.get("forced_engine_bypassed", False),
        "engine_used": True,
    }


def analyze_pgn_stage2(pgn_text, engine_path=None):
    path = engine_path or STOCKFISH_PATH
    if not os.path.exists(path):
        raise FileNotFoundError(f"Stockfish not found at {path}")

    game = chess.pgn.read_game(io.StringIO(pgn_text))
    if game is None:
        raise ValueError("Could not parse PGN")

    moves_out = []

    with chess.engine.SimpleEngine.popen_uci(path) as engine:
        try:
            engine.configure({"Threads": 1, "Hash": 128, "MultiPV": 8})
        except chess.engine.EngineError:
            pass

        board = game.board()
        headers = game.headers
        for ply_index, move in enumerate(game.mainline_moves()):
            rating = mover_rating_from_headers(headers, board.turn == chess.WHITE)
            result = analyze_stage2_move(
                board, move, ply_index, engine, player_rating=rating
            )
            if result:
                result["engine"]["stockfish_path"] = path
                moves_out.append(result)
            board.push(move)

    proceed_count = sum(1 for m in moves_out if m["proceed_to_stage3"])
    disqualified = len(moves_out) - proceed_count

    return {
        "engine_used": True,
        "stockfish_path": path,
        "analyzed_count": len(moves_out),
        "proceed_to_stage3_count": proceed_count,
        "disqualified_count": disqualified,
        "sacrifice_path_count": sum(1 for m in moves_out if m.get("candidate_path") == "sacrifice"),
        "quiet_path_count": sum(1 for m in moves_out if m.get("candidate_path") == "quiet"),
        "defensive_path_count": sum(1 for m in moves_out if m.get("candidate_path") == "defensive"),
        "forced_engine_count": sum(
            1 for m in moves_out if m["gate_fail_reason"] == "forced_engine"
        ),
        "unsound_count": sum(
            1
            for m in moves_out
            if m["gate_fail_reason"] in ("cpl_too_high", "ep_delta_too_negative")
        ),
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

    engine_path = payload.get("engine_path") or STOCKFISH_PATH

    try:
        result = analyze_pgn_stage2(pgn, engine_path)
        print(json.dumps(result))
        return 0
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
