import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { appParams } from '@/lib/app-params';
import { base44 } from '@/api/base44Client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);
  const lastCheckTimeRef = useRef(0);

  const isIOSorSafari = () => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    return isIOS || isSafari;
  };

  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setTimeout(checkAppState, isIOS ? 1500 : 300);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const now = Date.now();
        if (now - lastCheckTimeRef.current > 30000) {
          lastCheckTimeRef.current = now;
          checkAppState();
        }
      }
    };

    const handleOnline = () => {
      const now = Date.now();
      if (now - lastCheckTimeRef.current > 30000) {
        lastCheckTimeRef.current = now;
        checkAppState();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const checkAppState = async () => {
    if (!navigator.onLine) {
      if (appParams.token) {
        await checkUserAuth();
      } else {
        setIsLoadingAuth(false);
      }
      setIsLoadingPublicSettings(false);
      return;
    }

    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);

      const headers = { 'X-App-Id': appParams.appId };
      if (appParams.token) headers['Authorization'] = `Bearer ${appParams.token}`;
      const resp = await fetch(`/api/apps/public/prod/public-settings/by-id/${appParams.appId}`, { headers });
      let publicSettings = null;
      try { publicSettings = await resp.json(); } catch {}

      if (resp.ok) {
        setAppPublicSettings(publicSettings);
      } else {
        const reason = publicSettings?.extra_data?.reason;
        if (reason === 'user_not_registered') {
          setAuthError({ type: 'user_not_registered', message: 'User not registered for this app' });
          setIsLoadingPublicSettings(false);
          setIsLoadingAuth(false);
          return;
        }
      }

      await checkUserAuth();
      setIsLoadingPublicSettings(false);
    } catch (error) {
      console.error('App state check failed:', error);
      await checkUserAuth();
      setIsLoadingPublicSettings(false);
    }
  };

  const checkUserAuth = async (isRetry = false) => {
    try {
      if (!isRetry) setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);
      setIsLoadingAuth(false);
    } catch (error) {
      console.error('User auth check failed:', error);
      const status = error?.status || error?.response?.status;

      if (status === 401 || status === 403) {
        // Safari/iOS: token may not be hydrated yet after redirect — retry once before giving up
        if (!isRetry && isIOSorSafari()) {
          setTimeout(() => checkUserAuth(true), 2000);
          return;
        }
        setIsAuthenticated(false);
        setIsLoadingAuth(false);
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      } else if (status === 429) {
        // Rate limited — stop loading and retry in background
        setIsLoadingAuth(false);
        setTimeout(() => checkUserAuth(true), 8000);
      } else {
        // Network/unknown — keep spinner and retry
        setTimeout(async () => {
          try {
            const retryUser = await base44.auth.me();
            setUser(retryUser);
            setIsAuthenticated(true);
            setAuthError(null);
            setIsLoadingAuth(false);
          } catch {
            setIsAuthenticated(false);
            setIsLoadingAuth(false);
            setAuthError({ type: 'auth_required', message: 'Authentication required' });
          }
        }, 3000);
      }
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    if (shouldRedirect) {
      base44.auth.logout(window.location.href);
    } else {
      base44.auth.logout();
    }
  };

  const navigateToLogin = () => {
    base44.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      logout,
      navigateToLogin,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};