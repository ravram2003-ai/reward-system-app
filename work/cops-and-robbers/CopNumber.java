import java.util.ArrayDeque;

/**
 * k-cop-win recognition and cop number c(G).
 *
 * INPUT  : a Laplacian matrix L (off-diagonal L[i][j] != 0 == edge i~j).
 * OUTPUT : an integer -- {@link #copNumber} returns c(G), the least k for which
 *          k cops win; {@link #isKCopWin} answers the decision for a fixed k.
 *
 * METHOD -- Petr, Portier & Versteegen, "A faster algorithm for Cops and
 * Robbers", Discrete Applied Mathematics 320 (2022), arXiv:2112.07449. It decides
 * k-cop-win in O(k * n^(k+2)) time, improving the naive O(n^(2k+2)).
 *
 * The trick is to move ONE piece per step instead of letting all k cops move at
 * once. A naive game graph branches like (deg+1)^k per cop turn, giving n^(2k)
 * edges; sequencing the moves caps every step's branching at (deg+1) <= n, so the
 * state graph has O(n^(k+1)) states each of out-degree <= n -> O(k n^(k+2)) edges.
 * Because the robber does not move while the cops take their sub-turns, sequencing
 * the cops is equivalent to a simultaneous joint cop move, so c(G) is unchanged.
 *
 * STATE: a tuple (p0, p1, ..., pk, t) where p0 is the robber, p1..pk the cops, and
 * t in {0..k} is the index of the piece that MOVED LAST. The next piece to move is
 * the robber when t == k, otherwise cop (t+1). A state is "cop-winning" if the cops
 * can force a capture from it. Capture states (p0 == pi for some cop i) are winning.
 * On a cop's turn the state is winning if SOME successor is (the cop picks); on the
 * robber's turn it is winning only if EVERY successor is (the robber picks).
 *
 * We compute all cop-winning states by backward BFS from the capture states:
 *  - a cop-turn predecessor is winning as soon as ONE successor is (mark on first hit);
 *  - a robber-turn predecessor keeps an escape COUNTER initialised to its out-degree
 *    (1 + deg(robber)); each winning successor decrements it; reaching 0 means every
 *    robber move loses, so the predecessor is winning.
 * Each state is enqueued at most once -> linear in the size of the state graph.
 *
 * G is k-cop-win iff there is a cop placement (p1..pk) such that for EVERY robber
 * start p0 the state (p0,p1,..,pk, t=0) -- robber just placed, cops about to move --
 * is cop-winning. c(G) is the smallest such k (disconnected graphs work too: the
 * search naturally forces sum-of-component cop numbers since pieces cannot cross).
 */
public class CopNumber {

    /** Safety cap on the state-graph size so a huge (n,k) fails loudly instead of OOM-ing. */
    private static final long MAX_STATES = 80_000_000L;

    public static void main(String[] args) {
        int[][] matrix_P4 = {
            { 1, -1,  0,  0 },
            { -1,  2, -1,  0 },
            { 0, -1,  2, -1 },
            { 0,  0, -1,  1 }
        };
        System.out.println("matrix_P4 cop number: " + copNumber(matrix_P4)); // 1

        int[][] matrix_C4 = {
            { 3, -1, -1, -1 },
            { -1,  2, -1, -1 },
            { -1, -1,  2, -1 },
            { -1, -1, -1,  3 }
        };
        System.out.println("matrix_C4 cop number: " + copNumber(matrix_C4)); // 2

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
        System.out.println("matrix_S4 cop number: " + copNumber(matrix_S4)); // 2
    }

    /** The cop number c(G): the least k such that k cops have a winning strategy. */
    public static int copNumber(int[][] L) {
        final int n = L.length;
        if (n == 0) return 0;
        // c(G) <= n (a cop on every vertex captures at placement); the loop always returns.
        for (int k = 1; k <= n; k++) {
            if (isKCopWin(L, k)) return k;
        }
        return n;
    }

    /** Decides whether k cops can win on the graph whose Laplacian is {@code L}. */
    public static boolean isKCopWin(int[][] L, int k) {
        if (k < 1) throw new IllegalArgumentException("k must be >= 1");
        final int n = L.length;
        if (n == 0) return true;

        // ----- build closed neighbourhoods and degrees from the Laplacian -----
        // closedNbrs[v] = {v} union neighbours(v); used to enumerate stay-or-move steps.
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

        // ----- state-space dimensions; place values for the mixed-radix encoding -----
        // posIndex = sum_i pos[i] * n^i over i in [0..k]; stateId = posIndex*(k+1) + t.
        final int pieces = k + 1;
        final long[] pow = new long[pieces + 1]; // pow[i] = n^i (as long, to detect overflow)
        pow[0] = 1;
        for (int i = 1; i <= pieces; i++) pow[i] = pow[i - 1] * n;
        final long numPosL = pow[pieces];                 // n^(k+1)
        final long numStatesL = numPosL * pieces;          // (k+1) * n^(k+1)
        if (numStatesL > MAX_STATES || numStatesL > Integer.MAX_VALUE) {
            throw new IllegalStateException("state space too large for k=" + k + ", n=" + n
                + " (" + numStatesL + " states); raise MAX_STATES to attempt anyway");
        }
        final int numPos = (int) numPosL;
        final int numStates = (int) numStatesL;
        final int npow = (int) pow[1]; // == n, cached

        final boolean[] copWin = new boolean[numStates];
        // Escape counter for robber-turn states (t == k). Such a state is fixed by its
        // posIndex, so we key the counter by posIndex. -1 marks "not a tracked node yet".
        final int[] escape = new int[numPos];
        for (int p = 0; p < numPos; p++) {
            int robber = p % npow;            // pos[0]
            escape[p] = 1 + deg[robber];      // # of robber moves out of this state
        }

        final ArrayDeque<Integer> queue = new ArrayDeque<>();

        // ----- seed: every capture state (robber shares a vertex with some cop), all turns -----
        // Iterate posIndex; decode digits to test p0 == pi for any cop i.
        for (int p = 0; p < numPos; p++) {
            int robber = p % npow;
            boolean captured = false;
            for (int i = 1; i <= k; i++) {
                int ci = (int) ((p / pow[i]) % npow);
                if (ci == robber) { captured = true; break; }
            }
            if (captured) {
                for (int t = 0; t < pieces; t++) {
                    int s = p * pieces + t;
                    if (!copWin[s]) { copWin[s] = true; queue.add(s); }
                }
            }
        }

        // ----- backward BFS over the state graph -----
        while (!queue.isEmpty()) {
            final int s = queue.poll();
            final int t = s % pieces;          // piece that moved last to reach s
            final int posS = s / pieces;

            // Predecessors q differ from s only in coordinate m = t (the piece that just
            // moved), whose value ranges over the closed neighbourhood of its position in s;
            // q's "moved last" index is (t-1) mod pieces.
            final int m = t;
            final int prevT = (t == 0) ? (pieces - 1) : (t - 1);
            final int posMval = (int) ((posS / pow[m]) % npow); // value of coordinate m in s
            final long place = pow[m];
            final int[] sources = closedNbrs[posMval];          // where coordinate m could come from

            if (m == 0) {
                // s reached by a ROBBER move -> predecessors are robber-turn nodes (prevT == k).
                // AND-rule: decrement the escape counter; mark winning when it hits zero.
                for (int u : sources) {
                    int posQ = (int) (posS - (long) posMval * place + (long) u * place);
                    int q = posQ * pieces + prevT;
                    if (copWin[q]) continue;
                    if (--escape[posQ] == 0) { copWin[q] = true; queue.add(q); }
                }
            } else {
                // s reached by a COP move -> predecessors are cop-turn nodes.
                // OR-rule: one winning successor is enough, mark on first hit.
                for (int u : sources) {
                    int posQ = (int) (posS - (long) posMval * place + (long) u * place);
                    int q = posQ * pieces + prevT;
                    if (!copWin[q]) { copWin[q] = true; queue.add(q); }
                }
            }
        }

        // ----- decision: exists a cop placement winning against every robber start -----
        // posIndex = robber + n*copTuple, copTuple in [0, n^k). t = 0 (robber just placed).
        final long copTuples = pow[k]; // n^k
        for (long copTuple = 0; copTuple < copTuples; copTuple++) {
            final int base = (int) (copTuple * npow); // posIndex with robber == 0
            boolean allRobbersLose = true;
            for (int r = 0; r < n; r++) {
                int s = (base + r) * pieces; // t == 0
                if (!copWin[s]) { allRobbersLose = false; break; }
            }
            if (allRobbersLose) return true;
        }
        return false;
    }
}
