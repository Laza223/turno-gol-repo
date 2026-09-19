---
paths:
  - "src/modules/staff/**"
  - "src/app/(admin)/settings/**"
---

# Roles de staff

**`staff_role` tiene 2 roles** (migr. 029 quitó `read_only`): `admin` (dueño, acceso total) y `manager` (Encargado: grilla, reservas, caja, jugadores). **El manager NO accede a Configuración ni a gestión de Equipo**; ve `/metricas` pero sin las métricas de sistema. Sin sistema de PIN. El bloqueo de Configuración es de `settings/layout.tsx` (`requireAdminStaff()`) y cubre las 6 pestañas por igual, **sin excepción en Canchas**: `settings/canchas/page.tsx` usa `requireOperatorStaff()` a nivel de página, pero ese guard nunca llega a correr — el del layout redirige antes de que la página se renderice (H163, auditoría de coherencia 2026-09).
