#!/usr/bin/env python3
"""
Independent CP-SAT verification of the polyhex degree-3 rule enumeration.

For each N in [7, maxN]:
  - Take the cells of a hex disk of radius R (we use R = 6 = 127 cells).
  - Boolean x[c] = 1 iff cell c is selected.
  - Pin the polyhex's lex-min cell to (0, 0):
      * x[(0,0)] = 1
      * x[c] = 0 for every cell c strictly less than (0, 0) in (r, q) lex order.
    Together this means the polyhex always lives in the "after origin" half.
  - sum(x) = N.
  - x[c] => sum(x[neighbours(c)]) >= 3   (degree-3 rule, reified).
  - SearchForAllSolutions, dump each model to Python.
  - Post-filter: drop disconnected sets.
  - Dedupe by the 12-element D6 canonical form to get the count of free
    polyhexes.

Each step is a completely separate algorithm from the JS smart enumerator
and the CUDA brute force, so a matching count is strong cross-validation.

Usage:  python3 polyhex_cpsat.py [maxN]
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import venv
from pathlib import Path


def _bootstrap_venv():
    try:
        import ortools  # noqa: F401
        return
    except ImportError:
        pass
    here = Path(__file__).resolve().parent
    vroot = here / ".venv"
    vpy = vroot / "bin" / "python3"
    if not vpy.exists():
        print(f"[*] creating venv at {vroot} ...", flush=True)
        venv.create(vroot, with_pip=True)
    print("[*] installing ortools ...", flush=True)
    subprocess.run([str(vpy), "-m", "pip", "install", "--quiet", "ortools"],
                   check=True)
    os.execv(str(vpy), [str(vpy), __file__, *sys.argv[1:]])


_bootstrap_venv()

from ortools.sat.python import cp_model  # noqa: E402

NEIGHBORS = [(1, -1), (1, 0), (0, 1), (-1, 1), (-1, 0), (0, -1)]
MIN_DEGREE = 3
RADIUS = 7


def hex_distance(q, r):
    return (abs(q) + abs(r) + abs(q + r)) // 2


def hex_disk(radius):
    return [(q, r) for q in range(-radius, radius + 1)
            for r in range(-radius, radius + 1)
            if hex_distance(q, r) <= radius]


def apply_symmetry(cells, rot, mirror):
    out = []
    for q, r in cells:
        if mirror:
            q, r = q + r, -r
        for _ in range(rot):
            q, r = -r, q + r
        out.append((q, r))
    return out


def normalize(cells):
    min_q = min(c[0] for c in cells)
    min_r = min(c[1] for c in cells)
    return tuple(sorted((q - min_q, r - min_r) for q, r in cells))


def canonical_key(cells):
    best = None
    for m in range(2):
        for rot in range(6):
            t = normalize(apply_symmetry(cells, rot, m == 1))
            if best is None or t < best:
                best = t
    return best


def is_connected(cells):
    if not cells:
        return True
    cs = set(cells)
    seen = {cells[0]}
    stack = [cells[0]]
    while stack:
        q, r = stack.pop()
        for dq, dr in NEIGHBORS:
            n = (q + dq, r + dr)
            if n in cs and n not in seen:
                seen.add(n)
                stack.append(n)
    return len(seen) == len(cs)


def is_after_origin(q, r):
    return r > 0 or (r == 0 and q > 0)


def enumerate_for_n(N):
    cells = hex_disk(RADIUS)
    idx = {c: i for i, c in enumerate(cells)}
    origin_i = idx[(0, 0)]
    nbrs = [[] for _ in cells]
    for i, (q, r) in enumerate(cells):
        for dq, dr in NEIGHBORS:
            c = (q + dq, r + dr)
            if c in idx:
                nbrs[i].append(idx[c])

    model = cp_model.CpModel()
    x = [model.NewBoolVar(f"x_{i}") for i in range(len(cells))]

    # Pin lex-min to origin.
    model.Add(x[origin_i] == 1)
    for i, (q, r) in enumerate(cells):
        if (q, r) != (0, 0) and not is_after_origin(q, r):
            model.Add(x[i] == 0)

    # Size.
    model.Add(sum(x) == N)

    # Degree-3 (reified by x[i]).
    for i in range(len(cells)):
        model.Add(sum(x[j] for j in nbrs[i]) >= MIN_DEGREE).OnlyEnforceIf(x[i])

    solutions = []

    class Collector(cp_model.CpSolverSolutionCallback):
        def on_solution_callback(self):
            sel = [cells[i] for i in range(len(cells)) if self.Value(x[i])]
            solutions.append(sel)

    solver = cp_model.CpSolver()
    solver.parameters.enumerate_all_solutions = True
    solver.parameters.num_search_workers = 1  # required for enumerate-all
    solver.Solve(model, Collector())

    connected = [s for s in solutions if is_connected(s)]
    seen = set()
    unique = []
    for s in connected:
        k = canonical_key(s)
        if k not in seen:
            seen.add(k)
            unique.append(s)

    return unique, len(solutions), len(connected)


def main():
    max_n = int(sys.argv[1]) if len(sys.argv) > 1 else 18

    here = Path(__file__).resolve().parent
    out = {
        "source": (
            "polyhex_cpsat.py (OR-Tools CP-SAT, hex disk r=%d, origin-pinned, "
            "post-connectivity, D6 dedup)" % RADIUS
        ),
        "max_n": max_n,
        "counts": {},
    }

    t_total = time.time()
    for N in range(7, max_n + 1):
        t0 = time.time()
        unique, raw, connected = enumerate_for_n(N)
        ms = int((time.time() - t0) * 1000)
        out["counts"][str(N)] = {
            "valid_polyhexes": len(unique),
            "raw_solutions": raw,
            "connected_solutions": connected,
            "ms": ms,
        }
        print(
            f"N={N}: {len(unique)} valid · "
            f"{raw} solver solutions → {connected} connected → {len(unique)} unique "
            f"[{ms} ms]",
            flush=True,
        )

    print(f"[*] total wall time: {time.time() - t_total:.1f} s", flush=True)
    out_path = here / "verification-cpsat.json"
    out_path.write_text(json.dumps(out, indent=2))
    print(f"[*] wrote {out_path.name}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
