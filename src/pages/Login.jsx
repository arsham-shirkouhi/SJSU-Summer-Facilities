import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const navigate = useNavigate()
  const { user, profile, signIn, signOut } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/dashboard', { replace: true })
    } catch (signInError) {
      setError(signInError?.message || 'Unable to sign in. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  const handleSignOutCurrent = async () => {
    await signOut()
    setPassword('')
    setError('')
  }

  return (
    <div className="min-h-screen bg-cream">
      <div className="hidden min-h-screen md:flex">
        <aside className="flex w-[42%] flex-col justify-between bg-ink p-12">
          <div>
            <h1 className="text-[72px] font-extrabold leading-[0.9] text-white">
              LINEN
              <br />
              TRACK
            </h1>
            <div className="my-6 h-0.5 w-full bg-white" />

            <div className="flex items-center justify-between gap-3">
              {[
                ['9', 'Locations'],
                ['5', 'Items'],
                ['3', 'Storage Rooms'],
              ].map(([value, label], index) => (
                <div key={label} className="flex flex-1 items-center justify-center gap-3">
                  {index > 0 && <div className="h-11 w-px bg-white/40" />}
                  <div>
                    <p className="mono text-[22px] font-bold text-white">{value}</p>
                    <p className="text-[10px] uppercase tracking-[0.09em] text-white/60">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <svg viewBox="0 0 360 240" className="w-full max-w-[340px]" fill="none">
            <rect x="34" y="54" width="220" height="40" stroke="white" strokeWidth="2.5" />
            <line x1="44" y1="67" x2="244" y2="67" stroke="white" strokeWidth="1.4" />
            <line x1="44" y1="78" x2="220" y2="78" stroke="white" strokeWidth="1.4" />

            <rect x="52" y="94" width="220" height="40" stroke="white" strokeWidth="2.5" />
            <line x1="62" y1="107" x2="252" y2="107" stroke="white" strokeWidth="1.4" />
            <line x1="62" y1="118" x2="232" y2="118" stroke="white" strokeWidth="1.4" />

            <rect x="70" y="134" width="220" height="40" stroke="white" strokeWidth="2.5" />
            <line x1="80" y1="147" x2="270" y2="147" stroke="white" strokeWidth="1.4" />
            <line x1="80" y1="158" x2="252" y2="158" stroke="white" strokeWidth="1.4" />

            <rect x="282" y="151" width="48" height="24" stroke="white" strokeWidth="2.5" />
            <text x="292" y="168" fontSize="12" fontWeight="700" fill="white">
              SJSU
            </text>
          </svg>
        </aside>

        <section className="flex w-[58%] items-center justify-center bg-cream p-12">
          <LoginCard
            email={email}
            password={password}
            showPassword={showPassword}
            loading={loading}
            error={error}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onTogglePassword={() => setShowPassword((value) => !value)}
            onSubmit={handleSubmit}
            signedInEmail={user?.email}
            signedInName={profile?.full_name}
            onContinueToDashboard={() => navigate('/dashboard', { replace: true })}
            onSignOutCurrent={handleSignOutCurrent}
          />
        </section>
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-[440px] items-center px-5 py-8 md:hidden">
        <LoginCard
          email={email}
          password={password}
          showPassword={showPassword}
          loading={loading}
          error={error}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onTogglePassword={() => setShowPassword((value) => !value)}
          onSubmit={handleSubmit}
          signedInEmail={user?.email}
          signedInName={profile?.full_name}
          onContinueToDashboard={() => navigate('/dashboard', { replace: true })}
          onSignOutCurrent={handleSignOutCurrent}
        />
      </div>
    </div>
  )
}

function LoginCard({
  email,
  password,
  showPassword,
  loading,
  error,
  onEmailChange,
  onPasswordChange,
  onTogglePassword,
  onSubmit,
  signedInEmail,
  signedInName,
  onContinueToDashboard,
  onSignOutCurrent,
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="brutal-card relative w-full bg-white p-6 md:p-9"
      autoComplete="off"
    >
      <div className="mb-6">
        <span className="stamp stamp-green inline-block -rotate-2">Staff Login</span>
      </div>

      <h2 className="text-[30px] font-extrabold text-ink">Welcome back.</h2>
      <p className="mb-6 mt-1 text-[12px] uppercase tracking-[0.09em] text-[#6B6B6B]">
        SJSU Summer Housing · LinenTrack
      </p>

      {signedInEmail ? (
        <div className="mb-6 border-2 border-ink bg-primary-light p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em]">Current Session</p>
          <p className="mono text-[12px] font-bold">{signedInName || signedInEmail}</p>
          <p className="mono text-[11px] text-[#3D3D3D]">{signedInEmail}</p>
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

      <div className="space-y-4">
        <label className="block">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em]">Email Address</div>
          <div className="relative">
            <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              className="brutal-input pl-10"
              type="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              required
            />
          </div>
        </label>

        <label className="block">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em]">Password</div>
          <div className="relative">
            <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              className="brutal-input pl-10 pr-10"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              required
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2"
              onClick={onTogglePassword}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>
      </div>

      <button
        type="submit"
        className="brutal-btn mt-5 flex h-12 w-full items-center justify-center bg-primary text-[14px] text-white disabled:cursor-not-allowed disabled:opacity-70"
        disabled={loading}
      >
        {loading ? <span className="spinner-circle" /> : 'SIGN IN →'}
      </button>

      {error ? (
        <div className="mt-3 border-2 border-ink bg-danger px-3.5 py-2.5 text-[13px] font-bold text-white">
          {error}
        </div>
      ) : null}

      <p className="mt-5 text-center text-[12px] text-[#6B6B6B]">
        No account? Contact your administrator.
      </p>

      <svg viewBox="0 0 60 80" className="absolute -bottom-2.5 -right-2.5 h-20 w-[60px]" fill="none">
        <path d="M6 8H54V74H6V8Z" fill="#F5F0E8" stroke="#0A0A0A" strokeWidth="2" />
        <path d="M22 8C22 3.5 26 2 30 2C34 2 38 3.5 38 8" stroke="#0A0A0A" strokeWidth="2" />
        <circle cx="30" cy="12" r="3.5" stroke="#0A0A0A" strokeWidth="2" />
        <text
          x="43"
          y="20"
          transform="rotate(90 43 20)"
          fontSize="7"
          fontWeight="700"
          fill="#0A0A0A"
        >
          SJSU HOUSING
        </text>
      </svg>
    </form>
  )
}
