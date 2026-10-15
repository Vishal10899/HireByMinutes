/**
 * HireByMinute — Safe Navigation & Open Redirect Prevention Utilities
 */

/**
 * Validates and sanitizes a return/redirect URL to prevent open redirect vulnerabilities.
 * Enforces that destinations are internal application paths only.
 * 
 * VALID:   /services/srv-455779a7, /jobs, /opportunities
 * INVALID: https://evil.example.com, //evil.com, javascript:..., /login, /signup
 * 
 * @param rawUrl Raw URL parameter from query string or location state
 * @returns Safe relative application path or null
 */
export function getSafeReturnUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();

  // Must begin with a single slash and not protocol-relative double slash '//'
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return null;
  }

  // Reject backslash tricks like '/\evil.com'
  if (trimmed.includes('\\')) {
    return null;
  }

  // Reject URLs containing protocol prefixes
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return null;
  }

  // Prevent redirect loops back to authentication endpoints
  const lower = trimmed.toLowerCase();
  if (
    lower === '/auth' ||
    lower.startsWith('/auth?') ||
    lower === '/login' ||
    lower.startsWith('/login?') ||
    lower === '/signup' ||
    lower.startsWith('/signup?') ||
    lower === '/register' ||
    lower.startsWith('/register?') ||
    lower === '/forgot-password' ||
    lower === '/reset-password'
  ) {
    return null;
  }

  return trimmed;
}

/**
 * Returns the canonical default route for a user based on their role:
 * - Admin -> /admin
 * - Provider / Expert -> /provider
 * - Client / default -> /services
 */
export function getDefaultRouteForRole(role?: string | null): string {
  const cleanRole = (role || '').trim().toLowerCase();
  if (cleanRole === 'admin') return '/admin';
  if (cleanRole === 'provider') return '/provider';
  return '/services';
}

/**
 * Validates and resolves the appropriate post-login / post-auth destination based on user role and optional requested URL.
 * Enforces role-based boundaries:
 * - Provider accounts are never redirected to client services or client dashboard.
 * - Client accounts are never redirected to the provider dashboard.
 * - Non-admin accounts are never redirected to admin dashboards.
 * - Root ('/') or unspecified destinations fallback to the role-specific default route.
 * - Open redirects and auth redirect loops are strictly blocked.
 */
export function resolveRoleDestination(
  role: string | null | undefined,
  requestedUrl?: string | null | undefined
): string {
  const defaultRoute = getDefaultRouteForRole(role);
  const safeUrl = getSafeReturnUrl(requestedUrl);

  if (!safeUrl || safeUrl === '/') {
    return defaultRoute;
  }

  const cleanRole = (role || '').trim().toLowerCase();
  const lowerUrl = safeUrl.toLowerCase();

  // Non-admins cannot access /admin
  if (cleanRole !== 'admin' && (lowerUrl === '/admin' || lowerUrl.startsWith('/admin/') || lowerUrl.startsWith('/admin?'))) {
    return defaultRoute;
  }

  // Provider cannot be redirected to client services or client dashboard
  if (cleanRole === 'provider') {
    if (
      lowerUrl === '/services' ||
      lowerUrl.startsWith('/services/') ||
      lowerUrl.startsWith('/services?') ||
      lowerUrl === '/client' ||
      lowerUrl.startsWith('/client/') ||
      lowerUrl.startsWith('/client?')
    ) {
      return '/provider';
    }
  }

  // Client cannot be redirected to provider dashboard
  if (cleanRole === 'client' || !cleanRole) {
    if (
      lowerUrl === '/provider' ||
      lowerUrl.startsWith('/provider/') ||
      lowerUrl.startsWith('/provider?')
    ) {
      return '/services';
    }
  }

  return safeUrl;
}

const STORAGE_KEY_RETURN_TO = 'hbm_return_to';
const STORAGE_KEY_SERVICE_ID = 'hbm_intended_service_id';

/**
 * Safely persists intended destination in sessionStorage so it survives
 * tab switching (login <-> register) and multi-step OTP email verification.
 */
export function saveIntendedService(serviceId: string, customPath?: string): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  const path = customPath || `/services/${serviceId}`;
  const safe = getSafeReturnUrl(path);
  if (safe) {
    window.sessionStorage.setItem(STORAGE_KEY_RETURN_TO, safe);
    window.sessionStorage.setItem(STORAGE_KEY_SERVICE_ID, serviceId);
  }
}

/**
 * Retrieves and validates the intended return URL from sessionStorage.
 */
export function getStoredReturnUrl(): string | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY_RETURN_TO);
    return getSafeReturnUrl(raw);
  } catch {
    return null;
  }
}

/**
 * Clears stored intended service state after successful redirection.
 */
export function clearStoredReturnUrl(): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY_RETURN_TO);
    window.sessionStorage.removeItem(STORAGE_KEY_SERVICE_ID);
  } catch {}
}
