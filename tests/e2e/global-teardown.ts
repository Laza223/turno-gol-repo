/**
 * No-op for now. The seed is idempotent, so the next run cleans up its own state.
 * If we ever add DB-writing specs (currently all read-only), add per-spec cleanup
 * via `test.afterEach` rather than here.
 */
export default async function globalTeardown(): Promise<void> {
  // intentionally empty
}
