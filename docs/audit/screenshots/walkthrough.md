# TurnoGol UI Audit Screenshots Capture Walkthrough

This document outlines the results, index, and methodology of the systematic UI screenshot captures of the TurnoGol application. These captures are organized specifically for a UX audit by another model (Fable 5).

## Directory Structure

All captured screenshots are stored in the `docs/audit/screenshots/` directory, separated by viewport and organized into categories:

```
docs/audit/screenshots/
├── desktop/
│   ├── public/
│   ├── auth_onboarding/
│   ├── admin/
│   ├── player/
│   └── special_states/
└── mobile/
    ├── public/
    ├── auth_onboarding/
    ├── admin/
    ├── player/
    └── special_states/
```

---

## Complete Screenshot Index

Both **Desktop (1440x900)** and **Mobile (393x851 - Pixel 5)** viewports contain exactly the same screens in their corresponding directory paths. Below is the list of captured files and states:

### 1. Public Views (`public/`)
* **`landing.png`**: The main landing/welcome page for non-authenticated users.
* **`explorar_con_resultados.png`**: The search/explorar page populated with active complexes.
* **`explorar_vacio.png`**: The search/explorar page when no results match the filter query.
* **`pagina_complejo.png`**: A complex profile page showing details, address, ratings, and features.
* **`disponibilidad_semanal.png`**: The weekly availability grid widget for a court.
* **`reserva_formulario_sin_sena.png`**: Booking form for a slot that does *not* require a deposit (payment upfront).
* **`reserva_formulario_con_sena.png`**: Booking form for a slot that *does* require a deposit (seña).
* **`reserva_checkout_mp.png`**: The mocked MercadoPago checkout page.
* **`reserva_exito.png`**: The confirmation page showing a successfully completed booking.
* **`reserva_expirada.png`**: The timeout/expiration state when a checkout session is not completed in time.

### 2. Auth & Onboarding (`auth_onboarding/`)
* **`login_staff_inicial.png`**: The administrative staff login page.
* **`login_jugador_inicial.png`**: The player magic-link login entry page.
* **`login_jugador_revisa_email.png`**: The confirmation message screen showing a magic link has been sent.
* **`onboarding_paso_1.png`**: Tenant wizard step 1: Basic complex info.
* **`onboarding_paso_2.png`**: Tenant wizard step 2: Courts configuration.
* **`onboarding_paso_3.png`**: Tenant wizard step 3: Operating hours and slot durations.
* **`onboarding_paso_4.png`**: Tenant wizard step 4: Settings and preview screen.

### 3. Admin Panel (`admin/`)
* **`dashboard.png`**: The landing home dashboard for complex admins.
* **`grilla.png`**: The interactive schedule/booking grid (daily view).
* **`reservas_creacion_modal.png`**: Modal dialog opened when clicking an empty slot to create a booking manually.
* **`reservas_listado.png`**: The comprehensive bookings log table view.
* **`reservas_detalle.png`**: Detailed booking info page.
* **`reservas_cancelacion_modal.png`**: Modal dialog to confirm booking cancellation.
* **`caja.png`**: Cash flow control page (daily register/closes log).
* **`caja_registrar_movimiento_modal.png`**: Modal dialog to register custom income/expenses.
* **`canchas_listado.png`**: List of registered courts.
* **`canchas_formulario_modal.png`**: Inline/form view to create or edit a court.
* **`abonados_listado.png`**: Members (abonados) registry table.
* **`abonados_detalle_con_saldo.png`**: Selected member's detail page showing active balance.
* **`abonados_modal_de_cobro.png`**: Modal dialog to charge balance to a member.
* **`settings_general.png`**: General complex/tenant configurations page.
* **`settings_horarios.png`**: Complex operational hours settings page.
* **`settings_politicas_pin.png`**: Complex security/cancellation policy page.
* **`staff_listado.png`**: Team members overview and roles page.
* **`staff_invitacion_modal.png`**: Modal dialog to invite a new staff member.
* **`reportes.png`**: Metrics reports page populated with charts and analytical tables.

### 4. Player Views (`player/`)
* **`mis_reservas.png`**: Active and historical bookings list page for players.
* **`perfil.png`**: Player personal details editing form.
* **`configuracion.png`**: Security and custom theme configurations page.
* **`eliminar_cuenta_confirmacion.png`**: Dangerous action confirmation modal to delete account.

### 5. Special States (`special_states/`)
* **`grilla_loading.png`**: Next.js streamed loading skeleton state for the scheduler grid.
* **`caja_loading.png`**: Next.js streamed loading skeleton state for the cash registry view.
* **`dashboard_loading.png`**: Next.js streamed loading skeleton state for the main dashboard metrics.
* **`grilla_error.png`**: Next.js layout-level error boundary UI (`error.tsx`) captured on load failure.

---

## Technical Methodology

1. **Deterministic Session Setup**:
   * Playwright setup authenticates admin and player sessions sequentially in a global routine.
   * Supabase configuration token capture handles player magic link generation and login by polling Inbucket.
   * `MP_MOCK_MODE=1` enables simulated checkout steps so MercadoPago screens are fully captured without real money.

2. **Loading States**:
   * Page route handlers throttle Server Component payload responses (`**/grilla*`, `**/caja*`, `**/dashboard*`) by introducing a delay of 8 seconds (`waitUntil: 'commit'`), allowing Playwright to capture the intermediate skeleton loaders.

3. **Layout Error Boundary State**:
   * To reliably trigger the Next.js `/grilla/error.tsx` boundary on the server, we connect to the PostgreSQL instance using `postgres` and temporarily rename the `bookings` table to `bookings_temp` immediately prior to loading the page.
   * Next.js server-side queries throw a database relation error, rendering the error component in the HTML document.
   * Once captured, the table name is reverted inside a `finally` block, ensuring no side effects occur.

---

## Verification Summary

All verification passes successfully:

### Automated Test Runs
* **Desktop Viewport Test**:
  ```bash
  npx playwright test tests/e2e/capture-screenshots.spec.ts --project=chromium
  ```
  *Result*: **Passed** (1 test, 3.9m)

* **Mobile Viewport Test**:
  ```bash
  npx playwright test tests/e2e/capture-screenshots.spec.ts --project=mobile-chrome
  ```
  *Result*: **Passed** (1 test, 3.8m)
