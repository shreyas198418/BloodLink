import React, { useState } from 'react';
import { Lock, Mail, ShieldCheck, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { BloodDropLogo } from './LayoutShell.tsx';

export function LoginView() {
  const { loginWithCredentials, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setSubmitting(true);
    try {
      await loginWithCredentials(email.trim(), password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDemoLogin(demoEmail: string, demoPass: string) {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
    setSubmitting(true);
    try {
      await loginWithCredentials(demoEmail, demoPass);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Demo login failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleLogin() {
    setError(null);
    setSubmitting(true);
    try {
      await loginWithGoogle();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F4F6FA] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 bg-white rounded-2xl border border-[#E8EBF2] overflow-hidden shadow-sm">
        {/* Left Navy Clinical Operations Summary */}
        <div className="bg-[#101B3F] text-white p-8 sm:p-10 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3">
              <BloodDropLogo />
              <span className="font-display text-2xl font-bold tracking-tight">
                BloodLink
              </span>
            </div>
            <h1 className="mt-8 font-display text-2xl sm:text-3xl font-bold leading-snug text-white">
              Multi-Bank Blood Inventory & Priority Matching
            </h1>
            <p className="mt-3 text-sm text-slate-300 leading-relaxed">
              Coordinate regional blood reserves, screen compatible RBC donors, prioritize emergency hospital requests, and discover related clinical cases via pgvector semantic search.
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-[#17264F] space-y-3 text-xs text-slate-300">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 text-[#27AE75] shrink-0" aria-hidden="true" />
              <span>Role-based access control & atomic PostgreSQL inventory allocation</span>
            </div>
            <div className="flex items-center gap-2.5">
              <UserCheck className="h-4 w-4 text-[#E53945] shrink-0" aria-hidden="true" />
              <span>Configurable donor screening policy & ABO/Rh compatibility checks</span>
            </div>
          </div>
        </div>

        {/* Right Sign-In Form */}
        <div className="p-8 sm:p-10 flex flex-col justify-center">
          <h2 className="font-display text-xl font-bold text-[#202A44]">
            Sign in to BloodLink
          </h2>
          <p className="mt-1 text-sm text-[#7B8499]">
            Access restricted to authorized blood bank staff and network administrators.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-lg bg-[#FDEBEC] border border-[#E53945]/30 px-3.5 py-2.5 text-xs font-medium text-[#E53945]"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-semibold text-[#202A44] mb-1.5"
              >
                Work Email
              </label>
              <div className="relative">
                <Mail
                  className="h-4 w-4 text-[#7B8499] absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@bloodlink.org"
                  autoComplete="email"
                  className="w-full h-10 pl-9 pr-3 rounded-lg border border-[#E8EBF2] bg-white text-sm text-[#202A44] focus:outline-none focus:border-[#101B3F]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-[#202A44] mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <Lock
                  className="h-4 w-4 text-[#7B8499] absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  className="w-full h-10 pl-9 pr-3 rounded-lg border border-[#E8EBF2] bg-white text-sm text-[#202A44] focus:outline-none focus:border-[#101B3F]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-10 rounded-lg bg-[#E53945] hover:bg-[#cf2d38] disabled:opacity-60 text-sm font-semibold text-white transition-colors"
            >
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-4">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={submitting}
              className="w-full h-10 rounded-lg border border-[#E8EBF2] bg-white hover:bg-[#F4F6FA] text-sm font-medium text-[#202A44] transition-colors flex items-center justify-center gap-2"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.2 0 6-1.1 8-3l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5H1.2v3.1C3.2 21.3 7.3 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.2 14.2c-.2-.7-.4-1.5-.4-2.2s.1-1.5.4-2.2V6.7H1.2C.4 8.3 0 10.1 0 12s.4 3.7 1.2 5.3l4-3.1z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.5-3.5C18 1.1 15.2 0 12 0 7.3 0 3.2 2.7 1.2 6.7l4 3.1c1-2.9 3.7-5 6.8-5z"
                />
              </svg>
              Continue with Google
            </button>
          </div>

          <div className="mt-6 pt-5 border-t border-[#E8EBF2]">
            <p className="text-xs font-semibold text-[#7B8499] mb-2.5">
              Quick Demo Credentials (Development Only)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleDemoLogin('admin@bloodlink.org', 'Admin@1234')}
                disabled={submitting}
                className="px-3 py-2 rounded-lg border border-[#E8EBF2] bg-[#F4F6FA] hover:border-[#101B3F] text-left transition-colors"
              >
                <div className="text-xs font-semibold text-[#202A44]">Admin Account</div>
                <div className="text-[11px] text-[#7B8499] font-mono-tabular truncate">
                  admin@bloodlink.org
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleDemoLogin('staff.central@bloodlink.org', 'Staff@1234')}
                disabled={submitting}
                className="px-3 py-2 rounded-lg border border-[#E8EBF2] bg-[#F4F6FA] hover:border-[#101B3F] text-left transition-colors"
              >
                <div className="text-xs font-semibold text-[#202A44]">Central Staff</div>
                <div className="text-[11px] text-[#7B8499] font-mono-tabular truncate">
                  staff.central@bloodlink.org
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
