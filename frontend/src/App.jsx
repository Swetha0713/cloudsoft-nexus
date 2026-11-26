import { useEffect, useState } from 'react';
import { apiRequest } from './api';
import LoginView from './components/LoginView';
import RegisterTenantView from './components/RegisterTenantView';
import Dashboard from './components/Dashboard';

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('csn_access_token'));
  const [checking, setChecking] = useState(true);
  const [authView, setAuthView] = useState(() =>
    window.location.pathname === '/register' ? 'register' : 'login'
  );

  useEffect(() => {
    const onPopState = () => {
      setAuthView(window.location.pathname === '/register' ? 'register' : 'login');
    };
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
    setAuthView(view);
    window.history.pushState({}, '', view === 'register' ? '/register' : '/');
  };

  const handleAuthSuccess = (loggedInUser, accessToken) => {
    setUser(loggedInUser);
    setToken(accessToken);
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

  if (!user) {
    return authView === 'register' ? (
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