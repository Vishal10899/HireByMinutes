import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { ConsultationRequest } from '../types';
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
  Zap
} from 'lucide-react';
import confetti from 'canvas-confetti';

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
  const { user } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();

  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [consultationRequests, setConsultationRequests] = useState<ConsultationRequest[]>([]);
  const [upcomingBookings, setUpcomingBookings] = useState<any[]>([]);
  const [pastSessions, setPastSessions] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const data = await api.getClientDashboard();
      setActiveSession(data.activeSession || null);
      setConsultationRequests(data.consultationRequests || []);
      setUpcomingBookings(data.upcomingBookings || []);
      setPastSessions(data.pastSessions || []);
      setPayments(data.payments || []);
    } catch (err) {
      console.error('Failed to load client dashboard', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [user?.id]);

  // Real-time socket updates for request status changes
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

    socket.on('consultation_request_accepted', handleAccepted);
    socket.on('consultation_request_declined', handleDeclined);
    socket.on('consultation_request_expired', handleExpired);

    return () => {
      socket.off('consultation_request_accepted', handleAccepted);
      socket.off('consultation_request_declined', handleDeclined);
      socket.off('consultation_request_expired', handleExpired);
    };
  }, [socket]);

  const handlePayRequest = async (requestId: string) => {
    try {
      setPayingId(requestId);
      const res = await api.payConsultationRequest(requestId);
      confetti({ particleCount: 90, spread: 70 });
      if (res.session_id) {
        navigate(`/session/${res.session_id}`);
      } else {
        await loadDashboard();
      }
    } catch (err: any) {
      alert(err.message || 'Payment failed. Please try again.');
    } finally {
      setPayingId(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-20 text-center">
        <div className="w-10 h-10 border-2 border-moonstone border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-midnight/60">Loading client dashboard...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      
      {/* Welcome Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-midnight tracking-tight">
            Client Dashboard
          </h1>
          <p className="text-sm text-midnight/70 mt-1">
            Track consultation requests, complete secure payments upon expert acceptance, and join live rooms.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <Link
            to="/profile/edit"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-timberwolf bg-white text-midnight font-semibold text-xs hover:bg-aliceblue shadow-subtle transition-colors"
          >
            <img
              src={user?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user?.full_name || 'Client')}`}
              alt={user?.full_name}
              className="w-4 h-4 rounded-full object-cover border border-lightblue"
            />
            <span>Edit Profile</span>
          </Link>

          <Link
            to="/services"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-midnight text-aliceblue font-semibold text-xs hover:bg-midnight-hover shadow-subtle transition-colors"
          >
            <Search className="w-4 h-4" />
            <span>Find an Expert</span>
          </Link>
        </div>
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
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-moonstone text-white font-bold text-xs hover:bg-moonstone-hover shadow-subtle transition-all cursor-pointer"
          >
            <span>Return to Session</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION: CONSULTATION REQUESTS (APPROVAL-FIRST FLOW) */}
      {/* ========================================================================= */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-midnight flex items-center gap-2">
            <Clock className="w-5 h-5 text-moonstone" />
            <span>Consultation Requests ({consultationRequests.length})</span>
          </h2>
          <span className="text-xs text-midnight/60">Payment is only required after expert acceptance</span>
        </div>

        {consultationRequests.length === 0 ? (
          <div className="bg-white rounded-2xl border border-timberwolf/70 p-8 text-center shadow-subtle space-y-3">
            <Clock className="w-8 h-8 text-timberwolf-dark mx-auto" />
            <h4 className="text-sm font-bold text-midnight">No consultation requests yet.</h4>
            <p className="text-xs text-midnight/60 max-w-sm mx-auto">
              Find an expert when you need one. Request a consultation first, and pay only after the expert confirms.
            </p>
            <Link
              to="/services"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover"
            >
              Find an Expert
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {consultationRequests.map((req) => (
              <div
                key={req.id}
                className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card space-y-4 hover:border-moonstone/60 transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={req.provider_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${req.provider_name}`}
                        alt={req.provider_name}
                        className="w-12 h-12 rounded-xl object-cover border border-lightblue shrink-0"
                      />
                      <div>
                        <h4 className="font-bold text-sm text-midnight">{req.provider_name}</h4>
                        <p className="text-xs text-midnight/70 line-clamp-1">{req.service_title}</p>
                        <span className="text-[11px] text-midnight/60 block mt-0.5">
                          {req.duration_minutes} mins • ${Number(req.total_price).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Request Status Badge */}
                    {req.status === 'PENDING_EXPERT' && (
                      <ClientRequestTimer
                        initialSeconds={req.remaining_seconds || 600}
                        onExpire={loadDashboard}
                      />
                    )}
                    {req.status === 'ACCEPTED' && (
                      <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span>Expert Available</span>
                      </span>
                    )}
                    {req.status === 'PAID' && (
                      <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                        Payment Confirmed
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

                  {/* Problem Description */}
                  {req.problem_description && (
                    <div className="p-3 bg-aliceblue/50 rounded-xl border border-timberwolf/40 text-xs text-midnight/80">
                      <span className="text-[10px] uppercase font-bold text-midnight/50 block mb-0.5">
                        Your Topic:
                      </span>
                      <p className="italic leading-relaxed">"{req.problem_description}"</p>
                    </div>
                  )}
                </div>

                {/* Status-specific Action Footer */}
                <div className="pt-2 border-t border-timberwolf/40">
                  {req.status === 'PENDING_EXPERT' && (
                    <div className="flex items-center justify-between text-xs text-midnight/60">
                      <span className="flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-moonstone" />
                        <span>Waiting for expert response</span>
                      </span>
                      <span className="text-[11px] font-medium text-midnight/40">No payment taken</span>
                    </div>
                  )}

                  {req.status === 'ACCEPTED' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-emerald-800 font-semibold">
                        <span>{req.provider_name} has accepted!</span>
                        <span className="font-mono text-sm">${Number(req.total_price).toFixed(2)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handlePayRequest(req.id)}
                        disabled={payingId === req.id}
                        className="btn-shine w-full py-2.5 rounded-xl bg-midnight text-aliceblue font-bold text-xs hover:bg-midnight-hover transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {payingId === req.id ? (
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <span>Pay & Confirm Session</span>
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
                        className="px-4 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover inline-flex items-center gap-1"
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

      {/* PREVIOUS SESSIONS & REVIEWS */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-midnight flex items-center gap-2">
          <Clock className="w-4 h-4 text-moonstone" />
          <span>Completed Sessions ({pastSessions.length})</span>
        </h2>

        {pastSessions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 text-center shadow-subtle text-xs text-midnight/60">
            No completed sessions on record yet.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-timberwolf/70 divide-y divide-timberwolf/30 shadow-subtle overflow-hidden">
            {pastSessions.map((ses) => (
              <div key={ses.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-aliceblue/20 transition-colors">
                <div className="flex items-center gap-3.5">
                  <img
                    src={ses.provider_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${ses.provider_name}`}
                    alt={ses.provider_name}
                    className="w-10 h-10 rounded-xl object-cover border border-lightblue"
                  />
                  <div>
                    <h4 className="font-bold text-sm text-midnight">{ses.provider_name}</h4>
                    <p className="text-xs text-midnight/70">{ses.service_title} • {ses.duration_minutes} mins</p>
                    {ses.review_rating && (
                      <div className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        <span>You rated {ses.review_rating}/5</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Link
                    to={`/session/${ses.id}`}
                    className="px-3 py-1.5 rounded-lg border border-timberwolf text-xs font-semibold text-midnight hover:bg-aliceblue"
                  >
                    View History
                  </Link>
                  <Link
                    to={`/services/${ses.service_id}`}
                    className="px-3.5 py-1.5 rounded-lg bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover"
                  >
                    Book Again
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* PAYMENT & TRANSACTIONS */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-midnight flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-moonstone" />
          <span>Payment History</span>
        </h2>

        {payments.length === 0 ? (
          <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 text-center text-xs text-midnight/60 shadow-subtle">
            No payments recorded yet.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-timberwolf/70 overflow-x-auto shadow-subtle">
            <table className="w-full text-left text-xs">
              <thead className="bg-aliceblue/60 text-midnight/60 uppercase font-semibold border-b border-timberwolf/40">
                <tr>
                  <th className="py-3 px-4">Transaction ID</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-timberwolf/30 text-midnight/80">
                {payments.map((pay) => (
                  <tr key={pay.id} className="hover:bg-aliceblue/30">
                    <td className="py-3 px-4 font-mono text-[11px] text-midnight">{pay.id}</td>
                    <td className="py-3 px-4 capitalize font-medium">{pay.type.replace('_', ' ')}</td>
                    <td className="py-3 px-4 font-mono font-bold text-midnight">${Number(pay.amount).toFixed(2)}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                        {pay.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-midnight/60">
                      {new Date(pay.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  );
};
export default ClientDashboardPage;
