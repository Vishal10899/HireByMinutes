export type UserRole = 'client' | 'provider' | 'admin';

export interface User {
  id: string;
  email: string;
  username?: string;
  full_name: string;
  role: UserRole;
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
  rating?: number;
  review_count?: number;
  sessions_completed?: number;
  verified?: number | boolean;
  email_verified?: number | boolean;
  response_time?: string;
  member_since?: string;
  created_at?: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  icon: string;
  description?: string;
  sort_order: number;
  active: number | boolean;
  service_count?: number;
  active_services_count?: number;
}

export interface Service {
  id: string;
  provider_id: string;
  title: string;
  subcategory?: string;
  category_id: string;
  category_name?: string;
  category_slug?: string;
  description: string;
  price_per_minute: number;
  listing_status: 'draft' | 'pending_payment' | 'active' | 'paused' | 'expired' | 'removed';
  listing_fee_paid: number;
  listing_fee_payment_id?: string;
  skills: string[];
  languages: string[];
  experience_years: number;
  available_now: number | boolean;
  country?: string;
  city?: string;
  state_region?: string;
  area?: string;
  provider_name?: string;
  provider_avatar?: string;
  provider_headline?: string;
  provider_bio?: string;
  provider_country?: string;
  provider_state_region?: string;
  provider_city?: string;
  provider_area?: string;
  provider_rating?: number;
  provider_review_count?: number;
  provider_verified?: number | boolean;
  provider_response_time?: string;
  sessions_completed?: number;
  total_session_minutes?: number;
  availability_status?: 'AVAILABLE NOW' | 'BUSY' | 'OFFLINE';
  created_at?: string;
}

export type ConsultationRequestStatus = 'PENDING_EXPERT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'PAID' | 'CANCELLED' | 'COMPLETED';

export interface ConsultationRequest {
  id: string;
  client_id: string;
  provider_id: string;
  service_id: string;
  service_title?: string;
  category_id?: string;
  client_name?: string;
  client_avatar?: string;
  client_email?: string;
  provider_name?: string;
  provider_avatar?: string;
  provider_email?: string;
  provider_headline?: string;
  duration_minutes: number;
  price_per_minute: number;
  total_price: number;
  connect_type: 'now' | 'scheduled';
  scheduled_start: string;
  problem_description: string;
  attachments?: string[];
  status: ConsultationRequestStatus;
  response_deadline: string;
  remaining_seconds?: number;
  accepted_at?: string;
  declined_at?: string;
  expired_at?: string;
  paid_at?: string;
  payment_id?: string;
  session_id?: string;
  created_at: string;
}

export type BookingStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED' | 'COMPLETED';

export interface Booking {
  id: string;
  client_id: string;
  provider_id: string;
  service_id: string;
  service_title?: string;
  client_name?: string;
  client_avatar?: string;
  provider_name?: string;
  provider_avatar?: string;
  duration_minutes: number;
  total_price: number;
  scheduled_start: string;
  scheduled_end: string;
  status: BookingStatus;
  payment_id?: string;
  notes?: string;
  session_id?: string;
  session_status?: SessionStatus;
  created_at: string;
}

export type SessionStatus = 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';

export interface Session {
  id: string;
  booking_id: string;
  client_id: string;
  provider_id: string;
  service_id: string;
  service_title?: string;
  price_per_minute?: number;
  client_name?: string;
  client_avatar?: string;
  provider_name?: string;
  provider_avatar?: string;
  provider_headline?: string;
  scheduled_start: string;
  scheduled_end: string;
  actual_start?: string;
  actual_end?: string;
  duration_minutes: number;
  status: SessionStatus;
  remainingSeconds?: number;
  canCommunicate?: boolean;
  total_price?: number;
  notes?: string;
  created_at: string;
}

export interface Message {
  id: string;
  session_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: UserRole;
  content: string;
  file_url?: string;
  file_name?: string;
  file_size?: number;
  created_at: string;
}

export interface Review {
  id: string;
  booking_id: string;
  session_id: string;
  client_id: string;
  client_name?: string;
  client_avatar?: string;
  provider_id: string;
  service_id: string;
  service_title?: string;
  rating: number;
  comment: string;
  created_at: string;
}

export interface Payment {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  type: 'listing_fee' | 'session_payment' | 'payout' | 'refund' | 'application_fee';
  amount: number;
  status: 'succeeded' | 'pending' | 'refunded';
  reference_id?: string;
  metadata_json?: string;
  created_at: string;
}

export interface Opportunity {
  id: string;
  creator_id: string;
  creator_name?: string;
  creator_avatar?: string;
  title: string;
  category_id: string;
  category_name?: string;
  description: string;
  duration_minutes: number;
  budget: number;
  status: 'open' | 'in_review' | 'awarded' | 'closed';
  applications_count?: number;
  created_at: string;
}

export interface Application {
  id: string;
  opportunity_id: string;
  provider_id: string;
  provider_name?: string;
  provider_avatar?: string;
  provider_headline?: string;
  message: string;
  relevant_experience: string;
  proposed_rate?: number;
  availability: string;
  status: 'pending' | 'accepted' | 'rejected';
  payment_id?: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'booking_request';
  read: number | boolean;
  link?: string;
  created_at: string;
}

export interface ProviderAvailability {
  id: string;
  provider_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: number | boolean;
}

export interface RegistrationCampaign {
  id: string;
  name: string;
  description?: string;
  fee_usd: number;
  start_time: string;
  end_time: string;
  is_active: number;
  status: 'scheduled' | 'active' | 'expired' | 'cancelled';
  created_by: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
  remaining_seconds?: number;
}

export interface RegistrationFeeResponse {
  fee: number;
  baseFee: number;
  isPromotionActive: boolean;
  activeCampaign: RegistrationCampaign | null;
  upcomingCampaigns?: RegistrationCampaign[];
  serverTime: string;
}

