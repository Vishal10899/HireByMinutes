import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { ConsultationRequest } from '../types';
import {
  IndianRupee,
  Clock,
  CheckCircle2,
  XCircle,
  PlusCircle,
  Video,
  Star,
  Sparkles,
  Calendar,
  Layers,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  Radio,
  FileText,
  Check,
  X,
  Briefcase,
  ShieldCheck,
  CreditCard,
  Edit3,
  Trash2,
  ExternalLink,
  Building,
  Info,
  Lock,
  MessageSquare,
  Award
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { usePageSEO } from '../hooks/usePageSEO';
import { formatINR } from '../utils/currency';

// Real-time Countdown Timer for Individual Consultation Request
const RequestTimer: React.FC<{ initialSeconds: number; onExpire?: () => void }> = ({
  initialSeconds,
  onExpire
}) => {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    setSeconds(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    if (seconds <= 0) {
      if (onExpire) onExpire();
      return;
    }
    const interval = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (onExpire) onExpire();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [seconds]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const formatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  if (seconds <= 0) {
    return (
      <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200">
        Expired
      </span>
    );
  }

  // 10-5 mins: normal / 5-2 mins: subtle warning / < 2 mins: clear warning
  let colorClasses = 'bg-aliceblue text-midnight border-timberwolf/60';
  if (seconds < 120) {
    colorClasses = 'bg-rose-50 text-rose-700 border-rose-300 animate-pulse';
  } else if (seconds < 300) {
    colorClasses = 'bg-amber-50 text-amber-800 border-amber-300';
  }

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono font-bold text-xs ${colorClasses}`}>
      <Clock className="w-3.5 h-3.5" />
      <span>Respond within: {formatted}</span>
    </div>
  );
};

export const ProviderDashboardPage: React.FC = () => {
  usePageSEO({
    title: 'Provider Dashboard — HireByMinute',
    noindex: true,
    canonicalPath: '/provider'
  });

  const { user } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<'overview' | 'services' | 'sessions' | 'portfolio' | 'payouts' | 'reviews'>('overview');
  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [pendingRequests, setPendingRequests] = useState<ConsultationRequest[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [payoutAccount, setPayoutAccount] = useState<any | null>(null);
  const [walletData, setWalletData] = useState<any | null>(null);
  const [earnings, setEarnings] = useState<{
    total: number;
    gross?: number;
    platformFee?: number;
    todayGross?: number;
    todayNet?: number;
    completedSessions: number;
    totalSessionMinutes?: number;
  }>({ total: 0, completedSessions: 0 });
  const [completedSessionsBreakdown, setCompletedSessionsBreakdown] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [isAvailableNow, setIsAvailableNow] = useState<boolean>(true);
  const [togglingAvailability, setTogglingAvailability] = useState(false);

  // Performance metrics & Platform Ranking
  const [providerProfile, setProviderProfile] = useState<{
    response_rate?: string;
    response_time?: string;
    platform_ranking?: {
      rank_score: number;
      percentile: number;
      tier: string;
      methodology: string;
    };
    totalSessions?: number;
    rating?: number;
    review_count?: number;
  } | null>(null);
  const [rankingModalOpen, setRankingModalOpen] = useState(false);

  // Review reply state
  const [replyingReviewId, setReplyingReviewId] = useState<string | null>(null);
  const [reviewReplyText, setReviewReplyText] = useState<string>('');
  const [submittingReply, setSubmittingReply] = useState<boolean>(false);

  const handleSendReviewReply = async (reviewId: string) => {
    if (!reviewReplyText.trim()) return;
    try {
      setSubmittingReply(true);
      await api.replyToReview(reviewId, reviewReplyText.trim());
      setReviews((prev) =>
        prev.map((r) =>
          r.id === reviewId
            ? { ...r, provider_reply: reviewReplyText.trim(), provider_replied_at: new Date().toISOString() }
            : r
        )
      );
      setReplyingReviewId(null);
      setReviewReplyText('');
    } catch (err: any) {
      alert(err.message || 'Failed to submit review reply');
    } finally {
      setSubmittingReply(false);
    }
  };

  // Portfolio modal
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editingProject, setEditingProject] = useState<any | null>(null);
  const [projectFormData, setProjectFormData] = useState({
    title: '',
    description: '',
    technologies: '',
    project_url: '',
    image_url: ''
  });
  const [savingProject, setSavingProject] = useState(false);

  // Bank account modal & Payout request
  const [showBankModal, setShowBankModal] = useState(false);
  const [bankFormData, setBankFormData] = useState({
    account_holder_name: '',
    account_number: '',
    confirm_account_number: '',
    ifsc_code: '',
    bank_name: '',
    account_type: 'savings'
  });
  const [savingBank, setSavingBank] = useState(false);
  const [requestingPayout, setRequestingPayout] = useState(false);
  const [payoutNotice, setPayoutNotice] = useState<{
    isOpen: boolean;
    status: 'pending_onboarding' | 'processing' | 'failed' | 'unknown';
    title: string;
    message?: string;
  }>({
    isOpen: false,
    status: 'pending_onboarding',
    title: 'Payouts & Earnings'
  });

  // Handle URL tab parameter
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['overview', 'services', 'sessions', 'portfolio', 'payouts', 'reviews'].includes(tabParam)) {
      setActiveTab(tabParam as any);
    }
  }, [searchParams]);

  const handleSelectTab = (tab: 'overview' | 'services' | 'sessions' | 'portfolio' | 'payouts' | 'reviews') => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const loadProviderDashboard = async () => {
    try {
      setLoading(true);
      const [data, portfolioRes, bankRes, walletRes] = await Promise.all([
        api.getProviderDashboard(),
        api.getPortfolio().catch(() => ({ projects: [] })),
        api.getPayoutAccount().catch(() => ({ account: null })),
        api.getProviderWallet().catch(() => ({ payout_balance_inr: 0, ledger: [] }))
      ]);
      setProviderProfile(data.provider || null);
      setActiveSession(data.activeSession || null);
      setPendingRequests(data.pendingRequests || []);
      setUpcomingSessions(data.upcomingSessions || []);
      setServices(data.services || []);
      setEarnings(data.earnings || { total: 0, completedSessions: 0 });
      setCompletedSessionsBreakdown(data.completedSessionsBreakdown || []);
      setReviews(data.reviews || []);
      setPortfolio(portfolioRes?.projects || []);
      setPayoutAccount(bankRes?.account || null);
      setWalletData(walletRes || null);
      if (data.services && data.services.length > 0) {
        setIsAvailableNow(data.services.some((s: any) => s.available_now === 1));
      }
    } catch (err) {
      console.error('Failed to load provider dashboard', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviderDashboard();
  }, [user?.id]);

  const handleToggleAvailability = async () => {
    try {
      setTogglingAvailability(true);
      const nextState = !isAvailableNow;
      await api.toggleProviderAvailability(nextState);
      setIsAvailableNow(nextState);
      await loadProviderDashboard();
    } catch (err: any) {
      alert(err.message || 'Failed to toggle availability');
    } finally {
      setTogglingAvailability(false);
    }
  };

  // Real-time socket updates for incoming consultation requests, payments, sessions & availability
  useEffect(() => {
    if (!socket) return;

    const handleNewRequest = () => {
      loadProviderDashboard();
    };

    const handlePaymentCompleted = () => {
      confetti({ particleCount: 70, spread: 60 });
      loadProviderDashboard();
    };

    const handleRequestExpired = () => {
      loadProviderDashboard();
    };

    const handleSessionCompleted = () => {
      loadProviderDashboard();
    };

    const handleSessionExtended = () => {
      loadProviderDashboard();
    };

    const handleAvailabilityChanged = () => {
      loadProviderDashboard();
    };

    socket.on('consultation_request_created', handleNewRequest);
    socket.on('consultation_payment_completed', handlePaymentCompleted);
    socket.on('session_started', handlePaymentCompleted);
    socket.on('consultation_request_expired', handleRequestExpired);
    socket.on('session_completed', handleSessionCompleted);
    socket.on('session_extended', handleSessionExtended);
    socket.on('provider_availability_changed', handleAvailabilityChanged);

    return () => {
      socket.off('consultation_request_created', handleNewRequest);
      socket.off('consultation_payment_completed', handlePaymentCompleted);
      socket.off('session_started', handlePaymentCompleted);
      socket.off('consultation_request_expired', handleRequestExpired);
      socket.off('session_completed', handleSessionCompleted);
      socket.off('session_extended', handleSessionExtended);
      socket.off('provider_availability_changed', handleAvailabilityChanged);
    };
  }, [socket]);

  const handleAcceptRequest = async (requestId: string) => {
    try {
      setActionLoading(requestId);
      await api.acceptConsultationRequest(requestId);
      confetti({ particleCount: 60, spread: 50 });
      setAcceptedIds((prev) => new Set(prev).add(requestId));
      await loadProviderDashboard();
    } catch (err: any) {
      alert(err.message || 'Failed to accept consultation request');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    if (!confirm('Are you sure you want to decline this consultation request?')) return;
    try {
      setActionLoading(requestId);
      await api.declineConsultationRequest(requestId);
      await loadProviderDashboard();
    } catch (err: any) {
      alert(err.message || 'Failed to decline request');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleServiceStatus = async (serviceId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'paused' : 'active';
    try {
      await api.updateServiceStatus(serviceId, nextStatus);
      await loadProviderDashboard();
    } catch (err: any) {
      alert(err.message || 'Status update failed');
    }
  };

  // Portfolio Handlers
  const handleOpenAddProject = () => {
    setEditingProject(null);
    setProjectFormData({
      title: '',
      description: '',
      technologies: '',
      project_url: '',
      image_url: ''
    });
    setShowProjectModal(true);
  };

  const handleOpenEditProject = (proj: any) => {
    setEditingProject(proj);
    setProjectFormData({
      title: proj.title || '',
      description: proj.description || '',
      technologies: Array.isArray(proj.technologies) ? proj.technologies.join(', ') : (proj.technologies || ''),
      project_url: proj.project_url || '',
      image_url: proj.image_url || ''
    });
    setShowProjectModal(true);
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectFormData.title.trim()) {
      alert('Project title is required.');
      return;
    }
    setSavingProject(true);
    try {
      const payload = {
        title: projectFormData.title.trim(),
        description: projectFormData.description.trim(),
        technologies: projectFormData.technologies.split(',').map((s) => s.trim()).filter(Boolean),
        project_url: projectFormData.project_url.trim(),
        image_url: projectFormData.image_url.trim()
      };

      if (editingProject) {
        await api.updatePortfolioProject(editingProject.id, payload);
      } else {
        await api.addPortfolioProject(payload);
        confetti({ particleCount: 50, spread: 60 });
      }
      setShowProjectModal(false);
      await loadProviderDashboard();
    } catch (err: any) {
      alert(err.message || 'Failed to save portfolio project');
    } finally {
      setSavingProject(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('Are you sure you want to delete this portfolio project?')) return;
    try {
      await api.deletePortfolioProject(projectId);
      await loadProviderDashboard();
    } catch (err: any) {
      alert(err.message || 'Failed to delete portfolio project');
    }
  };

  // Bank Account & Payout Handlers
  const handleOpenBankModal = () => {
    setBankFormData({
      account_holder_name: payoutAccount?.account_holder_name || user?.full_name || '',
      account_number: '',
      confirm_account_number: '',
      ifsc_code: payoutAccount?.ifsc_code || '',
      bank_name: payoutAccount?.bank_name || '',
      account_type: payoutAccount?.account_type || 'savings'
    });
    setShowBankModal(true);
  };

  const handleSaveBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankFormData.account_holder_name.trim()) {
      alert('Account holder name is required.');
      return;
    }
    if (!bankFormData.account_number.trim() || bankFormData.account_number.length < 8) {
      alert('Please enter a valid account number (minimum 8 digits).');
      return;
    }
    if (bankFormData.account_number !== bankFormData.confirm_account_number) {
      alert('Account number and confirmation do not match.');
      return;
    }
    const cleanIfsc = bankFormData.ifsc_code.trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
      alert('Please enter a valid 11-character Indian IFSC code (e.g. HDFC0001234).');
      return;
    }

    setSavingBank(true);
    try {
      await api.savePayoutAccount({
        account_holder_name: bankFormData.account_holder_name.trim(),
        account_number: bankFormData.account_number.trim(),
        ifsc_code: cleanIfsc,
        bank_name: bankFormData.bank_name.trim() || 'Bank Account',
        account_type: bankFormData.account_type
      });
      confetti({ particleCount: 50, spread: 50 });
      setShowBankModal(false);
      await loadProviderDashboard();
    } catch (err: any) {
      alert(err.message || 'Failed to save payout bank details');
    } finally {
      setSavingBank(false);
    }
  };

  const handleRequestPayout = async () => {
    try {
      setRequestingPayout(true);
      const res = await api.requestPayout();
      if (res && (res.payouts_enabled === true || res.success === true)) {
        setPayoutNotice({
          isOpen: true,
          status: 'processing',
          title: 'Payout Request Submitted',
          message: res.message || 'Your payout request has been received and is being processed according to the platform settlement schedule.'
        });
      } else {
        setPayoutNotice({
          isOpen: true,
          status: 'pending_onboarding',
          title: 'Payouts & Earnings',
          message: res?.message || res?.payoutStatusNotice
        });
      }
    } catch (err: any) {
      const errData = err.data || {};
      const errMsg = errData.error || errData.message || err.message || '';
      const isPendingOnboarding =
        errData.payouts_enabled === false ||
        errData.status === 'payouts_disabled' ||
        /onboarding|pending|disabled|review|batch settlement|gateway/i.test(errMsg);

      if (isPendingOnboarding) {
        setPayoutNotice({
          isOpen: true,
          status: 'pending_onboarding',
          title: 'Payouts & Earnings',
          message: errMsg
        });
      } else {
        setPayoutNotice({
          isOpen: true,
          status: 'failed',
          title: 'Payout Request Notice',
          message: errMsg || 'Unable to process payout request at this time. Please check your bank details or try again later.'
        });
      }
    } finally {
      setRequestingPayout(false);
    }
  };

  const closePayoutNoticeModal = () => {
    try {
      sessionStorage.setItem('hbm_payout_notice_dismissed', 'true');
    } catch {
      // Ignore if sessionStorage is not accessible
    }
    setPayoutNotice((prev) => ({ ...prev, isOpen: false }));
  };

  useEffect(() => {
    if (!payoutNotice.isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closePayoutNoticeModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [payoutNotice.isOpen]);

  const getRecordedEarnings = () => {
    if (walletData && typeof walletData.availableBalance === 'number') {
      return { amount: walletData.availableBalance, isVerified: true };
    }
    if (walletData && typeof walletData.payout_balance_inr === 'number') {
      return { amount: walletData.payout_balance_inr, isVerified: true };
    }
    if (walletData && typeof walletData.netEarnings === 'number') {
      return { amount: walletData.netEarnings, isVerified: true };
    }
    if (earnings && typeof earnings.total === 'number') {
      return { amount: earnings.total, isVerified: true };
    }
    return { amount: null, isVerified: false };
  };

  const recordedEarnings = getRecordedEarnings();

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-20 text-center">
        <div className="w-10 h-10 border-2 border-moonstone border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-midnight/60">Loading provider workspace...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8 animate-fade-in">

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-timberwolf/40">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-midnight tracking-tight">
              Provider Dashboard
            </h1>
            <button
              type="button"
              disabled={togglingAvailability}
              onClick={handleToggleAvailability}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer shadow-subtle ${
                isAvailableNow
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                  : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
              }`}
              title="Click to toggle real-time availability across your services"
            >
              <span className={`w-2 h-2 rounded-full ${isAvailableNow ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              <span>{isAvailableNow ? 'AVAILABLE NOW' : 'OFFLINE'}</span>
            </button>
          </div>
          <p className="text-sm text-midnight/70 mt-1">
            Manage incoming consultation requests, portfolio projects, live sessions, and verified earnings.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
          <Link
            to="/profile/edit"
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-timberwolf bg-white text-midnight font-semibold text-xs hover:bg-aliceblue shadow-subtle transition-colors min-h-[44px]"
          >
            <img
              src={user?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user?.full_name || 'Provider')}`}
              alt={user?.full_name}
              className="w-4 h-4 rounded-full object-cover border border-lightblue"
            />
            <span>Edit Profile</span>
          </Link>

          <Link
            to="/provider/new-service"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-midnight text-aliceblue font-semibold text-xs hover:bg-midnight-hover shadow-subtle transition-colors min-h-[44px]"
          >
            <PlusCircle className="w-4 h-4 text-moonstone" />
            <span>Add Service</span>
          </Link>
        </div>
      </div>

      {/* METRICS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Net Earnings */}
        <div className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-midnight/60 uppercase tracking-wider">Net Earnings (85%)</span>
            <div className="text-2xl font-extrabold text-midnight font-mono mt-0.5">
              {recordedEarnings.isVerified ? formatINR(recordedEarnings.amount) : '—'}
            </div>
            <span className="text-[10px] text-midnight/50 block mt-0.5">
              Gross: {formatINR(earnings.gross || 0)} • 15% platform fee
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <IndianRupee className="w-5 h-5" />
          </div>
        </div>

        {/* Today's Net */}
        <div className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-midnight/60 uppercase tracking-wider">Today's Net</span>
            <div className="text-2xl font-extrabold text-midnight font-mono mt-0.5">
              {formatINR(earnings.todayNet || 0)}
            </div>
            <span className="text-[10px] text-midnight/50 block mt-0.5">
              Gross: {formatINR(earnings.todayGross || 0)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-aliceblue text-moonstone flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* Completed Consultations & Minutes */}
        <div className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-midnight/60 uppercase tracking-wider">Consultations</span>
            <div className="text-2xl font-extrabold text-midnight font-mono mt-0.5">
              {earnings.completedSessions}
            </div>
            <span className="text-[10px] text-midnight/50 block mt-0.5">
              {earnings.totalSessionMinutes || 0} total consultation mins
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-aliceblue text-midnight flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-moonstone" />
          </div>
        </div>

        {/* Pending Requests */}
        <div className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-midnight/60 uppercase tracking-wider">Pending Requests</span>
            <div className="text-2xl font-extrabold text-amber-600 font-mono mt-0.5">
              {pendingRequests.length}
            </div>
            <span className="text-[10px] text-amber-700/80 block mt-0.5">
              10-minute response window
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* PERFORMANCE METRICS & RANKING ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Response Rate & Window */}
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-4 shadow-card flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-midnight/60 uppercase tracking-wider">
              Response Reliability
            </span>
            <div className="text-xl font-extrabold text-midnight mt-0.5">
              {providerProfile?.response_rate || '100%'} Accept Rate
            </div>
            <span className="text-[10px] text-midnight/50 block mt-0.5">
              Avg response: {providerProfile?.response_time || '< 3 mins'}
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        {/* Platform Ranking Tier */}
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-4 shadow-card flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-midnight/60 uppercase tracking-wider">
                Merit Ranking
              </span>
              <button
                type="button"
                onClick={() => setRankingModalOpen(true)}
                className="text-moonstone hover:text-midnight transition p-0.5"
                title="View ranking methodology"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="text-xl font-extrabold text-amber-600 mt-0.5 flex items-center gap-1.5">
              <span>{providerProfile?.platform_ranking?.tier || 'Verified Professional'}</span>
            </div>
            <span className="text-[10px] text-midnight/50 block mt-0.5">
              Score: {providerProfile?.platform_ranking?.rank_score || 85}/100 • Top {Math.max(1, 100 - (providerProfile?.platform_ranking?.percentile || 90))}%
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Award className="w-4 h-4" />
          </div>
        </div>

        {/* Instant Availability Beacon */}
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-4 shadow-card flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-midnight/60 uppercase tracking-wider">
              Live Visibility
            </span>
            <div className="text-xl font-extrabold text-midnight mt-0.5 flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isAvailableNow ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
                }`}
              />
              <span>{isAvailableNow ? 'Active & Bookable' : 'Scheduled Only'}</span>
            </div>
            <span className="text-[10px] text-midnight/50 block mt-0.5">
              {isAvailableNow ? 'Receives instant consultation calls' : 'Visible for scheduled slots'}
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-aliceblue text-moonstone flex items-center justify-center shrink-0">
            <Radio className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* NAVIGATION TABS BAR */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-timberwolf/60 pb-2">
        <button
          type="button"
          onClick={() => handleSelectTab('overview')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer min-h-[44px] ${
            activeTab === 'overview'
              ? 'bg-midnight text-aliceblue shadow-subtle'
              : 'text-midnight/70 hover:text-midnight hover:bg-aliceblue'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Overview & Requests</span>
          {pendingRequests.length > 0 && (
            <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold">
              {pendingRequests.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleSelectTab('services')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer min-h-[44px] ${
            activeTab === 'services'
              ? 'bg-midnight text-aliceblue shadow-subtle'
              : 'text-midnight/70 hover:text-midnight hover:bg-aliceblue'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>My Services</span>
          <span className="px-1.5 py-0.5 rounded-md bg-white/20 text-[10px]">
            {services.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectTab('sessions')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer min-h-[44px] ${
            activeTab === 'sessions'
              ? 'bg-midnight text-aliceblue shadow-subtle'
              : 'text-midnight/70 hover:text-midnight hover:bg-aliceblue'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Sessions & Commission</span>
          <span className="px-1.5 py-0.5 rounded-md bg-white/20 text-[10px]">
            {completedSessionsBreakdown.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectTab('portfolio')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer min-h-[44px] ${
            activeTab === 'portfolio'
              ? 'bg-midnight text-aliceblue shadow-subtle'
              : 'text-midnight/70 hover:text-midnight hover:bg-aliceblue'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          <span>Portfolio Projects</span>
          <span className="px-1.5 py-0.5 rounded-md bg-white/20 text-[10px]">
            {portfolio.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectTab('payouts')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer min-h-[44px] ${
            activeTab === 'payouts'
              ? 'bg-midnight text-aliceblue shadow-subtle'
              : 'text-midnight/70 hover:text-midnight hover:bg-aliceblue'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Bank Account & Wallet</span>
          {payoutAccount ? (
            <span className="w-2 h-2 rounded-full bg-emerald-400" title="Verified Bank Account linked" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-amber-400" title="Bank Account not linked" />
          )}
        </button>

        <button
          type="button"
          onClick={() => handleSelectTab('reviews')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer min-h-[44px] ${
            activeTab === 'reviews'
              ? 'bg-midnight text-aliceblue shadow-subtle'
              : 'text-midnight/70 hover:text-midnight hover:bg-aliceblue'
          }`}
        >
          <Star className="w-4 h-4" />
          <span>Client Reviews</span>
          <span className="px-1.5 py-0.5 rounded-md bg-white/20 text-[10px]">
            {reviews.length}
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: OVERVIEW & REQUESTS */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-8 animate-fade-in">
          {/* ACTIVE SESSION CARD (If any) */}
          {activeSession && (
            <div className="bg-midnight text-aliceblue rounded-2xl p-6 sm:p-7 border border-midnight shadow-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-moonstone/20 border border-moonstone flex items-center justify-center text-moonstone shrink-0">
                  <Video className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-moonstone bg-midnight-light px-2 py-0.5 rounded">
                    Live Session In Progress
                  </span>
                  <h3 className="text-lg font-bold text-aliceblue mt-1">
                    Consulting with {activeSession.client_name}
                  </h3>
                  <p className="text-xs text-aliceblue/70">{activeSession.service_title}</p>
                </div>
              </div>

              <Link
                to={`/session/${activeSession.id}`}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-moonstone text-white font-bold text-xs hover:bg-moonstone-hover shadow-subtle transition-all min-h-[44px]"
              >
                <span>Join Live Room</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}

          {/* SECTION: PENDING CONSULTATION REQUESTS (10-Minute Response Timer) */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-midnight flex items-center gap-2">
                <Clock className="w-5 h-5 text-moonstone" />
                <span>Consultation Requests ({pendingRequests.length})</span>
              </h2>
              <span className="text-xs text-midnight/60">10-minute response window</span>
            </div>

            {pendingRequests.length === 0 ? (
              <div className="bg-white rounded-2xl border border-timberwolf/70 p-8 text-center text-xs text-midnight/60 shadow-subtle">
                No pending requests at the moment. When clients send a consultation request, you will have 10 minutes to review and accept.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {pendingRequests.map((req) => {
                  const isAccepted = acceptedIds.has(req.id);
                  return (
                    <div
                      key={req.id}
                      className="water-surface-card bg-white rounded-2xl border-2 border-moonstone/40 p-5 shadow-card space-y-4 relative overflow-hidden"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <img
                            src={req.client_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${req.client_name}`}
                            alt={req.client_name}
                            className="w-12 h-12 rounded-xl object-cover border border-lightblue shrink-0"
                          />
                          <div>
                            <h4 className="font-bold text-sm text-midnight">{req.client_name}</h4>
                            <p className="text-xs text-midnight/70 line-clamp-1">{req.service_title}</p>
                            <div className="flex items-center gap-2 text-[11px] text-midnight/60 mt-0.5">
                              <span className="font-semibold">{req.duration_minutes} minutes</span>
                              <span>•</span>
                              <span className="font-mono font-bold text-emerald-700">{formatINR(req.total_price)}</span>
                              <span>•</span>
                              <span className="text-moonstone font-medium">
                                {req.connect_type === 'now' ? 'Connect Now' : 'Scheduled'}
                              </span>
                            </div>
                            {/* Client Reputation Preview */}
                            <div className="flex items-center gap-2 text-[11px] text-midnight/70 mt-1.5 bg-aliceblue/80 px-2 py-0.5 rounded-md border border-timberwolf/40 w-fit">
                              <span className="flex items-center gap-0.5 font-bold text-amber-600">
                                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                {(req as any).client_rating ? Number((req as any).client_rating).toFixed(1) : '5.0'}
                              </span>
                              <span>•</span>
                              <span>{(req as any).client_sessions_completed || 0} sessions</span>
                            </div>
                          </div>
                        </div>

                        {/* Live 10-Minute Countdown */}
                        <RequestTimer
                          initialSeconds={req.remaining_seconds || 600}
                          onExpire={loadProviderDashboard}
                        />
                      </div>

                      {/* Problem Description */}
                      {req.problem_description && (
                        <div className="p-3 bg-aliceblue/50 rounded-xl border border-timberwolf/40 text-xs text-midnight/80">
                          <span className="text-[10px] uppercase font-bold text-midnight/50 block mb-1">
                            Client's Topic:
                          </span>
                          <p className="italic leading-relaxed">"{req.problem_description}"</p>
                        </div>
                      )}

                      {/* Accept / Decline Action Buttons */}
                      {isAccepted ? (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center text-xs font-semibold text-emerald-800 flex items-center justify-center gap-1.5">
                          <Check className="w-4 h-4 text-emerald-600" />
                          <span>Accepted! Waiting for client to complete payment.</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleDeclineRequest(req.id)}
                            disabled={actionLoading === req.id}
                            className="flex-1 min-h-[44px] py-2.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                          >
                            Decline
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAcceptRequest(req.id)}
                            disabled={actionLoading === req.id}
                            className="btn-shine flex-1 min-h-[44px] py-2.5 rounded-xl bg-midnight text-aliceblue hover:bg-midnight-hover text-xs font-bold transition-all cursor-pointer shadow-subtle disabled:opacity-50 flex items-center justify-center gap-1.5 active:scale-95"
                          >
                            {actionLoading === req.id ? (
                              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <>
                                <Check className="w-3.5 h-3.5 text-moonstone" />
                                <span>Accept Request</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* UPCOMING CONFIRMED SESSIONS */}
          <section className="space-y-4">
            <h2 className="text-lg font-bold text-midnight flex items-center gap-2">
              <Calendar className="w-4 h-4 text-moonstone" />
              <span>Upcoming Confirmed Sessions ({upcomingSessions.length})</span>
            </h2>

            {upcomingSessions.length === 0 ? (
              <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 text-center text-xs text-midnight/60 shadow-subtle">
                No upcoming scheduled sessions.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {upcomingSessions.map((session) => (
                  <div
                    key={session.id}
                    className="bg-white rounded-xl border border-timberwolf/70 p-5 shadow-subtle flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={session.client_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${session.client_name}`}
                        alt={session.client_name}
                        className="w-10 h-10 rounded-xl object-cover border border-lightblue"
                      />
                      <div>
                        <h4 className="font-bold text-sm text-midnight">{session.client_name}</h4>
                        <p className="text-xs text-midnight/70">{session.service_title}</p>
                        <span className="text-[11px] text-midnight/50">
                          {new Date(session.scheduled_start).toLocaleString()} ({session.duration_minutes} mins)
                        </span>
                      </div>
                    </div>

                    <Link
                      to={`/session/${session.id}`}
                      className="min-h-[44px] px-4 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover flex items-center transition-all active:scale-95 shadow-subtle"
                    >
                      Enter Room
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: MY SERVICES */}
      {/* ========================================================================= */}
      {activeTab === 'services' && (
        <section className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-midnight flex items-center gap-2">
              <Layers className="w-5 h-5 text-moonstone" />
              <span>My Service Listings ({services.length})</span>
            </h2>
            <Link
              to="/provider/new-service"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover min-h-[44px]"
            >
              <PlusCircle className="w-4 h-4 text-moonstone" />
              <span>Add New Service</span>
            </Link>
          </div>

          {services.length === 0 ? (
            <div className="bg-white rounded-2xl border border-timberwolf/70 p-8 text-center text-xs text-midnight/60 shadow-subtle space-y-3">
              <p>You haven't created any service listings yet.</p>
              <Link
                to="/provider/new-service"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Create Your First Service</span>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {services.map((srv) => (
                <div
                  key={srv.id}
                  className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-subtle flex flex-col justify-between space-y-4 hover:border-moonstone transition-all"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-moonstone bg-aliceblue px-2 py-0.5 rounded border border-timberwolf/40">
                        {srv.category_name}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          srv.listing_status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : srv.listing_status === 'pending_payment'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-zinc-100 text-zinc-800'
                        }`}
                      >
                        {srv.listing_status}
                      </span>
                    </div>

                    <h3 className="font-bold text-sm text-midnight line-clamp-1">
                      {srv.title}
                    </h3>
                    <p className="text-xs text-midnight/70 line-clamp-2 leading-relaxed">
                      {srv.description}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-timberwolf/40 flex items-center justify-between">
                    <div className="font-mono text-sm font-extrabold text-midnight">
                      {formatINR(srv.price_per_minute)}
                      <span className="text-[10px] font-normal text-midnight/60 font-sans"> / min</span>
                    </div>

                    {srv.listing_status === 'pending_payment' ? (
                      <Link
                        to={`/services/${srv.id}`}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 text-white font-bold text-xs hover:bg-amber-600"
                      >
                        Pay ₹2 Activation
                      </Link>
                    ) : (
                      <button
                        onClick={() => handleToggleServiceStatus(srv.id, srv.listing_status)}
                        className="text-xs font-semibold text-moonstone hover:underline cursor-pointer min-h-[44px] flex items-center"
                      >
                        {srv.listing_status === 'active' ? 'Pause Service' : 'Activate Service'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: SESSIONS & COMMISSION */}
      {/* ========================================================================= */}
      {activeTab === 'sessions' && (
        <section className="space-y-4 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-midnight flex items-center gap-2">
                <IndianRupee className="w-5 h-5 text-moonstone" />
                <span>Completed Consultations & Earnings Breakdown ({completedSessionsBreakdown.length})</span>
              </h2>
              <p className="text-xs text-midnight/60 mt-0.5">Transparent 15% platform commission • 85% net expert earnings</p>
            </div>
          </div>

          {completedSessionsBreakdown.length === 0 ? (
            <div className="bg-white rounded-2xl border border-timberwolf/70 p-8 text-center text-xs text-midnight/60 shadow-subtle">
              No completed paid consultations recorded yet. When sessions conclude, your 85% net earnings will appear here with transparent line-item fee breakdowns.
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-timberwolf/70 overflow-x-auto shadow-subtle">
              <table className="w-full text-left text-xs">
                <thead className="bg-aliceblue/60 text-midnight/60 uppercase font-semibold border-b border-timberwolf/40">
                  <tr>
                    <th className="py-3.5 px-4">Client & Service</th>
                    <th className="py-3.5 px-4">Duration</th>
                    <th className="py-3.5 px-4">Gross Client Paid</th>
                    <th className="py-3.5 px-4">Platform Fee (15%)</th>
                    <th className="py-3.5 px-4 text-emerald-800">Your Net Earnings (85%)</th>
                    <th className="py-3.5 px-4">Completed Date</th>
                    <th className="py-3.5 px-4 text-right">Session Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-timberwolf/30 text-midnight/80">
                  {completedSessionsBreakdown.map((item) => (
                    <tr key={item.id} className="hover:bg-aliceblue/30 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={item.client_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.client_name}`}
                            alt={item.client_name}
                            className="w-8 h-8 rounded-lg object-cover border border-lightblue"
                          />
                          <div>
                            <span className="font-bold text-midnight block">{item.client_name}</span>
                            <span className="text-[11px] text-midnight/60">{item.service_title}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-medium">{item.duration_minutes} mins</td>
                      <td className="py-3.5 px-4 font-mono font-semibold">{formatINR(item.gross_amount)}</td>
                      <td className="py-3.5 px-4 font-mono text-rose-700">-{formatINR(item.platform_fee)}</td>
                      <td className="py-3.5 px-4 font-mono font-extrabold text-emerald-700 text-sm">
                        {formatINR(item.net_earned)}
                      </td>
                      <td className="py-3.5 px-4 text-midnight/60">
                        {item.actual_end ? new Date(item.actual_end).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Link
                          to={`/session/${item.id}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-aliceblue hover:bg-lightblue/40 text-midnight font-bold text-xs transition border border-timberwolf/40"
                          title="View consultation chat transcript & file exchange"
                        >
                          <FileText className="w-3.5 h-3.5 text-moonstone" />
                          <span>Transcript</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: PORTFOLIO PROJECTS */}
      {/* ========================================================================= */}
      {activeTab === 'portfolio' && (
        <section className="space-y-5 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-midnight flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-moonstone" />
                <span>Portfolio & Featured Projects ({portfolio.length})</span>
              </h2>
              <p className="text-xs text-midnight/60 mt-0.5">
                Showcase your best case studies, GitHub repositories, and design work on your public expert profile.
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenAddProject}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover shadow-subtle min-h-[44px] cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 text-moonstone" />
              <span>Add Project</span>
            </button>
          </div>

          {portfolio.length === 0 ? (
            <div className="bg-white rounded-2xl border-2 border-dashed border-timberwolf p-10 text-center space-y-4 shadow-subtle">
              <div className="w-12 h-12 rounded-2xl bg-aliceblue text-moonstone mx-auto flex items-center justify-center">
                <Briefcase className="w-6 h-6" />
              </div>
              <div className="max-w-md mx-auto">
                <h3 className="text-sm font-bold text-midnight">No portfolio projects added yet</h3>
                <p className="text-xs text-midnight/60 mt-1">
                  Experts with portfolio items and case studies get booked 3.4x more often by high-paying clients.
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenAddProject}
                className="btn-shine inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover shadow-subtle cursor-pointer min-h-[44px]"
              >
                <PlusCircle className="w-4 h-4 text-moonstone" />
                <span>Add Your First Project</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {portfolio.map((proj) => (
                <div
                  key={proj.id}
                  className="bg-white rounded-2xl border border-timberwolf/70 overflow-hidden shadow-subtle flex flex-col justify-between hover:border-moonstone transition-all"
                >
                  {proj.image_url && (
                    <div className="h-40 bg-slate-100 overflow-hidden border-b border-timberwolf/40">
                      <img
                        src={proj.image_url}
                        alt={proj.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}

                  <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-bold text-sm text-midnight">{proj.title}</h4>
                        {proj.project_url && (
                          <a
                            href={proj.project_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-moonstone hover:text-midnight p-1 transition-colors"
                            title="Visit project URL"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>

                      {proj.description && (
                        <p className="text-xs text-midnight/70 mt-1.5 line-clamp-3 leading-relaxed">
                          {proj.description}
                        </p>
                      )}

                      {proj.technologies && proj.technologies.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {(Array.isArray(proj.technologies) ? proj.technologies : []).map((t: string, idx: number) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded-md bg-aliceblue text-midnight/80 font-mono text-[10px] border border-timberwolf/50 font-semibold"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-timberwolf/40 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEditProject(proj)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-timberwolf text-xs font-semibold text-midnight hover:bg-aliceblue cursor-pointer min-h-[36px]"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-moonstone" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProject(proj.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-200 text-xs font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer min-h-[36px]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: BANK ACCOUNT & WALLET */}
      {/* ========================================================================= */}
      {activeTab === 'payouts' && (
        <section className="space-y-6 animate-fade-in">

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Wallet Balance Card */}
            <div className="bg-gradient-to-br from-midnight to-midnight-light text-aliceblue rounded-2xl p-6 sm:p-7 shadow-card flex flex-col justify-between space-y-6">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-bold tracking-wider text-moonstone flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Authoritative Net Earnings Wallet</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                    Authoritative Integer Paise
                  </span>
                </div>

                <div className="mt-4">
                  <div className="text-3xl sm:text-4xl font-extrabold font-mono text-white tracking-tight">
                    {recordedEarnings.isVerified ? formatINR(recordedEarnings.amount) : '—'}
                  </div>
                  <p className="text-xs text-aliceblue/70 mt-1">
                    Available balance derived from 85% net consultation earnings.
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-[11px] text-aliceblue/60">
                  <span>Gross: {formatINR(earnings.gross || 0)}</span> • <span>Commission: 15%</span>
                </div>
                <button
                  type="button"
                  disabled={requestingPayout}
                  onClick={handleRequestPayout}
                  className="btn-shine px-4 py-2.5 rounded-xl bg-moonstone hover:bg-moonstone-hover text-white text-xs font-bold shadow-subtle transition-all cursor-pointer min-h-[44px] flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {requestingPayout ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Checking...</span>
                    </>
                  ) : (
                    <>
                      <IndianRupee className="w-4 h-4" />
                      <span>Request Payout</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Verified Bank Account Card */}
            <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 sm:p-7 shadow-card flex flex-col justify-between space-y-6">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-timberwolf/40">
                  <span className="text-xs uppercase font-bold tracking-wider text-midnight flex items-center gap-1.5">
                    <Building className="w-4 h-4 text-moonstone" />
                    <span>Verified Payout Bank Account</span>
                  </span>
                  {payoutAccount ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span>Linked</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                      <span>Not Configured</span>
                    </span>
                  )}
                </div>

                {payoutAccount ? (
                  <div className="mt-4 space-y-2.5 text-xs text-midnight">
                    <div className="flex items-center justify-between py-1 border-b border-timberwolf/30">
                      <span className="text-midnight/60">Account Holder:</span>
                      <span className="font-bold">{payoutAccount.account_holder_name}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-timberwolf/30">
                      <span className="text-midnight/60">Bank Account No:</span>
                      <span className="font-mono font-bold tracking-wider">{payoutAccount.account_number_masked}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-timberwolf/30">
                      <span className="text-midnight/60">IFSC Code:</span>
                      <span className="font-mono font-bold">{payoutAccount.ifsc_code}</span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-midnight/60">Bank Name / Type:</span>
                      <span className="font-semibold">{payoutAccount.bank_name || 'Bank Account'} ({payoutAccount.account_type || 'Savings'})</span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 p-4 rounded-xl bg-aliceblue/50 border border-timberwolf/50 text-xs text-midnight/70 space-y-2">
                    <p className="font-semibold text-midnight">No verified bank account is on record.</p>
                    <p>Add your account number and IFSC code to be ready when marketplace gateway transfers process.</p>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-timberwolf/40 flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleOpenBankModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-timberwolf bg-white text-midnight hover:bg-aliceblue text-xs font-bold transition-colors cursor-pointer min-h-[44px]"
                >
                  <CreditCard className="w-4 h-4 text-moonstone" />
                  <span>{payoutAccount ? 'Update Bank Details' : 'Add Bank Account'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* FINANCIAL LEDGER AUDIT TABLE */}
          {(() => {
            const ledgerEntries = walletData?.ledger || walletData?.transactions || [];
            return (
              <div className="space-y-3 pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-midnight flex items-center gap-2">
                    <FileText className="w-4 h-4 text-moonstone" />
                    <span>Financial Ledger & Audit Trail ({ledgerEntries.length})</span>
                  </h3>
                  <span className="text-[11px] text-midnight/50">Immutable server-authoritative ledger</span>
                </div>

                {ledgerEntries.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-timberwolf/70 p-8 text-center text-xs text-midnight/60 shadow-subtle">
                    No financial ledger transactions recorded yet. When consultations complete, authoritative ledger credits and balance records will display here.
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-timberwolf/70 overflow-x-auto shadow-subtle">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-aliceblue/60 text-midnight/60 uppercase font-semibold border-b border-timberwolf/40">
                        <tr>
                          <th className="py-3 px-4">Date & Time</th>
                          <th className="py-3 px-4">Type / Description</th>
                          <th className="py-3 px-4">Gross Paid</th>
                          <th className="py-3 px-4">Commission (15%)</th>
                          <th className="py-3 px-4 text-emerald-800">Net Credit</th>
                          <th className="py-3 px-4">Balance After</th>
                          <th className="py-3 px-4">Reference</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-timberwolf/30 text-midnight/80 font-mono">
                        {ledgerEntries.map((entry: any) => (
                          <tr key={entry.id} className="hover:bg-aliceblue/30 font-sans">
                            <td className="py-3 px-4 text-midnight/60 whitespace-nowrap">
                              {new Date(entry.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="py-3 px-4 font-semibold text-midnight">
                              {entry.entry_type === 'session_earning' ? 'Consultation Earning' : (entry.description || entry.entry_type)}
                            </td>
                            <td className="py-3 px-4 font-mono">
                              {entry.gross_amount_inr ? formatINR(entry.gross_amount_inr) : '—'}
                            </td>
                            <td className="py-3 px-4 font-mono text-rose-700">
                              {entry.platform_fee_inr ? `-${formatINR(entry.platform_fee_inr)}` : '—'}
                            </td>
                            <td className="py-3 px-4 font-mono font-extrabold text-emerald-700">
                              +{formatINR(entry.amount_inr || entry.net_amount_inr)}
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-midnight">
                              {entry.balance_after_inr ? formatINR(entry.balance_after_inr) : '—'}
                            </td>
                            <td className="py-3 px-4 text-[10px] text-midnight/50 font-mono">
                              {entry.reference_id || entry.id}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

        </section>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: CLIENT REVIEWS */}
      {/* ========================================================================= */}
      {activeTab === 'reviews' && (
        <section className="space-y-5 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-midnight flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                <span>Client Reviews & Verified Ratings ({reviews.length})</span>
              </h2>
              <p className="text-xs text-midnight/60 mt-0.5">
                Authentic reviews submitted by clients upon consultation completion.
              </p>
            </div>

            {user?.rating ? (
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 font-bold text-sm w-fit">
                <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                <span>{Number(user.rating).toFixed(1)} / 5.0 Rating</span>
              </div>
            ) : null}
          </div>

          {reviews.length === 0 ? (
            <div className="bg-white rounded-2xl border border-timberwolf/70 p-10 text-center space-y-3 shadow-subtle">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 mx-auto flex items-center justify-center">
                <Star className="w-6 h-6 fill-amber-400" />
              </div>
              <h3 className="text-sm font-bold text-midnight">No client reviews yet</h3>
              <p className="text-xs text-midnight/60 max-w-sm mx-auto">
                Completed consultations will prompt clients to submit verified reviews that appear on your profile.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {reviews.map((rev) => (
                <div
                  key={rev.id}
                  className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-subtle space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={rev.client_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${rev.client_name}`}
                        alt={rev.client_name}
                        className="w-8 h-8 rounded-full object-cover border border-lightblue"
                      />
                      <div>
                        <span className="font-bold text-xs text-midnight block">{rev.client_name}</span>
                        <span className="text-[10px] text-midnight/50">
                          {new Date(rev.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-3.5 h-3.5 ${
                            star <= (rev.rating || 5)
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-zinc-200'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {rev.service_title && (
                    <div className="text-[11px] font-semibold text-moonstone bg-aliceblue px-2 py-0.5 rounded w-fit">
                      {rev.service_title}
                    </div>
                  )}

                  <p className="text-xs text-midnight/80 italic leading-relaxed">
                    "{rev.comment || 'Excellent and insightful consultation session!'}"
                  </p>

                  {/* Provider Reply Display or Action */}
                  {rev.provider_reply ? (
                    <div className="p-3 bg-aliceblue/80 rounded-xl border border-lightblue/60 space-y-1 mt-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-midnight flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-moonstone" />
                          Your Response
                        </span>
                        {rev.provider_replied_at && (
                          <span className="text-midnight/50 text-[10px]">
                            {new Date(rev.provider_replied_at).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric'
                            })}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-midnight/80 leading-relaxed">{rev.provider_reply}</p>
                    </div>
                  ) : replyingReviewId === rev.id ? (
                    <div className="space-y-2 pt-2 border-t border-timberwolf/40 mt-2">
                      <textarea
                        rows={2}
                        value={reviewReplyText}
                        onChange={(e) => setReviewReplyText(e.target.value)}
                        placeholder="Write a professional response to this client..."
                        className="w-full p-2.5 bg-aliceblue/40 border border-timberwolf/70 rounded-xl text-xs text-midnight focus:border-moonstone"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setReplyingReviewId(null);
                            setReviewReplyText('');
                          }}
                          className="px-2.5 py-1 text-xs text-midnight/60 hover:text-midnight cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={submittingReply || !reviewReplyText.trim()}
                          onClick={() => handleSendReviewReply(rev.id)}
                          className="px-3 py-1 bg-midnight text-aliceblue text-xs font-bold rounded-lg hover:bg-midnight-hover disabled:opacity-50 cursor-pointer"
                        >
                          {submittingReply ? 'Sending...' : 'Post Reply'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-timberwolf/30 flex justify-end mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingReviewId(rev.id);
                          setReviewReplyText('');
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-moonstone hover:text-midnight transition cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Reply to Review</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ADD / EDIT PORTFOLIO PROJECT */}
      {/* ========================================================================= */}
      {showProjectModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 space-y-5 shadow-2xl border border-timberwolf animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-timberwolf/40">
              <h3 className="text-base font-bold text-midnight flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-moonstone" />
                <span>{editingProject ? 'Edit Portfolio Project' : 'Add Portfolio Project'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowProjectModal(false)}
                className="p-1 rounded-lg text-midnight/50 hover:text-midnight cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProject} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-midnight block">Project Title *</label>
                <input
                  type="text"
                  required
                  value={projectFormData.title}
                  onChange={(e) => setProjectFormData({ ...projectFormData, title: e.target.value })}
                  placeholder="e.g. Next.js SaaS Architecture Teardown"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-timberwolf text-xs font-medium text-midnight focus:outline-none focus:border-moonstone"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-midnight block">Description / Outcomes</label>
                <textarea
                  rows={3}
                  value={projectFormData.description}
                  onChange={(e) => setProjectFormData({ ...projectFormData, description: e.target.value })}
                  placeholder="What was built, problem solved, impact delivered..."
                  className="w-full p-3 rounded-xl border border-timberwolf text-xs font-medium text-midnight focus:outline-none focus:border-moonstone leading-relaxed"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-midnight block">
                  Technologies / Skills (comma separated)
                </label>
                <input
                  type="text"
                  value={projectFormData.technologies}
                  onChange={(e) => setProjectFormData({ ...projectFormData, technologies: e.target.value })}
                  placeholder="e.g. TypeScript, WebRTC, Tailwind, PostgreSQL"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-timberwolf text-xs font-medium text-midnight focus:outline-none focus:border-moonstone"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-midnight block">Project URL / Live Demo (Optional)</label>
                <input
                  type="url"
                  value={projectFormData.project_url}
                  onChange={(e) => setProjectFormData({ ...projectFormData, project_url: e.target.value })}
                  placeholder="https://github.com/... or https://..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-timberwolf text-xs font-medium text-midnight focus:outline-none focus:border-moonstone"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-midnight block">Thumbnail / Screenshot URL (Optional)</label>
                <input
                  type="url"
                  value={projectFormData.image_url}
                  onChange={(e) => setProjectFormData({ ...projectFormData, image_url: e.target.value })}
                  placeholder="https://... image link"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-timberwolf text-xs font-medium text-midnight focus:outline-none focus:border-moonstone"
                />
              </div>

              <div className="pt-3 border-t border-timberwolf/40 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowProjectModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-timberwolf text-xs font-semibold text-midnight hover:bg-aliceblue cursor-pointer min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProject}
                  className="btn-shine px-5 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover shadow-subtle cursor-pointer disabled:opacity-50 min-h-[44px] flex items-center gap-1.5"
                >
                  {savingProject ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Check className="w-4 h-4 text-moonstone" />
                      <span>{editingProject ? 'Save Changes' : 'Add Project'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ADD / UPDATE BANK ACCOUNT */}
      {/* ========================================================================= */}
      {showBankModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 space-y-5 shadow-2xl border border-timberwolf animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-timberwolf/40">
              <h3 className="text-base font-bold text-midnight flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-moonstone" />
                <span>Verified Payout Bank Account Details</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowBankModal(false)}
                className="p-1 rounded-lg text-midnight/50 hover:text-midnight cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-aliceblue rounded-xl border border-timberwolf/50 text-xs text-midnight/70 flex items-start gap-2">
              <Info className="w-4 h-4 text-moonstone shrink-0 mt-0.5" />
              <p>
                Bank details are encrypted and stored securely. Account numbers are masked everywhere in public and dashboard responses (showing only the last 4 digits).
              </p>
            </div>

            <form onSubmit={handleSaveBankAccount} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-midnight block">Account Holder Full Name *</label>
                <input
                  type="text"
                  required
                  value={bankFormData.account_holder_name}
                  onChange={(e) => setBankFormData({ ...bankFormData, account_holder_name: e.target.value })}
                  placeholder="As registered in your bank passbook"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-timberwolf text-xs font-medium text-midnight focus:outline-none focus:border-moonstone"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-midnight block">Bank Account Number *</label>
                <input
                  type="text"
                  required
                  value={bankFormData.account_number}
                  onChange={(e) => setBankFormData({ ...bankFormData, account_number: e.target.value.replace(/[^0-9]/g, '') })}
                  placeholder="Enter 9 to 18-digit bank account number"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-timberwolf text-xs font-mono font-medium text-midnight focus:outline-none focus:border-moonstone"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-midnight block">Re-enter Bank Account Number *</label>
                <input
                  type="password"
                  required
                  value={bankFormData.confirm_account_number}
                  onChange={(e) => setBankFormData({ ...bankFormData, confirm_account_number: e.target.value.replace(/[^0-9]/g, '') })}
                  placeholder="Re-confirm account number"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-timberwolf text-xs font-mono font-medium text-midnight focus:outline-none focus:border-moonstone"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-midnight block">IFSC Code *</label>
                  <input
                    type="text"
                    required
                    maxLength={11}
                    value={bankFormData.ifsc_code}
                    onChange={(e) => setBankFormData({ ...bankFormData, ifsc_code: e.target.value.toUpperCase() })}
                    placeholder="e.g. HDFC0001234"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-timberwolf text-xs font-mono uppercase font-medium text-midnight focus:outline-none focus:border-moonstone"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-midnight block">Account Type</label>
                  <select
                    value={bankFormData.account_type}
                    onChange={(e) => setBankFormData({ ...bankFormData, account_type: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-timberwolf text-xs font-medium text-midnight focus:outline-none focus:border-moonstone bg-white"
                  >
                    <option value="savings">Savings Account</option>
                    <option value="current">Current Account</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-midnight block">Bank Name (Optional)</label>
                <input
                  type="text"
                  value={bankFormData.bank_name}
                  onChange={(e) => setBankFormData({ ...bankFormData, bank_name: e.target.value })}
                  placeholder="e.g. HDFC Bank, ICICI Bank, State Bank of India"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-timberwolf text-xs font-medium text-midnight focus:outline-none focus:border-moonstone"
                />
              </div>

              <div className="pt-3 border-t border-timberwolf/40 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowBankModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-timberwolf text-xs font-semibold text-midnight hover:bg-aliceblue cursor-pointer min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingBank}
                  className="btn-shine px-5 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover shadow-subtle cursor-pointer disabled:opacity-50 min-h-[44px] flex items-center gap-1.5"
                >
                  {savingBank ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Check className="w-4 h-4 text-moonstone" />
                      <span>Save Bank Details</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: PAYOUTS & EARNINGS NOTICE MODAL */}
      {/* ========================================================================= */}
      {payoutNotice.isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="payout-notice-title"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closePayoutNoticeModal();
            }
          }}
        >
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-md w-full p-5 sm:p-7 space-y-5 shadow-2xl border border-timberwolf/60 animate-scale-up my-auto">

            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-timberwolf/40">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  payoutNotice.status === 'processing'
                    ? 'bg-emerald-50 text-emerald-600'
                    : payoutNotice.status === 'failed'
                    ? 'bg-rose-50 text-rose-600'
                    : 'bg-aliceblue text-moonstone'
                }`}>
                  {payoutNotice.status === 'processing' ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : payoutNotice.status === 'failed' ? (
                    <AlertCircle className="w-5 h-5" />
                  ) : (
                    <ShieldCheck className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 id="payout-notice-title" className="text-base sm:text-lg font-extrabold text-midnight tracking-tight">
                    {payoutNotice.title || 'Payouts & Earnings'}
                  </h3>
                  <span className="text-[11px] text-midnight/50 font-medium">
                    {payoutNotice.status === 'processing'
                      ? 'Payout Status'
                      : payoutNotice.status === 'failed'
                      ? 'Notice'
                      : 'Marketplace Transfer Status'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={closePayoutNoticeModal}
                aria-label="Close payout notice"
                className="p-2 rounded-xl text-midnight/50 hover:text-midnight hover:bg-slate-100 transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-4 text-xs sm:text-sm text-midnight/80 leading-relaxed">

              {payoutNotice.status === 'pending_onboarding' && (
                <>
                  <p className="text-midnight/90 leading-relaxed">
                    Your consultation earnings are being recorded in your account ledger. Automatic bank payouts are not yet available because marketplace transfer activation is pending.
                  </p>

                  {/* Recorded Earnings Card */}
                  <div className="p-4 sm:p-4.5 rounded-2xl bg-aliceblue/60 border border-moonstone/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase font-bold tracking-wider text-midnight/70">
                        Your recorded earnings
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200/80 text-midnight/70 font-semibold font-mono">
                        Ledger Recorded
                      </span>
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold font-mono text-midnight tracking-tight">
                      {recordedEarnings.isVerified
                        ? formatINR(recordedEarnings.amount)
                        : 'Unavailable'}
                    </div>
                    <p className="text-[11px] text-midnight/60">
                      {recordedEarnings.isVerified
                        ? 'Recorded in your account ledger • Funds are protected'
                        : 'Earnings balance could not be retrieved from the server.'}
                    </p>
                  </div>

                  <p className="text-xs text-midnight/70 leading-relaxed">
                    Payout availability will be updated once the payment provider approves marketplace transfers. Until then, automatic withdrawals are unavailable.
                  </p>
                </>
              )}

              {payoutNotice.status === 'processing' && (
                <>
                  <p className="text-midnight/90 leading-relaxed">
                    {payoutNotice.message || 'Your payout request has been received and is being processed according to the platform settlement schedule.'}
                  </p>
                  <div className="p-4 sm:p-4.5 rounded-2xl bg-emerald-50/60 border border-emerald-200/70 space-y-1.5">
                    <span className="text-xs uppercase font-bold tracking-wider text-emerald-800">
                      Requested Balance
                    </span>
                    <div className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-900 tracking-tight">
                      {recordedEarnings.isVerified
                        ? formatINR(recordedEarnings.amount)
                        : '—'}
                    </div>
                    <p className="text-[11px] text-emerald-700/80">
                      Processing bank disbursement to your linked payout account.
                    </p>
                  </div>
                </>
              )}

              {payoutNotice.status === 'failed' && (
                <>
                  <div className="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200/80 text-rose-900 text-xs leading-relaxed font-medium">
                    {payoutNotice.message || 'Unable to process payout request at this time.'}
                  </div>
                  {recordedEarnings.isVerified && (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1">
                      <span className="text-xs font-semibold text-midnight/70">
                        Your recorded ledger balance remains safe:
                      </span>
                      <div className="text-xl font-bold font-mono text-midnight">
                        {formatINR(recordedEarnings.amount)}
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-midnight/70 leading-relaxed">
                    Please verify that your bank account details are correct or contact platform support if this issue persists.
                  </p>
                </>
              )}

              {payoutNotice.status === 'unknown' && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70 text-xs text-midnight/70 space-y-2">
                  <p className="font-semibold text-midnight">Payout Status Information</p>
                  <p>{payoutNotice.message || 'Earnings and payout status are currently unavailable. Please refresh or try again later.'}</p>
                </div>
              )}

            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-timberwolf/40 flex flex-col-reverse sm:flex-row items-center justify-end gap-2 sm:gap-3">
              <button
                type="button"
                onClick={closePayoutNoticeModal}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs sm:text-sm font-bold hover:bg-midnight-hover shadow-subtle cursor-pointer min-h-[44px] transition-colors flex items-center justify-center"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: PLATFORM RANKING METHODOLOGY */}
      {/* ========================================================================= */}
      {rankingModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-timberwolf animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-timberwolf/40">
              <h3 className="text-base font-bold text-midnight flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-500" />
                <span>Merit-Based Ranking Methodology</span>
              </h3>
              <button
                type="button"
                onClick={() => setRankingModalOpen(false)}
                className="p-1 rounded-lg text-midnight/50 hover:text-midnight cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-midnight/80 leading-relaxed">
              <p>
                HireByMinute operates on <strong>zero paid placement</strong>. Experts cannot buy higher ranking or sponsored badges. Your visibility is calculated directly from genuine consultation records:
              </p>
              <div className="space-y-2 bg-aliceblue/60 p-3.5 rounded-xl border border-timberwolf/40">
                <div className="flex justify-between font-semibold">
                  <span>Completed Paid Consultations</span>
                  <span className="text-moonstone">35% Weight</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Verified Client Ratings (1-5★)</span>
                  <span className="text-amber-600">35% Weight</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>10-Minute Acceptance & Response Rate</span>
                  <span className="text-emerald-700">20% Weight</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Profile Depth & Availability Uptime</span>
                  <span className="text-midnight">10% Weight</span>
                </div>
              </div>
              <p className="text-[11px] text-midnight/60 italic">
                Your current performance score: <strong>{providerProfile?.platform_ranking?.rank_score || 85}/100</strong>, placing you in the <strong>Top {Math.max(1, 100 - (providerProfile?.platform_ranking?.percentile || 90))}%</strong> platform tier ({providerProfile?.platform_ranking?.tier || 'Verified Professional'}).
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setRankingModalOpen(false)}
                className="px-4 py-2 bg-midnight text-aliceblue text-xs font-bold rounded-xl hover:bg-midnight-hover cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ProviderDashboardPage;
