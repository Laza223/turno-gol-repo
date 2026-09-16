# El precio por jugador pasa a ser el número principal, y se denormaliza

**Fecha**: 2026-09-15 · **Estado**: aplicado · **Decide**: el dueño (encuadre) + esta sesión (cómo)

## Qué

En las cards públicas (cancha del complejo, `/explorar` grid y compact, complejo destacado de la
landing, pin y popup del mapa) el número grande pasa a ser **lo que pone cada jugador**, con el total
del turno como línea secundaria: `$4.300 por jugador` / `$60.000 el turno`. Un solo "desde" gobierna
las dos líneas.

Encuadre del dueño: el jugador no piensa en el alquiler de la cancha, piensa en lo que pone cada uno.
$60.000 asusta; $4.300 no. Sin validar todavía con jugadores reales — se confirma o se refuta con la
conversión de `/explorar` (registrado en `docs/gtm/ejecucion/10-aprendizajes.md`).

## El problema que apareció al mirarlo de cerca

El helper que ya existía (`perPlayerPriceCents`, `src/lib/format.ts`) divide `tenants.from_price_cents`
por el formato **más chico** de `tenants.court_formats`. Los dos son mínimos denormalizados
independientes: **pueden venir de canchas distintas**.

Ejemplo real de un complejo mixto: F5 a $45.000 ($4.500 por cabeza) y F7 a $60.000 ($4.285,72 por
cabeza). El helper informa $4.500; el mínimo real es $4.300. Tolerable como dato secundario en letra
chica; no como el número que decide si el jugador entra.

## Alternativas y por qué

1. **Calcularlo en la query de búsqueda, sin columna nueva.** Descartada. `searchPublicTenants` lee
   **solo `tenants`** con el pool público: `courts` está bajo RLS y por eso existe la denormalización.
   Aparear precio y formato exige la MISMA fila de `courts`, información que los dos arrays
   denormalizados ya perdieron. Sin columna habría que ir a `courts` con el pool BYPASSRLS en el
   camino caliente de `/explorar`, la home y los favoritos — una query cross-tenant que saltea RLS a
   propósito y que además no puede participar del `WHERE`/`ORDER BY` de la query principal.
2. **Columna denormalizada calculada por el mismo trigger** (`from_price_per_player_cents`,
   migración `087_tenant_from_price_per_player.sql`). Elegida: el trigger ya recorre las canchas
   online para los otros tres facets, así que sumar `CEIL(MIN(price / (format*2)))` es costo cero en
   escritura y deja el dato disponible para las cuatro superficies que lo muestran.

Consecuencias asumidas:

- **La columna guarda el mínimo CRUDO; el redondeo a $100 sigue en `src/lib/format.ts`.** Es
  presentación (cambiarlo no puede pedir un backfill) y es seguro: el redondeo hacia arriba es
  monótono, así que `min(ceil(x)) = ceil(min(x))`.
- **Invariante**: `from_price_per_player_cents IS NULL` ⟺ `from_price_cents IS NULL` (salen del mismo
  agregado y `format` es NOT NULL). No existe la card con total y sin por-jugador.
- **Las dos líneas de la card pueden no cerrar aritméticamente** en un complejo mixto: el total
  mínimo y el por-jugador mínimo pueden ser de canchas distintas. Es correcto — los dos son mínimos y
  el "desde" los gobierna. Se rechazó denormalizar "el total de la cancha ganadora" porque rompería
  la coherencia con el filtro de precio (la card mostraría un total que el filtro no matchea).
- **El filtro y el orden "Precio por turno" de `/explorar` NO cambian.** Queda un efecto raro
  conocido: ordenando por precio, un F11 caro por turno es barato por cabeza y el orden se ve
  arbitrario contra el titular. La columna deja ese cambio en una línea (`orderBy`), para cuando haya
  evidencia de que molesta.

## Lo que se arregló de paso

El trigger `courts_recalc_from_price` escuchaba `UPDATE OF pricing, status, tenant_id, surface_type,
capacity` — **sin `format`**, que desde la migración que lo introdujo es la columna que alimenta
`court_formats` (y ahora el precio por jugador). No fallaba solo porque `updateCourt()` escribe
`capacity = format * 2` en el mismo UPDATE: una dependencia implícita entre el código de aplicación y
la lista de columnas del trigger. La migración 087 agrega `format` a esa lista, y el test de
integración cubre el caso (`UPDATE courts SET format = …` a secas recalcula).

## Verificación

- `tests/integration/search-upgrade.test.ts`: complejo mixto F5/F7 (el caso del ejemplo), cancha
  offline que no cuenta, complejo sin canchas online (ambos NULL), y el `UPDATE` de solo `format`.
- `tests/unit/per-player-price.test.ts`: el redondeo y su monotonía.
- **Trampa de la capa pública**: el campo nuevo tiene que estar también en el schema Zod de
  `src/app/api/public/search/route.ts`. `z.object` strippea las claves desconocidas, así que
  olvidarlo borra el campo de la respuesta pública en silencio, con el parse en verde.
