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

  useEffect(() => {
    // Small delay on initial load so the SDK can hydrate its stored token
    setTimeout(checkAppState, 300);
    
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const now = Date.now();
        if (now - lastCheckTimeRef.current > 3000) {
          lastCheckTimeRef.current = now;
          checkAppState();
        }
      }
    };

    // On mobile, retry auth when coming back online
    const handleOnline = () => {
      const now = Date.now();
      if (now - lastCheckTimeRef.current > 3000) {
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
    // If offline, skip auth checks and let the app load with cached data
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
      const publicSettings = resp.ok ? await resp.json() : null;

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
        // For auth errors or unknown, fall through to checkUserAuth
      }

      await checkUserAuth();
      setIsLoadingPublicSettings(false);
    } catch (error) {
      console.error('App state check failed:', error);
      // Network error - try auth anyway
      await checkUserAuth();
      setIsLoadingPublicSettings(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);
      setIsLoadingAuth(false);
    } catch (error) {
      console.error('User auth check failed:', error);
      // Keep isLoadingAuth=true during retries so Safari users don't see a broken state
      setIsAuthenticated(false);

      let retryCount = 0;
      const maxRetries = 4;
      const delays = [1000, 2000, 3000, 4000];
      const retryAuth = async () => {
        try {
          const retryUser = await base44.auth.me();
          setUser(retryUser);
          setIsAuthenticated(true);
          setAuthError(null);
          setIsLoadingAuth(false);
        } catch {
          retryCount++;
          if (retryCount < maxRetries) {
            setTimeout(retryAuth, delays[retryCount]);
          } else {
            // Still failing after all retries — show login screen
            setIsLoadingAuth(false);
            setAuthError({ type: 'auth_required', message: 'Authentication required' });
          }
        }
      };
      setTimeout(retryAuth, delays[0]);
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    
    if (shouldRedirect) {
      // Use the SDK's logout method which handles token cleanup and redirect
      base44.auth.logout(window.location.href);
    } else {
      // Just remove the token without redirect
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