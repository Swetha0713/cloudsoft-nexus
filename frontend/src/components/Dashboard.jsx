import { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck,
  Rocket,
  AlertTriangle,
  FileText,
  LogOut,
  Plus,
  RefreshCw,
  Activity,
  CheckCircle2,
  Clock,
  Building2,
  Users,
  Copy,
  Check,
  Trash2,
  UserCheck,
  UserX,
  Link2,
  KeyRound,
} from 'lucide-react';
import { API_BASE, apiRequest } from '../api';
import ChangePasswordModal from './ChangePasswordModal';

const ALLOWED_TRANSITIONS = {
  Queued: ['Provisioning'],
  Provisioning: ['HealthCheck', 'Rollback'],
  HealthCheck: ['Live', 'Rollback'],
  Live: ['Rollback'],
  Rollback: ['Queued'],
};

const STATUS_BADGE = {
  Queued: 'bg-slate-700/60 text-slate-200 border-slate-600',
  Provisioning: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  HealthCheck: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  Live: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  Rollback: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  Open: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  InProgress: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  Escalated: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  Resolved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

const PIPELINE_STAGES = ['Queued', 'Provisioning', 'HealthCheck', 'Live'];

export default function Dashboard({ user, token, onLogout }) {
  const isSuperAdmin = user.role === 'SuperAdmin';
  const canManageTeam = ['SuperAdmin', 'TenantAdmin'].includes(user.role);
  const canOperate = ['SuperAdmin', 'TenantAdmin', 'Engineer'].includes(user.role);

  const [activeTab, setActiveTab] = useState('deployments');
  const [selectedTenant, setSelectedTenant] = useState('');
  const [tenants, setTenants] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [deployments, setDeployments] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [sseConnected, setSseConnected] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const [showDepForm, setShowDepForm] = useState(false);
  const [depForm, setDepForm] = useState({
    tenantId: '',
    serviceName: '',
    version: 'v1.0.0',
    environment: 'Staging',
  });

  const [showTicketForm, setShowTicketForm] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    tenantId: '',
    title: '',
    description: '',
    priority: 'P2',
  });

  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    tenantId: '',
    email: '',
    role: 'Engineer',
  });
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);

  const triggerToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4500);
  }, []);

  const fetchAllData = useCallback(async () => {
    try {
      const qs = isSuperAdmin && selectedTenant ? `?tenantId=${selectedTenant}` : '';

      const [analyticsRes, depRes, ticketRes, auditRes, tenantRes, membersRes, invitesRes] =
        await Promise.all([
          apiRequest(`/api/ops/analytics${qs}`),
          apiRequest(`/api/deployments${qs}`),
          apiRequest(`/api/tickets${qs}`),
          apiRequest(`/api/ops/audit-logs${qs}`),
          isSuperAdmin ? apiRequest('/api/ops/tenants') : Promise.resolve(null),
          canManageTeam ? apiRequest(`/api/team/members${qs}`) : Promise.resolve(null),
          canManageTeam ? apiRequest(`/api/team/invites${qs}`) : Promise.resolve(null),
        ]);

      setMetrics(analyticsRes.metrics);
      setDeployments(depRes.deployments);
      setTickets(ticketRes.tickets);
      setAuditLogs(auditRes.logs);
      if (tenantRes?.tenants) setTenants(tenantRes.tenants);
      if (membersRes?.members) setMembers(membersRes.members);
      if (invitesRes?.invites) setInvites(invitesRes.invites);
    } catch (err) {
      setError(err.message);
    }
  }, [isSuperAdmin, canManageTeam, selectedTenant]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  useEffect(() => {
    if (!token) return;
    const streamUrl = `${API_BASE}/api/ops/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(streamUrl);

    es.addEventListener('connected', () => setSseConnected(true));
    es.addEventListener('deployment_created', () => {
      triggerToast('Live Update: New deployment queued');
      fetchAllData();
    });
    es.addEventListener('deployment_updated', () => {
      triggerToast('Live Update: Deployment FSM stage transitioned');
      fetchAllData();
    });
    es.addEventListener('ticket_created', () => {
      triggerToast('Live Update: New incident ticket raised');
      fetchAllData();
    });
    es.addEventListener('ticket_updated', () => {
      triggerToast('Live Update: Ticket status updated');
      fetchAllData();
    });
    es.addEventListener('sla_breached', (e) => {
      const data = JSON.parse(e.data);
      triggerToast(`SLA BREACH ALERT: ${data.ticketCode} (${data.priority}) auto-escalated!`);
      fetchAllData();
    });
    es.onerror = () => setSseConnected(false);

    return () => es.close();
  }, [token, fetchAllData, triggerToast]);

  const handleTransition = async (id, nextStatus) => {
    setError('');
    try {
      await apiRequest(`/api/deployments/${id}/transition`, {
        method: 'PATCH',
        body: JSON.stringify({ nextStatus, note: `Moved to ${nextStatus} via portal` }),
      });
      await fetchAllData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateDeployment = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/api/deployments', {
        method: 'POST',
        body: JSON.stringify({
          ...depForm,
          tenantId: isSuperAdmin ? depForm.tenantId || selectedTenant || tenants[0]?._id : undefined,
        }),
      });
      setDepForm({ tenantId: '', serviceName: '', version: 'v1.0.0', environment: 'Staging' });
      setShowDepForm(false);
      await fetchAllData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({
          ...ticketForm,
          tenantId: isSuperAdmin
            ? ticketForm.tenantId || selectedTenant || tenants[0]?._id
            : undefined,
        }),
      });
      setTicketForm({ tenantId: '', title: '', description: '', priority: 'P2' });
      setShowTicketForm(false);
      await fetchAllData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleTicketStatus = async (id, status) => {
    setError('');
    try {
      await apiRequest(`/api/tickets/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await fetchAllData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateInvite = async (e) => {
    e.preventDefault();
    setError('');
    setGeneratedInviteUrl('');
    try {
      const res = await apiRequest('/api/team/invites', {
        method: 'POST',
        body: JSON.stringify({
          email: inviteForm.email.trim(),
          role: inviteForm.role,
          tenantId: isSuperAdmin
            ? inviteForm.tenantId || selectedTenant || tenants[0]?._id
            : undefined,
        }),
      });
      setGeneratedInviteUrl(res.inviteUrl);
      setCopiedUrl(false);
      setInviteForm({ tenantId: '', email: '', role: 'Engineer' });
      setShowInviteForm(false);
      triggerToast(`Invite link generated for ${res.invite.email}`);
      await fetchAllData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRevokeInvite = async (id) => {
    setError('');
    try {
      await apiRequest(`/api/team/invites/${id}`, { method: 'DELETE' });
      triggerToast('Invitation revoked');
      await fetchAllData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleMemberStatus = async (member) => {
    setError('');
    try {
      await apiRequest(`/api/team/members/${member._id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !member.isActive }),
      });
      triggerToast(`${member.name} ${member.isActive ? 'suspended' : 'reactivated'}`);
      await fetchAllData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCopyInviteUrl = async () => {
    if (!generatedInviteUrl) return;
    try {
      await navigator.clipboard.writeText(generatedInviteUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch {
      triggerToast('Copy failed — select and copy the link manually');
    }
  };

  const navTabs = [
    { id: 'deployments', label: 'Deployments (FSM)', icon: Rocket },
    { id: 'tickets', label: 'Incidents & SLA', icon: AlertTriangle },
    { id: 'audit', label: 'Audit Ledger', icon: FileText },
    ...(canManageTeam ? [{ id: 'team', label: 'Team & Invites', icon: Users }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight">CloudSoft Nexus</span>
                <span
                  className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border ${
                    sseConnected
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      sseConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                    }`}
                  />
                  {sseConnected ? 'SSE Live' : 'Connecting'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {user.tenant?.name || 'CloudSoft Workspace'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isSuperAdmin && (
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5">
                <Building2 className="w-4 h-4 text-slate-400" />
                <select
                  value={selectedTenant}
                  onChange={(e) => setSelectedTenant(e.target.value)}
                  className="bg-transparent text-xs text-slate-200 focus:outline-none"
                >
                  <option value="" className="bg-slate-900">All Tenants</option>
                  {tenants.map((t) => (
                    <option key={t._id} value={t._id} className="bg-slate-900">
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="text-right hidden sm:block">
              <div className="text-xs font-semibold">{user.name}</div>
              <div className="text-[11px] text-indigo-400">{user.role}</div>
            </div>

            <button
              onClick={fetchAllData}
              title="Refresh data"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              onClick={() => setShowPasswordModal(true)}
              title="Change password"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-indigo-600/20 hover:text-indigo-300 text-xs font-medium transition"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Security</span>
            </button>

            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-rose-600/20 hover:text-rose-300 text-xs font-medium transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {toast && (
          <div className="px-4 py-3 rounded-xl bg-indigo-500/15 border border-indigo-500/40 text-indigo-200 text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>{toast}</span>
          </div>
        )}

        {error && (
          <div className="px-4 py-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Total Deployments"
            value={metrics?.totalDeployments ?? '-'}
            sub={`${metrics?.liveDeployments ?? 0} Live in Prod`}
            icon={<Rocket className="w-5 h-5 text-indigo-400" />}
          />
          <KpiCard
            title="Active Incidents"
            value={metrics?.openTickets ?? '-'}
            sub={`${metrics?.totalTickets ?? 0} Total Tickets`}
            icon={<AlertTriangle className="w-5 h-5 text-amber-400" />}
          />
          <KpiCard
            title="SLA Breaches"
            value={metrics?.breachedTickets ?? '-'}
            sub="Auto-escalated by Worker"
            icon={<Clock className="w-5 h-5 text-rose-400" />}
          />
          <KpiCard
            title="SLA Compliance"
            value={metrics ? `${metrics.slaComplianceRate}%` : '-'}
            sub="Target ≥ 95%"
            icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
          <div className="flex flex-wrap gap-2">
            {navTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                    activeTab === tab.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {activeTab === 'deployments' && canOperate && (
            <button
              onClick={() => setShowDepForm((v) => !v)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition"
            >
              <Plus className="w-4 h-4" />
              New Deployment
            </button>
          )}

          {activeTab === 'tickets' && (
            <button
              onClick={() => setShowTicketForm((v) => !v)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition"
            >
              <Plus className="w-4 h-4" />
              Raise Incident
            </button>
          )}

          {activeTab === 'team' && canManageTeam && (
            <button
              onClick={() => setShowInviteForm((v) => !v)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition"
            >
              <Plus className="w-4 h-4" />
              Invite Member
            </button>
          )}
        </div>

        {activeTab === 'deployments' && (
          <div className="space-y-4">
            {showDepForm && canOperate && (
              <form
                onSubmit={handleCreateDeployment}
                className={`bg-slate-900 border border-slate-800 rounded-xl p-5 grid grid-cols-1 ${
                  isSuperAdmin ? 'md:grid-cols-5' : 'md:grid-cols-4'
                } gap-3 items-end`}
              >
                {isSuperAdmin && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Tenant</label>
                    <select
                      value={depForm.tenantId}
                      onChange={(e) => setDepForm({ ...depForm, tenantId: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                    >
                      {tenants.map((t) => (
                        <option key={t._id} value={t._id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Service Name</label>
                  <input
                    required
                    placeholder="auth-microservice"
                    value={depForm.serviceName}
                    onChange={(e) => setDepForm({ ...depForm, serviceName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Version</label>
                  <input
                    required
                    value={depForm.version}
                    onChange={(e) => setDepForm({ ...depForm, version: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Environment</label>
                  <select
                    value={depForm.environment}
                    onChange={(e) => setDepForm({ ...depForm, environment: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="Staging">Staging</option>
                    <option value="Production">Production</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg"
                >
                  Queue Release
                </button>
              </form>
            )}

            <div className="grid gap-4">
              {deployments.map((dep) => {
                const nextStates = ALLOWED_TRANSITIONS[dep.status] || [];
                return (
                  <div
                    key={dep._id}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-base">{dep.serviceName}</h3>
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                          {dep.version}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                          {dep.environment}
                        </span>
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${
                            STATUS_BADGE[dep.status] || ''
                          }`}
                        >
                          {dep.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        Tenant: <span className="text-slate-200">{dep.tenantId?.name}</span> •
                        Triggered by {dep.triggeredBy?.name || 'System'} • History:{' '}
                        {dep.stateHistory?.length || 0} transitions
                      </p>
                      <FsmPipeline status={dep.status} />
                    </div>

                    {canOperate && (
                      <div className="flex flex-wrap gap-2">
                        {nextStates.map((next) => (
                          <button
                            key={next}
                            onClick={() => handleTransition(dep._id, next)}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                              next === 'Rollback'
                                ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30'
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500'
                            }`}
                          >
                            Move → {next}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'tickets' && (
          <div className="space-y-4">
            {showTicketForm && (
              <form
                onSubmit={handleCreateTicket}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {isSuperAdmin && (
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Tenant</label>
                      <select
                        value={ticketForm.tenantId}
                        onChange={(e) => setTicketForm({ ...ticketForm, tenantId: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                      >
                        {tenants.map((t) => (
                          <option key={t._id} value={t._id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className={isSuperAdmin ? '' : 'md:col-span-2'}>
                    <label className="block text-xs text-slate-400 mb-1">Incident Title</label>
                    <input
                      required
                      placeholder="Database connection pool exhausted"
                      value={ticketForm.title}
                      onChange={(e) => setTicketForm({ ...ticketForm, title: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Priority (SLA)</label>
                    <select
                      value={ticketForm.priority}
                      onChange={(e) => setTicketForm({ ...ticketForm, priority: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="P1">P1 — Critical (30m SLA)</option>
                      <option value="P2">P2 — High (2h SLA)</option>
                      <option value="P3">P3 — Normal (24h SLA)</option>
                    </select>
                  </div>
                </div>
                <textarea
                  required
                  rows={2}
                  placeholder="Describe the incident impact..."
                  value={ticketForm.description}
                  onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg"
                >
                  Submit Incident
                </button>
              </form>
            )}

            <div className="grid gap-4">
              {tickets.map((t) => (
                <div
                  key={t._id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-indigo-400 font-semibold">
                        {t.ticketCode}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-800 font-semibold">
                        {t.priority}
                      </span>
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${
                          STATUS_BADGE[t.status] || ''
                        }`}
                      >
                        {t.status}
                      </span>
                      {t.slaBreached && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-rose-600 text-white font-semibold">
                          SLA BREACHED
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-sm">{t.title}</h3>
                    <p className="text-xs text-slate-400">{t.description}</p>
                    <p className="text-[11px] text-slate-500">
                      Tenant: {t.tenantId?.name} • SLA Deadline:{' '}
                      {new Date(t.slaDeadline).toLocaleString()}
                    </p>
                  </div>

                  {canOperate && (
                    <div className="flex flex-wrap gap-2">
                      {['InProgress', 'Escalated', 'Resolved'].map((st) => (
                        <button
                          key={st}
                          disabled={t.status === st}
                          onClick={() => handleTicketStatus(t._id, st)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition"
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Tenant</th>
                  <th className="px-4 py-3">Actor & Role</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {auditLogs.map((log) => (
                  <tr key={log._id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-medium">{log.tenantId?.name || 'System'}</td>
                    <td className="px-4 py-3">
                      {log.actorId?.name || 'Worker'}{' '}
                      <span className="text-indigo-400">({log.actorRole})</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-emerald-300">{log.action}</td>
                    <td className="px-4 py-3">
                      <AuditDetails details={log.details} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'team' && canManageTeam && (
          <div className="space-y-6">
            {generatedInviteUrl && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-emerald-300 text-xs font-semibold">
                  <Link2 className="w-4 h-4" />
                  Single-Use Invite Link Ready (Valid 72 Hours — Copy Now)
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    readOnly
                    value={generatedInviteUrl}
                    onFocus={(e) => e.target.select()}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={handleCopyInviteUrl}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition shrink-0"
                  >
                    {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedUrl ? 'Copied!' : 'Copy Link'}
                  </button>
                </div>
              </div>
            )}

            {showInviteForm && (
              <form
                onSubmit={handleCreateInvite}
                className={`bg-slate-900 border border-slate-800 rounded-xl p-5 grid grid-cols-1 ${
                  isSuperAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3'
                } gap-3 items-end`}
              >
                {isSuperAdmin && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Tenant</label>
                    <select
                      value={inviteForm.tenantId}
                      onChange={(e) => setInviteForm({ ...inviteForm, tenantId: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                    >
                      {tenants.map((t) => (
                        <option key={t._id} value={t._id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Teammate Email</label>
                  <input
                    type="email"
                    required
                    placeholder="engineer@company.com"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Role</label>
                  <select
                    value={inviteForm.role}
                    onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="Engineer">Engineer (Deploy & Resolve)</option>
                    <option value="ClientViewer">ClientViewer (Read & Raise Tickets)</option>
                    <option value="TenantAdmin">TenantAdmin (Full Workspace Admin)</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg"
                >
                  Generate Invite Link
                </button>
              </form>
            )}

            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-200">
                Workspace Members ({members.length})
              </h2>
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Name & Email</th>
                      <th className="px-4 py-3">Workspace</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {members.map((m) => {
                      const isSelf = m._id === user.id;
                      const isProtected = isSelf || m.role === 'SuperAdmin';
                      return (
                        <tr key={m._id} className="hover:bg-slate-800/30">
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-200">
                              {m.name} {isSelf && <span className="text-indigo-400">(You)</span>}
                            </div>
                            <div className="text-slate-400">{m.email}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-300">{m.tenantId?.name || '—'}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-medium">
                              {m.role}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded-full border font-medium ${
                                m.isActive !== false
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                  : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                              }`}
                            >
                              {m.isActive !== false ? 'Active' : 'Suspended'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {!isProtected ? (
                              <button
                                onClick={() => handleToggleMemberStatus(m)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                                  m.isActive !== false
                                    ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30'
                                    : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                }`}
                              >
                                {m.isActive !== false ? (
                                  <>
                                    <UserX className="w-3.5 h-3.5" />
                                    Suspend
                                  </>
                                ) : (
                                  <>
                                    <UserCheck className="w-3.5 h-3.5" />
                                    Activate
                                  </>
                                )}
                              </button>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-200">
                Pending Invitations ({invites.length})
              </h2>
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Invited Email</th>
                      <th className="px-4 py-3">Workspace</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Expires</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {invites.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                          No pending invitations. Click "Invite Member" to generate a link.
                        </td>
                      </tr>
                    ) : (
                      invites.map((inv) => (
                        <tr key={inv._id} className="hover:bg-slate-800/30">
                          <td className="px-4 py-3 font-medium text-slate-200">{inv.email}</td>
                          <td className="px-4 py-3 text-slate-300">{inv.tenantId?.name || '—'}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-medium">
                              {inv.role}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                            {new Date(inv.expiresAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleRevokeInvite(inv._id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Revoke
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {showPasswordModal && (
        <ChangePasswordModal
          onClose={() => setShowPasswordModal(false)}
          onPasswordChanged={() => {
            setShowPasswordModal(false);
            onLogout();
          }}
        />
      )}
    </div>
  );
}

function KpiCard({ title, value, sub, icon }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-start justify-between">
      <div>
        <p className="text-xs text-slate-400">{title}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        <p className="text-[11px] text-slate-500 mt-1">{sub}</p>
      </div>
      <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">{icon}</div>
    </div>
  );
}

function FsmPipeline({ status }) {
  const isRollback = status === 'Rollback';
  const activeIdx = PIPELINE_STAGES.indexOf(status);

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-2">
      {PIPELINE_STAGES.map((stage, idx) => {
        const isCompleted = !isRollback && activeIdx > idx;
        const isCurrent = !isRollback && activeIdx === idx;
        return (
          <div key={stage} className="flex items-center gap-1.5">
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                isCurrent
                  ? 'bg-indigo-600 text-white border-indigo-400'
                  : isCompleted
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-slate-950 text-slate-500 border-slate-800'
              }`}
            >
              {stage}
            </span>
            {idx < PIPELINE_STAGES.length - 1 && (
              <span className="text-slate-600 text-xs">→</span>
            )}
          </div>
        );
      })}
      {isRollback && (
        <span className="ml-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40">
          ↺ Rolled Back
        </span>
      )}
    </div>
  );
}

function AuditDetails({ details }) {
  const entries = Object.entries(details || {});
  if (entries.length === 0) return <span className="text-slate-500">—</span>;

  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([key, value]) => {
        const formatted =
          key.toLowerCase().includes('deadline') && value
            ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : String(value);
        return (
          <span
            key={key}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px]"
          >
            <span className="text-slate-500">{key}:</span>
            <span className="text-slate-200 font-medium">{formatted}</span>
          </span>
        );
      })}
    </div>
  );
}