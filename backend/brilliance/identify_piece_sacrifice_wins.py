"""
identify_piece_sacrifice_wins.py
=================================
Pioneer Win: player loses a piece (Q/R/B/N) early through a BAD move
(not a trade, not already unsavable), win% drops, and they still win.

Criteria:
  1. Target color wins the game
  2. Non-pawn piece material drops by ≥300cp within max_move_number (default 10)
  3. Not a trade / equal exchange (SEE + sustained deficit)
  4. Piece was not already unsavable before the culprit move
  5. Culprit move is a mistake vs Stockfish best (CPL + win%/EP drop)
  6. Culprit move was not the only reasonable / forced choice

Usage:
    python identify_piece_sacrifice_wins.py '<json>'
    python identify_piece_sacrifice_wins.py -   # stdin
"""

from __future__ import annotations

import io
import json
import os
import sys

import chess
import chess.engine
import chess.pgn

from brilliance_eval import (
    STAGE2_SEARCH_TIME_S,
    cp_from_info_white,
    cp_to_ep,
    cpl_from_white_scores,
    engine_limit,
    to_mover_cp,
)
from brilliance_stage0 import (
    EQUAL_TRADE_SEE_THRESHOLD,
    PIECE_VALUES,
    WINNING_CAPTURE_SEE_THRESHOLD,
    _is_standard_piece_trade,
    analyze_piece_vulnerability,
    see,
)

PIECE_TYPES = {chess.QUEEN, chess.ROOK, chess.BISHOP, chess.KNIGHT}

DEFAULT_MAX_MOVE = 10  # 10 full moves ≈ 20 ply
SUSTAINED_PLIES = 4
MIN_CPL_MISTAKE = 100  # ≥1 pawn — mistake band
MIN_EP_DROP = -0.10  # win% proxy must drop by ≥10 points
MIN_PRE_MOVE_EP = 0.22  # position must still have been playable
QUICK_RECOVERY_PLIES = 4

STOCKFISH_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "stockfish", "stockfish-windows-x86-64-avx2.exe")
)


def material_count(board: chess.Board, color: chess.Color) -> int:
    return sum(
        PIECE_VALUES[pt] * len(board.pieces(pt, color))
        for pt in PIECE_VALUES
    )


def piece_material(board: chess.Board, color: chess.Color) -> int:
    return sum(
        PIECE_VALUES[pt] * len(board.pieces(pt, color))
        for pt in PIECE_TYPES
    )


def material_balance(board: chess.Board, color: chess.Color) -> int:
    return material_count(board, color) - material_count(board, not color)


def lost_piece_type_from_delta(delta: int) -> str:
    lost_value = abs(delta)
    for pt in [chess.QUEEN, chess.ROOK, chess.BISHOP, chess.KNIGHT]:
        if PIECE_VALUES[pt] <= lost_value + 50:
            return chess.piece_name(pt)
    return "piece"


def parse_game_result(headers: dict, target_color: chess.Color) -> str | None:
    result = headers.get("Result", "*")
    if result == "1-0":
        return "win" if target_color == chess.WHITE else "loss"
    if result == "0-1":
        return "win" if target_color == chess.BLACK else "loss"
    if result == "1/2-1/2":
        return "draw"
    return None


def board_at_ply(moves: list[chess.Move], ply: int) -> chess.Board:
    board = chess.Board()
    for move in moves[:ply]:
        board.push(move)
    return board


def evaluate_mistake(board_before: chess.Board, move: chess.Move, color: chess.Color, engine) -> dict:
    """Best vs played using Stockfish MultiPV — CPL + expected-points (win%) drop."""
    results = engine.analyse(
        board_before,
        engine_limit(depth=12, time_s=STAGE2_SEARCH_TIME_S),
        multipv=5,
    )
    if not isinstance(results, list):
        results = [results]

    best_info = results[0]
    best_score = cp_from_info_white(best_info)
    best_move = best_info["pv"][0] if best_info.get("pv") else None

    our_score_white = None
    our_rank = 99
    for i, info in enumerate(results):
        if info.get("pv") and info["pv"][0] == move:
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

    cpl = cpl_from_white_scores(best_score, our_score_white, color)
    best_mover = to_mover_cp(best_score, color)
    our_mover = to_mover_cp(our_score_white, color)

    reasonable = [
        r
        for r in results
        if best_score is not None
        and cp_from_info_white(r) is not None
        and cpl_from_white_scores(best_score, cp_from_info_white(r), color) <= 150
    ]

    # Pre-move eval of the position (best play).
    pre_info = engine.analyse(
        board_before,
        engine_limit(depth=10, time_s=STAGE2_SEARCH_TIME_S),
    )
    pre_white = cp_from_info_white(pre_info)
    pre_mover = to_mover_cp(pre_white, color)

    ep_before = cp_to_ep(best_mover)
    ep_after = cp_to_ep(our_mover) if our_mover is not None else 0.0
    ep_delta = ep_after - ep_before
    ep_pre_position = cp_to_ep(pre_mover)

    # Elo-like ratings of the lines (same logistic scale Chess.com-style EP uses).
    best_move_elo = round(best_mover) if best_mover is not None else None
    played_move_elo = round(our_mover) if our_mover is not None else None
    elo_diff = None
    if best_move_elo is not None and played_move_elo is not None:
        elo_diff = played_move_elo - best_move_elo  # negative = worse than best

    try:
        best_san = board_before.san(best_move) if best_move else None
    except Exception:
        best_san = None
    try:
        played_san = board_before.san(move)
    except Exception:
        played_san = move.uci()

    return {
        "best_move_san": best_san,
        "best_move_uci": best_move.uci() if best_move else None,
        "played_san": played_san,
        "played_uci": move.uci(),
        "best_score_cp": best_score,
        "played_score_cp": our_score_white,
        "best_move_elo": best_move_elo,
        "played_move_elo": played_move_elo,
        "elo_diff": elo_diff,
        "cpl": cpl,
        "ep_before": round(ep_before, 4),
        "ep_after": round(ep_after, 4),
        "ep_delta": round(ep_delta, 4),
        "ep_pre_position": round(ep_pre_position, 4),
        "win_pct_before": round(ep_before * 100, 2),
        "win_pct_after": round(ep_after * 100, 2),
        "win_pct_delta": round(ep_delta * 100, 2),
        "our_rank": our_rank,
        "is_forced_engine": len(reasonable) <= 2,
        "is_only_good_move": len(reasonable) <= 1,
        "n_reasonable_moves": len(reasonable),
        "n_legal": board_before.legal_moves.count(),
    }


def is_trade_capture(board_before: chess.Board, capture_move: chess.Move) -> bool:
    """True when the capture that took our piece is an equal/forced trade, not a hang."""
    if not board_before.is_capture(capture_move):
        return False
    see_val = see(board_before, capture_move)
    if _is_standard_piece_trade(board_before, capture_move, see_val):
        return True
    # Equal-ish exchange for the capturer (not a pure hanging-piece snatch).
    if EQUAL_TRADE_SEE_THRESHOLD <= see_val < WINNING_CAPTURE_SEE_THRESHOLD:
        return True
    return False


def quick_piece_recovery(
    moves: list[chess.Move],
    target_color: chess.Color,
    loss_ply: int,
    piece_mat_pre: int,
    within_plies: int = QUICK_RECOVERY_PLIES,
) -> bool:
    """True if piece material is recovered shortly after the loss (trade completed)."""
    board = board_at_ply(moves, loss_ply + 1)
    for move in moves[loss_ply + 1 : loss_ply + 1 + within_plies]:
        board.push(move)
        if piece_material(board, target_color) >= piece_mat_pre:
            return True
    return False


def detect_sustained_material_down(
    moves: list[chess.Move],
    target_color: chess.Color,
    loss_ply: int,
    sustained_plies: int = SUSTAINED_PLIES,
) -> bool:
    board = board_at_ply(moves, loss_ply + 1)
    if material_balance(board, target_color) >= 0:
        return False

    sustained = 0
    for move in moves[loss_ply + 1 :]:
        board.push(move)
        if material_balance(board, target_color) < 0:
            sustained += 1
            if sustained >= sustained_plies:
                return True
        else:
            return False
    return sustained >= sustained_plies


def find_lost_piece_square(board_before_capture: chess.Board, capture_move: chess.Move, target_color: chess.Color):
    piece = board_before_capture.piece_at(capture_move.to_square)
    if piece and piece.color == target_color and piece.piece_type in PIECE_TYPES:
        return capture_move.to_square
    return None


def analyze_game(
    pgn_text: str,
    engine,
    max_move_number: int = DEFAULT_MAX_MOVE,
    target_color_str: str = "both",
    game_index: int = 0,
) -> list[dict]:
    game = chess.pgn.read_game(io.StringIO(pgn_text))
    if game is None:
        return []

    headers = dict(game.headers)
    moves = list(game.mainline_moves())

    if target_color_str == "white":
        colors = [chess.WHITE]
    elif target_color_str == "black":
        colors = [chess.BLACK]
    else:
        colors = [chess.WHITE, chess.BLACK]

    results = []

    for color in colors:
        color_name = "white" if color == chess.WHITE else "black"
        if parse_game_result(headers, color) != "win":
            continue

        board = chess.Board()
        match = None

        for ply_index, move in enumerate(moves):
            full_move = board.fullmove_number
            if full_move > max_move_number:
                break

            piece_mat_pre = piece_material(board, color)
            mover = board.turn
            board_before = board.copy()

            try:
                capture_san = board.san(move)
            except Exception:
                capture_san = move.uci()

            board.push(move)
            piece_mat_post = piece_material(board, color)
            delta = piece_mat_post - piece_mat_pre

            if delta > -300:
                continue

            # Piece material for us only drops when the opponent captures our piece.
            if mover == color:
                continue
            if ply_index <= 0:
                continue

            # Culprit = our previous move that allowed the hang / blunder.
            culprit_ply = ply_index - 1
            culprit_board_before = board_at_ply(moves, culprit_ply)
            if culprit_board_before.turn != color:
                continue
            culprit_move = moves[culprit_ply]
            culprit_full_move = culprit_board_before.fullmove_number
            if culprit_full_move > max_move_number:
                continue

            # --- Trade filters ---
            if is_trade_capture(board_before, move):
                continue
            if quick_piece_recovery(moves, color, ply_index, piece_mat_pre):
                continue
            if not detect_sustained_material_down(moves, color, ply_index):
                continue

            # --- Unsavable / already-lost filters ---
            lost_sq = find_lost_piece_square(board_before, move, color)
            if lost_sq is not None:
                # Before our culprit move: piece must not have been already doomed.
                vuln_before_culprit = analyze_piece_vulnerability(
                    culprit_board_before, lost_sq, color
                )
                if vuln_before_culprit.get("already_lost_before_move"):
                    continue

                # After our culprit move (before capture): piece should now be hanging
                # because of what we just did (or we moved the piece into capture).
                board_after_culprit = culprit_board_before.copy()
                board_after_culprit.push(culprit_move)
                track_sq = culprit_move.to_square if culprit_move.from_square == lost_sq else lost_sq
                # If we moved the lost piece, track its landing square for vulnerability.
                piece_after = board_after_culprit.piece_at(track_sq)
                check_sq = track_sq if piece_after and piece_after.color == color else lost_sq
                if board_after_culprit.piece_at(check_sq):
                    vuln_after = analyze_piece_vulnerability(board_after_culprit, check_sq, color)
                    # If still not en prise and not the capture square, opponent capture
                    # may still be tactical — allow engine to decide.
                    _ = vuln_after

            # If our culprit itself was an equal trade capture, skip.
            if culprit_board_before.is_capture(culprit_move):
                if is_trade_capture(culprit_board_before, culprit_move):
                    continue

            # --- Engine: must be a real mistake (win% / Elo drop vs best) ---
            try:
                eval_info = evaluate_mistake(culprit_board_before, culprit_move, color, engine)
            except Exception:
                continue

            if eval_info["ep_pre_position"] < MIN_PRE_MOVE_EP:
                continue  # already basically lost
            if eval_info["is_only_good_move"]:
                continue  # no choice — not a self-inflicted giveaway
            if eval_info["n_legal"] <= 1:
                continue
            if eval_info["cpl"] < MIN_CPL_MISTAKE:
                continue
            if eval_info["ep_delta"] > MIN_EP_DROP:  # e.g. -0.05 is not enough drop
                continue
            if eval_info["elo_diff"] is not None and eval_info["elo_diff"] > -MIN_CPL_MISTAKE:
                # Require played line ≤ best by at least mistake-sized Elo/cp gap
                continue

            try:
                culprit_san = culprit_board_before.san(culprit_move)
            except Exception:
                culprit_san = culprit_move.uci()

            match = {
                "game_index": game_index,
                "classification": "pioneer_win",
                "winner_color": color_name,
                "piece_lost": lost_piece_type_from_delta(delta),
                "loss_move_number": culprit_full_move,
                "loss_ply": culprit_ply,
                "loss_uci": culprit_move.uci(),
                "loss_san": culprit_san,
                "capture_san": capture_san,
                "capture_uci": move.uci(),
                "capture_ply": ply_index,
                "material_delta_cp": delta,
                "net_balance_after_loss_cp": material_balance(board, color),
                "best_move_san": eval_info["best_move_san"],
                "best_move_uci": eval_info["best_move_uci"],
                "best_move_elo": eval_info["best_move_elo"],
                "played_move_elo": eval_info["played_move_elo"],
                "elo_diff": eval_info["elo_diff"],
                "cpl": eval_info["cpl"],
                "ep_before": eval_info["ep_before"],
                "ep_after": eval_info["ep_after"],
                "ep_delta": eval_info["ep_delta"],
                "win_pct_before": eval_info["win_pct_before"],
                "win_pct_after": eval_info["win_pct_after"],
                "win_pct_delta": eval_info["win_pct_delta"],
                "result": headers.get("Result", "?"),
                "white_player": headers.get("White", "?"),
                "black_player": headers.get("Black", "?"),
                "event": headers.get("Event", "?"),
                "date": headers.get("Date", "?"),
                "opening": headers.get("Opening", "?"),
                "eco": headers.get("ECO", "?"),
                "time_control": headers.get("TimeControl", "?"),
                "white_elo": headers.get("WhiteElo", "?"),
                "black_elo": headers.get("BlackElo", "?"),
            }
            break  # first qualifying loss for this color

        if match:
            results.append(match)

    return results


def run(payload: dict) -> dict:
    pgns = payload.get("pgns", [])
    max_move_number = int(payload.get("max_move_number", DEFAULT_MAX_MOVE))
    target_color = str(payload.get("target_color", "both")).lower()
    engine_path = payload.get("engine_path") or STOCKFISH_PATH

    if isinstance(pgns, str):
        pgns = [pgns]

    if not os.path.isfile(engine_path):
        return {"error": f"Stockfish not found at {engine_path}", "pioneer_wins": [], "matched_games": 0, "total_games": len(pgns)}

    all_pioneer_wins = []
    engine = chess.engine.SimpleEngine.popen_uci(engine_path)
    try:
        engine.configure({"Threads": 1, "Hash": 128})
        for idx, pgn_text in enumerate(pgns):
            if not pgn_text or not str(pgn_text).strip():
                continue
            matches = analyze_game(
                str(pgn_text),
                engine=engine,
                max_move_number=max_move_number,
                target_color_str=target_color,
                game_index=idx,
            )
            all_pioneer_wins.extend(matches)
    finally:
        engine.quit()

    return {
        "total_games": len(pgns),
        "matched_games": len(all_pioneer_wins),
        "pioneer_wins": all_pioneer_wins,
        "config": {
            "max_move_number": max_move_number,
            "max_ply": max_move_number * 2,
            "target_color": target_color,
            "piece_types_checked": ["queen", "rook", "bishop", "knight"],
            "pawns_excluded": True,
            "min_cpl_mistake": MIN_CPL_MISTAKE,
            "min_ep_drop": MIN_EP_DROP,
            "min_pre_move_ep": MIN_PRE_MOVE_EP,
            "trades_excluded": True,
            "unsavable_excluded": True,
            "engine_path": engine_path,
        },
    }


def _load_payload() -> dict:
    if len(sys.argv) >= 2 and sys.argv[1] not in ("-", "--stdin"):
        return json.loads(sys.argv[1])
    return json.load(sys.stdin)


def main():
    try:
        payload = _load_payload()
    except Exception as e:
        print(json.dumps({"error": f"Invalid JSON: {e}"}))
        return 1

    result = run(payload)
    print(json.dumps(result))
    return 0 if "error" not in result else 1


if __name__ == "__main__":
    sys.exit(main())
