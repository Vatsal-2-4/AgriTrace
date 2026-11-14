import React, { createContext, useContext, useState, useEffect } from 'react';
import WoolCloudLoader from '../components/WoolCloudLoader';
import { applyPageLanguage, getSavedLanguage, saveLanguage } from '../utils/languagePreference';

const AuthContext = createContext();
import { authenticateAccount, restoreAuthenticatedUser, DEMO_WORKSPACES, normalizeWorkspaceRole as normalizeRole } from '../utils/accountSession';

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => restoreAuthenticatedUser(localStorage));

  const [isLoading, setIsLoading] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [loadingText, setLoadingText] = useState('Authenticating AgriTrace session...');

  useEffect(() => {
    if (user) {
      localStorage.setItem('khetsetu_user', JSON.stringify(user));
      
      applyPageLanguage(user.preferredLanguage || 'en');
    } else {
      localStorage.removeItem('khetsetu_user');
      localStorage.removeItem('wooltrace_user');
      localStorage.removeItem('agritrace_access_token');
    }
  }, [user]);

  const login = async (identifier, password, expectedRole) => {
    setIsLoading(true);
    setLoadingText('Authenticating AgriTrace credentials...');
    const cleanId = (identifier || '').trim().toLowerCase();
    try {
      const session = await authenticateAccount(cleanId, password, expectedRole);
      const nextUser = { ...session.user, preferredLanguage: getSavedLanguage(cleanId, session.user.preferredLanguage || 'en') };
      // Store both before navigating so requests on the next workspace use the new token.
      localStorage.setItem('agritrace_access_token', session.accessToken);
      localStorage.setItem('khetsetu_user', JSON.stringify(nextUser));
      localStorage.removeItem('wooltrace_user');
      setUser(nextUser);
      return { success: true, user: nextUser };
    } catch (error) {
      return { success: false, message: error.message || 'Sign-in requires a connection to the account service.' };
    } finally { setIsLoading(false); }
  };

  const register = async (userData) => {
    setIsLoading(true);
    setLoadingText('Creating AgriTrace market profile...');
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          if (data.accessToken) localStorage.setItem('agritrace_access_token', data.accessToken);
          setUser({ ...data.user, role: normalizeRole(data.user.role) });
          setTimeout(() => setIsLoading(false), 400);
          return { success: true, user: { ...data.user, role: normalizeRole(data.user.role) } };
        }
      }
      const errorData = await response.json().catch(() => ({}));
      setIsLoading(false);
      return { success: false, message: errorData.error?.message || errorData.message || 'Account registration failed.' };
    } catch  {
      setIsLoading(false);
      return { success: false, message: 'Account registration requires a connection to the AgriTrace account service.' };
    }
  };

  const logout = () => {
    setIsLoggingOut(true);
    setLoadingText('Logging out of AgriTrace...');
    setTimeout(() => {
      setUser(null);
      localStorage.removeItem('khetsetu_user');
      localStorage.removeItem('agritrace_access_token');
      const host = window.location.hostname;
      document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${host};`;
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${host};`;
      window.location.href = '/';
    }, 750);
  };

  const switchRole = async (newRole) => {
    const identifier = DEMO_WORKSPACES[newRole];
    if (!identifier) return { success: false, message: 'Unknown workspace.' };
    if (!user?.email?.endsWith('@khetsetu.in')) {
      return { success: false, requiresLogin: true, message: 'Sign in with an account authorized for that workspace.' };
    }
    // Use the existing demo-account sign-in, never a client-only role change.
    return login(identifier, 'password123', newRole);
  };

  const updatePreferredLanguage = (language) => {
    if (!user) return;
    saveLanguage(user.email || user.mobile || user.id, language);
    applyPageLanguage(language);
    setUser({ ...user, preferredLanguage: language });
  };

  const updateMarketContactConsent = (consent) => {
    if (!user) return;
    setUser({ ...user, marketContactConsent: consent === true });
  };

  const hasRole = (allowedRoles) => {
    if (!user) return false;
    return allowedRoles.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isLoggingOut,
      login,
      register,
      logout,
      switchRole,
      updatePreferredLanguage,
      updateMarketContactConsent,
      hasRole
    }}>
      {(isLoading || isLoggingOut) && (
        <WoolCloudLoader 
          text={isLoggingOut ? 'Logging out of AgriTrace...' : loadingText}
          fullScreen={true} 
        />
      )}
      {children}
    </AuthContext.Provider>
  );
};
