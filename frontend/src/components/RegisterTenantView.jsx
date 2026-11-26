import { useState } from 'react';
import { ShieldCheck, Building2, User, Mail, Lock, ArrowRight } from 'lucide-react';
import { apiRequest } from '../api';

export default function RegisterTenantView({ onRegisterSuccess, onSwitchToLogin }) {
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiRequest('/api/auth/register-tenant', {
        method: 'POST',
        body: JSON.stringify({
          companyName: companyName.trim(),
          name: name.trim(),
          email: email.trim(),
          password,
        }),
      });
      localStorage.setItem('csn_access_token', data.accessToken);
      localStorage.setItem('csn_refresh_token', data.refreshToken);
      onRegisterSuccess(data.user, data.accessToken);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Create Company Workspace</h1>
            <p className="text-xs text-slate-400">Launch your isolated CloudSoft Nexus tenant</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Company Name</label>
            <div className="relative">
              <Building2 className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Cloud Corp"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Your Full Name</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Rivera"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Work Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex@acmecloud.com"
                autoComplete="email"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="10+ chars, upper, lower, number, symbol"
                autoComplete="new-password"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-sm px-4 py-2.5 rounded-lg transition"
          >
            {loading ? 'Creating Workspace...' : 'Create Workspace'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-800 text-center text-xs text-slate-400">
          Already have an account?{' '}
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-indigo-400 hover:text-indigo-300 font-medium"
          >
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
}