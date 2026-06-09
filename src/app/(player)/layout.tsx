import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { PlayerBottomNav } from './_components/PlayerBottomNav'
import { Logo } from '@/components/ui/logo'
import type { ReactNode } from 'react'

async function signOutAction() {
  'use server'
  const supabase = createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export default async function PlayerLayout({ children }: { children: ReactNode }) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-slate-900 text-white px-4 py-3 flex items-center justify-between shadow-sm">
        <Logo variant="horizontal" textClassName="text-white font-semibold text-base" iconClassName="bg-white/95" />
        <form action={signOutAction}>
          <button
            type="submit"
            className="text-sm text-slate-300 hover:text-white transition-colors duration-150"
          >
            Salir
          </button>
        </form>
      </header>
      <main id="main-content" className="flex-1 pb-20">{children}</main>
      <PlayerBottomNav />
    </div>
  )
}
