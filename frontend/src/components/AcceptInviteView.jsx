import { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Building2,
  User,
  Mail,
  Lock,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import { apiRequest } from '../api';

export default function AcceptInviteView({ inviteToken, onAcceptSuccess, onSwitchToLogin }) {
  const [inviteInfo, setInviteInfo] = useState(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [infoError, setInfoError] = useState('');

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    const fetchInviteInfo = async () => {
      if (!inviteToken) {
        setInfoError('Missing invitation token.');
        setLoadingInfo(false);
        return;
      }
      try {
        const res = await apiRequest(`/api/team/invite-info/${encodeURIComponent(inviteToken)}`);
        setInviteInfo(res.invite);
      } catch (err) {
        setInfoError(err.message);
      } finally {
        setLoadingInfo(false);
      }
    };
    fetchInviteInfo();
  }, [inviteToken]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitting(true);
    try {
      const data = await apiRequest('/api/team/accept-invite', {
        method: 'POST',
        body: JSON.stringify({
          token: inviteToken,
          name: name.trim(),
          password,
        }),
      });
      localStorage.setItem('csn_access_token', data.accessToken);
      localStorage.setItem('csn_refresh_token', data.refreshToken);
      onAcceptSuccess(data.user, data.accessToken);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingInfo) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center text-sm">
        Validating invitation link...
      </div>
    );
  }

  if (infoError || !inviteInfo) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold">Invitation Unavailable</h1>
          <p className="text-sm text-slate-400">
            {infoError || 'This invitation link is invalid, revoked, or has expired.'}
          </p>
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm px-4 py-2.5 rounded-lg transition"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Join Workspace</h1>
            <p className="text-xs text-slate-400">Accept your CloudSoft Nexus team invite</p>
          </div>
        </div>

        <div className="mb-5 p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Building2 className="w-4 h-4 text-indigo-400 shrink-0" />
            <div className="truncate">
              <div className="text-xs text-slate-400">Workspace</div>
              <div className="text-sm font-semibold truncate">{inviteInfo.companyName}</div>
            </div>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-medium shrink-0">
            {inviteInfo.role}
          </span>
        </div>

        {submitError && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Invited Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={inviteInfo.email}
                disabled
                className="w-full bg-slate-950/60 border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-400 cursor-not-allowed"
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
                placeholder="Priya Sharma"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Create Password</label>
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
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-sm px-4 py-2.5 rounded-lg transition"
          >
            {submitting ? 'Activating Account...' : 'Accept Invite & Enter'}
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