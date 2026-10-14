import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { ConsultationRequest, JobApplication } from '../types';
import {
  Clock,
  Calendar,
  CreditCard,
  Star,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Video,
  FileText,
  Search,
  Check,
  XCircle,
  ShieldCheck,
  Zap,
  Briefcase,
  Users,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Filter
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { usePageSEO } from '../hooks/usePageSEO';
import { formatINR, CURRENCY } from '../utils/currency';

// Real-time Countdown Timer for Client Consultation Request
const ClientRequestTimer: React.FC<{ initialSeconds: number; onExpire?: () => void }> = ({
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
      <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
        Expired
      </span>
    );
  }

  let colorClasses = 'bg-aliceblue text-midnight border-timberwolf/60';
  if (seconds < 120) {
    colorClasses = 'bg-rose-50 text-rose-700 border-rose-300 animate-pulse';
  } else if (seconds < 300) {
    colorClasses = 'bg-amber-50 text-amber-800 border-amber-300';
  }

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border font-mono font-bold text-xs ${colorClasses}`}>
      <Clock className="w-3.5 h-3.5" />
      <span>{formatted} remaining</span>
    </div>
  );
};

export const ClientDashboardPage: React.FC = () => {
  usePageSEO({
    title: 'Client Dashboard — HireByMinute',
    noindex: true,
    canonicalPath: '/client'
  });

  const { user } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'overview' | 'consultations' | 'experts' | 'payments' | 'rewards' | 'job_applications'>('overview');
  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [consultations, setConsultations] = useState<any[]>([]);
  const [consultationRequests, setConsultationRequests] = useState<ConsultationRequest[]>([]);
  const [upcomingBookings, setUpcomingBookings] = useState<any[]>([]);
  const [pastSessions, setPastSessions] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [previouslyHiredExperts, setPreviouslyHiredExperts] = useState<any[]>([]);
  const [jobApplications, setJobApplications] = useState<JobApplication[]>([]);
  const [rewardsData, setRewardsData] = useState<{ reward_points_balance: number; ledger: any[] } | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [recommendedExperts, setRecommendedExperts] = useState<any[]>([]);
  const [stats, setStats] = useState<{
    totalExpertsHired?: number;
    totalConsultations?: number;
    completedConsultations?: number;
    activeConsultations?: number;
    totalSessionMinutes?: number;
    totalSpent?: number;
    totalAmountPaid?: number;
    completedSessions?: number;
    pendingRequests?: number;
    ratingsGiven?: number;
    clientRating?: number;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  // Filters & Pagination for Consultations & Payments
  const [consultationFilter, setConsultationFilter] = useState<'all' | 'active' | 'completed' | 'cancelled'>('all');
  const [consultationPage, setConsultationPage] = useState(1);
  const [paymentPage, setPaymentPage] = useState(1);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const [data, jobAppsRes, rewardsRes] = await Promise.all([
        api.getClientDashboard(),
        api.getMyJobApplications().catch(() => ({ applications: [] })),
        api.getClientRewards().catch(() => ({ reward_points_balance: 0, ledger: [] }))
      ]);
      setActiveSession(data.activeSession || null);
      setConsultations(data.consultations || []);
      setConsultationRequests(data.consultationRequests || []);
      setUpcomingBookings(data.upcomingBookings || []);
      setPastSessions(data.pastSessions || []);
      setPayments(data.payments || []);
      setPreviouslyHiredExperts(data.previouslyHiredExperts || []);
      setRecommendedExperts(data.recommendedExperts || []);
      setJobApplications(jobAppsRes?.applications || []);
      setRewardsData(rewardsRes);
      setStats(data.stats || null);
    } catch (err: any) {
      console.error('Failed to load client dashboard', err);
      setError(err.message || 'Failed to connect to the server. Please check your internet connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleWithdrawApplication = async (appId: string) => {
    if (!window.confirm('Are you sure you want to withdraw this application? This action cannot be undone.')) {
      return;
    }
    try {
      setWithdrawingId(appId);
      await api.withdrawJobApplication(appId);
      await loadDashboard();
    } catch (err: any) {
      alert(err.message || 'Failed to withdraw application');
    } finally {
      setWithdrawingId(null);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [user?.id]);

  // Real-time socket updates for request and session status changes
  useEffect(() => {
    if (!socket) return;

    const handleAccepted = () => {
      confetti({ particleCount: 70, spread: 60 });
      loadDashboard();
    };

    const handleDeclined = () => {
      loadDashboard();
    };

    const handleExpired = () => {
      loadDashboard();
    };

    const handleSessionCompleted = () => {
      loadDashboard();
    };

    const handleSessionExtended = () => {
      loadDashboard();
    };

    const handlePaymentCompleted = () => {
      loadDashboard();
    };

    const handleSessionStarted = (data: any) => {
      loadDashboard();
      if (data?.sessionId) {
        navigate(`/session/${data.sessionId}`);
      }
    };

    socket.on('consultation_request_accepted', handleAccepted);
    socket.on('consultation_request_declined', handleDeclined);
    socket.on('consultation_request_expired', handleExpired);
    socket.on('session_completed', handleSessionCompleted);
    socket.on('session_extended', handleSessionExtended);
    socket.on('consultation_payment_completed', handlePaymentCompleted);
    socket.on('session_started', handleSessionStarted);

    return () => {
      socket.off('consultation_request_accepted', handleAccepted);
      socket.off('consultation_request_declined', handleDeclined);
      socket.off('consultation_request_expired', handleExpired);
      socket.off('session_completed', handleSessionCompleted);
      socket.off('session_extended', handleSessionExtended);
      socket.off('consultation_payment_completed', handlePaymentCompleted);
      socket.off('session_started', handleSessionStarted);
    };
  }, [socket, navigate]);

  const handlePayRequest = async (requestId: string) => {
    try {
      setPayingId(requestId);

      // 1. Create server-authoritative Razorpay order
      const orderRes = await api.createRazorpayOrder(requestId);

      // Free consultation reward: 100% discount with 1,000 points
      if (orderRes?.is_free_reward) {
        const payRes = await api.payConsultationRequest(requestId);
        confetti({ particleCount: 80, spread: 60 });
        if (payRes.session_id) {
          navigate(`/session/${payRes.session_id}`);
        } else {
          loadDashboard();
        }
        return;
      }

      if (!orderRes || !orderRes.order_id || !orderRes.key_id) {
        throw new Error('Payment gateway order was not properly initialized. Please try again.');
      }

      // Ensure Razorpay SDK is available
      const ensureRazorpayLoaded = (): Promise<boolean> => {
        return new Promise((resolve) => {
          if ((window as any).Razorpay) return resolve(true);
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = () => resolve(true);
          script.onerror = () => resolve(false);
          document.body.appendChild(script);
        });
      };

      const isLoaded = await ensureRazorpayLoaded();
      if (!isLoaded || !(window as any).Razorpay) {
        throw new Error('Failed to load secure Razorpay payment gateway. Please check your internet connection.');
      }

      // 2. Open Razorpay Checkout modal
      const options = {
        key: orderRes.key_id,
        amount: orderRes.amount,
        currency: orderRes.currency || 'INR',
        name: 'HireByMinute',
        description: `Consultation Payment — ${orderRes.service_title || 'Expert Consultation'}`,
        order_id: orderRes.order_id,
        prefill: {
          name: user?.full_name || '',
          email: user?.email || ''
        },
        theme: {
          color: '#0f172a'
        },
        handler: async (response: any) => {
          try {
            await api.verifyRazorpayPayment(requestId, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });
            confetti({ particleCount: 90, spread: 70 });
            await loadDashboard();
          } catch (err: any) {
            alert(err.message || 'Payment verification failed');
          } finally {
            setPayingId(null);
          }
        },
        modal: {
          ondismiss: () => {
            setPayingId(null);
          }
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', (failResp: any) => {
        alert(failResp.error?.description || 'Payment was cancelled or failed.');
        setPayingId(null);
      });
      rzp.open();
    } catch (err: any) {
      alert(err.message || 'Failed to initiate secure checkout');
      setPayingId(null);
    }
  };

  // Filter consultations
  const filteredConsultations = consultations.filter((c: any) => {
    if (consultationFilter === 'all') return true;
    if (consultationFilter === 'active') {
      return ['PENDING_EXPERT', 'ACCEPTED', 'PAID', 'ACTIVE', 'SCHEDULED'].includes(c.status);
    }
    if (consultationFilter === 'completed') {
      return c.status === 'COMPLETED';
    }
    if (consultationFilter === 'cancelled') {
      return ['DECLINED', 'EXPIRED', 'CANCELLED', 'REFUNDED'].includes(c.status) || c.is_refunded;
    }
    return true;
  });

  const activeConsultationsCount = consultations.filter((c: any) =>
    ['PENDING_EXPERT', 'ACCEPTED', 'PAID', 'ACTIVE', 'SCHEDULED'].includes(c.status)
  ).length;
  const completedConsultationsCount = consultations.filter((c: any) => c.status === 'COMPLETED').length;
  const cancelledConsultationsCount = consultations.filter((c: any) =>
    ['DECLINED', 'EXPIRED', 'CANCELLED', 'REFUNDED'].includes(c.status) || c.is_refunded
  ).length;

  const CONSULTATIONS_PER_PAGE = 8;
  const totalConsultationPages = Math.ceil(filteredConsultations.length / CONSULTATIONS_PER_PAGE) || 1;
  const paginatedConsultations = filteredConsultations.slice(
    (consultationPage - 1) * CONSULTATIONS_PER_PAGE,
    consultationPage * CONSULTATIONS_PER_PAGE
  );

  const PAYMENTS_PER_PAGE = 8;
  const totalPaymentPages = Math.ceil(payments.length / PAYMENTS_PER_PAGE) || 1;
  const paginatedPayments = payments.slice(
    (paymentPage - 1) * PAYMENTS_PER_PAGE,
    paymentPage * PAYMENTS_PER_PAGE
  );

  let totalCaptured = 0;
  let totalRefunded = 0;
  for (const p of payments) {
    if (p.type === 'session_payment' && p.status === 'succeeded' && !p.is_refunded) {
      totalCaptured += Number(p.amount || 0);
    }
    if (p.refund_amount > 0) {
      totalRefunded += Number(p.refund_amount || 0);
    }
  }
  const netSpending = stats?.totalSpent ?? stats?.totalAmountPaid ?? Math.max(0, totalCaptured - totalRefunded);

  // Status mapping helper for consultation items
  const renderStatusBadge = (c: any) => {
    if (c.is_refunded || c.status === 'REFUNDED') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-100 text-purple-800 border border-purple-200">
          Refunded
        </span>
      );
    }
    switch (c.status) {
      case 'PENDING_EXPERT':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span>Awaiting Expert</span>
          </span>
        );
      case 'ACCEPTED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-800 border border-blue-300 flex items-center gap-1">
            <Check className="w-3 h-3 text-blue-600" />
            <span>Payment Pending</span>
          </span>
        );
      case 'PAID':
      case 'SCHEDULED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-teal-100 text-teal-800 border border-teal-200">
            Confirmed
          </span>
        );
      case 'ACTIVE':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>In Progress</span>
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
            <Check className="w-3 h-3 text-emerald-600" />
            <span>Completed</span>
          </span>
        );
      case 'DECLINED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-100 text-rose-800 border border-rose-200">
            Declined
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-zinc-100 text-zinc-700 border border-zinc-300">
            Expired
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-100 text-rose-800 border border-rose-200">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
            {c.status}
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-20 text-center space-y-4 animate-fade-in">
        <div className="w-10 h-10 border-2 border-moonstone border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-medium text-midnight/70">Loading your client workspace...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4 animate-fade-in">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
          <AlertCircle className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-midnight tracking-tight">Unable to load dashboard records</h2>
        <p className="text-xs text-midnight/70 leading-relaxed">
          {error}
        </p>
        <button
          type="button"
          onClick={loadDashboard}
          className="btn-shine inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover shadow-subtle cursor-pointer min-h-[44px] transition-all"
        >
          <RefreshCw className="w-4 h-4 text-moonstone" />
          <span>Try Again</span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8 animate-fade-in">

      {/* Welcome Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-timberwolf/40">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-midnight tracking-tight">
            Client Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-midnight/70 mt-1">
            Manage your hired experts, verified consultation minutes, live session rooms, and payment receipts.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto shrink-0">
          <Link
            to="/profile/edit"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-timberwolf bg-white text-midnight font-semibold text-xs hover:bg-aliceblue shadow-subtle transition-colors min-h-[44px]"
          >
            <img
              src={user?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user?.full_name || 'Client')}`}
              alt={user?.full_name}
              className="w-5 h-5 rounded-full object-cover border border-lightblue"
            />
            <span>Edit Profile</span>
          </Link>

          <Link
            to="/services"
            className="btn-shine inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-midnight text-aliceblue font-bold text-xs hover:bg-midnight-hover shadow-subtle transition-all min-h-[44px]"
          >
            <Search className="w-4 h-4 text-moonstone" />
            <span>Find an Expert</span>
          </Link>
        </div>
      </div>

      {/* 6 Server-Authoritative Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* 1. Experts Hired */}
        <div className="bg-white p-4 sm:p-4.5 rounded-2xl border border-timberwolf/70 shadow-subtle flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-midnight/60">
              Experts Hired
            </span>
            <div className="w-8 h-8 rounded-lg bg-aliceblue text-moonstone flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-xl sm:text-2xl font-extrabold text-midnight font-mono tracking-tight">
              {stats?.totalExpertsHired ?? previouslyHiredExperts.length}
            </div>
            <span className="text-[11px] text-midnight/50 block mt-0.5 truncate">
              Distinct specialists
            </span>
          </div>
        </div>

        {/* 2. Total Consultations */}
        <div className="bg-white p-4 sm:p-4.5 rounded-2xl border border-timberwolf/70 shadow-subtle flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-midnight/60">
              Total Consultations
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-xl sm:text-2xl font-extrabold text-midnight font-mono tracking-tight">
              {stats?.totalConsultations ?? (stats?.completedSessions ? stats.completedSessions + (stats.activeConsultations || 0) : consultations.length)}
            </div>
            <span className="text-[11px] text-midnight/50 block mt-0.5 truncate">
              {stats?.completedConsultations ?? stats?.completedSessions ?? 0} done • {stats?.activeConsultations ?? (activeSession ? 1 : 0)} live
            </span>
          </div>
        </div>

        {/* 3. Consultation Minutes */}
        <div className="bg-white p-4 sm:p-4.5 rounded-2xl border border-timberwolf/70 shadow-subtle flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-midnight/60">
              Consultation Mins
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-xl sm:text-2xl font-extrabold text-midnight font-mono tracking-tight">
              {stats?.totalSessionMinutes ?? 0}m
            </div>
            <span className="text-[11px] text-midnight/50 block mt-0.5 truncate">
              Verified delivered time
            </span>
          </div>
        </div>

        {/* 4. Total Spent */}
        <div className="bg-white p-4 sm:p-4.5 rounded-2xl border border-timberwolf/70 shadow-subtle flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-midnight/60">
              Total Spent
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-xl sm:text-2xl font-extrabold text-midnight font-mono tracking-tight">
              {formatINR(stats?.totalSpent ?? stats?.totalAmountPaid ?? 0)}
            </div>
            <span className="text-[11px] text-midnight/50 block mt-0.5 truncate">
              Net captured spending
            </span>
          </div>
        </div>

        {/* 5. Completed Sessions */}
        <div className="bg-white p-4 sm:p-4.5 rounded-2xl border border-timberwolf/70 shadow-subtle flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-midnight/60">
              Completed Sessions
            </span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-xl sm:text-2xl font-extrabold text-midnight font-mono tracking-tight">
              {stats?.completedSessions ?? pastSessions.length}
            </div>
            <span className="text-[11px] text-midnight/50 block mt-0.5 truncate">
              Finished consultations
            </span>
          </div>
        </div>

        {/* 6. Pending Requests */}
        <div className="bg-white p-4 sm:p-4.5 rounded-2xl border border-timberwolf/70 shadow-subtle flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-midnight/60">
              Pending Requests
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-xl sm:text-2xl font-extrabold text-midnight font-mono tracking-tight">
              {stats?.pendingRequests ?? consultationRequests.filter(r => r.status === 'PENDING_EXPERT').length}
            </div>
            <span className="text-[11px] text-midnight/50 block mt-0.5 truncate">
              Awaiting expert reply
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-timberwolf/60 overflow-x-auto no-scrollbar pb-px">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`min-h-[44px] px-4 py-2.5 text-xs font-bold whitespace-nowrap transition-all border-b-2 cursor-pointer flex items-center active:scale-95 ${
            activeTab === 'overview'
              ? 'border-moonstone text-moonstone'
              : 'border-transparent text-midnight/70 hover:text-midnight'
          }`}
        >
          Overview & Requests ({consultationRequests.length})
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('consultations'); setConsultationPage(1); }}
          className={`min-h-[44px] px-4 py-2.5 text-xs font-bold whitespace-nowrap transition-all border-b-2 cursor-pointer flex items-center active:scale-95 ${
            activeTab === 'consultations'
              ? 'border-moonstone text-moonstone'
              : 'border-transparent text-midnight/70 hover:text-midnight'
          }`}
        >
          My Consultations / Services ({consultations.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('experts')}
          className={`min-h-[44px] px-4 py-2.5 text-xs font-bold whitespace-nowrap transition-all border-b-2 cursor-pointer flex items-center active:scale-95 ${
            activeTab === 'experts'
              ? 'border-moonstone text-moonstone'
              : 'border-transparent text-midnight/70 hover:text-midnight'
          }`}
        >
          Previously Hired Experts ({previouslyHiredExperts.length})
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('payments'); setPaymentPage(1); }}
          className={`min-h-[44px] px-4 py-2.5 text-xs font-bold whitespace-nowrap transition-all border-b-2 cursor-pointer flex items-center active:scale-95 ${
            activeTab === 'payments'
              ? 'border-moonstone text-moonstone'
              : 'border-transparent text-midnight/70 hover:text-midnight'
          }`}
        >
          Payment History ({payments.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('rewards')}
          className={`min-h-[44px] px-4 py-2.5 text-xs font-bold whitespace-nowrap transition-all border-b-2 cursor-pointer flex items-center gap-1.5 active:scale-95 ${
            activeTab === 'rewards'
              ? 'border-moonstone text-moonstone'
              : 'border-transparent text-midnight/70 hover:text-midnight'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-moonstone" />
          <span>Loyalty Rewards ({(rewardsData?.reward_points_balance ?? 0).toLocaleString()} pts)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('job_applications')}
          className={`min-h-[44px] px-4 py-2.5 text-xs font-bold whitespace-nowrap transition-all border-b-2 cursor-pointer flex items-center active:scale-95 ${
            activeTab === 'job_applications'
              ? 'border-moonstone text-moonstone'
              : 'border-transparent text-midnight/70 hover:text-midnight'
          }`}
        >
          Job Applications ({jobApplications.length})
        </button>
      </div>

      {/* Privacy Notice */}
      <div className="bg-aliceblue/60 border border-timberwolf/40 rounded-xl p-3 flex items-center justify-between text-xs text-midnight/70">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-moonstone shrink-0" />
          <span>Private Client Portal — Your payments, consultations, and notes are strictly private and confidential.</span>
        </span>
      </div>

      {/* ACTIVE SESSION HIGHLIGHT CARD (If active) */}
      {activeSession && (
        <div className="bg-midnight text-aliceblue rounded-2xl p-6 sm:p-7 border border-midnight shadow-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-moonstone/20 border border-moonstone flex items-center justify-center text-moonstone shrink-0">
              <Video className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-moonstone bg-midnight-light px-2 py-0.5 rounded">
                Active Live Session
              </span>
              <h3 className="text-lg font-bold text-aliceblue mt-1">
                Session with {activeSession.provider_name}
              </h3>
              <p className="text-xs text-aliceblue/70">{activeSession.service_title}</p>
            </div>
          </div>

          <Link
            to={`/session/${activeSession.id}`}
            className="btn-shine inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-moonstone text-white font-bold text-xs hover:bg-moonstone-hover shadow-subtle transition-all cursor-pointer min-h-[44px]"
          >
            <span>Enter Room Now</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: OVERVIEW & REQUESTS */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-8 animate-fade-in">

          {/* Section: Consultation Requests */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-midnight flex items-center gap-2">
                  <Clock className="w-5 h-5 text-moonstone" />
                  <span>Consultation Requests ({consultationRequests.length})</span>
                </h2>
                <p className="text-xs text-midnight/60 mt-0.5">Payment is only charged after the expert accepts your topic and timing.</p>
              </div>
              {consultationRequests.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setActiveTab('consultations'); setConsultationFilter('active'); }}
                  className="text-xs font-semibold text-moonstone hover:underline"
                >
                  View all requests
                </button>
              )}
            </div>

            {consultationRequests.length === 0 ? (
              <div className="bg-white rounded-2xl border border-timberwolf/70 p-8 text-center shadow-subtle space-y-3">
                <Clock className="w-8 h-8 text-timberwolf-dark mx-auto" />
                <h4 className="text-sm font-bold text-midnight">No consultation requests yet</h4>
                <p className="text-xs text-midnight/60 max-w-sm mx-auto leading-relaxed">
                  Browse our marketplace to find an expert. Request a consultation first, and pay only after the expert confirms availability.
                </p>
                <Link
                  to="/services"
                  className="btn-shine inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover shadow-subtle transition-all min-h-[44px]"
                >
                  <Search className="w-4 h-4 text-moonstone" />
                  <span>Find an Expert</span>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {consultationRequests.slice(0, 4).map((req) => (
                  <div
                    key={req.id}
                    className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card space-y-4 hover:border-moonstone/60 transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={req.provider_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(req.provider_name || 'expert')}`}
                            alt={req.provider_name || 'Expert'}
                            className="w-12 h-12 rounded-xl object-cover border border-lightblue shrink-0"
                          />
                          <div>
                            <h4 className="font-bold text-sm text-midnight">{req.provider_name}</h4>
                            <p className="text-xs text-midnight/70 line-clamp-1">{req.service_title}</p>
                            <span className="text-[11px] text-midnight/60 block mt-0.5 font-mono">
                              {req.duration_minutes} mins • {formatINR(req.total_price)}
                            </span>
                          </div>
                        </div>

                        {req.status === 'PENDING_EXPERT' && (
                          <ClientRequestTimer
                            initialSeconds={req.remaining_seconds || 600}
                            onExpire={loadDashboard}
                          />
                        )}
                        {req.status === 'ACCEPTED' && (
                          <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>Accepted</span>
                          </span>
                        )}
                        {req.status === 'PAID' && (
                          <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                            Confirmed
                          </span>
                        )}
                        {req.status === 'DECLINED' && (
                          <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                            Declined
                          </span>
                        )}
                        {req.status === 'EXPIRED' && (
                          <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 border border-zinc-300">
                            Expired (10m)
                          </span>
                        )}
                      </div>

                      {req.problem_description && (
                        <div className="p-3 bg-aliceblue/50 rounded-xl border border-timberwolf/40 text-xs text-midnight/80">
                          <span className="text-[10px] uppercase font-bold text-midnight/50 block mb-0.5">
                            Your Topic:
                          </span>
                          <p className="italic leading-relaxed line-clamp-2">"{req.problem_description}"</p>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-timberwolf/40">
                      {req.status === 'PENDING_EXPERT' && (
                        <div className="flex items-center justify-between text-xs text-midnight/60">
                          <span className="flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5 text-moonstone" />
                            <span>Awaiting expert acceptance</span>
                          </span>
                          <span className="text-[11px] font-medium text-midnight/40">Zero charge until accepted</span>
                        </div>
                      )}

                      {req.status === 'ACCEPTED' && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-emerald-800 font-semibold">
                            <span>{req.provider_name} is ready!</span>
                            <span className="font-mono text-sm">{formatINR(req.total_price)}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handlePayRequest(req.id)}
                            disabled={payingId === req.id}
                            className="btn-shine w-full py-2.5 rounded-xl bg-midnight text-aliceblue font-bold text-xs hover:bg-midnight-hover transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 min-h-[44px]"
                          >
                            {payingId === req.id ? (
                              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <>
                                <span>Pay & Confirm Consultation</span>
                                <ArrowRight className="w-3.5 h-3.5 text-moonstone" />
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {req.status === 'PAID' && req.session_id && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-emerald-700 font-medium">Session workspace ready</span>
                          <Link
                            to={`/session/${req.session_id}`}
                            className="btn-shine px-4 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover inline-flex items-center gap-1 min-h-[44px]"
                          >
                            <span>Enter Room</span>
                            <ArrowRight className="w-3.5 h-3.5 text-moonstone" />
                          </Link>
                        </div>
                      )}

                      {(req.status === 'DECLINED' || req.status === 'EXPIRED') && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-midnight/60">
                            {req.status === 'DECLINED' ? 'Expert unavailable • No charge' : 'Response timed out • No charge'}
                          </span>
                          <Link
                            to="/services"
                            className="px-3.5 py-1.5 rounded-xl bg-aliceblue text-midnight border border-timberwolf text-xs font-semibold hover:border-moonstone"
                          >
                            Find Another Expert
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section: Previously Hired Experts Preview */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-midnight flex items-center gap-2">
                  <Users className="w-5 h-5 text-moonstone" />
                  <span>Previously Hired Experts ({previouslyHiredExperts.length})</span>
                </h2>
                <p className="text-xs text-midnight/60 mt-0.5">Specialists you've worked with before for quick 1-click re-booking.</p>
              </div>
              {previouslyHiredExperts.length > 2 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('experts')}
                  className="text-xs text-moonstone font-semibold hover:underline"
                >
                  View all ({previouslyHiredExperts.length})
                </button>
              )}
            </div>

            {previouslyHiredExperts.length === 0 ? (
              <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 text-center shadow-subtle space-y-2">
                <p className="text-xs text-midnight/60">You haven't hired any experts yet.</p>
                <Link to="/services" className="text-xs text-moonstone font-bold hover:underline inline-flex items-center gap-1">
                  <span>Explore Marketplace Experts</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {previouslyHiredExperts.slice(0, 2).map((exp) => (
                  <div
                    key={exp.provider_id}
                    className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card flex flex-col justify-between gap-4 hover:border-moonstone/60 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3.5">
                        <img
                          src={exp.provider_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(exp.provider_name)}`}
                          alt={exp.provider_name}
                          className="w-12 h-12 rounded-xl object-cover border border-lightblue shrink-0"
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-bold text-sm text-midnight">{exp.provider_name}</h4>
                            <span className="flex items-center gap-0.5 text-xs text-amber-600 font-bold">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                              {(Number(exp.provider_rating) || 5.0).toFixed(1)}
                            </span>
                          </div>
                          <p className="text-xs text-midnight/70 line-clamp-1">{exp.provider_headline}</p>
                          <span className="inline-block mt-0.5 text-[10px] px-2 py-0.5 rounded-full bg-aliceblue text-moonstone font-semibold border border-timberwolf/40">
                            {exp.category_name}
                          </span>
                        </div>
                      </div>

                      {exp.current_status === 'ACTIVE_SESSION' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Live
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 py-2 px-3 rounded-xl bg-aliceblue/40 border border-timberwolf/30 text-center text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-midnight/50 block">Bookings</span>
                        <span className="font-mono font-bold text-midnight">{exp.total_consultations}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-midnight/50 block">Minutes</span>
                        <span className="font-mono font-bold text-midnight">{exp.total_minutes}m</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-midnight/50 block">Spent</span>
                        <span className="font-mono font-bold text-midnight">{formatINR(exp.total_spent_inr)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-timberwolf/40">
                      <Link
                        to={exp.service_id ? `/services/${exp.service_id}` : '/services'}
                        className="flex-1 py-2 px-3 rounded-xl border border-timberwolf text-xs font-bold text-midnight hover:bg-aliceblue text-center transition-colors min-h-[44px] flex items-center justify-center"
                      >
                        View Profile
                      </Link>
                      <Link
                        to={exp.service_id ? `/services/${exp.service_id}` : '/services'}
                        className="flex-1 btn-shine py-2 px-3 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover shadow-subtle text-center flex items-center justify-center gap-1 min-h-[44px]"
                      >
                        <span>Book Again</span>
                        <ArrowRight className="w-3.5 h-3.5 text-moonstone" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section: Recommended Experts For You */}
          {recommendedExperts.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-midnight flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-moonstone" />
                    <span>Recommended Experts For You</span>
                  </h2>
                  <p className="text-xs text-midnight/60 mt-0.5">Curated based on your consultation topics and verified credentials.</p>
                </div>
                <Link to="/services" className="text-xs text-moonstone font-bold hover:underline flex items-center gap-1">
                  <span>Explore Marketplace</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recommendedExperts.slice(0, 3).map((exp) => (
                  <div
                    key={exp.id}
                    className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card space-y-3 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={exp.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(exp.full_name)}`}
                            alt={exp.full_name}
                            className="w-12 h-12 rounded-xl object-cover border border-lightblue shrink-0"
                          />
                          <div>
                            <h4 className="font-bold text-sm text-midnight flex items-center gap-1.5">
                              <span>{exp.full_name}</span>
                              {exp.is_verified === 1 && (
                                <span title="Credential Verified">
                                  <ShieldCheck className="w-3.5 h-3.5 text-moonstone" />
                                </span>
                              )}
                            </h4>
                            <p className="text-xs text-midnight/70 line-clamp-1">
                              {exp.professional_title || exp.category_name || 'Marketplace Expert'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-timberwolf/30 text-xs">
                        <div className="flex items-center gap-1 font-bold text-amber-600">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          <span>{Number(exp.rating || 5.0).toFixed(1)}</span>
                          <span className="text-[10px] text-midnight/50 font-normal">({exp.review_count || 0})</span>
                        </div>
                        <span>•</span>
                        <span className="font-mono font-bold text-midnight">
                          {formatINR(exp.price_per_minute || 50)}/min
                        </span>
                      </div>
                    </div>

                    <Link
                      to={exp.service_id ? `/services/${exp.service_id}` : `/services`}
                      className="btn-shine w-full py-2.5 px-3 rounded-xl bg-midnight hover:bg-midnight-hover text-aliceblue text-xs font-bold flex items-center justify-center gap-1.5 shadow-subtle transition mt-2 cursor-pointer min-h-[44px]"
                    >
                      <span>Consult Expert</span>
                      <ArrowRight className="w-3.5 h-3.5 text-moonstone" />
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: MY CONSULTATIONS / SERVICES RECEIVED */}
      {/* ========================================================================= */}
      {activeTab === 'consultations' && (
        <section className="space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-midnight flex items-center gap-2">
                <Calendar className="w-5 h-5 text-moonstone" />
                <span>My Consultations / Services Received ({consultations.length})</span>
              </h2>
              <p className="text-xs text-midnight/60 mt-0.5">Authoritative history of all booked, active, completed, and refunded consultations.</p>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 bg-aliceblue/80 p-1 rounded-xl border border-timberwolf/40 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => { setConsultationFilter('all'); setConsultationPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap min-h-[36px] ${
                  consultationFilter === 'all'
                    ? 'bg-midnight text-aliceblue shadow-subtle'
                    : 'text-midnight/70 hover:text-midnight'
                }`}
              >
                All ({consultations.length})
              </button>
              <button
                type="button"
                onClick={() => { setConsultationFilter('active'); setConsultationPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap min-h-[36px] ${
                  consultationFilter === 'active'
                    ? 'bg-midnight text-aliceblue shadow-subtle'
                    : 'text-midnight/70 hover:text-midnight'
                }`}
              >
                Upcoming & Active ({activeConsultationsCount})
              </button>
              <button
                type="button"
                onClick={() => { setConsultationFilter('completed'); setConsultationPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap min-h-[36px] ${
                  consultationFilter === 'completed'
                    ? 'bg-midnight text-aliceblue shadow-subtle'
                    : 'text-midnight/70 hover:text-midnight'
                }`}
              >
                Completed ({completedConsultationsCount})
              </button>
              <button
                type="button"
                onClick={() => { setConsultationFilter('cancelled'); setConsultationPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap min-h-[36px] ${
                  consultationFilter === 'cancelled'
                    ? 'bg-midnight text-aliceblue shadow-subtle'
                    : 'text-midnight/70 hover:text-midnight'
                }`}
              >
                Cancelled / Refunded ({cancelledConsultationsCount})
              </button>
            </div>
          </div>

          {filteredConsultations.length === 0 ? (
            <div className="bg-white rounded-2xl border border-timberwolf/70 p-8 text-center shadow-subtle space-y-3 max-w-md mx-auto my-6">
              <div className="w-12 h-12 rounded-2xl bg-aliceblue text-moonstone mx-auto flex items-center justify-center border border-timberwolf/60">
                <Calendar className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-midnight">No consultations found</h4>
              <p className="text-xs text-midnight/60 leading-relaxed">
                {consultationFilter === 'all'
                  ? "You haven't requested or received any consultations yet. Find an expert to get started."
                  : `No consultations currently match the "${consultationFilter}" filter.`}
              </p>
              <Link
                to="/services"
                className="btn-shine inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover shadow-subtle transition-all min-h-[44px]"
              >
                <Search className="w-4 h-4 text-moonstone" />
                <span>Find an Expert</span>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-timberwolf/70 divide-y divide-timberwolf/30 shadow-subtle overflow-hidden">
                {paginatedConsultations.map((c: any) => (
                  <div key={c.consultation_key || c.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-aliceblue/20 transition-colors">
                    <div className="flex items-start gap-4">
                      <img
                        src={c.expert_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(c.expert_name || 'Expert')}`}
                        alt={c.expert_name}
                        className="w-12 h-12 rounded-xl object-cover border border-lightblue shrink-0"
                      />
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-sm text-midnight">{c.expert_name}</h4>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-aliceblue text-moonstone font-semibold border border-timberwolf/40">
                            {c.category_name}
                          </span>
                          {renderStatusBadge(c)}
                        </div>
                        <p className="text-xs font-semibold text-midnight/80">{c.service_title}</p>

                        <div className="text-[11px] text-midnight/60 flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                          <span>
                            Date: {c.consultation_date ? new Date(c.consultation_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Pending'}
                          </span>
                          <span>•</span>
                          <span className="font-mono">
                            Duration: {c.duration_minutes} mins {c.status === 'COMPLETED' ? '(verified)' : ''}
                          </span>
                          <span>•</span>
                          <span className="font-mono font-bold text-midnight">
                            Amount: {formatINR(c.gross_amount)}
                          </span>
                          {c.is_refunded && (
                            <>
                              <span>•</span>
                              <span className="font-mono text-purple-700 font-bold">
                                Refund: -{formatINR(c.refund_amount || c.gross_amount)}
                              </span>
                            </>
                          )}
                        </div>

                        {c.problem_description && (
                          <p className="text-xs text-midnight/70 italic line-clamp-1 pt-1">
                            Topic: "{c.problem_description}"
                          </p>
                        )}

                        {c.review_rating && (
                          <div className="flex items-center gap-1 text-xs text-amber-600 font-bold pt-1">
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                            <span>Your Rating: {c.review_rating}/5</span>
                            {c.review_comment && <span className="text-midnight/60 font-normal italic"> — "{c.review_comment}"</span>}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                      {c.status === 'ACCEPTED' && (
                        <button
                          type="button"
                          onClick={() => handlePayRequest(c.request_id || c.id)}
                          disabled={payingId === (c.request_id || c.id)}
                          className="btn-shine px-4 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover shadow-subtle min-h-[44px] cursor-pointer flex items-center gap-1.5"
                        >
                          <span>Pay & Confirm</span>
                          <ArrowRight className="w-3.5 h-3.5 text-moonstone" />
                        </button>
                      )}

                      {(c.status === 'ACTIVE' || (c.status === 'PAID' && c.session_id)) && (
                        <Link
                          to={`/session/${c.session_id}`}
                          className="btn-shine px-4 py-2.5 rounded-xl bg-moonstone hover:bg-moonstone-hover text-white text-xs font-bold shadow-subtle min-h-[44px] inline-flex items-center gap-1.5"
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span>Enter Room</span>
                        </Link>
                      )}

                      {c.status === 'COMPLETED' && c.session_id && (
                        <Link
                          to={`/session/${c.session_id}`}
                          className="px-3.5 py-2.5 rounded-xl border border-timberwolf text-xs font-bold text-midnight hover:bg-aliceblue min-h-[44px] inline-flex items-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5 text-moonstone" />
                          <span>View Notes</span>
                        </Link>
                      )}

                      <Link
                        to={c.service_id ? `/services/${c.service_id}` : '/services'}
                        className="btn-shine px-3.5 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover shadow-subtle min-h-[44px] inline-flex items-center gap-1"
                      >
                        <span>Book Again</span>
                        <ArrowRight className="w-3 h-3 text-moonstone" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination Controls */}
              {totalConsultationPages > 1 && (
                <div className="flex items-center justify-between pt-2 px-1 text-xs">
                  <span className="text-midnight/60">
                    Showing {(consultationPage - 1) * CONSULTATIONS_PER_PAGE + 1}–{Math.min(consultationPage * CONSULTATIONS_PER_PAGE, filteredConsultations.length)} of {filteredConsultations.length} consultations
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={consultationPage <= 1}
                      onClick={() => setConsultationPage(p => Math.max(1, p - 1))}
                      className="p-2 rounded-lg border border-timberwolf text-midnight hover:bg-aliceblue disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="font-bold text-midnight px-2">
                      Page {consultationPage} of {totalConsultationPages}
                    </span>
                    <button
                      type="button"
                      disabled={consultationPage >= totalConsultationPages}
                      onClick={() => setConsultationPage(p => Math.min(totalConsultationPages, p + 1))}
                      className="p-2 rounded-lg border border-timberwolf text-midnight hover:bg-aliceblue disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: PREVIOUSLY HIRED EXPERTS FULL TAB */}
      {/* ========================================================================= */}
      {activeTab === 'experts' && (
        <section className="space-y-6 animate-fade-in">
          <div>
            <h2 className="text-lg font-bold text-midnight flex items-center gap-2">
              <Users className="w-5 h-5 text-moonstone" />
              <span>Previously Hired Experts ({previouslyHiredExperts.length})</span>
            </h2>
            <p className="text-xs text-midnight/60 mt-0.5">
              Verified specialists you've hired on HireByMinute. Re-hire instantly for follow-ups or ongoing projects.
            </p>
          </div>

          {previouslyHiredExperts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-timberwolf/70 p-8 text-center shadow-subtle space-y-3 max-w-md mx-auto my-6">
              <div className="w-12 h-12 rounded-2xl bg-aliceblue text-moonstone mx-auto flex items-center justify-center border border-timberwolf/60">
                <Users className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-midnight">No previously hired experts yet</h4>
              <p className="text-xs text-midnight/60 leading-relaxed">
                When you book consultations, your verified specialists will be securely saved here for quick 1-click follow-up consultations.
              </p>
              <Link
                to="/services"
                className="btn-shine inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover shadow-subtle transition-all min-h-[44px]"
              >
                <Search className="w-4 h-4 text-moonstone" />
                <span>Find an Expert</span>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {previouslyHiredExperts.map((exp) => (
                <div
                  key={exp.provider_id}
                  className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card flex flex-col justify-between gap-4 hover:border-moonstone/60 transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3.5">
                        <img
                          src={exp.provider_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(exp.provider_name)}`}
                          alt={exp.provider_name}
                          className="w-12 h-12 rounded-xl object-cover border border-lightblue shrink-0"
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-bold text-sm text-midnight">{exp.provider_name}</h4>
                            <span className="flex items-center gap-0.5 text-xs text-amber-600 font-bold">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                              {(Number(exp.provider_rating) || 5.0).toFixed(1)}
                            </span>
                          </div>
                          <p className="text-xs text-midnight/70 line-clamp-1">{exp.provider_headline}</p>
                          <span className="inline-block mt-0.5 text-[10px] px-2 py-0.5 rounded-full bg-aliceblue text-moonstone font-semibold border border-timberwolf/40">
                            {exp.category_name}
                          </span>
                        </div>
                      </div>

                      {exp.current_status === 'ACTIVE_SESSION' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Live Now
                        </span>
                      )}
                      {exp.current_status === 'PAYMENT_PENDING' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                          Accepted
                        </span>
                      )}
                      {exp.current_status === 'AWAITING_EXPERT' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                          Awaiting
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 py-2 px-3 rounded-xl bg-aliceblue/40 border border-timberwolf/30 text-center text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-midnight/50 block">Bookings</span>
                        <span className="font-mono font-bold text-midnight">{exp.total_consultations}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-midnight/50 block">Minutes</span>
                        <span className="font-mono font-bold text-midnight">{exp.total_minutes}m</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-midnight/50 block">Spent</span>
                        <span className="font-mono font-bold text-midnight">{formatINR(exp.total_spent_inr)}</span>
                      </div>
                    </div>

                    {exp.last_consultation_date && (
                      <div className="text-[11px] text-midnight/50 flex items-center justify-between pt-1">
                        <span>Most recent consultation:</span>
                        <span className="font-medium text-midnight/70">
                          {new Date(exp.last_consultation_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-timberwolf/40">
                    <Link
                      to={exp.service_id ? `/services/${exp.service_id}` : '/services'}
                      className="flex-1 py-2 px-3 rounded-xl border border-timberwolf text-xs font-bold text-midnight hover:bg-aliceblue text-center transition-colors min-h-[44px] flex items-center justify-center"
                    >
                      View Profile
                    </Link>
                    <Link
                      to={exp.service_id ? `/services/${exp.service_id}` : '/services'}
                      className="flex-1 btn-shine py-2 px-3 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover shadow-subtle text-center flex items-center justify-center gap-1 min-h-[44px]"
                    >
                      <span>Book Again</span>
                      <ArrowRight className="w-3.5 h-3.5 text-moonstone" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: PAYMENT HISTORY & SPENDING */}
      {/* ========================================================================= */}
      {activeTab === 'payments' && (
        <section className="space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-midnight flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-moonstone" />
                <span>Payment & Spending History ({payments.length})</span>
              </h2>
              <p className="text-xs text-midnight/60 mt-0.5">Authoritative payment records verified through our secure payment gateway.</p>
            </div>
            <span className="text-[11px] text-midnight/50 font-medium">100% Encrypted & Private</span>
          </div>

          {/* Financial Breakdown Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4.5 rounded-2xl border border-timberwolf/70 shadow-subtle">
              <span className="text-[10px] font-bold uppercase tracking-wider text-midnight/60 block">
                Total Captured Payments
              </span>
              <div className="text-xl sm:text-2xl font-extrabold font-mono text-midnight mt-1">
                {formatINR(totalCaptured)}
              </div>
              <span className="text-[11px] text-midnight/50 block mt-0.5">
                Successfully processed
              </span>
            </div>

            <div className="bg-white p-4.5 rounded-2xl border border-timberwolf/70 shadow-subtle">
              <span className="text-[10px] font-bold uppercase tracking-wider text-midnight/60 block">
                Total Completed Refunds
              </span>
              <div className="text-xl sm:text-2xl font-extrabold font-mono text-purple-700 mt-1">
                {formatINR(totalRefunded)}
              </div>
              <span className="text-[11px] text-midnight/50 block mt-0.5">
                Credited back to account
              </span>
            </div>

            <div className="bg-gradient-to-br from-midnight to-midnight-light text-aliceblue p-4.5 rounded-2xl shadow-card">
              <span className="text-[10px] font-bold uppercase tracking-wider text-moonstone block">
                Net Client Spending
              </span>
              <div className="text-xl sm:text-2xl font-extrabold font-mono text-white mt-1">
                {formatINR(netSpending)}
              </div>
              <span className="text-[11px] text-aliceblue/70 block mt-0.5">
                Captured payments minus refunds
              </span>
            </div>
          </div>

          {payments.length === 0 ? (
            <div className="bg-white rounded-2xl border border-timberwolf/70 p-8 text-center text-xs text-midnight/60 shadow-subtle space-y-2">
              <CreditCard className="w-8 h-8 text-timberwolf-dark mx-auto" />
              <p className="font-bold text-midnight">No payment transactions recorded yet.</p>
              <p>When you complete consultation bookings, verified receipts and invoice details will appear here.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-timberwolf/70 overflow-x-auto shadow-subtle">
                <table className="w-full text-left text-xs">
                  <thead className="bg-aliceblue/60 text-midnight/60 uppercase font-semibold border-b border-timberwolf/40">
                    <tr>
                      <th className="py-3 px-4">Transaction ID</th>
                      <th className="py-3 px-4">Consultation / Service</th>
                      <th className="py-3 px-4">Expert</th>
                      <th className="py-3 px-4">Gross Paid</th>
                      <th className="py-3 px-4">Refund</th>
                      <th className="py-3 px-4 text-emerald-800">Net Spent</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-timberwolf/30 text-midnight/80">
                    {paginatedPayments.map((pay) => (
                      <tr key={pay.id} className="hover:bg-aliceblue/30 font-sans">
                        <td className="py-3.5 px-4 font-mono text-[11px] text-midnight">
                          {pay.id}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-midnight max-w-xs truncate">
                          {pay.service_title || 'Consultation Session'}
                          {pay.category_name && (
                            <span className="block text-[10px] text-midnight/50 font-normal">
                              {pay.category_name}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            {pay.provider_avatar ? (
                              <img
                                src={pay.provider_avatar}
                                alt={pay.provider_name}
                                className="w-6 h-6 rounded-full object-cover border border-lightblue shrink-0"
                              />
                            ) : null}
                            <span className="font-medium text-midnight whitespace-nowrap">
                              {pay.provider_name || 'Marketplace Expert'}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-midnight">
                          {formatINR(pay.amount)}
                        </td>
                        <td className="py-3.5 px-4 font-mono">
                          {pay.refund_amount > 0 ? (
                            <span className="text-purple-700 font-bold">
                              -{formatINR(pay.refund_amount)}
                            </span>
                          ) : (
                            <span className="text-midnight/40">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-extrabold text-emerald-800">
                          {formatINR(pay.net_amount)}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {pay.status === 'refunded' || pay.refund_amount > 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-100 text-purple-800 border border-purple-200">
                              Refunded
                            </span>
                          ) : pay.status === 'succeeded' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Succeeded
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200">
                              {pay.status}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-midnight/60 whitespace-nowrap">
                          {new Date(pay.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Payment Pagination */}
              {totalPaymentPages > 1 && (
                <div className="flex items-center justify-between pt-2 px-1 text-xs">
                  <span className="text-midnight/60">
                    Showing {(paymentPage - 1) * PAYMENTS_PER_PAGE + 1}–{Math.min(paymentPage * PAYMENTS_PER_PAGE, payments.length)} of {payments.length} transactions
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={paymentPage <= 1}
                      onClick={() => setPaymentPage(p => Math.max(1, p - 1))}
                      className="p-2 rounded-lg border border-timberwolf text-midnight hover:bg-aliceblue disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="font-bold text-midnight px-2">
                      Page {paymentPage} of {totalPaymentPages}
                    </span>
                    <button
                      type="button"
                      disabled={paymentPage >= totalPaymentPages}
                      onClick={() => setPaymentPage(p => Math.min(totalPaymentPages, p + 1))}
                      className="p-2 rounded-lg border border-timberwolf text-midnight hover:bg-aliceblue disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: LOYALTY REWARDS & POINTS */}
      {/* ========================================================================= */}
      {activeTab === 'rewards' && (
        <section className="space-y-6 animate-fade-in">
          {/* Rewards Hero Banner */}
          <div className="bg-gradient-to-br from-midnight via-midnight-light to-moonstone/90 rounded-2xl p-6 sm:p-8 text-aliceblue shadow-card flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-emerald-300 text-xs font-bold border border-white/20">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Loyalty Consultation Rewards Program</span>
              </span>
              <h2 className="text-2xl font-extrabold text-aliceblue">
                {(rewardsData?.reward_points_balance ?? 0).toLocaleString()} Points Available
              </h2>
              <p className="text-xs text-aliceblue/80 leading-relaxed">
                Earn 20 reward points for every consultation minute completed. Every 1,000 points unlocks a 5-minute credit (up to ₹500 discount) on any verified expert consultation!
              </p>
            </div>

            <div className="p-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 text-center shrink-0 w-full md:w-auto">
              <span className="text-[10px] font-bold uppercase tracking-wider text-aliceblue/70 block">Redemption Value</span>
              <div className="text-2xl font-extrabold font-mono text-emerald-300 mt-0.5">
                {(rewardsData?.reward_points_balance ?? 0) >= 1000 ? '5 Free Minutes' : `${1000 - ((rewardsData?.reward_points_balance ?? 0) % 1000)} pts to next reward`}
              </div>
              <Link
                to="/services"
                className="btn-shine mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-moonstone hover:bg-moonstone-hover text-white text-xs font-bold transition-all shadow-subtle w-full justify-center min-h-[44px]"
              >
                <span>Browse Experts & Redeem</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Reward Points Activity History */}
          <div className="space-y-4">
            <h3 className="text-base font-bold text-midnight flex items-center gap-2">
              <Clock className="w-4 h-4 text-moonstone" />
              <span>Points Activity & Ledger</span>
            </h3>

            {!rewardsData?.ledger || rewardsData.ledger.length === 0 ? (
              <div className="bg-white rounded-2xl border border-timberwolf/70 p-8 text-center text-xs text-midnight/60 shadow-subtle">
                No reward point transactions yet. Points will be automatically credited to your balance after every completed consultation session.
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-timberwolf/70 overflow-x-auto shadow-subtle">
                <table className="w-full text-left text-xs">
                  <thead className="bg-aliceblue/60 text-midnight/60 uppercase font-semibold border-b border-timberwolf/40">
                    <tr>
                      <th className="py-3 px-4">Transaction</th>
                      <th className="py-3 px-4">Points</th>
                      <th className="py-3 px-4">Notes</th>
                      <th className="py-3 px-4">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-timberwolf/30 text-midnight/80">
                    {rewardsData.ledger.map((item: any) => (
                      <tr key={item.id} className="hover:bg-aliceblue/30 font-sans">
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            item.points_delta > 0
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {item.entry_type === 'EARNED' ? '+ Earned' : '- Redeemed'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-extrabold text-sm">
                          <span className={item.points_delta > 0 ? 'text-emerald-700' : 'text-amber-700'}>
                            {item.points_delta > 0 ? `+${item.points_delta}` : item.points_delta} pts
                          </span>
                        </td>
                        <td className="py-3 px-4 text-midnight/70">{item.description || item.entry_type}</td>
                        <td className="py-3 px-4 text-midnight/60">
                          {new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: JOB APPLICATIONS */}
      {/* ========================================================================= */}
      {activeTab === 'job_applications' && (
        <section className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-midnight flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-moonstone" />
                <span>My Job Applications</span>
              </h3>
              <p className="text-xs text-midnight/60 mt-0.5">
                Track candidate review milestones, statuses, and your submitted resume documents.
              </p>
            </div>
            <Link
              to="/jobs"
              className="text-xs font-semibold text-moonstone hover:text-moonstone-dark flex items-center gap-1 transition-colors min-h-[44px]"
            >
              <span>Browse More Openings</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {jobApplications.length === 0 ? (
            <div className="p-10 bg-white rounded-2xl border border-timberwolf/70 text-center shadow-card space-y-3 max-w-md mx-auto my-6">
              <div className="w-12 h-12 rounded-xl bg-aliceblue text-moonstone mx-auto flex items-center justify-center border border-timberwolf/60">
                <Briefcase className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-midnight">No applications submitted</h4>
              <p className="text-xs text-midnight/60">
                Apply to verified remote, hybrid, and on-site full-time roles posted by vetted tech companies.
              </p>
              <Link
                to="/jobs"
                className="btn-shine inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover shadow-subtle min-h-[44px]"
              >
                <span>Browse Full-Time Jobs</span>
                <ArrowRight className="w-3.5 h-3.5 text-moonstone" />
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {jobApplications.map((app) => (
                <div
                  key={app.id}
                  className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-5 sm:p-6 shadow-card hover:border-moonstone/60 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-base font-bold text-midnight">{app.job_title}</h4>
                      <span className="text-xs text-midnight/60 font-medium">at {app.company_name}</span>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                          app.status === 'Submitted'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : app.status === 'Under Review'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : app.status === 'Shortlisted'
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : app.status === 'Interview'
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : app.status === 'Hired'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : app.status === 'Withdrawn'
                            ? 'bg-zinc-100 text-zinc-600 border-zinc-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {app.status}
                      </span>
                    </div>

                    <div className="text-xs text-midnight/60 flex flex-wrap items-center gap-3">
                      <span>Applied: {new Date(app.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      {app.employment_type && <span>• {app.employment_type}</span>}
                      {app.work_mode && <span className="capitalize">• {app.work_mode}</span>}
                      {app.location_text && <span>• {app.location_text}</span>}
                    </div>

                    {app.resume_url && (
                      <div className="pt-1">
                        <a
                          href={app.resume_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-moonstone font-semibold hover:underline"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>View Submitted Resume / CV</span>
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                    <Link
                      to={`/jobs/${app.job_id}`}
                      className="px-3.5 py-2 rounded-xl border border-timberwolf text-xs font-semibold text-midnight hover:bg-aliceblue transition min-h-[44px] flex items-center justify-center"
                    >
                      View Role
                    </Link>

                    {['APPLIED', 'REVIEWING'].includes(app.status) && (
                      <button
                        type="button"
                        onClick={() => handleWithdrawApplication(app.id)}
                        disabled={withdrawingId === app.id}
                        className="px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-semibold hover:bg-rose-100 transition disabled:opacity-50 min-h-[44px] flex items-center justify-center cursor-pointer"
                      >
                        {withdrawingId === app.id ? 'Withdrawing...' : 'Withdraw'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

    </div>
  );
};
