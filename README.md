# Board Game / Polyhex Experiment

This repository appears to be an experiment around placing hex tiles on a hex grid and studying which connected shapes are possible under a fairly strict local rule. It is not a full game implementation with turns, scoring, or win conditions. The code focuses on enumerating valid tile layouts, verifying the counts with independent solvers, and rendering the results as a small browser gallery.

## What the project is trying to do

From the code, the intended object is a connected set of `N` hex cells, usually called a polyhex.

The rule implemented throughout the repo is:

- Choose exactly `N` hex cells.
- The chosen cells must form a connected shape.
- Every chosen cell must share an edge with at least 3 other chosen cells.
- Shapes are treated as the same if they differ only by translation, rotation, or reflection on the hex grid.

In other words, this project is searching for dense polyhexes, not all polyhexes.

The browser pages then group valid shapes by the abstract adjacency graph induced by the cells:

- Vertices = tile centers.
- Edges = two tiles touching along a side.

## Main findings currently encoded in the repo

The gallery and verification files agree on these counts of valid polyhexes:

| N | Valid polyhexes | Unique adjacency graphs |
|---|---:|---:|
| 7 | 1 | 1 |
| 8 | 0 | 0 |
| 9 | 0 | 0 |
| 10 | 1 | 1 |
| 11 | 0 | 0 |
| 12 | 3 | 3 |
| 13 | 2 | 2 |
| 14 | 4 | 4 |
| 15 | 10 | 10 |
| 16 | 19 | 17 |
| 17 | 38 | 33 |
| 18 | 90 | 76 |

The smallest non-empty case is `N = 7`, which the site describes as the centered hex flower.

## How the repo is organized

- `index.html` lists the available `N` values and summarizes the rule.
- `n7.html` through `n18.html` are gallery pages for specific sizes.
- `main.js` loads precomputed polyhex data, groups shapes by graph isomorphism labels, and renders the gallery.
- `polyhex-data.js` stores the generated valid shapes.
- `polyhex-groups.json` stores grouping labels for graph-isomorphism classes.
- `build-data.mjs` is the main smart enumerator for valid polyhexes.
- `polyhex.js` contains a simpler free-polyhex enumerator plus the degree filter.
- `solve_polyhex.py` builds and runs the CUDA brute-force verifier and writes `verification.json`.
- `polyhex_cpsat.py` uses OR-Tools CP-SAT as an independent verifier and writes `verification-cpsat.json`.
- `verify_groups.py` uses NetworkX VF2 isomorphism to compute the true graph groups.

## How to view it

Because the pages fetch local JSON files, it is best to serve the folder with a small static web server instead of opening the HTML directly from disk.

Example:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

## How to regenerate data

### Build the main polyhex dataset

```bash
node build-data.mjs 18
```

This rewrites `polyhex-data.js` with valid shapes through the requested `N`.

### Recompute graph-isomorphism groups

```bash
python verify_groups.py
```

This writes `polyhex-groups.json`.

### Run independent verification with CP-SAT

```bash
python polyhex_cpsat.py 18
```

This writes `verification-cpsat.json` and will auto-create a local `.venv` and install `ortools` if needed.

### Run independent verification with CUDA

```bash
python solve_polyhex.py 15
```

This builds `polyhex_brute.cu` with `nvcc`, runs the GPU verifier, and writes `verification.json`.

## Important caveat

If the original intent was a playable board game, the actual gameplay rules are not present here. What is clearly implemented is a search problem:

- place up to `N` hex tiles,
- keep the shape connected,
- require each placed tile to touch at least 3 others,
- and study the resulting unique shapes and their adjacency graphs.

So the most accurate short description is:

> A polyhex enumeration and visualization project for connected hex-tile layouts where every tile has degree at least 3.