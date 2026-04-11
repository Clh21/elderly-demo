import React, { useState } from 'react';
import { ShieldCheck, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login(username, password);
      navigate('/', { replace: true });
    } catch (loginError) {
      setError(loginError.message || 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#e0f2fe,_#f8fafc_45%,_#e2e8f0)] px-4 py-12">
      <div className="mx-auto max-w-md rounded-[2rem] border border-white/70 bg-white/90 p-8 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur">
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-600">RBAC Login</p>
            <h1 className="text-2xl font-semibold text-slate-900">Resident Data Access</h1>
          </div>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">Username</span>
            <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4">
              <UserRound className="h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full bg-transparent px-3 py-4 text-sm text-slate-900 outline-none"
                placeholder="Enter your account"
                autoComplete="username"
              />
            </div>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-900 outline-none transition-colors focus:border-sky-400"
              placeholder="Enter your password"
              autoComplete="current-password"
            />
          </label>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-2xl bg-slate-900 px-4 py-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            Admin: admin / admin123
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;