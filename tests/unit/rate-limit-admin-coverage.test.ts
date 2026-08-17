import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Static coverage guard (mirrors zod-coverage.test.ts): every admin-facing
// endpoint — API route handler OR Server Action — must enforce the `adminCrud`
// rate-limit policy. A new admin endpoint added without rate limiting fails
// here by default. See docs/security-decisions.md §"Rate limiting".

function findFiles(root: string, regex: RegExp, acc: string[] = []): string[] {
  if (!existsSync(root)) return acc
  for (const entry of readdirSync(root)) {
    const p = path.join(root, entry)
    const s = statSync(p)
    if (s.isDirectory()) findFiles(p, regex, acc)
    else if (regex.test(entry)) acc.push(p)
  }
  return acc
}

const ROOT = path.resolve(__dirname, '..', '..')
const rel = (f: string): string => path.relative(ROOT, f).replace(/\\/g, '/')
const read = (f: string): string => readFileSync(f, 'utf8')

// El rate limit se aplica de cuatro formas idiomáticas: guard() en route
// handlers, enforce() directo (handlers crudos / super-admin),
// adminRateLimited() en Server Actions, o la opción `rateLimit` de withTenant —
// que corre el mismo guard() pero ANTES de abrir la transacción, para no
// retener una conexión del pool durante el viaje a Upstash. Cualquiera cuenta
// como cobertura.
//
// Y con más de UN balde. `adminCrud` (100/60s por tenant) lo comparten todas
// las mutaciones de plata del staff, así que las lecturas automáticas —las que
// dispara navegar, no un click— van a baldes propios para no comerle el
// presupuesto: `adminAvailabilityCheck` (chequeo al abrir el modal de reserva)
// y `adminDayTotal` (el "Hoy: $X" del sidebar, B14). Exigir `adminCrud` a secas
// empujaría cada lectura nueva justo al balde que hay que proteger.
//
// La lista es explícita a propósito: aceptar "cualquier policy" dejaría pasar
// un endpoint de admin protegido con, por ejemplo, el balde público.
const ADMIN_POLICIES = ['adminCrud', 'adminAvailabilityCheck', 'adminDayTotal'] as const

function hasAdminRateLimit(src: string): boolean {
  if (/adminRateLimited\s*\(/.test(src)) return true
  return ADMIN_POLICIES.some(
    (policy) =>
      new RegExp(String.raw`\b(?:guard|enforce)\(\s*['"]${policy}['"]`).test(src) ||
      new RegExp(String.raw`\brateLimit:\s*['"]${policy}['"]`).test(src),
  )
}

// Admin Server Actions: every mutating admin action lives in one of these trees.
const ADMIN_ACTION_FILES = [
  ...findFiles(path.join(ROOT, 'src/app/(admin)'), /^actions\.ts$/),
  ...findFiles(path.join(ROOT, 'src/app/onboarding'), /^actions\.ts$/),
  ...findFiles(path.join(ROOT, 'src/modules/tenants'), /^actions\.ts$/),
]

// Admin API routes: tenant-scoped routes resolve the admin via withTenant /
// withBillingTenant. That wrapper is the robust static signal for "admin route"
// (player routes use withPlayer; public/webhook/health use raw handlers).
const ALL_ROUTES = findFiles(path.join(ROOT, 'src/app/api'), /^route\.ts$/)
const TENANT_SCOPED_ROUTES = ALL_ROUTES.filter((f) => /\bwith(Billing)?Tenant\s*\(/.test(read(f)))

// Admin routes that use a raw handler (extractAuthUser) instead of withTenant —
// not caught by the heuristic above, so listed explicitly to keep them honest.
// `reports/revenue` salió de esta lista al pasar a `withTenant` (B10): ahora lo
// levanta TENANT_SCOPED_ROUTES, y dejarlo acá escondería una regresión futura.
const ADMIN_RAW_ROUTES = ['src/app/api/admin/jobs/route.ts'].map((p) => path.join(ROOT, p))

const ADMIN_FILES = Array.from(
  new Set([...ADMIN_ACTION_FILES, ...TENANT_SCOPED_ROUTES, ...ADMIN_RAW_ROUTES]),
)

describe('adminCrud rate-limit coverage on admin endpoints', () => {
  it('discovers a meaningful set of admin endpoints', () => {
    expect(ADMIN_FILES.length).toBeGreaterThan(20)
  })

  for (const f of ADMIN_FILES) {
    it(`${rel(f)} enforces adminCrud rate limiting`, () => {
      expect(
        hasAdminRateLimit(read(f)),
        `${rel(f)} must call guard('adminCrud', …), enforce('adminCrud', …) or adminRateLimited(…)`,
      ).toBe(true)
    })
  }
})

// El check de arriba es POR ARCHIVO: si una sola action del archivo llama
// adminRateLimited, el archivo entero pasa, aunque otra action del mismo
// archivo no lo haga. Así pasó desapercibida `finishOnboardingAction` (B13 del
// plan de refactor de onboarding) — era la única action de `actions.ts` sin
// rate limit y el test seguía verde porque sus vecinas sí lo llamaban. Se
// arregló en el código (Fase 1); este bloque repite el check por FUNCIÓN
// sobre ese mismo archivo, para que la próxima action que se agregue sin
// rate limit no vuelva a esconderse detrás de sus vecinas.
describe('src/app/onboarding/actions.ts: cada action trae su propio rate limit (B13)', () => {
  const file = path.join(ROOT, 'src/app/onboarding/actions.ts')
  const src = read(file)
  const actionNames = Array.from(src.matchAll(/^export async function (\w+Action)\(/gm)).map(
    (m) => m[1],
  )

  it('encuentra las actions esperadas (guard contra un archivo vacío o movido)', () => {
    expect(actionNames.length).toBeGreaterThan(0)
  })

  for (let i = 0; i < actionNames.length; i++) {
    const name = actionNames[i]
    it(`${name} llama adminRateLimited en su propio cuerpo, no solo en el archivo`, () => {
      const needle = `export async function ${name}(`
      const start = src.indexOf(needle)
      const nextNeedle =
        i + 1 < actionNames.length ? `export async function ${actionNames[i + 1]}(` : null
      const end = nextNeedle ? src.indexOf(nextNeedle, start + needle.length) : src.length
      const body = src.slice(start, end)
      expect(
        hasAdminRateLimit(body),
        `${name} debe llamar adminRateLimited(...) dentro de su propio cuerpo`,
      ).toBe(true)
    })
  }
})
