"""Drill into compute_engine_candidacy / resolve_engine_candidate cost."""
import io
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend" / "brilliance"))

import chess
import chess.pgn
import brilliance_stage0 as s0
import brilliance_gates as gates
from brilliance_stage1 import analyze_stage1_move

PGN = """1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Ke8
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


def add(acc, k, dt):
    acc[k] = acc.get(k, 0.0) + dt


def main():
    game = chess.pgn.read_game(io.StringIO(PGN))
    board = game.board()
    acc = {}
    path_counts = {}
    n = 0

    for ply, move in enumerate(game.mainline_moves()):
        color = board.turn
        t0 = time.perf_counter()
        sac0 = s0.is_sacrifice_candidate(board, move, color, ply_index=ply)
        add(acc, "candidacy.is_sacrifice_candidate", time.perf_counter() - t0)

        t0 = time.perf_counter()
        quiet = s0.quiet_brilliant_detector(board, move, color)
        add(acc, "candidacy.quiet_detector", time.perf_counter() - t0)

        t0 = time.perf_counter()
        def_ctx = s0.defensive_context(board, color)
        add(acc, "candidacy.defensive_context", time.perf_counter() - t0)

        t0 = time.perf_counter()
        candidate, path = gates.resolve_engine_candidate(board, move, ply)
        add(acc, "candidacy.resolve_engine_candidate", time.perf_counter() - t0)
        path_counts[path or "none"] = path_counts.get(path or "none", 0) + 1

        # Sub-profile resolve pieces independently (extra work, for insight)
        t0 = time.perf_counter()
        gates._move_brilliance_context(board, move, color)
        add(acc, "resolve._move_brilliance_context", time.perf_counter() - t0)

        t0 = time.perf_counter()
        analyze_stage1_move(board, move, ply)
        add(acc, "resolve.analyze_stage1_move", time.perf_counter() - t0)

        t0 = time.perf_counter()
        gates.defensive_engine_candidate(board, move, color)
        add(acc, "resolve.defensive_engine_candidate", time.perf_counter() - t0)

        board.push(move)
        n += 1

    total = sum(acc.values())
    print(f"moves={n}  path_counts={path_counts}")
    print(f"\n{'part':<40} {'total_ms':>10} {'ms/move':>10} {'share*':>8}")
    for k, v in sorted(acc.items(), key=lambda x: -x[1]):
        print(f"{k:<40} {v*1000:10.1f} {v*1000/n:10.2f} {100*v/total:7.1f}%")
    print("\n* share is among profiled parts only (some overlap by design)")


if __name__ == "__main__":
    main()
