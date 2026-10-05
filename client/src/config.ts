// =============================================================================
// HIREBYMINUTES — SAFE FRONTEND CONFIGURATION
// =============================================================================
// In Vite, only variables prefixed with VITE_ are exposed to client-side code.
// No backend secrets (DATABASE_URL, JWT_SECRET, RAZORPAY_KEY_SECRET, RESEND_API_KEY)
// are exposed or bundled here.
// =============================================================================

/**
 * Normalizes the API Base URL so it always ends with /api (without trailing slash)
 */
export function getApiBaseUrl(): string {
  const envUrl = (
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_URL ||
    ''
  ).trim();

  if (envUrl) {
    const cleanUrl = envUrl.replace(/\/+$/, '');
    return cleanUrl.endsWith('/api') ? cleanUrl : `${cleanUrl}/api`;
  }

  // Development fallback
  if (typeof window !== 'undefined') {
    // If running on localhost or 127.0.0.1, use Vite proxy or direct port 5000
    return '/api';
  }

  return 'http://localhost:5000/api';
}

/**
 * Returns the WebSocket / Socket.IO host URL (without /api suffix)
 */
export function getSocketBaseUrl(): string {
  const envUrl = (
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_URL ||
    ''
  ).trim();

  if (envUrl) {
    const clean = envUrl.replace(/\/+$/, '');
    return clean.replace(/\/api$/, '');
  }

  if (typeof window !== 'undefined') {
    if (window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')) {
      return 'http://localhost:5000';
    }
    return window.location.origin;
  }

  return 'http://localhost:5000';
}

export const API_BASE_URL = getApiBaseUrl();
export const SOCKET_BASE_URL = getSocketBaseUrl();
