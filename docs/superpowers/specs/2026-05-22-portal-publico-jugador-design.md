# Portal Público + Reserva Online (Jugador) — Diseño

**Fecha**: 2026-05-22
**Fase**: fase-1-portal-publico
**User stories**: descubrimiento de complejos, reserva online con seña (Flujo 2, doc7)

---

## Contexto

Tomás (jugador) necesita descubrir complejos de fútbol, ver disponibilidad y reservar online pagando una seña por MercadoPago. Hoy existe el backend (`getPublicTenant`, `getPublicAvailability`, `createOnlineBooking`, `createDepositPayment`) y la página individual `/[slug]`, pero faltan: el portal de búsqueda (`/explorar`), el flujo de reserva (`/[slug]/reservar`), la vista semanal (`/[slug]/disponibilidad`), el layout compartido y las páginas de retorno de pago.

Las páginas `explorar`, `[slug]/reservar` y `[slug]/disponibilidad` solo tienen `.gitkeep`.

---

## Decisiones tomadas

| Decisión | Elección | Razón |
|---|---|---|
| Alcance de filtros de búsqueda | Texto (nombre) + ciudad/provincia + toggle online | Usa `idx_tenants_city`. Geo (lat/long) deferido a v1.5 |
| Preservar intención en login gate | `next` URL con params + callback honra `?next` | Stateless; sobrevive el round-trip del magic link (email→click→callback) y cambios de tab |
| Fetch de disponibilidad semanal | Server fn batch `getPublicWeeklyAvailability` (1 query courts + 1 query bookings del rango 7d) | Menos round-trips, cacheable, mejor p95 |
| Nav/Footer | Extraer a `src/components/site/` con prop `variant: 'overlay' \| 'solid'` | Landing usa `overlay` (markup exacto → no se rompe); portal usa `solid` |
| Booking + pago | `createOnlineBooking` (tx1, commit) → `createDepositPayment` (tx2) | Txs de DB cortas; no se sostiene la red de MP con tx abierta; coincide con diseño standalone de `createDepositPayment`. Si tx2 falla → booking expira solo (job 15min) |
| Creación de reserva | Server Action (no Route Handler) | CLAUDE.md: Server Actions para mutaciones de UI interna. Requisito #5 explícito |
| "Precio desde" en cards de búsqueda | No (deferido) | Escanear `pricing` JSONB por tenant en lista = caro. Cards muestran ubicación + badge online |
| Páginas de retorno MP | `src/app/reserva/[bookingId]/{exito,error,pendiente}` | `createDepositPayment` ya apunta sus back_urls acá; hoy 404ean |
| Provisioning de jugador | Completo +18 en este plan | No existe hoy: nada setea `is_player`/`player_id`; `players` exige `first_name`/`last_name` NOT NULL + consentimiento +18 (ADR-012). Sin esto el login gate no funciona end-to-end |

### Provisioning de jugador (ADR-012)

Hallazgo: no hay flujo que cree jugadores ni marque `is_player`. Se agrega lo mínimo para que el gate funcione:

- `getOrCreatePlayer(email, firstName, lastName, { agreedToTerms, termsVersion, phone })` — nuevo módulo `src/modules/players/`.
- `signInWithPlayerMagicLink(email, redirectTo, profile)` — `signInWithOtp` con `options.data = { is_player: true, first_name, last_name, agreed_terms, terms_version }` (persisten en `user_metadata`).
- Callback rama player: lee `user_metadata` → `getOrCreatePlayer` → setea `app_metadata.{is_player, player_id}` (admin client) + `refreshSession` → `redirect(sanitizeNext(next))`.
- `LoginGate` captura email + nombre + apellido + **checkbox términos +18** (requerido).
- Nombres faltantes se derivan del local-part del email; `last_name` admite `''` (NOT NULL satisfecho). Completar perfil queda para `/perfil` (futuro).

---

## Arquitectura

```
DESCUBRIMIENTO
/explorar  (Server Component, lee searchParams q/city/province/online)
  └── searchPublicTenants()  → TenantCard[] (hover premium, mobile-first)
       SearchBar (client) sincroniza filtros ↔ URL (router.replace + debounce)
       filtro ciudad poblado por /api/public/cities

COMPLEJO
/[slug]  (mejora: lee searchParams date/time/dur → inicializa grilla)
  ├── TenantHeader (+ CTA "Ver semana completa")
  └── AvailabilityGrid: slot libre → <Link> /[slug]/reservar?court&date&time&dur

/[slug]/disponibilidad  (Server Component)
  └── getPublicWeeklyAvailability(tenant, today)
       WeeklyAvailability (client): tabs desktop / swipe mobile
       slots libres → link a reservar (mismo intent)

RESERVA
/[slug]/reservar  (Server Component, parsea intent de URL)
  ├── revalida slot+precio (getPublicTenant + getPublicAvailability)
  ├── BookingSummary (cancha, fecha/hora, duración, precio, seña)
  ├── LoginGate (si no es player): magic link con next=<reservar-url>
  └── ConfirmBookingButton → Server Action createBookingAndCheckout()
        withPlayerContext → SET app.current_tenant_id → createOnlineBooking
        ├── pending_payment → MercadoPagoGateway → createDepositPayment → redirect(initPoint)
        └── confirmed (sin seña) → redirect(/reserva/<id>/exito)

RETORNO MP
/reserva/[bookingId]/exito|error|pendiente  (auth player, lee booking, link a /mis-reservas)

AUTH
/api/auth/callback  (modify: rama player honra ?next same-origin)

LAYOUT
src/app/(public)/layout.tsx  → <SiteNav variant="solid"> + <SiteFooter>
src/components/site/{SiteNav,SiteFooter}  (variant overlay|solid)
src/app/page.tsx (landing, fuera del grupo) → importa con variant="overlay"
```

---

## Tipos clave

```ts
// src/modules/tenants/search.service.ts
export type PublicTenantCard = {
  id: string
  slug: string
  name: string
  city: string
  province: string
  logoUrl: string | null
  coverUrl: string | null
  allowOnlineBooking: boolean
}

export type SearchParams = {
  q?: string
  city?: string
  province?: string
  onlineOnly?: boolean
  limit?: number   // default 20
  offset?: number  // default 0
}

export type SearchResult = { results: PublicTenantCard[]; total: number }
export type CityCount = { city: string; province: string; count: number }

// src/modules/tenants/public.service.ts (añadir)
export type WeeklyDay = { date: string; courts: PublicCourt[] }
export type WeeklyAvailabilityResponse = { startDate: string; days: WeeklyDay[] }
```

---

## Reglas críticas del flujo

- **Filtro de visibilidad**: `status IN ('active','trialing')` en search; `/[slug]` mantiene su `UNAVAILABLE_STATUSES` actual.
- **tenants es global (sin RLS)** → search/cities usan `getDb()` directo. Availability usa `withTenantContext`.
- **`next` guard (open-redirect)**: aceptar solo paths que empiezan con `/` y NO con `//`. Fallback `/mis-reservas`.
- **mpAccessToken**: `getPublicTenant` lo strippea. La Server Action lo busca aparte (server-only, nunca al cliente) para construir `MercadoPagoGateway`.
- **Re-validación server-side**: `createOnlineBooking` ya hace lock + overlap check (`SlotTakenError`), ban check, PTR upsert, notificaciones. La Server Action no duplica esa lógica.
- **Montos en centavos ARS**. Seña = `round(priceSnapshot * depositPercentage / 100)`.
- **appUrl** desde `NEXT_PUBLIC_APP_URL` / `headers().get('origin')`.

---

## Errores → UX (Server Action)

| Error | Status original | UX |
|---|---|---|
| `SlotTakenError` | 409 | Vuelve a reservar `?error=slot_taken` + link a grilla |
| `PlayerBannedError` | 403 | Mensaje "No podés reservar en este complejo" |
| `CourtOfflineError` | 422 | "La cancha no está disponible" |
| `PriceUnavailableError` | 422 | "No hay precio configurado para este horario" |

---

## Caché

| Endpoint | Cache-Control |
|---|---|
| `/api/public/search` | `public, s-maxage=60, stale-while-revalidate=300` |
| `/api/public/cities` | `public, s-maxage=300, stale-while-revalidate=600` |
| `/api/public/availability/week` | `public, s-maxage=30, stale-while-revalidate=60` |

---

## Testing

- **Unit**: builder de filtros de `searchPublicTenants`; validación de `next` (open-redirect guard); generación de slots semanales (reusa `generateSlots`).
- **Integration**: `/api/public/search` (filtros q/city/online), `/api/public/cities`; `createBookingAndCheckout` (con seña → preferencia creada + redirect; sin seña → confirmed → exito); callback honra `next`.
- **e2e (Playwright)**: explorar → [slug] → reservar → login gate → checkout (MP mock).

---

## File Map (resumen — detalle en el plan)

- **[NEW]** ~20: search.service, 3 API routes, SiteNav/SiteFooter, (public)/layout, explorar (+SearchBar, TenantCard), reservar (page, actions, BookingSummary, LoginGate, ConfirmBookingButton), disponibilidad (page, WeeklyAvailability), 3 páginas de retorno MP.
- **[MODIFY]** ~6: page.tsx (landing), public.service.ts (+weekly), [slug]/page.tsx, AvailabilityGrid.tsx, auth/callback/route.ts, TenantHeader.tsx.
- **[DELETE]** 3: `.gitkeep` de explorar, reservar, disponibilidad.

---

## Out of scope (v1)

- Geolocalización / búsqueda por radio (lat/long presentes pero deferidos a v1.5).
- "Precio desde" en cards de búsqueda.
- Realtime para el jugador (polling/refresh; Realtime solo admin).
- Partidos abiertos (deferidos a v1.5, doc3).
