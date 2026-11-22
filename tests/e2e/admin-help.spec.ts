import { devices } from '@playwright/test'
import { expect, test } from './fixtures'

test('el dueño usa Ayuda desde el riel y abre el alta de turnos fijos', async ({
  browser,
  adminStorageState,
}) => {
  const context = await browser.newContext({ storageState: JSON.parse(adminStorageState) })

  try {
    const page = await context.newPage()
    await page.goto('/grilla')
    await expect(page.getByRole('button', { name: /Hoy.*Elegir otra fecha/ })).toBeVisible()
    const helpButton = page.getByRole('button', { name: 'Ayuda', exact: true })
    const help = page.getByRole('dialog', { name: 'Ayuda' })
    const search = help.getByRole('searchbox', { name: '¿Qué querés hacer?' })

    await helpButton.click()
    await search.fill('precio')
    await help.getByText('¿Cómo cambio el precio de una cancha?', { exact: true }).click()
    await expect(help.getByRole('link', { name: 'Abrir Canchas' })).toHaveAttribute(
      'href',
      '/canchas',
    )
    const reportHref = await help
      .getByRole('link', { name: 'Reportar un problema' })
      .getAttribute('href')
    expect(decodeURIComponent(reportHref ?? '')).toContain('Sección: Grilla')

    await page.keyboard.press('Escape')
    await expect(help).toBeHidden()
    await expect(helpButton).toBeFocused()
    await expect(page).toHaveURL(/\/grilla(?:\?.*)?$/)

    await helpButton.click()
    await expect(search).toHaveValue('')
    await search.fill('turno semanal')
    await help.getByText('¿Cómo creo un turno fijo?', { exact: true }).click()
    await help.getByRole('link', { name: 'Abrir Nuevo turno fijo' }).click()
    await expect(page.getByRole('heading', { name: 'Nuevo turno fijo' })).toBeVisible()
    await expect(help).toBeHidden()
  } finally {
    await context.close()
  }
})

test('el encargado abre Ayuda desde Más en el celular', async ({
  browser,
  managerStorageState,
}) => {
  const context = await browser.newContext({
    ...devices['Pixel 5'],
    colorScheme: 'dark',
    storageState: JSON.parse(managerStorageState),
  })

  try {
    const page = await context.newPage()
    await page.goto('/grilla')
    await expect(page.getByRole('button', { name: /Hoy.*Elegir otra fecha/ })).toBeVisible()
    const more = page.getByRole('button', { name: 'Más', exact: true })
    const help = page.getByRole('dialog', { name: 'Ayuda' })

    await more.click()
    await page
      .getByRole('dialog', { name: 'Menú de navegación' })
      .getByRole('button', { name: 'Ayuda' })
      .click()
    await expect(help).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Menú de navegación' })).toBeHidden()
    await expect(help.getByRole('heading', { name: 'Ayuda' })).toBeFocused()
    await help.getByRole('searchbox').fill('precios')
    await expect(help.getByText('No encontramos esa tarea.')).toBeVisible()
    await expect(help.getByRole('link', { name: 'Reportar un problema' })).toBeVisible()

    await help.getByRole('button', { name: 'Cerrar' }).click()
    await expect(help).toBeHidden()
    await expect(more).toBeFocused()
    await expect(page).toHaveURL(/\/grilla(?:\?.*)?$/)
  } finally {
    await context.close()
  }
})
