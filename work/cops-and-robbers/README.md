# Cops and Robbers — faster dismantlability + cop number

Java reimplementation of the base `Dismantable_V2` program, optimised and extended.
Both tools take a **Laplacian matrix** as input.

| File | Entry point | Input | Output |
|------|-------------|-------|--------|
| `Dismantlable.java` | `isDismantlable(int[][] L)` | Laplacian | `boolean` — is the graph dismantlable (cop-win)? |
| `CopNumber.java` | `copNumber(int[][] L)`, `isKCopWin(int[][] L, int k)` | Laplacian | `int` — the cop number `c(G)`, resp. a `boolean` for fixed `k` |
| `Tests.java` | `main` | — | known-graph + invariant checks |
| `FuzzAndBench.java` | `main` | — | differential fuzz vs. the original + benchmark |

Edges are read from the off-diagonal entries (`L[i][j] != 0` ⇒ edge `i~j`, as in any
Laplacian where the off-diagonal is `-w_ij ≤ 0`); the diagonal is recomputed from the
adjacency, so weighted Laplacians work too.

## Build & run

No build tool needed — plain `javac`/`java` (JDK 8+):

```sh
javac *.java
java Dismantlable     # the three original examples
java CopNumber        # cop numbers of the three originals
java Tests            # full validation suite (exits non-zero on failure)
java FuzzAndBench     # 24.5k-graph differential fuzz + speed benchmark
```

## What makes the dismantlability check faster

The base version re-scans every ordered pair to find one corner (`O(n³)`), rebuilds an
`(n-1)×(n-1)` matrix (`O(n²)`), then recurses from scratch — about `O(n⁴)` with heavy
array-copy/GC overhead. The rewrite uses three facts:

1. A pitfall's dominator is always a **neighbour** (since `u ∈ N[u] ⊆ N[d]` forces `d~u`),
   so only neighbours are tested.
2. Deleting `u` can create a new pitfall **only among `u`'s surviving neighbours**, so a
   work-queue re-examines just those — never the whole graph.
3. Closed neighbourhoods are stored as **machine-word bitsets**, so each
   `N[u] ⊆ N[v]` test costs `O(n/64)` AND/ANDNOT ops, and deletion is one cleared bit (no
   matrix is ever copied).

Measured speed-up over the original (`FuzzAndBench`): ~26× on dense `K₈₀₀`, ~3000× on a
sparse path `P₆₄₀₀` (49 s → 16 ms). Both always return the same answer (verified on 24,500
random graphs).

## k-cop-win / cop number

`CopNumber` implements Petr, Portier & Versteegen, *"A faster algorithm for Cops and
Robbers"*, Discrete Applied Mathematics 320 (2022), arXiv:2112.07449 — an
`O(k·n^(k+2))` decision for k-cop-win (vs. the naive `O(n^(2k+2))`). It builds a state
graph where one piece moves per step and labels every cop-winning state by backward BFS,
using an **escape counter** on robber-turn states (winning once every robber move loses)
and first-hit marking on cop-turn states (winning once any cop move wins). `copNumber`
returns the least `k` for which `isKCopWin` holds.

## ⚠️ Note on the original `matrix_C4`

The matrix labelled `matrix_C4` in the base program has **every** off-diagonal set to
`-1`, which encodes the **complete graph K₄** (all pairs adjacent), not a 4-cycle — and
its rows don't sum to zero, so it isn't a valid Laplacian. Both the original program and
this one therefore report it as **dismantlable / cop number 1** (correct for K₄). A true
4-cycle Laplacian (`degree 2`, each vertex adjacent to exactly two others) is **not**
dismantlable and has cop number **2** — see the `C4` case in `Tests.java`.
