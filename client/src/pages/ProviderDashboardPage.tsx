import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { ConsultationRequest } from '../types';
import {
  DollarSign,
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
  X
} from 'lucide-react';
import confetti from 'canvas-confetti';

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
  const { user } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();

  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [pendingRequests, setPendingRequests] = useState<ConsultationRequest[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
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

  const loadProviderDashboard = async () => {
    try {
      setLoading(true);
      const data = await api.getProviderDashboard();
      setActiveSession(data.activeSession || null);
      setPendingRequests(data.pendingRequests || []);
      setUpcomingSessions(data.upcomingSessions || []);
      setServices(data.services || []);
      setEarnings(data.earnings || { total: 0, completedSessions: 0 });
      setCompletedSessionsBreakdown(data.completedSessionsBreakdown || []);
      setReviews(data.reviews || []);
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

    const handleNewRequest = (data: any) => {
      loadProviderDashboard();
    };

    const handlePaymentCompleted = (data: any) => {
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
    socket.on('consultation_request_expired', handleRequestExpired);
    socket.on('session_completed', handleSessionCompleted);
    socket.on('session_extended', handleSessionExtended);
    socket.on('provider_availability_changed', handleAvailabilityChanged);

    return () => {
      socket.off('consultation_request_created', handleNewRequest);
      socket.off('consultation_payment_completed', handlePaymentCompleted);
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

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-20 text-center">
        <div className="w-10 h-10 border-2 border-moonstone border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-midnight/60">Loading provider workspace...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
            Review incoming consultation requests, respond within 10 minutes, and manage your live sessions.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <Link
            to="/profile/edit"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-timberwolf bg-white text-midnight font-semibold text-xs hover:bg-aliceblue shadow-subtle transition-colors"
          >
            <img
              src={user?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user?.full_name || 'Provider')}`}
              alt={user?.full_name}
              className="w-4 h-4 rounded-full object-cover border border-lightblue"
            />
            <span>Edit Profile & Rates</span>
          </Link>

          <Link
            to="/provider/new-service"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-midnight text-aliceblue font-semibold text-xs hover:bg-midnight-hover shadow-subtle transition-colors"
          >
            <PlusCircle className="w-4 h-4 text-moonstone" />
            <span>Add New Service ($2 Fee)</span>
          </Link>
        </div>
      </div>

      {/* METRICS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Net Payout */}
        <div className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-midnight/60 uppercase tracking-wider">Net Earnings (85%)</span>
            <div className="text-2xl font-extrabold text-midnight font-mono mt-0.5">
              ${earnings.total.toFixed(2)}
            </div>
            <span className="text-[10px] text-midnight/50 block mt-0.5">
              Gross: ${(earnings.gross || 0).toFixed(2)} • 15% platform fee
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        {/* Today's Earnings */}
        <div className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-midnight/60 uppercase tracking-wider">Today's Net</span>
            <div className="text-2xl font-extrabold text-midnight font-mono mt-0.5">
              ${(earnings.todayNet || 0).toFixed(2)}
            </div>
            <span className="text-[10px] text-midnight/50 block mt-0.5">
              Today Gross: ${(earnings.todayGross || 0).toFixed(2)}
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
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-moonstone text-white font-bold text-xs hover:bg-moonstone-hover shadow-subtle transition-all"
          >
            <span>Join Live Room</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION: PENDING CONSULTATION REQUESTS (10-Minute Response Timer) */}
      {/* ========================================================================= */}
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
                          <span className="font-mono font-bold text-emerald-700">${Number(req.total_price).toFixed(2)}</span>
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
                          <span>•</span>
                          <span>Client since {(req as any).client_member_since ? new Date((req as any).client_member_since).toLocaleDateString([], { month: 'short', year: 'numeric' }) : 'Recent'}</span>
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
                        className="flex-1 py-2.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAcceptRequest(req.id)}
                        disabled={actionLoading === req.id}
                        className="btn-shine flex-1 py-2.5 rounded-xl bg-midnight text-aliceblue hover:bg-midnight-hover text-xs font-bold transition-colors cursor-pointer shadow-subtle disabled:opacity-50 flex items-center justify-center gap-1.5"
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
                  className="px-4 py-2 rounded-lg bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover"
                >
                  Enter Room
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* TRANSPARENT 15% PLATFORM COMMISSION & COMPLETED SESSIONS */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-midnight flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-moonstone" />
            <span>Completed Consultations & Earnings Breakdown ({completedSessionsBreakdown.length})</span>
          </h2>
          <span className="text-xs text-midnight/60">Transparent 15% platform commission • 85% net payout</span>
        </div>

        {completedSessionsBreakdown.length === 0 ? (
          <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 text-center text-xs text-midnight/60 shadow-subtle">
            No completed paid consultations recorded yet.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-timberwolf/70 overflow-x-auto shadow-subtle">
            <table className="w-full text-left text-xs">
              <thead className="bg-aliceblue/60 text-midnight/60 uppercase font-semibold border-b border-timberwolf/40">
                <tr>
                  <th className="py-3 px-4">Client & Service</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Gross Client Paid</th>
                  <th className="py-3 px-4">Platform Fee (15%)</th>
                  <th className="py-3 px-4 text-emerald-800">Your Net Earnings (85%)</th>
                  <th className="py-3 px-4">Completed Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-timberwolf/30 text-midnight/80">
                {completedSessionsBreakdown.map((item) => (
                  <tr key={item.id} className="hover:bg-aliceblue/30">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <img
                          src={item.client_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.client_name}`}
                          alt={item.client_name}
                          className="w-7 h-7 rounded-lg object-cover border border-lightblue"
                        />
                        <div>
                          <span className="font-bold text-midnight block">{item.client_name}</span>
                          <span className="text-[11px] text-midnight/60">{item.service_title}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-medium">{item.duration_minutes} mins</td>
                    <td className="py-3 px-4 font-mono font-semibold">${Number(item.gross_amount).toFixed(2)}</td>
                    <td className="py-3 px-4 font-mono text-rose-700">-${Number(item.platform_fee).toFixed(2)}</td>
                    <td className="py-3 px-4 font-mono font-extrabold text-emerald-700 text-sm">
                      ${Number(item.net_earned).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-midnight/60">
                      {item.actual_end ? new Date(item.actual_end).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* MY SERVICES LISTINGS */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-midnight flex items-center gap-2">
            <Layers className="w-4 h-4 text-moonstone" />
            <span>My Service Listings ({services.length})</span>
          </h2>
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
                    ${srv.price_per_minute.toFixed(2)}
                    <span className="text-[10px] font-normal text-midnight/60 font-sans"> / min</span>
                  </div>

                  {srv.listing_status === 'pending_payment' ? (
                    <Link
                      to={`/services/${srv.id}`}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 text-white font-bold text-xs hover:bg-amber-600"
                    >
                      Pay $2 Activation
                    </Link>
                  ) : (
                    <button
                      onClick={() => handleToggleServiceStatus(srv.id, srv.listing_status)}
                      className="text-xs font-semibold text-moonstone hover:underline cursor-pointer"
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

    </div>
  );
};
export default ProviderDashboardPage;
