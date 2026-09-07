-- ============================================================
-- 083_tenant_coordinates_guards.sql
-- Guardas de las coordenadas del complejo.
--
-- `tenants.latitude`/`longitude` existen desde la migración 003 pero hasta
-- ahora NINGÚN camino de la aplicación las escribía: estaban en NULL para
-- todos los complejos. Con la pantalla de ubicación (`/settings/perfil`) y el
-- paso 1 del wizard pasan a ser datos que carga un humano, así que conviene
-- que la base defienda sus dos invariantes en vez de confiar sólo en Zod.
--
-- 1) RANGO. La defensa de verdad está en el esquema Zod, pero el modo de fallo
--    que esto ancla es silencioso y caro: `Number('')` es 0 en JavaScript, así
--    que un campo vacío mal manejado guarda el punto (0, 0) — el Golfo de
--    Guinea, a diez mil kilómetros de cualquier complejo argentino. Ese punto
--    pasa el rango, y por eso el rango no alcanza solo; lo que sí ataja es
--    cualquier valor fuera del planeta.
--
-- 2) AMBAS O NINGUNA. Este es el importante. Todo el lado lector asume el par
--    completo: `ExplorarMap` filtra por las dos, el Haversine de
--    `search.service.ts` devuelve NULL si falta una, y el JSON-LD sólo emite
--    el bloque `geo` con ambas. Media coordenada es un estado que ninguna
--    pantalla sabe renderizar.
--
-- Sin índices a propósito. El Haversine es una expresión que depende de los
-- parámetros lat/lng de cada request: ningún índice de árbol la puede servir.
-- Lo único que ayudaría es PostGIS o cube/earthdistance con GiST, y eso es una
-- extensión nueva sobre una tabla que hoy tiene un puñado de filas. Se difiere
-- con umbral escrito: revisar cuando `tenants` pase las ~5.000 filas o cuando
-- `sort=distance` aparezca en el p95 de latencia.
--
-- Seguro sobre las filas existentes: en producción las dos columnas están en
-- NULL, y los seeds escriben siempre el par completo y dentro de rango.
-- ============================================================

ALTER TABLE tenants
  ADD CONSTRAINT tenants_latitude_range
    CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  ADD CONSTRAINT tenants_longitude_range
    CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  ADD CONSTRAINT tenants_coordinates_both_or_neither
    CHECK ((latitude IS NULL) = (longitude IS NULL));

COMMENT ON COLUMN tenants.latitude IS
  'Latitud del complejo. NULL = sin cargar. Va siempre en par con longitude (constraint tenants_coordinates_both_or_neither). La carga el duenio a mano desde /settings/perfil o el paso 1 del wizard: no hay geocodificador (doc10 82).';

COMMENT ON COLUMN tenants.longitude IS
  'Longitud del complejo. NULL = sin cargar. Ver el comentario de latitude.';
