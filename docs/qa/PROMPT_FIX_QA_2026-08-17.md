# Prompt para la sesión de arreglos

Arreglá los hallazgos de `docs/qa/PROD_QA_2026-08-17.md` (QA real contra producción de TurnoGol, 23 hallazgos: 6 🔴 / 8 🟡 / 9 🟢).

Cargá primero la skill `protocolo-fixes-general` y seguila. Después:

## Orden de trabajo (no alfabético, hay dependencias)

**1. F-002 primero, sin excepción.** Es la causa raíz de infraestructura (pool de Postgres agotado por `turnogol_worker`, sin `idle_timeout`/`max_lifetime` en `src/shared/db/client.ts`) y probablemente explica F-022 también. Arreglalo, y recién después volvé a verificar si F-022 (analítica que no se guarda) se resolvió solo o sigue vivo — no lo trates como un fix independiente hasta confirmar eso. La parte de mover Supabase a transaction mode / subir `pool_size` es infraestructura fuera del repo: si no tenés acceso, dejá el código listo (`idle_timeout`/`max_lifetime` en el pool) y marcá el resto como `REQUIERE INPUT` de Lazar.

**2. Después los 🔴 restantes**, en este orden: F-001 (CSP bloquea Realtime, un `connect-src` mal armado), F-024 (invitación de staff sin forma de recuperarse — necesita una columna nueva tipo `invite_accepted_at`/`last_login_at`, va en migración nueva, nunca edites las existentes), F-004 (marketplace público con tenants de prueba — la condición de completitud del listado sí se corrige en código; qué hacer con los complejos YA publicados es decisión de Lazar, no la tomes sola, dejala como `REQUIERE INPUT`).

**3. Después los 🟡 y 🟢**, agrupados por causa compartida, no uno por uno:
- Los inputs a 14px (iOS hace zoom) aparecen en varios formularios — es un solo componente compartido, arreglalo ahí y confirmá con grep que no queda ninguno afuera.
- El soft-404 del route group `(admin)` (F-009) es el mismo patrón que ya se arregló en `(public)/[slug]` — replicá esa solución, no inventes una nueva.
- El resto (imágenes sin optimizar, controles segmentados sin ARIA, mensajes de error que no se limpian, textos con plural/decimal mal formateados, la falta de etiqueta en el campo de Turnos fijos) son fixes chicos e independientes — agrupalos por archivo para no tocar el mismo componente dos veces.

## Reglas duras (del CLAUDE.md del repo, no las repitas mal)

- `pnpm typecheck` después de cada cambio. Si falla, revertí y no sigas de largo.
- Nunca modifiques una migración SQL existente — creá una nueva numerada.
- Ningún fix a ciegas: cada hallazgo del doc trae archivo, línea y evidencia — leé el código real antes de tocar, no asumas que sigue igual.
- Decisiones de negocio (qué hacer con los tenants de prueba ya publicados, si vale la pena el parche rápido de F-024 o el rediseño completo del estado) van como `REQUIERE INPUT`, no las resuelvas solo.
- Dos archivos del working tree (`src/components/booking/BookingGrid.tsx` y `.stories.tsx`) están modificados y NO son de este esfuerzo — no los toques ni asumas que son tuyos.

## Verificación

- No declares un hallazgo cerrado sin evidencia real (comando + output, o captura). "Debería andar" no alcanza.
- Cuando el fix lo permita, volvé a probarlo contra `https://turnogol.app` como se hizo en el QA original, no solo en local.
- Al terminar la tanda de 🔴, pedí una verificación con contexto fresco (`verificacion-fresca` / agente `sonnet-adversarial-reviewer`) antes de seguir con 🟡/🟢.
- Registrá el avance (qué se cerró, qué quedó abierto y por qué) en `docs/audit/PROGRESS.md`, seas el mismo formato que ya usa el repo.
