-- 082_marketplace_visibility.sql
-- Flag de visibilidad en marketplace público/búsqueda/sitemap para tenants.
-- Default true para preservar el comportamiento de los tenants existentes.

ALTER TABLE tenants ADD COLUMN marketplace_visible boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN tenants.marketplace_visible IS 'Indica si el complejo aparece listado en búsqueda pública, selector de ciudades y sitemap.';
