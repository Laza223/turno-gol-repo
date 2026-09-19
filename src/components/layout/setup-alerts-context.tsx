'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { NO_SETUP_ALERTS, type SetupAlerts } from './setup-alerts'

/**
 * Los avisos de configuración incompleta llegan del layout del panel; las
 * pantallas que necesitan uno propio (las pestañas de Configuración, que cada
 * página renderiza por su cuenta) lo leen de acá en vez de recibirlo por props
 * desde cinco páginas.
 */
const SetupAlertsContext = createContext<SetupAlerts>(NO_SETUP_ALERTS)

export function SetupAlertsProvider({
  alerts,
  children,
}: {
  alerts: SetupAlerts
  children: ReactNode
}) {
  return <SetupAlertsContext.Provider value={alerts}>{children}</SetupAlertsContext.Provider>
}

export function useSetupAlerts(): SetupAlerts {
  return useContext(SetupAlertsContext)
}
