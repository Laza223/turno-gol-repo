# Decisión: ubicación en toda Argentina (dataset propio + Georef + OpenStreetMap)

**Fecha:** 2026-11-17. **Decide:** Lazar (founder): "debe abarcar todas y cada una de las ubicaciones de Argentina", con un botón "Usar mi ubicación actual". El 2026-11-17 aprobó Georef + OpenStreetMap (Photon) como segunda fuente, **también para ubicar al jugador**, y que `/privacidad` lo cuente.

## Contexto

Cargar la ubicación era lo más difícil del alta y a veces imposible. Causas probadas:

- `buildSearchUrl` filtraba por `localidad=`, un parámetro que Georef no conoce: lo ignoraba y devolvía 200 sin filtrar. "Mitre 2064 Lujan" traía 5 "MITRE 2064" de cinco provincias.
- El alta no mandaba ciudad ni provincia: se buscaba en todo el país.
- Georef no cubre todo (Jáuregui no figura en ninguno de sus datasets) y trae datos sucios (guion blando U+00AD).
- "Elegí la localidad" solo ofrecía ciudades con complejos, y "Usar mi ubicación" devolvía la ciudad del complejo más cercano, no la del jugador.

## Decisión

Capas, cada una atrapa lo que la anterior no encuentra (`src/modules/geo/`):

1. **Dataset propio** de localidades (censales + localidades de Georef, limpio, versionado en `src/modules/geo/data/localities.json`, se regenera con `scripts/geo/build-localities.ts`). Sin depender de un tercero en cada tecla.
2. **OpenStreetMap vía Photon** (`photon.komoot.io`), solo desde el servidor, cuando el dataset trae poco. Así aparece Jáuregui.
3. **Calle y altura:** Georef con filtros correctos (`localidad_censal`, `departamento`, `provincia`); si no hay nada, OpenStreetMap; si tampoco, la dirección se acepta tal cual.
4. **Siempre hay salida:** "Usar mi ubicación actual", pin en el mapa o escribir ciudad y provincia a mano. Una búsqueda sin resultados nunca bloquea un paso.

Todo pasa por endpoints propios (`/api/public/geo/{localidades,direcciones,reverse}`, con rate limit): el CSP no deja que el navegador hable con terceros.

**Jugador (decisión del 2026-11-17).** "Usar mi ubicación actual" manda las coordenadas redondeadas a ~100 m a Georef y también a OpenStreetMap: Georef da provincia y partido, OSM dice el pueblo (el dataset a veces solo tiene el barrio vecino: Villa Flandria en vez de Jáuregui). OSM solo vale si coincide en provincia con Georef. Si OSM falla queda la localidad del dataset a ≤ 6 km o el partido. Las coordenadas nunca se loguean ni se guardan en la base; en el dispositivo queda la zona redondeada a ~1 km.

**Dueño del complejo.** La dirección y el punto del complejo ya son públicos: pueden ir a OSM con precisión de calle.

## Por qué no Google ni Mapbox

Los términos de Google no permiten usar sus resultados sobre un mapa que no sea de Google (el mapa es Leaflet + OSM) y los dos cobran. Georef + OSM es $0, sin API key y sin dependencia npm nueva.

## Consecuencias

- **Photon es una instancia pública sin SLA** y pide uso razonable. Se mitiga con rate limit, timeouts de 3,5 s y degradación a carga manual. Si crece, se autoaloja o se cambia el proveedor (una constante en `photon.client.ts`).
- Las consultas salen desde nuestro servidor: Georef y Photon no ven la IP ni la cuenta del usuario. `/privacidad` y doc18 §6.3 lo declaran.
- Los complejos viejos con `city` en texto libre ("Lujan" vs "Luján") siguen filtrando por igualdad exacta. No se tocó. Si una localidad no tiene complejos, `/explorar` muestra los más cercanos por distancia.
- La zona de RIVAL pasó a "Ciudad, Provincia" obligatoria: [`2026-11-16-rival-zona-libre.md`](2026-11-16-rival-zona-libre.md).
