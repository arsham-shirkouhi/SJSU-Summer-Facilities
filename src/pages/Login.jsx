import { Hash } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { normalizePinCode } from '../lib/pinAuth'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const navigate = useNavigate()
  const { user, profile, signInWithPin, signOut } = useAuth()
  const [pinCode, setPinCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    const normalized = normalizePinCode(pinCode)
    if (!normalized) {
      setError('Enter your 4-digit login code.')
      return
    }

    setLoading(true)
    try {
      await signInWithPin(normalized)
      navigate('/dashboard', { replace: true })
    } catch (signInError) {
      setError(signInError?.message || 'Invalid login code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handlePinChange = (value) => {
    setPinCode(value.replace(/\D/g, '').slice(0, 4))
  }

  const handleSignOutCurrent = async () => {
    await signOut()
    setPinCode('')
    setError('')
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-cream">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,26,87,0.24),transparent_40%),radial-gradient(circle_at_85%_15%,rgba(0,56,167,0.22),transparent_42%),radial-gradient(circle_at_50%_95%,rgba(0,26,87,0.2),transparent_45%)]" />
        <div className="absolute -left-20 -top-20 h-80 w-80 rounded-full border-[2.5px] border-ink/30 bg-primary-light/55" />
        <div className="absolute -right-24 top-8 h-96 w-96 rounded-full border-[2.5px] border-ink/30 bg-primary-light/45" />
        <div className="absolute bottom-[-72px] left-1/2 h-64 w-[620px] -translate-x-1/2 rounded-t-[130px] border-[2.5px] border-ink/20 bg-primary-light/35" />
        <div className="absolute left-10 top-1/3 h-28 w-28 rotate-12 border-[2.5px] border-ink/25 bg-white/40" />
        <div className="absolute bottom-24 right-10 h-24 w-24 -rotate-6 border-[2.5px] border-ink/25 bg-amber-light/45" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-[620px] items-center px-5 py-8">
        <LoginCard
          pinCode={pinCode}
          loading={loading}
          error={error}
          onPinChange={handlePinChange}
          onSubmit={handleSubmit}
          signedInName={profile?.full_name}
          signedInPin={profile?.pin_code}
          onContinueToDashboard={() => navigate('/dashboard', { replace: true })}
          onSignOutCurrent={handleSignOutCurrent}
          hasSession={Boolean(user)}
        />
      </div>
    </div>
  )
}

function LoginCard({
  pinCode,
  loading,
  error,
  onPinChange,
  onSubmit,
  signedInName,
  signedInPin,
  onContinueToDashboard,
  onSignOutCurrent,
  hasSession,
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="brutal-card relative w-full bg-white p-7 md:p-10"
      autoComplete="off"
    >
      <div className="mb-6">
        <span className="stamp stamp-amber inline-block -rotate-2">Staff Login</span>
      </div>

      <h2 className="text-[30px] font-extrabold text-ink">Welcome back.</h2>
      <p className="mb-6 mt-1 text-[12px] uppercase tracking-[0.09em] text-[#6B6B6B]">
        SJSU Summer Housing · LinenTrack
      </p>

      {hasSession ? (
        <div className="mb-6 border-2 border-ink bg-primary-light p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em]">Current Session</p>
          <p className="mono text-[12px] font-bold">{signedInName || 'Staff User'}</p>
          {signedInPin ? <p className="mono text-[11px] text-[#3D3D3D]">Code · {signedInPin}</p> : null}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onContinueToDashboard}
              className="brutal-btn bg-ink px-2.5 py-1.5 text-[10px] text-white"
            >
              Continue →
            </button>
            <button
              type="button"
              onClick={onSignOutCurrent}
              className="brutal-btn bg-white px-2.5 py-1.5 text-[10px]"
            >
              Switch User
            </button>
          </div>
        </div>
      ) : null}

      <div className="mb-6 h-0.5 w-full bg-ink" />

      <label className="block">
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em]">4-Digit Login Code</div>
        <div className="relative">
          <Hash size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/80" />
          <input
            className="brutal-input !pl-12 text-center !text-[28px] !font-bold tracking-[0.45em]"
            type="text"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            value={pinCode}
            onChange={(event) => onPinChange(event.target.value)}
            placeholder="0000"
            autoComplete="one-time-code"
            required
          />
        </div>
      </label>

      <button
        type="submit"
        className="brutal-btn mt-5 flex h-12 w-full items-center justify-center bg-primary text-[14px] text-white disabled:cursor-not-allowed disabled:opacity-70"
        disabled={loading || pinCode.length !== 4}
      >
        {loading ? <span className="spinner-circle" /> : 'SIGN IN →'}
      </button>

      {error ? (
        <div className="mt-3 border-2 border-ink bg-danger px-3.5 py-2.5 text-[13px] font-bold text-white">
          {error}
        </div>
      ) : null}

      <p className="mt-5 text-center text-[12px] text-[#6B6B6B]">
        No code? Contact your administrator.
      </p>

      <svg viewBox="0 0 60 80" className="absolute -bottom-2.5 -right-2.5 h-20 w-[60px]" fill="none">
        <path d="M6 8H54V74H6V8Z" fill="#F5F0E8" stroke="#001A57" strokeWidth="2" />
        <path d="M22 8C22 3.5 26 2 30 2C34 2 38 3.5 38 8" stroke="#001A57" strokeWidth="2" />
        <circle cx="30" cy="12" r="3.5" stroke="#001A57" strokeWidth="2" />
        <text
          x="43"
          y="20"
          transform="rotate(90 43 20)"
          fontSize="7"
          fontWeight="700"
          fill="#001A57"
        >
          SJSU HOUSING
        </text>
      </svg>
    </form>
  )
}
