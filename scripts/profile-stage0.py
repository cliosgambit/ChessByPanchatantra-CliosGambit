"""Profile Stage 0 analyze_move hotspots on a PGN."""
import io
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend" / "brilliance"))

import chess
import chess.pgn
import brilliance_stage0 as s0
from brilliance_gates import compute_engine_candidacy

PGN = """[Event "Live Chess"]
1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Ke8
8. Bxd5 Qe7 9. O-O Qf6 10. Bxc6+ bxc6 11. Qxf6 gxf6 12. Nc3 Bf5 13. d3 Bb4 14.
a3 Bxc3 15. bxc3 e4 16. dxe4 Bxe4 17. Ra2 Kf7 18. Re1 Rae8 19. c4 Rhg8 20. c3
Rxg2+ 21. Kf1 Rg6 22. f3 Bd3+ 23. Kf2 Rxe1 24. Kxe1 Rg1+ 25. Kd2 Bxc4 26. Rb2
Rg2+ 27. Ke3 Rxb2 28. Bxb2 Ke6 29. f4 f5 30. Kd4 Bd5 31. c4 Be4 32. a4 a5 33. c5
Bc2 34. Bc3 Bxa4 35. Bxa5 Kd7 36. Ke5 Bc2 37. Kf6 Bd3 38. h4 Kd8 39. h5 Ke8 40.
h6 Kf8 41. Bxc7 Bc2 42. Bd6+ Kg8 43. Kg5 Kf7 44. Be5 Be4 45. Bf6 Bf3 46. Bg7 Be4
47. Bf6 Bb1 48. Ba1 Bc2 49. Be5 Be4 50. Bd6 Ke6 51. Kh5 Bf3+ 52. Kg5 Bg4 53. Kh4
Kf6 54. Kg3 Kg6 55. Kh4 Bd1 56. Bf8 Be2 57. Bg7 Bg4 58. Bf8 Bd1 59. Bg7 Bg4 60.
Kg3 Kh5 61. Kf2 Bh3 62. Ke3 Kg4 63. Bf8 Bg2 64. Bg7 Be4 65. Bf8 Bd5 66. Bd6 Be4
67. Be5 Bd5 68. Bg7 Be4 69. Be5 Kh5 70. Bg7 Bb1 71. Kd4 Kg4 72. Ke5 Ba2 73. Bf8
Bb1 74. Bd6 Be4 75. Bf8 Bb1 76. Bg7 Be4 77. Bf8 Bb1 1/2-1/2"""

BUCKETS = [
    "board_copy_push",
    "is_sacrifice_candidate",
    "analyze_piece_vulnerability",
    "king_safety_x2",
    "tactical_multiplexing",
    "expectation_violation",
    "piece_harmony",
    "quiet_brilliant_detector",
    "defensive_context",
    "novelty",
    "compute_engine_candidacy",
    "pack_result_misc",
]


def timed(acc, key, fn):
    t0 = time.perf_counter()
    out = fn()
    acc[key] = acc.get(key, 0.0) + (time.perf_counter() - t0)
    return out


def profile_move(board, move, ply_index, acc):
    color = board.turn

    def copy_push():
        b = board.copy()
        b.push(move)
        return b

    board_after = timed(acc, "board_copy_push", copy_push)
    timed(acc, "is_sacrifice_candidate", lambda: s0.is_sacrifice_candidate(board, move, color, ply_index=ply_index))
    timed(acc, "analyze_piece_vulnerability", lambda: s0.analyze_piece_vulnerability(board, move.from_square, color))
    timed(
        acc,
        "king_safety_x2",
        lambda: (s0.king_safety(board, not color), s0.king_safety(board_after, not color)),
    )
    timed(acc, "tactical_multiplexing", lambda: s0.tactical_multiplexing(board, board_after, color))
    timed(acc, "expectation_violation", lambda: s0.expectation_violation(board, move, color))
    timed(acc, "piece_harmony", lambda: s0.piece_harmony(board, board_after, color))
    timed(acc, "quiet_brilliant_detector", lambda: s0.quiet_brilliant_detector(board, move, color))
    timed(acc, "defensive_context", lambda: s0.defensive_context(board, color))

    def novelty():
        phase = s0.game_phase(board)
        mp = board.piece_at(move.from_square)
        # approximate: see_value lookup is cheap vs full sac; measure novelty helpers only
        st = s0._infer_novelty_sac_type(board, move, 0, mp)
        return s0.compute_novelty_score(ply_index, phase, st)

    timed(acc, "novelty", novelty)
    timed(acc, "compute_engine_candidacy", lambda: compute_engine_candidacy(board, move, ply_index))


def main():
    game = chess.pgn.read_game(io.StringIO(PGN))
    board = game.board()
    acc = {}
    n = 0
    t_all0 = time.perf_counter()
    for ply, move in enumerate(game.mainline_moves()):
        profile_move(board, move, ply, acc)
        board.push(move)
        n += 1
    total = time.perf_counter() - t_all0

    # Also time stock analyze_pgn
    t0 = time.perf_counter()
    result = s0.analyze_pgn(PGN)
    analyze_ms = (time.perf_counter() - t0) * 1000

    print(f"moves={n}")
    print(f"profiled_total={total*1000:.0f} ms  ({total*1000/n:.1f} ms/move)")
    print(f"analyze_pgn_wall={analyze_ms:.0f} ms  ({analyze_ms/n:.1f} ms/move)")
    print(f"sac_candidates={result['sacrifice_candidate_count']} engine_cands={result['engine_candidate_count']}")
    print()
    print(f"{'function':<32} {'total_ms':>10} {'ms/move':>10} {'share':>8}")
    rows = sorted(acc.items(), key=lambda x: -x[1])
    for k, v in rows:
        print(f"{k:<32} {v*1000:10.1f} {v*1000/n:10.2f} {100*v/total:7.1f}%")
    accounted = sum(acc.values())
    print(f"{'(unaccounted)':<32} {(total-accounted)*1000:10.1f} {(total-accounted)*1000/n:10.2f} {100*(total-accounted)/total:7.1f}%")


if __name__ == "__main__":
    main()
