#!/usr/bin/env python3
"""
Use networkx's VF2 isomorphism to compute the true number of distinct
abstract graphs per N, and produce a per-polyhex group index that the
web page can use directly (so we never recompute possibly-broken WL
hashes in the browser).

Outputs polyhex-groups.json:
  {
    "<N>": { "groups": <int>, "labels": [<group_idx_for_each_polyhex>...] },
    ...
  }
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
import venv
from pathlib import Path


def _bootstrap_venv():
    try:
        import networkx  # noqa: F401
        return
    except ImportError:
        pass
    here = Path(__file__).resolve().parent
    vroot = here / ".venv"
    vpy = vroot / "bin" / "python3"
    if not vpy.exists():
        print(f"[*] creating venv at {vroot} ...", flush=True)
        venv.create(vroot, with_pip=True)
    print("[*] installing networkx ...", flush=True)
    subprocess.run([str(vpy), "-m", "pip", "install", "--quiet", "networkx"],
                   check=True)
    os.execv(str(vpy), [str(vpy), __file__, *sys.argv[1:]])


_bootstrap_venv()

import networkx as nx  # noqa: E402

NEIGHBORS = [(1, -1), (1, 0), (0, 1), (-1, 1), (-1, 0), (0, -1)]


def load_polyhex_data():
    here = Path(__file__).resolve().parent
    src = (here / "polyhex-data.js").read_text()
    m = re.search(r"POLYHEX_DATA\s*=\s*({.*?})\s*;", src, re.S)
    if not m:
        raise SystemExit("could not parse polyhex-data.js")
    return json.loads(m.group(1))


def polyhex_to_graph(cells):
    cell_to_idx = {(c[0], c[1]): i for i, c in enumerate(cells)}
    g = nx.Graph()
    for i in range(len(cells)):
        g.add_node(i)
    for i, (q, r) in enumerate(cells):
        for dq, dr in NEIGHBORS:
            nb = (q + dq, r + dr)
            j = cell_to_idx.get(nb)
            if j is not None and i < j:
                g.add_edge(i, j)
    return g


def group_by_iso(graphs):
    """Pre-bucket by cheap invariants (sorted degree sequence + edge count),
    then run VF2 only within each bucket.  labels[i] = group index of graph i."""
    n = len(graphs)
    labels = [-1] * n
    next_group = 0
    bucket = {}
    for i, g in enumerate(graphs):
        deg_seq = tuple(sorted(d for _, d in g.degree()))
        key = (g.number_of_edges(), deg_seq)
        bucket.setdefault(key, []).append(i)
    for key, idxs in bucket.items():
        # Within bucket: pairwise VF2.
        reps = []  # list of (graph_idx, group_label)
        for i in idxs:
            matched = None
            for rep_i, rep_label in reps:
                if nx.is_isomorphic(graphs[i], graphs[rep_i]):
                    matched = rep_label
                    break
            if matched is None:
                matched = next_group
                next_group += 1
                reps.append((i, matched))
            labels[i] = matched
    return labels, next_group


def main():
    data = load_polyhex_data()
    out = {}
    total_t = time.time()
    for N in sorted((int(k) for k in data.keys())):
        shapes = data[str(N)]
        if not shapes:
            out[str(N)] = {"groups": 0, "labels": []}
            continue
        t0 = time.time()
        graphs = [polyhex_to_graph(s) for s in shapes]
        labels, n_groups = group_by_iso(graphs)
        ms = int((time.time() - t0) * 1000)
        out[str(N)] = {"groups": n_groups, "labels": labels}
        print(f"N={N}: {len(shapes)} polyhexes, {n_groups} unique graphs [{ms} ms]",
              flush=True)
    print(f"[*] total {time.time() - total_t:.1f} s", flush=True)
    out_path = Path(__file__).resolve().parent / "polyhex-groups.json"
    out_path.write_text(json.dumps(out))
    print(f"[*] wrote {out_path.name}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
