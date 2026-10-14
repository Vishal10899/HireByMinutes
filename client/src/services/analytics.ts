// =============================================================================
// HIREBYMINUTE — PRIVACY-PRESERVING CLIENT-SIDE GOOGLE ANALYTICS (GA4)
// =============================================================================
// Safely tracks page views and critical funnel conversion events without sending
// sensitive customer data, passwords, emails, or financial secrets.
// =============================================================================

declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
    GA_MEASUREMENT_ID?: string;
  }
}

// Authoritative Measurement ID resolution (Vite build-time env or runtime window injection)
export function getMeasurementId(): string | null {
  const envId = (import.meta.env.VITE_GA_MEASUREMENT_ID || '').trim();
  if (envId && /^G-[A-Z0-9]+$/i.test(envId)) {
    return envId;
  }
  if (typeof window !== 'undefined' && window.GA_MEASUREMENT_ID && /^G-[A-Z0-9]+$/i.test(window.GA_MEASUREMENT_ID)) {
    return window.GA_MEASUREMENT_ID;
  }
  return null;
}

let isInitialized = false;
let lastTrackedPath: string | null = null;
let lastTrackedTime = 0;

/**
 * Initializes Google Analytics gtag.js script if a valid Measurement ID is configured.
 */
export function initAnalytics(): boolean {
  if (typeof window === 'undefined') return false;
  if (isInitialized) return true;

  const measurementId = getMeasurementId();
  if (!measurementId) {
    // Measurement ID not configured; analytics gracefully disabled
    return false;
  }

  try {
    // Inject gtag.js script tag
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer?.push(arguments);
    };

    window.gtag('js', new Date());
    window.gtag('config', measurementId, {
      send_page_view: false, // Page views tracked manually via router hook to prevent duplicates
      anonymize_ip: true,
      cookie_flags: 'SameSite=None;Secure'
    });

    isInitialized = true;
    console.log(`[HireByMinute Analytics] GA4 initialized with ID: ${measurementId}`);
    return true;
  } catch (err) {
    console.warn('[HireByMinute Analytics] Initialization warning:', err);
    return false;
  }
}

/**
 * Strips sensitive PII, passwords, card numbers, and tokens from event parameters.
 */
function sanitizeParams(params: Record<string, any> = {}): Record<string, any> {
  const safe: Record<string, any> = {};
  const forbiddenPatterns = /password|secret|token|card|cvv|auth|hash|ssn|otp/i;

  for (const [k, v] of Object.entries(params)) {
    if (forbiddenPatterns.test(k)) continue;
    if (typeof v === 'string') {
      if (v.includes('@') && v.includes('.')) continue; // Mask email addresses
      safe[k] = v.slice(0, 100);
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      safe[k] = v;
    }
  }
  return safe;
}

/**
 * Tracks a page view with automatic debouncing against duplicate React route renders.
 */
export function trackPageView(path: string, title?: string): void {
  const now = Date.now();
  if (lastTrackedPath === path && now - lastTrackedTime < 1000) {
    return; // Prevent duplicate rapid firings
  }

  lastTrackedPath = path;
  lastTrackedTime = now;

  const measurementId = getMeasurementId();
  if (!measurementId || typeof window === 'undefined' || !window.gtag) return;

  window.gtag('event', 'page_view', {
    page_path: path,
    page_title: title || document.title,
    page_location: window.location.href
  });
}

/**
 * Dispatches a standard custom analytics event.
 */
export function trackEvent(eventName: string, params: Record<string, any> = {}): void {
  const measurementId = getMeasurementId();
  if (!measurementId || typeof window === 'undefined' || !window.gtag) return;

  const safeParams = sanitizeParams(params);
  window.gtag('event', eventName, safeParams);
}

// High-Value Conversion Funnel Events
export const analyticsFunnel = {
  trackRegistration: (role: string) => {
    trackEvent('sign_up', { method: 'email', user_role: role });
  },
  trackExpertDiscovery: (category?: string, searchTerm?: string) => {
    trackEvent('search', {
      search_term: searchTerm ? searchTerm.slice(0, 50) : undefined,
      service_category: category || 'all'
    });
  },
  trackConsultationRequest: (serviceId: string, durationMinutes: number) => {
    trackEvent('begin_checkout', {
      service_id: serviceId,
      duration_minutes: durationMinutes,
      currency: 'INR'
    });
  },
  trackPaymentSuccess: (paymentId: string, amountINR: number) => {
    trackEvent('purchase', {
      transaction_id: paymentId,
      value: amountINR,
      currency: 'INR'
    });
  }
};
