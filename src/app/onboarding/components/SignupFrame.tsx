import type { ReactNode } from 'react'
import PitchLines from '@/components/public/PitchLines'
import { cn } from '@/lib/utils'
import { SIGNUP_FRAME_CLASS } from './signup-style'

/**
 * Fondo del alta: losa nocturna, dos resplandores esmeralda y las líneas de cal de una
 * cancha, muy tenues. Lo comparten /register y /onboarding/*.
 */
export function SignupFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn(SIGNUP_FRAME_CLASS, className)}>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="signup-glow-top absolute -right-32 -top-24 h-[480px] w-[480px] rounded-full" />
        <div className="signup-glow-bottom absolute -bottom-40 -left-32 h-[460px] w-[460px] rounded-full" />
        <PitchLines className="absolute inset-x-0 top-40 h-[70vh] w-full text-white/[0.045]" />
      </div>
      {children}
    </div>
  )
}
