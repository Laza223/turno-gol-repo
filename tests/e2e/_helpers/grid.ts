import { expect, type Locator, type Page } from '@playwright/test'

/**
 * La vista de la grilla que se está viendo: la matriz desde `md`, la lista por
 * hora en el teléfono (decisión del dueño 2026-10-22). Las dos están montadas
 * y elige el CSS, y `getByText` encuentra también la oculta (`getByRole` no),
 * así que buscar un turno por su nombre sin esto choca con el strict mode.
 */
export function visibleGridView(page: Page): Locator {
  return page.getByTestId(/^booking-(grid|hour-list)$/).filter({ visible: true })
}

/**
 * Abre el modal de alta (pages/grilla.md §3bis, decisión 2026-09-14)
 * clickeando una celda libre, reintentando hasta que aparezca.
 *
 * El reintento NO es paranoia: el `<button>` del slot ya viene en el HTML del
 * SSR, así que Playwright lo ve y lo clickea apenas es visible — pero si React
 * todavía no hidrató, el click es un **no-op silencioso** y el modal nunca
 * abre. `waitUntil: 'networkidle'` alcanzaba cuando la celda sólo abría el
 * modal viejo; la grilla carga chunks extra (panel del turno, diálogos lazy) y
 * en CI el primer spec que toca /grilla paga ese arranque en frío y pierde la
 * carrera.
 *
 * `expect.toPass` reintenta el click completo, así que la primera pasada que
 * cae antes de la hidratación no rompe el test.
 */
export async function openCreateModal(page: Page, timeStart: string): Promise<void> {
  await expect(visibleGridView(page)).toBeVisible({ timeout: 15_000 })
  await expect(async () => {
    // La lista del teléfono dice "Reservar turno a las HH:MM en …".
    await page
      .getByRole('button', { name: new RegExp(`Reservar turno (a las )?${timeStart}`, 'i') })
      .first()
      .click()
    await expect(page.getByText('Nueva reserva')).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
}
