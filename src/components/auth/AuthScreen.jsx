import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import Button from '../ui/Button'
import Input from '../ui/Input'

export default function AuthScreen() {
  const { signUp, signIn } = useAuth()
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (isSignUp) {
        await signUp(email, password)
      } else {
        await signIn(email, password)
      }
    } catch (err) {
      setError(err.message || 'Authentication failed')
    }
    setLoading(false)
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: 'linear-gradient(160deg, #1B4332 0%, #2D6A4F 50%, #40916C 100%)' }}
    >
      <div className="text-center mb-10 animate-slide-up">
        <h1 className="font-[family-name:var(--font-display)] text-[32px] font-bold text-white leading-tight mb-2.5 tracking-wide">
          Team Season
        </h1>
        <p className="font-[family-name:var(--font-display)] text-[17px] text-white/60 italic max-w-[300px]">
          Long after the scores are forgotten, the moments remain.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 w-full max-w-[360px] animate-fade-in"
      >
        <h2 className="font-[family-name:var(--font-display)] text-[22px] font-bold text-brand text-center mb-5">
          {isSignUp ? 'Create Account' : 'Welcome Back'}
        </h2>

        {error && (
          <div className="bg-red-50 text-red-800 px-3.5 py-2.5 text-[13px] mb-4 border-l-[3px] border-red-800">
            {error}
          </div>
        )}

        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mb-3.5"
        />

        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="mb-5"
        />

        <Button size="full" type="submit" disabled={loading}>
          {loading ? '...' : isSignUp ? 'Get Started' : 'Sign In'}
        </Button>

        <p className="text-center mt-4 text-sm text-muted">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <span
            onClick={() => { setIsSignUp(!isSignUp); setError('') }}
            className="text-brand font-semibold cursor-pointer"
          >
            {isSignUp ? 'Sign in' : 'Sign up'}
          </span>
        </p>
      </form>
    </div>
  )
}
