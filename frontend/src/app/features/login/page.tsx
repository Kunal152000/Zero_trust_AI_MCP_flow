'use client';

import { z } from 'zod';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// ── Schemas ───────────────────────────────────────────────────────────────────
const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const SignupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:3000';

// ── Inline SVG icons ──────────────────────────────────────────────────────────
function ShieldIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

// ── Reusable input ────────────────────────────────────────────────────────────
function Field({
  id, label, type = 'text', value, onChange, placeholder,
}: {
  id: string; label: string; type?: string;
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={isPassword ? 'current-password' : id}
          required
          className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition pr-10"
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AuthPage() {
  const router = useRouter();
  const [view, setView] = useState<'login' | 'signup'>('login');

  // Form state
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  function switchView(next: 'login' | 'signup') {
    setView(next);
    setError(null);
    setName(''); setEmail(''); setPassword('');
  }

  // ── Handlers ────────────────────────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = LoginSchema.safeParse({ email, password });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Validation error'); return; }

    setLoading(true);
    try {
      const res = await fetch(`${GATEWAY}/auth/login`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Login failed'); return; }
      localStorage.setItem('access_token', data.accessToken);
      router.push('/features/dashboard');
    } catch { setError('Network error — is the gateway running?'); }
    finally { setLoading(false); }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = SignupSchema.safeParse({ name, email, password });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Validation error'); return; }

    setLoading(true);
    try {
      const res = await fetch(`${GATEWAY}/auth/signup`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Signup failed'); return; }
      localStorage.setItem('access_token', data.accessToken);
      router.push('/features/dashboard');
    } catch { setError('Network error — is the gateway running?'); }
    finally { setLoading(false); }
  }

  function handleGoogle() {
    window.location.href = `${GATEWAY}/auth/google`;
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl flex rounded-2xl shadow-2xl overflow-hidden">

        {/* ── LEFT PANEL ── */}
        <div className="hidden md:flex flex-col items-center justify-center w-2/5 bg-slate-800 px-10 py-14 text-white text-center">
          {/* Brand mark */}
          <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg mb-6">
            <ShieldIcon />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">MCP Gateway</h1>
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mt-1 mb-10">
            Zero-Trust Orchestrator
          </p>

          {view === 'login' ? (
            <>
              <p className="text-slate-300 text-sm mb-2">Don&apos;t have an account?</p>
              <p className="text-white font-semibold text-lg mb-6">Join us today</p>
              <button
                id="switch-to-signup"
                onClick={() => switchView('signup')}
                className="w-full py-2.5 px-6 rounded-full border-2 border-white/40 text-white text-sm font-semibold hover:bg-white/10 transition"
              >
                SIGN UP
              </button>
            </>
          ) : (
            <>
              <p className="text-slate-300 text-sm mb-2">Already have an account?</p>
              <p className="text-white font-semibold text-lg mb-6">Welcome back!</p>
              <button
                id="switch-to-login"
                onClick={() => switchView('login')}
                className="w-full py-2.5 px-6 rounded-full border-2 border-white/40 text-white text-sm font-semibold hover:bg-white/10 transition"
              >
                LOG IN
              </button>
            </>
          )}
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="flex-1 bg-white px-10 py-12 flex flex-col justify-center">

          {/* Mobile view toggle tabs */}
          <div className="flex md:hidden mb-8 rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => switchView('login')}
              className={`flex-1 py-2.5 text-sm font-semibold transition ${view === 'login' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Log In
            </button>
            <button
              onClick={() => switchView('signup')}
              className={`flex-1 py-2.5 text-sm font-semibold transition ${view === 'signup' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Sign Up
            </button>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1">
            {view === 'login' ? 'Welcome back' : 'Create account'}
          </h2>
          <p className="text-sm text-slate-500 mb-7">
            {view === 'login'
              ? 'Sign in to access your admin panel.'
              : 'Fill in your details to get started.'}
          </p>

          {/* Error */}
          {error && (
            <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* ── LOGIN FORM ── */}
          {view === 'login' && (
            <form id="login-form" onSubmit={handleLogin} className="flex flex-col gap-4">
              <Field id="email" label="Email address" type="email" value={email} onChange={setEmail} placeholder="you@company.com" />
              <Field id="password" label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" />

              <button
                id="login-submit"
                type="submit"
                disabled={loading}
                className="mt-1 w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>

              <div className="relative flex items-center gap-3 my-1">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400 shrink-0">or continue with</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              <button
                id="google-login"
                type="button"
                onClick={handleGoogle}
                className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 transition"
              >
                <GoogleIcon />
                Sign in with Google
              </button>
            </form>
          )}

          {/* ── SIGNUP FORM ── */}
          {view === 'signup' && (
            <form id="signup-form" onSubmit={handleSignup} className="flex flex-col gap-4">
              <Field id="name" label="Full name" type="text" value={name} onChange={setName} placeholder="Jane Smith" />
              <Field id="signup-email" label="Email address" type="email" value={email} onChange={setEmail} placeholder="you@company.com" />
              <Field id="signup-password" label="Password" type="password" value={password} onChange={setPassword} placeholder="Min. 8 characters" />

              <button
                id="signup-submit"
                type="submit"
                disabled={loading}
                className="mt-1 w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating account…' : 'Create Account'}
              </button>

              <div className="relative flex items-center gap-3 my-1">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400 shrink-0">or sign up with</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              <button
                id="google-signup"
                type="button"
                onClick={handleGoogle}
                className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 transition"
              >
                <GoogleIcon />
                Sign up with Google
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
