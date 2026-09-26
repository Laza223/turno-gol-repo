---
paths:
  - "src/modules/staff/**"
  - "src/app/(admin)/settings/**"
  - "src/app/(admin)/analiticas/**"
---

# Roles de staff

**`staff_role` tiene 2 roles** (migr. 029 quitó `read_only`): `admin` (dueño, acceso total) y `manager` (Encargado: Hoy, grilla, reservas, caja, jugadores). **El manager NO accede a Ajustes (ex "Configuración"), a gestión de Equipo, a Canchas ni a Métricas** (`/analiticas` y sus dos APIs son solo del dueño desde 2026-09-19); sí ve Hoy, que es la pantalla del mostrador (el checklist de arranque y el tour son solo del dueño). Sin sistema de PIN. El bloqueo de Ajustes es de `settings/layout.tsx` (`requireAdminStaff()`) y cubre por igual la portada `/settings` y sus cinco páginas (desde 2026-09-25 no hay pestañas), **sin excepción en el redirect viejo `settings/canchas`**: esa página usa `requireOperatorStaff()`, pero ese guard nunca llega a correr — el del layout redirige antes de que la página se renderice (H163, auditoría de coherencia 2026-09).
