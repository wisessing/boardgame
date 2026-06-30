#!/usr/bin/env python3
"""
Build & run the GPU brute-force polyhex enumerator, then write
verification.json that the web pages can pick up.

Usage:  python3 solve_polyhex.py [maxN]
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CU_SRC = ROOT / "polyhex_brute.cu"
GPU_BIN = ROOT / "polyhex_brute"
OUT_JSON = ROOT / "verification.json"


def detect_cc() -> str:
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=compute_cap", "--format=csv,noheader"],
            text=True,
        )
        major, minor = out.strip().splitlines()[0].strip().split(".")
        return f"sm_{major}{minor}"
    except Exception:
        return "sm_121"


def build() -> None:
    if shutil.which("nvcc") is None:
        sys.exit("nvcc not found; CUDA toolkit required")
    if GPU_BIN.exists() and GPU_BIN.stat().st_mtime > CU_SRC.stat().st_mtime:
        return
    arch = detect_cc()
    cmd = ["nvcc", "-O3", "-std=c++17", f"-arch={arch}",
           str(CU_SRC), "-o", str(GPU_BIN)]
    print(f"[*] {' '.join(cmd)}", flush=True)
    t0 = time.time()
    subprocess.run(cmd, check=True)
    print(f"[*] built in {time.time() - t0:.1f} s", flush=True)


LINE = re.compile(r"^N=(\d+):\s+(\d+) polyhexes,\s+(\d+) valid\s*\[(\d+) ms\]")


def run(max_n: int) -> dict[int, dict]:
    print(f"[*] running ./polyhex_brute {max_n} ...", flush=True)
    t0 = time.time()
    proc = subprocess.run([str(GPU_BIN), str(max_n)],
                          capture_output=True, text=True)
    sys.stdout.write(proc.stdout)
    if proc.stderr:
        sys.stderr.write(proc.stderr)
    if proc.returncode != 0:
        sys.exit(f"polyhex_brute exited with rc={proc.returncode}")
    results: dict[int, dict] = {}
    for line in proc.stdout.splitlines():
        m = LINE.match(line)
        if not m:
            continue
        n = int(m.group(1))
        results[n] = {
            "total_polyhexes": int(m.group(2)),
            "valid_polyhexes": int(m.group(3)),
            "ms": int(m.group(4)),
        }
    print(f"[*] gpu wall time: {time.time() - t0:.1f} s", flush=True)
    return results


def main(argv: list[str]) -> int:
    max_n = int(argv[1]) if len(argv) > 1 else 15
    build()
    results = run(max_n)
    payload = {
        "source": "polyhex_brute.cu (GPU level-wise BFS, D6 dedup, deg>=3 filter at leaf)",
        "max_n": max_n,
        "counts": {str(k): v for k, v in sorted(results.items())},
    }
    OUT_JSON.write_text(json.dumps(payload, indent=2))
    print(f"[*] wrote {OUT_JSON.name}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
