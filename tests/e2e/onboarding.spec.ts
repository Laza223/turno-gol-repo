import { test, expect } from './fixtures'
import { answerComplexQuestions } from './_helpers/public-signup'

/**
 * E2E: alta por toques de un complejo nuevo.
 *
 * Alta pública (TG-HP-202 hace el recorrido completo contra la DB): /register, sin sesión,
 * complejo primero y cuenta al final, con el borrador en localStorage.
 * Wizard por rutas (alta asistida y tenants a mitad de camino): /onboarding (5 pasos, una
 * pregunta por pantalla) → /onboarding/resumen → /onboarding/listo ("Compartir mi link")
 * → /dashboard.
 *
 * El alta pública y el wizard se prueban por separado: el wizard arranca con el
 * storage state del fresh admin. La dirección se carga "a mano" para no depender
 * de Georef (un tercero) en el e2e.
 */

test.describe('onboarding', () => {
  test.describe('alta pública en /register', () => {
    test('arranca por el complejo, sin pedir cuenta', async ({ page }) => {
      await page.goto('/register')

      await expect(page.getByRole('heading', { name: '¿Cómo se llama tu complejo?' })).toBeVisible({
        timeout: 15_000,
      })
      await expect(page.getByText(/paso 1 de 4/i)).toBeVisible()
      await expect(page.getByLabel(/nombre del complejo/i)).toBeVisible()
      await expect(page.getByLabel(/contraseña/i)).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Siguiente' })).toBeVisible()
    })

    test('no avanza con el nombre vacío', async ({ page }) => {
      await page.goto('/register')
      await page.getByRole('button', { name: 'Siguiente' }).click()
      await expect(page.getByText('Escribí el nombre de tu complejo.')).toBeVisible()
    })

    test('retoma donde quedó: el borrador sobrevive a recargar', async ({ page }) => {
      await page.goto('/register')
      await page.getByLabel(/nombre del complejo/i).fill('Complejo Borrador')
      await page.getByRole('button', { name: 'Siguiente' }).click()
      await page.getByRole('button', { name: /escribir ciudad y provincia a mano/i }).click()
      await page.getByLabel('Dirección').fill('Av. Test 123')
      await page.getByLabel('Ciudad').fill('Luján')
      await page.getByRole('combobox', { name: /provincia/i }).click()
      await page.getByRole('option', { name: 'Buenos Aires' }).click()
      await page.getByRole('button', { name: 'Siguiente' }).click()
      await expect(page.getByRole('heading', { name: '¿Qué canchas tenés?' })).toBeVisible()

      await page.reload()
      await expect(page.getByRole('heading', { name: '¿Qué canchas tenés?' })).toBeVisible({
        timeout: 15_000,
      })
      await expect(page.getByText(/paso 2 de 4/i)).toBeVisible()
    })

    test('la última pantalla ofrece Google (recomendado) y email, y pide el celular', async ({
      page,
    }) => {
      await answerComplexQuestions(page, 'Complejo Cuenta')
      await expect(page.getByRole('button', { name: /continuar con google/i })).toBeVisible()
      await expect(page.getByText('Recomendado · más rápido, sin contraseña')).toBeVisible()
      await expect(page.getByRole('button', { name: /continuar con email/i })).toBeVisible()

      // Sin celular no se abre Google.
      await page.getByRole('button', { name: /continuar con google/i }).click()
      await expect(page.getByText(/escribí un celular válido/i)).toBeVisible()
    })

    test('has link to login for existing users', async ({ page }) => {
      await answerComplexQuestions(page, 'Complejo Login')
      const loginLink = page.getByRole('link', { name: /^ingresar$/i })
      await expect(loginLink).toBeVisible()
      await expect(loginLink).toHaveAttribute('href', '/login')
    })

    test('/register/finalizar sin borrador manda a empezar', async ({ page }) => {
      await page.goto('/register/finalizar')
      await expect(
        page.getByRole('heading', { name: 'No encontramos las respuestas de tu complejo' }),
      ).toBeVisible({ timeout: 15_000 })
      await expect(page.getByRole('link', { name: 'Cargar mi complejo' })).toHaveAttribute(
        'href',
        '/register',
      )
    })

    test('?error=player_account muestra el aviso de mail de jugador', async ({ page }) => {
      await answerComplexQuestions(page, 'Complejo Jugador')
      await page.goto('/register?error=player_account')
      await expect(
        page.getByText('Ese mail ya es de una cuenta de jugador. Usá otro mail para tu complejo.'),
      ).toBeVisible({ timeout: 15_000 })
    })
  })

  test.describe('onboarding wizard', () => {
    test('redirects unauthenticated user to /login', async ({ page }) => {
      await page.goto('/onboarding')
      await expect(page).toHaveURL(/\/login/)
    })

    test('arranca con una pregunta por pantalla y el progreso en 5 pasos', async ({
      page,
      freshAdminStorageState,
    }) => {
      await page.context().addCookies(JSON.parse(freshAdminStorageState).cookies)
      await page.goto('/onboarding')

      // El label de progreso existe en el rail desktop y en el header mobile
      // (uno visible por viewport) → .first().
      await expect(page.getByText(/paso 1 de 5/i).first()).toBeVisible()
      await expect(page.getByRole('heading', { name: '¿Cómo se llama tu complejo?' })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByRole('button', { name: 'Siguiente' })).toBeVisible()
    })

    test('el resumen no se abre sin haber hecho los 5 pasos', async ({
      page,
      freshAdminStorageState,
    }) => {
      await page.context().addCookies(JSON.parse(freshAdminStorageState).cookies)
      await page.goto('/onboarding/resumen')
      await expect(page).toHaveURL(/\/onboarding\/(complejo|canchas)/, { timeout: 10_000 })
    })
  })

  test.describe.serial('full wizard flow', () => {
    test('completa los 5 pasos, corrige desde el resumen y llega a /onboarding/listo', async ({
      page,
      freshAdminStorageState,
    }) => {
      await page.context().addCookies(JSON.parse(freshAdminStorageState).cookies)
      await page.goto('/onboarding')

      // Paso 1, pantalla 1: el nombre. Equivocado a propósito: se corrige desde el
      // resumen, y el assert final del dashboard prueba que el UPDATE persistió.
      await expect(page.getByRole('heading', { name: '¿Cómo se llama tu complejo?' })).toBeVisible({
        timeout: 10_000,
      })
      await page.getByLabel(/nombre del complejo/i).fill('Complejo Wizard Borrador')
      await page.getByRole('button', { name: 'Siguiente' }).click()

      // Paso 1, pantalla 2: la dirección. Sin Georef: ciudad y provincia a mano.
      await expect(page.getByRole('heading', { name: /¿dónde queda/i })).toBeVisible()
      await page.getByRole('button', { name: /escribir ciudad y provincia a mano/i }).click()
      await page.getByLabel('Dirección').fill('Av. Test 123')
      await page.getByLabel('Ciudad').fill('Buenos Aires')
      await page.getByRole('combobox', { name: /provincia/i }).click()
      await page.getByRole('option', { name: 'Buenos Aires' }).click()
      await page.getByRole('button', { name: 'Siguiente' }).click()

      // Paso 2: canchas. Fútbol 5 arranca en 1, así que alcanza con seguir.
      await expect(page.getByText(/paso 2 de 5/i).first()).toBeVisible({ timeout: 10_000 })
      await expect(page.getByRole('heading', { name: '¿Qué canchas tenés?' })).toBeVisible()
      await page.getByRole('button', { name: 'Siguiente' }).click()

      // Paso 3: horarios. De 08 a 00 por defecto, válido sin tocar nada.
      await expect(page.getByText(/paso 3 de 5/i).first()).toBeVisible({ timeout: 10_000 })
      await expect(page.getByRole('heading', { name: '¿A qué hora abrís y cerrás?' })).toBeVisible()

      // "Atrás" vuelve al paso anterior; el paso ya hecho se puede reenviar.
      await page.getByRole('link', { name: 'Atrás' }).click()
      await expect(page).toHaveURL(/\/onboarding\/canchas/, { timeout: 10_000 })
      await page.getByRole('button', { name: 'Siguiente' }).click()
      await expect(page).toHaveURL(/\/onboarding\/horarios/, { timeout: 10_000 })
      await page.getByRole('button', { name: 'Siguiente' }).click()

      // Paso 4: precios. Un solo formato, así que el título no nombra el formato.
      await expect(page.getByText(/paso 4 de 5/i).first()).toBeVisible({ timeout: 10_000 })
      await expect(page.getByRole('heading', { name: '¿Cuánto cobrás el turno?' })).toBeVisible()
      await page.getByRole('textbox', { name: /precio del turno/i }).fill('20000')
      await expect(page.getByText('Un turno de 60 minutos: $20.000')).toBeVisible()
      await page.getByRole('button', { name: 'Siguiente' }).click()

      // Paso 5: tres preguntas de un toque, cada opción avanza sola.
      await expect(page.getByText(/paso 5 de 5/i).first()).toBeVisible({ timeout: 10_000 })
      await page.getByRole('radio', { name: 'Por WhatsApp' }).click()
      await expect(page.getByRole('heading', { name: /equipos que juegan fijo/i })).toBeVisible()
      await page.getByRole('radio', { name: 'Sí' }).click()
      await expect(page.getByRole('heading', { name: '¿Tenés buffet o kiosco?' })).toBeVisible()
      await page.getByRole('radio', { name: 'No' }).click()

      // Resumen: bloques con "Cambiar". Corrige el nombre y vuelve al resumen.
      await expect(page).toHaveURL(/\/onboarding\/resumen/, { timeout: 15_000 })
      await expect(page.getByRole('heading', { name: '¿Está todo bien?' })).toBeVisible()
      await expect(page.getByText('Complejo Wizard Borrador')).toBeVisible()
      await page.getByRole('link', { name: 'Cambiar', exact: true }).first().click()
      await expect(page).toHaveURL(/\/onboarding\/complejo/, { timeout: 10_000 })
      await expect(page.getByLabel(/nombre del complejo/i)).toHaveValue('Complejo Wizard Borrador')

      const link = page.locator('p:has-text("Tu link va a ser") strong')
      const slugAntes = await link.innerText()
      await page.getByLabel(/nombre del complejo/i).fill('Complejo Wizard E2E')
      // El link público NO se recalcula al renombrar: ya pudo viajar por WhatsApp.
      await expect(link).toHaveText(slugAntes)
      await page.getByRole('button', { name: 'Siguiente' }).click()
      await page.getByRole('button', { name: 'Guardar' }).click()

      await expect(page).toHaveURL(/\/onboarding\/resumen/, { timeout: 15_000 })
      await expect(page.getByText('Complejo Wizard E2E')).toBeVisible()
      await page.getByRole('button', { name: /abrir mi complejo/i }).click()

      // Cierre peak-end: "Compartir mi link" es la acción principal. Sin primera
      // reserva ni MercadoPago en esta pantalla: pasaron a la checklist del panel.
      await expect(page).toHaveURL(/\/onboarding\/listo/, { timeout: 15_000 })
      await expect(page.getByRole('heading', { name: /tu complejo está online/i })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText(/compartir mi link/i).first()).toBeVisible()
      await expect(page.getByRole('button', { name: /copiar link/i })).toBeVisible()
      await expect(page.getByText(/primera reserva/i)).toHaveCount(0)
      await expect(page.getByText(/mercadopago/i)).toHaveCount(0)

      // "Ir a mi panel" aterriza en el dashboard con el tenant creado.
      await page.getByRole('link', { name: /ir a mi panel/i }).click()
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
      await expect(page.getByText(/Complejo Wizard E2E/i).first()).toBeVisible({ timeout: 10_000 })

      // Tour de coachmarks de primera visita (Fase 1 UX §7): 3 pasos NO
      // bloqueantes, una sola vez (persiste admin_tour_seen_at). El wizard
      // recién completado deja onboarding_completed=true sin esa marca, así
      // que el primer /dashboard de un admin nuevo dispara el tour.
      const step1Text = /abrí la grilla desde acá/i
      const step2Text = /completá estos pasos/i
      const step3Text = /compartí este link/i

      await expect(page.getByText(step1Text)).toBeVisible({ timeout: 10_000 })
      await page.getByRole('button', { name: 'Siguiente' }).click()
      await expect(page.getByText(step2Text)).toBeVisible()
      await page.getByRole('button', { name: 'Siguiente' }).click()
      await expect(page.getByText(step3Text)).toBeVisible()
      // La persistencia de admin_tour_seen_at es una Server Action async
      // disparada por el click: hay que esperar su round-trip ANTES del
      // reload, o el tour puede reaparecer legítimamente (race, no bug).
      const persistTour = page.waitForResponse(
        (resp) => resp.request().method() === 'POST' && resp.url().includes('/dashboard'),
        { timeout: 10_000 },
      )
      await page.getByRole('button', { name: 'Entendido' }).click()
      await expect(page.getByText(step3Text)).toBeHidden()
      await persistTour

      // No vuelve a aparecer tras un reload: admin_tour_seen_at ya se persistió.
      await page.reload()
      await expect(page.getByText(/Complejo Wizard E2E/i).first()).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText(step1Text)).toBeHidden()
    })
  })
})
