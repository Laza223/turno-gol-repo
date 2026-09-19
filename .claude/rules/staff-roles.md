---
paths:
  - "src/modules/staff/**"
  - "src/app/(admin)/settings/**"
  - "src/app/(admin)/analiticas/**"
---

# Roles de staff

**`staff_role` tiene 2 roles** (migr. 029 quitó `read_only`): `admin` (dueño, acceso total) y `manager` (Encargado: Hoy, grilla, reservas, caja, jugadores). **El manager NO accede a Configuración, a gestión de Equipo ni a Métricas** (`/analiticas` y sus dos APIs son solo del dueño desde 2026-09-19); sí ve Hoy, que es la pantalla del mostrador (el checklist de arranque y el tour son solo del dueño). Sin sistema de PIN. El bloqueo de Configuración es de `settings/layout.tsx` (`requireAdminStaff()`) y cubre las 6 pestañas por igual, **sin excepción en Canchas**: `settings/canchas/page.tsx` usa `requireOperatorStaff()` a nivel de página, pero ese guard nunca llega a correr — el del layout redirige antes de que la página se renderice (H163, auditoría de coherencia 2026-09).
