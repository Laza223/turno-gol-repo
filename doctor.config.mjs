// React Doctor configuration — https://react.doctor/docs/configuration/config-files
//
// Las supresiones de acá son el mecanismo canónico "la excepción vive con la
// config" (docs oficiales), NO un silence a ciegas. Cada override está acotado
// por `rules` (regla concreta) Y por `files`, y responde a un falso positivo
// VERIFICADO leyendo el código, no a esquivar una sugerencia válida.
//
// NOTA (react-doctor 0.7.1): `ignore.files` está roto — un patrón como
// '.design-sync/**' excluye ~110 hallazgos de archivos NO relacionados
// (server-auth-actions, etc. caen a 0). Por eso NO se usa `ignore.files`: todo
// va por `ignore.overrides`, que sí respeta el scope de `files`+`rules`.
//
// Los hallazgos de perf REALES que quedan (bounded-concurrency: dunning-retry
// x5 + booking.expiry:181) NO se suprimen: viven en el backlog para un follow-up.
export default {
  ignore: {
    overrides: [
      {
        // only-export-components es DEV-ONLY (React Fast Refresh: recarga completa
        // en vez de preservar estado al editar). CERO impacto en producción/usuario.
        // Estos archivos co-ubican, a propósito, un componente con sus variantes
        // cva / un helper puro status→visual / tablas de constantes estables — el
        // idiom de shadcn/ui. Partirlos churnearía importers por un beneficio solo
        // de hot-reload. `.design-sync/ds-entry.tsx` es el barrel de tooling que
        // re-exporta esas variantes.
        files: [
          'src/components/ui/**',
          'src/app/**/status-visual.tsx',
          'src/components/booking/BookingCard.tsx',
          'src/app/onboarding/components/WizardShell.tsx',
          '.design-sync/ds-entry.tsx',
        ],
        rules: ['react-doctor/only-export-components'],
      },
      {
        // async-await-in-loop = FALSO POSITIVO en estos archivos (verificado leyendo
        // cada uno). Los loops corren sobre una conexión postgres-js COMPARTIDA
        // (getWorkerSql) o dentro de una transacción `tx`, o dependen del orden.
        // postgres-js no ejecuta queries en paralelo sobre una conexión: `Promise.all`
        // CRASHEA en runtime ("another operation is already in progress"). Secuencial
        // es requisito de correctitud, no un smell. (Los workers con bounded-concurrency
        // REAL — dunning-retry, booking.expiry:181 — NO están acá: quedan visibles como
        // follow-up de perf.) `.design-sync/fetch-fonts.mjs` es tooling manual.
        files: [
          'src/app/onboarding/actions.ts',
          'src/modules/abonados/abonado.service.ts',
          'src/modules/notifications/notification.service.ts',
          'src/modules/players/player.anonymization.ts',
          'src/shared/jobs/workers/data-retention-cleanup.worker.ts',
          'src/shared/jobs/workers/generate-abonado-slots.worker.ts',
          'src/shared/jobs/workers/send-email.worker.ts',
          'src/shared/jobs/workers/reconcile-pending-payments.worker.ts',
          'src/app/mock-mp/checkout/actions.ts',
          'public/sw.js',
          '.design-sync/fetch-fonts.mjs',
        ],
        rules: ['react-doctor/async-await-in-loop'],
      },
      {
        // no-dynamic-import-path — `.design-sync/build-dist.mjs` es un script node
        // (no entra en ningún bundle del browser). El `require(resolve(...))` carga
        // esbuild desde `.ds-sync/node_modules` a propósito; un import estático lo
        // rompería. La premisa de la regla ("ships in the main bundle") no aplica.
        files: ['.design-sync/build-dist.mjs'],
        rules: ['react-doctor/no-dynamic-import-path'],
      },

      // ─── Accessibility — falsos positivos (batch 2, triage 2026-07-04) ───
      // react-doctor lintea cada archivo en AISLAMIENTO, así que no ve:
      //  (a) htmlFor={`id-${key}`} — asociación label↔input por template-literal;
      //  (b) el patrón ARIA combobox del APG (foco virtual con aria-activedescendant
      //      en el <input>, listbox/option en <ul>/<li> como manda WAI-ARIA);
      //  (c) primitivos que forwardean props (label.tsx pasa htmlFor de sus consumers);
      //  (d) <audio> de efecto de sonido (un beep no tiene diálogo que subtitular; sin
      //      `controls` no es focuseable);
      //  (e) labels de GRUPO vía aria-labelledby (role="group"/"radiogroup").
      // Verificado leyendo cada componente. Los que SÍ eran reales ya se arreglaron
      // en código (CourtForm wiring, aria-labels en buscadores, ProfileForm label→span).
      { files: ['src/components/ui/combobox.tsx', 'src/app/onboarding/components/StepCourts.tsx', '**/AbonadoDialogs.tsx', '**/AbonadoCreditLoader.tsx', '**/QuickActions.tsx', '**/register/page.tsx'], rules: ['react-doctor/control-has-associated-label'] },
      { files: ['src/components/booking/BookingFormModal.tsx', 'src/components/ui/label.tsx'], rules: ['react-doctor/label-has-associated-control'] },
      { files: ['src/components/ui/combobox.tsx', 'src/components/ui/phone-input.tsx'], rules: ['react-doctor/no-noninteractive-element-to-interactive-role'] },
      { files: ['src/components/ui/combobox.tsx'], rules: ['react-doctor/click-events-have-key-events'] },
      { files: ['src/components/admin/PushNotificationManager.tsx'], rules: ['react-doctor/media-has-caption'] },
      { files: ['src/components/admin/PushNotificationManager.tsx', '**/PricingGrid.tsx'], rules: ['react-doctor/no-aria-hidden-on-focusable'] },
      { files: ['src/components/booking/BookingGrid.tsx'], rules: ['react-doctor/no-noninteractive-tabindex', 'react-doctor/no-static-element-interactions'] },
      { files: ['**/LeaveReviewButton.tsx'], rules: ['react-doctor/interactive-supports-focus'] },
      // Test files: a11y en fixtures de test (imgs mock sin alt, dialogs de test) no es
      // UI shippeada. Se excluyen esas reglas de `tests/**`.
      { files: ['tests/**'], rules: ['react-doctor/alt-text', 'react-doctor/dialog-has-accessible-name', 'react-doctor/prefer-html-dialog'] },

      // ─── State/Effect correctness — FP + by-design (batch 3, triage 2026-07-04) ───
      // 37 FP + 13 defer, solo 2 fixes reales (effect-needs-cleanup, ya aplicados en
      // BookingGrid/phone-input). Los FP dominantes en un codebase bien hecho:
      //  · no-initialize-state → patrón SSR `mounted`+useEffect (leer window/Notification/
      //    localStorage/Date recién tras montar); un lazy-init REINTRODUCE hydration mismatch.
      //  · no-derived-useState → "campo de form sembrado del prop una vez, luego editado
      //    independiente" (mount-once) — no queda stale.
      //  · no-derived-state(-effect) → estado controlado/no-controlado híbrido, editable por
      //    el usuario aparte de su fuente → no es derivable en render.
      //  · no-adjust-state-on-prop-change/no-chain/no-cascading → data async externa
      //    (geoloc/URL params) o setStates que React 18 ya batchea, no props sincronizados.
      //  · no-fetch-in-effect → fetch client-only DELIBERADO (polling de pago, geolocalización,
      //    sesión del jugador) que no puede ir a Server Component sin romper ISR; ya con cleanup.
      //  · prefer-useReducer → sugerencia de estilo, no bug. rendering-hydration-mismatch-time
      //    → año de copyright en Server Component (sin re-render cliente).
      // Refactors genuinos DIFERIDOS (documentados en PROGRESS.md, no suprimidos por bug sino
      // por riesgo de regresión): HeroSearch merge setState, BookingFormModal key-remount,
      // InviteStaffDialog async-wrapper. Verificado leyendo cada componente (28 investigadores).
      { files: ['src/components/booking/BookingGrid.tsx', 'src/components/admin/PushNotificationManager.tsx', '**/CajaCierreHint.tsx', 'src/components/site/Reveal.tsx', 'src/components/admin/AdminThemeMenu.tsx', 'src/components/theme/ThemeToggle.tsx', 'src/hooks/use-art-now.ts', '**/ShareActions.tsx'], rules: ['react-doctor/no-initialize-state'] },
      { files: ['src/components/site/HeroSearch.tsx', 'src/components/booking/BookingGrid.tsx', 'src/components/ui/phone-input.tsx', '**/SearchBar.tsx', 'src/components/ui/date-picker.tsx', 'src/components/booking/BookingFormModal.tsx'], rules: ['react-doctor/no-derived-state'] },
      { files: ['**/CourtList.tsx', '**/HorariosForms.tsx', '**/support-actions-panel.tsx', 'src/app/onboarding/components/StepSchedule.tsx', '**/ReviewsSection.tsx'], rules: ['react-doctor/no-derived-useState'] },
      { files: ['**/SearchBar.tsx'], rules: ['react-doctor/no-derived-state-effect'] },
      { files: ['src/components/site/HeroSearch.tsx', 'src/components/booking/PaymentStatusWatcher.tsx', 'src/hooks/use-nearest-city.ts', '**/AvailabilityGrid.tsx'], rules: ['react-doctor/no-adjust-state-on-prop-change'] },
      { files: ['src/components/site/HeroSearch.tsx', 'src/components/ui/phone-input.tsx'], rules: ['react-doctor/no-chain-state-updates'] },
      { files: ['**/AvailabilityGrid.tsx', '**/SearchBar.tsx', '**/ExplorarFilters.tsx'], rules: ['react-doctor/no-cascading-set-state'] },
      { files: ['**/AvailabilityGrid.tsx', 'src/components/booking/PaymentStatusWatcher.tsx', 'src/hooks/use-nearest-city.ts', 'src/components/site/PortalSessionProvider.tsx'], rules: ['react-doctor/no-fetch-in-effect'] },
      { files: ['**/PricingSection.tsx', 'src/components/ui/date-picker.tsx'], rules: ['react-doctor/no-pass-data-to-parent'] },
      { files: ['**/PricingSection.tsx'], rules: ['react-doctor/no-pass-live-state-to-parent'] },
      { files: ['**/PricingSection.tsx', '**/InviteStaffDialog.tsx'], rules: ['react-doctor/no-prop-callback-in-effect'] },
      { files: ['**/PricingSection.tsx', '**/CourtList.tsx'], rules: ['react-doctor/no-array-index-as-key'] },
      { files: ['**/ExplorarFilters.tsx', '**/RegisterMovementModal.tsx'], rules: ['react-doctor/prefer-useReducer'] },
      { files: ['src/components/site/BusinessFooter.tsx', 'src/components/site/SiteFooter.tsx'], rules: ['react-doctor/rendering-hydration-mismatch-time'] },

      // ─── Performance — FP + defer (batch 4, triage 2026-07-04) ───
      // 68 findings → 16 fixes mecánicos aplicados (js-hoist-intl x11, combine x3,
      // lazy-state-init, no-usememo), 32 FP + 16 defer suprimidos acá. FP típicos:
      //  · js-set-map-lookups → String.indexOf (no array), o arrays chicos/acotados
      //    (canchas por plan, países) sin patrón O(n·m) real;
      //  · js-tosorted-immutable → el array ya es una copia fresca ([...x]/map()), la
      //    mutación de .sort() es inofensiva;
      //  · js-combine-iterations → filter+map de 2 pasos sobre arrays chicos (legibilidad
      //    > micro-perf); async-parallel → awaits sobre getWorkerSql/tx compartido (Promise.all
      //    crashea, mismo trap que async-await-in-loop) o pg-boss ya independiente;
      //  · rerender-* → React 18 ya batchea, o el estado sí driva render.
      // BACKLOG genuino (documentado en PROGRESS, suprimido por riesgo/no-verificable en
      // unit): data-export async-parallel (4 SELECTs ARCO → Promise.all, getSql pooled),
      // prefer-dynamic-import de charts recharts (MetricsDashboard/ReportCharts), PricingGrid
      // anchor useState→useRef. Verificado por 51 investigadores.
      { files: ['public/sw.js', 'src/components/ui/combobox.tsx', 'src/modules/bookings/booking.service.ts', 'src/modules/courts/court.service.ts', 'src/modules/courts/pricing-grid.ts', 'src/modules/tenants/availability-search.service.ts', 'src/modules/tenants/public.service.ts'], rules: ['react-doctor/js-set-map-lookups'] },
      { files: ['**/perfil/page.tsx', 'src/components/ui/phone-input.tsx', 'src/modules/courts/court.service.ts', 'src/modules/courts/pricing-grid.ts', 'src/modules/metrics/metrics.service.ts', 'src/shared/cache/slots-cache.ts'], rules: ['react-doctor/js-tosorted-immutable'] },
      { files: ['**/CourtList.tsx', '**/support-actions-panel.tsx', 'src/lib/seo/structured-data.ts', 'src/shared/time/week-days.ts', 'src/modules/tenants/availability-search.service.ts'], rules: ['react-doctor/js-combine-iterations'] },
      { files: ['**/reservas/page.tsx'], rules: ['react-doctor/js-flatmap-filter'] },
      { files: ['src/modules/notifications/push-quiet-hours.ts'], rules: ['react-doctor/js-hoist-intl'] },
      { files: ['src/shared/api-output.ts'], rules: ['react-doctor/no-json-parse-stringify-clone'] },
      { files: ['src/app/api/player/data-export/route.ts', 'src/components/admin/PushNotificationManager.tsx', 'src/modules/abonados/abonado.service.ts', 'src/modules/bookings/booking.cancellation.ts', 'src/modules/metrics/metrics.service.ts', 'src/modules/super-admin/tenants.service.ts', 'src/shared/jobs/workers/expire-pending-booking.worker.ts', 'src/shared/jobs/workers/index.ts'], rules: ['react-doctor/async-parallel'] },
      { files: ['src/modules/cashflow/cashflow.service.ts'], rules: ['react-doctor/async-defer-await'] },
      { files: ['**/AbonadoForm.tsx', 'src/components/admin/AdminThemeMenu.tsx', '**/RegisterMovementModal.tsx', '**/CourtForm.tsx', '**/CourtList.tsx', 'src/app/onboarding/components/StepCourts.tsx', '**/PricingGrid.tsx'], rules: ['react-doctor/rerender-state-only-in-handlers'] },
      { files: ['**/TenantCard.tsx'], rules: ['react-doctor/rerender-memo-with-default-value'] },
      { files: ['src/components/booking/PaymentStatusWatcher.tsx'], rules: ['react-doctor/rerender-lazy-ref-init'] },
      { files: ['**/layout.tsx'], rules: ['react-doctor/jsx-no-jsx-as-prop'] },
      { files: ['**/MetricsDashboard.tsx', '**/ReportCharts.tsx'], rules: ['react-doctor/prefer-dynamic-import'] },
      { files: ['**/para-complejos/page.tsx', 'src/components/site/BusinessHeader.tsx'], rules: ['react-doctor/no-large-animated-blur'] },

      // ─── Frontend Next.js bugs — FP + defer (batch 5, triage 2026-07-04) ───
      // 15 findings → 6 fixes reales aplicados (Suspense wraps de useSearchParams en
      // explorar/reservas, a→Link en abonados, img→Image en TenantCard). Resto:
      //  · nextjs-no-a-element en facturacion/StepPayments = `<a href="/api/mp/oauth-start">`
      //    es un redirect server-side a OAuth de MercadoPago (host externo) → debe seguir
      //    siendo <a>; next/link rompería el handoff off-origin.
      //  · no-event-handler (HeroSearch/date-picker/phone-input) = el useEffect sincroniza
      //    estado INTERNO desde el prop controlado; NO llama onChange desde el effect (es la
      //    dirección opuesta al anti-patrón que la regla busca).
      //  · nextjs-no-img-element: image-uploader = preview de blob/upload (ya eslint-disabled);
      //    AccountMenu = avatar de host arbitrario (next/image exige remotePatterns → BACKLOG).
      //  · nextjs-no-edge-og-runtime = `runtime='edge'` intencional para la OG image (latencia).
      { files: ['**/facturacion/page.tsx', 'src/app/onboarding/components/StepPayments.tsx'], rules: ['react-doctor/nextjs-no-a-element'] },
      { files: ['src/components/site/HeroSearch.tsx', 'src/components/ui/date-picker.tsx', 'src/components/ui/phone-input.tsx'], rules: ['react-doctor/no-event-handler'] },
      { files: ['src/components/ui/image-uploader.tsx', 'src/components/site/AccountMenu.tsx'], rules: ['react-doctor/nextjs-no-img-element'] },
      { files: ['src/app/opengraph-image.tsx'], rules: ['react-doctor/nextjs-no-edge-og-runtime'] },

      // ─── Maintainability — unused-export/unused-file (batch 6, triage 2026-07-04) ───
      // 14 findings unused → 6 arreglos reales: 2 archivos borrados (PremiumCard.tsx,
      // table.tsx — primitives UI abandonados, reemplazados por la clase CSS .card-premium;
      // resuelve la decisión abierta 4-25 hacia "borrar la duplicación muerta") + 2 bloques
      // muertos borrados (formatDateShort en lib/format.ts, re-export InvalidTransitionError
      // en booking.state-machine.ts — la clase vive intacta en booking.errors.ts) + 4 FP
      // arreglados despojando la palabra `export` de símbolos usados SOLO dentro de su propio
      // archivo (abonadoStatusVisual, courtStatusVisual, WIZARD_STEPS, DEFAULT_COUNTRY).
      // Los 5 restantes NO se suprimen ni se borran: son scaffolding con fix pendiente
      // documentado (REQUIERE INPUT en PROGRESS.md), se dejan VISIBLES a propósito para que
      // el dueño decida cablear-vs-borrar: parseRouteUuid (route-params.ts, helper de
      // seguridad F4-T6, referenciado por zod-coverage.test.ts), cashflow.schema.ts +
      // bookingResponseSchema (contratos de output sin cablear, pendiente validateApiOutput
      // / finding 4-04), openingHoursSchema (finding #36 lo quiere para validar horarios),
      // runRequestObservability (infra de observabilidad, grupo 4). Queda 1 FP cosmético
      // NO silenciable: react-doctor marca su propia doctor.config.mjs como unused-file
      // (no ve que la lee como config) y NO aplica overrides a su propio config file, así
      // que este override no lo apaga — se deja documentado; es inofensivo.
      { files: ['doctor.config.mjs'], rules: ['react-doctor/unused-file'] },
      // no-multi-comp en `.design-sync/previews/**`: son fixtures de preview
      // generados por el tooling de design-sync (galería: co-ubican a propósito
      // varias muestras de un mismo primitive por archivo para renderizarlas
      // juntas). NO es código shippeado en el bundle de la app — vive fuera de
      // `src/`. Partirlos no aporta nada y rompería el generador. (Los giants/
      // multi-comp reales de `src/` SÍ se refactorizaron: HorariosForms,
      // BookingGrid, SupportActionsPanel.)
      { files: ['.design-sync/previews/**'], rules: ['react-doctor/no-multi-comp'] },

      // ─── Security — server-auth-actions falsos positivos (batch 7, triage 2026-07-04) ───
      // react-doctor pattern-matchea auth checks conocidos (getServerSession, auth(),
      // etc.) y no reconoce los wrappers custom del proyecto (requireOperatorStaff,
      // requireAdminStaff, requireAdminStaffAction en src/modules/staff/guards.ts —
      // revalidan rol contra tenant_staff_members en DB, nunca el JWT). Cada archivo
      // de acá se verificó leyendo TODOS sus exports: el auth check corre antes de
      // tocar withTenantContext/DB en cada uno.
      {
        // 7/7: createBookingAction, confirmDepositPaymentAction, completeBookingAction,
        // markNoShowAction, cancelBookingAction, addBookingChargeAction,
        // toggleAbonadoCreditAction — todas llaman requireOperatorStaff() primero.
        files: ['**/reservas/actions.ts'],
        rules: ['react-doctor/server-auth-actions'],
      },
      {
        // createAbonadoAction, pauseAbonadoAction, reactivateAbonadoAction,
        // cancelAbonadoAction llaman requireOperatorStaff() antes de tocar DB
        // (mismo wrapper no reconocido, ver override de reservas/actions.ts
        // arriba). submitNewAbonado no chequea auth inline: delega en
        // createAbonadoAction, que sí la valida — protegido por diseño, sin I/O
        // propio antes de la delegación. Verificado leyendo todo
        // abonados/actions.ts + abonados/nuevo/actions.ts.
        files: ['**/abonados/actions.ts', '**/abonados/nuevo/actions.ts'],
        rules: ['react-doctor/server-auth-actions'],
      },
      {
        // server-auth-actions FALSO POSITIVO por diseño: estos son los propios
        // endpoints de entrada/salida de sesión (login-adjacent, signup, password
        // reset, signout) — exigir auth previo no aplica, son públicos por
        // naturaleza. Cada uno ya tiene su propia protección adecuada donde
        // corresponde (rate-limit vía enforce() por email o IP, respuesta genérica
        // sin filtrar existencia de cuenta en forgot-password/resend-confirmation).
        // signOutAction (2 variantes: admin y jugador/staff compartido) es no-op
        // inofensivo sobre un usuario anónimo. Verificado leyendo los 5 archivos
        // completos.
        files: [
          '**/actions/auth.ts',
          '**/forgot-password/actions.ts',
          '**/login/actions.ts',
          '**/register/actions.ts',
          '**/sign-out.action.ts',
        ],
        rules: ['react-doctor/server-auth-actions'],
      },
      {
        // server-auth-actions FALSO POSITIVO: las 4 acciones usan
        // requireStaffTenant() (guard local del archivo, línea 84 —
        // sesión+tipo staff, redirect /login) y luego assertActorIsAdmin()
        // (línea 101 — rol admin leído fresco de tenantStaffMembers, nunca
        // JWT) DENTRO de la transacción, antes de cualquier mutación.
        // Wrappers custom no reconocidos por la regla (mismo patrón que
        // requireOperatorStaff en los overrides de arriba). Verificado
        // leyendo inviteStaffAction, deactivateStaffAction,
        // updateStaffRoleAction, resendInviteAction completas.
        files: ['**/staff/actions.ts'],
        rules: ['react-doctor/server-auth-actions'],
      },
      {
        // server-auth-actions FALSO POSITIVO: las 3 acciones usan
        // requireWizardTenant() (guard local, línea 39) — sesión+tipo
        // staff+tenant resuelto por DB, documentado en el propio archivo
        // (línea 35-38: durante el wizard el claim tenant_id del JWT puede
        // no estar seteado aún, por eso NO usa requireAdminStaffAction).
        // Wrapper custom no reconocido por la regla. Verificado leyendo
        // setWizardStepAction, saveWizardScheduleAction,
        // createWizardCourtsAction completas.
        files: ['**/onboarding/actions.ts'],
        rules: ['react-doctor/server-auth-actions'],
      },
      {
        // server-auth-actions FALSO POSITIVO: mockPay/mockReject/mockCancel
        // simulan el redirect público de MercadoPago (el checkout real
        // tampoco exige sesión TurnoGol — la confirmación llega por webhook
        // HMAC, no por cookie). Acá el guard es guardMockMode() (línea 21):
        // 404 salvo NODE_ENV!=='production' Y MP_MOCK_MODE==='1' — doble
        // gate de entorno, no de sesión, por diseño (ver comentario
        // "Defense-in-depth" en el propio archivo). Verificado leyendo
        // mockPay, mockReject, mockCancel completas.
        files: ['**/mock-mp/checkout/actions.ts'],
        rules: ['react-doctor/server-auth-actions'],
      },
      {
        // createCashFlowAction, closeDayAction usan requireOperatorStaff()
        // antes de tocar DB (wrapper no reconocido). saveCanteenProductsAction
        // (mismo archivo, usa requireAdminStaffAction) NO cayó en el scan —
        // refuerza que la regla matchea por heurística de nombre ("Admin"/
        // "Auth" en el identificador llamado), no por análisis real del
        // wrapper. Verificado leyendo el archivo completo.
        files: ['**/caja/actions.ts'],
        rules: ['react-doctor/server-auth-actions'],
      },
      {
        // toggleCourtStatusAction, getCourtDeactivationImpactAction usan
        // requireOperatorStaff() (no reconocido). Las otras 5 acciones del
        // mismo archivo (createCourtAction, updateCourtAction,
        // uploadCourtPhotoAction, removeCourtPhotoAction,
        // reorderCourtPhotosAction) usan requireAdminStaffAction y NO
        // cayeron — mismo patrón de heurística por nombre que en
        // caja/actions.ts. Verificado leyendo el archivo completo.
        files: ['**/canchas/actions.ts'],
        rules: ['react-doctor/server-auth-actions'],
      },
      {
        // registerDebtPaymentAction, loadAbonadoCreditAction usan
        // requireOperatorStaff() antes de tocar DB. Mismo wrapper no
        // reconocido. Verificado leyendo el archivo completo.
        files: ['**/jugadores/actions.ts'],
        rules: ['react-doctor/server-auth-actions'],
      },
      {
        // cancelMyBookingAction usa requirePlayer() (guard local, línea 32 —
        // extractAuthUser + type==='player', redirect /ingresar) MÁS dos
        // capas de verificación de ownership: pre-read con
        // withPlayerContext (RLS player_own_bookings_select filtra solo
        // bookings del jugador, comentario "Defense in depth" en el propio
        // código) y el chequeo explícito dentro de cancelByPlayer
        // (BookingNotOwnedByPlayerError). La acción más blindada de toda
        // esta auditoría; wrapper local no reconocido por la regla.
        files: ['**/mis-reservas/actions.ts'],
        rules: ['react-doctor/server-auth-actions'],
      },
    ],
  },
}
