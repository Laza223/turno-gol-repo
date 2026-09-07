/**
 * True when this process is NOT the real production deploy. Vercel sets
 * `NODE_ENV=production` for EVERY deployed build, including Preview/staging
 * (see scripts/seed-staging.ts's own note on this) — so `NODE_ENV` alone
 * can't tell a Preview deploy from the real thing. `VERCEL_ENV` can:
 * it's `'production'` ONLY for the actual Production environment and
 * `'preview'` for every other Vercel deployment, so OR-ing in
 * `VERCEL_ENV === 'preview'` only ever widens this for non-prod deploys —
 * it can never itself evaluate true on the real prod domain.
 *
 * Vivía en `modules/payments/mock-mp.ts`, que es donde nació. Se mudó a
 * `@/shared` porque el gate de rate-limit lo necesita y `@/shared` no puede
 * importar `@/modules` (regla `turnogol/capas-shared`). Tener UNA definición
 * importa más que dónde vive: los interruptores que apagan defensas fuera de
 * producción tienen que decidir todos con el mismo criterio.
 */
export function isNonProductionRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== 'production' || env.VERCEL_ENV === 'preview'
}
