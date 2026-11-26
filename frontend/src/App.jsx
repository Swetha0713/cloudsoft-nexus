import { useEffect, useState } from 'react';
import { apiRequest } from './api';
import LoginView from './components/LoginView';
import RegisterTenantView from './components/RegisterTenantView';
import AcceptInviteView from './components/AcceptInviteView';
import Dashboard from './components/Dashboard';

const getRouteState = () => {
  const path = window.location.pathname;
  if (path === '/join') {
    const params = new URLSearchParams(window.location.search);
    return { view: 'join', inviteToken: params.get('token') || '' };
  }
  if (path === '/register') {
    return { view: 'register', inviteToken: '' };
  }
  return { view: 'login', inviteToken: '' };
};

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('csn_access_token'));
  const [checking, setChecking] = useState(true);
  const [route, setRoute] = useState(getRouteState);

  useEffect(() => {
    const onPopState = () => setRoute(getRouteState());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const restoreSession = async () => {
      if (!token) {
        setChecking(false);
        return;
      }
      try {
        const res = await apiRequest('/api/auth/me');
        setUser(res.user);
      } catch {
        localStorage.removeItem('csn_access_token');
        localStorage.removeItem('csn_refresh_token');
        setToken(null);
      } finally {
        setChecking(false);
      }
    };
    restoreSession();
  }, [token]);

  const navigateAuth = (view) => {
    setRoute({ view, inviteToken: '' });
    window.history.pushState({}, '', view === 'register' ? '/register' : '/');
  };

  const handleAuthSuccess = (loggedInUser, accessToken) => {
    setUser(loggedInUser);
    setToken(accessToken);
    setRoute({ view: 'login', inviteToken: '' });
    window.history.pushState({}, '', '/');
  };

  const handleLogout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // Proceed with local cleanup even if token is already expired
    }
    localStorage.removeItem('csn_access_token');
    localStorage.removeItem('csn_refresh_token');
    setUser(null);
    setToken(null);
    navigateAuth('login');
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center text-sm">
        Loading CloudSoft Nexus...
      </div>
    );
  }

  if (route.view === 'join') {
    return (
      <AcceptInviteView
        inviteToken={route.inviteToken}
        onAcceptSuccess={handleAuthSuccess}
        onSwitchToLogin={() => navigateAuth('login')}
      />
    );
  }

  if (!user) {
    return route.view === 'register' ? (
      <RegisterTenantView
        onRegisterSuccess={handleAuthSuccess}
        onSwitchToLogin={() => navigateAuth('login')}
      />
    ) : (
      <LoginView
        onLoginSuccess={handleAuthSuccess}
        onSwitchToRegister={() => navigateAuth('register')}
      />
    );
  }

  return <Dashboard user={user} token={token} onLogout={handleLogout} />;
}