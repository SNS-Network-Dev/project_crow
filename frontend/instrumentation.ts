// Runs once when the Next.js server boots. Pre-warm the baremetal matrix from
// MySQL so the first check-in doesn't pay the load cost (and so a baremetal that
// restarted while the bridge was up gets re-hydrated promptly).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureMatrixSynced } = await import("@/lib/baremetal");
    try {
      await ensureMatrixSynced(true);
    } catch {
      /* baremetal may not be configured yet — the per-request sync will retry */
    }
  }
}
