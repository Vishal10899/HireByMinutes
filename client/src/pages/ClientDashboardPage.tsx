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
  Filter,
  MessageSquare,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  X,
  Lock,
  Download,
  Send,
  MessageCircle
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { usePageSEO } from '../hooks/usePageSEO';
import { formatINR, CURRENCY } from '../utils/currency';

// Helper to normalize and sanitize problem description / topic strings from JSON serialization artifacts
export const normalizeTopic = (raw?: string | null): string => {
  if (!raw || typeof raw !== 'string') return '';
  let text = raw.trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === 'string') text = parsed.trim();
    } catch {
      text = text.replace(/^["']+|["']+$/g, '').trim();
    }
  }
  text = text.replace(/\\"/g, '"').replace(/\\'/g, "'").trim();
  while ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }
  return text;
};

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

  const [activeTab, setActiveTab] = useState<'overview' | 'consultations' | 'experts' | 'payments' | 'rewards' | 'job_applications' | 'projects'>('overview');
  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [consultations, setConsultations] = useState<any[]>([]);
  const [consultationRequests, setConsultationRequests] = useState<ConsultationRequest[]>([]);
  const [upcomingBookings, setUpcomingBookings] = useState<any[]>([]);
  const [pastSessions, setPastSessions] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [previouslyHiredExperts, setPreviouslyHiredExperts] = useState<any[]>([]);
  const [jobApplications, setJobApplications] = useState<JobApplication[]>([]);
  const [myProjects, setMyProjects] = useState<any[]>([]);
  const [myContracts, setMyContracts] = useState<any[]>([]);
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

  // Read Chats Drawer/Modal State
  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [selectedChatExpert, setSelectedChatExpert] = useState<any | null>(null);
  const [selectedChatSessionId, setSelectedChatSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Rehire Modal State
  const [rehireModalOpen, setRehireModalOpen] = useState(false);
  const [rehireExpert, setRehireExpert] = useState<any | null>(null);
  const [rehireDuration, setRehireDuration] = useState<number>(30);
  const [rehireConnectType, setRehireConnectType] = useState<'now' | 'scheduled'>('now');
  const [rehireScheduledStart, setRehireScheduledStart] = useState<string>('');
  const [rehireProblemDescription, setRehireProblemDescription] = useState<string>('');
  const [submittingRehire, setSubmittingRehire] = useState(false);
  const [rehireError, setRehireError] = useState<string | null>(null);
  const [rehireSuccess, setRehireSuccess] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Expanded sessions state for compact inbox rows
  const [expandedExpertIds, setExpandedExpertIds] = useState<Set<string>>(new Set());
  const toggleExpandExpert = (expertId: string) => {
    setExpandedExpertIds(prev => {
      const next = new Set(prev);
      if (next.has(expertId)) next.delete(expertId);
      else next.add(expertId);
      return next;
    });
  };

  const handleCancelRequest = async (requestId: string) => {
    if (!window.confirm('Are you sure you want to cancel this consultation request?')) return;
    try {
      setCancellingId(requestId);
      await api.cancelConsultationRequest(requestId);
      await loadDashboard();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel consultation request.');
    } finally {
      setCancellingId(null);
    }
  };

  const fetchSessionChat = async (sessionId: string) => {
    try {
      setLoadingChat(true);
      setChatError(null);
      const res = await api.getSession(sessionId);
      setChatMessages(res?.messages || []);
    } catch (err: any) {
      console.error('Failed to load session messages', err);
      setChatError(err.message || 'Unable to load message archive for this session.');
    } finally {
      setLoadingChat(false);
    }
  };

  const openChatModal = (expertGroup: any, initialSessionId?: string) => {
    const normalizedGroup = {
      ...expertGroup,
      expert_name: expertGroup.expert_name || expertGroup.provider_name || expertGroup.name || 'Marketplace Expert',
      expert_avatar: expertGroup.expert_avatar || expertGroup.provider_avatar || expertGroup.avatar,
      sessions: expertGroup.sessions || expertGroup.completed_sessions || []
    };
    setSelectedChatExpert(normalizedGroup);
    const targetSessionId = initialSessionId ||
      normalizedGroup.sessions?.[0]?.session_id ||
      normalizedGroup.sessions?.[0]?.id ||
      expertGroup.active_session_id;
    setSelectedChatSessionId(targetSessionId);
    setChatModalOpen(true);
    setChatError(null);

    if (targetSessionId) {
      fetchSessionChat(targetSessionId);
    }
  };

  const openRehireModal = (expert: any) => {
    setRehireExpert({
      ...expert,
      expert_name: expert.expert_name || expert.provider_name || expert.name || 'Marketplace Expert',
      expert_avatar: expert.expert_avatar || expert.provider_avatar || expert.avatar,
      service_id: expert.service_id,
      service_title: expert.service_title || 'Expert Consultation',
      price_per_minute: Number(expert.price_per_minute || 50)
    });
    setRehireDuration(30);
    setRehireConnectType('now');
    setRehireScheduledStart('');
    setRehireProblemDescription('');
    setRehireError(null);
    setRehireSuccess(null);
    setRehireModalOpen(true);
  };

  const handleRehireSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rehireExpert) return;

    if (!rehireProblemDescription.trim()) {
      setRehireError('Please provide a brief problem description or topic for the expert.');
      return;
    }

    if (rehireConnectType === 'scheduled' && !rehireScheduledStart) {
      setRehireError('Please select a scheduled start date and time.');
      return;
    }

    try {
      setSubmittingRehire(true);
      setRehireError(null);

      const serviceId = rehireExpert.service_id;
      if (!serviceId) {
        throw new Error('Service ID not found for this expert. Please visit their profile to book.');
      }

      await api.createConsultationRequest({
        service_id: serviceId,
        duration_minutes: rehireDuration,
        connect_type: rehireConnectType,
        scheduled_start: rehireConnectType === 'scheduled' ? new Date(rehireScheduledStart).toISOString() : undefined,
        problem_description: rehireProblemDescription.trim()
      });

      confetti({ particleCount: 70, spread: 60 });
      setRehireSuccess(`Consultation request sent to ${rehireExpert.expert_name || rehireExpert.provider_name || 'the expert'}!`);
      setTimeout(async () => {
        setRehireModalOpen(false);
        setRehireSuccess(null);
        await loadDashboard();
        setActiveTab('overview');
      }, 1000);
    } catch (err: any) {
      setRehireError(err.message || 'Failed to submit consultation request. Please try again.');
    } finally {
      setSubmittingRehire(false);
    }
  };

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const [data, jobAppsRes, rewardsRes, projectsRes, contractsRes] = await Promise.all([
        api.getClientDashboard(),
        api.getMyJobApplications().catch(() => ({ applications: [] })),
        api.getClientRewards().catch(() => ({ reward_points_balance: 0, ledger: [] })),
        api.getMyProjects().catch(() => ({ projects: [] })),
        api.getMyContracts().catch(() => ({ contracts: [] }))
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
      setMyProjects(projectsRes?.projects || []);
      setMyContracts(contractsRes?.contracts || []);
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
      return ['PENDING_EXPERT', 'ACCEPTED', 'PAID', 'ACTIVE', 'SCHEDULED'].includes(c.status) && c.status !== 'COMPLETED';
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
    ['PENDING_EXPERT', 'ACCEPTED', 'PAID', 'ACTIVE', 'SCHEDULED'].includes(c.status) && c.status !== 'COMPLETED'
  ).length;
  const completedConsultationsCount = consultations.filter((c: any) => c.status === 'COMPLETED').length;
  const cancelledConsultationsCount = consultations.filter((c: any) =>
    ['DECLINED', 'EXPIRED', 'CANCELLED', 'REFUNDED'].includes(c.status) || c.is_refunded
  ).length;

  // Group completed consultations by expert for compact inbox view
  const completedExpertsMap = new Map<string, {
    expert_id: string;
    expert_name: string;
    expert_avatar?: string;
    expert_headline?: string;
    category_name: string;
    service_id?: string;
    service_title?: string;
    price_per_minute: number;
    completed_count: number;
    total_minutes: number;
    total_net_spent: number;
    latest_consultation_date: string;
    sessions: any[];
  }>();

  consultations
    .filter((c: any) => c.status === 'COMPLETED')
    .forEach((c: any) => {
      const expertId = c.expert_id || c.provider_id;
      if (!expertId) return;

      if (!completedExpertsMap.has(expertId)) {
        const hiredMatch = previouslyHiredExperts.find((exp: any) => exp.provider_id === expertId);
        completedExpertsMap.set(expertId, {
          expert_id: expertId,
          expert_name: c.expert_name || hiredMatch?.provider_name || 'Marketplace Expert',
          expert_avatar: c.expert_avatar || hiredMatch?.provider_avatar,
          expert_headline: c.expert_headline || hiredMatch?.provider_headline || 'Marketplace Consultant',
          category_name: c.category_name || hiredMatch?.category_name || 'Consultation',
          service_id: c.service_id || hiredMatch?.service_id,
          service_title: c.service_title || hiredMatch?.service_title || 'Expert Consultation',
          price_per_minute: Number(hiredMatch?.price_per_minute || 50),
          completed_count: 0,
          total_minutes: 0,
          total_net_spent: 0,
          latest_consultation_date: c.consultation_date || c.request_date,
          sessions: []
        });
      }

      const group = completedExpertsMap.get(expertId)!;
      group.completed_count += 1;
      group.total_minutes += Number(c.duration_minutes || 0);
      group.total_net_spent += Number(c.net_amount || c.gross_amount || 0);
      if (new Date(c.consultation_date || 0).getTime() > new Date(group.latest_consultation_date || 0).getTime()) {
        group.latest_consultation_date = c.consultation_date;
      }
      group.sessions.push(c);
    });

  // Enrich or supplement from previouslyHiredExperts
  previouslyHiredExperts.forEach((exp: any) => {
    const expertId = exp.provider_id || exp.id;
    if (!expertId) return;
    if (!completedExpertsMap.has(expertId) && (exp.completed_sessions_count > 0 || (exp.completed_sessions && exp.completed_sessions.length > 0))) {
      completedExpertsMap.set(expertId, {
        expert_id: expertId,
        expert_name: exp.provider_name || exp.name || 'Marketplace Expert',
        expert_avatar: exp.provider_avatar || exp.avatar,
        expert_headline: exp.provider_headline || exp.headline || 'Marketplace Consultant',
        category_name: exp.category_name || 'Consultation',
        service_id: exp.service_id,
        service_title: exp.service_title || 'Expert Consultation',
        price_per_minute: Number(exp.price_per_minute || 50),
        completed_count: exp.completed_sessions_count || exp.completed_sessions?.length || 0,
        total_minutes: Number(exp.total_minutes || exp.verified_minutes || 0),
        total_net_spent: Number(exp.total_spent_inr || exp.net_spent || 0),
        latest_consultation_date: exp.last_consultation_date || new Date().toISOString(),
        sessions: exp.completed_sessions || []
      });
    } else if (completedExpertsMap.has(expertId)) {
      const group = completedExpertsMap.get(expertId)!;
      if (!group.service_id && exp.service_id) group.service_id = exp.service_id;
      if (!group.service_title && exp.service_title) group.service_title = exp.service_title;
      if (exp.price_per_minute) group.price_per_minute = Number(exp.price_per_minute);
    }
  });

  const completedExpertGroups = Array.from(completedExpertsMap.values()).sort(
    (a, b) => new Date(b.latest_consultation_date).getTime() - new Date(a.latest_consultation_date).getTime()
  );

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

      {/* Dual Entry Point: What would you like to do? */}
      <section className="bg-white rounded-2xl border border-timberwolf/70 p-5 sm:p-6 shadow-subtle space-y-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-midnight tracking-tight">
            What would you like to do?
          </h2>
          <p className="text-xs sm:text-sm text-midnight/70 mt-0.5">
            Choose the right hiring workflow for your goals — quick 1-on-1 consultations or milestone contracts.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card A: Hire an Expert */}
          <div className="p-5 rounded-2xl border-2 border-timberwolf/60 hover:border-moonstone/60 transition-all bg-gradient-to-br from-[#FAF8F5] to-white flex flex-col justify-between group">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-moonstone/10 border border-moonstone/30 text-moonstone flex items-center justify-center">
                <Video className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-moonstone block mb-1">
                  1-on-1 Consultations
                </span>
                <h3 className="text-base font-bold text-midnight group-hover:text-moonstone transition-colors">
                  Hire an Expert
                </h3>
                <p className="text-xs text-midnight/70 mt-1 leading-relaxed">
                  Connect immediately or schedule a live video/audio consultation billed by the minute. Ideal for architecture advisory, code debugging, and tactical guidance.
                </p>
              </div>
            </div>
            <div className="pt-4 mt-3 border-t border-timberwolf/30">
              <Link
                to="/services"
                className="btn-shine inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover shadow-subtle transition-all min-h-[44px] w-full sm:w-auto justify-center"
              >
                <Search className="w-4 h-4 text-moonstone" />
                <span>Explore Marketplace Experts</span>
                <ArrowRight className="w-3.5 h-3.5 ml-auto text-moonstone" />
              </Link>
            </div>
          </div>

          {/* Card B: Post a Project */}
          <div className="p-5 rounded-2xl border-2 border-timberwolf/60 hover:border-moonstone/60 transition-all bg-gradient-to-br from-[#FAF8F5] to-white flex flex-col justify-between group">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
                <Briefcase className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block mb-1">
                  Milestone Contracts
                </span>
                <h3 className="text-base font-bold text-midnight group-hover:text-emerald-700 transition-colors">
                  Post a Project
                </h3>
                <p className="text-xs text-midnight/70 mt-1 leading-relaxed">
                  Scope out long-term deliverables with milestone approvals. Receive proposals from vetted specialists, compare qualifications, and hire single winners.
                </p>
              </div>
            </div>
            <div className="pt-4 mt-3 border-t border-timberwolf/30 flex flex-wrap items-center gap-3">
              <Link
                to="/projects/new"
                className="btn-shine inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-moonstone text-white text-xs font-bold hover:bg-moonstone-hover shadow-subtle transition-all min-h-[44px] flex-1 justify-center"
              >
                <Sparkles className="w-4 h-4" />
                <span>Post a Project</span>
                <ArrowRight className="w-3.5 h-3.5 ml-auto" />
              </Link>
              <Link
                to="/projects"
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-timberwolf/70 text-xs font-semibold text-midnight hover:bg-aliceblue transition-colors min-h-[44px]"
              >
                <span>Browse Projects</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

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
          onClick={() => setActiveTab('projects')}
          className={`min-h-[44px] px-4 py-2.5 text-xs font-bold whitespace-nowrap transition-all border-b-2 cursor-pointer flex items-center gap-1.5 active:scale-95 ${
            activeTab === 'projects'
              ? 'border-moonstone text-moonstone'
              : 'border-transparent text-midnight/70 hover:text-midnight'
          }`}
        >
          <Briefcase className="w-3.5 h-3.5 text-moonstone" />
          <span>My Projects & Contracts ({myProjects.length + myContracts.length})</span>
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

          {/* Section: Consultation Requests (Active & Pending Only) */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-midnight flex items-center gap-2">
                  <Clock className="w-5 h-5 text-moonstone" />
                  <span>Consultation Requests ({consultationRequests.filter(req => ['PENDING_EXPERT', 'ACCEPTED', 'ACTIVE', 'PAID'].includes(req.status) && req.status !== 'COMPLETED').length})</span>
                </h2>
                <p className="text-xs text-midnight/60 mt-0.5">Payment is only charged after the expert accepts your topic and timing.</p>
              </div>
              {consultationRequests.filter(req => ['PENDING_EXPERT', 'ACCEPTED', 'ACTIVE', 'PAID'].includes(req.status) && req.status !== 'COMPLETED').length > 0 && (
                <button
                  type="button"
                  onClick={() => { setActiveTab('consultations'); setConsultationFilter('active'); }}
                  className="text-xs font-semibold text-moonstone hover:underline"
                >
                  View all requests
                </button>
              )}
            </div>

            {consultationRequests.filter(req => ['PENDING_EXPERT', 'ACCEPTED', 'ACTIVE', 'PAID'].includes(req.status) && req.status !== 'COMPLETED').length === 0 ? (
              <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 text-center shadow-subtle space-y-2">
                <Clock className="w-7 h-7 text-timberwolf-dark mx-auto" />
                <h4 className="text-sm font-bold text-midnight">No pending or active consultation requests</h4>
                <p className="text-xs text-midnight/60 max-w-sm mx-auto leading-relaxed">
                  Browse our marketplace to find an expert. Request a consultation first, and pay only after the expert confirms availability.
                </p>
                <Link
                  to="/services"
                  className="btn-shine inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover shadow-subtle transition-all min-h-[44px]"
                >
                  <Search className="w-4 h-4 text-moonstone" />
                  <span>Find an Expert</span>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {consultationRequests
                  .filter(req => ['PENDING_EXPERT', 'ACCEPTED', 'ACTIVE', 'PAID'].includes(req.status) && req.status !== 'COMPLETED')
                  .slice(0, 4)
                  .map((req) => (
                    <div
                      key={req.id}
                      className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-4 sm:p-5 shadow-card space-y-3 hover:border-moonstone/60 transition-all flex flex-col justify-between"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <img
                              src={req.provider_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(req.provider_name || 'expert')}`}
                              alt={req.provider_name || 'Expert'}
                              className="w-11 h-11 rounded-xl object-cover border border-lightblue shrink-0"
                            />
                            <div className="min-w-0">
                              <h4 className="font-bold text-sm text-midnight truncate">{req.provider_name}</h4>
                              <p className="text-xs text-midnight/70 truncate">{req.service_title}</p>
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
                            <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 shrink-0">
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span>Accepted</span>
                            </span>
                          )}
                          {req.status === 'PAID' && (
                            <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200 shrink-0">
                              Confirmed
                            </span>
                          )}
                        </div>

                        {req.problem_description && (
                          <div className="p-2.5 bg-aliceblue/50 rounded-xl border border-timberwolf/40 text-xs text-midnight/80">
                            <span className="text-[10px] uppercase font-bold text-midnight/50 block mb-0.5">
                              Your Topic:
                            </span>
                            <p className="italic leading-relaxed line-clamp-2">{normalizeTopic(req.problem_description)}</p>
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-timberwolf/40">
                        {req.status === 'PENDING_EXPERT' && (
                          <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                            <span className="flex items-center gap-1 text-midnight/60">
                              <ShieldCheck className="w-3.5 h-3.5 text-moonstone shrink-0" />
                              <span>Awaiting expert reply</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCancelRequest(req.id)}
                              disabled={cancellingId === req.id}
                              className="px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 text-[11px] font-semibold transition cursor-pointer min-h-[36px]"
                            >
                              {cancellingId === req.id ? 'Cancelling...' : 'Cancel Request'}
                            </button>
                          </div>
                        )}

                        {req.status === 'ACCEPTED' && !req.session_id && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs text-emerald-800 font-semibold">
                              <span>{req.provider_name} accepted your request!</span>
                              <span className="font-mono text-sm">{formatINR(req.total_price)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handlePayRequest(req.id)}
                                disabled={payingId === req.id || cancellingId === req.id}
                                className="btn-shine flex-1 py-2.5 rounded-xl bg-midnight text-aliceblue font-bold text-xs hover:bg-midnight-hover transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 min-h-[44px]"
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
                              <button
                                type="button"
                                onClick={() => handleCancelRequest(req.id)}
                                disabled={cancellingId === req.id || payingId === req.id}
                                className="px-3 py-2.5 rounded-xl border border-timberwolf text-midnight/70 hover:text-rose-700 hover:border-rose-300 hover:bg-rose-50 text-xs font-semibold transition cursor-pointer min-h-[44px]"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {(req.status === 'PAID' || req.status === 'ACTIVE') && req.session_id && (
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
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </section>

          {/* Section: Completed Consultation History (Compact Inbox Grouped by Expert) */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-midnight flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>Completed Consultation History ({completedConsultationsCount})</span>
                </h2>
                <p className="text-xs text-midnight/60 mt-0.5">
                  Inbox view of concluded consultations grouped by expert with read-only transcripts and rehire.
                </p>
              </div>
              {completedConsultationsCount > 0 && (
                <button
                  type="button"
                  onClick={() => { setActiveTab('consultations'); setConsultationFilter('completed'); }}
                  className="text-xs font-semibold text-moonstone hover:underline"
                >
                  View full history ({completedConsultationsCount})
                </button>
              )}
            </div>

            {completedExpertGroups.length === 0 ? (
              <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 text-center shadow-subtle space-y-2">
                <Calendar className="w-8 h-8 text-timberwolf-dark mx-auto" />
                <h4 className="text-sm font-bold text-midnight">No completed consultations yet</h4>
                <p className="text-xs text-midnight/60 max-w-sm mx-auto leading-relaxed">
                  Concluded consultations and chat archives will be summarized here by expert.
                </p>
                <Link to="/services" className="text-xs text-moonstone font-bold hover:underline inline-flex items-center gap-1">
                  <span>Explore Marketplace Experts</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-timberwolf/70 divide-y divide-timberwolf/30 shadow-subtle overflow-hidden">
                <div className="hidden md:grid md:grid-cols-12 gap-4 px-5 py-3 bg-aliceblue/60 text-[11px] font-bold text-midnight/60 uppercase tracking-wider">
                  <div className="col-span-5">Expert & Professional Discipline</div>
                  <div className="col-span-3">Completed Sessions & Time</div>
                  <div className="col-span-2">Net Captured Spent</div>
                  <div className="col-span-2 text-right">Actions</div>
                </div>

                {completedExpertGroups.slice(0, 5).map((group) => {
                  const isExpanded = expandedExpertIds.has(group.expert_id);
                  return (
                    <div key={group.expert_id} className="transition-colors hover:bg-aliceblue/20">
                      <div className="p-4 sm:p-5 flex flex-col md:grid md:grid-cols-12 gap-4 items-start md:items-center">
                        <div className="md:col-span-5 flex items-center gap-3 w-full">
                          <img
                            src={group.expert_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(group.expert_name)}`}
                            alt={group.expert_name}
                            className="w-11 h-11 rounded-xl object-cover border border-lightblue shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="font-bold text-sm text-midnight truncate">{group.expert_name}</h4>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-aliceblue text-moonstone font-semibold border border-timberwolf/40 shrink-0">
                                {group.category_name}
                              </span>
                            </div>
                            <p className="text-xs text-midnight/70 truncate">{group.expert_headline}</p>
                          </div>
                        </div>

                        <div className="md:col-span-3 flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{group.completed_count} {group.completed_count === 1 ? 'Session' : 'Sessions'}</span>
                          </span>
                          <span className="text-xs font-mono font-medium text-midnight/70">
                            {group.total_minutes}m (verified)
                          </span>
                        </div>

                        <div className="md:col-span-2">
                          <span className="text-xs font-mono font-bold text-midnight block">
                            {formatINR(group.total_net_spent)}
                          </span>
                          <span className="text-[10px] text-midnight/50">Captured Net</span>
                        </div>

                        <div className="md:col-span-2 flex items-center justify-end gap-1.5 w-full md:w-auto">
                          <button
                            type="button"
                            onClick={() => openChatModal(group)}
                            title="Open archived consultation transcript"
                            className="btn-shine px-3 py-2 rounded-xl bg-aliceblue border border-timberwolf text-midnight text-xs font-bold hover:bg-lightblue/40 hover:border-moonstone min-h-[40px] inline-flex items-center gap-1 cursor-pointer transition-all"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-moonstone" />
                            <span>Read Chats</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => openRehireModal(group)}
                            title="Submit a new consultation request with this expert"
                            className="btn-shine px-3 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover min-h-[40px] inline-flex items-center gap-1 cursor-pointer shadow-subtle transition-all"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-moonstone" />
                            <span>Rehire</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleExpandExpert(group.expert_id)}
                            title={isExpanded ? "Collapse sessions" : "Expand sessions"}
                            className="p-2 rounded-xl border border-timberwolf/60 text-midnight/60 hover:text-midnight hover:bg-aliceblue min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer transition-all"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="bg-aliceblue/30 px-5 py-3 border-t border-timberwolf/30 space-y-2">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-midnight/50 pb-1">
                            Consultation Sessions Breakdown ({group.sessions.length})
                          </div>
                          <div className="divide-y divide-timberwolf/20">
                            {group.sessions.map((s: any, idx: number) => (
                              <div key={s.id || s.session_id || idx} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                                <div className="space-y-0.5 min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-midnight">
                                      {s.consultation_date ? new Date(s.consultation_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Completed'}
                                    </span>
                                    <span>•</span>
                                    <span className="font-mono text-midnight/70">{s.duration_minutes} mins</span>
                                    <span>•</span>
                                    <span className="font-mono font-bold text-midnight">{formatINR(s.net_amount || s.gross_amount)}</span>
                                    {s.review_rating && (
                                      <>
                                        <span>•</span>
                                        <span className="flex items-center gap-0.5 text-amber-600 font-bold">
                                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                          {s.review_rating}/5
                                        </span>
                                      </>
                                    )}
                                  </div>
                                  {s.problem_description && (
                                    <p className="text-midnight/70 italic text-[11px] line-clamp-1">
                                      Topic: {normalizeTopic(s.problem_description)}
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => openChatModal(group, s.session_id || s.id)}
                                    className="px-2.5 py-1.5 rounded-lg border border-timberwolf/60 text-[11px] font-semibold text-midnight hover:bg-aliceblue inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <MessageSquare className="w-3 h-3 text-moonstone" />
                                    <span>View Session Chat</span>
                                  </button>
                                  {s.session_id && (
                                    <Link
                                      to={`/session/${s.session_id}`}
                                      className="px-2.5 py-1.5 rounded-lg border border-timberwolf/60 text-[11px] font-semibold text-midnight hover:bg-aliceblue inline-flex items-center gap-1"
                                    >
                                      <FileText className="w-3.5 h-3.5 text-moonstone" />
                                      <span>View Notes</span>
                                    </Link>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
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
          ) : consultationFilter === 'completed' ? (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-timberwolf/70 divide-y divide-timberwolf/30 shadow-subtle overflow-hidden">
                <div className="hidden md:grid md:grid-cols-12 gap-4 px-5 py-3 bg-aliceblue/60 text-[11px] font-bold text-midnight/60 uppercase tracking-wider">
                  <div className="col-span-5">Expert & Professional Category</div>
                  <div className="col-span-3">Completed Sessions & Time</div>
                  <div className="col-span-2">Net Captured Spent</div>
                  <div className="col-span-2 text-right">Actions</div>
                </div>

                {completedExpertGroups.map((group) => {
                  const isExpanded = expandedExpertIds.has(group.expert_id);
                  return (
                    <div key={group.expert_id} className="transition-colors hover:bg-aliceblue/20">
                      <div className="p-4 sm:p-5 flex flex-col md:grid md:grid-cols-12 gap-4 items-start md:items-center">
                        <div className="md:col-span-5 flex items-center gap-3 w-full">
                          <img
                            src={group.expert_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(group.expert_name)}`}
                            alt={group.expert_name}
                            className="w-11 h-11 rounded-xl object-cover border border-lightblue shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="font-bold text-sm text-midnight truncate">{group.expert_name}</h4>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-aliceblue text-moonstone font-semibold border border-timberwolf/40 shrink-0">
                                {group.category_name}
                              </span>
                            </div>
                            <p className="text-xs text-midnight/70 truncate">{group.expert_headline}</p>
                          </div>
                        </div>

                        <div className="md:col-span-3 flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{group.completed_count} {group.completed_count === 1 ? 'Session' : 'Sessions'}</span>
                          </span>
                          <span className="text-xs font-mono font-medium text-midnight/70">
                            {group.total_minutes}m (verified)
                          </span>
                        </div>

                        <div className="md:col-span-2">
                          <span className="text-xs font-mono font-bold text-midnight block">
                            {formatINR(group.total_net_spent)}
                          </span>
                          <span className="text-[10px] text-midnight/50">Captured Net</span>
                        </div>

                        <div className="md:col-span-2 flex items-center justify-end gap-1.5 w-full md:w-auto">
                          <button
                            type="button"
                            onClick={() => openChatModal(group)}
                            title="Open archived consultation transcript"
                            className="btn-shine px-3 py-2 rounded-xl bg-aliceblue border border-timberwolf text-midnight text-xs font-bold hover:bg-lightblue/40 hover:border-moonstone min-h-[40px] inline-flex items-center gap-1 cursor-pointer transition-all"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-moonstone" />
                            <span>Read Chats</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => openRehireModal(group)}
                            title="Submit a new consultation request with this expert"
                            className="btn-shine px-3 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover min-h-[40px] inline-flex items-center gap-1 cursor-pointer shadow-subtle transition-all"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-moonstone" />
                            <span>Rehire</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleExpandExpert(group.expert_id)}
                            title={isExpanded ? "Collapse sessions" : "Expand sessions"}
                            className="p-2 rounded-xl border border-timberwolf/60 text-midnight/60 hover:text-midnight hover:bg-aliceblue min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer transition-all"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="bg-aliceblue/30 px-5 py-3 border-t border-timberwolf/30 space-y-2">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-midnight/50 pb-1">
                            Consultation Sessions Breakdown ({group.sessions.length})
                          </div>
                          <div className="divide-y divide-timberwolf/20">
                            {group.sessions.map((s: any, idx: number) => (
                              <div key={s.id || s.session_id || idx} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                                <div className="space-y-0.5 min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-midnight">
                                      {s.consultation_date ? new Date(s.consultation_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Completed'}
                                    </span>
                                    <span>•</span>
                                    <span className="font-mono text-midnight/70">{s.duration_minutes} mins</span>
                                    <span>•</span>
                                    <span className="font-mono font-bold text-midnight">{formatINR(s.net_amount || s.gross_amount)}</span>
                                    {s.review_rating && (
                                      <>
                                        <span>•</span>
                                        <span className="flex items-center gap-0.5 text-amber-600 font-bold">
                                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                          {s.review_rating}/5
                                        </span>
                                      </>
                                    )}
                                  </div>
                                  {s.problem_description && (
                                    <p className="text-midnight/70 italic text-[11px] line-clamp-1">
                                      Topic: {normalizeTopic(s.problem_description)}
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => openChatModal(group, s.session_id || s.id)}
                                    className="px-2.5 py-1.5 rounded-lg border border-timberwolf/60 text-[11px] font-semibold text-midnight hover:bg-aliceblue inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <MessageSquare className="w-3 h-3 text-moonstone" />
                                    <span>View Session Chat</span>
                                  </button>
                                  {s.session_id && (
                                    <Link
                                      to={`/session/${s.session_id}`}
                                      className="px-2.5 py-1.5 rounded-lg border border-timberwolf/60 text-[11px] font-semibold text-midnight hover:bg-aliceblue inline-flex items-center gap-1"
                                    >
                                      <FileText className="w-3.5 h-3.5 text-moonstone" />
                                      <span>View Notes</span>
                                    </Link>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-timberwolf/70 divide-y divide-timberwolf/30 shadow-subtle overflow-hidden">
                {paginatedConsultations.map((c: any) => (
                  <div key={c.consultation_key || c.id} className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-aliceblue/20 transition-colors">
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
                            Topic: {normalizeTopic(c.problem_description)}
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
                    <div className="flex items-center gap-2 self-start md:self-auto shrink-0 flex-wrap">
                      {c.status === 'PENDING_EXPERT' && (
                        <button
                          type="button"
                          onClick={() => handleCancelRequest(c.request_id || c.id)}
                          disabled={cancellingId === (c.request_id || c.id)}
                          className="px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 text-[11px] font-semibold transition cursor-pointer min-h-[36px]"
                        >
                          {cancellingId === (c.request_id || c.id) ? 'Cancelling...' : 'Cancel Request'}
                        </button>
                      )}

                      {c.status === 'ACCEPTED' && !c.session_id && c.status !== 'COMPLETED' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handlePayRequest(c.request_id || c.id)}
                            disabled={payingId === (c.request_id || c.id) || cancellingId === (c.request_id || c.id)}
                            className="btn-shine px-4 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover shadow-subtle min-h-[44px] cursor-pointer flex items-center gap-1.5"
                          >
                            <span>Pay & Confirm Consultation</span>
                            <ArrowRight className="w-3.5 h-3.5 text-moonstone" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCancelRequest(c.request_id || c.id)}
                            disabled={cancellingId === (c.request_id || c.id) || payingId === (c.request_id || c.id)}
                            className="px-3 py-2.5 rounded-xl border border-timberwolf text-midnight/70 hover:text-rose-700 hover:border-rose-300 hover:bg-rose-50 text-xs font-semibold transition cursor-pointer min-h-[44px]"
                          >
                            Cancel
                          </button>
                        </>
                      )}

                      {(c.status === 'ACTIVE' || (c.status === 'PAID' && c.session_id)) && c.status !== 'COMPLETED' && (
                        <Link
                          to={`/session/${c.session_id}`}
                          className="btn-shine px-4 py-2.5 rounded-xl bg-moonstone hover:bg-moonstone-hover text-white text-xs font-bold shadow-subtle min-h-[44px] inline-flex items-center gap-1.5"
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span>Enter Room</span>
                        </Link>
                      )}

                      {c.status === 'COMPLETED' && (
                        <>
                          <button
                            type="button"
                            onClick={() => openChatModal({
                              expert_id: c.expert_id || c.provider_id,
                              expert_name: c.expert_name,
                              expert_avatar: c.expert_avatar,
                              service_id: c.service_id,
                              service_title: c.service_title,
                              price_per_minute: 50,
                              sessions: [c]
                            }, c.session_id || c.id)}
                            className="px-3 py-2 rounded-xl bg-aliceblue border border-timberwolf text-midnight text-xs font-bold hover:bg-lightblue/40 hover:border-moonstone min-h-[40px] inline-flex items-center gap-1 cursor-pointer transition-all"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-moonstone" />
                            <span>Read Chats</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => openRehireModal({
                              expert_name: c.expert_name,
                              expert_avatar: c.expert_avatar,
                              service_id: c.service_id,
                              service_title: c.service_title,
                              price_per_minute: 50
                            })}
                            className="btn-shine px-3 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover min-h-[40px] inline-flex items-center gap-1 cursor-pointer shadow-subtle transition-all"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-moonstone" />
                            <span>Rehire</span>
                          </button>
                        </>
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
            <div className="bg-white rounded-2xl border border-timberwolf/70 divide-y divide-timberwolf/30 shadow-subtle overflow-hidden">
              <div className="hidden md:grid md:grid-cols-12 gap-4 px-5 py-3 bg-aliceblue/60 text-[11px] font-bold text-midnight/60 uppercase tracking-wider">
                <div className="col-span-5">Expert & Professional Category</div>
                <div className="col-span-3">Completed Sessions & Time</div>
                <div className="col-span-2">Net Captured Spent</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>

              {previouslyHiredExperts.map((exp) => {
                const isExpanded = expandedExpertIds.has(exp.provider_id);
                const sessionsList = exp.completed_sessions || [];
                return (
                  <div key={exp.provider_id} className="transition-colors hover:bg-aliceblue/20">
                    <div className="p-4 sm:p-5 flex flex-col md:grid md:grid-cols-12 gap-4 items-start md:items-center">
                      <div className="md:col-span-5 flex items-center gap-3 w-full">
                        <img
                          src={exp.provider_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(exp.provider_name)}`}
                          alt={exp.provider_name}
                          className="w-11 h-11 rounded-xl object-cover border border-lightblue shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="font-bold text-sm text-midnight truncate">{exp.provider_name}</h4>
                            <span className="flex items-center gap-0.5 text-xs text-amber-600 font-bold">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                              {(Number(exp.provider_rating) || 5.0).toFixed(1)}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-aliceblue text-moonstone font-semibold border border-timberwolf/40 shrink-0">
                              {exp.category_name}
                            </span>
                            {exp.current_status === 'ACTIVE_SESSION' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Live Now
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-midnight/70 truncate">{exp.provider_headline}</p>
                        </div>
                      </div>

                      <div className="md:col-span-3 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{exp.completed_sessions_count || exp.total_consultations} {(exp.completed_sessions_count || exp.total_consultations) === 1 ? 'Session' : 'Sessions'}</span>
                        </span>
                        <span className="text-xs font-mono font-medium text-midnight/70">
                          {exp.total_minutes}m (verified)
                        </span>
                      </div>

                      <div className="md:col-span-2">
                        <span className="text-xs font-mono font-bold text-midnight block">
                          {formatINR(exp.total_spent_inr)}
                        </span>
                        <span className="text-[10px] text-midnight/50">
                          {exp.total_consultations} bookings
                        </span>
                      </div>

                      <div className="md:col-span-2 flex items-center justify-end gap-1.5 w-full md:w-auto">
                        <button
                          type="button"
                          onClick={() => openChatModal(exp)}
                          title="Open archived consultation transcript"
                          className="btn-shine px-3 py-2 rounded-xl bg-aliceblue border border-timberwolf text-midnight text-xs font-bold hover:bg-lightblue/40 hover:border-moonstone min-h-[40px] inline-flex items-center gap-1 cursor-pointer transition-all"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-moonstone" />
                          <span>Read Chats</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openRehireModal(exp)}
                          title="Submit a new consultation request with this expert"
                          className="btn-shine px-3 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover min-h-[40px] inline-flex items-center gap-1 cursor-pointer shadow-subtle transition-all"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-moonstone" />
                          <span>Rehire</span>
                        </button>

                        <Link
                          to={exp.service_id ? `/services/${exp.service_id}` : '/services'}
                          title="View expert service profile"
                          className="hidden lg:inline-flex px-2.5 py-2 rounded-xl border border-timberwolf text-xs font-bold text-midnight hover:bg-aliceblue min-h-[40px] items-center justify-center"
                        >
                          View Profile
                        </Link>

                        <Link
                          to={exp.service_id ? `/services/${exp.service_id}` : '/services'}
                          title="Book Again"
                          className="hidden"
                        >
                          Book Again
                        </Link>

                        {sessionsList.length > 0 && (
                          <button
                            type="button"
                            onClick={() => toggleExpandExpert(exp.provider_id)}
                            title={isExpanded ? "Collapse sessions" : "Expand sessions"}
                            className="p-2 rounded-xl border border-timberwolf/60 text-midnight/60 hover:text-midnight hover:bg-aliceblue min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer transition-all"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </div>

                    {isExpanded && sessionsList.length > 0 && (
                      <div className="bg-aliceblue/30 px-5 py-3 border-t border-timberwolf/30 space-y-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-midnight/50 pb-1">
                          Consultation Sessions Breakdown ({sessionsList.length})
                        </div>
                        <div className="divide-y divide-timberwolf/20">
                          {sessionsList.map((s: any, idx: number) => (
                            <div key={s.id || s.session_id || idx} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                              <div className="space-y-0.5 min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-midnight">
                                    {s.consultation_date ? new Date(s.consultation_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Completed'}
                                  </span>
                                  <span>•</span>
                                  <span className="font-mono text-midnight/70">{s.duration_minutes} mins</span>
                                  <span>•</span>
                                  <span className="font-mono font-bold text-midnight">{formatINR(s.amount || s.net_amount || s.gross_amount)}</span>
                                  {s.review_rating && (
                                    <>
                                      <span>•</span>
                                      <span className="flex items-center gap-0.5 text-amber-600 font-bold">
                                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                        {s.review_rating}/5
                                      </span>
                                    </>
                                  )}
                                </div>
                                {s.problem_description && (
                                  <p className="text-midnight/70 italic text-[11px] line-clamp-1">
                                    Topic: {normalizeTopic(s.problem_description)}
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => openChatModal(exp, s.session_id || s.id)}
                                  className="px-2.5 py-1.5 rounded-lg border border-timberwolf/60 text-[11px] font-semibold text-midnight hover:bg-aliceblue inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <MessageSquare className="w-3 h-3 text-moonstone" />
                                  <span>View Session Chat</span>
                                </button>
                                {s.session_id && (
                                  <Link
                                    to={`/session/${s.session_id}`}
                                    className="px-2.5 py-1.5 rounded-lg border border-timberwolf/60 text-[11px] font-semibold text-midnight hover:bg-aliceblue inline-flex items-center gap-1"
                                  >
                                    <FileText className="w-3.5 h-3.5 text-moonstone" />
                                    <span>View Notes</span>
                                  </Link>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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

      {/* ========================================================================= */}
      {/* TAB 7: MY PROJECTS & CONTRACTS */}
      {/* ========================================================================= */}
      {activeTab === 'projects' && (
        <section className="space-y-8 animate-fade-in">
          {/* Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-timberwolf/40">
            <div>
              <h2 className="text-lg font-bold text-midnight flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-moonstone" />
                <span>My Projects & Contracts</span>
              </h2>
              <p className="text-xs text-midnight/60 mt-0.5">
                Track long-term milestone projects you posted, evaluate submitted proposals, and manage active contracts.
              </p>
            </div>
            <Link
              to="/projects/new"
              className="btn-shine inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-moonstone text-white font-bold text-xs hover:bg-moonstone-hover shadow-subtle transition-all min-h-[44px] self-start sm:self-auto"
            >
              <Sparkles className="w-4 h-4" />
              <span>Post a Project</span>
            </Link>
          </div>

          {/* Section A: Active & Completed Contracts */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-midnight uppercase tracking-wider text-[11px]">
                Active & Completed Contracts ({myContracts.length})
              </h3>
            </div>

            {myContracts.length === 0 ? (
              <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 text-center text-xs text-midnight/60 shadow-subtle space-y-2">
                <Briefcase className="w-7 h-7 text-timberwolf-dark mx-auto" />
                <p className="font-bold text-midnight">No active contracts yet</p>
                <p>When you hire an expert from your submitted proposals, your milestone contract workspace will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myContracts.map((c: any) => (
                  <div
                    key={c.id}
                    className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-subtle hover:border-moonstone/60 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-midnight text-sm hover:text-moonstone transition-colors">
                          {c.project_title || 'Milestone Contract'}
                        </span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                          c.status === 'COMPLETED'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : c.status === 'SUBMITTED_FOR_REVIEW'
                            ? 'bg-amber-50 text-amber-800 border-amber-200 animate-pulse'
                            : c.status === 'REVISION_REQUESTED'
                            ? 'bg-rose-50 text-rose-800 border-rose-200'
                            : 'bg-blue-50 text-blue-800 border-blue-200'
                        }`}>
                          {c.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-midnight/70 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          {c.provider_avatar ? (
                            <img
                              src={c.provider_avatar}
                              alt={c.provider_name}
                              className="w-5 h-5 rounded-full object-cover border border-lightblue"
                            />
                          ) : null}
                          <span className="font-medium text-midnight">Specialist: {c.provider_name}</span>
                        </div>
                        <span>•</span>
                        <span className="font-mono font-bold text-midnight">
                          {formatINR(c.total_amount)}
                        </span>
                        <span>•</span>
                        <span>Started: {new Date(c.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                    </div>

                    <Link
                      to={`/contracts/${c.id}`}
                      className="btn-shine inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover shadow-subtle transition-all min-h-[44px] shrink-0"
                    >
                      <span>Contract Workspace</span>
                      <ArrowRight className="w-3.5 h-3.5 text-moonstone" />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section B: Posted Projects */}
          <div className="space-y-4 pt-4 border-t border-timberwolf/40">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-midnight uppercase tracking-wider text-[11px]">
                Posted Projects ({myProjects.length})
              </h3>
            </div>

            {myProjects.length === 0 ? (
              <div className="bg-white rounded-2xl border border-timberwolf/70 p-8 text-center text-xs text-midnight/60 shadow-subtle space-y-3">
                <Briefcase className="w-8 h-8 text-timberwolf-dark mx-auto" />
                <p className="font-bold text-midnight text-sm">No projects posted yet</p>
                <p className="max-w-md mx-auto">
                  Create a project to receive proposals from top verified specialists. You only commit funds once you review milestones and finalize the contract.
                </p>
                <Link
                  to="/projects/new"
                  className="btn-shine inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover shadow-subtle transition-all min-h-[44px]"
                >
                  <Sparkles className="w-4 h-4 text-moonstone" />
                  <span>Post a Project</span>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {myProjects.map((p: any) => (
                  <div
                    key={p.id}
                    className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-subtle hover:border-moonstone/60 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          to={`/projects/${p.id}`}
                          className="font-bold text-midnight text-sm hover:text-moonstone transition-colors"
                        >
                          {p.title}
                        </Link>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                          p.status === 'OPEN'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : p.status === 'REVIEWING_PROPOSALS'
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : p.status === 'IN_PROGRESS'
                            ? 'bg-purple-50 text-purple-800 border-purple-200'
                            : p.status === 'COMPLETED'
                            ? 'bg-zinc-100 text-zinc-800 border-zinc-200'
                            : 'bg-rose-50 text-rose-800 border-rose-200'
                        }`}>
                          {p.status.replace(/_/g, ' ')}
                        </span>
                        {p.category_name && (
                          <span className="text-[10px] font-medium text-midnight/50 bg-aliceblue px-2 py-0.5 rounded">
                            {p.category_name}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-midnight/60 flex-wrap">
                        <span className="font-mono font-bold text-midnight">
                          {p.budget_type === 'fixed'
                            ? formatINR(p.budget_fixed || 0)
                            : `${formatINR(p.budget_min || 0)} - ${formatINR(p.budget_max || 0)}/hr`}
                        </span>
                        <span>•</span>
                        <span>{p.proposals_count || 0} proposals</span>
                        <span>•</span>
                        <span>Posted: {new Date(p.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <Link
                        to={`/projects/${p.id}/proposals`}
                        className="btn-shine inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-moonstone text-white text-xs font-bold hover:bg-moonstone-hover shadow-subtle transition-all min-h-[44px]"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>Review Proposals ({p.proposals_count || 0})</span>
                      </Link>
                      <Link
                        to={`/projects/${p.id}`}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-timberwolf text-xs font-semibold text-midnight hover:bg-aliceblue transition-colors min-h-[44px]"
                      >
                        <span>View Project</span>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* READ-ONLY CHAT ARCHIVE MODAL */}
      {/* ========================================================================= */}
      {chatModalOpen && selectedChatExpert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-midnight/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl border border-timberwolf/70 shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-timberwolf/40 flex items-center justify-between gap-3 bg-aliceblue/40 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={selectedChatExpert.expert_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(selectedChatExpert.expert_name)}`}
                  alt={selectedChatExpert.expert_name}
                  className="w-10 h-10 rounded-xl object-cover border border-lightblue shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-midnight truncate">{selectedChatExpert.expert_name}</h3>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 border border-zinc-300 shrink-0">
                      <Lock className="w-2.5 h-2.5" />
                      <span>Read-Only Archive</span>
                    </span>
                  </div>
                  <p className="text-xs text-midnight/60 truncate">{selectedChatExpert.expert_headline || selectedChatExpert.category_name}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setChatModalOpen(false)}
                className="p-2 rounded-xl text-midnight/60 hover:text-midnight hover:bg-white border border-transparent hover:border-timberwolf/60 min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Session Selector (If multiple sessions exist with this expert) */}
            {selectedChatExpert.sessions && selectedChatExpert.sessions.length > 1 && (
              <div className="px-5 py-2.5 bg-aliceblue/80 border-b border-timberwolf/30 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
                <span className="text-[11px] font-bold text-midnight/50 uppercase tracking-wider shrink-0">
                  Select Session:
                </span>
                {selectedChatExpert.sessions.map((s: any, idx: number) => {
                  const sId = s.session_id || s.id;
                  const isSelected = selectedChatSessionId === sId;
                  const dateStr = s.consultation_date ? new Date(s.consultation_date).toLocaleDateString([], { month: 'short', day: 'numeric' }) : `Session ${idx + 1}`;
                  return (
                    <button
                      key={sId || idx}
                      type="button"
                      onClick={() => {
                        setSelectedChatSessionId(sId);
                        fetchSessionChat(sId);
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer min-h-[32px] ${
                        isSelected
                          ? 'bg-midnight text-aliceblue shadow-subtle'
                          : 'bg-white text-midnight/70 hover:text-midnight border border-timberwolf/40'
                      }`}
                    >
                      {dateStr} ({s.duration_minutes}m)
                    </button>
                  );
                })}
              </div>
            )}

            {/* Chat Transcript Stream */}
            <div className="flex-1 min-h-[280px] max-h-[440px] p-5 overflow-y-auto space-y-3.5 text-xs overscroll-contain">
              {loadingChat ? (
                <div className="py-20 text-center space-y-2 text-midnight/60">
                  <div className="w-7 h-7 border-2 border-moonstone border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs font-medium">Loading consultation transcript...</p>
                </div>
              ) : chatError ? (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs text-center space-y-2">
                  <p>{chatError}</p>
                  {selectedChatSessionId && (
                    <button
                      type="button"
                      onClick={() => fetchSessionChat(selectedChatSessionId)}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-bold text-xs cursor-pointer"
                    >
                      Retry
                    </button>
                  )}
                </div>
              ) : chatMessages.length === 0 ? (
                <div className="py-16 text-center space-y-2 text-midnight/50">
                  <MessageSquare className="w-8 h-8 text-timberwolf-dark mx-auto" />
                  <p className="font-bold text-sm text-midnight">No messages in this consultation</p>
                  <p className="text-xs">No chat notes or files were exchanged during this session.</p>
                </div>
              ) : (
                chatMessages.map((msg) => {
                  const isMe = msg.sender_id === user?.id;
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1`}
                    >
                      <div className="flex items-center gap-1.5 text-[10px] text-midnight/50 px-1">
                        <span className="font-bold">{isMe ? 'You' : msg.sender_name || selectedChatExpert.expert_name}</span>
                        <span>•</span>
                        <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div
                        className={`p-3 rounded-2xl max-w-[80%] leading-relaxed ${
                          isMe
                            ? 'bg-midnight text-aliceblue rounded-tr-none'
                            : 'bg-aliceblue text-midnight border border-timberwolf/40 rounded-tl-none'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        {msg.file_url && (
                          <div className="mt-2 pt-2 border-t border-white/20">
                            <a
                              href={msg.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 underline font-bold text-xs"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>{msg.file_name || 'Attached Document'}</span>
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer Banner */}
            <div className="p-4 bg-aliceblue/50 border-t border-timberwolf/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shrink-0">
              <span className="flex items-center gap-1.5 text-midnight/60 text-center sm:text-left">
                <Lock className="w-3.5 h-3.5 text-moonstone shrink-0" />
                <span>Consultation concluded. This archive is preserved as an immutable, read-only record.</span>
              </span>
              <button
                type="button"
                onClick={() => setChatModalOpen(false)}
                className="btn-shine px-4 py-2 rounded-xl bg-midnight text-aliceblue font-bold text-xs hover:bg-midnight-hover min-h-[40px] cursor-pointer"
              >
                Close Transcript
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* REHIRE CONSULTATION MODAL */}
      {/* ========================================================================= */}
      {rehireModalOpen && rehireExpert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-midnight/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl border border-timberwolf/70 shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="p-5 border-b border-timberwolf/40 flex items-center justify-between gap-3 bg-aliceblue/30 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={rehireExpert.expert_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(rehireExpert.expert_name)}`}
                  alt={rehireExpert.expert_name}
                  className="w-11 h-11 rounded-xl object-cover border border-lightblue shrink-0"
                />
                <div className="min-w-0">
                  <h3 className="font-bold text-base text-midnight truncate">Rehire {rehireExpert.expert_name}</h3>
                  <p className="text-xs text-midnight/70 truncate">
                    {rehireExpert.service_title || 'Expert Consultation'} • {formatINR(rehireExpert.price_per_minute || 50)}/min
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setRehireModalOpen(false)}
                className="p-2 rounded-xl text-midnight/60 hover:text-midnight hover:bg-white border border-transparent hover:border-timberwolf/60 min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleRehireSubmit} className="p-5 overflow-y-auto space-y-4 text-xs">
              {rehireError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl">
                  {rehireError}
                </div>
              )}

              {rehireSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-bold">{rehireSuccess}</span>
                </div>
              )}

              {/* 1. Duration Selection */}
              <div className="space-y-1.5">
                <label className="font-bold text-midnight block">Select Consultation Duration</label>
                <div className="grid grid-cols-4 gap-2">
                  {[15, 30, 45, 60].map((mins) => {
                    const price = (rehireExpert.price_per_minute || 50) * mins;
                    const isSelected = rehireDuration === mins;
                    return (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setRehireDuration(mins)}
                        className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer min-h-[52px] ${
                          isSelected
                            ? 'bg-midnight text-aliceblue border-midnight shadow-subtle'
                            : 'bg-aliceblue/40 text-midnight border-timberwolf/60 hover:border-moonstone'
                        }`}
                      >
                        <span className="block font-bold text-xs">{mins} mins</span>
                        <span className="block text-[10px] opacity-80 font-mono mt-0.5">{formatINR(price)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Timing */}
              <div className="space-y-1.5">
                <label className="font-bold text-midnight block">When would you like to connect?</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRehireConnectType('now')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all min-h-[44px] ${
                      rehireConnectType === 'now'
                        ? 'bg-midnight text-aliceblue border-midnight'
                        : 'bg-aliceblue/40 text-midnight border-timberwolf/60 hover:border-moonstone'
                    }`}
                  >
                    <span className="block font-bold text-xs">Connect Now</span>
                    <span className="block text-[10px] opacity-80 mt-0.5">Immediate 10m expert confirmation</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRehireConnectType('scheduled')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all min-h-[44px] ${
                      rehireConnectType === 'scheduled'
                        ? 'bg-midnight text-aliceblue border-midnight'
                        : 'bg-aliceblue/40 text-midnight border-timberwolf/60 hover:border-moonstone'
                    }`}
                  >
                    <span className="block font-bold text-xs">Schedule Ahead</span>
                    <span className="block text-[10px] opacity-80 mt-0.5">Pick a specific date & time</span>
                  </button>
                </div>

                {rehireConnectType === 'scheduled' && (
                  <div className="pt-2">
                    <input
                      type="datetime-local"
                      value={rehireScheduledStart}
                      onChange={(e) => setRehireScheduledStart(e.target.value)}
                      min={new Date(Date.now() + 15 * 60 * 1000).toISOString().slice(0, 16)}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl border border-timberwolf bg-white text-midnight text-xs focus:ring-2 focus:ring-moonstone outline-none"
                    />
                  </div>
                )}
              </div>

              {/* 3. Problem Description / Topic */}
              <div className="space-y-1.5">
                <label className="font-bold text-midnight block">
                  Consultation Topic & Problem Description <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={rehireProblemDescription}
                  onChange={(e) => setRehireProblemDescription(e.target.value)}
                  placeholder="Describe your questions, project challenge, or what you'd like guidance on..."
                  rows={3}
                  required
                  className="w-full p-3 rounded-xl border border-timberwolf bg-white text-midnight text-xs focus:ring-2 focus:ring-moonstone outline-none resize-none leading-relaxed"
                />
                <span className="text-[10px] text-midnight/50">Clean plain text. No quotes or formatting artifacts.</span>
              </div>

              {/* Approval-First Notice */}
              <div className="p-3 bg-aliceblue/60 border border-timberwolf/40 rounded-xl space-y-1 text-midnight/80">
                <div className="font-bold text-xs flex items-center gap-1.5 text-moonstone">
                  <ShieldCheck className="w-4 h-4 text-moonstone" />
                  <span>Approval-First Guarantee</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  You will <strong>NOT</strong> be charged right now. {rehireExpert.expert_name} will review your topic first. Once accepted, you will have 10 minutes to verify payment and enter the workspace.
                </p>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-timberwolf/30">
                <button
                  type="button"
                  onClick={() => setRehireModalOpen(false)}
                  disabled={submittingRehire}
                  className="px-4 py-2.5 rounded-xl border border-timberwolf text-midnight text-xs font-bold hover:bg-aliceblue min-h-[44px] cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submittingRehire || !rehireProblemDescription.trim()}
                  className="btn-shine px-5 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover shadow-subtle min-h-[44px] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {submittingRehire ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Submit Consultation Request • {formatINR((rehireExpert.price_per_minute || 50) * rehireDuration)}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-moonstone" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
