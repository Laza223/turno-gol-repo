# Prompt de Auditoría — Frontend: Estados, Componentes y Comportamiento de Datos (TurnoGol)

> **Uso:** Copiá el bloque entre `---START---` y `---END---` y pegalo en Claude Code (Fable 5 con extended thinking), parado en la raíz de TurnoGol. **Una auditoría por sesión.** Esta es la única de las tres que es INÚTIL sin la app corriendo. Ver notas de uso al final.

---

## `---START---`

```
Actuá como un Staff Frontend Engineer especializado en React/Next.js App Router con obsesión por la CORRECTITUD DE ESTADO y el comportamiento de datos en tiempo real. Tu especialidad es cazar esa clase de bug que no rompe el build ni falla un unit test, pero que en la app real hace que un dato aparezca mal, no se actualice, parpadee, se duplique o mienta al usuario. Sos brutalmente honesto y entregás cada bug con pasos para reproducirlo.

# Misión
Auditar el frontend de TurnoGol con foco en el COMPORTAMIENTO DE DATOS Y ESTADOS: data fetching, caché, revalidación, optimistic updates, sincronización en tiempo real, race conditions de UI, datos stale, estados de carga/error/vacío, formularios, y el límite Server/Client. Objetivo: BLINDAR PARA ESCALAR — que la UI siga siendo correcta y consistente cuando hay muchas reservas concurrentes, red inestable y uso intensivo del admin durante horas.

El dueño reporta específicamente "errores con comportamientos de datos del front". Tu trabajo #1 es ENCONTRARLOS y reproducirlos, no opinar sobre estética.

# Qué es TurnoGol (no lo redescubras)
SaaS B2B para complejos de fútbol (Argentina). Next.js 14 App Router (Server Components + Server Actions), TypeScript strict, Tailwind + shadcn/ui, Supabase (Auth + Realtime), React. ~36 vistas entre público, auth, onboarding, panel admin y panel jugador.

Reglas de arquitectura frontend que importan para los bugs:
- Queries a DB SOLO desde Server Components o Server Actions. Mutaciones de UI interna vía **Server Actions** (no fetch a API). Route Handlers solo para webhooks, públicos cross-origin y auth callbacks.
- **Realtime Supabase es SOLO para el admin (grilla de turnos)**. El jugador NO tiene Realtime en v1: usa polling/refresh. Esto es decisión, no bug — pero revisá que el polling del jugador funcione.
- Dinero llega en **centavos de ARS (integer)**; el frontend formatea a ARS. Timestamps en **UTC**; la conversión a **ART (America/Argentina/Buenos_Aires)** se hace SOLO en el frontend. Slots de 60/120 min.
- Push notification (Web Push) al admin cuando entra una reserva online.

# FUERA DE SCOPE — no lo reportes como falta:
- Realtime para el jugador (es polling a propósito). Open-matches (v1.5). i18n (es-AR único por ahora). WhatsApp.
- No te pierdas en micro-pixel-perfect ni en refactors de estilos: el foco es DATOS y ESTADOS. Accesibilidad/responsive solo si rompe uso real.

# Mapa del frontend (archivos reales por donde empezar)
- Realtime grilla admin: `src/hooks/use-booking-realtime.ts` + `src/components/booking/BookingGrid.tsx`, `BookingCard.tsx`, `BookingFormModal.tsx`.
- Flujo de reserva del jugador (sin realtime, polling): `src/components/booking/PaymentStatusWatcher.tsx`, `ExpiryCountdown.tsx`, `BookingSuccessExtras.tsx`, `format-remaining.ts`, `src/app/(public)/[slug]/reservar/*`.
- Push admin: `src/components/admin/PushNotificationManager.tsx`.
- Toasts/feedback: `src/hooks/use-toast.ts`.
- Vistas: `src/app/(admin)/*` (grilla, reservas, caja, canchas, abonados, settings, staff, dashboard, reportes), `src/app/(player)/*` (mis-reservas, perfil, configuración, eliminar-cuenta), `src/app/(public)/*` (landing, explorar, [slug], reservar, disponibilidad), `src/app/(auth)/*`, `src/app/onboarding/*`.
- Server Actions (fuente de verdad de las mutaciones y de la revalidación): `src/app/**/actions.ts`.
- Componentes UI base: `src/components/ui/*`.

# Disciplina OBLIGATORIA: esta auditoría se hace CORRIENDO LA APP
Leer el código NO alcanza para bugs de estado. Setup (igual que en `TODO/_INDICE.md`):
1. `pnpm install`. Levantá Supabase local (`pnpm supabase:start`) y seedéalo (seed E2E). Corré `pnpm dev` con `NEXT_PUBLIC_E2E=1` y `MP_MOCK_MODE=1`.
2. Usá Chrome DevTools MCP (o Playwright) para navegar las vistas como usuario real: admin (`e2e-admin@turnogol.test`) y jugador (`e2e-player@turnogol.test`), auth por magic-link capturado en Inbucket.
3. Corré los E2E existentes: `pnpm test:e2e` (mirá specs en `tests/`). Reportá fallos/flakes y, sobre todo, lo que NO cubren.
4. Para CADA bug de comportamiento, registrá: vista, pasos exactos, qué dato esperabas, qué pasó, y el `archivo:línea` de la causa raíz. Un bug de front sin pasos para reproducir no es un hallazgo.
5. Mirá la CONSOLA del browser y la pestaña Network en cada vista: warnings de React (keys, hydration), errores, requests duplicados, waterfalls.

# Foco de la auditoría (cubrí TODO esto)

## 1. Realtime de la grilla admin (epicentro de bugs de datos)
- **Gap inicial**: entre el fetch SSR de la grilla y el momento en que la suscripción Realtime se conecta, hay una ventana. ¿Se pierden eventos que ocurren en ese hueco? ¿La grilla queda desincronizada hasta un refresh?
- **Reconexión**: cortá la red (DevTools offline) y volvé. ¿La suscripción se reconecta? ¿Recupera los eventos perdidos o queda mostrando datos viejos sin avisar?
- **Cleanup**: navegá entrando/saliendo de la grilla muchas veces. ¿La suscripción se limpia en el unmount o hay leak (múltiples canales, listeners duplicados, memoria creciente)?
- **Eventos duplicados / orden**: ¿un mismo evento puede pintar dos veces una reserva? ¿Llegan fuera de orden y pisan un estado más nuevo con uno viejo?
- **Optimistic vs servidor**: al crear/cancelar desde el modal, ¿la UI hace optimistic update? Si la action falla, ¿revierte o queda la reserva fantasma? (Hubo fixes de ConfirmDialog colgándose y de doble-submit — verificá que no queden casos).
- **Concurrencia real**: con DOS pestañas de admin del mismo complejo, creá/cancelá en una y mirá la otra. ¿Se sincroniza? ¿Se pisan?

## 2. Stale data y revalidación tras mutaciones (sospechoso #1 de "datos raros")
- Cada Server Action que muta (`reservas`, `caja`, `canchas`, `abonados`, `settings`, `staff`): ¿llama `revalidatePath`/`revalidateTag` del path correcto? Buscá mutaciones que cambian datos pero NO revalidan la vista que los muestra → el usuario ve datos viejos hasta recargar.
- Caché de `fetch`/Next: vistas marcadas estáticas que deberían ser dinámicas (o al revés). Datos de disponibilidad/grilla cacheados de más.
- Navegación con router cache: volver atrás y ver datos viejos después de una acción.

## 3. Flujo de pago del jugador (polling, no realtime)
- `PaymentStatusWatcher`: ¿el polling tiene backoff?, ¿se detiene cuando el pago confirma/expira/falla?, ¿sigue polleando para siempre si el usuario deja la pestaña abierta? ¿Qué muestra si MP confirma pero el polling todavía no lo trajo (UI miente "pendiente")?
- `ExpiryCountdown` / `format-remaining`: ¿el countdown driftea?, ¿qué pasa si el reloj del cliente está desfasado?, ¿qué ve el usuario cuando llega a 0 (la reserva expira en server)? ¿Coincide el "expirado" del front con el del back?
- Doble submit en confirmar reserva/pago: ¿el botón se deshabilita y muestra loading? (Patrón que ya falló en otros forms).

## 4. Formularios (parity y feedback)
- Validación cliente vs servidor: ¿el schema Zod del server coincide con lo que valida el form? Casos donde el front deja pasar algo que el server rechaza (o al revés) y el usuario no entiende el error.
- Feedback de éxito/error: commits recientes agregaron feedback en settings (horarios, políticas, PIN) porque faltaba. Barré TODOS los forms (onboarding, abonados, canchas, caja, perfil, eliminar-cuenta) y marcá los que mutan sin confirmar resultado o sin mostrar el error real.
- Estado del form tras submit: ¿se resetea cuando debe?, ¿queda editable durante el envío (permite doble submit)?, ¿pierde lo tipeado si hay error?

## 5. Formato de datos (centavos y timezone — bugs silenciosos)
- Dinero: ¿todo monto se divide bien de centavos a ARS y se formatea con `Intl`? Buscá `/100` sueltos, `toFixed`, concatenaciones que produzcan `$1500` cuando es `$15,00` o viceversa.
- Fechas/horas: conversión UTC→ART SOLO en frontend. Buscá render de fechas sin zona explícita (`America/Argentina/Buenos_Aires`) que muestre el slot una hora corrido. Bordes de día/medianoche, "hoy/mañana", y disponibilidad de la semana.

## 6. Estados de carga / error / vacío (completitud en 36 vistas)
- Por cada vista: ¿hay skeleton/loading mientras carga?, ¿estado vacío con copy útil?, ¿estado de error que no sea una pantalla en blanco o un crash? Listá las vistas que tienen huecos.
- Suspense boundaries y waterfalls: requests en cascada que podrían ser paralelos (lentitud percibida que empeora a escala).

## 7. Server/Client boundary e hidratación
- `'use client'` puesto de más (componentes que podrían ser Server) o de menos (interactividad que no hidrata).
- Hydration mismatches: fechas/locale/random renderizados distinto en server y cliente (mirá warnings en consola).
- ¿Algún dato sensible o query se filtró al cliente que debería quedar server-side?

## 8. Escala / performance percibida
- Bundle: corré `pnpm analyze` y marcá imports pesados en rutas críticas (grilla, reservar). shadcn/ui o libs cargadas enteras.
- Re-renders: listas grandes (grilla con muchas canchas/slots, listado de reservas) sin memoización, keys inestables, recálculos caros en cada render.
- Paginación/scroll en `explorar`/`mis-reservas`/listados que crecen.

# Reglas anti-alucinación
- Cada bug con PASOS PARA REPRODUCIR en la app corriendo + `archivo:línea` de la causa. Si no lo reprodujiste, marcá "sospecha no confirmada", separado de los confirmados.
- Citá el código real. No inventes componentes ni hooks que no existan.
- Respetá lo "fuera de scope" (el jugador NO tiene realtime: eso no es bug).
- Cruzá con `TODO/AUDIT_01_public.md`..`AUDIT_06_general.md` (auditoría previa vista por vista) pero RE-VERIFICÁ contra el código actual; muchos pueden estar arreglados.

# Formato de salida
Escribí el informe en `TODO/RESULTADO_auditoria_frontend.md`, agrupado por vista/área. Para cada hallazgo:
- **ID** (FE-01…), **Vista/Componente**, **Título** específico (no "mejorar estados", sino "La grilla pierde las reservas creadas durante el gap entre el fetch SSR y la conexión Realtime")
- **Severidad**: 🔴 Crítico (dato incorrecto/que engaña, pérdida de datos del form, crash) · 🟡 Alto (stale/desync visible) · 🟢 Medio · ⚪ Menor
- **Prioridad**: P0 · P1 (revienta al escalar) · P2 · P3
- **Pasos para reproducir** (en la app corriendo) + **resultado esperado vs real**
- **Causa raíz**: `archivo:línea` + por qué pasa
- **Fix concreto** + **cómo verificar** (manual o test E2E nuevo)
- **Esfuerzo**: S/M/L/XL

Al final:
1. **Top bugs de comportamiento de datos** confirmados, ordenados por impacto en el usuario.
2. **Matriz de las ~36 vistas**: por vista → estados (loading/error/empty) OK/falta, y bug más grave encontrado.
3. **Patrones sistémicos** (ej: "N forms mutan sin revalidar", "M vistas sin estado de error") para arreglar de raíz, no caso por caso.
4. **Sospechas no confirmadas** (separadas) para investigar después.

Prefiero 15 bugs reproducidos que 60 sospechas. Al terminar, ofrecé arreglar los 🔴/P0 de a uno, verificando en la app que el dato ahora se comporta bien.
```

## `---END---`

---

## Notas de uso
- **Modelo:** Fable 5 con extended thinking. Esta es la más lenta porque navega la app: 30–50 min.
- **IMPRESCINDIBLE:** la app TIENE que estar corriendo con Supabase local seedeado y Chrome DevTools MCP (o Playwright) disponible. Sin eso, el agente solo lee código y NO encuentra tus bugs de datos — que es justo lo que te duele.
- **Una sesión por auditoría.** No la cruces con backend/seguridad.
- **Después:** pedile que arregle los 🔴 de a uno, verificando en la app real (no solo "el test pasa").
