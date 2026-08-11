import { readFile } from 'node:fs/promises'
import { test, expect } from '../../fixtures'
import { writeEvidence } from '../_qa/evidence'
import { E2E_PLAYER_EMAIL } from '../../_helpers/player-seed'

/**
 * TG-HP-111 — Exportar datos ARCO /configuracion.
 * Rol: Jugador logueado.
 *
 * Evidence anchors: ConfiguracionView.tsx:56-71, DataExportButton.tsx:9-53,55-71,
 * api/player/data-export/route.ts:11-29,89-130.
 */

test.describe('TG-HP-111 — Exportar datos ARCO', () => {
  test('descarga un JSON con profile + bookings + payments + consents', async ({
    browser,
    playerStorageState,
  }) => {
    const ctx = await browser.newContext({ acceptDownloads: true })
    await ctx.addCookies(JSON.parse(playerStorageState).cookies)
    const page = await ctx.newPage()

    try {
      await page.goto('/configuracion')
      await expect(page.getByRole('heading', { name: 'Mi cuenta', exact: true })).toBeVisible()
      await expect(page.getByText('Tus datos personales')).toBeVisible()

      const downloadBtn = page.getByRole('button', { name: 'Descargar mis datos' })
      await expect(downloadBtn).toBeVisible()
      await expect(downloadBtn).toBeEnabled()

      // El click de React tarda en hidratar en el primer hit de dev — esperar
      // networkidle antes de interactuar (mismo gotcha documentado en
      // player-data-export.spec.ts).
      await page.waitForLoadState('networkidle')

      const [download] = await Promise.all([page.waitForEvent('download'), downloadBtn.click()])
      // Anti-doble-submit: disabled={status==='loading'}, texto "Generando..." —
      // ventana muy corta en dev para asertear en vivo de forma no-flaky.

      expect(download.suggestedFilename()).toMatch(/^turnogol-mis-datos-\d{4}-\d{2}-\d{2}\.json$/)

      const path = await download.path()
      expect(path).toBeTruthy()
      const content = await readFile(path!, 'utf-8')
      const bundle = JSON.parse(content) as {
        profile: { email: string; first_name: string }
        bookings: unknown[]
        payments: unknown[]
        consents: { terms_accepted: boolean }
        tenant_relationships: unknown[]
        bans: unknown[]
      }

      expect(bundle.profile.email).toBe(E2E_PLAYER_EMAIL)
      expect(Array.isArray(bundle.bookings)).toBe(true)
      expect(Array.isArray(bundle.payments)).toBe(true)
      expect(bundle.consents.terms_accepted).toBe(true)
      expect(Array.isArray(bundle.tenant_relationships)).toBe(true)
      expect(Array.isArray(bundle.bans)).toBe(true)

      await writeEvidence('TG-HP-111', {
        status: 'pass',
        filename: download.suggestedFilename(),
        bundleShape: Object.keys(bundle),
        notes:
          'Descarga real via Blob URL + anchor.click(). Registro de auditoría va a Sentry ' +
          '(captureMessage), no a audit_logs (esa tabla exige tenant_id NOT NULL) — no verificable ' +
          'desde este spec sin acceso a Sentry.',
      })
    } finally {
      await ctx.close()
      // Solo lectura — sin escritura en DB, sin cleanup necesario.
    }
  })
})
