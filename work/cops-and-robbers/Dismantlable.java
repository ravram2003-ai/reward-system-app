import java.util.ArrayDeque;

/**
 * Fast recognition of dismantlable (a.k.a. cop-win / 1-cop-win) graphs.
 *
 * INPUT  : a Laplacian matrix L of a finite simple graph.
 *          L is square; off-diagonal L[i][j] != 0 means edge i~j (in a Laplacian
 *          it is -w_ij <= 0); the diagonal holds the (weighted) degree.
 * OUTPUT : boolean -- true iff the graph is dismantlable.
 *
 * THEORY (Aigner-Fromme 1984, "A Game of Cops and Robbers", Thm 1; originally
 * Nowakowski-Winkler / Quilliot): a graph is cop-win iff it can be reduced to a
 * single vertex by repeatedly deleting "pitfalls". Vertex u is a pitfall
 * dominated by d iff N[u] subseteq N[d] (closed neighbourhoods). The reduction
 * is CONFLUENT: removing any pitfall, in any order, never changes the answer.
 *
 * WHY THIS IS FASTER THAN THE NAIVE RECURSION
 * The base version (Dismantable_V2) re-scans every ordered pair (O(n^3)) to find
 * one corner, rebuilds an (n-1)x(n-1) matrix (O(n^2)), then recurses from
 * scratch -- about O(n^4) work with large constant factors from array copies.
 *
 * Two structural facts collapse that:
 *   1. The dominator of a pitfall is always one of its neighbours (since
 *      u in N[u] subseteq N[d] forces d ~ u), so we only test neighbours.
 *   2. Deleting u only shrinks the closed neighbourhoods of u's neighbours, and
 *      a NEW domination relation can appear only when the dominated side shrinks.
 *      Hence the only vertices that can BECOME pitfalls after deleting u are the
 *      surviving neighbours of u -- nothing else need ever be re-examined.
 *
 * So we keep a work-queue seeded with every vertex and, on each deletion, re-add
 * only the affected neighbours. Closed neighbourhoods are stored as machine-word
 * bitsets, making each "N[u] subseteq N[v] within the surviving set" test cost
 * O(n / 64) AND/ANDNOT operations instead of an O(n) scan. No matrices are ever
 * copied; deletion is a single cleared bit. Total work is about O(m * dmax / 64)
 * in practice -- a large constant-factor and asymptotic win over the rebuild.
 */
public class Dismantlable {

    public static void main(String[] args) {
        int[][] matrix_P4 = {
            { 1, -1,  0,  0 },
            { -1,  2, -1,  0 },
            { 0, -1,  2, -1 },
            { 0,  0, -1,  1 }
        };
        System.out.println("matrix_P4 is dismantable:" + isDismantlable(matrix_P4)); // true

        int[][] matrix_C4 = {
            { 3, -1, -1, -1 },
            { -1,  2, -1, -1 },
            { -1, -1,  2, -1 },
            { -1, -1, -1,  3 }
        };
        System.out.println("matrix_C4 is dismantable:" + isDismantlable(matrix_C4)); // false

        int[][] matrix_S4 = {
            { 3, -1,  0, -1, -1,  0,  0,  0 }, // 0
            { -1,  3, -1,  0,  0, -1,  0,  0 }, // 1
            { 0, -1,  3, -1,  0,  0, -1,  0 }, // 2
            { -1,  0, -1,  3,  0,  0,  0, -1 }, // 3
            { -1,  0,  0,  0,  1,  0,  0,  0 }, // 4
            { 0, -1,  0,  0,  0,  1,  0,  0 }, // 5
            { 0,  0, -1,  0,  0,  0,  1,  0 }, // 6
            { 0,  0,  0, -1,  0,  0,  0,  1 }  // 7
        };
        System.out.println("matrix_S4 is dismantable:" + isDismantlable(matrix_S4)); // false
    }

    /** Returns true iff the graph whose Laplacian is {@code L} is dismantlable (cop-win). */
    public static boolean isDismantlable(int[][] L) {
        final int n = L.length;
        if (n <= 1) return true; // K_0 and K_1 are trivially cop-win

        final int words = (n + 63) >>> 6;

        // closed[v]: bitset of N[v] = {v} union {neighbours of v} (the FULL graph).
        // adjacency[v]: bitset of open neighbourhood, used only to walk neighbours.
        final long[][] closed = new long[n][words];
        final long[][] adjacency = new long[n][words];
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

        // alive: surviving vertices. Removing a vertex is one cleared bit.
        final long[] alive = new long[words];
        for (int v = 0; v < n; v++) setBit(alive, v);
        int aliveCount = n;

        // Work-queue of vertices that might currently be pitfalls.
        final ArrayDeque<Integer> queue = new ArrayDeque<>();
        final boolean[] queued = new boolean[n];
        for (int v = 0; v < n; v++) { queue.add(v); queued[v] = true; }

        // scratch buffer reused across subset tests to avoid per-test allocation
        final long[] scratch = new long[words];

        while (!queue.isEmpty()) {
            final int u = queue.poll();
            queued[u] = false;
            if (!testBit(alive, u)) continue;

            // Is u dominated by some surviving neighbour v? (closed[u] cap alive) subseteq (closed[v] cap alive)
            int dominator = -1;
            for (int v = nextSetBit(adjacency[u], 0); v >= 0; v = nextSetBit(adjacency[u], v + 1)) {
                if (!testBit(alive, v)) continue; // v already removed
                if (subsetWithinAlive(closed[u], closed[v], alive, scratch)) { dominator = v; break; }
            }
            if (dominator < 0) continue; // not a pitfall right now

            // Delete u. Only u's surviving neighbours can newly become pitfalls.
            clearBit(alive, u);
            aliveCount--;
            if (aliveCount == 1) break; // reduced to K_1 -- dismantlable, stop early

            for (int w = nextSetBit(adjacency[u], 0); w >= 0; w = nextSetBit(adjacency[u], w + 1)) {
                if (testBit(alive, w) && !queued[w]) { queue.add(w); queued[w] = true; }
            }
        }

        return aliveCount == 1;
    }

    /** True iff (a cap alive) is a subset of (b cap alive), i.e. a-restricted-to-alive \ b is empty. */
    private static boolean subsetWithinAlive(long[] a, long[] b, long[] alive, long[] scratch) {
        for (int i = 0; i < a.length; i++) {
            // bits that are in a, alive, but not in b -> witness that a is NOT a subset of b
            if ((a[i] & alive[i] & ~b[i]) != 0L) return false;
        }
        return true;
    }

    // ---- minimal bitset helpers (word = 64 bits) ----
    private static void setBit(long[] bits, int i)   { bits[i >>> 6] |= (1L << (i & 63)); }
    private static void clearBit(long[] bits, int i) { bits[i >>> 6] &= ~(1L << (i & 63)); }
    private static boolean testBit(long[] bits, int i) { return (bits[i >>> 6] & (1L << (i & 63))) != 0L; }

    /** Index of the next set bit at or after {@code from}, or -1 if none. */
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
