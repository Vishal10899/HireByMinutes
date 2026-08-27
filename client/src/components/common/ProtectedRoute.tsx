import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { BrandedLoadingScreen } from './BrandedLoadingScreen';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'provider' | 'client';
  redirectTo?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRole,
  redirectTo
}) => {
  const { user, loading, authInitialized } = useAuth();
  const location = useLocation();

  // 1. While auth state is initializing from stored token / session, show branded loading screen
  if (!authInitialized || loading) {
    return <BrandedLoadingScreen />;
  }

  // 2. Unauthenticated: Redirect to login/auth while preserving intended destination
  if (!user) {
    const target = redirectTo || `/auth?redirect=${encodeURIComponent(location.pathname + location.search)}`;
    return <Navigate to={target} replace />;
  }

  // 3. Admin-only Route Check: Server-authoritative role verification
  if (requiredRole === 'admin' && user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  // 4. Provider-only Route Check
  if (requiredRole === 'provider' && user.role !== 'provider' && user.role !== 'admin') {
    return <Navigate to="/provider/onboard" replace />;
  }

  // 5. Client-only Route Check
  if (requiredRole === 'client' && user.role !== 'client' && user.role !== 'admin') {
    return <Navigate to="/provider" replace />;
  }

  return <>{children}</>;
};
export default ProtectedRoute;
