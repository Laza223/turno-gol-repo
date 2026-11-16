import type { ReactNode } from 'react'
import PortalShell from '@/components/site/PortalShell'
import { signOutAction } from '@/modules/auth/sign-out.action'
import { subscribePlayerPushAction, unsubscribePlayerPushAction } from '@/app/(player)/push-actions'

const PLAYER_PUSH_ACTIONS = {
  subscribe: subscribePlayerPushAction,
  unsubscribe: unsubscribePlayerPushAction,
}

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <PortalShell signOutAction={signOutAction} pushActions={PLAYER_PUSH_ACTIONS}>
        {children}
      </PortalShell>
    </div>
  )
}
