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

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error) {
    console.error('Error boundary caught:', error);
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0a1128] text-white">
          <p className="text-lg font-bold mb-4">Loading...</p>
          <div className="w-8 h-8 border-4 border-[#d4a843]/30 border-t-[#d4a843] rounded-full animate-spin"></div>
        </div>
      );
    }
    return this.props.children;
  }
}

import NotificationProvider from '@/components/notifications/NotificationProvider';
import PWAInstaller from '@/components/PWAInstaller';
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
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, checkAppState } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0a1128]">
        <div className="w-8 h-8 border-4 border-[#d4a843]/30 border-t-[#d4a843] rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else {
      // auth_required — redirect to login
      navigateToLogin();
      // Show spinner while redirect happens (Safari may delay)
      return (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0a1128] gap-4">
          <div className="w-8 h-8 border-4 border-[#d4a843]/30 border-t-[#d4a843] rounded-full animate-spin"></div>
          <p className="text-slate-400 text-sm">Redirecting to login...</p>
          <button
            onClick={navigateToLogin}
            className="text-[#d4a843] text-sm underline mt-2"
          >Tap here if not redirected</button>
        </div>
      );
    }
  }

  return (
    <NotificationProvider>
      <ServiceWorkerRegister />
      <PWAInstaller />
      <PocketMode />
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
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </NotificationProvider>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <NavigationTracker />
            <AuthenticatedApp />
          </Router>
          <Toaster richColors closeButton position="top-right" />
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;