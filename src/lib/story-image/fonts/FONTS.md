# Fuentes de la placa para historias

Las lee `../render.tsx` con `fs` y `process.cwd()` y se las pasa a `ImageResponse` (satori).
Satori solo entiende `.ttf`, `.otf` y `.woff` (v1); **no lee `.woff2`**. Por eso no se reusan
las de `.design-sync/fonts/`, que son woff2 variables. Estas son instancias estáticas.

| Archivo                         | Familia y peso      | Uso                          | Origen                                                             | sha256                                                             |
| ------------------------------- | ------------------- | ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `archivo-latin-900-italic.woff` | Archivo 900 itálica | día, horas, nombre, wordmark | `@fontsource/archivo@5.3.0`, `files/archivo-latin-900-italic.woff` | `fccac3c1ed14f7a01ca7cbf29fe0361d5b653029ab6f48aaf9cadf26633367d5` |
| `inter-latin-600-normal.woff`   | Inter 600           | todo lo demás                | `@fontsource/inter@5.3.0`, `files/inter-latin-600-normal.woff`     | `6a9cb3a509b4eeaf12b7dda6c4aacac3e85d07f4201bf4dd716e332e692b87bd` |

- Licencia: SIL Open Font License 1.1 (© The Archivo Project Authors, © The Inter Project Authors).
- Solo el subset `latin` (Basic Latin + Latin-1 + puntuación general): cubre tildes, ñ, ¿ y ¡. Cualquier
  otro glifo hace que satori salga a la red a buscar una fuente, por eso `buildStoryModel` sanea el
  nombre del complejo antes de dibujarlo.
- Descargadas el 2026-09-29 con `npm pack` y aprobadas por el dueño. No están en `package.json`.
- Para cambiarlas: mismo paquete, otro archivo `.woff`, y actualizar esta tabla.
