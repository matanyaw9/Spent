export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { initScheduler } = await import("@/server/sync/scheduler");
  initScheduler();
  const { normalizeLegacyTransactionDates, reclassifyAllWorkspaces } =
    await import("@/server/db/queries/transactions");
  normalizeLegacyTransactionDates();
  reclassifyAllWorkspaces();
}
