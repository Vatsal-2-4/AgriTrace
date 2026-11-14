import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Leaf, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import './AdminLogin.css';

export default function AdminLogin() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user?.role === 'ADMIN') return <Navigate to="/admin" replace />;
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('');
    const result = await login(identifier.trim(), password);
    setBusy(false);
    if (!result.success || result.user?.role !== 'ADMIN' || !localStorage.getItem('agritrace_access_token')) {
      setError('These credentials do not belong to an administrator account.');
      return;
    }
    navigate('/admin', { replace: true });
  };
  return <main className="admin-login"><section className="admin-login__card"><div className="admin-login__brand"><span><Leaf size={21}/></span><b>AgriTrace<small>ADMIN PORTAL</small></b></div><div className="admin-login__lock"><ShieldCheck size={22}/></div><h1>Administrator sign in</h1><p>Use your authorized administrator credentials to access the platform console.</p>{error&&<div className="admin-login__error" role="alert">{error}</div>}<form onSubmit={submit}><label>Email or mobile<input autoComplete="username" required value={identifier} onChange={e=>setIdentifier(e.target.value)} placeholder="Admin email or mobile"/></label><label>Password<input autoComplete="current-password" required type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter password"/></label><button disabled={busy}>{busy?'Verifying access…':<><LockKeyhole size={16}/> Sign in to admin portal</>}</button></form><small className="admin-login__secure">Admin role verification is required. Workspace previews do not grant access.</small></section></main>;
}
