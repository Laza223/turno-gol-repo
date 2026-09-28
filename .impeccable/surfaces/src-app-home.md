---
version: 1
slug: "src-app-home"
primary_target: "src/app/home"
related_targets: ["src/components/site/HeroSearch.tsx"]
---

# Home hero (src/app/home/)

Modo: Persuade. Visitante: el futbolero que quiere jugar (no el complejo; /para-complejos no se toca). Trabajo: ver que hay cancha cerca y reservar un turno libre sin llamar a nadie. Mundo: DESIGN.md, "La Previa"; este brief no lo cambia.

## Decisiones del dueño (2026-09-27)
- Solo entran complejos con reserva online activa (`allow_online_booking`). Con o sin seña por MercadoPago: MP no suma.
- Orden de las 3 que se muestran: perfil más completo (foto de portada, precio cargado), después la distancia. Nunca orden pagado; patrocinio = fuera del freeze, REQUIERE INPUT.
- Radio: no un número fijo. v1 se adapta a la densidad: 5 → 10 → 20 → 30 → 40 km hasta juntar 3; más allá de 40 km, estado vacío honesto. A calibrar por zona con datos.
- "Tus canchas" (lo que reservó la cuenta) queda como lugar reservado, sin construir: hoy nadie tiene historial.
- Nada de datos inventados: distancia, precio y turnos libres salen de /api/public/search y /api/public/availability.

## Comp aprobado
`.impeccable/mocks/hero-b.png` (B: oferta a la izquierda, tu cancha a la derecha). Nombres y horarios del comp son ilustrativos.

## Direction contract
THESIS: El hero prueba la oferta con la cancha real más cercana y sus turnos libres de hoy; rechaza el titular genérico centrado sobre un formulario de cuatro campos.
OWN-WORLD: La Previa de DESIGN.md: slate-950 con resplandor esmeralda, vidrio al 3 %, Archivo 900 itálica en titulares y nombres de complejo, Inter en todo lo demás, un solo verde sólido (Buscar canchas).
STORY: Entiende que hay cancha a N km, ve cuándo está libre hoy y toca un horario para reservar; si no, busca por zona, día y hora.
FIRST VIEWPORT: Izquierda 42 %: titular de 3 líneas (el rótulo con pin del comp se sacó: el piso de impeccable prohíbe kickers y repetía el titular) "Tu próxima cancha está a 4 km." (~86 px, acento en "a 4 km."), subtítulo, tarjeta de vidrio con Zona / Día / Hora apilados y el botón esmeralda. Derecha 52 %: tarjeta grande con la foto del complejo, nombre, meta, precio y "Libre hoy" con 4 horarios; debajo, dos filas con miniatura, nombre, distancia y el próximo libre.
FORM: Surface structure 3 de 7 ("Tu cancha más cercana"), composición B; seed 0583d9a8.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
