/**
 * Validation harness for {@link Dismantlable} and {@link CopNumber}.
 *
 * It checks the two original-code examples for byte-for-byte agreement with the
 * base program, then verifies a battery of CORRECTLY-encoded Laplacians whose
 * cop numbers are known from the literature, plus the structural invariant
 *      dismantlable(G)  <=>  copNumber(G) == 1
 * (Aigner-Fromme Thm 1: cop-win == dismantlable == 1-cop-win).
 *
 * Compile & run:
 *   javac Dismantlable.java CopNumber.java Tests.java && java Tests
 */
public class Tests {
    static int passed = 0, failed = 0;

    public static void main(String[] args) {
        // ---- the two well-formed examples from the original program ----
        int[][] p4 = lap(4, new int[][]{{0,1},{1,2},{2,3}});
        check("P4 dismantlable", Dismantlable.isDismantlable(p4), true);
        check("P4 cop number",   CopNumber.copNumber(p4), 1);

        int[][] sun4 = lap(8, new int[][]{
            {0,1},{1,2},{2,3},{3,0},      // inner C4
            {0,4},{1,5},{2,6},{3,7}});    // a pendant on each
        check("Sun(C4) dismantlable", Dismantlable.isDismantlable(sun4), false);
        check("Sun(C4) cop number",   CopNumber.copNumber(sun4), 2);

        // ---- the original program's literal matrices (faithfulness to the base) ----
        int[][] origP4 = {{1,-1,0,0},{-1,2,-1,0},{0,-1,2,-1},{0,0,-1,1}};
        int[][] origC4 = {{3,-1,-1,-1},{-1,2,-1,-1},{-1,-1,2,-1},{-1,-1,-1,3}}; // actually K4
        int[][] origS4 = {{3,-1,0,-1,-1,0,0,0},{-1,3,-1,0,0,-1,0,0},{0,-1,3,-1,0,0,-1,0},
                          {-1,0,-1,3,0,0,0,-1},{-1,0,0,0,1,0,0,0},{0,-1,0,0,0,1,0,0},
                          {0,0,-1,0,0,0,1,0},{0,0,0,-1,0,0,0,1}};
        check("orig matrix_P4 (base=true)", Dismantlable.isDismantlable(origP4), true);
        check("orig matrix_C4 == K4 (base=true)", Dismantlable.isDismantlable(origC4), true);
        check("orig matrix_S4 (base=false)", Dismantlable.isDismantlable(origS4), false);

        // ---- complete graphs K_n: cop-win, c = 1 ----
        for (int n = 1; n <= 6; n++) {
            int[][] kn = complete(n);
            check("K" + n + " dismantlable", Dismantlable.isDismantlable(kn), true);
            check("K" + n + " cop number",   CopNumber.copNumber(kn), 1);
        }

        // ---- paths P_n: trees, cop-win, c = 1 ----
        for (int n = 2; n <= 7; n++) {
            int[][] pn = path(n);
            check("P" + n + " dismantlable", Dismantlable.isDismantlable(pn), true);
            check("P" + n + " cop number",   CopNumber.copNumber(pn), 1);
        }

        // ---- cycles C_n (n>=4): robber-win, c = 2; C3 == K3 is cop-win ----
        check("C3 cop number", CopNumber.copNumber(cycle(3)), 1);
        for (int n = 4; n <= 7; n++) {
            int[][] cn = cycle(n);
            check("C" + n + " dismantlable", Dismantlable.isDismantlable(cn), false);
            check("C" + n + " cop number",   CopNumber.copNumber(cn), 2);
        }

        // ---- star K_{1,4}: tree, c = 1 ----
        int[][] star = lap(5, new int[][]{{0,1},{0,2},{0,3},{0,4}});
        check("Star K1,4 dismantlable", Dismantlable.isDismantlable(star), true);
        check("Star K1,4 cop number",   CopNumber.copNumber(star), 1);

        // ---- wheel W5 (C5 rim + hub): hub dominates the rim, cop-win, c = 1 ----
        int[][] wheel = lap(6, new int[][]{
            {0,1},{0,2},{0,3},{0,4},{0,5},      // hub 0 to rim
            {1,2},{2,3},{3,4},{4,5},{5,1}});    // rim C5
        check("Wheel W5 dismantlable", Dismantlable.isDismantlable(wheel), true);
        check("Wheel W5 cop number",   CopNumber.copNumber(wheel), 1);

        // ---- complete bipartite K_{3,3}: not dismantlable, c = 2 (cops on opposite parts) ----
        int[][] k33 = lap(6, new int[][]{
            {0,3},{0,4},{0,5},{1,3},{1,4},{1,5},{2,3},{2,4},{2,5}});
        check("K3,3 dismantlable", Dismantlable.isDismantlable(k33), false);
        check("K3,3 cop number",   CopNumber.copNumber(k33), 2);

        // ---- disconnected 2*K2: c = sum of components = 1 + 1 = 2 ----
        int[][] twoK2 = lap(4, new int[][]{{0,1},{2,3}});
        check("2K2 dismantlable", Dismantlable.isDismantlable(twoK2), false);
        check("2K2 cop number",   CopNumber.copNumber(twoK2), 2);

        // ---- Petersen graph: 3-regular, girth 5, the classic c = 3 example ----
        int[][] petersen = lap(10, new int[][]{
            {0,1},{1,2},{2,3},{3,4},{4,0},          // outer C5
            {5,7},{7,9},{9,6},{6,8},{8,5},          // inner pentagram
            {0,5},{1,6},{2,7},{3,8},{4,9}});        // spokes
        check("Petersen dismantlable", Dismantlable.isDismantlable(petersen), false);
        check("Petersen cop number",   CopNumber.copNumber(petersen), 3);

        // ---- universal invariant: dismantlable <=> c == 1, over every graph above ----
        int[][][] all = { p4, sun4, origP4, origC4, origS4, complete(1), complete(5),
            path(6), cycle(3), cycle(5), cycle(6), star, wheel, k33, twoK2, petersen };
        for (int gi = 0; gi < all.length; gi++) {
            boolean dis = Dismantlable.isDismantlable(all[gi]);
            int c = CopNumber.copNumber(all[gi]);
            check("invariant dismantlable==(c==1) [graph " + gi + "]", dis, c == 1);
        }

        System.out.println("\n==== " + passed + " passed, " + failed + " failed ====");
        if (failed > 0) System.exit(1);
    }

    // ---------- assertion helpers ----------
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

    // ---------- Laplacian builders ----------
    /** Build the Laplacian of an undirected simple graph on n vertices from an edge list. */
    static int[][] lap(int n, int[][] edges) {
        int[][] L = new int[n][n];
        for (int[] e : edges) {
            int a = e[0], b = e[1];
            if (L[a][b] == 0) { // ignore accidental duplicates
                L[a][b] = -1; L[b][a] = -1;
                L[a][a]++;      L[b][b]++;
            }
        }
        return L;
    }
    static int[][] complete(int n) {
        int[][] L = new int[n][n];
        for (int i = 0; i < n; i++) for (int j = 0; j < n; j++)
            if (i != j) L[i][j] = -1; else L[i][j] = n - 1;
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
