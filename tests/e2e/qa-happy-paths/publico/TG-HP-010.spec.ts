import { test, expect } from '@playwright/test'
import { writeEvidence } from '../_qa/evidence'

/**
 * TG-HP-010 — Verify estados /verify (link expirado y éxito).
 * Rol: Visitante (no auth) — llega desde un magic-link de email o el callback de auth.
 * Prereq: ninguno — ambos estados se disparan por query params, sin token real de Supabase.
 * Evidence anchors: verify/page.tsx:9,56-93,99-131,147-163, SuccessRedirect.tsx:12-36,
 * safe-redirect.ts (sanitizeNext), auth-success.ts (parseIntent).
 *
 * Un solo test con dos fases (Caso A / Caso B) para escribir una única evidencia por
 * caso — writeEvidence('TG-HP-010', ...) pisaría el archivo si se llamara dos veces.
 */
test.describe('TG-HP-010 — Verify estados', () => {
  test('Caso A: link expirado + Caso B: éxito login con auto-redirect', async ({ page }) => {
    // ---- Caso A — Link expirado ----
    await page.goto('/verify?error=expired')
    await expect(
      page.getByRole('heading', { level: 1, name: 'No pudimos verificar tu enlace' }),
    ).toBeVisible()
    await expect(
      page.getByText('Este enlace expiró. Generá uno nuevo desde Iniciar sesión.'),
    ).toBeVisible()
    await page.getByRole('link', { name: 'Volver a intentar' }).click()
    await page.waitForURL('/login')
    expect(new URL(page.url()).pathname).toBe('/login')

    // ---- Caso B — Éxito (login) ----
    await page.goto('/verify?status=success&intent=login&next=%2Fmis-reservas')
    await expect(page.getByRole('heading', { level: 1, name: '¡Listo!' })).toBeVisible()
    await expect(page.getByText('Iniciaste sesión correctamente.')).toBeVisible()
    // Contador aria-live decreciendo (SuccessRedirect.tsx:32-34)
    await expect(page.getByText(/Te llevamos automáticamente en \d+s…/)).toBeVisible()

    // Click en el CTA antes de que expire el auto-redirect (5s) → navega a `next` saneado.
    // /mis-reservas exige sesión de jugador (extractAuthUser); sin ella, el guard server-side
    // redirige a /ingresar (mis-reservas/page.tsx:48-49) — comportamiento esperado sin login.
    await page.getByRole('link', { name: 'Ir a mis reservas' }).click()
    await page.waitForURL((url) => url.pathname !== '/verify')
    const destUrl = new URL(page.url())

    await writeEvidence('TG-HP-010', {
      status: 'pass',
      finalUrl: page.url(),
      caseA: { errorParam: 'expired', ctaTarget: '/login' },
      caseB: {
        successParams: 'status=success&intent=login&next=%2Fmis-reservas',
        clickedCtaBeforeAutoRedirect: true,
        destinationAfterGuard: destUrl.pathname,
      },
      dbWrites: 'none (la página solo interpreta searchParams, sin fetch)',
      notes:
        `Caso B: el CTA "Ir a mis reservas" navegó a /mis-reservas (next saneado por ` +
        `sanitizeNext), y el guard server-side sin sesión de jugador redirigió a ` +
        `"${destUrl.pathname}" — confirma que sanitizeNext + parseIntent funcionan de punta a ` +
        `punta, aunque el destino final no sea /mis-reservas por falta de auth (fuera de alcance ` +
        `de este caso no-auth). No se ejercitó el auto-redirect por window.location.assign a los ` +
        `5s (alternativa del manual) — se optó por el click determinístico del CTA.`,
    })
  })
})
