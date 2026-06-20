import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import SessionExpiredScreen from '@/components/SessionExpiredScreen';
import ThemeProvider from '@/components/ThemeProvider';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error) {
    console.error('ErrorBoundary caught:', error);
  }
  
  render() {
    if (this.state.hasError) {
      console.error('ErrorBoundary displaying error:', this.state.error?.message);
      return (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a1128',
          color: 'white',
          zIndex: 9999,
          fontSize: '14px'
        }}>
          <p style={{ color: '#d4a843', fontWeight: 'bold', marginBottom: '12px' }}>App Error</p>
          <div style={{
            width: '32px',
            height: '32px',
            border: '4px solid rgba(212,168,67,0.3)',
            borderTop: '4px solid #d4a843',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}></div>
          <p style={{ fontSize: '12px', marginTop: '12px', color: '#94a3b8', maxWidth: '80%', textAlign: 'center' }}>
            {this.state.error?.message || 'An error occurred'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '12px',
              padding: '8px 16px',
              background: '#d4a843',
              color: '#0a1128',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold'
            }}
          >
            Reload App
          </button>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      );
    }
    return this.props.children;
  }
}

import NotificationProvider from '@/components/notifications/NotificationProvider';
import NurseryDashboard from './pages/NurseryDashboard';
import NurseryMonitor from './pages/NurseryMonitor';
import MinimizedAppBar from '@/components/MinimizedAppBar';
import PWAInstaller from '@/components/PWAInstaller';
import WakeLock from '@/components/WakeLock';
import PocketMode from '@/components/PocketMode';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import { Toaster } from 'sonner';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => {
  if (!Layout) return <>{children}</>;
  try {
    return <Layout currentPageName={currentPageName}>{children}</Layout>;
  } catch (err) {
    console.error('Layout error:', err);
    return <>{children}</>;
  }
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  try {
    if (isLoadingPublicSettings || isLoadingAuth) {
      return (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a1128',
          zIndex: 9999
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            border: '4px solid rgba(212,168,67,0.3)',
            borderTop: '4px solid #d4a843',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}></div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      );
    }

    if (authError) {
      if (authError.type === 'user_not_registered') {
        return <UserNotRegisteredError />;
      } else {
        navigateToLogin();
        return (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0a1128',
            color: 'white',
            zIndex: 9999,
            gap: '16px'
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              border: '4px solid rgba(212,168,67,0.3)',
              borderTop: '4px solid #d4a843',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
            <p style={{ color: '#94a3b8', fontSize: '14px' }}>Redirecting to login...</p>
            <button
              onClick={navigateToLogin}
              style={{
                color: '#d4a843',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '12px',
                textDecoration: 'underline',
                marginTop: '8px'
              }}
            >
              Tap here if not redirected
            </button>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        );
      }
    }

    return (
      <ErrorBoundary>
        <MinimizedAppBar>
        <NotificationProvider>
          <ErrorBoundary>
            <WakeLock />
          </ErrorBoundary>
          <ErrorBoundary>
            <ServiceWorkerRegister />
          </ErrorBoundary>
          <ErrorBoundary>
            <PWAInstaller />
          </ErrorBoundary>
          <ErrorBoundary>
            <PocketMode />
          </ErrorBoundary>
          <Routes>
            <Route path="/" element={
              <LayoutWrapper currentPageName={mainPageKey}>
                <MainPage />
              </LayoutWrapper>
            } />
            {Object.entries(Pages).map(([path, Page]) => (
              <Route
                key={path}
                path={`/${path}`}
                element={
                  <LayoutWrapper currentPageName={path}>
                    <Page />
                  </LayoutWrapper>
                }
              />
            ))}
            <Route path="/NurseryDashboard" element={<LayoutWrapper currentPageName="NurseryDashboard"><NurseryDashboard /></LayoutWrapper>} />
            <Route path="/NurseryMonitor" element={<LayoutWrapper currentPageName="NurseryMonitor"><NurseryMonitor /></LayoutWrapper>} />
            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </NotificationProvider>
        </MinimizedAppBar>
      </ErrorBoundary>
    );
  } catch (err) {
    console.error('AuthenticatedApp rendering error:', err);
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a1128',
        color: 'white',
        zIndex: 9999
      }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#d4a843', fontWeight: 'bold', marginBottom: '12px' }}>Loading...</p>
          <div style={{
            width: '32px',
            height: '32px',
            border: '4px solid rgba(212,168,67,0.3)',
            borderTop: '4px solid #d4a843',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto'
          }}></div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }
};

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <NavigationTracker />
            <AuthenticatedApp />
          </Router>
          <Toaster richColors closeButton position="top-right" />
        </QueryClientProvider>
      </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;