"""
Split lichess_db_puzzle.csv into chunks of 50,000 data rows each.
Each output file keeps the same header. Files are written next to the source CSV.
"""

from __future__ import annotations

import csv
from pathlib import Path

CHUNK_SIZE = 50_000
SOURCE_NAME = "lichess_db_puzzle.csv"
OUTPUT_PREFIX = "lichess_db_puzzle_part"


def main() -> None:
    folder = Path(__file__).resolve().parent
    source = folder / SOURCE_NAME

    if not source.is_file():
        raise SystemExit(f"Source not found: {source}")

    print(f"Reading: {source}")
    print(f"Chunk size: {CHUNK_SIZE:,} rows")

    part = 0
    rows_in_part = 0
    total_rows = 0
    out_file = None
    writer = None

    def open_part(n: int):
        path = folder / f"{OUTPUT_PREFIX}_{n:04d}.csv"
        f = path.open("w", encoding="utf-8", newline="")
        print(f"Writing: {path.name}")
        return f, path

    with source.open("r", encoding="utf-8", newline="") as infile:
        reader = csv.reader(infile)
        try:
            header = next(reader)
        except StopIteration:
            raise SystemExit("Source CSV is empty")

        for row in reader:
            if out_file is None or rows_in_part >= CHUNK_SIZE:
                if out_file is not None:
                    out_file.close()
                    print(f"  -> closed part {part:04d} ({rows_in_part:,} rows)")
                part += 1
                rows_in_part = 0
                out_file, _ = open_part(part)
                writer = csv.writer(out_file)
                writer.writerow(header)

            writer.writerow(row)
            rows_in_part += 1
            total_rows += 1

            if total_rows % 500_000 == 0:
                print(f"  ... processed {total_rows:,} rows")

    if out_file is not None:
        out_file.close()
        print(f"  -> closed part {part:04d} ({rows_in_part:,} rows)")

    print(f"Done. {total_rows:,} data rows -> {part} file(s) in {folder}")


if __name__ == "__main__":
    main()
