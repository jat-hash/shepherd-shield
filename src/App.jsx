import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import NotificationProvider from '@/components/notifications/NotificationProvider';
import PWAInstaller from '@/components/PWAInstaller';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import { Toaster } from 'sonner';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      return (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0a1128] text-white gap-6 p-8">
          <div className="text-5xl">🔒</div>
          <div className="text-center">
            <h2 className="text-xl font-bold mb-2">Session Expired</h2>
            <p className="text-slate-400 text-sm">Your session has ended. Please log in again to continue.</p>
          </div>
          <button
            onClick={navigateToLogin}
            className="bg-[#d4a843] text-[#0a1128] font-bold px-8 py-3 rounded-lg text-base hover:bg-[#e0bb5e] transition-colors"
          >
            Log In
          </button>
        </div>
      );
    }
  }

  return (
    <NotificationProvider>
      <ServiceWorkerRegister />
      <PWAInstaller />
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
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <AuthenticatedApp />
        </Router>
        <Toaster richColors closeButton position="top-right" />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;