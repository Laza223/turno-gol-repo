import { expect, type Page } from '@playwright/test'

/**
 * Abre el popover de alta rápida de la grilla (Fase 3) clickeando una celda
 * libre, reintentando hasta que aparezca.
 *
 * El reintento NO es paranoia: el `<button>` del slot ya viene en el HTML del
 * SSR, así que Playwright lo ve y lo clickea apenas es visible — pero si React
 * todavía no hidrató, el click es un **no-op silencioso** y el popover nunca
 * abre. `waitUntil: 'networkidle'` alcanzaba cuando la celda sólo abría el
 * modal; desde Fase 3 la grilla carga chunks extra (panel del turno, diálogos
 * lazy) y en CI el primer spec que toca /grilla paga ese arranque en frío y
 * pierde la carrera. Falló 3 de 3 en CI (intento + 2 retries) y 0 de 3 local:
 * es una carrera de arranque, no un flake al azar.
 *
 * `expect.toPass` reintenta el click completo, así que la primera pasada que
 * cae antes de la hidratación no rompe el test.
 */
export async function openQuickBookingPopover(page: Page, timeStart: string): Promise<void> {
  await expect(page.getByTestId('booking-grid')).toBeVisible({ timeout: 15_000 })
  await expect(async () => {
    await page
      .getByRole('button', { name: new RegExp(`Reservar turno ${timeStart}`, 'i') })
      .first()
      .click()
    await expect(page.getByLabel('¿A nombre de quién?')).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
}
