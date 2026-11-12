import { expect, type Page } from '@playwright/test'

/**
 * Recorre el alta pública de /register hasta la pantalla de cuenta, sin sesión.
 * Un formato (Fútbol 5 x1), horario 08 a 00 y precio $20.000: los defaults hacen el resto.
 * La dirección se carga a mano para no depender de Georef (un tercero).
 */
export async function answerComplexQuestions(page: Page, complexName: string): Promise<void> {
  await page.goto('/register')

  await expect(page.getByRole('heading', { name: '¿Cómo se llama tu complejo?' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText(/paso 1 de 4/i)).toBeVisible()
  await page.getByLabel(/nombre del complejo/i).fill(complexName)
  await page.getByRole('button', { name: 'Siguiente' }).click()

  await expect(page.getByRole('heading', { name: /¿Dónde queda/i })).toBeVisible()
  await page.getByRole('button', { name: /escribir ciudad y provincia a mano/i }).click()
  await page.getByLabel('Dirección').fill('Av. Test 123')
  await page.getByLabel('Ciudad').fill('Luján')
  await page.getByRole('combobox', { name: /provincia/i }).click()
  await page.getByRole('option', { name: 'Buenos Aires' }).click()
  await page.getByRole('button', { name: 'Siguiente' }).click()

  await expect(page.getByRole('heading', { name: '¿Qué canchas tenés?' })).toBeVisible()
  await expect(page.getByText('Tu complejo tiene 1 cancha')).toBeVisible()
  await page.getByRole('button', { name: 'Siguiente' }).click()

  await expect(page.getByRole('heading', { name: '¿A qué hora abrís y cerrás?' })).toBeVisible()
  await page.getByRole('button', { name: 'Siguiente' }).click()

  await expect(page.getByRole('heading', { name: '¿Cuánto cobrás el turno?' })).toBeVisible()
  await page.getByRole('textbox', { name: /precio del turno/i }).fill('20000')
  await page.getByRole('button', { name: 'Siguiente' }).click()

  await page.getByRole('radio', { name: 'Por WhatsApp' }).click()
  await page.getByRole('radio', { name: 'No' }).click()
  await page.getByRole('radio', { name: 'No' }).click()

  await expect(page.getByRole('heading', { name: 'Último paso: tu cuenta' })).toBeVisible()
}

/** Pantalla de cuenta por mail: celular, "Continuar con email", datos y "Crear mi cuenta". */
export async function createAccountWithMail(
  page: Page,
  account: { name: string; email: string; phone: string; password: string },
): Promise<void> {
  await page.locator('#signup-phone').fill(account.phone)
  await page.getByRole('button', { name: /continuar con email/i }).click()
  await page.getByLabel('Tu nombre').fill(account.name)
  await page.getByLabel('Tu email').fill(account.email)
  await page.getByLabel('Contraseña').fill(account.password)
  await page.getByRole('button', { name: 'Crear mi cuenta' }).click()
}
