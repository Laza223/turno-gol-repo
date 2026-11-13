# Alta del complejo por toques (referencia: Canchería mobile)

## Contexto

El dueño que llega de anuncios o de la bio de Instagram se cae en el alta. Hoy son 13 campos obligatorios en 6 pantallas y el mail bloquea: sin confirmar no hay sesión, así que no se crea `staff_users` ni el tenant. Lazar decidió el 2026-11-08:
- el mail no bloquea;
- el alta termina en "Compartir mi link" y la primera reserva pasa a la checklist;
- se oculta el buffet si no lo usa;
- la prueba sigue en 30 días (`TRIAL_DAYS`).

Además, sin seña ni MP, solo fútbol y turno de 60 min fijo. En este plan respondió:
- **ubicación:** un paso de búsqueda de dirección;
- **cuenta:** nombre, mail, celular y contraseña (sin apellido ni repetir).

Insumos: `docs/planning/2026-11-08-onboarding-referencia-cancheria.md`, `docs/decisions/2026-11-08-entrada-por-audiencia-y-volante.md` y `docs/planning/2026-11-08-ideas-del-founder.md`. Están sin commitear en el checkout principal; se copian a esta rama junto con la spec.

**Este plan ES la spec que aprueba Lazar.** Al aprobarse se guarda como `docs/superpowers/specs/2026-11-08-alta-por-toques-design.md`.

## Recorrido nuevo (390 px primero, una pregunta por pantalla)

| # | Pantalla | Control | Default | Se tipea |
|---|---|---|---|---|
| 1 | **Creá tu cuenta** (`/register`) | nombre, mail, celular, contraseña con "ver" | — | 4 |
| 2 | ¿Cómo se llama tu complejo? | input | — | 1 |
| 3 | ¿Dónde queda? | buscador Georef, se elige un candidato. Ciudad y provincia salen del candidato | — | 1 |
| 4 | ¿Qué canchas tenés? | formatos F4 a F11 para tocar y un stepper − N + por cada formato elegido | F5 = 1 | no |
| 5 | ¿A qué hora abrís y cerrás? "Si un día es distinto, lo cambiás después." | 2 selects, el cierre llega hasta las 04 (pasado medianoche = `closes_next_day`) | 08 a 00 | no |
| 6 | ¿Cuánto cobrás el turno de Fútbol 5? (una pantalla por formato elegido) | teclado numérico con eco ("Un turno de 60 min: $X"). "¿A la noche cobrás distinto?" No/Sí; con Sí, precio de noche y "desde las" (select) | No; corte 18 hs | el precio |
| 7 | ¿Cómo tomás los turnos hoy? | 4 opciones: cuaderno o planilla, WhatsApp, otra app, recién abro | — | no |
| 8 | ¿Tenés equipos que juegan fijo todas las semanas? | Sí / No | — | no |
| 9 | ¿Tenés buffet o kiosco? "Si no, no te lo mostramos." | Sí / No | — | no |
| 10 | ¿Está todo bien? | resumen por bloques con "Cambiar" | — | no |
| Fin | `/onboarding/listo` | CTA principal **Compartir mi link** (`ShareActions`), secundario "Ir a mi panel" | — | — |

**Antes y después (1 formato):**
- **Antes:** 13 campos tipeados, 6 pantallas y bloqueo por mail.
- **Después:** 7 campos tipeados (4 de cuenta, nombre, dirección y precio), 0 bloqueos y el resto son toques.

El conteo real de toques se mide en la verificación.

### Rutas y persistencia (reusa `resolveWizardStep` y `settings.onboarding_step`)

`WIZARD_STEPS` pasa a 5 pasos persistidos. Cada ruta agrupa pantallas que el cliente muestra de a una; el server guarda al final de cada ruta:

1. `complejo` (pantallas 2-3): llama a `createTenantWithTrial` con nombre, dirección, ciudad, provincia y coordenadas.
2. `canchas` (pantalla 4): solo guarda la cantidad por formato en `settings.onboarding_draft_courts`, porque los precios se calculan sobre los horarios.
3. `horarios` (pantalla 5): `saveOnboardingSchedule`, con el mismo horario para los 7 días.
4. `precios` (pantalla 6): crea las canchas con `createOnboardingCourts`.
   - Nombres "Cancha 1…N" y defaults: superficie sintética, `isCovered: false`.
   - El `billedCourts` se ajusta como hoy.
5. `tu-complejo` (pantallas 7-9): guarda `settings.booking_intake`, `has_fixed_teams` y `canteen_enabled`.

El resumen es `/onboarding/resumen`. Llama a `finishOnboardingAction`, que ya existe (`completeOnboarding` + `revalidatePublicListings`), y de ahí va a `/listo`.

La regla "atrás siempre, adelante no" de `[paso]/page.tsx` sigue igual.

**Alta asistida** (`createAssistedTenant`, con `onboarding_step: 1`): `resolveWizardStep` → paso 2. El dueño aterriza en `canchas` con el complejo ya creado. No se toca el service.

**Tenants que hoy están a mitad del wizard:**
- con `onboarding_step` 2 o 3, aterrizan en el paso siguiente del orden nuevo;
- un tenant en el paso 3 viejo, con canchas ya creadas, ve precios con sus canchas existentes. `createOnboardingCourts` es idempotente por nombre.

### Precio día/noche

- Función pura nueva en `src/modules/courts/pricing-grid.ts`: `dayNightRulesFromOpeningHours(openingHours, closesNextDay, dayPrice, nightPrice, cutHhmm)`.
- Parte los rangos de `uniformRulesFromOpeningHours` en el corte. Las reglas siguen siendo del día operativo, así que la franja de madrugada lleva el precio de noche.
- `buildTemplateGrid({mode:'dayNight'})` no sirve acá porque no modela `closes_next_day`.
- La cobertura se valida con `validatePricingRulesCoverage`, igual que hoy.
- `wizardCourtsSchema` se reemplaza por `wizardPricesSchema`: `{ formats: [{format, count, dayPrice, nightPrice?}], cutHour? }`.

## Mail no bloqueante (auth: `convenciones-stack` + `/security-review`)

**Registro** (`src/app/(auth)/register/actions.ts`): se reemplaza `signUp` por el patrón que ya usa `assisted-signup.service.ts:84`.
1. `admin.createUser({ email_confirm: true, password, app_metadata: { staff_user_id } })`. GoTrue la da por confirmada y permite el login con contraseña.
2. Inserta `staff_users` con `email_verified_at = NULL` y `last_name = ''` (la columna es NOT NULL).
3. Llama a `signInWithPassword` server-side, que deja las cookies, y redirige a `/onboarding/complejo`.
4. Si `createUser` falla después de insertar, se compensa igual que `undoOwnerAccount`.

Se mantienen el rate limit por IP, el chequeo de "ya tenés cuenta" y el referido.

**Nuestra verificación.** No se toca `enable_confirmations` del proyecto: el jugador con magic link sigue igual.
- **Migración nueva:** `staff_users.email_verified_at timestamptz NULL`, `email_verify_token_hash text NULL` y `email_verify_sent_at timestamptz NULL`.
  - Backfill: `email_verified_at = created_at` para todas las filas existentes, que ya pasaron por la confirmación de GoTrue, el alta asistida o una invitación.
  - El alta asistida y las invitaciones nuevas también nacen verificadas.
- **Token:** 32 bytes aleatorios. En la DB se guarda solo el sha256. Es de un uso y vence a las 48 h.
  - El link `/api/auth/verify-email?token=…` marca `email_verified_at`, borra el hash y no crea sesión.
- **El mail** sale por Resend con el helper existente.
  - Texto con `turnogol-copy`: "Confirmá tu mail para activar el plan cuando quieras".
  - Rate limit por staff, igual que `authMagicLink`.

**En el panel**, banner "No verificado" en el layout admin, solo para el admin con `email_verified_at` NULL. Dice "Tocá el link que te mandamos a X. Tu complejo funciona normal mientras tanto." Tiene dos botones:
- **Reenviar mail.**
- **¿Está mal? Cambialo:** diálogo con el mail nuevo.
  - Chequea `isStaffEmailTaken`.
  - Hace `admin.updateUserById({ email, email_confirm: true })`.
  - Actualiza `staff_users.email`, y `tenants.email` si era el mismo.
  - Manda un token nuevo.
  - Solo se puede mientras el mail no está verificado. Ya verificado, se sigue usando `updateUserEmailAction` (doble confirmación).

**Qué queda limitado hasta verificar.** Server-side, con un guard `requireVerifiedOwnerEmail`:
- Activar o reactivar el plan pago y subir canchas facturadas (`/api/billing/{subscribe,reactivate,canchas}`). MP usa ese mail como payer y el plan es plata.
- Invitar al equipo (`settings/equipo`). No se mandan mails a terceros desde una cuenta sin dueño probado.

Todo lo demás anda: grilla, reservas online, caja y link público.

**Riesgos aceptados** (van en la spec para el `/security-review`):
- **Ocupar un mail ajeno.** El dueño real del mail recupera la cuenta con "Olvidé mi contraseña", porque el link de recuperación va a SU casilla.
- **Ocupar un mail ajeno: dos casos, mitigados.** (1) Invitar a ese mail: `inviteStaffAction` y `resendInviteAction` no vinculan una cuenta de `staff_users` con `email_verified_at` vacío ("Esa cuenta todavía no confirmó su mail…"); una fila creada por la propia invitación nace verificada. (2) Recuperar la cuenta: tras `updateUser({ password })`, el reset de contraseña hace `signOut({ scope: 'others' })` y echa a quien la ocupó.
- **Altas en masa.** Las frena el rate limit de 5 por 10 min por IP, que ya existe. No se suma captcha, porque rompería el navegador de Instagram.

## Ocultar el buffet (`canteen_enabled === false`)

- Lo que no está definido cuenta como `true`, así que los tenants actuales no cambian.
- **Con `false` se ocultan:**
  - el botón Vender del riel (`admin-sidebar.tsx`);
  - el Vender de Hoy mobile (`HoyHeaderSlot.tsx`);
  - la pestaña Productos (`CajaTabs.tsx`);
  - `/caja/productos`, que redirige a `/caja/cuentas`.
- El valor llega como prop desde `(admin)/layout.tsx`, igual que `tournamentsEnabled`.
- Se reactiva con un switch "Vendo en el buffet o kiosco" en Ajustes, en la página de settings más cercana a caja. Se define al leer la estructura de `/settings`.

## Checklist y doc10

- **`getChecklistState` y `onboarding-checklist.tsx`:**
  - Sale `complexData`, que siempre daba `true`.
  - Entra "Cargá tus turnos en la grilla", que se cumple con cualquier reserva hecha por staff. Su texto depende de `booking_intake` y `has_fixed_teams`: con cuaderno o equipos fijos, "Pasá tus equipos fijos a la grilla" y lleva a Clientes y Fijos.
  - "Link compartido" queda primero cuando la respuesta fue WhatsApp o "recién abro".
  - El objetivo sigue siendo "Primera reserva online recibida".
- **`docs/spec/doc10_onboarding_design.md`:** el valor se ve al compartir el link y se confirma con la primera reserva online. Se actualizan:
  - la cadena de valor (§1);
  - los pasos (§2 superseded → los nuevos);
  - la checklist (§3);
  - el "por qué 4 pasos" (§6).
- **Decision doc corta:** `docs/decisions/2026-11-08-alta-por-toques.md`, con mail no bloqueante, ubicación, cuenta y buffet.

## Ejecución (`protocolo-orquestacion` → `entrega-feature`)

**Riesgo:** no es un cambio chico (auth, migración y más de 3 archivos). Se hace con el protocolo completo y subagentes Sonnet, en tres tandas con archivos disjuntos:
- **A · Auth y mail:**
  - migración (`migracion-segura`: `src/shared/db/migrations/NNN_*` + espejo en `supabase/migrations/`);
  - registro;
  - token y endpoint;
  - banner y acciones;
  - guard de billing y equipo.
- **B · Wizard:**
  - steps, schema, service, `pricing-grid` y las pantallas de `src/app/onboarding/*`;
  - componentes nuevos reutilizables: `Stepper`, `ChoiceCards` y `PriceInput` con eco;
  - stories;
  - diseño con `impeccable` y `DESIGN.md`, el copy con `turnogol-copy`.
- **C · Panel:** ocultar el buffet, la checklist y los docs (doc10 y la decisión).

Se borran del wizard: `StepIdentity` (se reemplaza), `StepFirstBooking`, `CourtDraftCard`/`use-court-drafts` y la foto de cancha en el alta. La foto queda en `/canchas`. Se eliminan solo los archivos que no quedan referenciados (knip).

## Verificación

1. **Juez:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck` y `pnpm knip`, con el output pegado.
2. **Tests:**
   - unit de `dayNightRulesFromOpeningHours`, incluidos `closes_next_day` y un corte fuera de horario;
   - unit de `resolveWizardStep` y `stepPath`;
   - unit del token (vencido, reusado y otro staff);
   - integration del registro sin confirmación y del guard de billing con mail sin verificar;
   - los e2e de onboarding se actualizan (`tests/e2e/**onboarding**`, TG-HP-202).
   - Se corre `pnpm test` y la integración del alcance con la DB local, siguiendo `protocolo-testing` y con las variables en la misma línea.
3. **Revisión:** `sonnet-adversarial-reviewer` sobre el diff, con contexto fresco, y `/security-review` sobre la tanda A.
4. **App real:** `verificacion-ux` con `sonnet-ux-verifier` a 390 px.
   - Alta completa desde `/register` hasta compartir el link, contando toques y campos.
   - Banner, reenvío y cambio de mail mal tipeado.
   - Link de verificación desde Inbucket (:54324).
   - Buffet en No: no aparecen Vender ni Productos.
   - Alta asistida desde `/super-admin/tenants/nuevo`: aterriza en `canchas` y termina.
5. No se commitea ni se pushea sin pedido explícito.

---

## Revisión 2026-11-08 (noche): referencia DeporTurnos

Lazar mandó la grabación del alta mobile de DeporTurnos y pidió rehacer el alta con esa estructura. Decidió por select:
- **Complejo primero, cuenta al final.** No hay sesión hasta el último paso.
- **"Continuar con Google" recomendado, más mail y contraseña.** El mail queda siempre porque el navegador interno de Instagram bloquea Google.
- **Se mantienen horarios y un precio por formato** (con "¿a la noche cobrás distinto?").

### Lo que se toma de DeporTurnos
Paso 1 "Tu predio" (nombre, provincia, ciudad, dirección), paso 2 canchas con stepper por formato y un resumen vivo ("Tu complejo tiene 1 cancha"), paso 3 "Tu cuenta" con Google como primera opción, y cierre "¡Complejo X ya está creado!" con un solo botón al panel. Barra de progreso de 4 segmentos y "Atrás" siempre visible.

### Lo que NO se toma
El paso de elegir plan: acá la prueba de 30 días arranca sola, sin tarjeta y sin elegir nada. El "complejo en proceso de validación": el nuestro queda online al terminar.

### Estructura nueva
Pantallas, en un solo flujo público en `/register` (sin sesión, estado en `localStorage` bajo `tg_signup_draft`):
1. Nombre del complejo.
2. ¿Dónde queda? (buscador de dirección; ciudad y provincia salen del candidato; si Georef falla, a mano).
3. ¿Qué canchas tenés? (stepper por formato con resumen vivo).
4. ¿A qué hora abrís y cerrás?
5. Precio por formato, con "¿a la noche cobrás distinto?".
6. ¿Cómo tomás los turnos hoy? / ¿equipos fijos? / ¿buffet o kiosco?
7. **Tu cuenta**: celular (obligatorio, es el WhatsApp del complejo) + "Continuar con Google" (recomendado) o "Continuar con mail" (nombre, mail, contraseña con ojo).
8. Cierre en `/onboarding/listo` con "Compartir mi link".

El borrador (`signupDraftSchema`, `src/modules/onboarding/signup-draft.schema.ts`) viaja entero a UNA Server Action que revalida todo y crea cuenta, complejo, canchas, horarios y settings en un paso, y deja el onboarding cerrado. El wizard por rutas `/onboarding/[paso]` sigue existiendo para el alta asistida del super-admin y para tenants que ya estaban a mitad de camino.

### Google para dueños (auth: `/security-review` obligatorio)
- Hoy Google es solo de jugadores. Se agrega una intención "owner" firmada (cookie HMAC, patrón de `google-terms-cookie`) que el callback lee para tratar la cuenta como staff.
- El mail de Google ya viene verificado: `email_verified_at = now()`, sin banner.
- Si ese mail ya es de una cuenta de jugador, no se mezcla roles: se rechaza con un mensaje que ofrece otro mail.
- Después del OAuth, el borrador se recupera de `localStorage` en `/register/finalizar` y se llama a la Server Action con la sesión ya abierta.
