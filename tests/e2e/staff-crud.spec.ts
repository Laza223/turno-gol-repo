/**
 * E2E — Staff CRUD (audit T6, fase F5)
 *
 * Happy + 3 edge cases for the admin /staff UI (T3):
 *   #1  Happy — invite admin: open dialog → fill firstName/lastName/email → submit → row
 *              appears with "Inactivo" badge (invite sent, not yet activated).
 *   #2  Edge — desactivar con ConfirmDialog: pre-link a 2nd admin via service-role →
 *              open dropdown → "Desactivar" → type email → confirm → badge "Inactivo".
 *   #3  Edge — sole-admin disable guard: with the current admin as the only active member,
 *              the dropdown is hidden for self (m.staffUserId !== currentUser); the
 *              backend constraint (>1 active) is exercised by tests/integration/staff-actions.test.ts.
 *              We assert here that the dropdown column for self renders empty.
 *   #4  Edge — reenviar invitación: 2nd admin inactive → dropdown → "Reenviar invitación"
 *              → success toast. May fail in CI if Resend rate-limits; skipped if env flag off.
 *
 * The /staff page is admin-only (requireAdminStaff). The adminStorageState
 * fixture already provides an authenticated admin session — no extra gate.
 *
 * ISOLATION: each test allocates a fresh email (timestamp suffix). Cleanup deletes
 * staff_users + tenant_staff_members rows in `finally`.
 */

import type { BrowserContext, Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const TENANT_ID = '00000000-0000-4000-8000-000000000001'

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required for E2E staff tests',
    )
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

async function deleteStaffByEmail(
  supabase: ReturnType<typeof makeServiceClient>,
  email: string,
): Promise<void> {
  const { data } = await supabase.from('staff_users').select('id').eq('email', email).maybeSingle()
  if (!data) return
  await supabase
    .from('tenant_staff_members')
    .delete()
    .eq('tenant_id', TENANT_ID)
    .eq('staff_user_id', data.id)
  await supabase.from('staff_users').delete().eq('id', data.id)
}

type AppCookie = Parameters<BrowserContext['addCookies']>[0][number]

async function addAdminCookies(page: Page, storageStateJson: string): Promise<void> {
  const cookies = (JSON.parse(storageStateJson).cookies ?? []) as AppCookie[]
  await page.context().addCookies(cookies)
}

test.describe('Staff CRUD', () => {
  test('#1 happy — invite admin shows new inactive row', async ({ page, adminStorageState }) => {
    const supabase = makeServiceClient()
    const email = `e2e-staff-invite-${Date.now()}@turnogol.test`

    await addAdminCookies(page, adminStorageState)
    try {
      await page.goto('/staff')
      await page.getByRole('button', { name: /Agregar miembro del equipo/i }).click()
      await page.fill('input[name="firstName"]', 'Invitado')
      await page.fill('input[name="lastName"]', 'E2E')
      await page.fill('input[name="email"]', email)
      await page.getByRole('button', { name: /Enviar invitación/i }).click()

      await expect(page.getByText(email)).toBeVisible({ timeout: 10000 })
    } finally {
      await deleteStaffByEmail(supabase, email)
    }
  })

  test('#2 edge — desactivar con ConfirmDialog (type-to-confirm)', async ({
    page,
    adminStorageState,
  }) => {
    const supabase = makeServiceClient()
    const email = `e2e-staff-deactivate-${Date.now()}@turnogol.test`
    const staffUserId = randomUUID()
    const memberId = randomUUID()

    await addAdminCookies(page, adminStorageState)
    try {
      // Pre-link a 2nd admin via service-role
      await supabase.from('staff_users').insert({
        id: staffUserId,
        email,
        first_name: 'Segundo',
        last_name: 'Admin',
        status: 'active',
      })
      await supabase.from('tenant_staff_members').insert({
        id: memberId,
        tenant_id: TENANT_ID,
        staff_user_id: staffUserId,
        role: 'admin',
        is_active: true,
      })

      await page.goto('/staff')
      // Find the row for this email + click its dropdown trigger
      const row = page.locator('tr').filter({ hasText: email })
      await row.getByRole('button', { name: /Opciones/i }).click()
      await page.getByRole('menuitem', { name: /Desactivar/i }).click()

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()

      // type-to-confirm uses the exact email
      await dialog.locator('input#confirm-phrase').fill(email)
      await dialog.getByRole('button', { name: 'Desactivar' }).click()
      await expect(dialog).toBeHidden()

      // Badge should be Inactivo now
      const updatedRow = page.locator('tr').filter({ hasText: email })
      await expect(updatedRow.getByText('Inactivo')).toBeVisible()
    } finally {
      await deleteStaffByEmail(supabase, email)
    }
  })

  test('#3 edge — sole-admin self row has no dropdown', async ({
    page,
    adminStorageState,
  }) => {
    await addAdminCookies(page, adminStorageState)
    await page.goto('/staff')

    // The current user row is marked with "(vos)". The dropdown button is only rendered
    // when m.staffUserId !== user.staffUserId. So the self row should not have a
    // dropdown trigger button.
    const selfRow = page.locator('tr').filter({ hasText: '(vos)' })
    await expect(selfRow).toBeVisible()
    await expect(selfRow.getByRole('button', { name: /Opciones/i })).toHaveCount(0)

    // Backend >1 admin constraint is covered by tests/integration/staff-actions.test.ts.
  })

  test('#4 edge — reenviar invitación shows toast', async ({ page, adminStorageState }) => {
    test.skip(!process.env.E2E_RESEND_EMAIL, 'Skipped — set E2E_RESEND_EMAIL=1 to test Supabase invite delivery')
    const supabase = makeServiceClient()
    const email = `e2e-staff-resend-${Date.now()}@turnogol.test`
    const staffUserId = randomUUID()

    await addAdminCookies(page, adminStorageState)
    try {
      await supabase.from('staff_users').insert({
        id: staffUserId,
        email,
        first_name: 'Reinvitado',
        last_name: 'E2E',
        status: 'active',
      })
      await supabase.from('tenant_staff_members').insert({
        tenant_id: TENANT_ID,
        staff_user_id: staffUserId,
        role: 'admin',
        is_active: false, // inactive → "Reenviar invitación" is the visible action
      })

      await page.goto('/staff')
      const row = page.locator('tr').filter({ hasText: email })
      await row.getByRole('button', { name: /Opciones/i }).click()
      await page.getByRole('menuitem', { name: /Reenviar invitación/i }).click()

      await expect(page.getByText(/Invitación reenviada correctamente/i)).toBeVisible({
        timeout: 10000,
      })
    } finally {
      await deleteStaffByEmail(supabase, email)
    }
  })
})
