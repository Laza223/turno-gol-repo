# AUDIT 05 — Panel del jugador

Testeado autenticado como **jugador** `e2e-player@turnogol.test` (sesión obtenida vía el flujo real de reserva + magic link de Inbucket; ver AUDIT_01 §Reservar). Layout `(player)`: header con marca "TurnoGol" + botón "Salir", y nav inferior fija **Reservas / Perfil / Cuenta**.

> Consola: en todas las vistas, el mismo `[error] ws://127.0.0.1:54763 ... CSP` (Console Ninja, no la app). Ver AUDIT_06.

---

# 🔴 Fuga cross-player en "Mis Reservas" (mismo origen RLS que AUDIT_01)

El query de `/mis-reservas` (`src/app/(player)/mis-reservas/page.tsx:72-84`) hace:
```sql
SELECT b.* FROM bookings b JOIN courts c ... JOIN tenants t ... ORDER BY b.date DESC LIMIT 200
```
**Sin ningún `WHERE b.player_id = …`** — depende 100% de `withPlayerContext()` + la policy RLS dual de `bookings`. Como el rol `postgres` bypassa RLS (ver AUDIT_06), devuelve **todas las reservas de la DB**.

**Evidencia:** la DB confirma que el jugador `…020` tiene **1 sola reserva**, pero `/mis-reservas` mostró **2** — incluyendo una reserva de **otro jugador** ("Handmade Soft Salad / Jaskolski and Sons", Pago pendiente, $8.000). Total en DB: 2 bookings de 2 players distintos.

**Contraste revelador:** el endpoint `/api/player/data-export` (misma data, otra query) devolvió **solo 1 booking** (el del jugador) y sus 2 tenant_relationships correctos → ese endpoint **sí filtra explícito por player_id**. Es decir, el codebase es **inconsistente**: unas queries filtran explícito (seguras), otras confían solo en RLS (fugan cuando RLS no aplica). Agregar el filtro explícito en `mis-reservas` evitaría el leak con o sin RLS. **Severidad: 🔴.**

---

# Mis Reservas — `/mis-reservas`

## Archivo fuente
- `src/app/(player)/mis-reservas/page.tsx` + `CancelBookingButton.tsx`, `LeaveReviewButton.tsx`
- `src/app/(player)/layout.tsx`
- API: `src/app/api/player/bookings/[id]/cancel/route.ts`

## Comportamiento esperado
- Tabs Próximos (date ≥ hoy) / Historial (date < hoy). Lista de reservas con badge de estado. Botón "Cancelar" si `confirmed`. "Dejar reseña" si `completed` y sin reseña.

## Resultado del test
- ✅ Renderiza tabs, lista con badges (Confirmado/Pago pendiente/Cancelado), nav inferior.
- ✅ **Cancelar**: abre `ConfirmDialog` con detalle (cancha/fecha/hora), explicación de política de seña y "Motivo (opcional)". Confirmar → `POST /mis-reservas` (server action) 200 → la reserva pasa a **"Cancelado"** y desaparece el botón. Verificado en DB (`status=canceled_refunded`). ✅
- 🔴 **Fuga cross-player** (ver arriba): muestra una reserva de otro jugador.
- 🟢 Tab "Historial" filtra por fecha (no testeado a fondo: este jugador no tiene reservas pasadas).

## Screenshots
`screenshots/08-mis-reservas.png`

## Severidad
🔴 Fuga cross-player. El resto (cancelación, tabs, badges) ✅.

---

# Mi Perfil — `/perfil`

## Archivo fuente
- `src/app/(player)/perfil/page.tsx` + `ProfileForm.tsx` + `actions.ts` (`updateProfileAction`)

## Comportamiento esperado
- Form (Nombre, Apellido, Teléfono, Zona preferida); Email read-only. Server Action `updateProfileAction` vía `useFormState`. Muestra "Perfil actualizado" al éxito. Avatar con iniciales. Nota de términos aceptados.

## Resultado del test
- ✅ Renderiza: avatar "EP", datos, form con valores actuales, Email bloqueado ("El email no puede modificarse."), nota "Términos aceptados el 3 de junio de 2026 (versión v1)" (fecha bien formateada, lowercase).
- ✅ **Guardar cambios FUNCIONA**: al disparar el submit (server action) `POST /perfil` 200 y la DB persiste (`phone=+5491133224455`, `preferred_area=Palermo, CABA`). Verificado en DB.
- ⚠️ **Quirk de automatización (NO bug de la app):** el `click` del MCP sobre "Guardar cambios" no disparaba el submit React (botón con `hover:-translate-y-0.5`/`active:scale-[0.98]`); solo refrescaba RSC. Con `form.requestSubmit()` funcionó perfecto. Un usuario real con click de mouse no debería tener este problema, pero **conviene re-verificar manualmente** que el click del botón submitea en todos los navegadores (el mismo patrón de botón se repite en varias vistas).

## Severidad
🟢 Funcional. (Anotada la observación de submit para re-verificación manual.)

---

# Mi cuenta — `/configuracion`

## Archivo fuente
- `src/app/(player)/configuracion/page.tsx`
- API: `src/app/api/player/data-export/route.ts`

## Comportamiento esperado
- "Descargar mis datos" (export ARCO Ley 25.326) → `GET /api/player/data-export` (JSON). "Iniciar eliminación" → `/eliminar-cuenta`.

## Resultado del test
- ✅ Renderiza ambas secciones con textos legales (Ley 25.326).
- ✅ **Descargar mis datos** → `GET /api/player/data-export` **200**, JSON con `{exported_at, retention_policy, profile, consents, bookings, payments, tenant_relationships, bans}`.
- ✅ **Export correctamente scopeado**: contiene SOLO los datos de este jugador (1 booking propio, 2 tenant_relationships, profile correcto). **No filtra** datos de otros jugadores → este endpoint sí usa filtro explícito por player_id (a diferencia de `/mis-reservas`).
- ✅ "Iniciar eliminación" → link a `/eliminar-cuenta`.

## Severidad
🟢 Funciona correctamente y el export respeta el aislamiento.

---

# Eliminar mi cuenta — `/eliminar-cuenta`

## Archivo fuente
- `src/app/(player)/eliminar-cuenta/page.tsx` + `DeleteAccountForm.tsx` + `actions.ts` (`requestDeleteAccountAction`)
- `src/components/ui/confirm-dialog.tsx`

## Comportamiento esperado
- Explica qué se anonimiza (nombre, email, teléfono, vinculaciones) vs qué se conserva (historial, pagos AFIP, logs auditoría). Botón "Eliminar mi cuenta" → `ConfirmDialog` que **exige tipear el email** (`confirmationPhrase={confirmEmail}`) para habilitar el confirmar. Al confirmar → `requestDeleteAccountAction()` → redirige a `/login?deleted=1`.

## Resultado del test
- ✅ Renderiza el detalle legal completo + link "descargar tus datos" a `/configuracion`.
- ⏸️ **Borrado NO ejecutado**: la acción es **irreversible/destructiva** y queda fuera del alcance del audit ("solo documentá"). El clasificador de seguridad también bloqueó el click preventivamente. Verificado por código que existe un gate fuerte (tipear email) antes del borrado.

## Screenshots
`screenshots/09-eliminar-cuenta.png`

## Severidad
🟢 UI y gate de confirmación correctos (borrado no ejecutado, por diseño del audit).
