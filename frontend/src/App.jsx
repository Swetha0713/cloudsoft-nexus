import { useEffect, useState } from 'react';
import { apiRequest } from './api';
import LoginView from './components/LoginView';
import Dashboard from './components/Dashboard';

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('csn_access_token'));
  const [checking, setChecking] = useState(true);

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

  const handleLogout = () => {
    localStorage.removeItem('csn_access_token');
    localStorage.removeItem('csn_refresh_token');
    setUser(null);
    setToken(null);
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center text-sm">
        Loading CloudSoft Nexus...
      </div>
    );
  }

  if (!user) {
    return (
      <LoginView
        onLoginSuccess={(loggedInUser, accessToken) => {
          setUser(loggedInUser);
          setToken(accessToken);
        }}
      />
    );
  }

  return <Dashboard user={user} token={token} onLogout={handleLogout} />;
}