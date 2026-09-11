import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { ToastNotification } from './components/common/ToastNotification';
import { CustomCursor } from './components/common/CustomCursor';
import { BrandedLoadingScreen } from './components/common/BrandedLoadingScreen';
import { ProtectedRoute } from './components/common/ProtectedRoute';

import { HomePage } from './pages/HomePage';
import { ServicesPage } from './pages/ServicesPage';
import { ServiceDetailPage } from './pages/ServiceDetailPage';
import { SessionPage } from './pages/SessionPage';
import { ClientDashboardPage } from './pages/ClientDashboardPage';
import { ProviderDashboardPage } from './pages/ProviderDashboardPage';
import { ProviderOnboardingPage } from './pages/ProviderOnboardingPage';
import { OpportunitiesPage } from './pages/OpportunitiesPage';
import { AdminPage } from './pages/AdminPage';
import { AuthPage } from './pages/AuthPage';
import { EditProfilePage } from './pages/EditProfilePage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';

// Legal & Information Pages
import { AboutPage } from './pages/AboutPage';
import { HowItWorksPage } from './pages/HowItWorksPage';
import { TermsPage } from './pages/TermsPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { RefundPolicyPage } from './pages/RefundPolicyPage';
import { ExpertPolicyPage } from './pages/ExpertPolicyPage';
import { AcceptableUsePage } from './pages/AcceptableUsePage';
import { ContactPage } from './pages/ContactPage';

const AppRoutes: React.FC = () => {
  const { authInitialized, loading } = useAuth();
  const location = useLocation();

  // While auth state is restoring from stored credentials, show minimal branded loader
  if (!authInitialized || loading) {
    return <BrandedLoadingScreen />;
  }

  const isFullHeightRoute = location.pathname.startsWith('/admin') || location.pathname.startsWith('/session/');

  return (
    <div className="flex flex-col min-h-screen relative overflow-x-hidden selection:bg-lightblue selection:text-midnight bg-aliceblue text-midnight font-sans">
      <CustomCursor />
      {/* Universal Global Header: 100% Identical on Landing Page, Marketplace, Profile, and Admin Dashboard */}
      <Header />
      
      <main className="flex-1 relative z-10 flex flex-col">
        <Routes>
          {/* Core Platform Routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/services/:id" element={<ServiceDetailPage />} />
          <Route path="/opportunities" element={<OpportunitiesPage />} />

          {/* Legal & Informational Routes */}
          <Route path="/about" element={<AboutPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/refund-policy" element={<RefundPolicyPage />} />
          <Route path="/expert-policy" element={<ExpertPolicyPage />} />
          <Route path="/acceptable-use" element={<AcceptableUsePage />} />
          <Route path="/contact" element={<ContactPage />} />

          {/* Protected Live Session & Client Dashboard */}
          <Route
            path="/session/:id"
            element={
              <ProtectedRoute>
                <SessionPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/client"
            element={
              <ProtectedRoute requiredRole="client">
                <ClientDashboardPage />
              </ProtectedRoute>
            }
          />

          {/* Provider Routes */}
          <Route
            path="/provider"
            element={
              <ProtectedRoute requiredRole="provider">
                <ProviderDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/provider/onboard"
            element={
              <ProtectedRoute>
                <ProviderOnboardingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/provider/new-service"
            element={
              <ProtectedRoute requiredRole="provider">
                <ProviderOnboardingPage />
              </ProtectedRoute>
            }
          />

          {/* Profile Management */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <EditProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/edit"
            element={
              <ProtectedRoute>
                <EditProfilePage />
              </ProtectedRoute>
            }
          />

          {/* Administrative Control Center */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminPage />
              </ProtectedRoute>
            }
          />

          {/* Authentication & Password Reset */}
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Catch-all fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {!isFullHeightRoute && <Footer />}
      <ToastNotification />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <AppRoutes />
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
