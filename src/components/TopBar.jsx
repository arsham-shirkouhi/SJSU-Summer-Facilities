import { useAuth } from '../context/AuthContext'

export default function TopBar() {
  const { user, profile, signOut, signingOut } = useAuth()
  const normalizedRole = String(profile?.role || '').trim().toLowerCase()
  const roleLabel = normalizedRole ? normalizedRole.toUpperCase() : 'NONE'

  const handleSignOut = async () => {
    await signOut()
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 h-14 border-b-[2.5px] border-ink bg-ink px-5">
      <div className="mx-auto flex h-full max-w-[1120px] items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-[14px] font-extrabold tracking-[0.12em] text-white">LINENTRACK</div>
          <div className="h-4 w-px bg-white/40" />
          <div className="text-[11px] uppercase tracking-[0.1em] text-white/50">SJSU Housing</div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[13px] font-semibold text-white">{profile?.full_name || 'Staff'}</div>
            <div className="mono text-[10px] text-white/60">{user?.email || 'No email'} · ROLE: {roleLabel}</div>
          </div>
          {normalizedRole === 'admin' ? (
            <span className="border-[1.5px] border-primary bg-primary px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-white">
              Admin View
            </span>
          ) : null}
          <div className="h-4 w-px bg-white/40" />
          <button
            type="button"
            className="border-[1.5px] border-white/60 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.07em] text-white"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? 'OUT...' : 'OUT →'}
          </button>
        </div>
      </div>
    </header>
  )
}
