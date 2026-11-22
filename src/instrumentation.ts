/**
 * Hook de arranque de Next. El trabajo real vive en instrumentation-node.ts
 * (import dinámico condicionado al runtime para que el bundler edge no
 * intente resolver dependencias de Node como `postgres`).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const {
      checkMediaDir,
      cleanupOrphanRuns,
      encryptLegacySecrets,
      resumeDispatch,
      resumeWebhooks,
    } = await import("./instrumentation-node");
    await checkMediaDir();
    // On Vercel many instances start and stop on their own, so a new one
    // can't tell a crashed Lab run from one still running elsewhere.
    if (!process.env.VERCEL) await cleanupOrphanRuns();
    await encryptLegacySecrets();
    resumeDispatch();
    resumeWebhooks();
  }
}
