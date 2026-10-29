import { test, expect } from '@playwright/test'

test.describe('public availability', () => {
  test('tenant page shows name + the day and hour pickers', async ({ page }) => {
    await page.goto('/e2e-complejo-demo')
    // getByText matchea tambien el <title>: desde Next 16 la metadata streamea
    // dentro del <body> (React la hoistea al <head> en el cliente), asi que el
    // <title> es un nodo de texto mas del documento. Apuntamos al h1, que es lo
    // que el test quiere verificar: el nombre visible para el usuario.
    await expect(page.getByRole('heading', { level: 1, name: 'E2E Complejo Demo' })).toBeVisible()
    // La reserva arranca en el paso 1 (la lista de días); tocar uno lleva al paso 2 con, tras el
    // fetch, al menos una hora (HH:MM).
    const reserva = page.getByRole('region', { name: 'Reservá tu turno' })
    await expect(reserva.getByRole('list', { name: 'Día' })).toBeVisible()
    await reserva.getByRole('button', { name: /^Mañana/ }).click()
    await expect(reserva.getByRole('group', { name: 'Hora' })).toBeVisible()
    await expect(reserva.getByRole('button', { name: /^\d{2}:\d{2}/ }).first()).toBeVisible()
  })

  // La vista semanal se sacó (PR 2.3a): el link viejo redirige a la ficha y la query pasa sola.
  // El recorrido en el navegador lo cubre TG-HP-004; acá se mira el redirect en sí, sin seguirlo.
  test('old weekly URL redirects (308) to the profile and keeps the query', async ({ request }) => {
    const res = await request.get('/e2e-complejo-demo/disponibilidad?date=2099-01-01', {
      maxRedirects: 0,
    })
    expect(res.status()).toBe(308)
    const location = new URL(res.headers()['location']!, 'http://localhost')
    expect(location.pathname).toBe('/e2e-complejo-demo')
    expect(location.search).toBe('?date=2099-01-01')
  })
})
