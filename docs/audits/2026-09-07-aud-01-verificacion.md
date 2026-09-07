# AUD-01 — verificación y reproducción

**Fecha:** 2026-09-07 · **Base:** `origin/main` `042371499df4f834dad94fbec79c0e5cb0be8238`

Este documento tiene dos partes, escritas en dos momentos. La primera es la **verificación**: qué se
midió sobre el código sin tocarlo, y la reproducción que lo demuestra. La segunda, al final, es el
**arreglo**, autorizado después de leer la primera. Se dejan las dos porque el diagnóstico se sostiene
solo y explica por qué el arreglo tiene la forma que tiene.

## Veredicto

**AUD-01 se confirma, y es reproducible.** Existen dos resolvedores del complejo activo de una sesión
de staff y ninguno se compara con el otro:

- `getStaffTenant(staffUserId)` (`src/modules/tenants/tenant.service.ts:189-209`) devuelve la
  **membresía activa más antigua** (`.orderBy(tenantStaffMembers.createdAt).limit(1)`, filtrado por
  `isActive`) y **no recibe el claim**. Gobierna los guards de Server Actions, las páginas del panel
  y `(admin)/layout.tsx`.
- `user.tenantId`, el claim `app_metadata.tenant_id` del JWT — lo que el staff eligió en
  `/select-tenant` — gobierna los route handlers vía `withTenant`
  (`src/server/middleware/with-tenant.ts:114`).

Hay **10 call sites** directos de `getStaffTenant` (el informe original decía 11: la 11ª coincidencia
del grep es la definición) y **14 archivos** de route handler bajo `withTenant`/`withBillingTenant`.

### Corrección de severidad respecto del informe original

**No es un agujero de aislamiento ni de autorización.** `with-tenant.ts:87` corre `checkStaffRole`
antes del `withTenantContext` de la línea 114, y `checkStaffRole` (`:64`) llama a `getStaffRole`, que
filtra por `tenantId` + `staffUserId` + `isActive`. Un claim apuntando a un complejo donde el staff no
tiene membresía activa devuelve 403 `ROLE_NOT_ALLOWED`. Los dos complejos que se cruzan pertenecen
siempre al mismo staff.

Lo que rompe es **consistencia: se lee A y se escribe B**, sin error visible. Eso baja la severidad
respecto de "fuga entre inquilinos" y no la baja respecto de la plata.

### Dónde duele, en orden

1. **Facturación del plan SaaS.** `/settings/facturacion` se resuelve con `requireAdminStaff` →
   `getStaffTenant` (complejo A) y muestra su plan y su cantidad de canchas
   (`facturacion/page.tsx:56,68,73`, que define el tramo de precio sugerido). Los POST de
   `/api/billing/{subscribe,cancel,upgrade,downgrade,reactivate}` operan sobre `user.tenantId`
   (complejo B). Se ve el plan de A y se contrata, cancela o cambia el de B.
2. **Conectar MercadoPago: imposible.** `oauth-start` firma el `state` con `getStaffTenant`
   (`route.ts:18,41`) y `callback` exige `user.tenantId === tenantId` (`route.ts:120`). Para el staff
   que eligió un complejo que no es su membresía más antigua la igualdad es falsa siempre, y el flujo
   muere en `redirect('/login')` (`:121`) **antes** de canjear el code. Sin código de error, sin log,
   sin pantalla que explique nada: el dueño ve el formulario de login pelado.
3. **Silencioso, en toda pantalla del panel.** El SSR pinta el complejo de `getStaffTenant` y el
   cliente refetchea contra rutas `withTenant`, que devuelven el del claim:
   `use-booking-realtime.ts:144-147` llega a **reemplazar la grilla entera** con las reservas del otro
   complejo; `day-total-badge.tsx:44` pone el total de caja del día de otro complejo en el sidebar de
   todas las pantallas; el CSV de `/api/reports/revenue` puede ser de otro complejo que el que muestra
   `/analiticas`.

### Alcanzabilidad

La precondición es **≥2 membresías activas del mismo `staff_user_id`**. Verificado:

- La base lo permite y lo habilita a propósito: el único candado es
  `unique('uq_tenant_staff').on(tenantId, staffUserId)`.
- **El onboarding NO es la vía**: `onboarding/actions.ts:68-69` corta la creación de un segundo
  complejo si `getStaffTenant` devuelve algo.
- **La vía viva es la invitación desde `/settings/equipo`.** `upsertStaffUser` reusa el mismo
  `staff_user_id` por email (`staff.service.ts:147-148`) y se inserta una segunda fila
  (`equipo/actions.ts:245`). La rama `else if (inviteError)` (`:285-292`) está escrita explícitamente
  para "el usuario ya existe en auth (p. ej. admin de otro complejo)" y preserva su `tenant_id`
  actual "para no pisar la sesión de otros complejos (#47)". El caso multi-complejo es un flujo de
  primera clase, con UI propia (`/select-tenant`) y código defensivo propio.
- **Descartada** la hipótesis de divergencia con una sola membresía vía tenant `deleted`:
  `wipeTenant` borra `tenant_staff_members` (`data-retention-cleanup.worker.ts:368`) **antes** de
  poner `status = 'deleted'` (`:423`), en la misma transacción, y ése es el único lugar que escribe
  ese estado. La membresía ya no existe cuando el tenant queda `deleted`.

**Sin medir:** si HOY existe en producción algún `staff_user_id` con dos membresías activas. Decide si
esto está roto para alguien ya o si es una bomba armada. Query de sólo lectura, sin datos personales:
`SELECT staff_user_id, count(*) FROM tenant_staff_members WHERE is_active GROUP BY 1 HAVING count(*) > 1`.

### Hallazgo lateral, no reportado antes

Re-invitar a un miembro desactivado NO reescribe `created_at`: el `onConflictDoUpdate` de
`equipo/actions.ts:253-257` setea `isActive`, `role` y `addedBy`, y `createdAt` no está en el `set`.
La membresía reactivada vuelve con su fecha original y por lo tanto vuelve a ganar el `ORDER BY` de
`getStaffTenant`. Convierte al complejo más viejo en pegajoso.

## Reproducción

`tests/integration/staff-tenant-resolution.test.ts`, 8 casos, DB real (Postgres descartable con las 82
migraciones). Solo se mockea el boundary de auth y el `redirect` de Next, mismo patrón que
`staff-guards.test.ts`.

Escenario: un staff admin activo en **tres** complejos, con `created_at` fijado a mano (30 / 15 / 1
días), y el claim moviéndose entre los tres.

Sobre `main` `04237149` — 4 rojos, 4 verdes:

```
× requireAdminStaff abre el complejo del claim cuando es el del medio
  → expected 'f336c9e2…' to be '1f070e27…'
× requireAdminStaff abre el complejo del claim cuando es el más nuevo
  → expected '02053b3b…' to be 'fa726fa7…'
✓ requireAdminStaff abre el complejo del claim cuando es el más viejo
× requireOperatorStaff abre el complejo del claim, no la membresía más antigua
✓ con un solo complejo sigue entrando igual (regresión)
✓ un claim hacia un complejo SIN membresía activa nunca abre ese complejo
× el staff multi-complejo puede completar el OAuth del complejo que eligió
  → expected '/login' not to be '/login'
✓ control: con un solo complejo el OAuth pasa el guard de identidad
```

El control del OAuth es el que hace útil al rojo: con un solo complejo el mismo flujo llega a
`?error=mp_token_failed`, o sea pasa el guard de identidad y muere recién en el canje del code (que se
corta con un stub para no salir a la red). La diferencia entre los dos casos es exactamente la
comparación de tenants.

### Mutantes

| Mutante aplicado al código fuente                                              | Resultado                                                  |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Ninguno (`main` `04237149`)                                                    | 4 rojos / 4 verdes                                         |
| `ORDER BY created_at DESC`, sin tocar el claim                                 | 4 rojos / 4 verdes, **rojos distintos** — no lo deja pasar |
| Honrar el claim si hay membresía activa, con fallback al comportamiento actual | **8 verdes**                                               |

El mutante `DESC` es el que importa. Una primera versión de esta prueba usaba dos complejos con el
claim siempre en el más nuevo, y dar vuelta el `ORDER BY` —que no arregla nada: sigue ignorando el
claim— la dejaba **entera en verde**. Un revisor adversarial lo demostró corriéndolo. Por eso el
escenario final usa tres complejos y prueba el claim en el del medio, en el más nuevo y en el más
viejo: ninguna heurística de orden puede satisfacer a los tres.

### El caso que protege contra el arreglo peligroso

`un claim hacia un complejo SIN membresía activa nunca abre ese complejo` existe porque honrar el
claim a ciegas no es un arreglo válido: nadie revalida el claim al escribirlo, y
`(admin)/layout.tsx:60-74` pinta nombre y estado del complejo que devuelve `getStaffTenant` **sin
mirar el rol**. Un `getStaffTenant` que honre el claim sin comprobar membresía mostraría un complejo
ajeno en el header. Bajo ese mutante el caso se pone rojo, como corresponde.

## Gates

Sobre el worktree, con el árbol de código sin mutantes:

```
pnpm format:check   All matched files use Prettier code style!
pnpm lint           (sin salida)
pnpm typecheck      (sin salida)
pnpm knip           (sin issues)
```

## Cómo se verificó

Seis lentes independientes de sólo lectura sobre el worktree en `04237149` (mapa exhaustivo de
consumidores, auditoría de las 12 citas del informe original, alcanzabilidad de la precondición,
circuito de plata, ciclo de vida del claim, cobertura de tests), cada una seguida de un revisor
adversarial con la consigna de refutarla abriendo los archivos de nuevo. Las seis confirmaron; los
seis revisores sostuvieron con correcciones, todas incorporadas arriba. Después, la reproducción
ejecutable y la campaña de mutantes.

## Limitaciones

- No se corrió la app ni se miró producción. Todo lo de arriba es lectura de código más pruebas de
  integración contra una base descartable.
- La pregunta de producción (¿hay hoy algún staff multi-complejo?) sigue abierta.
- La impersonación del SuperAdmin es una **tercera** fuente: los guards resuelven
  `getStaffTenant(user.staffUserId)` sobre el admin proxy (`impersonation.server.ts:100,109-110`),
  cuya membresía más antigua puede ser otro complejo. No se reprodujo; cualquier arreglo tiene que
  contemplarla.

## Arreglo recomendado (no aplicado)

`getStaffTenant(staffUserId, preferredTenantId?)`: si el claim viene **y** hay membresía activa en ese
tenant, usarlo; si no, el fallback actual. Cambiar los 10 callers. Es exactamente el mutante que dejó
la suite en 8 verdes. Toca auth, así que la revisión del diff es del dueño.

---

# Arreglo (2026-09-07, mismo worktree, sin commitear)

`getStaffTenant(staffUserId, preferredTenantId?)`: el claim entra como **preferencia**, no
como fuente. Se honra sólo si el staff tiene membresía ACTIVA en ese complejo; si falta, o
apunta a uno donde no la tiene, cae a la membresía activa más antigua. Se quitó el
`.limit(1)` y la elección se hace sobre las filas ya traídas, así que sigue siendo un solo
viaje a la base.

**Los 10 callers pasan el claim.** Los cuatro de onboarding entraron después de la revisión
adversarial, por lo que se explica abajo.

## Qué encontró la revisión adversarial, y qué se hizo

Tres hallazgos reales sobre la primera versión del arreglo. Los tres corregidos:

- **Onboarding bajo impersonación resolvía el complejo equivocado.** Los cuatro callers de
  onboarding se habían dejado con un solo argumento a propósito, porque `onboarding/actions.ts`
  documenta que resuelve por DB para no depender de un claim que puede no haber propagado.
  El agujero: `extractAuthUser` bajo impersonación devuelve el `staff_user_id` de un admin
  **proxy** del complejo impersonado. Si ese proxy además administra otro complejo más viejo,
  las páginas del wizard resolvían ESE, y `StepIdentity` se precargaba con su nombre, dirección
  y ciudad — mientras el POST, que sí pasa por un guard arreglado, escribía sobre el
  impersonado. Datos de un complejo ajeno entrando por precarga, sin ninguna señal en pantalla.
  Corregido pasando el claim también en esos cuatro. El motivo original queda intacto: el
  fallback cubre el claim ausente o no propagado.
- **El caso "claim sin membresía activa" pasaba por la razón equivocada.** Iba a través de
  `requireAdminStaff`, que después de resolver el complejo chequea el rol y rebota. Un mutante
  que honrara el claim a ciegas quedaba tapado por ese segundo chequeo: la suite seguía 8/8 en
  verde. Se agregaron cuatro casos que llaman al resolvedor directo, sin guard: claim sin
  membresía, claim con la membresía dada de baja, y los dos de fallback.
- **El fallback puro no estaba blindado.** Ningún caso ejercitaba `rows[0]` con más de un
  candidato y sin claim que matcheara, así que dar vuelta el `ORDER BY` volvía a pasar 8/8.
  Cubierto por los dos casos nuevos de fallback.

## Mutantes, antes y después de esos cuatro casos

| Mutante                                   | Suite de 8                 | Suite de 12 |
| ----------------------------------------- | -------------------------- | ----------- |
| Honrar el claim sin comprobar membresía   | 8 verdes (no lo detectaba) | 3 rojos     |
| `ORDER BY created_at DESC` en el fallback | 8 verdes (no lo detectaba) | 2 rojos     |
| Ignorar el claim (comportamiento viejo)   | 4 rojos                    | 4 rojos     |

## Evidencia

```
tests/integration/staff-tenant-resolution.test.ts   12 passed (12)
staff-guards + mp-oauth + staff-actions + tenant-context   28 passed (4 files)
pnpm test                                            3928 passed | 1 todo (380 files)
pnpm format:check   All matched files use Prettier code style!
pnpm lint / typecheck / knip                         limpios
```

## Lo que el arreglo también cierra

La impersonación del SuperAdmin era la tercera fuente y quedaba fuera del hallazgo original.
Los guards resolvían `getStaffTenant(proxyStaffUserId)`, o sea la membresía más antigua del
proxy, que no tiene por qué ser el complejo impersonado. Con el claim como preferencia, la
cookie firmada gana y la sesión de soporte opera donde el SuperAdmin eligió entrar.

## El costo de honrar la elección, y cómo se cubrió

Un staff con dos complejos cuyo claim apunta al que está `blocked` o `suspended` ahora rebota
a `/suspended`, aunque el otro esté operativo. Antes entraba al otro sin enterarse. Es el
precio de honrar la elección, y no era un encierro real —`/select-tenant` sigue existiendo—
pero ni `/suspended` ni `/reactivar` tenían un link a esa pantalla, así que había que escribir
la URL a mano.

**Decidido por el dueño el 2026-09-07: se agrega el link.** `SwitchTenantLink` en
`src/app/(public)/`, usado por las dos pantallas. Es un componente tonto: quién decide si se
muestra es cada página, que ya tiene la sesión a mano y consulta `resolveStaffTenants`. Con un
solo complejo no se renderiza, porque ahí `/select-tenant` es una lista de un elemento y el
link sería ruido para la enorme mayoría de los dueños. Cubierto en
`tests/unit/suspended-route.test.ts` con los tres casos: dos complejos, uno solo, y sin sesión
de staff (que además comprueba que ni siquiera se consultan las membresías).

El componente no vive en `src/components/`: la regla `turnogol/capas` del repo prohíbe que un
reusable importe dominio como valor, y la primera versión resolvía la sesión adentro. Moverlo a
la capa de la página y dejarlo tonto respeta la regla y, de paso, saca una función `async` del
medio de un árbol que los tests renderizan.

## Sin medir

La consulta de producción que diría si esto ya afecta a alguien quedó sin correr, pero la
respuesta la dio el dueño: los dos complejos que existen hoy son de prueba, así que el defecto
no llegó a lastimar a nadie. Se arregla porque rompe el día que un dueño real tenga dos
complejos, o un empleado trabaje en dos.
