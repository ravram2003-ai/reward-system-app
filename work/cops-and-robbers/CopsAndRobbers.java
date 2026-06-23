import java.util.ArrayDeque;
import java.util.Random;

/**
 * Cops and Robbers — single-file edition.
 *
 * Everything in one compilation unit so it can be pasted and run at once:
 *   javac CopsAndRobbers.java
 *   java  CopsAndRobbers          # original examples + full validation suite
 *   java  CopsAndRobbers bench    # also runs the 24.5k-graph fuzz + speed benchmark (slow)
 *
 * Two deliverables, both taking a Laplacian matrix as input:
 *   Dismantlable.isDismantlable(L) -> boolean : is the graph dismantlable (cop-win)?
 *   CopNumber.copNumber(L)         -> int     : the cop number c(G)
 *   CopNumber.isKCopWin(L, k)      -> boolean : can k cops win?
 *
 * Only CopsAndRobbers is public (it must match the file name); the rest are
 * package-private top-level classes, which Java allows in the same file.
 */
public class CopsAndRobbers {

    public static void main(String[] args) {
        int[][] matrix_P4 = {
            { 1, -1,  0,  0 },
            { -1,  2, -1,  0 },
            { 0, -1,  2, -1 },
            { 0,  0, -1,  1 }
        };
        int[][] matrix_C4 = { // NB: all off-diagonals -1 -> this is actually K4, not a 4-cycle
            { 3, -1, -1, -1 },
            { -1,  2, -1, -1 },
            { -1, -1,  2, -1 },
            { -1, -1, -1,  3 }
        };
        int[][] matrix_S4 = {
            { 3, -1,  0, -1, -1,  0,  0,  0 },
            { -1,  3, -1,  0,  0, -1,  0,  0 },
            { 0, -1,  3, -1,  0,  0, -1,  0 },
            { -1,  0, -1,  3,  0,  0,  0, -1 },
            { -1,  0,  0,  0,  1,  0,  0,  0 },
            { 0, -1,  0,  0,  0,  1,  0,  0 },
            { 0,  0, -1,  0,  0,  0,  1,  0 },
            { 0,  0,  0, -1,  0,  0,  0,  1 }
        };

        System.out.println("===== original examples =====");
        System.out.println("matrix_P4 is dismantable:" + Dismantlable.isDismantlable(matrix_P4));
        System.out.println("matrix_C4 is dismantable:" + Dismantlable.isDismantlable(matrix_C4));
        System.out.println("matrix_S4 is dismantable:" + Dismantlable.isDismantlable(matrix_S4));
        System.out.println("matrix_P4 cop number: " + CopNumber.copNumber(matrix_P4));
        System.out.println("matrix_C4 cop number: " + CopNumber.copNumber(matrix_C4));
        System.out.println("matrix_S4 cop number: " + CopNumber.copNumber(matrix_S4));

        System.out.println("\n===== validation suite =====");
        Tests.run();

        if (args.length > 0 && args[0].equalsIgnoreCase("bench")) {
            System.out.println("\n===== fuzz + benchmark (slow) =====");
            FuzzAndBench.run();
        } else {
            System.out.println("\n(Pass arg 'bench' to also run the 24.5k-graph fuzz + speed benchmark.)");
        }
    }
}

/**
 * Fast recognition of dismantlable (cop-win / 1-cop-win) graphs.
 *
 * INPUT  : a Laplacian matrix L (off-diagonal L[i][j] != 0 == edge i~j; diagonal = degree).
 * OUTPUT : boolean -- true iff the graph is dismantlable.
 *
 * THEORY (Aigner-Fromme 1984; Nowakowski-Winkler / Quilliot): a graph is cop-win iff it
 * reduces to a single vertex by repeatedly deleting "pitfalls". Vertex u is a pitfall
 * dominated by d iff N[u] subseteq N[d] (closed neighbourhoods). The reduction is
 * CONFLUENT: removing any pitfall, in any order, never changes the answer.
 *
 * Speed-up over the naive O(n^4) rebuild-and-recurse:
 *   1. a pitfall's dominator is always a NEIGHBOUR (u in N[u] subseteq N[d] forces d~u);
 *   2. deleting u can create new pitfalls only among u's surviving NEIGHBOURS, so a
 *      work-queue re-examines just those -- never the whole graph;
 *   3. closed neighbourhoods are machine-word BITSETS, so each subset test is O(n/64)
 *      and deletion is one cleared bit (no matrix is ever copied).
 */
class Dismantlable {

    public static boolean isDismantlable(int[][] L) {
        final int n = L.length;
        if (n <= 1) return true;

        final int words = (n + 63) >>> 6;

        final long[][] closed = new long[n][words];     // N[v] = {v} union neighbours(v)
        final long[][] adjacency = new long[n][words];   // open neighbourhood (to walk neighbours)
        for (int v = 0; v < n; v++) {
            if (L[v].length != n) throw new IllegalArgumentException("matrix must be square");
            setBit(closed[v], v);
            for (int u = 0; u < n; u++) {
                if (u != v && L[v][u] != 0) {
                    setBit(closed[v], u);
                    setBit(adjacency[v], u);
                }
            }
        }

        final long[] alive = new long[words];
        for (int v = 0; v < n; v++) setBit(alive, v);
        int aliveCount = n;

        final ArrayDeque<Integer> queue = new ArrayDeque<>();
        final boolean[] queued = new boolean[n];
        for (int v = 0; v < n; v++) { queue.add(v); queued[v] = true; }

        while (!queue.isEmpty()) {
            final int u = queue.poll();
            queued[u] = false;
            if (!testBit(alive, u)) continue;

            int dominator = -1;
            for (int v = nextSetBit(adjacency[u], 0); v >= 0; v = nextSetBit(adjacency[u], v + 1)) {
                if (!testBit(alive, v)) continue;
                if (subsetWithinAlive(closed[u], closed[v], alive)) { dominator = v; break; }
            }
            if (dominator < 0) continue; // not a pitfall right now

            clearBit(alive, u);
            aliveCount--;
            if (aliveCount == 1) break;

            for (int w = nextSetBit(adjacency[u], 0); w >= 0; w = nextSetBit(adjacency[u], w + 1)) {
                if (testBit(alive, w) && !queued[w]) { queue.add(w); queued[w] = true; }
            }
        }

        return aliveCount == 1;
    }

    /** True iff (a cap alive) subseteq (b cap alive). */
    private static boolean subsetWithinAlive(long[] a, long[] b, long[] alive) {
        for (int i = 0; i < a.length; i++) {
            if ((a[i] & alive[i] & ~b[i]) != 0L) return false;
        }
        return true;
    }

    private static void setBit(long[] bits, int i)   { bits[i >>> 6] |= (1L << (i & 63)); }
    private static void clearBit(long[] bits, int i) { bits[i >>> 6] &= ~(1L << (i & 63)); }
    private static boolean testBit(long[] bits, int i) { return (bits[i >>> 6] & (1L << (i & 63))) != 0L; }

    private static int nextSetBit(long[] bits, int from) {
        if (from < 0) from = 0;
        int word = from >>> 6;
        if (word >= bits.length) return -1;
        long w = bits[word] & (-1L << (from & 63));
        while (true) {
            if (w != 0L) return (word << 6) + Long.numberOfTrailingZeros(w);
            if (++word >= bits.length) return -1;
            w = bits[word];
        }
    }
}

/**
 * k-cop-win recognition and cop number c(G).
 *
 * INPUT  : a Laplacian matrix L.  OUTPUT : int (cop number) / boolean (fixed k).
 *
 * METHOD -- Petr, Portier & Versteegen, "A faster algorithm for Cops and Robbers",
 * Discrete Applied Mathematics 320 (2022), arXiv:2112.07449. Decides k-cop-win in
 * O(k * n^(k+2)), beating the naive O(n^(2k+2)).
 *
 * One piece moves per step. STATE = (p0=robber, p1..pk=cops, t = index of piece that
 * MOVED LAST). Next to move: robber if t==k, else cop t+1. A capture state (p0 == pi)
 * is cop-winning. On a cop's turn a state is winning if SOME successor is; on the
 * robber's turn only if EVERY successor is. We label all cop-winning states by backward
 * BFS from the captures: cop-turn predecessors win on first hit; robber-turn predecessors
 * carry an escape counter (init 1+deg(robber)) decremented per winning successor, winning
 * when it reaches 0. G is k-cop-win iff some cop placement makes every robber start a
 * winning state (with t==0, robber just placed).
 */
class CopNumber {

    private static final long MAX_STATES = 80_000_000L;

    public static int copNumber(int[][] L) {
        final int n = L.length;
        if (n == 0) return 0;
        for (int k = 1; k <= n; k++) if (isKCopWin(L, k)) return k;
        return n;
    }

    public static boolean isKCopWin(int[][] L, int k) {
        if (k < 1) throw new IllegalArgumentException("k must be >= 1");
        final int n = L.length;
        if (n == 0) return true;

        final int[][] closedNbrs = new int[n][];
        final int[] deg = new int[n];
        for (int v = 0; v < n; v++) {
            if (L[v].length != n) throw new IllegalArgumentException("matrix must be square");
            int d = 0;
            for (int u = 0; u < n; u++) if (u != v && L[v][u] != 0) d++;
            deg[v] = d;
            int[] cn = new int[d + 1];
            cn[0] = v;
            int idx = 1;
            for (int u = 0; u < n; u++) if (u != v && L[v][u] != 0) cn[idx++] = u;
            closedNbrs[v] = cn;
        }

        final int pieces = k + 1;
        final long[] pow = new long[pieces + 1]; // pow[i] = n^i
        pow[0] = 1;
        for (int i = 1; i <= pieces; i++) pow[i] = pow[i - 1] * n;
        final long numStatesL = pow[pieces] * pieces; // (k+1) * n^(k+1)
        if (numStatesL > MAX_STATES || numStatesL > Integer.MAX_VALUE) {
            throw new IllegalStateException("state space too large for k=" + k + ", n=" + n
                + " (" + numStatesL + " states); raise MAX_STATES to attempt anyway");
        }
        final int numPos = (int) pow[pieces];
        final int numStates = (int) numStatesL;
        final int npow = (int) pow[1]; // == n

        final boolean[] copWin = new boolean[numStates];
        final int[] escape = new int[numPos]; // for robber-turn states (t==k), keyed by posIndex
        for (int p = 0; p < numPos; p++) escape[p] = 1 + deg[p % npow];

        final ArrayDeque<Integer> queue = new ArrayDeque<>();

        // seed: every capture state (robber shares a vertex with some cop), all turns
        for (int p = 0; p < numPos; p++) {
            int robber = p % npow;
            boolean captured = false;
            for (int i = 1; i <= k; i++) {
                int ci = (int) ((p / pow[i]) % npow);
                if (ci == robber) { captured = true; break; }
            }
            if (captured) for (int t = 0; t < pieces; t++) {
                int s = p * pieces + t;
                if (!copWin[s]) { copWin[s] = true; queue.add(s); }
            }
        }

        // backward BFS
        while (!queue.isEmpty()) {
            final int s = queue.poll();
            final int t = s % pieces;          // piece that moved last to reach s
            final int posS = s / pieces;
            final int m = t;
            final int prevT = (t == 0) ? (pieces - 1) : (t - 1);
            final int posMval = (int) ((posS / pow[m]) % npow);
            final long place = pow[m];
            final int[] sources = closedNbrs[posMval];

            if (m == 0) { // s reached by a robber move -> predecessors are robber-turn nodes (AND-rule)
                for (int u : sources) {
                    int posQ = (int) (posS - (long) posMval * place + (long) u * place);
                    int q = posQ * pieces + prevT;
                    if (copWin[q]) continue;
                    if (--escape[posQ] == 0) { copWin[q] = true; queue.add(q); }
                }
            } else {      // s reached by a cop move -> predecessors are cop-turn nodes (OR-rule)
                for (int u : sources) {
                    int posQ = (int) (posS - (long) posMval * place + (long) u * place);
                    int q = posQ * pieces + prevT;
                    if (!copWin[q]) { copWin[q] = true; queue.add(q); }
                }
            }
        }

        // decision: exists a cop placement winning against every robber start (t==0)
        final long copTuples = pow[k]; // n^k
        for (long copTuple = 0; copTuple < copTuples; copTuple++) {
            final int base = (int) (copTuple * npow); // posIndex with robber == 0
            boolean allRobbersLose = true;
            for (int r = 0; r < n; r++) {
                if (!copWin[(base + r) * pieces]) { allRobbersLose = false; break; }
            }
            if (allRobbersLose) return true;
        }
        return false;
    }
}

/** Validation suite: faithfulness to the base program + literature-known cop numbers + the invariant. */
class Tests {
    static int passed = 0, failed = 0;

    static void run() {
        passed = 0; failed = 0;

        int[][] p4 = lap(4, new int[][]{{0,1},{1,2},{2,3}});
        check("P4 dismantlable", Dismantlable.isDismantlable(p4), true);
        check("P4 cop number",   CopNumber.copNumber(p4), 1);

        int[][] sun4 = lap(8, new int[][]{
            {0,1},{1,2},{2,3},{3,0}, {0,4},{1,5},{2,6},{3,7}});
        check("Sun(C4) dismantlable", Dismantlable.isDismantlable(sun4), false);
        check("Sun(C4) cop number",   CopNumber.copNumber(sun4), 2);

        int[][] origP4 = {{1,-1,0,0},{-1,2,-1,0},{0,-1,2,-1},{0,0,-1,1}};
        int[][] origC4 = {{3,-1,-1,-1},{-1,2,-1,-1},{-1,-1,2,-1},{-1,-1,-1,3}}; // really K4
        int[][] origS4 = {{3,-1,0,-1,-1,0,0,0},{-1,3,-1,0,0,-1,0,0},{0,-1,3,-1,0,0,-1,0},
                          {-1,0,-1,3,0,0,0,-1},{-1,0,0,0,1,0,0,0},{0,-1,0,0,0,1,0,0},
                          {0,0,-1,0,0,0,1,0},{0,0,0,-1,0,0,0,1}};
        check("orig matrix_P4 (base=true)", Dismantlable.isDismantlable(origP4), true);
        check("orig matrix_C4 == K4 (base=true)", Dismantlable.isDismantlable(origC4), true);
        check("orig matrix_S4 (base=false)", Dismantlable.isDismantlable(origS4), false);

        for (int n = 1; n <= 6; n++) {
            int[][] kn = complete(n);
            check("K" + n + " dismantlable", Dismantlable.isDismantlable(kn), true);
            check("K" + n + " cop number",   CopNumber.copNumber(kn), 1);
        }
        for (int n = 2; n <= 7; n++) {
            int[][] pn = path(n);
            check("P" + n + " dismantlable", Dismantlable.isDismantlable(pn), true);
            check("P" + n + " cop number",   CopNumber.copNumber(pn), 1);
        }
        check("C3 cop number", CopNumber.copNumber(cycle(3)), 1);
        for (int n = 4; n <= 7; n++) {
            int[][] cn = cycle(n);
            check("C" + n + " dismantlable", Dismantlable.isDismantlable(cn), false);
            check("C" + n + " cop number",   CopNumber.copNumber(cn), 2);
        }

        int[][] star = lap(5, new int[][]{{0,1},{0,2},{0,3},{0,4}});
        check("Star K1,4 dismantlable", Dismantlable.isDismantlable(star), true);
        check("Star K1,4 cop number",   CopNumber.copNumber(star), 1);

        int[][] wheel = lap(6, new int[][]{
            {0,1},{0,2},{0,3},{0,4},{0,5}, {1,2},{2,3},{3,4},{4,5},{5,1}});
        check("Wheel W5 dismantlable", Dismantlable.isDismantlable(wheel), true);
        check("Wheel W5 cop number",   CopNumber.copNumber(wheel), 1);

        int[][] k33 = lap(6, new int[][]{
            {0,3},{0,4},{0,5},{1,3},{1,4},{1,5},{2,3},{2,4},{2,5}});
        check("K3,3 dismantlable", Dismantlable.isDismantlable(k33), false);
        check("K3,3 cop number",   CopNumber.copNumber(k33), 2);

        int[][] twoK2 = lap(4, new int[][]{{0,1},{2,3}});
        check("2K2 dismantlable", Dismantlable.isDismantlable(twoK2), false);
        check("2K2 cop number",   CopNumber.copNumber(twoK2), 2);

        int[][] petersen = lap(10, new int[][]{
            {0,1},{1,2},{2,3},{3,4},{4,0}, {5,7},{7,9},{9,6},{6,8},{8,5},
            {0,5},{1,6},{2,7},{3,8},{4,9}});
        check("Petersen dismantlable", Dismantlable.isDismantlable(petersen), false);
        check("Petersen cop number",   CopNumber.copNumber(petersen), 3);

        int[][][] all = { p4, sun4, origP4, origC4, origS4, complete(1), complete(5),
            path(6), cycle(3), cycle(5), cycle(6), star, wheel, k33, twoK2, petersen };
        for (int gi = 0; gi < all.length; gi++) {
            boolean dis = Dismantlable.isDismantlable(all[gi]);
            int c = CopNumber.copNumber(all[gi]);
            check("invariant dismantlable==(c==1) [graph " + gi + "]", dis, c == 1);
        }

        System.out.println("==== " + passed + " passed, " + failed + " failed ====");
        if (failed > 0) throw new AssertionError(failed + " test(s) failed");
    }

    static void check(String name, boolean got, boolean want) {
        boolean ok = got == want;
        System.out.printf("[%s] %-40s got=%-5s want=%-5s%n", ok ? "PASS" : "FAIL", name, got, want);
        if (ok) passed++; else failed++;
    }
    static void check(String name, int got, int want) {
        boolean ok = got == want;
        System.out.printf("[%s] %-40s got=%-5d want=%-5d%n", ok ? "PASS" : "FAIL", name, got, want);
        if (ok) passed++; else failed++;
    }

    static int[][] lap(int n, int[][] edges) {
        int[][] L = new int[n][n];
        for (int[] e : edges) {
            int a = e[0], b = e[1];
            if (L[a][b] == 0) { L[a][b] = -1; L[b][a] = -1; L[a][a]++; L[b][b]++; }
        }
        return L;
    }
    static int[][] complete(int n) {
        int[][] L = new int[n][n];
        for (int i = 0; i < n; i++) for (int j = 0; j < n; j++)
            L[i][j] = (i != j) ? -1 : (n - 1);
        return L;
    }
    static int[][] path(int n) {
        int[][] e = new int[n - 1][2];
        for (int i = 0; i < n - 1; i++) e[i] = new int[]{i, i + 1};
        return lap(n, e);
    }
    static int[][] cycle(int n) {
        int[][] e = new int[n][2];
        for (int i = 0; i < n; i++) e[i] = new int[]{i, (i + 1) % n};
        return lap(n, e);
    }
}

/** Differential fuzz (fast vs. the original O(n^4) reference) + speed benchmark. */
class FuzzAndBench {

    static void run() {
        fuzz();
        bench();
    }

    static void fuzz() {
        Random rnd = new Random(20220519L);
        int trials = 0, copInvariantTrials = 0;
        for (int n = 1; n <= 8; n++) {
            int reps = (n <= 5) ? 4000 : 1500;
            for (int r = 0; r < reps; r++) {
                double p = rnd.nextDouble();
                int[][] L = randomLaplacian(n, p, rnd);
                boolean fast = Dismantlable.isDismantlable(L);
                boolean ref  = refDismantable(toAdj(L));
                if (fast != ref) { System.out.println("MISMATCH (fast vs ref) n=" + n); dump(L); throw new AssertionError(); }
                trials++;
                if (n <= 7) {
                    boolean copWin = CopNumber.copNumber(L) == 1;
                    if (copWin != fast) { System.out.println("MISMATCH (copWin vs dismantlable) n=" + n); dump(L); throw new AssertionError(); }
                    copInvariantTrials++;
                }
            }
        }
        System.out.println("FUZZ OK: " + trials + " random graphs agree with the reference; "
            + copInvariantTrials + " also satisfy dismantlable<=>c==1.");
    }

    static void bench() {
        System.out.println("\n=== benchmark (ms; both recognisers return the same answer) ===");
        System.out.printf("%-14s %-6s %12s %12s %9s%n", "family", "n", "reference", "fast", "speedup");
        for (int n : new int[]{100, 200, 400, 800})      timeBoth("complete K_n", completeAdj(n), n);
        for (int n : new int[]{100, 400, 1600, 6400})    timeBoth("path P_n", pathAdj(n), n);
    }

    static void timeBoth(String fam, int[][] adj, int n) {
        int[][] lap = adjToLaplacian(adj);
        long t0 = System.nanoTime();
        boolean refAns = refDismantable(copy(adj));
        long t1 = System.nanoTime();
        boolean fastAns = Dismantlable.isDismantlable(lap);
        long t2 = System.nanoTime();
        if (refAns != fastAns) { System.out.println("BENCH MISMATCH " + fam + " n=" + n); throw new AssertionError(); }
        double refMs = (t1 - t0) / 1e6, fastMs = (t2 - t1) / 1e6;
        System.out.printf("%-14s %-6d %12.2f %12.2f %8.1fx%n", fam, n, refMs, fastMs,
            fastMs > 0 ? refMs / fastMs : Double.POSITIVE_INFINITY);
    }

    static int[][] randomLaplacian(int n, double p, Random rnd) {
        int[][] L = new int[n][n];
        for (int i = 0; i < n; i++) for (int j = i + 1; j < n; j++)
            if (rnd.nextDouble() < p) { L[i][j] = -1; L[j][i] = -1; L[i][i]++; L[j][j]++; }
        return L;
    }
    static int[][] completeAdj(int n) {
        int[][] a = new int[n][n];
        for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) if (i != j) a[i][j] = -1;
        return withDegreeDiagonal(a);
    }
    static int[][] pathAdj(int n) {
        int[][] a = new int[n][n];
        for (int i = 0; i + 1 < n; i++) { a[i][i + 1] = -1; a[i + 1][i] = -1; }
        return withDegreeDiagonal(a);
    }
    static int[][] toAdj(int[][] L) {
        int n = L.length; int[][] a = new int[n][n];
        for (int i = 0; i < n; i++) for (int j = 0; j < n; j++)
            if (i != j) a[i][j] = (L[i][j] != 0) ? -1 : 0;
        return withDegreeDiagonal(a);
    }
    static int[][] adjToLaplacian(int[][] adj) {
        int n = adj.length; int[][] L = new int[n][n];
        for (int i = 0; i < n; i++) { int d = 0;
            for (int j = 0; j < n; j++) if (i != j && adj[i][j] == -1) { L[i][j] = -1; d++; }
            L[i][i] = d; }
        return L;
    }
    static int[][] withDegreeDiagonal(int[][] a) {
        int n = a.length;
        for (int i = 0; i < n; i++) { int d = 0;
            for (int j = 0; j < n; j++) if (i != j && a[i][j] == -1) d++; a[i][i] = d; }
        return a;
    }
    static int[][] copy(int[][] m) {
        int[][] c = new int[m.length][];
        for (int i = 0; i < m.length; i++) c[i] = m[i].clone();
        return c;
    }
    static void dump(int[][] L) {
        for (int[] row : L) { StringBuilder sb = new StringBuilder();
            for (int v : row) sb.append(String.format("%3d ", v)); System.out.println(sb); }
    }

    // ---- ORIGINAL reference (Dismantable_V2), reproduced verbatim ----
    static boolean refDismantable(int[][] matrix) {
        int matrixLength = matrix.length;
        if (matrixLength == 1) return true;
        for (int i = 0; i < matrixLength; i++) for (int j = 0; j < matrixLength; j++) {
            if (i == j || matrix[i][j] != -1) continue;
            boolean dominated = true;
            for (int k = 0; k < matrix.length; k++) {
                if (k == i || k == j) continue;
                if (matrix[i][k] == -1 && matrix[j][k] != -1) { dominated = false; break; }
            }
            if (dominated) return refDismantable(removeVertex(matrix, i));
        }
        return false;
    }
    static int[][] removeVertex(int[][] oldMatrix, int removedVertex) {
        int oldMatrixLength = oldMatrix.length;
        int[][] newMatrix = new int[oldMatrixLength - 1][oldMatrixLength - 1];
        for (int i = 0, newRow = 0; i < oldMatrixLength; i++) {
            if (i == removedVertex) continue;
            int[] originalRow = oldMatrix[i]; int[] newMatrixRow = newMatrix[newRow]; int newColumn = 0;
            for (int j = 0; j < oldMatrixLength; j++) { if (j == removedVertex) continue;
                newMatrixRow[newColumn++] = originalRow[j]; }
            if (originalRow[removedVertex] == -1) newMatrixRow[newRow]--;
            newRow++;
        }
        return newMatrix;
    }
}
