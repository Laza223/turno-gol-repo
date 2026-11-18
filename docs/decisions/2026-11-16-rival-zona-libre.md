# Decisión: la zona de RIVAL pasa a ser cualquier localidad de Argentina

**Fecha:** 2026-11-16. **Decide:** Lazar (founder): "abrirla a cualquier localidad". **Supera** la lista cerrada de zonas del §7 de la spec [`docs/superpowers/specs/2026-10-22-rival-v1-design.md`](../superpowers/specs/2026-10-22-rival-v1-design.md) (perfil v1, línea "Zona") y la decisión 5 de [`2026-10-22-rival-v1.md`](2026-10-22-rival-v1.md) ("zona, elegida de una lista cerrada de localidades").

## Contexto

`players.zone` era una lista cerrada de 13 valores: el corredor del piloto (Luján, Jáuregui, Open Door, Torres, Pueblo Nuevo, Olivera, Carlos Keen, General Rodríguez, Mercedes, Pilar, Moreno, Exaltación de la Cruz y "Otra zona"). Vivía en dos lados: el CHECK `players_zone_check` de la migración 099 y `RIVAL_ZONES` en el código, con un test que los comparaba. La spec decía que se ampliaba al sumar complejos.

## Decisión

- La zona es **cualquier localidad del país**, elegida con el buscador de localidades (`LocalityPicker`), que también deja usar la ubicación actual o escribirla a mano.
- Se guarda como texto con el formato **`"{ciudad}, {provincia}"`** (por ejemplo `Mercedes, Buenos Aires`), con una de las 24 provincias de `PROVINCES`. El formato es obligatorio y lo exige `rivalProfileSchema` (decisión de Lazar, 2026-11-17: "exigí formato"). Largo máximo: 120 caracteres. La base solo limita el largo: un CHECK de formato rompería las filas viejas.
- Los valores viejos (`Luján`, `Jáuregui`, ..., `Otra zona`) **siguen en la base y el organizador los ve igual**: no se migran. Pero quien vuelva a elegir su zona tiene que hacerlo con el formato nuevo, y el campo los muestra vacíos.

## Por qué

El piloto se abrió más allá del corredor de Luján y la lista cerrada bloqueaba a jugadores de otras zonas: no podían completar el perfil para sumarse.

## Consecuencias

- Migración 115: borra `players_zone_check` y agrega `players_zone_len_check` (largo ≤ 120). La columna sigue `text`, con NULL permitido. Es compatible hacia atrás con el código viejo.
- Se eliminan `RIVAL_ZONES`, `rival-zones.ts` y su test de sincronía: ya no hay una lista que mantener igual en la base.
- Ya no hay una zona "exacta" para agrupar: "Luján" y "Luján, Buenos Aires" son valores distintos. Si más adelante se quiere agrupar o filtrar por zona hace falta normalizar (por ejemplo guardar ciudad y provincia en columnas aparte). No se hizo.
- Sigue valiendo que la zona la ve solo el organizador de un partido al que el jugador se suma o pide sumarse. Cambió el origen del valor (buscador, no lista), no quién lo ve.
