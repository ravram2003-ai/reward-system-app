import java.util.Random;

/**
 * Differential fuzz test + benchmark for {@link Dismantlable}.
 *
 * FUZZ: on thousands of random graphs (n <= 8) it checks that the fast bitset
 * recogniser agrees with the ORIGINAL O(n^4) reference algorithm (reproduced
 * verbatim below as {@link #refDismantable}) on EVERY input, and that the
 * structural invariant dismantlable <=> copNumber==1 holds.
 *
 * BENCH: times the reference vs the fast recogniser on large dense (K_n) and
 * sparse (path) cop-win graphs to quantify the speed-up.
 */
public class FuzzAndBench {

    public static void main(String[] args) {
        fuzz();
        bench();
    }

    // ---------------------------------------------------------------- fuzz
    static void fuzz() {
        Random rnd = new Random(20220519L); // arXiv:2112.07449 publication date, for reproducibility
        int trials = 0, copInvariantTrials = 0;
        for (int n = 1; n <= 8; n++) {
            int reps = (n <= 5) ? 4000 : 1500;
            for (int r = 0; r < reps; r++) {
                double p = rnd.nextDouble();              // random edge density per graph
                int[][] L = randomLaplacian(n, p, rnd);
                boolean fast = Dismantlable.isDismantlable(L);
                boolean ref  = refDismantable(toAdj(L));
                if (fast != ref) {
                    System.out.println("MISMATCH (fast vs ref) n=" + n + " fast=" + fast + " ref=" + ref);
                    dump(L);
                    System.exit(1);
                }
                trials++;
                // cop-win <=> dismantlable, checked on the smaller graphs (copNumber is the slow one)
                if (n <= 7) {
                    boolean copWin = CopNumber.copNumber(L) == 1;
                    if (copWin != fast) {
                        System.out.println("MISMATCH (copWin vs dismantlable) n=" + n
                            + " copWin=" + copWin + " dismantlable=" + fast);
                        dump(L);
                        System.exit(1);
                    }
                    copInvariantTrials++;
                }
            }
        }
        System.out.println("FUZZ OK: " + trials + " random graphs agree with the reference; "
            + copInvariantTrials + " also satisfy dismantlable<=>c==1.");
    }

    // -------------------------------------------------------------- bench
    static void bench() {
        System.out.println("\n=== benchmark (ms; both recognisers return the same answer) ===");
        System.out.printf("%-14s %-6s %12s %12s %9s%n", "family", "n", "reference", "fast", "speedup");
        int[] denseN = {100, 200, 400, 800};
        for (int n : denseN) timeBoth("complete K_n", completeAdj(n), n);
        int[] sparseN = {100, 400, 1600, 6400};
        for (int n : sparseN) timeBoth("path P_n", pathAdj(n), n);
    }

    /** Times reference vs fast on the same graph (adjacency given in the -1/degree form). */
    static void timeBoth(String fam, int[][] adj, int n) {
        // fast wants a Laplacian; the -1 adjacency with degree diagonal IS one.
        int[][] lap = adjToLaplacian(adj);
        long t0 = System.nanoTime();
        boolean refAns = refDismantable(copy(adj));   // reference mutates, so hand it a copy
        long t1 = System.nanoTime();
        boolean fastAns = Dismantlable.isDismantlable(lap);
        long t2 = System.nanoTime();
        if (refAns != fastAns) { System.out.println("BENCH MISMATCH " + fam + " n=" + n); System.exit(1); }
        double refMs = (t1 - t0) / 1e6, fastMs = (t2 - t1) / 1e6;
        System.out.printf("%-14s %-6d %12.2f %12.2f %8.1fx%n", fam, n, refMs, fastMs,
            fastMs > 0 ? refMs / fastMs : Double.POSITIVE_INFINITY);
    }

    // --------------------------------------------------- graph generators
    static int[][] randomLaplacian(int n, double p, Random rnd) {
        int[][] L = new int[n][n];
        for (int i = 0; i < n; i++) for (int j = i + 1; j < n; j++) {
            if (rnd.nextDouble() < p) { L[i][j] = -1; L[j][i] = -1; L[i][i]++; L[j][j]++; }
        }
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

    // -------------------------------------------------- matrix utilities
    /** Convert a Laplacian to the original program's adjacency form (-1 edges, degree diagonal). */
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

    // ----------------------------------- ORIGINAL reference (Dismantable_V2) -----------------------------------
    // Reproduced verbatim from the base program so the fuzzer compares against the exact semantics being optimised.
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
