const API_BASE = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? '/api' : 'http://localhost:5000/api');

const nativeFetch = typeof window !== 'undefined' ? window.fetch.bind(window) : globalThis.fetch;

// Bounded retry wrapper for Render Free cold starts (502, 503, 504) on idempotent requests
const fetch = async (input: RequestInfo | URL, init?: RequestInit & { retry?: boolean; maxRetries?: number }): Promise<Response> => {
  const method = (init?.method || 'GET').toUpperCase();
  const isIdempotent = method === 'GET' || method === 'HEAD';
  const shouldRetry = init?.retry !== false && (isIdempotent || init?.retry === true);
  const maxRetries = shouldRetry ? (init?.maxRetries ?? 2) : 0;

  let attempt = 0;
  while (true) {
    try {
      const response = await nativeFetch(input, init);
      const isTransient = response.status === 502 || response.status === 503 || response.status === 504;

      if (isTransient && attempt < maxRetries) {
        attempt++;
        const backoffMs = attempt * 1000;
        await new Promise(r => setTimeout(r, backoffMs));
        continue;
      }

      return response;
    } catch (networkErr: any) {
      if (shouldRetry && attempt < maxRetries) {
        attempt++;
        const backoffMs = attempt * 1000;
        await new Promise(r => setTimeout(r, backoffMs));
        continue;
      }
      throw networkErr;
    }
  }
};

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('hbm_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export const api = {
  // Auth
  getMe: async () => {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to get user profile');
    return res.json();
  },

  login: async (email: string, password?: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(data.error || 'Login failed');
      err.status = res.status;
      err.requires_verification = Boolean(data.requires_verification);
      err.email = data.email || email;
      throw err;
    }
    return data;
  },

  register: async (data: {
    email: string;
    password?: string;
    full_name: string;
    role: string;
    headline?: string;
    bio?: string;
    avatar_url?: string;
    username?: string;
  }) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const dataRes = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(dataRes.error || 'Registration failed');
      err.status = res.status;
      err.email_failed = Boolean(dataRes.email_failed);
      throw err;
    }
    return dataRes;
  },

  verifyEmailOtp: async (email: string, code: string) => {
    const res = await fetch(`${API_BASE}/auth/verify-email-otp`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ email, code })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Verification failed');
    }
    return res.json();
  },

  resendVerificationOtp: async (email?: string) => {
    const res = await fetch(`${API_BASE}/auth/resend-verification-otp`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ email })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to resend code');
    }
    return res.json();
  },

  changeUnverifiedEmail: async (old_email: string, new_email: string) => {
    const res = await fetch(`${API_BASE}/auth/change-unverified-email`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ old_email, new_email })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update email');
    }
    return res.json();
  },

  forgotPassword: async (email: string) => {
    const res = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to submit request');
    }
    return res.json();
  },

  resetPassword: async (data: { email: string; token: string; new_password: string }) => {
    const res = await fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Password reset failed');
    }
    return res.json();
  },

  testEmailDispatch: async (to?: string) => {
    const res = await fetch(`${API_BASE}/admin/test-email`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ to })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Test email failed');
    }
    return res.json();
  },

  // Profile Management & Avatar Upload
  uploadAvatar: async (file: File) => {
    const formData = new FormData();
    formData.append('photo', file);

    const token = localStorage.getItem('hbm_token');
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}/upload/avatar`, {
      method: 'POST',
      headers,
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to upload photo');
    }
    return res.json();
  },

  getMyProfile: async () => {
    const res = await fetch(`${API_BASE}/users/profile/me`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch profile');
    return res.json();
  },

  updateMyProfile: async (data: {
    full_name?: string;
    avatar_url?: string;
    bio?: string;
    headline?: string;
    location?: string;
    country?: string;
    state_region?: string;
    city?: string;
    area?: string;
    languages?: string[];
    skills?: string[];
    experience_years?: number;
    service_title?: string;
    service_description?: string;
    subcategory?: string;
    category_id?: string;
    price_per_minute?: number;
    available_now?: boolean;
  }) => {
    const res = await fetch(`${API_BASE}/users/profile/me`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update profile');
    }
    return res.json();
  },

  // Categories
  getCategories: async () => {
    const res = await fetch(`${API_BASE}/categories`);
    if (!res.ok) throw new Error('Failed to fetch categories');
    return res.json();
  },

  // Services & Experts
  getFeaturedServices: async () => {
    const res = await fetch(`${API_BASE}/services/featured`);
    if (!res.ok) throw new Error('Failed to fetch featured services');
    return res.json();
  },

  getServices: async (params?: Record<string, string | number | boolean>) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== '' && v !== 'all') {
          query.append(k, String(v));
        }
      });
    }
    const res = await fetch(`${API_BASE}/services?${query.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch services');
    return res.json();
  },

  getServiceById: async (id: string) => {
    const res = await fetch(`${API_BASE}/services/${id}`);
    if (!res.ok) throw new Error('Failed to fetch service detail');
    return res.json();
  },

  createService: async (data: {
    title: string;
    category_id: string;
    description: string;
    price_per_minute: number;
    skills: string[];
    languages: string[];
    experience_years: number;
    available_now: boolean;
  }) => {
    const res = await fetch(`${API_BASE}/services`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create service');
    }
    return res.json();
  },

  payListingFee: async (serviceId: string) => {
    const res = await fetch(`${API_BASE}/services/${serviceId}/pay-listing-fee`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to activate listing');
    }
    return res.json();
  },

  updateServiceStatus: async (serviceId: string, status: string) => {
    const res = await fetch(`${API_BASE}/services/${serviceId}/status`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Failed to update service status');
    return res.json();
  },

  // Consultation Requests (Approval-First Flow)
  createConsultationRequest: async (data: {
    service_id: string;
    duration_minutes: number;
    connect_type?: 'now' | 'scheduled';
    scheduled_start?: string;
    problem_description: string;
    attachments?: string[];
  }) => {
    const res = await fetch(`${API_BASE}/consultation-requests`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to submit consultation request');
    }
    return res.json();
  },

  getConsultationRequests: async (role?: 'client' | 'provider') => {
    const url = role ? `${API_BASE}/consultation-requests?role=${role}` : `${API_BASE}/consultation-requests`;
    const res = await fetch(url, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch consultation requests');
    return res.json();
  },

  getConsultationRequest: async (id: string) => {
    const res = await fetch(`${API_BASE}/consultation-requests/${id}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch consultation request');
    return res.json();
  },

  acceptConsultationRequest: async (id: string) => {
    const res = await fetch(`${API_BASE}/consultation-requests/${id}/accept`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to accept consultation request');
    }
    return res.json();
  },

  declineConsultationRequest: async (id: string) => {
    const res = await fetch(`${API_BASE}/consultation-requests/${id}/decline`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to decline consultation request');
    }
    return res.json();
  },

  payConsultationRequest: async (id: string) => {
    const res = await fetch(`${API_BASE}/consultation-requests/${id}/pay`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Payment failed');
    }
    return res.json();
  },

  createRazorpayOrder: async (requestId: string) => {
    const res = await fetch(`${API_BASE}/consultation-requests/${requestId}/create-razorpay-order`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create payment order');
    }
    return res.json();
  },

  verifyRazorpayPayment: async (requestId: string, paymentData: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => {
    const res = await fetch(`${API_BASE}/consultation-requests/${requestId}/verify-razorpay-payment`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(paymentData)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Payment signature verification failed');
    }
    return res.json();
  },

  createListingOrder: async (serviceId: string) => {
    const res = await fetch(`${API_BASE}/services/${serviceId}/create-listing-order`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create listing payment order');
    }
    return res.json();
  },

  verifyListingPayment: async (serviceId: string, paymentData: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => {
    const res = await fetch(`${API_BASE}/services/${serviceId}/verify-listing-payment`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(paymentData)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Listing payment verification failed');
    }
    return res.json();
  },

  // Legacy Bookings (for backward compatibility)
  createBooking: async (data: {
    service_id: string;
    duration_minutes: number;
    scheduled_start: string;
    notes?: string;
  }) => {
    const res = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create booking');
    }
    return res.json();
  },

  respondToBooking: async (bookingId: string, action: 'accept' | 'reject') => {
    const res = await fetch(`${API_BASE}/bookings/${bookingId}/respond`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ action })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to respond to booking');
    }
    return res.json();
  },

  // Sessions
  getSession: async (sessionId: string) => {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to get session');
    }
    return res.json();
  },

  getSessionIceServers: async (sessionId: string) => {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/ice-servers`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to get ICE servers');
    }
    return res.json();
  },

  getIceServers: async () => {
    const res = await fetch(`${API_BASE}/webrtc/ice-servers`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to get ICE servers');
    }
    return res.json();
  },

  startSession: async (sessionId: string) => {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/start`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to start session');
    }
    return res.json();
  },

  endSession: async (sessionId: string) => {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/end`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to conclude session');
    }
    return res.json();
  },

  createExtensionOrder: async (sessionId: string, additionalMinutes: number) => {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/create-extension-order`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ additional_minutes: additionalMinutes })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create extension order');
    }
    return res.json();
  },

  verifyExtensionPayment: async (sessionId: string, paymentData: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    additional_minutes: number;
  }) => {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/verify-extension-payment`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(paymentData)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Extension payment verification failed');
    }
    return res.json();
  },

  sendMessage: async (sessionId: string, content: string) => {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ content })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to send message');
    }
    return res.json();
  },
  uploadSessionFile: async (sessionId: string, file: File) => {
    const token = localStorage.getItem('hbm_token');
    const formData = new FormData();
    formData.append('file', file);

    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}/sessions/${sessionId}/upload`, {
      method: 'POST',
      headers,
      body: formData
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to upload file');
    }
    return res.json();
  },

  submitReview: async (sessionId: string, rating: number, comment: string) => {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/review`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ rating, comment })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to submit review');
    }
    return res.json();
  },

  // Dashboards
  getClientDashboard: async () => {
    const res = await fetch(`${API_BASE}/dashboards/client`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to load client dashboard');
    return res.json();
  },

  getProviderDashboard: async () => {
    const res = await fetch(`${API_BASE}/dashboards/provider`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to load provider dashboard');
    return res.json();
  },

  toggleProviderAvailability: async (available_now: boolean) => {
    const res = await fetch(`${API_BASE}/provider/toggle-availability`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ available_now })
    });
    if (!res.ok) throw new Error('Failed to update provider availability');
    return res.json();
  },

  // Opportunities
  getOpportunities: async () => {
    const res = await fetch(`${API_BASE}/opportunities`);
    if (!res.ok) throw new Error('Failed to fetch opportunities');
    return res.json();
  },

  postOpportunity: async (data: {
    title: string;
    category_id: string;
    description: string;
    duration_minutes: number;
    budget: number;
  }) => {
    const res = await fetch(`${API_BASE}/opportunities`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to post opportunity');
    }
    return res.json();
  },

  applyForOpportunity: async (opportunityId: string, data: {
    message: string;
    relevant_experience: string;
    proposed_rate?: number;
    availability: string;
  }) => {
    const res = await fetch(`${API_BASE}/opportunities/${opportunityId}/apply`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to apply');
    }
    return res.json();
  },

  createOpportunityApplicationOrder: async (opportunityId: string) => {
    const res = await fetch(`${API_BASE}/opportunities/${opportunityId}/create-application-order`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create application fee order');
    }
    return res.json();
  },

  verifyOpportunityApplicationPayment: async (opportunityId: string, data: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    message: string;
    relevant_experience: string;
    proposed_rate?: number;
    availability: string;
  }) => {
    const res = await fetch(`${API_BASE}/opportunities/${opportunityId}/verify-application-payment`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Application fee verification failed');
    }
    return res.json();
  },

  submitReport: async (data: { reported_type: string; reported_id: string; reported_name?: string; reason: string }) => {
    const res = await fetch(`${API_BASE}/reports`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to submit report');
    }
    return res.json();
  },

  // ==========================================
  // FIRST-CLASS ADMIN API METHODS
  // ==========================================
  getAdminStats: async () => {
    const res = await fetch(`${API_BASE}/admin/stats`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Admin access denied or stats unavailable');
    return res.json();
  },

  getAdminUsers: async (params?: { search?: string; role?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params) {
      if (params.search) query.append('search', params.search);
      if (params.role) query.append('role', params.role);
      if (params.status) query.append('status', params.status);
    }
    const res = await fetch(`${API_BASE}/admin/users?${query.toString()}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch admin users');
    return res.json();
  },

  getAdminUserDetails: async (id: string) => {
    const res = await fetch(`${API_BASE}/admin/users/${id}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch user details');
    return res.json();
  },

  verifyUser: async (userId: string, verified: boolean, rejection_reason?: string) => {
    const res = await fetch(`${API_BASE}/admin/users/${userId}/verify`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ verified, rejection_reason })
    });
    if (!res.ok) throw new Error('Verify user failed');
    return res.json();
  },

  suspendUser: async (userId: string, suspended: boolean) => {
    const res = await fetch(`${API_BASE}/admin/users/${userId}/suspend`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ suspended })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Suspend user failed');
    }
    return res.json();
  },

  changeUserRole: async (userId: string, role: string) => {
    const res = await fetch(`${API_BASE}/admin/users/${userId}/role`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ role })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Change role failed');
    }
    return res.json();
  },

  getAdminServices: async (params?: { search?: string; category?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params) {
      if (params.search) query.append('search', params.search);
      if (params.category) query.append('category', params.category);
      if (params.status) query.append('status', params.status);
    }
    const res = await fetch(`${API_BASE}/admin/services?${query.toString()}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch admin services');
    return res.json();
  },

  updateAdminServiceStatus: async (serviceId: string, status: string) => {
    const res = await fetch(`${API_BASE}/admin/services/${serviceId}/status`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Update service status failed');
    return res.json();
  },

  getAdminCategories: async () => {
    const res = await fetch(`${API_BASE}/admin/categories`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch admin categories');
    return res.json();
  },

  createCategory: async (data: { name: string; slug: string; icon?: string; description?: string; sort_order?: number }) => {
    const res = await fetch(`${API_BASE}/admin/categories`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Create category failed');
    return res.json();
  },

  updateCategory: async (id: string, data: { name: string; slug: string; icon?: string; description?: string; sort_order?: number }) => {
    const res = await fetch(`${API_BASE}/admin/categories/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Update category failed');
    return res.json();
  },

  toggleCategory: async (id: string) => {
    const res = await fetch(`${API_BASE}/admin/categories/${id}/toggle`, {
      method: 'PATCH',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Toggle category failed');
    return res.json();
  },

  getAdminBookings: async () => {
    const res = await fetch(`${API_BASE}/admin/bookings`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch bookings');
    return res.json();
  },

  cancelAdminBooking: async (id: string) => {
    const res = await fetch(`${API_BASE}/admin/bookings/${id}/cancel`, {
      method: 'PATCH',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Cancel booking failed');
    return res.json();
  },

  getAdminSessions: async () => {
    const res = await fetch(`${API_BASE}/admin/sessions`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch sessions');
    return res.json();
  },

  getAdminPayments: async () => {
    const res = await fetch(`${API_BASE}/admin/payments`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch payments');
    return res.json();
  },

  getAdminOpportunities: async () => {
    const res = await fetch(`${API_BASE}/admin/opportunities`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch admin opportunities');
    return res.json();
  },

  updateAdminOpportunity: async (id: string, data: any) => {
    const res = await fetch(`${API_BASE}/admin/opportunities/${id}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Update opportunity failed');
    return res.json();
  },

  getAdminApplications: async () => {
    const res = await fetch(`${API_BASE}/admin/applications`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch applications');
    return res.json();
  },

  updateAdminApplicationStatus: async (id: string, status: 'accepted' | 'rejected') => {
    const res = await fetch(`${API_BASE}/admin/applications/${id}/status`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Update application failed');
    return res.json();
  },

  getAdminVerifications: async () => {
    const res = await fetch(`${API_BASE}/admin/verifications`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch verifications');
    return res.json();
  },

  getAdminReports: async () => {
    const res = await fetch(`${API_BASE}/admin/reports`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch reports');
    return res.json();
  },

  updateAdminReport: async (id: string, status: string, action_taken?: string, admin_notes?: string) => {
    const res = await fetch(`${API_BASE}/admin/reports/${id}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status, action_taken, admin_notes })
    });
    if (!res.ok) throw new Error('Update report failed');
    return res.json();
  },

  createAdminCategory: async (data: { name: string; slug: string; icon?: string; description?: string; sort_order?: number }) => {
    const res = await fetch(`${API_BASE}/admin/categories`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create category');
    }
    return res.json();
  },

  updateAdminCategory: async (id: string, data: any) => {
    const res = await fetch(`${API_BASE}/admin/categories/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Update category failed');
    return res.json();
  },

  toggleAdminCategory: async (id: string) => {
    const res = await fetch(`${API_BASE}/admin/categories/${id}/toggle`, {
      method: 'PATCH',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Toggle category failed');
    return res.json();
  },

  getAdminAuditLogs: async () => {
    const res = await fetch(`${API_BASE}/admin/audit-logs`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch audit logs');
    return res.json();
  },

  getAdminSettings: async () => {
    const res = await fetch(`${API_BASE}/admin/settings`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch settings');
    return res.json();
  },

  updateAdminSettings: async (data: any) => {
    const res = await fetch(`${API_BASE}/admin/settings`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Update settings failed');
    return res.json();
  },

  changeAdminPassword: async (new_password: string) => {
    const res = await fetch(`${API_BASE}/admin/change-password`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ new_password })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Change password failed');
    }
    return res.json();
  },

  // Specialized Admin User & Resource Operations
  createAdminUser: async (data: any) => {
    const res = await fetch(`${API_BASE}/admin/users`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create user');
    }
    return res.json();
  },

  updateAdminUser: async (id: string, data: any) => {
    const res = await fetch(`${API_BASE}/admin/users/${id}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update user');
    }
    return res.json();
  },

  deleteAdminUser: async (id: string) => {
    const res = await fetch(`${API_BASE}/admin/users/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to delete user');
    }
    return res.json();
  },

  publishAdminService: async (id: string) => {
    const res = await fetch(`${API_BASE}/admin/services/${id}/publish`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Publish service failed');
    return res.json();
  },

  deleteAdminService: async (id: string) => {
    const res = await fetch(`${API_BASE}/admin/services/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Delete service failed');
    return res.json();
  },

  createAdminOpportunity: async (data: any) => {
    const res = await fetch(`${API_BASE}/admin/opportunities`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Create opportunity failed');
    }
    return res.json();
  },

  publishAdminOpportunity: async (id: string) => {
    const res = await fetch(`${API_BASE}/admin/opportunities/${id}/publish`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Publish opportunity failed');
    return res.json();
  },

  deleteAdminOpportunity: async (id: string) => {
    const res = await fetch(`${API_BASE}/admin/opportunities/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Delete opportunity failed');
    return res.json();
  },

  getAdminConsultationRequests: async () => {
    const res = await fetch(`${API_BASE}/admin/consultation-requests`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch consultation requests');
    return res.json();
  },

  getAdminEmailLogs: async () => {
    const res = await fetch(`${API_BASE}/admin/email-logs`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch email logs');
    return res.json();
  },

  getAdminNotificationLogs: async () => {
    const res = await fetch(`${API_BASE}/admin/notification-logs`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch notification logs');
    return res.json();
  },

  // Registration Fee & Campaign Management
  getRegistrationFee: async () => {
    const res = await fetch(`${API_BASE}/platform/registration-fee`);
    if (!res.ok) throw new Error('Failed to fetch registration fee');
    return res.json();
  },

  getAdminCampaigns: async () => {
    const res = await fetch(`${API_BASE}/admin/campaigns`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch campaigns');
    return res.json();
  },

  createAdminCampaign: async (data: {
    name: string;
    description?: string;
    fee_usd: number;
    start_time: string;
    end_time: string;
    is_active?: number;
  }) => {
    const res = await fetch(`${API_BASE}/admin/campaigns`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create campaign');
    }
    return res.json();
  },

  launchFree24hCampaign: async () => {
    const res = await fetch(`${API_BASE}/admin/campaigns/launch-free-24h`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to activate 24h launch promotion');
    }
    return res.json();
  },

  updateAdminCampaign: async (id: string, data: {
    is_active?: number;
    status?: string;
    fee_usd?: number;
    name?: string;
    description?: string;
    end_time?: string;
  }) => {
    const res = await fetch(`${API_BASE}/admin/campaigns/${id}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update campaign');
    }
    return res.json();
  },

  updateAdminListingFee: async (listing_fee_usd: number) => {
    const res = await fetch(`${API_BASE}/admin/settings/listing-fee`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ listing_fee_usd })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update base listing fee');
    }
    return res.json();
  }
};
