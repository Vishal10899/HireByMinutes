import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { BrandLogo } from '../components/common/BrandLogo';
import { COUNTRIES } from '../data/geoData';
import { AdminContentErrorBoundary } from '../components/admin/AdminContentErrorBoundary';
import { AdminLoadingSkeleton } from '../components/admin/AdminLoadingSkeleton';
import { usePageSEO } from '../hooks/usePageSEO';

// PostgreSQL NUMERIC and currency safe normalization helpers
export const formatCurrency = (val: any): string => {
  if (val === null || val === undefined || val === '') return '0.00';
  const num = Number(val);
  return isNaN(num) ? '0.00' : num.toFixed(2);
};

export const formatNumber = (val: any): number => {
  if (val === null || val === undefined || val === '') return 0;
  const num = Number(val);
  return isNaN(num) ? 0 : num;
};

export const VALID_ADMIN_TABS = [
  'overview',
  'traffic',
  'homepage',
  'header_navigation',
  'footer',
  'cms_pages',
  'contact',
  'faq',
  'banners',
  'seo',
  'users',
  'services',
  'categories',
  'opportunities',
  'consultation_requests',
  'active_sessions',
  'completed_sessions',
  'reports',
  'registration_offers',
  'finance',
  'transactions',
  'refunds',
  'emails',
  'notifications',
  'reviews',
  'add_user',
  'verifications',
  'settings',
  'audit'
];

import { AdminHomepageControl } from '../components/admin/AdminHomepageControl';
import { AdminHeaderNavControl } from '../components/admin/AdminHeaderNavControl';
import { AdminFooterControl } from '../components/admin/AdminFooterControl';
import { AdminContactSettings } from '../components/admin/AdminContactSettings';
import { AdminFaqControl } from '../components/admin/AdminFaqControl';
import { AdminBannersControl } from '../components/admin/AdminBannersControl';
import { AdminPagesControl } from '../components/admin/AdminPagesControl';
import { AdminSeoControl } from '../components/admin/AdminSeoControl';
import { AdminReviewsControl } from '../components/admin/AdminReviewsControl';

import {
  LayoutDashboard,
  Layout,
  HelpCircle,
  Users,
  UserCheck,
  UserX,
  Briefcase,
  Layers,
  Sparkles,
  Clock,
  Video,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  TrendingUp,
  Mail,
  Bell,
  ShieldCheck,
  PlusCircle,
  Settings,
  FileText,
  Search,
  Filter,
  RefreshCw,
  Trash2,
  Edit3,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Check,
  X,
  Lock,
  ArrowUpRight,
  LogOut,
  AlertTriangle,
  Menu,
  Award,
  Globe,
  Radio,
  Eye,
  Activity,
  Send,
  Sliders,
  Tag,
  Zap,
  Calendar,
  Compass,
  Megaphone,
  Star,
  Copy
} from 'lucide-react';
import confetti from 'canvas-confetti';

// Live Countdown Timer for Active Registration Campaign in Admin Panel
const AdminCampaignCountdown: React.FC<{ endTime: string; onExpire?: () => void }> = ({ endTime, onExpire }) => {
  const [timeLeft, setTimeLeft] = useState<{ hours: number; mins: number; secs: number; isExpired: boolean }>({
    hours: 0,
    mins: 0,
    secs: 0,
    isExpired: false
  });

  useEffect(() => {
    const calculateTime = () => {
      const now = new Date().getTime();
      const target = new Date(endTime).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft({ hours: 0, mins: 0, secs: 0, isExpired: true });
        if (onExpire) onExpire();
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft({ hours, mins, secs, isExpired: false });
      }
    };

    calculateTime();
    const timer = setInterval(calculateTime, 1000);
    return () => clearInterval(timer);
  }, [endTime]);

  if (timeLeft.isExpired) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-zinc-100 text-zinc-700 border border-zinc-300">
        <Clock className="w-3.5 h-3.5" /> Promotion Expired
      </span>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-mono font-bold text-sm shadow-inner">
      <Clock className="w-4 h-4 text-emerald-400 animate-pulse" />
      <span>Ends in: {String(timeLeft.hours).padStart(2, '0')}h {String(timeLeft.mins).padStart(2, '0')}m {String(timeLeft.secs).padStart(2, '0')}s</span>
    </div>
  );
};

// Real-time SLA Timer Component for Consultation Requests in Admin Panel
const AdminRequestTimer: React.FC<{ deadline: string; status: string }> = ({ deadline, status }) => {
  const [timeLeft, setTimeLeft] = useState<{ mins: number; secs: number; isExpired: boolean }>({
    mins: 0,
    secs: 0,
    isExpired: false
  });

  useEffect(() => {
    const calculateTime = () => {
      const now = new Date().getTime();
      const target = new Date(deadline).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft({ mins: 0, secs: 0, isExpired: true });
      } else {
        const mins = Math.floor(diff / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft({ mins, secs, isExpired: false });
      }
    };

    calculateTime();
    const timer = setInterval(calculateTime, 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  if (status !== 'PENDING_EXPERT') {
    return null;
  }

  if (timeLeft.isExpired) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
        <Clock className="w-3 h-3" /> SLA Expired
      </span>
    );
  }

  const isCritical = timeLeft.mins < 2;
  const isWarning = timeLeft.mins < 5;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2 py-0.5 rounded-full border ${
        isCritical
          ? 'bg-rose-50 text-rose-700 border-rose-300 animate-pulse'
          : isWarning
          ? 'bg-amber-50 text-amber-800 border-amber-300'
          : 'bg-aliceblue text-midnight border-timberwolf/60'
      }`}
    >
      <Clock className="w-3 h-3" />
      {String(timeLeft.mins).padStart(2, '0')}:{String(timeLeft.secs).padStart(2, '0')}
    </span>
  );
};

export const AdminPage: React.FC = () => {
  usePageSEO({
    title: 'Admin Control Center — HireByMinute',
    noindex: true,
    canonicalPath: '/admin'
  });

  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { tab: urlTab } = useParams<{ tab?: string }>();

  // Active Tab Navigation
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);


  // Global Admin State
  const [stats, setStats] = useState<any>(null);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [servicesList, setServicesList] = useState<any[]>([]);
  const [categoriesList, setCategoriesList] = useState<any[]>([]);
  const [opportunitiesList, setOpportunitiesList] = useState<any[]>([]);
  const [consultationRequestsList, setConsultationRequestsList] = useState<any[]>([]);
  const [sessionsList, setSessionsList] = useState<any[]>([]);
  const [paymentsList, setPaymentsList] = useState<any[]>([]);
  const [emailLogsList, setEmailLogsList] = useState<any[]>([]);
  const [notificationLogsList, setNotificationLogsList] = useState<any[]>([]);
  const [reportsList, setReportsList] = useState<any[]>([]);
  const [auditLogsList, setAuditLogsList] = useState<any[]>([]);
  const [platformSettings, setPlatformSettings] = useState<Record<string, string>>({});
  const [campaignsList, setCampaignsList] = useState<any[]>([]);
  const [effectiveFeeData, setEffectiveFeeData] = useState<any>(null);

  // Campaign State
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('Weekend Promotion — $0 Listing Fee');
  const [newCampaignDesc, setNewCampaignDesc] = useState('Temporary promotional waiver for 100% free expert registration');
  const [newCampaignFee, setNewCampaignFee] = useState<number>(0);
  const [newCampaignDurationHours, setNewCampaignDurationHours] = useState<number>(24);
  const [newCampaignStartTime, setNewCampaignStartTime] = useState<string>(() => new Date().toISOString().slice(0, 16));
  const [editBaseFeeModalOpen, setEditBaseFeeModalOpen] = useState(false);
  const [newBaseFeeInput, setNewBaseFeeInput] = useState<number>(2.00);

  // Loading & Action states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals & Drawers
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [selectedUserDetail, setSelectedUserDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editUserModal, setEditUserModal] = useState<any | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<any | null>(null);
  const [rejectVerificationModal, setRejectVerificationModal] = useState<any | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionReportModal, setActionReportModal] = useState<any | null>(null);
  const [reportActionNotes, setReportActionNotes] = useState('');
  const [reportActionStatus, setReportActionStatus] = useState('actioned');
  const [selectedAuditDetail, setSelectedAuditDetail] = useState<any | null>(null);

  // Add User State (Admin Special Flow)
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('HireByMinute2026!');
  const [newUserRole, setNewUserRole] = useState<'provider' | 'client'>('provider');
  const [newUserHeadline, setNewUserHeadline] = useState('');
  const [newUserBio, setNewUserBio] = useState('');
  const [newUserCountry, setNewUserCountry] = useState('United States');
  const [newUserCity, setNewUserCity] = useState('');
  const [newUserLanguages, setNewUserLanguages] = useState<string[]>(['English']);
  const [newUserSkills, setNewUserSkills] = useState<string[]>([]);
  const [newUserExperience, setNewUserExperience] = useState<number>(5);
  const [newUserVerified, setNewUserVerified] = useState(true);
  const [newUserServiceTitle, setNewUserServiceTitle] = useState('');
  const [newUserServiceDesc, setNewUserServiceDesc] = useState('');
  const [newUserCategoryId, setNewUserCategoryId] = useState('cat-tech');
  const [newUserSubcategory, setNewUserSubcategory] = useState('');
  const [newUserRate, setNewUserRate] = useState<number>(2.5);

  // Category Modal
  const [categoryModal, setCategoryModal] = useState<{
    isOpen: boolean;
    isEdit: boolean;
    id?: string;
    name: string;
    slug: string;
    icon: string;
    description: string;
    sort_order: number;
    subcategories: string;
    image_url: string;
  }>({
    isOpen: false,
    isEdit: false,
    name: '',
    slug: '',
    icon: 'Sparkles',
    description: '',
    sort_order: 1,
    subcategories: '',
    image_url: ''
  });

  // Opportunity Modal
  const [opportunityModal, setOpportunityModal] = useState<{
    isOpen: boolean;
    title: string;
    category_id: string;
    subcategory: string;
    description: string;
    duration_minutes: number;
    budget: number;
    location: string;
    deadline: string;
    pricing_type: 'free' | 'paid';
    entry_fee_usd: number;
    skills: string;
    requirements: string;
    is_featured: boolean;
  }>({
    isOpen: false,
    title: '',
    category_id: 'cat-tech',
    subcategory: '',
    description: '',
    duration_minutes: 45,
    budget: 90,
    location: 'Worldwide · Remote',
    deadline: '',
    pricing_type: 'free',
    entry_fee_usd: 0,
    skills: '',
    requirements: '',
    is_featured: false
  });

  // Admin Change Password
  const [currentAdminPassword, setCurrentAdminPassword] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState('');
  const [passwordChangeMessage, setPasswordChangeMessage] = useState<{ text: string; error: boolean } | null>(null);

  // Load all Admin Data
  const loadAdminData = async () => {
    try {
      setRefreshing(true);
      const [
        statsRes,
        usersRes,
        servicesRes,
        categoriesRes,
        oppRes,
        requestsRes,
        sessionsRes,
        paymentsRes,
        emailsRes,
        notifRes,
        reportsRes,
        auditRes,
        settingsRes,
        campaignsRes
      ] = await Promise.all([
        api.getAdminStats().catch(() => ({ stats: null })),
        api.getAdminUsers().catch(() => ({ users: [] })),
        api.getAdminServices().catch(() => ({ services: [] })),
        api.getCategories().catch(() => ({ categories: [] })),
        api.getOpportunities().catch(() => ({ opportunities: [] })),
        api.getAdminConsultationRequests().catch(() => ({ requests: [] })),
        api.getAdminSessions().catch(() => ({ sessions: [] })),
        api.getAdminPayments().catch(() => ({ payments: [] })),
        api.getAdminEmailLogs().catch(() => ({ logs: [] })),
        api.getAdminNotificationLogs().catch(() => ({ logs: [] })),
        api.getAdminReports().catch(() => ({ reports: [] })),
        api.getAdminAuditLogs().catch(() => ({ logs: [] })),
        api.getAdminSettings().catch(() => ({ settings: {} })),
        api.getAdminCampaigns().catch(() => ({ campaigns: [], effective: null }))
      ]);

      setStats(statsRes.stats || null);
      setUsersList(usersRes.users || []);
      setServicesList(servicesRes.services || []);
      setCategoriesList(categoriesRes.categories || []);
      setOpportunitiesList(oppRes.opportunities || []);
      setConsultationRequestsList(requestsRes.requests || []);
      setSessionsList(sessionsRes.sessions || []);
      setPaymentsList(paymentsRes.payments || []);
      setEmailLogsList(emailsRes.logs || []);
      setNotificationLogsList(notifRes.logs || []);
      setReportsList(reportsRes.reports || []);
      setAuditLogsList(auditRes.logs || []);
      setPlatformSettings(settingsRes.settings || {});
      setCampaignsList(campaignsRes.campaigns || []);
      setEffectiveFeeData(campaignsRes.effective || null);
    } catch (err) {
      console.error('Failed to load admin data', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleLaunchFree24h = async () => {
    if (!confirm('Activate 24-Hour Free Registration promotion ($0.00 listing fee) now?')) return;
    try {
      setActionLoading('launch-24h');
      const res = await api.launchFree24hCampaign();
      confetti({ particleCount: 100, spread: 80 });
      alert(res.message || '24-hour Free Registration promotion activated successfully!');
      await loadAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to activate promotion.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setActionLoading('create-campaign');
      const startIso = new Date(newCampaignStartTime).toISOString();
      const endIso = new Date(new Date(newCampaignStartTime).getTime() + newCampaignDurationHours * 60 * 60 * 1000).toISOString();
      await api.createAdminCampaign({
        name: newCampaignName,
        description: newCampaignDesc,
        fee_usd: Number(newCampaignFee) || 0,
        start_time: startIso,
        end_time: endIso,
        is_active: 1
      });
      setCampaignModalOpen(false);
      confetti({ particleCount: 70, spread: 60 });
      alert('Registration campaign created successfully!');
      await loadAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to create campaign.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleEndCampaignEarly = async (id: string) => {
    if (!confirm('Are you sure you want to end/cancel this campaign early? The normal base listing fee will immediately become active.')) return;
    try {
      setActionLoading(`cancel-camp-${id}`);
      await api.updateAdminCampaign(id, { status: 'cancelled', is_active: 0 });
      alert('Campaign cancelled. Normal listing fee restored.');
      await loadAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel campaign.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveBaseFee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setActionLoading('save-base-fee');
      await api.updateAdminListingFee(Number(newBaseFeeInput) || 2.00);
      setEditBaseFeeModalOpen(false);
      alert(`Base listing fee updated to $${formatCurrency(newBaseFeeInput)}`);
      await loadAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to update base fee.');
    } finally {
      setActionLoading(null);
    }
  };

  // Handle URL tab parameter synchronization
  useEffect(() => {
    if (!urlTab || urlTab === 'overview') {
      setActiveTab('overview');
    } else if (['clients', 'experts', 'verified_experts', 'suspended'].includes(urlTab)) {
      setActiveTab('users');
      if (urlTab === 'clients') {
        setRoleFilter('client');
        setStatusFilter('all');
      } else if (urlTab === 'experts') {
        setRoleFilter('provider');
        setStatusFilter('all');
      } else if (urlTab === 'verified_experts') {
        setRoleFilter('provider');
        setStatusFilter('verified');
      } else if (urlTab === 'suspended') {
        setRoleFilter('all');
        setStatusFilter('suspended');
      }
    } else if (urlTab === 'all_users' || urlTab === 'all-users') {
      setActiveTab('users');
      setRoleFilter('all');
      setStatusFilter('all');
    } else if (VALID_ADMIN_TABS.includes(urlTab)) {
      setActiveTab(urlTab);
    } else {
      setActiveTab('not_found');
    }
  }, [urlTab]);

  const handleTabNavigate = (tabId: string) => {
    navigate(`/admin/${tabId}`);
    setMobileMenuOpen(false);
  };

  useEffect(() => {
    if (user && user.role === 'admin') {
      loadAdminData();
    }
  }, [user]);


  // Load specific user details
  const openUserDetailModal = async (u: any) => {
    setSelectedUser(u);
    setDetailLoading(true);
    try {
      const data = await api.getAdminUserDetails(u.id);
      setSelectedUserDetail(data);
    } catch (err) {
      console.error('Failed to fetch user details', err);
    } finally {
      setDetailLoading(false);
    }
  };

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      const matchesSearch =
        searchQuery === '' ||
        (u.full_name && u.full_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (u.username && u.username.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (u.headline && u.headline.toLowerCase().includes(searchQuery.toLowerCase()));

      let matchesRole = true;
      if (roleFilter === 'client') matchesRole = u.role === 'client';
      if (roleFilter === 'provider') matchesRole = u.role === 'provider';
      if (roleFilter === 'admin') matchesRole = u.role === 'admin';

      let matchesStatus = true;
      if (statusFilter === 'active') matchesStatus = u.is_suspended === 0;
      if (statusFilter === 'suspended') matchesStatus = u.is_suspended === 1;
      if (statusFilter === 'verified') matchesStatus = u.role === 'provider' && u.verified === 1;
      if (statusFilter === 'pending') matchesStatus = u.role === 'provider' && u.verified === 0;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [usersList, searchQuery, roleFilter, statusFilter]);

  // Verification Review Queue (Providers with verified === 0)
  const pendingVerifications = useMemo(() => {
    return usersList.filter((u) => u.role === 'provider' && u.verified === 0 && u.is_suspended === 0);
  }, [usersList]);

  // Expert Verification Toggle (Approve / Revoke)
  const handleToggleVerification = async (userId: string, currentStatus: number) => {
    try {
      setActionLoading(`verify-${userId}`);
      const newStatus = currentStatus === 1 ? false : true;
      await api.verifyUser(userId, newStatus);
      setUsersList((prev) => prev.map((u) => (u.id === userId ? { ...u, verified: newStatus ? 1 : 0 } : u)));
      if (newStatus) confetti({ particleCount: 60, spread: 50 });
      await loadAdminData();
    } catch (err: any) {
      alert(err.message || 'Verification update failed.');
    } finally {
      setActionLoading(null);
    }
  };

  // Reject Verification with Reason
  const handleRejectVerification = async () => {
    if (!rejectVerificationModal) return;
    try {
      setActionLoading('reject-verif');
      await api.verifyUser(rejectVerificationModal.id, false, rejectionReason);
      setUsersList((prev) => prev.map((u) => (u.id === rejectVerificationModal.id ? { ...u, verified: 0, verification_rejection_reason: rejectionReason } : u)));
      setRejectVerificationModal(null);
      setRejectionReason('');
      await loadAdminData();
    } catch (err: any) {
      alert(err.message || 'Rejection failed.');
    } finally {
      setActionLoading(null);
    }
  };

  // Toggle Account Suspension
  const handleToggleSuspension = async (userId: string, currentSuspended: number) => {
    try {
      setActionLoading(`suspend-${userId}`);
      const newSuspended = currentSuspended === 1 ? false : true;
      await api.suspendUser(userId, newSuspended);
      setUsersList((prev) => prev.map((u) => (u.id === userId ? { ...u, is_suspended: newSuspended ? 1 : 0 } : u)));
      await loadAdminData();
    } catch (err: any) {
      alert(err.message || 'Suspension toggle failed.');
    } finally {
      setActionLoading(null);
    }
  };

  // Safe Account Deletion
  const handleDeleteUser = async () => {
    if (!deleteConfirmUser) return;
    try {
      setActionLoading('delete-user');
      await api.deleteAdminUser(deleteConfirmUser.id);
      setUsersList((prev) => prev.filter((u) => u.id !== deleteConfirmUser.id));
      setDeleteConfirmUser(null);
      if (selectedUser?.id === deleteConfirmUser.id) {
        setSelectedUser(null);
        setSelectedUserDetail(null);
      }
      await loadAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete user.');
    } finally {
      setActionLoading(null);
    }
  };

  // Service Status Change (active / paused)
  const handleUpdateServiceStatus = async (serviceId: string, newStatus: string) => {
    try {
      setActionLoading(`srv-${serviceId}`);
      await api.updateAdminServiceStatus(serviceId, newStatus);
      setServicesList((prev) => prev.map((s) => (s.id === serviceId ? { ...s, listing_status: newStatus } : s)));
      await loadAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to update service status.');
    } finally {
      setActionLoading(null);
    }
  };

  // Delete Service
  const handleDeleteService = async (serviceId: string) => {
    if (!confirm('Are you sure you want to permanently delete this listing?')) return;
    try {
      setActionLoading(`del-srv-${serviceId}`);
      await api.deleteAdminService(serviceId);
      setServicesList((prev) => prev.filter((s) => s.id !== serviceId));
      await loadAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete service.');
    } finally {
      setActionLoading(null);
    }
  };

  // Category Toggle
  const handleToggleCategory = async (catId: string, currentActive: number) => {
    try {
      setActionLoading(`cat-toggle-${catId}`);
      const newActive = currentActive === 1 ? 0 : 1;
      await api.toggleAdminCategory(catId);
      setCategoriesList((prev) => prev.map((c) => (c.id === catId ? { ...c, active: newActive } : c)));
      await loadAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to toggle category.');
    } finally {
      setActionLoading(null);
    }
  };

  // Category Save (Create / Update)
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setActionLoading('save-category');
      const subcategoriesArr = categoryModal.subcategories
        ? categoryModal.subcategories.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      const payload = {
        name: categoryModal.name.trim(),
        slug: categoryModal.slug.trim(),
        icon: categoryModal.icon || 'Sparkles',
        description: categoryModal.description.trim(),
        sort_order: Number(categoryModal.sort_order) || 1,
        subcategories: subcategoriesArr,
        image_url: categoryModal.image_url.trim() || undefined
      };

      if (categoryModal.isEdit && categoryModal.id) {
        await api.updateCategory(categoryModal.id, payload);
      } else {
        await api.createCategory(payload);
      }
      setCategoryModal({
        isOpen: false,
        isEdit: false,
        name: '',
        slug: '',
        icon: 'Sparkles',
        description: '',
        sort_order: 1,
        subcategories: '',
        image_url: ''
      });
      await loadAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to save category.');
    } finally {
      setActionLoading(null);
    }
  };

  // Delete / Soft-deactivate Category
  const handleDeleteCategory = async (catId: string, catName: string) => {
    if (!window.confirm(`Delete or deactivate category "${catName}"?`)) return;
    try {
      setActionLoading(`del-cat-${catId}`);
      const res = await api.deleteAdminCategory(catId);
      alert(res.message || 'Category status updated.');
      await loadAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete category.');
    } finally {
      setActionLoading(null);
    }
  };

  // Toggle Featured Service
  const handleToggleFeatureService = async (serviceId: string, currentFeatured: number) => {
    try {
      setActionLoading(`feat-srv-${serviceId}`);
      await api.toggleAdminServiceFeature(serviceId, currentFeatured !== 1);
      await loadAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to toggle service feature flag.');
    } finally {
      setActionLoading(null);
    }
  };

  // Post Opportunity
  const handlePostOpportunity = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setActionLoading('post-opp');
      const skillsArr = opportunityModal.skills
        ? opportunityModal.skills.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      await api.createAdminOpportunity({
        title: opportunityModal.title.trim(),
        category_id: opportunityModal.category_id,
        subcategory: opportunityModal.subcategory.trim(),
        description: opportunityModal.description.trim(),
        duration_minutes: Number(opportunityModal.duration_minutes) || 45,
        budget: Number(opportunityModal.budget) || 90,
        location: opportunityModal.location.trim() || 'Worldwide · Remote',
        deadline: opportunityModal.deadline || undefined,
        pricing_type: opportunityModal.pricing_type,
        entry_fee_usd: opportunityModal.pricing_type === 'paid' ? Number(opportunityModal.entry_fee_usd) || 0 : 0,
        skills: skillsArr,
        requirements: opportunityModal.requirements.trim() || undefined,
        is_featured: opportunityModal.is_featured ? 1 : 0
      });

      setOpportunityModal({
        isOpen: false,
        title: '',
        category_id: 'cat-tech',
        subcategory: '',
        description: '',
        duration_minutes: 45,
        budget: 90,
        location: 'Worldwide · Remote',
        deadline: '',
        pricing_type: 'free',
        entry_fee_usd: 0,
        skills: '',
        requirements: '',
        is_featured: false
      });
      confetti({ particleCount: 70, spread: 60 });
      await loadAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to post opportunity.');
    } finally {
      setActionLoading(null);
    }
  };

  // Duplicate Opportunity
  const handleDuplicateOpportunity = async (oppId: string) => {
    try {
      setActionLoading(`dup-opp-${oppId}`);
      await api.duplicateAdminOpportunity(oppId);
      await loadAdminData();
      confetti({ particleCount: 50, spread: 50 });
    } catch (err: any) {
      alert(err.message || 'Failed to duplicate opportunity.');
    } finally {
      setActionLoading(null);
    }
  };

  // Update Opportunity Status
  const handleUpdateOpportunityStatus = async (oppId: string, newStatus: string) => {
    try {
      setActionLoading(`status-opp-${oppId}`);
      await api.updateAdminOpportunity(oppId, { status: newStatus });
      await loadAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to update opportunity status.');
    } finally {
      setActionLoading(null);
    }
  };

  // Delete Opportunity
  const handleDeleteOpportunity = async (oppId: string) => {
    if (!confirm('Are you sure you want to delete this opportunity?')) return;
    try {
      setActionLoading(`del-opp-${oppId}`);
      await api.deleteAdminOpportunity(oppId);
      setOpportunitiesList((prev) => prev.filter((o) => o.id !== oppId));
      await loadAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete opportunity.');
    } finally {
      setActionLoading(null);
    }
  };

  // Special Admin User Provisioning Flow ($0 Listing Fee Waiver)
  const handleAdminCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim()) {
      alert('Name and email are required.');
      return;
    }
    try {
      setActionLoading('create-user');
      await api.createAdminUser({
        full_name: newUserName.trim(),
        email: newUserEmail.trim(),
        password: newUserPassword,
        role: newUserRole,
        headline: newUserHeadline,
        bio: newUserBio,
        country: newUserCountry,
        city: newUserCity,
        languages: newUserLanguages,
        skills: newUserSkills,
        experience_years: newUserExperience,
        verified: newUserVerified,
        service_title: newUserServiceTitle,
        service_description: newUserServiceDesc,
        category_id: newUserCategoryId,
        subcategory: newUserSubcategory,
        price_per_minute: newUserRate
      });

      alert(`User ${newUserName} created successfully with administrative $0 fee waiver!`);
      confetti({ particleCount: 80, spread: 70 });

      // Reset form
      setNewUserName('');
      setNewUserEmail('');
      setNewUserHeadline('');
      setNewUserBio('');
      setNewUserServiceTitle('');
      setNewUserServiceDesc('');
      setActiveTab('users');
      await loadAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to create user.');
    } finally {
      setActionLoading(null);
    }
  };

  // Update User Profile
  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUserModal) return;
    try {
      setActionLoading('edit-user-save');
      await api.updateAdminUser(editUserModal.id, {
        full_name: editUserModal.full_name,
        headline: editUserModal.headline,
        bio: editUserModal.bio,
        country: editUserModal.country,
        city: editUserModal.city,
        experience_years: editUserModal.experience_years
      });
      setEditUserModal(null);
      await loadAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to update user profile.');
    } finally {
      setActionLoading(null);
    }
  };

  // Action Moderation Report
  const handleSaveReportAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionReportModal) return;
    try {
      setActionLoading('action-report-save');
      await api.updateAdminReport(
        actionReportModal.id,
        reportActionStatus,
        reportActionStatus === 'actioned' ? 'Account Warned / Content Moderated' : 'Report Reviewed & Dismissed',
        reportActionNotes
      );
      setActionReportModal(null);
      setReportActionNotes('');
      await loadAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to update report.');
    } finally {
      setActionLoading(null);
    }
  };

  // Update Admin Password
  const handleAdminChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newAdminPassword !== confirmAdminPassword) {
      setPasswordChangeMessage({ text: 'New passwords do not match.', error: true });
      return;
    }
    try {
      setActionLoading('change-pass');
      await api.changeAdminPassword(newAdminPassword);
      setPasswordChangeMessage({ text: 'Administrator password updated successfully!', error: false });
      setCurrentAdminPassword('');
      setNewAdminPassword('');
      setConfirmAdminPassword('');
    } catch (err: any) {
      setPasswordChangeMessage({ text: err.message || 'Failed to update password.', error: true });
    } finally {
      setActionLoading(null);
    }
  };


  // Navigation Items Structure - Canonical 8 Platform Modules
  const navSections = [
    {
      title: 'OVERVIEW',
      items: [
        { id: 'overview', label: 'Operations Dashboard', icon: LayoutDashboard, count: null },
        { id: 'traffic', label: 'Traffic & Analytics', icon: Activity, count: null }
      ]
    },
    {
      title: 'WEBSITE',
      items: [
        { id: 'homepage', label: 'Homepage Sections', icon: Layout, count: null },
        { id: 'header_navigation', label: 'Header & Navigation', icon: Compass, count: null },
        { id: 'footer', label: 'Footer CMS', icon: Globe, count: null },
        { id: 'cms_pages', label: 'Pages & Legal CMS', icon: FileText, count: null },
        { id: 'contact', label: 'Contact & Support', icon: Mail, count: null },
        { id: 'faq', label: 'FAQ Management', icon: HelpCircle, count: null },
        { id: 'banners', label: 'Banners & Broadcasts', icon: Megaphone, count: null },
        { id: 'seo', label: 'SEO & Meta Tags', icon: Globe, count: null }
      ]
    },
    {
      title: 'PEOPLE',
      items: [
        { id: 'users', label: 'All Users', icon: Users, count: usersList.length },
        { id: 'clients', label: 'Clients', icon: UserCheck, count: stats?.totalClients || 0 },
        { id: 'experts', label: 'Experts', icon: Award, count: stats?.totalProviders || 0 },
        { id: 'verifications', label: 'Verification Queue', icon: ShieldCheck, count: pendingVerifications.length },
        { id: 'suspended', label: 'Suspended Users', icon: UserX, count: usersList.filter((u) => u.is_suspended === 1).length },
        { id: 'reports', label: 'Moderation & Reports', icon: AlertCircle, count: reportsList.filter((r) => r.status === 'pending').length }
      ]
    },
    {
      title: 'MARKETPLACE',
      items: [
        { id: 'services', label: 'Services / Listings', icon: Briefcase, count: servicesList.length },
        { id: 'categories', label: 'Categories & Taxonomies', icon: Layers, count: categoriesList.length },
        { id: 'opportunities', label: 'Platform Opportunities', icon: Sparkles, count: opportunitiesList.length }
      ]
    },
    {
      title: 'SESSIONS',
      items: [
        { id: 'consultation_requests', label: 'Consultation Requests', icon: Clock, count: consultationRequestsList.length },
        { id: 'active_sessions', label: 'Active Sessions', icon: Video, count: stats?.activeSessions || 0 },
        { id: 'completed_sessions', label: 'Completed Sessions', icon: CheckCircle2, count: stats?.completedSessions || 0 }
      ]
    },
    {
      title: 'FINANCE',
      items: [
        { id: 'finance', label: 'Financial Overview', icon: DollarSign, count: null },
        { id: 'transactions', label: 'Transactions Ledger', icon: FileText, count: paymentsList.length },
        { id: 'refunds', label: 'Refunds Audit', icon: RefreshCw, count: paymentsList.filter((p) => p.type === 'refund').length },
        { id: 'registration_offers', label: 'Registration Offers', icon: Tag, count: campaignsList.filter((c) => c.status === 'active').length || null }
      ]
    },
    {
      title: 'COMMUNICATION',
      items: [
        { id: 'emails', label: 'Transactional Email Logs', icon: Mail, count: emailLogsList.length },
        { id: 'notifications', label: 'In-App Notification Logs', icon: Bell, count: notificationLogsList.length }
      ]
    },
    {
      title: 'SETTINGS',
      items: [
        { id: 'settings', label: 'Platform Settings', icon: Sliders, count: null },
        { id: 'reviews', label: 'Reviews Moderation', icon: Star, count: null },
        { id: 'add_user', label: 'Add User (Admin Flow)', icon: PlusCircle, count: null },
        { id: 'audit', label: 'Audit Trail', icon: FileText, count: auditLogsList.length }
      ]
    }
  ];

  return (
    <div className="h-[calc(100dvh-4rem)] sm:h-[calc(100dvh-4.5rem)] overflow-hidden flex flex-col antialiased text-midnight bg-aliceblue">
      
      {/* Mobile Sub-bar for Admin Navigation (below lg screens) */}
      <div className="lg:hidden shrink-0 flex items-center justify-between px-4 py-2.5 bg-white border-b border-timberwolf/60 shadow-subtle">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-aliceblue border border-timberwolf/60 text-midnight text-xs font-semibold hover:bg-lightblue/30 transition-all cursor-pointer"
          aria-label="Toggle admin modules"
        >
          <Menu className="w-4 h-4 text-moonstone" />
          <span>Admin Modules</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={loadAdminData}
            disabled={refreshing}
            title="Refresh database records"
            className="p-1.5 rounded-lg bg-aliceblue text-midnight/70 hover:text-midnight border border-timberwolf/60 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-moonstone' : ''}`} />
          </button>
          <span className="text-[11px] font-bold text-midnight bg-moonstone-light text-moonstone-dark px-2.5 py-0.5 rounded-full border border-moonstone/20">
            Admin Area
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MAIN ADMIN WORKSPACE (SIDEBAR + CONTENT CANVAS) */}
      {/* ========================================================================= */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        
        {/* Mobile Drawer Backdrop */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-midnight/50 backdrop-blur-xs z-20 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        <aside
          className={`fixed inset-y-16 sm:inset-y-18 left-0 z-30 w-64 bg-white/95 backdrop-blur-md border-r border-timberwolf/60 flex flex-col justify-between transition-transform duration-200 lg:static lg:translate-x-0 h-full overflow-hidden shrink-0 ${
            mobileMenuOpen ? 'translate-x-0 shadow-modal' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          {/* Scrollable Navigation Sections */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-timberwolf/30">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-midnight">Admin Workspace</span>
              </div>
              <button
                onClick={loadAdminData}
                disabled={refreshing}
                title="Refresh database records"
                className="p-1.5 rounded-lg text-midnight/60 hover:text-midnight hover:bg-aliceblue transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-moonstone' : ''}`} />
              </button>
            </div>
            {navSections.map((sec, secIdx) => (
              <div key={secIdx} className="space-y-1">
                <div className="px-3 py-1 text-[10px] font-bold text-midnight/40 uppercase tracking-wider">
                  {sec.title}
                </div>
                <div className="space-y-0.5">
                  {sec.items.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      (urlTab === item.id) ||
                      (!urlTab && item.id === 'overview') ||
                      (activeTab === item.id) ||
                      (activeTab === 'users' && ['clients', 'experts', 'verified_experts', 'suspended'].includes(item.id) && (
                        (item.id === 'clients' && roleFilter === 'client') ||
                        (item.id === 'experts' && roleFilter === 'provider' && statusFilter === 'all') ||
                        (item.id === 'verified_experts' && roleFilter === 'provider' && statusFilter === 'verified') ||
                        (item.id === 'suspended' && statusFilter === 'suspended')
                      )) ||
                      (activeTab === 'users' && item.id === 'users' && roleFilter === 'all' && statusFilter === 'all');

                    return (
                      <button
                        key={item.id}
                        onClick={() => handleTabNavigate(item.id)}
                        className={`w-full min-h-[40px] flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                          isActive
                            ? 'bg-midnight text-aliceblue shadow-subtle'
                            : 'text-midnight/75 hover:bg-aliceblue hover:text-midnight'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-moonstone' : 'text-midnight/50'}`} />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.count !== null && item.count !== undefined && item.count > 0 && (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono font-bold ${
                              isActive
                                ? 'bg-moonstone text-white'
                                : 'bg-aliceblue text-midnight/70 border border-timberwolf/60'
                            }`}
                          >
                            {item.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Sidebar Footer Info */}
          <div className="p-4 border-t border-timberwolf/40 bg-aliceblue/60 text-center">
            <div className="text-[11px] font-bold text-midnight">HireByMinute Platform</div>
            <div className="text-[10px] text-midnight/50 mt-0.5">Production Engine · v2.4</div>
          </div>
        </aside>

        {/* Backdrop for mobile drawer */}
        {mobileMenuOpen && (
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 z-20 bg-midnight/30 backdrop-blur-xs lg:hidden"
          />
        )}

        {/* ======================================================================= */}
        {/* MAIN SCROLLABLE CONTENT CANVAS */}
        {/* ======================================================================= */}
        <main className="flex-1 min-w-0 h-full overflow-y-auto p-5 sm:p-6 lg:p-7 space-y-5">
          {loading ? (
            <AdminLoadingSkeleton />
          ) : (
            <AdminContentErrorBoundary
              activeTab={activeTab}
              onReset={loadAdminData}
              onNavigateHome={() => handleTabNavigate('overview')}
            >
              {/* ===================================================================== */}
              {/* TAB 1: OPERATIONS DASHBOARD (OVERVIEW) */}
              {/* ===================================================================== */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  
                  {/* Header Title Banner */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
                    <div>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-moonstone/10 text-moonstone-dark text-[11px] font-bold border border-moonstone/30 mb-2">
                        <Radio className="w-3 h-3 animate-pulse text-emerald-600" />
                        <span>Live Operations Control</span>
                      </div>
                      <h1 className="text-2xl font-extrabold text-midnight tracking-tight">
                        HireByMinute Platform Health
                      </h1>
                      <p className="text-xs text-midnight/70 mt-1">
                        Real-time operational ledger, active consultations, conversion funnels, and verified expert directory.
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleTabNavigate('add_user')}
                        className="btn-shine inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-midnight text-aliceblue font-semibold text-xs hover:bg-midnight-hover shadow-subtle transition-all cursor-pointer"
                      >
                        <PlusCircle className="w-4 h-4 text-moonstone" />
                        <span>Add User ($0 Waiver)</span>
                      </button>

                      <button
                        onClick={() => handleTabNavigate('verifications')}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-aliceblue border border-timberwolf/70 text-midnight font-semibold text-xs hover:bg-lightblue/30 shadow-subtle transition-all cursor-pointer relative"
                      >
                        <ShieldCheck className="w-4 h-4 text-emerald-700" />
                        <span>Verification Queue</span>
                        {pendingVerifications.length > 0 && (
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping absolute -top-0.5 -right-0.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* PRIMARY KPI METRICS (4 CARDS) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    
                    {/* Total Users */}
                    <div
                      onClick={() => handleTabNavigate('users')}
                      className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card cursor-pointer hover:border-moonstone/60 transition-all flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-midnight/60 uppercase tracking-wider">Total Accounts</span>
                        <div className="w-9 h-9 rounded-xl bg-aliceblue text-midnight flex items-center justify-center border border-lightblue/60">
                          <Users className="w-4 h-4 text-moonstone" />
                        </div>
                      </div>
                      <div>
                        <div className="text-2xl font-extrabold text-midnight font-mono">
                          {stats?.totalUsers || usersList.length}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-midnight/60">
                          <span>{stats?.totalClients || 0} clients</span>
                          <span>•</span>
                          <span>{stats?.totalProviders || 0} experts</span>
                        </div>
                      </div>
                    </div>

                    {/* Verified Experts */}
                    <div
                      onClick={() => handleTabNavigate('verified_experts')}
                      className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card cursor-pointer hover:border-moonstone/60 transition-all flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-midnight/60 uppercase tracking-wider">Verified Experts</span>
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
                          <ShieldCheck className="w-4 h-4" />
                        </div>
                      </div>
                      <div>
                        <div className="text-2xl font-extrabold text-emerald-700 font-mono">
                          {stats?.verifiedExperts || 0}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-amber-700 font-semibold">
                          <AlertCircle className="w-3 h-3" />
                          <span>{pendingVerifications.length} pending review</span>
                        </div>
                      </div>
                    </div>

                    {/* Gross Volume */}
                    <div
                      onClick={() => handleTabNavigate('finance')}
                      className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card cursor-pointer hover:border-moonstone/60 transition-all flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-midnight/60 uppercase tracking-wider">Gross Volume</span>
                        <div className="w-9 h-9 rounded-xl bg-aliceblue text-midnight flex items-center justify-center border border-lightblue/60">
                          <DollarSign className="w-4 h-4 text-moonstone" />
                        </div>
                      </div>
                      <div>
                        <div className="text-2xl font-extrabold text-midnight font-mono">
                          ${formatCurrency(stats?.grossRevenue)}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-midnight/60">
                          <span>Net: ${formatCurrency(stats?.netRevenue)}</span>
                          <span>•</span>
                          <span>Ref: ${formatCurrency(stats?.totalRefunds)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Platform Net Take (15%) */}
                    <div
                      onClick={() => handleTabNavigate('finance')}
                      className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card cursor-pointer hover:border-moonstone/60 transition-all flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-midnight/60 uppercase tracking-wider">Platform Take (15%)</span>
                        <div className="w-9 h-9 rounded-xl bg-moonstone-light text-moonstone-dark flex items-center justify-center border border-moonstone/30">
                          <TrendingUp className="w-4 h-4" />
                        </div>
                      </div>
                      <div>
                        <div className="text-2xl font-extrabold text-moonstone-dark font-mono">
                          ${formatCurrency(stats?.platformRevenue)}
                        </div>
                        <div className="text-[11px] text-midnight/60 mt-1">
                          Expert Payouts: ${formatCurrency(stats?.expertPayouts)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* SECONDARY ROW: TODAY'S TELEMETRY & CONVERSION FUNNEL */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    
                    {/* 24-Hour Velocity Card */}
                    <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-midnight flex items-center gap-2">
                          <Activity className="w-4 h-4 text-moonstone" />
                          <span>Today's Activity</span>
                        </h3>
                        <span className="text-[10px] font-bold text-midnight/50 bg-aliceblue px-2 py-0.5 rounded-full border border-timberwolf/60">
                          24h Rolling
                        </span>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs py-1 border-b border-timberwolf/30">
                          <span className="text-midnight/70">New Registrations</span>
                          <span className="font-bold text-midnight font-mono">+{stats?.today?.newUsers || 0}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs py-1 border-b border-timberwolf/30">
                          <span className="text-midnight/70">New Expert Listings</span>
                          <span className="font-bold text-midnight font-mono">+{stats?.today?.newExperts || 0}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs py-1 border-b border-timberwolf/30">
                          <span className="text-midnight/70">Consultation Requests</span>
                          <span className="font-bold text-midnight font-mono">+{stats?.today?.newRequests || 0}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs py-1 border-b border-timberwolf/30">
                          <span className="text-midnight/70">Completed Sessions</span>
                          <span className="font-bold text-emerald-700 font-mono">+{stats?.today?.completedSessions || 0}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs py-1">
                          <span className="text-midnight/70">Today's Revenue</span>
                          <span className="font-bold text-midnight font-mono">${formatCurrency(stats?.today?.revenue)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Conversion Funnel */}
                    <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-midnight flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-moonstone" />
                          <span>Conversion Funnel</span>
                        </h3>
                        <span className="text-[10px] font-bold text-midnight/50 bg-aliceblue px-2 py-0.5 rounded-full border border-timberwolf/60">
                          SLA Health
                        </span>
                      </div>

                      <div className="space-y-3.5">
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-midnight/70">Request → Expert Accepted</span>
                            <span className="font-bold text-midnight font-mono">{stats?.conversions?.requestToAcceptedRate ?? 0}%</span>
                          </div>
                          <div className="w-full h-2 bg-aliceblue rounded-full overflow-hidden border border-timberwolf/40">
                            <div
                              className="h-full bg-moonstone rounded-full"
                              style={{ width: `${Math.min(stats?.conversions?.requestToAcceptedRate ?? 0, 100)}%` }}
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-midnight/70">Accepted → Client Paid</span>
                            <span className="font-bold text-midnight font-mono">{stats?.conversions?.acceptedToPaidRate ?? 0}%</span>
                          </div>
                          <div className="w-full h-2 bg-aliceblue rounded-full overflow-hidden border border-timberwolf/40">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${Math.min(stats?.conversions?.acceptedToPaidRate ?? 0, 100)}%` }}
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-midnight/70">Paid → Completed Session</span>
                            <span className="font-bold text-midnight font-mono">{stats?.conversions?.paidToCompletedRate ?? 0}%</span>
                          </div>
                          <div className="w-full h-2 bg-aliceblue rounded-full overflow-hidden border border-timberwolf/40">
                            <div
                              className="h-full bg-midnight rounded-full"
                              style={{ width: `${Math.min(stats?.conversions?.paidToCompletedRate ?? 0, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                {/* Quick Action Queues */}
                <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card space-y-4">
                  <h3 className="text-sm font-bold text-midnight flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-moonstone" />
                    <span>Action Queues</span>
                  </h3>

                  <div className="space-y-2">
                    <button
                      onClick={() => handleTabNavigate('verifications')}
                      className="w-full flex items-center justify-between p-3 rounded-xl bg-aliceblue hover:bg-lightblue/30 border border-timberwolf/60 transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <ShieldCheck className="w-4 h-4 text-amber-600" />
                        <div>
                          <div className="text-xs font-bold text-midnight">Expert Verifications</div>
                          <div className="text-[10px] text-midnight/60">{pendingVerifications.length} profiles pending review</div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-midnight/40" />
                    </button>

                    <button
                      onClick={() => handleTabNavigate('reports')}
                      className="w-full flex items-center justify-between p-3 rounded-xl bg-aliceblue hover:bg-lightblue/30 border border-timberwolf/60 transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <AlertCircle className="w-4 h-4 text-rose-600" />
                        <div>
                          <div className="text-xs font-bold text-midnight">Moderation Reports</div>
                          <div className="text-[10px] text-midnight/60">
                            {reportsList.filter((r) => r.status === 'pending').length} items require review
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-midnight/40" />
                    </button>

                    <button
                      onClick={() => handleTabNavigate('consultation_requests')}
                      className="w-full flex items-center justify-between p-3 rounded-xl bg-aliceblue hover:bg-lightblue/30 border border-timberwolf/60 transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <Clock className="w-4 h-4 text-moonstone" />
                        <div>
                          <div className="text-xs font-bold text-midnight">SLA Countdown Monitor</div>
                          <div className="text-[10px] text-midnight/60">{consultationRequestsList.length} active request timers</div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-midnight/40" />
                    </button>
                  </div>
                </div>
              </div>

              {/* RECENT ACTIVITY & AUDIT TRAIL PREVIEW */}
              <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-midnight flex items-center gap-2">
                    <FileText className="w-4 h-4 text-moonstone" />
                    <span>Recent Administrative Audit Events</span>
                  </h3>
                  <button
                    onClick={() => handleTabNavigate('audit')}
                    className="text-xs font-semibold text-moonstone hover:text-moonstone-dark transition-colors cursor-pointer"
                  >
                    View All Audit Logs →
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-timberwolf/40 bg-aliceblue-surface text-midnight/70">
                        <th className="py-2.5 px-3 font-semibold">Timestamp</th>
                        <th className="py-2.5 px-3 font-semibold">Administrator</th>
                        <th className="py-2.5 px-3 font-semibold">Action</th>
                        <th className="py-2.5 px-3 font-semibold">Target</th>
                        <th className="py-2.5 px-3 font-semibold">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-timberwolf/30">
                      {auditLogsList.slice(0, 5).map((log) => (
                        <tr key={log.id} className="hover:bg-aliceblue/50 transition-colors">
                          <td className="py-2.5 px-3 font-mono text-midnight/60">{log.created_at}</td>
                          <td className="py-2.5 px-3 font-bold text-midnight">{log.admin_name}</td>
                          <td className="py-2.5 px-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-aliceblue text-midnight border border-timberwolf/60">
                              {log.action}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-midnight/80 font-medium">
                            {log.target_type}: {log.target_id}
                          </td>
                          <td className="py-2.5 px-3">
                            {log.details_json ? (
                              <button
                                onClick={() => setSelectedAuditDetail(log)}
                                title="Click to view full audit event JSON details"
                                className="inline-flex items-center gap-1.5 max-w-[220px] truncate text-left font-mono text-[11px] text-midnight/70 hover:text-midnight bg-aliceblue/80 hover:bg-lightblue/30 px-2 py-0.5 rounded-lg border border-timberwolf/40 cursor-pointer transition-colors"
                              >
                                <span className="truncate">{log.details_json}</span>
                                <Eye className="w-3 h-3 shrink-0 text-moonstone" />
                              </button>
                            ) : (
                              <span className="text-midnight/40">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 2: USER DIRECTORY (PEOPLE) */}
          {/* ===================================================================== */}
          {activeTab === 'users' && (
            <div className="space-y-5">
              
              {/* Header Title & Action Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
                <div>
                  <h1 className="text-2xl font-extrabold text-midnight tracking-tight">
                    User Accounts & Verification Directory
                  </h1>
                  <p className="text-xs text-midnight/70 mt-1">
                    Manage client profiles, expert listings, verification credentials, account status, and metadata.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleTabNavigate('add_user')}
                    className="btn-shine inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-midnight text-aliceblue font-semibold text-xs hover:bg-midnight-hover shadow-subtle transition-all cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4 text-moonstone" />
                    <span>Provision User ($0 Fee)</span>
                  </button>
                </div>
              </div>

              {/* SEARCH & FILTER BAR */}
              <div className="bg-white rounded-2xl border border-timberwolf/70 p-4 shadow-card flex flex-col md:flex-row items-center gap-3">
                {/* Search Input */}
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 text-midnight/40 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, email, @username, headline, skill..."
                    className="w-full bg-white border border-timberwolf/70 rounded-xl pl-9 pr-4 py-2 text-xs text-midnight placeholder-midnight/40 focus:outline-none focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 shadow-subtle"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-midnight/40 hover:text-midnight"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Role Filter */}
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="bg-white border border-timberwolf/70 rounded-xl px-3 py-2 text-xs text-midnight font-medium focus:outline-none focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 shadow-subtle"
                  >
                    <option value="all">All Roles</option>
                    <option value="client">Clients Only</option>
                    <option value="provider">Experts Only</option>
                    <option value="admin">Administrators</option>
                  </select>

                  {/* Status Filter */}
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-white border border-timberwolf/70 rounded-xl px-3 py-2 text-xs text-midnight font-medium focus:outline-none focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 shadow-subtle"
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Active Only</option>
                    <option value="verified">Verified Experts</option>
                    <option value="pending">Pending Verification</option>
                    <option value="suspended">Suspended Only</option>
                  </select>
                </div>
              </div>

              {/* USER DIRECTORY TABLE (LIGHT THEME) */}
              <div className="bg-white rounded-2xl border border-timberwolf/60 overflow-hidden shadow-card">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-aliceblue-surface border-b border-timberwolf/40 text-midnight/70">
                        <th className="py-3 px-4 font-semibold">User</th>
                        <th className="py-3 px-4 font-semibold">Role</th>
                        <th className="py-3 px-4 font-semibold">Verification</th>
                        <th className="py-3 px-4 font-semibold">Location</th>
                        <th className="py-3 px-4 font-semibold">Activity</th>
                        <th className="py-3 px-4 font-semibold">Financial</th>
                        <th className="py-3 px-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-timberwolf/30">
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-midnight/50">
                            No users match the specified criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((u) => (
                          <tr key={u.id} className="hover:bg-aliceblue/50 transition-colors">
                            {/* User details */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-3">
                                <img
                                  src={u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.full_name}`}
                                  alt={u.full_name}
                                  className="w-9 h-9 rounded-full object-cover border border-lightblue"
                                />
                                <div>
                                  <div className="font-bold text-midnight flex items-center gap-1.5">
                                    <span>{u.full_name}</span>
                                    {u.created_by_admin === 1 && (
                                      <span
                                        title="Created via administrative flow ($0 fee waiver)"
                                        className="text-[9px] bg-moonstone/10 text-moonstone-dark px-1.5 py-0.2 rounded font-mono font-bold"
                                      >
                                        Admin-Provisioned
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-midnight/60 flex items-center gap-1.5 mt-0.5">
                                    <span>@{u.username || 'user'}</span>
                                    <span>•</span>
                                    <span className="truncate max-w-[140px]">{u.email}</span>
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Role */}
                            <td className="py-3.5 px-4">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                  u.role === 'admin'
                                    ? 'bg-midnight text-white'
                                    : u.role === 'provider'
                                    ? 'bg-moonstone-light text-moonstone-dark border border-moonstone/30'
                                    : 'bg-aliceblue text-midnight border border-timberwolf/60'
                                }`}
                              >
                                {u.role}
                              </span>
                            </td>

                            {/* Verification */}
                            <td className="py-3.5 px-4">
                              {u.role === 'provider' ? (
                                u.verified === 1 ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold border border-emerald-200">
                                    <CheckCircle2 className="w-3 h-3" /> Verified
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full font-semibold border border-amber-200">
                                    <AlertCircle className="w-3 h-3" /> Pending
                                  </span>
                                )
                              ) : (
                                <span className="text-midnight/40">—</span>
                              )}
                            </td>

                            {/* Location */}
                            <td className="py-3.5 px-4 text-midnight/80 font-medium">
                              {[u.city, u.country].filter(Boolean).join(', ') || 'Worldwide'}
                            </td>

                            {/* Activity */}
                            <td className="py-3.5 px-4 text-midnight/70 font-mono">
                              <div>{u.sessions_count || u.sessions_completed || 0} sessions</div>
                              <div className="text-[10px] text-midnight/50">Joined {u.member_since || '2026'}</div>
                            </td>

                            {/* Financial */}
                            <td className="py-3.5 px-4 font-mono font-bold text-midnight">
                              {u.role === 'provider'
                                ? `Earned $${formatCurrency(u.revenue_generated)}`
                                : `Spent $${formatCurrency(u.total_spent)}`}
                            </td>

                            {/* Actions */}
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* Inspect Profile Drawer */}
                                <button
                                  onClick={() => openUserDetailModal(u)}
                                  title="Inspect complete account profile"
                                  className="p-1.5 rounded-lg bg-aliceblue text-midnight hover:bg-lightblue/30 transition-colors cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5 text-moonstone" />
                                </button>

                                {/* Edit Allowed Fields */}
                                <button
                                  onClick={() => setEditUserModal(u)}
                                  title="Edit profile information"
                                  className="p-1.5 rounded-lg bg-aliceblue text-midnight hover:bg-lightblue/30 transition-colors cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5 text-midnight/70" />
                                </button>

                                {/* Verify Toggle for Providers */}
                                {u.role === 'provider' && (
                                  <button
                                    onClick={() => handleToggleVerification(u.id, u.verified)}
                                    disabled={actionLoading === `verify-${u.id}`}
                                    title={u.verified === 1 ? 'Revoke verification' : 'Approve verification'}
                                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                      u.verified === 1
                                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                                        : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                                    }`}
                                  >
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {/* Suspend / Unsuspend */}
                                {u.role !== 'admin' && (
                                  <button
                                    onClick={() => handleToggleSuspension(u.id, u.is_suspended)}
                                    disabled={actionLoading === `suspend-${u.id}`}
                                    title={u.is_suspended === 1 ? 'Unsuspend account' : 'Suspend account'}
                                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                      u.is_suspended === 1
                                        ? 'bg-rose-100 text-rose-700 hover:bg-rose-200 border border-rose-300'
                                        : 'bg-aliceblue text-midnight/60 hover:text-rose-700 hover:bg-rose-50'
                                    }`}
                                  >
                                    <UserX className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {/* Safe Deletion */}
                                {u.role !== 'admin' && (
                                  <button
                                    onClick={() => setDeleteConfirmUser(u)}
                                    title="Delete account"
                                    className="p-1.5 rounded-lg bg-aliceblue text-midnight/40 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 3: SERVICES & LISTINGS MANAGEMENT */}
          {/* ===================================================================== */}
          {activeTab === 'services' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
                <div>
                  <h1 className="text-2xl font-extrabold text-midnight tracking-tight">
                    Marketplace Services & Listings
                  </h1>
                  <p className="text-xs text-midnight/70 mt-1">
                    Manage expert listings, pause/resume marketplace visibility, inspect rates, and review categories.
                  </p>
                </div>
              </div>

              {/* Table */}
              <div className="bg-white rounded-2xl border border-timberwolf/60 overflow-hidden shadow-card">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-aliceblue-surface border-b border-timberwolf/40 text-midnight/70">
                        <th className="py-3 px-4 font-semibold">Service Listing</th>
                        <th className="py-3 px-4 font-semibold">Provider</th>
                        <th className="py-3 px-4 font-semibold">Rate / Min</th>
                        <th className="py-3 px-4 font-semibold">Category</th>
                        <th className="py-3 px-4 font-semibold">Status</th>
                        <th className="py-3 px-4 font-semibold">Fee Status</th>
                        <th className="py-3 px-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-timberwolf/30">
                      {servicesList.map((s) => (
                        <tr key={s.id} className="hover:bg-aliceblue/50 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-midnight max-w-sm truncate">{s.title}</span>
                              {s.is_featured === 1 && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-extrabold uppercase shrink-0">
                                  <Star className="w-2.5 h-2.5 fill-current text-amber-500" /> Featured
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-midnight/60 line-clamp-1">{s.description}</div>
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-midnight">{s.provider_name}</td>
                          <td className="py-3.5 px-4 font-mono font-bold text-midnight">
                            ${formatCurrency(s.price_per_minute)}/min
                          </td>
                          <td className="py-3.5 px-4 text-midnight/80 font-medium">
                            {s.category_name} {s.subcategory ? `· ${s.subcategory}` : ''}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                s.listing_status === 'active'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : s.listing_status === 'paused' || s.listing_status === 'inactive'
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {s.listing_status.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            {s.listing_fee_paid === 1 ? (
                              <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                                <Check className="w-3 h-3" /> Paid / Waived
                              </span>
                            ) : (
                              <span className="text-[11px] text-amber-700 font-semibold flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Pending $2
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleToggleFeatureService(s.id, s.is_featured || 0)}
                                disabled={actionLoading === `feat-srv-${s.id}`}
                                title={s.is_featured === 1 ? 'Remove from featured listings' : 'Mark as featured marketplace listing'}
                                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                  s.is_featured === 1
                                    ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                    : 'bg-aliceblue text-midnight/50 border-timberwolf/60 hover:text-amber-600'
                                }`}
                              >
                                <Star className={`w-3.5 h-3.5 ${s.is_featured === 1 ? 'fill-current' : ''}`} />
                              </button>
                              {s.listing_status === 'active' ? (
                                <button
                                  onClick={() => handleUpdateServiceStatus(s.id, 'inactive')}
                                  disabled={actionLoading === `srv-${s.id}`}
                                  className="px-2 py-1 rounded-lg bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 font-semibold text-[11px] cursor-pointer"
                                >
                                  Pause
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleUpdateServiceStatus(s.id, 'active')}
                                  disabled={actionLoading === `srv-${s.id}`}
                                  className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-semibold text-[11px] cursor-pointer"
                                >
                                  Publish
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteService(s.id)}
                                disabled={actionLoading === `del-srv-${s.id}`}
                                className="p-1.5 rounded-lg bg-aliceblue text-midnight/40 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 4: CATEGORIES & TAXONOMY MANAGEMENT */}
          {/* ===================================================================== */}
          {activeTab === 'categories' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
                <div>
                  <h1 className="text-2xl font-extrabold text-midnight tracking-tight">
                    Categories & Taxonomies
                  </h1>
                  <p className="text-xs text-midnight/70 mt-1">
                    Manage service classifications, subcategories, sort ordering, and enable/disable filters.
                  </p>
                </div>
                <button
                  onClick={() =>
                    setCategoryModal({
                      isOpen: true,
                      isEdit: false,
                      name: '',
                      slug: '',
                      icon: 'Sparkles',
                      description: '',
                      sort_order: categoriesList.length + 1,
                      subcategories: '',
                      image_url: ''
                    })
                  }
                  className="btn-shine inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-midnight text-aliceblue font-semibold text-xs hover:bg-midnight-hover shadow-subtle transition-all cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4 text-moonstone" />
                  <span>Add New Category</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoriesList.map((cat) => (
                  <div key={cat.id} className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-aliceblue text-midnight flex items-center justify-center border border-lightblue/60">
                          <Sparkles className="w-4 h-4 text-moonstone" />
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-midnight">{cat.name}</h3>
                          <span className="text-[11px] text-midnight/60 font-mono">/{cat.slug}</span>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          cat.active === 1
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {cat.active === 1 ? 'ACTIVE' : 'DISABLED'}
                      </span>
                    </div>

                    <p className="text-xs text-midnight/70 line-clamp-2">{cat.description || 'No description provided.'}</p>

                    {Array.isArray(cat.subcategories) && cat.subcategories.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {cat.subcategories.map((sub: string, idx: number) => (
                          <span key={idx} className="px-1.5 py-0.5 rounded bg-aliceblue text-midnight/70 text-[10px] border border-timberwolf/40">
                            {sub}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="pt-3 border-t border-timberwolf/30 flex items-center justify-between text-xs">
                      <span className="text-midnight/60 font-medium">{cat.service_count || 0} listings</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleCategory(cat.id, cat.active)}
                          className="px-2.5 py-1 rounded-lg bg-aliceblue hover:bg-lightblue/30 text-midnight font-semibold text-[11px] transition-colors cursor-pointer"
                        >
                          {cat.active === 1 ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() =>
                            setCategoryModal({
                              isOpen: true,
                              isEdit: true,
                              id: cat.id,
                              name: cat.name,
                              slug: cat.slug,
                              icon: cat.icon,
                              description: cat.description || '',
                              sort_order: cat.sort_order || 1,
                              subcategories: Array.isArray(cat.subcategories) ? cat.subcategories.join(', ') : '',
                              image_url: cat.image_url || ''
                            })
                          }
                          className="p-1 rounded-lg bg-aliceblue hover:bg-lightblue/30 text-midnight/70 hover:text-midnight transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(cat.id, cat.name)}
                          disabled={actionLoading === `del-cat-${cat.id}`}
                          title="Delete or soft-deactivate category"
                          className="p-1 rounded-lg bg-aliceblue hover:bg-rose-50 text-midnight/40 hover:text-rose-600 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 5: OPPORTUNITIES MANAGEMENT */}
          {/* ===================================================================== */}
          {activeTab === 'opportunities' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
                <div>
                  <h1 className="text-2xl font-extrabold text-midnight tracking-tight">
                    Platform Opportunities & Applications
                  </h1>
                  <p className="text-xs text-midnight/70 mt-1">
                    Post high-value client briefs, manage expert applications, and moderate published opportunities.
                  </p>
                </div>
                <button
                  onClick={() =>
                    setOpportunityModal({
                      isOpen: true,
                      title: '',
                      category_id: categoriesList[0]?.id || 'cat-tech',
                      subcategory: '',
                      description: '',
                      duration_minutes: 45,
                      budget: 90,
                      location: 'Worldwide · Remote',
                      deadline: '',
                      pricing_type: 'free',
                      entry_fee_usd: 0,
                      skills: '',
                      requirements: '',
                      is_featured: false
                    })
                  }
                  className="btn-shine inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-midnight text-aliceblue font-semibold text-xs hover:bg-midnight-hover shadow-subtle transition-all cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4 text-moonstone" />
                  <span>Post New Opportunity</span>
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-timberwolf/60 overflow-hidden shadow-card">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-aliceblue-surface border-b border-timberwolf/40 text-midnight/70">
                        <th className="py-3 px-4 font-semibold">Title & Brief</th>
                        <th className="py-3 px-4 font-semibold">Category</th>
                        <th className="py-3 px-4 font-semibold">Budget</th>
                        <th className="py-3 px-4 font-semibold">Duration</th>
                        <th className="py-3 px-4 font-semibold">Pricing / Fee</th>
                        <th className="py-3 px-4 font-semibold">Status</th>
                        <th className="py-3 px-4 font-semibold">Applications</th>
                        <th className="py-3 px-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-timberwolf/30">
                      {opportunitiesList.map((opp) => (
                        <tr key={opp.id} className="hover:bg-aliceblue/50 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-midnight max-w-sm truncate">{opp.title}</div>
                            <div className="text-[11px] text-midnight/60 line-clamp-1">{opp.description}</div>
                          </td>
                          <td className="py-3.5 px-4 text-midnight/80 font-medium">{opp.category_name}</td>
                          <td className="py-3.5 px-4 font-mono font-bold text-midnight">${formatCurrency(opp.budget)}</td>
                          <td className="py-3.5 px-4 text-midnight/70">{opp.duration_minutes} mins</td>
                          <td className="py-3.5 px-4">
                            {opp.pricing_type === 'paid' && Number(opp.entry_fee_usd) > 0 ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 font-mono">
                                PAID: ${formatCurrency(opp.entry_fee_usd)}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                FREE
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {opp.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-semibold text-midnight">
                            {opp.applicant_count || 0} bids
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {opp.status === 'open' ? (
                                <button
                                  onClick={() => handleUpdateOpportunityStatus(opp.id, 'closed')}
                                  disabled={actionLoading === `status-opp-${opp.id}`}
                                  className="px-2 py-1 rounded-lg bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 font-semibold text-[11px] cursor-pointer"
                                >
                                  Close
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleUpdateOpportunityStatus(opp.id, 'open')}
                                  disabled={actionLoading === `status-opp-${opp.id}`}
                                  className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-semibold text-[11px] cursor-pointer"
                                >
                                  Reopen
                                </button>
                              )}
                              <button
                                onClick={() => handleDuplicateOpportunity(opp.id)}
                                disabled={actionLoading === `dup-opp-${opp.id}`}
                                title="Duplicate this opportunity brief"
                                className="p-1.5 rounded-lg bg-aliceblue text-midnight/70 hover:text-midnight transition-colors cursor-pointer"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteOpportunity(opp.id)}
                                disabled={actionLoading === `del-opp-${opp.id}`}
                                className="p-1.5 rounded-lg bg-aliceblue text-midnight/40 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 6: SESSIONS & CONSULTATION REQUESTS */}
          {/* ===================================================================== */}
          {activeTab === 'consultation_requests' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
                <div>
                  <h1 className="text-2xl font-extrabold text-midnight tracking-tight">
                    Consultation Requests & 10-Minute SLA Timers
                  </h1>
                  <p className="text-xs text-midnight/70 mt-1">
                    Monitor stage 1 requests, 10-minute expert response countdowns, acceptance rates, and stage 3 payments.
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-timberwolf/60 overflow-hidden shadow-card">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-aliceblue-surface border-b border-timberwolf/40 text-midnight/70">
                        <th className="py-3 px-4 font-semibold">Request ID</th>
                        <th className="py-3 px-4 font-semibold">Client</th>
                        <th className="py-3 px-4 font-semibold">Requested Expert</th>
                        <th className="py-3 px-4 font-semibold">Service</th>
                        <th className="py-3 px-4 font-semibold">SLA Countdown</th>
                        <th className="py-3 px-4 font-semibold">Status</th>
                        <th className="py-3 px-4 font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-timberwolf/30">
                      {consultationRequestsList.map((req) => (
                        <tr key={req.id} className="hover:bg-aliceblue/50 transition-colors">
                          <td className="py-3.5 px-4 font-mono font-bold text-midnight">{req.id}</td>
                          <td className="py-3.5 px-4 font-semibold text-midnight">{req.client_name}</td>
                          <td className="py-3.5 px-4 font-semibold text-midnight">{req.provider_name}</td>
                          <td className="py-3.5 px-4 text-midnight/80 font-medium max-w-xs truncate">{req.service_title}</td>
                          <td className="py-3.5 px-4">
                            <AdminRequestTimer deadline={req.response_deadline} status={req.status} />
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                req.status === 'ACCEPTED' || req.status === 'PAID'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : req.status === 'PENDING_EXPERT'
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {req.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-midnight">
                            ${formatCurrency(req.total_price)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 7: FINANCE & TRANSACTIONS LEDGER */}
          {activeTab === 'finance' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
                <h1 className="text-2xl font-extrabold text-midnight tracking-tight">
                  Financial Ledger & Platform Economics
                </h1>
                <p className="text-xs text-midnight/70 mt-1">
                  15% platform take, 85% expert share, verified payment transactions, and refund audit records.
                </p>
              </div>

              {/* Finance KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card">
                  <span className="text-xs font-bold text-midnight/60 uppercase tracking-wider">Gross Volume</span>
                  <div className="text-2xl font-extrabold text-midnight font-mono mt-1">
                    ${formatCurrency(stats?.grossRevenue)}
                  </div>
                </div>

                <div className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card">
                  <span className="text-xs font-bold text-midnight/60 uppercase tracking-wider">Platform Take (15%)</span>
                  <div className="text-2xl font-extrabold text-moonstone-dark font-mono mt-1">
                    ${formatCurrency(stats?.platformRevenue)}
                  </div>
                </div>

                <div className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card">
                  <span className="text-xs font-bold text-midnight/60 uppercase tracking-wider">Expert Payouts (85%)</span>
                  <div className="text-2xl font-extrabold text-emerald-700 font-mono mt-1">
                    ${formatCurrency(stats?.expertPayouts)}
                  </div>
                </div>

                <div className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card">
                  <span className="text-xs font-bold text-midnight/60 uppercase tracking-wider">Total Refunds</span>
                  <div className="text-2xl font-extrabold text-rose-700 font-mono mt-1">
                    ${formatCurrency(stats?.totalRefunds)}
                  </div>
                </div>
              </div>

              {/* Transactions Ledger Table */}
              <div className="bg-white rounded-2xl border border-timberwolf/60 overflow-hidden shadow-card">
                <div className="p-4 border-b border-timberwolf/40 flex items-center justify-between">
                  <h3 className="font-bold text-sm text-midnight">Authoritative Transaction Records</h3>
                  <span className="text-xs text-midnight/60">{paymentsList.length} total entries</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-aliceblue-surface border-b border-timberwolf/40 text-midnight/70">
                        <th className="py-3 px-4 font-semibold">Payment ID</th>
                        <th className="py-3 px-4 font-semibold">User</th>
                        <th className="py-3 px-4 font-semibold">Type</th>
                        <th className="py-3 px-4 font-semibold">Gross Amount</th>
                        <th className="py-3 px-4 font-semibold">Platform Share (15%)</th>
                        <th className="py-3 px-4 font-semibold">Status</th>
                        <th className="py-3 px-4 font-semibold">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-timberwolf/30">
                      {paymentsList.map((p) => (
                        <tr key={p.id} className="hover:bg-aliceblue/50 transition-colors">
                          <td className="py-3.5 px-4 font-mono font-bold text-midnight">{p.id}</td>
                          <td className="py-3.5 px-4 font-semibold text-midnight">{p.user_name || p.user_id}</td>
                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-aliceblue text-midnight border border-timberwolf/60">
                              {p.type}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-midnight">${formatCurrency(p.amount)}</td>
                          <td className="py-3.5 px-4 font-mono text-moonstone-dark">
                            ${p.type === 'session_payment' ? formatCurrency(formatNumber(p.amount) * 0.15) : '—'}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {p.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-midnight/60">{p.created_at}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 8: EXPERT VERIFICATION REVIEW QUEUE */}
          {/* ===================================================================== */}
          {activeTab === 'verifications' && (
            <div className="space-y-5">
              <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
                <h1 className="text-2xl font-extrabold text-midnight tracking-tight">
                  Expert Verification Review Queue
                </h1>
                <p className="text-xs text-midnight/70 mt-1">
                  Inspect credentials, bio, languages, skills, experience, and service rates before approving badge.
                </p>
              </div>

              {pendingVerifications.length === 0 ? (
                <div className="bg-white rounded-2xl border border-timberwolf/70 p-10 text-center shadow-card space-y-3">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h3 className="text-base font-bold text-midnight">Review Queue is All Clear!</h3>
                  <p className="text-xs text-midnight/60">All expert accounts on HireByMinute have been reviewed.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {pendingVerifications.map((p) => (
                    <div key={p.id} className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card space-y-4">
                      <div className="flex items-start gap-4">
                        <img
                          src={p.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.full_name}`}
                          alt={p.full_name}
                          className="w-14 h-14 rounded-full object-cover border-2 border-lightblue"
                        />
                        <div className="flex-1">
                          <h3 className="font-bold text-base text-midnight">{p.full_name}</h3>
                          <p className="text-xs text-midnight/70 font-medium">@{p.username}</p>
                          <p className="text-xs text-moonstone font-semibold mt-0.5">{p.headline || 'Expert Provider'}</p>
                        </div>
                      </div>

                      <p className="text-xs text-midnight/80 leading-relaxed bg-aliceblue p-3 rounded-xl border border-timberwolf/40">
                        {p.bio || 'No bio submitted.'}
                      </p>

                      <div className="space-y-1.5 text-xs text-midnight/70">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-midnight/50">Location:</span>
                          <span>{[p.city, p.country].filter(Boolean).join(', ') || 'Worldwide'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-midnight/50">Experience:</span>
                          <span>{p.experience_years || 5} years</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-midnight/50">Languages:</span>
                          <span>{p.languages ? p.languages.join(', ') : 'English'}</span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-timberwolf/30 flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setRejectVerificationModal(p);
                            setRejectionReason('');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 text-xs font-semibold cursor-pointer"
                        >
                          Reject with Note
                        </button>

                        <button
                          onClick={() => handleToggleVerification(p.id, 0)}
                          disabled={actionLoading === `verify-${p.id}`}
                          className="btn-shine px-4 py-1.5 rounded-xl bg-midnight text-aliceblue hover:bg-midnight-hover font-semibold text-xs shadow-subtle cursor-pointer"
                        >
                          Approve Verification
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 9: SPECIAL ADMIN FLOW — ADD USER ($0 LISTING FEE WAIVER) */}
          {/* ===================================================================== */}
          {activeTab === 'add_user' && (
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-moonstone/10 text-moonstone-dark text-[11px] font-bold border border-moonstone/30 mb-2">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Administrative Exception</span>
                </div>
                <h1 className="text-2xl font-extrabold text-midnight tracking-tight">
                  Direct User Provisioning ($0 Fee Waiver)
                </h1>
                <p className="text-xs text-midnight/70 mt-1">
                  Create expert or client profiles directly. Experts provisioned by Admin receive an automatic $0 listing fee waiver with audit tracking.
                </p>
              </div>

              <form onSubmit={handleAdminCreateUser} className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card space-y-5">
                {/* Role selection */}
                <div>
                  <label className="block text-xs font-bold text-midnight uppercase tracking-wider mb-1.5">Account Role</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setNewUserRole('provider')}
                      className={`p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        newUserRole === 'provider'
                          ? 'bg-midnight text-white border-midnight shadow-subtle'
                          : 'bg-aliceblue text-midnight border-timberwolf/60 hover:bg-white'
                      }`}
                    >
                      Expert / Provider (Monetize Time)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewUserRole('client')}
                      className={`p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        newUserRole === 'client'
                          ? 'bg-midnight text-white border-midnight shadow-subtle'
                          : 'bg-aliceblue text-midnight border-timberwolf/60 hover:bg-white'
                      }`}
                    >
                      Client (Book Consultations)
                    </button>
                  </div>
                </div>

                {/* Name & Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-midnight mb-1">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      placeholder="Dr. Maya Lin"
                      className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs text-midnight focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 shadow-subtle"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-midnight mb-1">Email Address *</label>
                    <input
                      type="email"
                      required
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="maya@example.com"
                      className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs text-midnight focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 shadow-subtle"
                    />
                  </div>
                </div>

                {/* Password & Verified */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-midnight mb-1">Temporary Password</label>
                    <input
                      type="text"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs text-midnight focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 shadow-subtle font-mono"
                    />
                  </div>
                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-midnight">
                      <input
                        type="checkbox"
                        checked={newUserVerified}
                        onChange={(e) => setNewUserVerified(e.target.checked)}
                        className="rounded text-moonstone focus:ring-moonstone"
                      />
                      <span>Mark Expert as Verified Immediately</span>
                    </label>
                  </div>
                </div>

                {/* Expert-Specific Fields */}
                {newUserRole === 'provider' && (
                  <div className="p-4 bg-aliceblue rounded-xl border border-timberwolf/40 space-y-4">
                    <div className="text-xs font-bold text-midnight uppercase tracking-wider">Expert Service & Rate</div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-midnight mb-1">Service Title</label>
                        <input
                          type="text"
                          value={newUserServiceTitle}
                          onChange={(e) => setNewUserServiceTitle(e.target.value)}
                          placeholder="LLM Fine-Tuning & System Design"
                          className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs text-midnight focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 shadow-subtle"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-midnight mb-1">Price Per Minute ($)</label>
                        <input
                          type="number"
                          step="0.25"
                          min="0.5"
                          value={newUserRate}
                          onChange={(e) => setNewUserRate(parseFloat(e.target.value) || 1.5)}
                          className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs text-midnight focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 shadow-subtle font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-midnight mb-1">Service Description</label>
                      <textarea
                        rows={2}
                        value={newUserServiceDesc}
                        onChange={(e) => setNewUserServiceDesc(e.target.value)}
                        placeholder="Deep-dive architectural review and fine-tuning recommendations..."
                        className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs text-midnight focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 shadow-subtle"
                      />
                    </div>
                  </div>
                )}

                {/* Location */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-midnight mb-1">Country</label>
                    <select
                      value={newUserCountry}
                      onChange={(e) => setNewUserCountry(e.target.value)}
                      className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs text-midnight focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 shadow-subtle"
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-midnight mb-1">City / Metro</label>
                    <input
                      type="text"
                      value={newUserCity}
                      onChange={(e) => setNewUserCity(e.target.value)}
                      placeholder="San Francisco, CA"
                      className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs text-midnight focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 shadow-subtle"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-timberwolf/40 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab('users')}
                    className="px-4 py-2 rounded-xl bg-white border border-timberwolf/70 text-midnight text-xs font-semibold hover:bg-aliceblue cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading === 'create-user'}
                    className="btn-shine px-5 py-2 rounded-xl bg-midnight text-aliceblue font-semibold text-xs hover:bg-midnight-hover shadow-subtle cursor-pointer disabled:opacity-50"
                  >
                    {actionLoading === 'create-user' ? 'Creating Account...' : 'Create Account & Waive Fee'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 10: EMAIL & NOTIFICATION LOGS (COMMUNICATION) */}
          {/* ===================================================================== */}
          {activeTab === 'emails' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
                <div>
                  <h1 className="text-2xl font-extrabold text-midnight tracking-tight">
                    Transactional Email Delivery Logs
                  </h1>
                  <p className="text-xs text-midnight/70 mt-1">
                    Sanitized audit records of all outbound emails (OTPs and authentication secrets are scrubbed).
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-timberwolf/60 overflow-hidden shadow-card">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-aliceblue-surface border-b border-timberwolf/40 text-midnight/70">
                        <th className="py-3 px-4 font-semibold">Log ID</th>
                        <th className="py-3 px-4 font-semibold">Recipient</th>
                        <th className="py-3 px-4 font-semibold">Template</th>
                        <th className="py-3 px-4 font-semibold">Subject</th>
                        <th className="py-3 px-4 font-semibold">Delivery Status</th>
                        <th className="py-3 px-4 font-semibold">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-timberwolf/30">
                      {emailLogsList.map((log) => (
                        <tr key={log.id} className="hover:bg-aliceblue/50 transition-colors">
                          <td className="py-3.5 px-4 font-mono font-bold text-midnight">{log.id}</td>
                          <td className="py-3.5 px-4 font-semibold text-midnight">{log.recipient}</td>
                          <td className="py-3.5 px-4 font-mono text-midnight/70">{log.template}</td>
                          <td className="py-3.5 px-4 text-midnight max-w-xs truncate">{log.subject}</td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                log.status === 'SENT'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {log.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-midnight/60">{log.created_at}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB: REGISTRATION OFFERS & PROMOTIONAL CAMPAIGNS */}
          {/* ===================================================================== */}
          {activeTab === 'registration_offers' && (
            <div className="space-y-6 animate-fade-in">
              {/* Header Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-moonstone">Campaign Engine</span>
                    {effectiveFeeData?.isPromotionActive && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                        LIVE PROMOTION ACTIVE
                      </span>
                    )}
                  </div>
                  <h1 className="text-2xl font-extrabold text-midnight tracking-tight mt-1">
                    Registration & Listing Offers
                  </h1>
                  <p className="text-xs text-midnight/70 mt-1">
                    Manage temporary $0 listing fee promotions, scheduled platform offers, and base expert registration fees.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleLaunchFree24h}
                    disabled={actionLoading === 'launch-24h'}
                    className="btn-shine px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-subtle flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4 text-emerald-200" />
                    <span>Launch 24-Hour Free Promotion ($0.00)</span>
                  </button>
                  <button
                    onClick={() => {
                      setNewCampaignStartTime(new Date().toISOString().slice(0, 16));
                      setCampaignModalOpen(true);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-midnight hover:bg-midnight-hover text-aliceblue font-bold text-xs shadow-subtle flex items-center gap-2 cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4 text-moonstone" />
                    <span>Schedule Campaign</span>
                  </button>
                </div>
              </div>

              {/* Real-time Status Card */}
              {effectiveFeeData?.isPromotionActive && effectiveFeeData?.activeCampaign ? (
                <div className="relative overflow-hidden bg-gradient-to-br from-emerald-900 via-midnight to-midnight text-aliceblue rounded-3xl p-6 sm:p-8 border border-emerald-500/40 shadow-card">
                  <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
                  
                  <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-3 max-w-xl">
                      <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-full text-xs font-extrabold uppercase tracking-wider">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                        <span>FREE REGISTRATION ACTIVE</span>
                      </div>
                      
                      <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                        {effectiveFeeData.activeCampaign.name}
                      </h2>
                      <p className="text-xs text-aliceblue/80 leading-relaxed">
                        {effectiveFeeData.activeCampaign.description || 'Experts can register and publish new service listings with $0.00 listing fee.'}
                      </p>

                      <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-aliceblue/70">
                        <div>
                          <span className="text-white/50 block text-[10px] uppercase font-bold">Active Fee</span>
                          <span className="font-mono font-extrabold text-emerald-400 text-lg">$0.00 USD</span>
                        </div>
                        <div className="h-8 w-[1px] bg-white/10" />
                        <div>
                          <span className="text-white/50 block text-[10px] uppercase font-bold">Standard Fee</span>
                          <span className="font-mono font-bold text-white/80 line-through">${formatCurrency(effectiveFeeData.baseFee)} USD</span>
                        </div>
                        <div className="h-8 w-[1px] bg-white/10" />
                        <div>
                          <span className="text-white/50 block text-[10px] uppercase font-bold">Started At</span>
                          <span className="font-mono text-white/90 text-[11px]">{new Date(effectiveFeeData.activeCampaign.start_time).toLocaleString()}</span>
                        </div>
                        <div className="h-8 w-[1px] bg-white/10" />
                        <div>
                          <span className="text-white/50 block text-[10px] uppercase font-bold">Expires At</span>
                          <span className="font-mono text-white/90 text-[11px]">{new Date(effectiveFeeData.activeCampaign.end_time).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:items-end gap-4 shrink-0">
                      <div className="text-right">
                        <span className="text-xs font-bold text-emerald-300 block mb-1.5 uppercase tracking-wider">Live Time Remaining</span>
                        <AdminCampaignCountdown
                          endTime={effectiveFeeData.activeCampaign.end_time}
                          onExpire={loadAdminData}
                        />
                      </div>

                      <button
                        onClick={() => handleEndCampaignEarly(effectiveFeeData.activeCampaign.id)}
                        disabled={actionLoading?.startsWith('cancel-camp')}
                        className="px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                      >
                        End Promotion Early
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold text-midnight/60">
                      <span className="w-2 h-2 rounded-full bg-zinc-400" />
                      <span>Standard Fee Active (No Active Promotional Campaign)</span>
                    </div>
                    <h2 className="text-xl font-bold text-midnight">
                      Standard Registration Fee: <span className="font-mono text-moonstone">${formatCurrency(effectiveFeeData?.baseFee || 2.00)} USD</span>
                    </h2>
                    <p className="text-xs text-midnight/70 max-w-xl">
                      When no promotional campaign is active, experts pay the base listing fee configured in platform settings to activate and publish new services.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setNewBaseFeeInput(Number(effectiveFeeData?.baseFee || 2.00));
                        setEditBaseFeeModalOpen(true);
                      }}
                      className="px-4 py-2.5 rounded-xl bg-aliceblue text-midnight border border-timberwolf/70 text-xs font-bold hover:bg-lightblue/30 transition-all cursor-pointer"
                    >
                      Change Base Fee
                    </button>
                    <button
                      onClick={handleLaunchFree24h}
                      disabled={actionLoading === 'launch-24h'}
                      className="btn-shine px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-subtle flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className="w-4 h-4 text-emerald-200" />
                      <span>Activate 24h Free Launch Offer</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Campaigns Ledger & History Table */}
              <div className="bg-white rounded-2xl border border-timberwolf/60 overflow-hidden shadow-card">
                <div className="p-5 border-b border-timberwolf/40 flex items-center justify-between">
                  <div>
                    <h3 className="font-extrabold text-sm text-midnight">Campaign Ledger & History</h3>
                    <p className="text-xs text-midnight/60 mt-0.5">Authoritative history of all promotional registration campaigns.</p>
                  </div>
                  <span className="text-xs font-mono font-bold text-midnight/70">{campaignsList.length} total records</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-aliceblue-surface border-b border-timberwolf/40 text-midnight/70">
                        <th className="py-3 px-4 font-semibold">Campaign Name / ID</th>
                        <th className="py-3 px-4 font-semibold">Listing Fee</th>
                        <th className="py-3 px-4 font-semibold">Start Time (UTC/Local)</th>
                        <th className="py-3 px-4 font-semibold">End Time (UTC/Local)</th>
                        <th className="py-3 px-4 font-semibold">Status</th>
                        <th className="py-3 px-4 font-semibold">Created By</th>
                        <th className="py-3 px-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-timberwolf/30">
                      {campaignsList.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-midnight/50 font-medium">
                            No promotional campaigns recorded yet.
                          </td>
                        </tr>
                      ) : (
                        campaignsList.map((c) => (
                          <tr key={c.id} className="hover:bg-aliceblue/50 transition-colors">
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-midnight">{c.name}</div>
                              <div className="text-[10px] font-mono text-midnight/50 mt-0.5">{c.id}</div>
                            </td>
                            <td className="py-3.5 px-4 font-mono font-bold text-midnight">
                              {c.fee_usd === 0 ? (
                                <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                  $0.00 (FREE)
                                </span>
                              ) : (
                                `$${formatCurrency(c.fee_usd)}`
                              )}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-midnight/80 text-[11px]">
                              {new Date(c.start_time).toLocaleString()}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-midnight/80 text-[11px]">
                              {new Date(c.end_time).toLocaleString()}
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                  c.status === 'active'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                                    : c.status === 'scheduled'
                                    ? 'bg-blue-50 text-blue-700 border border-blue-300'
                                    : c.status === 'cancelled'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-300'
                                    : 'bg-zinc-100 text-zinc-600 border border-zinc-300'
                                }`}
                              >
                                {c.status}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-midnight/70">
                              <div className="font-semibold text-midnight">{c.created_by_name || 'Admin'}</div>
                              <div className="text-[10px] text-midnight/50">{c.created_by}</div>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              {(c.status === 'active' || c.status === 'scheduled') && (
                                <button
                                  onClick={() => handleEndCampaignEarly(c.id)}
                                  disabled={actionLoading === `cancel-camp-${c.id}`}
                                  className="px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB: HOMEPAGE SECTIONS CONTROL */}
          {/* ===================================================================== */}
          {activeTab === 'homepage' && (
            <AdminContentErrorBoundary activeTab={activeTab} onReset={loadAdminData}>
              <AdminHomepageControl />
            </AdminContentErrorBoundary>
          )}

          {/* ===================================================================== */}
          {/* TAB: HEADER & NAVIGATION CONTROL */}
          {/* ===================================================================== */}
          {activeTab === 'header_navigation' && (
            <AdminContentErrorBoundary activeTab={activeTab} onReset={loadAdminData}>
              <AdminHeaderNavControl onRefreshData={loadAdminData} />
            </AdminContentErrorBoundary>
          )}

          {/* ===================================================================== */}
          {/* TAB: FOOTER CMS */}
          {/* ===================================================================== */}
          {activeTab === 'footer' && (
            <AdminContentErrorBoundary activeTab={activeTab} onReset={loadAdminData}>
              <AdminFooterControl />
            </AdminContentErrorBoundary>
          )}

          {/* ===================================================================== */}
          {/* TAB: CONTACT SETTINGS */}
          {/* ===================================================================== */}
          {activeTab === 'contact' && (
            <AdminContentErrorBoundary activeTab={activeTab} onReset={loadAdminData}>
              <AdminContactSettings />
            </AdminContentErrorBoundary>
          )}

          {/* ===================================================================== */}
          {/* TAB: FAQ MANAGEMENT */}
          {/* ===================================================================== */}
          {activeTab === 'faq' && (
            <AdminContentErrorBoundary activeTab={activeTab} onReset={loadAdminData}>
              <AdminFaqControl />
            </AdminContentErrorBoundary>
          )}

          {/* ===================================================================== */}
          {/* TAB: BANNERS & BROADCASTS */}
          {/* ===================================================================== */}
          {activeTab === 'banners' && (
            <AdminContentErrorBoundary activeTab={activeTab} onReset={loadAdminData}>
              <AdminBannersControl />
            </AdminContentErrorBoundary>
          )}

          {/* ===================================================================== */}
          {/* TAB: PAGES & LEGAL CMS */}
          {/* ===================================================================== */}
          {activeTab === 'cms_pages' && (
            <AdminContentErrorBoundary activeTab={activeTab} onReset={loadAdminData}>
              <AdminPagesControl />
            </AdminContentErrorBoundary>
          )}

          {/* ===================================================================== */}
          {/* TAB: SEO & META TAGS CONTROL */}
          {/* ===================================================================== */}
          {activeTab === 'seo' && (
            <AdminContentErrorBoundary activeTab={activeTab} onReset={loadAdminData}>
              <AdminSeoControl />
            </AdminContentErrorBoundary>
          )}


          {/* ===================================================================== */}
          {/* TAB: REVIEWS MODERATION */}
          {/* ===================================================================== */}
          {activeTab === 'reviews' && (
            <AdminContentErrorBoundary activeTab={activeTab} onReset={loadAdminData}>
              <AdminReviewsControl />
            </AdminContentErrorBoundary>
          )}

          {/* ===================================================================== */}
          {/* TAB 11: PLATFORM SETTINGS & ADMIN PASSWORD */}
          {/* ===================================================================== */}
          {activeTab === 'settings' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
                <h1 className="text-2xl font-extrabold text-midnight tracking-tight">
                  Platform Settings & Administrator Credentials
                </h1>
                <p className="text-xs text-midnight/70 mt-1">
                  Manage master credentials and review platform configuration variables.
                </p>
              </div>

              {/* Password Change Box */}
              <form onSubmit={handleAdminChangePassword} className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card space-y-4">
                <h3 className="text-sm font-bold text-midnight flex items-center gap-2">
                  <Lock className="w-4 h-4 text-moonstone" />
                  <span>Change Administrator Password</span>
                </h3>

                {passwordChangeMessage && (
                  <div
                    className={`p-3 rounded-xl text-xs font-semibold border ${
                      passwordChangeMessage.error
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}
                  >
                    {passwordChangeMessage.text}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-midnight mb-1">Current Password</label>
                  <input
                    type="password"
                    required
                    value={currentAdminPassword}
                    onChange={(e) => setCurrentAdminPassword(e.target.value)}
                    className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs text-midnight focus:border-moonstone shadow-subtle"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-midnight mb-1">New Password (8+ chars)</label>
                    <input
                      type="password"
                      required
                      value={newAdminPassword}
                      onChange={(e) => setNewAdminPassword(e.target.value)}
                      className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs text-midnight focus:border-moonstone shadow-subtle"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-midnight mb-1">Confirm New Password</label>
                    <input
                      type="password"
                      required
                      value={confirmAdminPassword}
                      onChange={(e) => setConfirmAdminPassword(e.target.value)}
                      className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs text-midnight focus:border-moonstone shadow-subtle"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={actionLoading === 'change-pass'}
                  className="btn-shine px-4 py-2 rounded-xl bg-midnight text-aliceblue font-semibold text-xs hover:bg-midnight-hover shadow-subtle cursor-pointer disabled:opacity-50"
                >
                  {actionLoading === 'change-pass' ? 'Updating Password...' : 'Update Admin Password'}
                </button>
              </form>

              {/* Platform Variables Review */}
              <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card space-y-3">
                <h3 className="text-sm font-bold text-midnight">Platform Parameters</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between py-1.5 border-b border-timberwolf/30">
                    <span className="text-midnight/70">Expert Payout Split</span>
                    <span className="font-bold text-midnight font-mono">85% Expert / 15% Platform</span>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-timberwolf/30">
                    <span className="text-midnight/70">Standard Listing Fee</span>
                    <span className="font-bold text-midnight font-mono">$2.00 (Waived for Admin-created)</span>
                  </div>
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-midnight/70">Consultation Response SLA</span>
                    <span className="font-bold text-midnight font-mono">10 Minutes Server-Authoritative</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 12: IMMUTABLE AUDIT TRAIL */}
          {/* ===================================================================== */}
          {activeTab === 'audit' && (
            <div className="space-y-5">
              <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
                <h1 className="text-2xl font-extrabold text-midnight tracking-tight">
                  Immutable Administrative Audit Logs
                </h1>
                <p className="text-xs text-midnight/70 mt-1">
                  Complete chronological trail of all user modifications, provisioning exceptions, verifications, and financial overrides.
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-timberwolf/60 overflow-hidden shadow-card">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-aliceblue-surface border-b border-timberwolf/40 text-midnight/70">
                        <th className="py-3 px-4 font-semibold">Timestamp</th>
                        <th className="py-3 px-4 font-semibold">Admin</th>
                        <th className="py-3 px-4 font-semibold">Action</th>
                        <th className="py-3 px-4 font-semibold">Target Entity</th>
                        <th className="py-3 px-4 font-semibold">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-timberwolf/30">
                      {auditLogsList.map((log) => (
                        <tr key={log.id} className="hover:bg-aliceblue/50 transition-colors">
                          <td className="py-3.5 px-4 font-mono text-midnight/60">{log.created_at}</td>
                          <td className="py-3.5 px-4 font-bold text-midnight">{log.admin_name}</td>
                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-aliceblue text-midnight border border-timberwolf/60">
                              {log.action}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-midnight/80 font-medium">
                            {log.target_type}: {log.target_id}
                          </td>
                          <td className="py-3.5 px-4">
                            {log.details_json ? (
                              <button
                                onClick={() => setSelectedAuditDetail(log)}
                                title="Click to inspect full audit event JSON details"
                                className="inline-flex items-center gap-1.5 max-w-xs truncate text-left font-mono text-[11px] text-midnight/70 hover:text-midnight bg-aliceblue/80 hover:bg-lightblue/30 px-2.5 py-1 rounded-lg border border-timberwolf/40 cursor-pointer transition-colors"
                              >
                                <span className="truncate">{log.details_json}</span>
                                <Eye className="w-3.5 h-3.5 shrink-0 text-moonstone" />
                              </button>
                            ) : (
                              <span className="text-midnight/40 font-mono text-[11px]">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 13: MODERATION & REPORTS */}
          {activeTab === 'reports' && (
            <div className="space-y-5">
              <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
                <h1 className="text-2xl font-extrabold text-midnight tracking-tight">
                  Moderation Queue & Safety Reports
                </h1>
                <p className="text-xs text-midnight/70 mt-1">
                  Review user reports, take moderation action, and record notes.
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-timberwolf/60 overflow-hidden shadow-card">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-aliceblue-surface border-b border-timberwolf/40 text-midnight/70">
                        <th className="py-3 px-4 font-semibold">Report ID</th>
                        <th className="py-3 px-4 font-semibold">Reporter</th>
                        <th className="py-3 px-4 font-semibold">Target Entity</th>
                        <th className="py-3 px-4 font-semibold">Reason</th>
                        <th className="py-3 px-4 font-semibold">Status</th>
                        <th className="py-3 px-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-timberwolf/30">
                      {reportsList.map((r) => (
                        <tr key={r.id} className="hover:bg-aliceblue/50 transition-colors">
                          <td className="py-3.5 px-4 font-mono font-bold text-midnight">{r.id}</td>
                          <td className="py-3.5 px-4 font-semibold text-midnight">{r.reporter_name}</td>
                          <td className="py-3.5 px-4 text-midnight/80 font-medium">
                            {r.reported_type}: {r.reported_name || r.reported_id}
                          </td>
                          <td className="py-3.5 px-4 text-midnight max-w-xs">{r.reason}</td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                r.status === 'pending'
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}
                            >
                              {r.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => {
                                setActionReportModal(r);
                                setReportActionNotes(r.admin_notes || '');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-aliceblue hover:bg-lightblue/30 text-midnight font-semibold text-[11px] cursor-pointer"
                            >
                              Action Report
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB: TRAFFIC & ANALYTICS */}
          {/* ===================================================================== */}
          {activeTab === 'traffic' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-moonstone/10 text-moonstone-dark text-[11px] font-bold border border-moonstone/30 mb-2">
                    <Activity className="w-3 h-3 text-moonstone" />
                    <span>Telemetry & Throughput</span>
                  </div>
                  <h1 className="text-2xl font-extrabold text-midnight tracking-tight">
                    Traffic & Analytics
                  </h1>
                  <p className="text-xs text-midnight/70 mt-1">
                    Real-time platform throughput, conversion telemetry, user velocity, and engagement funnel.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={loadAdminData}
                    disabled={refreshing}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-aliceblue border border-timberwolf/60 text-midnight text-xs font-semibold hover:bg-lightblue/30 transition-all cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-moonstone' : ''}`} />
                    <span>Refresh Telemetry</span>
                  </button>
                </div>
              </div>

              {/* Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card">
                  <div className="flex items-center justify-between text-xs text-midnight/60 font-semibold mb-2">
                    <span>Registered Users</span>
                    <Users className="w-4 h-4 text-moonstone" />
                  </div>
                  <div className="text-2xl font-black text-midnight font-mono">{stats?.totalUsers || usersList.length}</div>
                  <div className="text-[11px] text-midnight/50 mt-1">
                    {stats?.totalClients || 0} clients · {stats?.totalProviders || 0} experts
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card">
                  <div className="flex items-center justify-between text-xs text-midnight/60 font-semibold mb-2">
                    <span>Live Consultations</span>
                    <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
                  </div>
                  <div className="text-2xl font-black text-emerald-600 font-mono">{stats?.activeSessions || 0}</div>
                  <div className="text-[11px] text-midnight/50 mt-1">
                    Active real-time WebRTC rooms
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card">
                  <div className="flex items-center justify-between text-xs text-midnight/60 font-semibold mb-2">
                    <span>Total Requests</span>
                    <Clock className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="text-2xl font-black text-midnight font-mono">{stats?.totalRequests || consultationRequestsList.length}</div>
                  <div className="text-[11px] text-midnight/50 mt-1">
                    Consultation requests placed
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card">
                  <div className="flex items-center justify-between text-xs text-midnight/60 font-semibold mb-2">
                    <span>Completed Sessions</span>
                    <CheckCircle2 className="w-4 h-4 text-moonstone" />
                  </div>
                  <div className="text-2xl font-black text-midnight font-mono">{stats?.completedSessions || 0}</div>
                  <div className="text-[11px] text-midnight/50 mt-1">
                    Successfully concluded calls
                  </div>
                </div>
              </div>

              {/* Conversion Funnel Card */}
              <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-midnight flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-moonstone" />
                    <span>Real-Time Conversion Funnel</span>
                  </h3>
                  <span className="text-[10px] font-bold text-midnight/50 bg-aliceblue px-2 py-0.5 rounded-full border border-timberwolf/60">
                    Audited Telemetry
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className="p-4 rounded-xl bg-aliceblue border border-timberwolf/40">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-midnight/70 font-medium">Request → Accepted</span>
                      <span className="font-bold text-midnight font-mono">{stats?.conversions?.requestToAcceptedRate ?? 0}%</span>
                    </div>
                    <div className="w-full h-2 bg-white rounded-full overflow-hidden border border-timberwolf/30">
                      <div
                        className="h-full bg-moonstone rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(stats?.conversions?.requestToAcceptedRate ?? 0, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-aliceblue border border-timberwolf/40">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-midnight/70 font-medium">Accepted → Paid</span>
                      <span className="font-bold text-midnight font-mono">{stats?.conversions?.acceptedToPaidRate ?? 0}%</span>
                    </div>
                    <div className="w-full h-2 bg-white rounded-full overflow-hidden border border-timberwolf/30">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(stats?.conversions?.acceptedToPaidRate ?? 0, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-aliceblue border border-timberwolf/40">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-midnight/70 font-medium">Paid → Completed</span>
                      <span className="font-bold text-midnight font-mono">{stats?.conversions?.paidToCompletedRate ?? 0}%</span>
                    </div>
                    <div className="w-full h-2 bg-white rounded-full overflow-hidden border border-timberwolf/30">
                      <div
                        className="h-full bg-midnight rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(stats?.conversions?.paidToCompletedRate ?? 0, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB: ACTIVE SESSIONS */}
          {/* ===================================================================== */}
          {activeTab === 'active_sessions' && (() => {
            const activeSessions = sessionsList.filter((s: any) =>
              ['ACTIVE', 'IN_PROGRESS', 'CONNECTED', 'WAITING'].includes(s.status)
            );
            return (
              <div className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200 mb-2">
                      <Radio className="w-3 h-3 animate-pulse text-emerald-600" />
                      <span>Live Consultation Engine</span>
                    </div>
                    <h1 className="text-2xl font-extrabold text-midnight tracking-tight">Active Sessions</h1>
                    <p className="text-xs text-midnight/70 mt-1">
                      Real-time monitoring of live consultation calls currently in progress.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={loadAdminData}
                      disabled={refreshing}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-aliceblue border border-timberwolf/60 text-midnight text-xs font-semibold hover:bg-lightblue/30 transition-all cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-moonstone' : ''}`} />
                      <span>Refresh</span>
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-timberwolf/60 overflow-hidden shadow-card">
                  {activeSessions.length === 0 ? (
                    <div className="py-16 text-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-aliceblue text-midnight/40 flex items-center justify-center mx-auto border border-timberwolf/40">
                        <Video className="w-6 h-6" />
                      </div>
                      <h4 className="text-sm font-bold text-midnight">No Active Sessions Right Now</h4>
                      <p className="text-xs text-midnight/60 max-w-sm mx-auto">
                        Real-time consultation sessions will appear here live once participants connect to WebRTC rooms.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-aliceblue-surface border-b border-timberwolf/40 text-midnight/70">
                            <th className="py-3 px-4 font-semibold">Session ID</th>
                            <th className="py-3 px-4 font-semibold">Client</th>
                            <th className="py-3 px-4 font-semibold">Expert</th>
                            <th className="py-3 px-4 font-semibold">Duration / Time</th>
                            <th className="py-3 px-4 font-semibold">Status</th>
                            <th className="py-3 px-4 font-semibold text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-timberwolf/30">
                          {activeSessions.map((s: any) => (
                            <tr key={s.id} className="hover:bg-aliceblue/50 transition-colors">
                              <td className="py-3.5 px-4 font-mono font-medium text-midnight">
                                {s.id?.slice(0, 8)}...
                              </td>
                              <td className="py-3.5 px-4 text-midnight">
                                <div className="font-semibold">{s.client_name || s.client_email || 'Client'}</div>
                                <div className="text-[10px] text-midnight/50 font-mono">{s.client_id?.slice(0, 8)}</div>
                              </td>
                              <td className="py-3.5 px-4 text-midnight">
                                <div className="font-semibold">{s.provider_name || s.expert_name || 'Expert'}</div>
                                <div className="text-[10px] text-midnight/50 font-mono">{s.provider_id?.slice(0, 8)}</div>
                              </td>
                              <td className="py-3.5 px-4 font-mono text-midnight/80">
                                {s.duration_minutes || s.actual_duration_minutes || 0} mins
                              </td>
                              <td className="py-3.5 px-4">
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 animate-pulse">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                                  {s.status}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-right">
                                <Link
                                  to={`/session/${s.id}`}
                                  target="_blank"
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-moonstone hover:underline"
                                >
                                  Inspect Room <ExternalLink className="w-3 h-3" />
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ===================================================================== */}
          {/* TAB: COMPLETED SESSIONS */}
          {/* ===================================================================== */}
          {activeTab === 'completed_sessions' && (() => {
            const completedSessions = sessionsList.filter((s: any) => s.status === 'COMPLETED');
            return (
              <div className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
                  <div>
                    <h1 className="text-2xl font-extrabold text-midnight tracking-tight">Completed Sessions</h1>
                    <p className="text-xs text-midnight/70 mt-1">
                      Historical archive of concluded consultations with duration, billing, and settlement logs.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-midnight bg-aliceblue px-3 py-1.5 rounded-xl border border-timberwolf/60">
                      Total: {completedSessions.length}
                    </span>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-timberwolf/60 overflow-hidden shadow-card">
                  {completedSessions.length === 0 ? (
                    <div className="py-16 text-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-aliceblue text-midnight/40 flex items-center justify-center mx-auto border border-timberwolf/40">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <h4 className="text-sm font-bold text-midnight">No Completed Sessions Yet</h4>
                      <p className="text-xs text-midnight/60 max-w-sm mx-auto">
                        Successfully finished consultations will be cataloged here with finalized billing and recording metrics.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-aliceblue-surface border-b border-timberwolf/40 text-midnight/70">
                            <th className="py-3 px-4 font-semibold">Session ID</th>
                            <th className="py-3 px-4 font-semibold">Client</th>
                            <th className="py-3 px-4 font-semibold">Expert</th>
                            <th className="py-3 px-4 font-semibold">Actual Duration</th>
                            <th className="py-3 px-4 font-semibold">Financial</th>
                            <th className="py-3 px-4 font-semibold">Concluded At</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-timberwolf/30">
                          {completedSessions.map((s: any) => (
                            <tr key={s.id} className="hover:bg-aliceblue/50 transition-colors">
                              <td className="py-3.5 px-4 font-mono font-medium text-midnight">
                                {s.id?.slice(0, 8)}...
                              </td>
                              <td className="py-3.5 px-4 text-midnight">
                                <div className="font-semibold">{s.client_name || s.client_email || 'Client'}</div>
                              </td>
                              <td className="py-3.5 px-4 text-midnight">
                                <div className="font-semibold">{s.provider_name || s.expert_name || 'Expert'}</div>
                              </td>
                              <td className="py-3.5 px-4 font-mono text-midnight/80">
                                {s.actual_duration_minutes || s.duration_minutes || 0} mins
                              </td>
                              <td className="py-3.5 px-4 font-mono font-bold text-midnight">
                                ${formatCurrency(s.total_price || s.price || 0)}
                              </td>
                              <td className="py-3.5 px-4 text-midnight/60">
                                {s.ended_at ? new Date(s.ended_at).toLocaleString() : s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ===================================================================== */}
          {/* TAB: TRANSACTIONS LEDGER */}
          {/* ===================================================================== */}
          {activeTab === 'transactions' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
                <div>
                  <h1 className="text-2xl font-extrabold text-midnight tracking-tight">Transactions Ledger</h1>
                  <p className="text-xs text-midnight/70 mt-1">
                    Complete authoritative financial ledger of payments, listing fees, settlements, and platform commissions.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-midnight bg-aliceblue px-3 py-1.5 rounded-xl border border-timberwolf/60">
                    Total Entries: {paymentsList.length}
                  </span>
                </div>
              </div>

              {/* Financial Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card">
                  <div className="text-xs text-midnight/60 font-semibold mb-1">Gross Settled Volume</div>
                  <div className="text-xl font-bold font-mono text-midnight">${formatCurrency(stats?.grossRevenue)}</div>
                </div>
                <div className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card">
                  <div className="text-xs text-midnight/60 font-semibold mb-1">Platform Revenue</div>
                  <div className="text-xl font-bold font-mono text-moonstone">${formatCurrency(stats?.platformRevenue)}</div>
                </div>
                <div className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card">
                  <div className="text-xs text-midnight/60 font-semibold mb-1">Expert Payouts</div>
                  <div className="text-xl font-bold font-mono text-emerald-600">${formatCurrency(stats?.expertPayouts)}</div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-timberwolf/60 overflow-hidden shadow-card">
                {paymentsList.length === 0 ? (
                  <div className="py-16 text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-aliceblue text-midnight/40 flex items-center justify-center mx-auto border border-timberwolf/40">
                      <DollarSign className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-midnight">No Transactions Recorded</h4>
                    <p className="text-xs text-midnight/60 max-w-sm mx-auto">
                      Client session payments, registration fees, and payouts will appear here in chronological sequence.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-aliceblue-surface border-b border-timberwolf/40 text-midnight/70">
                          <th className="py-3 px-4 font-semibold">Payment ID</th>
                          <th className="py-3 px-4 font-semibold">User</th>
                          <th className="py-3 px-4 font-semibold">Type</th>
                          <th className="py-3 px-4 font-semibold">Gross Amount</th>
                          <th className="py-3 px-4 font-semibold">Platform Share</th>
                          <th className="py-3 px-4 font-semibold">Status</th>
                          <th className="py-3 px-4 font-semibold">Gateway Ref</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-timberwolf/30">
                        {paymentsList.map((p: any) => (
                          <tr key={p.id} className="hover:bg-aliceblue/50 transition-colors">
                            <td className="py-3.5 px-4 font-mono font-medium text-midnight">
                              {p.id?.slice(0, 10)}...
                            </td>
                            <td className="py-3.5 px-4 text-midnight font-medium">
                              {p.user_name || p.user_email || p.user_id?.slice(0, 8) || 'Customer'}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-aliceblue text-midnight border border-timberwolf/50">
                                {p.type || 'payment'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-mono font-bold text-midnight">
                              ${formatCurrency(p.amount)}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-moonstone font-semibold">
                              ${formatCurrency(p.platform_fee ?? (p.type === 'session_payment' ? formatNumber(p.amount) * 0.15 : 0))}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                p.status === 'completed' || p.status === 'captured'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : p.status === 'refunded'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}>
                                {p.status}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-mono text-[11px] text-midnight/60">
                              {p.razorpay_payment_id || p.stripe_payment_id || p.gateway_ref || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB: REFUNDS AUDIT */}
          {/* ===================================================================== */}
          {activeTab === 'refunds' && (() => {
            const refunds = paymentsList.filter((p: any) =>
              p.type === 'refund' || p.status === 'refunded' || p.status === 'REFUNDED'
            );
            return (
              <div className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
                  <div>
                    <h1 className="text-2xl font-extrabold text-midnight tracking-tight">Refunds Audit</h1>
                    <p className="text-xs text-midnight/70 mt-1">
                      Audit trail of customer refunds, reversals, and disputed settlements.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-rose-700 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200">
                      Total Reversals: ${formatCurrency(stats?.totalRefunds)}
                    </span>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-timberwolf/60 overflow-hidden shadow-card">
                  {refunds.length === 0 ? (
                    <div className="py-16 text-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-aliceblue text-midnight/40 flex items-center justify-center mx-auto border border-timberwolf/40">
                        <RefreshCw className="w-6 h-6" />
                      </div>
                      <h4 className="text-sm font-bold text-midnight">No Refunds Recorded</h4>
                      <p className="text-xs text-midnight/60 max-w-sm mx-auto">
                        No refunded consultations or payment reversals are currently on file. Clean billing audit record.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-aliceblue-surface border-b border-timberwolf/40 text-midnight/70">
                            <th className="py-3 px-4 font-semibold">Payment / Refund ID</th>
                            <th className="py-3 px-4 font-semibold">User</th>
                            <th className="py-3 px-4 font-semibold">Amount Refunded</th>
                            <th className="py-3 px-4 font-semibold">Date</th>
                            <th className="py-3 px-4 font-semibold">Gateway Reference</th>
                            <th className="py-3 px-4 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-timberwolf/30">
                          {refunds.map((r: any) => (
                            <tr key={r.id} className="hover:bg-aliceblue/50 transition-colors">
                              <td className="py-3.5 px-4 font-mono font-medium text-midnight">
                                {r.id?.slice(0, 10)}...
                              </td>
                              <td className="py-3.5 px-4 text-midnight font-medium">
                                {r.user_name || r.user_email || 'Customer'}
                              </td>
                              <td className="py-3.5 px-4 font-mono font-bold text-rose-600">
                                -${formatCurrency(r.amount)}
                              </td>
                              <td className="py-3.5 px-4 text-midnight/60">
                                {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                              </td>
                              <td className="py-3.5 px-4 font-mono text-[11px] text-midnight/60">
                                {r.razorpay_payment_id || r.stripe_payment_id || r.gateway_ref || '—'}
                              </td>
                              <td className="py-3.5 px-4">
                                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                                  {r.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ===================================================================== */}
          {/* TAB: IN-APP NOTIFICATION LOGS */}
          {/* ===================================================================== */}
          {activeTab === 'notifications' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
                <div>
                  <h1 className="text-2xl font-extrabold text-midnight tracking-tight">In-App Notification Logs</h1>
                  <p className="text-xs text-midnight/70 mt-1">
                    Inspection of real-time push and in-app notifications delivered across user accounts.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-midnight bg-aliceblue px-3 py-1.5 rounded-xl border border-timberwolf/60">
                    Total Logs: {notificationLogsList.length}
                  </span>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-timberwolf/60 overflow-hidden shadow-card">
                {notificationLogsList.length === 0 ? (
                  <div className="py-16 text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-aliceblue text-midnight/40 flex items-center justify-center mx-auto border border-timberwolf/40">
                      <Bell className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-midnight">No Notification Logs Cataloged</h4>
                    <p className="text-xs text-midnight/60 max-w-sm mx-auto">
                      Real-time in-app alerts and consultation notifications sent to users will be recorded here.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-aliceblue-surface border-b border-timberwolf/40 text-midnight/70">
                          <th className="py-3 px-4 font-semibold">User</th>
                          <th className="py-3 px-4 font-semibold">Title</th>
                          <th className="py-3 px-4 font-semibold">Message Preview</th>
                          <th className="py-3 px-4 font-semibold">Dispatched</th>
                          <th className="py-3 px-4 font-semibold">Read Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-timberwolf/30">
                        {notificationLogsList.map((n: any) => (
                          <tr key={n.id} className="hover:bg-aliceblue/50 transition-colors">
                            <td className="py-3.5 px-4 font-medium text-midnight">
                              {n.user_name || n.user_email || n.user_id?.slice(0, 8) || 'User'}
                            </td>
                            <td className="py-3.5 px-4 font-semibold text-midnight">
                              {n.title || 'Notification'}
                            </td>
                            <td className="py-3.5 px-4 text-midnight/70 max-w-md truncate">
                              {n.message || '—'}
                            </td>
                            <td className="py-3.5 px-4 text-midnight/60">
                              {n.created_at ? new Date(n.created_at).toLocaleString() : '—'}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                n.is_read || n.read === 1
                                  ? 'bg-aliceblue text-midnight/60 border border-timberwolf/50'
                                  : 'bg-moonstone/10 text-moonstone-dark border border-moonstone/30'
                              }`}>
                                {n.is_read || n.read === 1 ? 'Read' : 'Unread'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB: NOT FOUND FALLBACK */}
          {/* ===================================================================== */}
          {activeTab === 'not_found' && (
            <div className="flex-1 p-6 md:p-12 flex items-center justify-center min-h-[400px]">
              <div className="max-w-md w-full bg-white rounded-2xl border border-timberwolf/70 p-8 shadow-card text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-aliceblue text-midnight flex items-center justify-center mx-auto border border-timberwolf/60">
                  <LayoutDashboard className="w-6 h-6 text-moonstone" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-base font-bold text-midnight tracking-tight">Admin Section Not Found</h3>
                  <p className="text-xs text-midnight/70 leading-relaxed">
                    The requested administrative module <span className="font-mono font-bold text-midnight">"{urlTab}"</span> does not exist or has been reorganized.
                  </p>
                </div>
                <div className="pt-2">
                  <button
                    onClick={() => handleTabNavigate('overview')}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover shadow-subtle transition-all cursor-pointer"
                  >
                    <LayoutDashboard className="w-3.5 h-3.5 text-moonstone" />
                    <span>Return to Operations Dashboard</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </AdminContentErrorBoundary>
      )}
    </main>
      </div>

      {/* ========================================================================= */}
      {/* MODALS & DRAWERS (LIGHT THEME) */}
      {/* ========================================================================= */}

      {/* 1. USER DETAILS DRAWER */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 bg-midnight/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-timberwolf/60 shadow-modal max-w-lg w-full p-6 text-midnight animate-fade-in space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-timberwolf/30 pb-3">
              <h3 className="font-extrabold text-base text-midnight">User Profile Inspection</h3>
              <button
                onClick={() => {
                  setSelectedUser(null);
                  setSelectedUserDetail(null);
                }}
                className="w-8 h-8 rounded-lg bg-aliceblue text-midnight/70 hover:text-midnight flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-4">
              <img
                src={selectedUser.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedUser.full_name}`}
                alt={selectedUser.full_name}
                className="w-16 h-16 rounded-full object-cover border-2 border-lightblue"
              />
              <div>
                <h4 className="font-bold text-lg text-midnight">{selectedUser.full_name}</h4>
                <p className="text-xs text-midnight/70 font-medium">@{selectedUser.username} · {selectedUser.email}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-moonstone-light text-moonstone-dark">
                    {selectedUser.role}
                  </span>
                  {selectedUser.verified === 1 && (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Verified
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2 text-xs bg-aliceblue p-4 rounded-xl border border-timberwolf/40">
              <div><span className="font-semibold text-midnight/60">Headline:</span> {selectedUser.headline || '—'}</div>
              <div><span className="font-semibold text-midnight/60">Bio:</span> {selectedUser.bio || '—'}</div>
              <div><span className="font-semibold text-midnight/60">Location:</span> {[selectedUser.city, selectedUser.country].filter(Boolean).join(', ') || 'Worldwide'}</div>
              <div><span className="font-semibold text-midnight/60">Languages:</span> {selectedUser.languages ? selectedUser.languages.join(', ') : 'English'}</div>
              <div><span className="font-semibold text-midnight/60">Experience:</span> {selectedUser.experience_years || 5} years</div>
            </div>

            {selectedUserDetail?.financial && (
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-aliceblue rounded-xl border border-timberwolf/40">
                  <span className="text-midnight/60 block">Total Spent</span>
                  <span className="font-bold text-sm text-midnight font-mono">${formatCurrency(selectedUserDetail.financial.total_spent)}</span>
                </div>
                <div className="p-3 bg-aliceblue rounded-xl border border-timberwolf/40">
                  <span className="text-midnight/60 block">Total Earned</span>
                  <span className="font-bold text-sm text-emerald-700 font-mono">${formatCurrency(selectedUserDetail.financial.total_earned)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. REJECT VERIFICATION MODAL */}
      {rejectVerificationModal && (
        <div className="fixed inset-0 z-50 bg-midnight/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-timberwolf/60 shadow-modal max-w-md w-full p-6 text-midnight animate-fade-in space-y-4">
            <h3 className="font-extrabold text-base text-midnight">Reject Verification Request</h3>
            <p className="text-xs text-midnight/70">
              Provide feedback for <span className="font-bold text-midnight">{rejectVerificationModal.full_name}</span>. An email notification will be dispatched.
            </p>

            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Please provide a clear bio and upload a professional profile photo."
              className="w-full bg-white border border-timberwolf/70 rounded-xl p-3 text-xs text-midnight focus:border-moonstone"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setRejectVerificationModal(null)}
                className="px-3 py-1.5 rounded-xl bg-white border border-timberwolf/70 text-xs font-semibold hover:bg-aliceblue"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectVerification}
                disabled={actionLoading === 'reject-verif'}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. DELETE USER CONFIRMATION MODAL */}
      {deleteConfirmUser && (
        <div className="fixed inset-0 z-50 bg-midnight/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-timberwolf/60 shadow-modal max-w-md w-full p-6 text-midnight animate-fade-in space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="font-extrabold text-base text-midnight">Confirm Account Deletion</h3>
            </div>
            <p className="text-xs text-midnight/70">
              Are you sure you want to permanently delete the account for <span className="font-bold text-midnight">{deleteConfirmUser.full_name}</span> ({deleteConfirmUser.email})? This action cascades to all associated listings and cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmUser(null)}
                className="px-3 py-1.5 rounded-xl bg-white border border-timberwolf/70 text-xs font-semibold hover:bg-aliceblue cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={actionLoading === 'delete-user'}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. EDIT USER MODAL */}
      {editUserModal && (
        <div className="fixed inset-0 z-50 bg-midnight/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleSaveEditUser} className="bg-white rounded-2xl border border-timberwolf/60 shadow-modal max-w-md w-full p-6 text-midnight animate-fade-in space-y-4">
            <h3 className="font-extrabold text-base text-midnight">Edit User Profile Information</h3>
            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">Full Name</label>
              <input
                type="text"
                required
                value={editUserModal.full_name}
                onChange={(e) => setEditUserModal({ ...editUserModal, full_name: e.target.value })}
                className="w-full bg-white border border-timberwolf/70 rounded-xl p-2.5 text-xs text-midnight focus:border-moonstone"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">Headline</label>
              <input
                type="text"
                value={editUserModal.headline || ''}
                onChange={(e) => setEditUserModal({ ...editUserModal, headline: e.target.value })}
                className="w-full bg-white border border-timberwolf/70 rounded-xl p-2.5 text-xs text-midnight focus:border-moonstone"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">City</label>
              <input
                type="text"
                value={editUserModal.city || ''}
                onChange={(e) => setEditUserModal({ ...editUserModal, city: e.target.value })}
                className="w-full bg-white border border-timberwolf/70 rounded-xl p-2.5 text-xs text-midnight focus:border-moonstone"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditUserModal(null)}
                className="px-3 py-1.5 rounded-xl bg-white border border-timberwolf/70 text-xs font-semibold hover:bg-aliceblue cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-shine px-4 py-1.5 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 5. POST OPPORTUNITY MODAL */}
      {opportunityModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-midnight/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handlePostOpportunity} className="bg-white rounded-2xl border border-timberwolf/60 shadow-modal max-w-lg w-full p-6 text-midnight animate-fade-in space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-extrabold text-base text-midnight">Post Platform Opportunity</h3>
            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">Title *</label>
              <input
                type="text"
                required
                value={opportunityModal.title}
                onChange={(e) => setOpportunityModal({ ...opportunityModal, title: e.target.value })}
                placeholder="Fintech Security & Smart Contract Audit"
                className="w-full bg-white border border-timberwolf/70 rounded-xl p-2.5 text-xs text-midnight focus:border-moonstone"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-midnight mb-1">Category *</label>
                <select
                  value={opportunityModal.category_id}
                  onChange={(e) => setOpportunityModal({ ...opportunityModal, category_id: e.target.value })}
                  className="w-full bg-white border border-timberwolf/70 rounded-xl p-2.5 text-xs text-midnight focus:border-moonstone"
                >
                  {categoriesList.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-midnight mb-1">Subcategory</label>
                <input
                  type="text"
                  value={opportunityModal.subcategory}
                  onChange={(e) => setOpportunityModal({ ...opportunityModal, subcategory: e.target.value })}
                  placeholder="e.g. Smart Contracts"
                  className="w-full bg-white border border-timberwolf/70 rounded-xl p-2.5 text-xs text-midnight focus:border-moonstone"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-midnight mb-1">Budget ($)</label>
                <input
                  type="number"
                  value={opportunityModal.budget}
                  onChange={(e) => setOpportunityModal({ ...opportunityModal, budget: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white border border-timberwolf/70 rounded-xl p-2.5 text-xs text-midnight focus:border-moonstone font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-midnight mb-1">Duration (mins)</label>
                <input
                  type="number"
                  value={opportunityModal.duration_minutes}
                  onChange={(e) => setOpportunityModal({ ...opportunityModal, duration_minutes: parseInt(e.target.value) || 30 })}
                  className="w-full bg-white border border-timberwolf/70 rounded-xl p-2.5 text-xs text-midnight focus:border-moonstone font-mono"
                />
              </div>
            </div>

            {/* Authoritative Application Pricing */}
            <div className="p-3 bg-aliceblue rounded-xl border border-timberwolf/50 space-y-2.5">
              <div className="text-xs font-bold text-midnight">Authoritative Application Fee</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-midnight mb-1">Pricing Model</label>
                  <select
                    value={opportunityModal.pricing_type}
                    onChange={(e) => setOpportunityModal({ ...opportunityModal, pricing_type: e.target.value as any })}
                    className="w-full bg-white border border-timberwolf/70 rounded-xl p-2 text-xs text-midnight"
                  >
                    <option value="free">Free Application ($0)</option>
                    <option value="paid">Paid Application Fee</option>
                  </select>
                </div>

                {opportunityModal.pricing_type === 'paid' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-midnight mb-1">Application Fee ($ USD)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      value={opportunityModal.entry_fee_usd}
                      onChange={(e) => setOpportunityModal({ ...opportunityModal, entry_fee_usd: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-white border border-amber-300 rounded-xl p-2 text-xs font-mono font-bold text-midnight focus:border-amber-500"
                    />
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">Required Skills (Comma separated)</label>
              <input
                type="text"
                value={opportunityModal.skills}
                onChange={(e) => setOpportunityModal({ ...opportunityModal, skills: e.target.value })}
                placeholder="Solidity, Web3.js, Security Auditing"
                className="w-full bg-white border border-timberwolf/70 rounded-xl p-2.5 text-xs text-midnight focus:border-moonstone"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">Description *</label>
              <textarea
                rows={3}
                required
                value={opportunityModal.description}
                onChange={(e) => setOpportunityModal({ ...opportunityModal, description: e.target.value })}
                placeholder="Comprehensive technical consultation on DeFi audit..."
                className="w-full bg-white border border-timberwolf/70 rounded-xl p-2.5 text-xs text-midnight focus:border-moonstone"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="oppFeatured"
                checked={opportunityModal.is_featured}
                onChange={(e) => setOpportunityModal({ ...opportunityModal, is_featured: e.target.checked })}
                className="w-4 h-4 text-moonstone rounded cursor-pointer"
              />
              <label htmlFor="oppFeatured" className="text-xs font-semibold text-midnight cursor-pointer">
                Highlight as Featured Opportunity
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-timberwolf/40">
              <button
                type="button"
                onClick={() => setOpportunityModal({ ...opportunityModal, isOpen: false })}
                className="px-3 py-1.5 rounded-xl bg-white border border-timberwolf/70 text-xs font-semibold hover:bg-aliceblue cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-shine px-4 py-1.5 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover cursor-pointer"
              >
                Publish Opportunity
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 6. CATEGORY MODAL */}
      {categoryModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-midnight/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleSaveCategory} className="bg-white rounded-2xl border border-timberwolf/60 shadow-modal max-w-md w-full p-6 text-midnight animate-fade-in space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-extrabold text-base text-midnight">
              {categoryModal.isEdit ? 'Edit Category' : 'Create New Category'}
            </h3>
            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">Category Name *</label>
              <input
                type="text"
                required
                value={categoryModal.name}
                onChange={(e) => setCategoryModal({ ...categoryModal, name: e.target.value })}
                placeholder="e.g. AI & Machine Learning"
                className="w-full bg-white border border-timberwolf/70 rounded-xl p-2.5 text-xs text-midnight focus:border-moonstone"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-midnight mb-1">Slug *</label>
                <input
                  type="text"
                  required
                  value={categoryModal.slug}
                  onChange={(e) => setCategoryModal({ ...categoryModal, slug: e.target.value })}
                  placeholder="e.g. ai-machine-learning"
                  className="w-full bg-white border border-timberwolf/70 rounded-xl p-2.5 text-xs text-midnight focus:border-moonstone font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-midnight mb-1">Sort Order</label>
                <input
                  type="number"
                  value={categoryModal.sort_order}
                  onChange={(e) => setCategoryModal({ ...categoryModal, sort_order: parseInt(e.target.value) || 1 })}
                  className="w-full bg-white border border-timberwolf/70 rounded-xl p-2.5 text-xs text-midnight focus:border-moonstone font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">
                Subcategories (Comma separated)
              </label>
              <input
                type="text"
                value={categoryModal.subcategories}
                onChange={(e) => setCategoryModal({ ...categoryModal, subcategories: e.target.value })}
                placeholder="LLMs, Computer Vision, MLOps, NLP"
                className="w-full bg-white border border-timberwolf/70 rounded-xl p-2.5 text-xs text-midnight focus:border-moonstone"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">Description</label>
              <textarea
                rows={2}
                value={categoryModal.description}
                onChange={(e) => setCategoryModal({ ...categoryModal, description: e.target.value })}
                placeholder="Consultations for LLM deployment and machine learning architecture..."
                className="w-full bg-white border border-timberwolf/70 rounded-xl p-2.5 text-xs text-midnight focus:border-moonstone"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-timberwolf/40">
              <button
                type="button"
                onClick={() => setCategoryModal({ ...categoryModal, isOpen: false })}
                className="px-3 py-1.5 rounded-xl bg-white border border-timberwolf/70 text-xs font-semibold hover:bg-aliceblue cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-shine px-4 py-1.5 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover cursor-pointer"
              >
                Save Category
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 7. ACTION REPORT MODAL */}
      {actionReportModal && (
        <div className="fixed inset-0 z-50 bg-midnight/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleSaveReportAction} className="bg-white rounded-2xl border border-timberwolf/60 shadow-modal max-w-md w-full p-6 text-midnight animate-fade-in space-y-4">
            <h3 className="font-extrabold text-base text-midnight">Action Safety Report</h3>
            <p className="text-xs text-midnight/70">
              Reason: <span className="font-semibold text-midnight">{actionReportModal.reason}</span>
            </p>
            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">Resolution Status</label>
              <select
                value={reportActionStatus}
                onChange={(e) => setReportActionStatus(e.target.value)}
                className="w-full bg-white border border-timberwolf/70 rounded-xl p-2.5 text-xs text-midnight"
              >
                <option value="actioned">Actioned / Moderated</option>
                <option value="dismissed">Dismissed / No Action Needed</option>
                <option value="reviewed">Reviewed & Monitored</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">Administrator Notes</label>
              <textarea
                rows={2}
                value={reportActionNotes}
                onChange={(e) => setReportActionNotes(e.target.value)}
                placeholder="Action taken details..."
                className="w-full bg-white border border-timberwolf/70 rounded-xl p-2.5 text-xs text-midnight"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActionReportModal(null)}
                className="px-3 py-1.5 rounded-xl bg-white border border-timberwolf/70 text-xs font-semibold hover:bg-aliceblue cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-shine px-4 py-1.5 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover cursor-pointer"
              >
                Confirm Action
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 8. AUDIT LOG DETAIL INSPECTION MODAL */}
      {selectedAuditDetail && (
        <div className="fixed inset-0 z-50 bg-midnight/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-timberwolf/60 shadow-modal max-w-lg w-full p-6 text-midnight animate-fade-in space-y-4">
            <div className="flex items-center justify-between border-b border-timberwolf/30 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-midnight">Audit Event Details</h3>
                <p className="text-[11px] text-midnight/60">{selectedAuditDetail.action} · {selectedAuditDetail.created_at}</p>
              </div>
              <button
                onClick={() => setSelectedAuditDetail(null)}
                className="w-8 h-8 rounded-lg bg-aliceblue text-midnight/70 hover:text-midnight flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-timberwolf/30">
                <span className="text-midnight/60 font-semibold">Administrator:</span>
                <span className="font-bold text-midnight">{selectedAuditDetail.admin_name} ({selectedAuditDetail.admin_id})</span>
              </div>
              <div className="flex justify-between py-1 border-b border-timberwolf/30">
                <span className="text-midnight/60 font-semibold">Target Entity:</span>
                <span className="font-mono font-bold text-midnight">{selectedAuditDetail.target_type}: {selectedAuditDetail.target_id}</span>
              </div>
              <div className="pt-2">
                <span className="text-midnight/60 font-semibold block mb-1">Payload / Changes:</span>
                <pre className="p-3 bg-aliceblue rounded-xl border border-timberwolf/40 font-mono text-[11px] text-midnight overflow-x-auto whitespace-pre-wrap max-h-60">
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(selectedAuditDetail.details_json), null, 2);
                    } catch {
                      return selectedAuditDetail.details_json || 'No extra payload details provided.';
                    }
                  })()}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedAuditDetail(null)}
                className="btn-shine px-4 py-1.5 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. CREATE / SCHEDULE CAMPAIGN MODAL */}
      {campaignModalOpen && (
        <div className="fixed inset-0 z-50 bg-midnight/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleCreateCampaign} className="bg-white rounded-2xl border border-timberwolf/60 shadow-modal max-w-lg w-full p-6 text-midnight animate-fade-in space-y-4">
            <div className="flex items-center justify-between border-b border-timberwolf/30 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-midnight">Schedule Registration Campaign</h3>
                <p className="text-[11px] text-midnight/60">Configure temporary promotion fee and server-authoritative time boundaries.</p>
              </div>
              <button
                type="button"
                onClick={() => setCampaignModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-aliceblue text-midnight/70 hover:text-midnight flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-xs font-semibold text-midnight mb-1">Campaign Name *</label>
                <input
                  type="text"
                  required
                  value={newCampaignName}
                  onChange={(e) => setNewCampaignName(e.target.value)}
                  placeholder="e.g. Launch Promotion — Free Expert Registration"
                  className="w-full bg-white border border-timberwolf/70 rounded-xl p-2.5 text-xs text-midnight focus:border-moonstone"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-midnight mb-1">Description</label>
                <textarea
                  rows={2}
                  value={newCampaignDesc}
                  onChange={(e) => setNewCampaignDesc(e.target.value)}
                  placeholder="e.g. 100% free expert registration and service listing for 24 hours ($0.00 fee)."
                  className="w-full bg-white border border-timberwolf/70 rounded-xl p-2.5 text-xs text-midnight focus:border-moonstone"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-midnight mb-1">Promotional Fee (USD) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={newCampaignFee}
                    onChange={(e) => setNewCampaignFee(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-timberwolf/70 rounded-xl p-2.5 text-xs text-midnight font-mono focus:border-moonstone"
                  />
                  <span className="text-[10px] text-midnight/50 mt-0.5 block">Set $0.00 for 100% free waiver</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-midnight mb-1">Duration Preset</label>
                  <select
                    value={newCampaignDurationHours}
                    onChange={(e) => setNewCampaignDurationHours(parseInt(e.target.value) || 24)}
                    className="w-full bg-white border border-timberwolf/70 rounded-xl p-2.5 text-xs text-midnight focus:border-moonstone"
                  >
                    <option value={12}>12 Hours</option>
                    <option value={24}>24 Hours (1 Day)</option>
                    <option value={48}>48 Hours (2 Days)</option>
                    <option value={72}>72 Hours (3 Days)</option>
                    <option value={168}>7 Days (1 Week)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-midnight mb-1">Start Date & Time (Local / Server Time) *</label>
                <input
                  type="datetime-local"
                  required
                  value={newCampaignStartTime}
                  onChange={(e) => setNewCampaignStartTime(e.target.value)}
                  className="w-full bg-white border border-timberwolf/70 rounded-xl p-2.5 text-xs text-midnight font-mono focus:border-moonstone"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-timberwolf/30">
              <button
                type="button"
                onClick={() => setCampaignModalOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-white border border-timberwolf/70 text-xs font-semibold hover:bg-aliceblue cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading === 'create-campaign'}
                className="btn-shine px-4 py-1.5 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover cursor-pointer disabled:opacity-50"
              >
                {actionLoading === 'create-campaign' ? 'Creating...' : 'Activate / Schedule Campaign'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 10. EDIT BASE LISTING FEE MODAL */}
      {editBaseFeeModalOpen && (
        <div className="fixed inset-0 z-50 bg-midnight/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleSaveBaseFee} className="bg-white rounded-2xl border border-timberwolf/60 shadow-modal max-w-sm w-full p-6 text-midnight animate-fade-in space-y-4">
            <div className="flex items-center justify-between border-b border-timberwolf/30 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-midnight">Standard Base Listing Fee</h3>
                <p className="text-[11px] text-midnight/60">Configured default expert fee when no promotion is active.</p>
              </div>
              <button
                type="button"
                onClick={() => setEditBaseFeeModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-aliceblue text-midnight/70 hover:text-midnight flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-semibold text-midnight mb-1">Standard Listing Fee (USD) *</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-midnight/50 font-mono font-bold">$</span>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    required
                    value={newBaseFeeInput}
                    onChange={(e) => setNewBaseFeeInput(parseFloat(e.target.value) || 0)}
                    className="w-full pl-7 pr-3.5 py-2.5 bg-white border border-timberwolf/70 rounded-xl text-xs text-midnight font-mono font-bold focus:border-moonstone"
                  />
                </div>
                <span className="text-[10px] text-midnight/50 mt-1 block">Default platform baseline: $2.00</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-timberwolf/30">
              <button
                type="button"
                onClick={() => setEditBaseFeeModalOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-white border border-timberwolf/70 text-xs font-semibold hover:bg-aliceblue cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading === 'save-base-fee'}
                className="btn-shine px-4 py-1.5 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover cursor-pointer disabled:opacity-50"
              >
                {actionLoading === 'save-base-fee' ? 'Saving...' : 'Save Base Fee'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
export default AdminPage;
