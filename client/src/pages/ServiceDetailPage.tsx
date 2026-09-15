import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import { Service, Review, ProviderAvailability, ConsultationRequest } from '../types';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import {
  Star,
  CheckCircle,
  Clock,
  Calendar,
  MessageSquare,
  ShieldCheck,
  Zap,
  Globe,
  MapPin,
  Award,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  UserCheck,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Lock,
  Radio,
  FileText,
  X,
  CreditCard,
  ChevronRight
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Button } from '../components/common/Button';
import { usePageSEO } from '../hooks/usePageSEO';

export const ServiceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket();

  const [service, setService] = useState<Service | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [availability, setAvailability] = useState<ProviderAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  usePageSEO({
    title: service ? `${service.title} — HireByMinute` : 'Expert Consultation — HireByMinute',
    description: service?.description 
      ? service.description.replace(/[#*`_~]/g, '').slice(0, 160)
      : 'Connect with a verified domain specialist for a real-time 1-on-1 consultation billed by the minute.',
    canonicalPath: `/services/${id}`,
    ogType: 'product'
  });

  // 6-Step Hire Flow state (1: Requirement, 2: Duration, 3: Review, 4: Acceptance, 5: Payment, 6: Session)
  const [hireStep, setHireStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [mobileHireSheetOpen, setMobileHireSheetOpen] = useState(false);

  // Request form state
  const [selectedDuration, setSelectedDuration] = useState<number>(30);
  const [customDuration, setCustomDuration] = useState<number>(20);
  const [isCustomDuration, setIsCustomDuration] = useState(false);
  const [connectType, setConnectType] = useState<'now' | 'scheduled'>('now');
  const [scheduledSlot, setScheduledSlot] = useState<string>('in30');
  const [problemDescription, setProblemDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Active consultation request state
  const [activeRequest, setActiveRequest] = useState<ConsultationRequest | null>(null);
  const [paying, setPaying] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(600);

  const durationMinutes = isCustomDuration ? customDuration : selectedDuration;
  const totalPrice = service ? (durationMinutes * service.price_per_minute).toFixed(2) : '0.00';

  useEffect(() => {
    async function loadServiceDetail() {
      if (!id) return;
      try {
        setLoading(true);
        const data = await api.getServiceById(id);
        setService(data.service);
        setReviews(data.reviews || []);
        setAvailability(data.availability || []);
      } catch (err: any) {
        setError(err.message || 'Service not found');
      } finally {
        setLoading(false);
      }
    }
    loadServiceDetail();
  }, [id]);

  // Real-time Socket.IO and Server-Authoritative Polling for Request updates
  useEffect(() => {
    if (!activeRequest) return;

    // Countdown interval
    const timer = setInterval(() => {
      setCountdownSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setActiveRequest(curr => curr ? { ...curr, status: 'EXPIRED' } : null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Socket.IO event listeners for instant state changes
    if (socket) {
      const handleAccepted = (data: any) => {
        if (data.requestId === activeRequest.id) {
          setActiveRequest(curr => curr ? { ...curr, status: 'ACCEPTED' } : null);
        }
      };

      const handleDeclined = (data: any) => {
        if (data.requestId === activeRequest.id) {
          setActiveRequest(curr => curr ? { ...curr, status: 'DECLINED' } : null);
        }
      };

      const handleExpired = (data: any) => {
        if (data.requestId === activeRequest.id) {
          setActiveRequest(curr => curr ? { ...curr, status: 'EXPIRED' } : null);
        }
      };

      socket.on('consultation_request_accepted', handleAccepted);
      socket.on('consultation_request_declined', handleDeclined);
      socket.on('consultation_request_expired', handleExpired);

      return () => {
        clearInterval(timer);
        socket.off('consultation_request_accepted', handleAccepted);
        socket.off('consultation_request_declined', handleDeclined);
        socket.off('consultation_request_expired', handleExpired);
      };
    }

    // Polling fallback to recover state from server if socket drops
    const pollInterval = setInterval(async () => {
      try {
        const res = await api.getConsultationRequest(activeRequest.id);
        if (res.request) {
          setActiveRequest(res.request);
          if (res.request.remaining_seconds !== undefined) {
            setCountdownSeconds(res.request.remaining_seconds);
          }
        }
      } catch (err) {
        // Silently retry
      }
    }, 3000);

    return () => {
      clearInterval(timer);
      clearInterval(pollInterval);
    };
  }, [activeRequest?.id, socket]);

  // Sync activeRequest status with hireStep
  useEffect(() => {
    if (!activeRequest) {
      if (hireStep > 3) setHireStep(1);
      return;
    }
    if (activeRequest.status === 'PENDING_EXPERT') {
      setHireStep(4);
    } else if (activeRequest.status === 'ACCEPTED') {
      setHireStep(5);
    } else if (activeRequest.status === 'COMPLETED') {
      setHireStep(6);
    }
  }, [activeRequest?.status]);

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!service) return;

    if (!user) {
      navigate('/auth');
      return;
    }

    if (!problemDescription.trim()) {
      setFormError('Please enter a brief description of what you want to solve.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      let scheduledStart = new Date();
      if (connectType === 'scheduled') {
        if (scheduledSlot === 'in30') scheduledStart = new Date(Date.now() + 30 * 60 * 1000);
        else if (scheduledSlot === 'in60') scheduledStart = new Date(Date.now() + 60 * 60 * 1000);
        else if (scheduledSlot === 'tomorrow') scheduledStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
      }

      const res = await api.createConsultationRequest({
        service_id: service.id,
        duration_minutes: durationMinutes,
        connect_type: connectType,
        scheduled_start: scheduledStart.toISOString(),
        problem_description: problemDescription.trim()
      });

      setActiveRequest(res.request);
      setCountdownSeconds(res.request.remaining_seconds || 600);
    } catch (err: any) {
      setFormError(err.message || 'Failed to submit consultation request');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePayment = async () => {
    if (!activeRequest || activeRequest.status !== 'ACCEPTED') return;
    setPaying(true);
    try {
      // 1. Create server-authoritative Razorpay order
      const orderRes = await api.createRazorpayOrder(activeRequest.id);

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
        amount: orderRes.amount_paise,
        currency: orderRes.currency || 'USD',
        name: 'HireByMinute',
        description: `Consultation: ${service?.title || 'Expert Session'} (${activeRequest.duration_minutes}m)`,
        order_id: orderRes.order_id,
        prefill: {
          name: user?.full_name || '',
          email: user?.email || ''
        },
        theme: {
          color: '#004554'
        },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            // 3. Cryptographic signature verification on backend
            const verifyRes = await api.verifyRazorpayPayment(activeRequest.id, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });

            confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
            if (verifyRes.session_id) {
              navigate(`/session/${verifyRes.session_id}`);
            } else {
              navigate('/client');
            }
          } catch (verifyErr: any) {
            alert(verifyErr.message || 'Payment verification failed. Please contact support.');
          } finally {
            setPaying(false);
          }
        },
        modal: {
          ondismiss: () => {
            setPaying(false);
          }
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', (failResp: any) => {
        alert(failResp.error?.description || 'Payment was cancelled or failed.');
        setPaying(false);
      });
      rzp.open();
    } catch (err: any) {
      alert(err.message || 'Failed to initialize payment gateway.');
      setPaying(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const stepNames = [
    'Requirement',
    'Duration',
    'Review',
    'Acceptance',
    'Payment',
    'Session'
  ];

  const renderHireFlowContent = () => {
    if (!service) return null;
    return (
      <div className="space-y-5">
        {/* Step Progress Header */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-midnight uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-moonstone text-white flex items-center justify-center text-[10px] font-mono font-bold">
                {hireStep}
              </span>
              <span>Step {hireStep} of 6: {stepNames[hireStep - 1]}</span>
            </span>
            <span className="font-mono text-moonstone font-bold text-xs bg-aliceblue px-2 py-0.5 rounded-full border border-timberwolf/50">
              ${service.price_per_minute.toFixed(2)}/min
            </span>
          </div>

          {/* 6-Step Visual Progress Bars */}
          <div className="grid grid-cols-6 gap-1 h-1.5 w-full">
            {[1, 2, 3, 4, 5, 6].map((stepNum) => (
              <div
                key={stepNum}
                className={`h-full rounded-full transition-all duration-300 ${
                  stepNum <= hireStep ? 'bg-moonstone' : 'bg-timberwolf/40'
                }`}
              />
            ))}
          </div>
        </div>

        {/* ---------------- STEP 1: REQUIREMENT INTAKE ---------------- */}
        {hireStep === 1 && !activeRequest && (
          <div className="space-y-4 animate-fade-in">
            <div>
              <h3 className="text-base font-bold text-midnight">
                What would you like to solve?
              </h3>
              <p className="text-xs text-midnight/70 mt-0.5">
                Briefly outline your questions or context so {service.provider_name} can prepare.
              </p>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {/* Quick Topic Chips */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-midnight/60">Quick topic ideas (tap to add):</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Bug Fix & Debugging',
                  'Architecture Review',
                  'Code Walkthrough',
                  'Live Mentorship',
                  'Performance Audit'
                ].map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => {
                      setProblemDescription((prev) => {
                        if (!prev.trim()) return `• ${topic}: `;
                        return `${prev}\n• ${topic}`;
                      });
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-aliceblue text-midnight/80 border border-timberwolf/60 hover:border-moonstone active:scale-95 transition-all cursor-pointer"
                  >
                    + {topic}
                  </button>
                ))}
              </div>
            </div>

            {/* Problem Description Textarea */}
            <div className="space-y-1">
              <textarea
                rows={4}
                required
                value={problemDescription}
                onChange={(e) => {
                  setProblemDescription(e.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder="Describe your questions or requirements for the expert..."
                className="w-full p-3 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-xs text-midnight placeholder:text-midnight/40 focus:outline-none focus:border-moonstone focus:ring-1 focus:ring-moonstone leading-relaxed min-h-[96px]"
              />
              <div className="flex justify-between items-center text-[10px] text-midnight/50">
                <span>Clear details help the expert prepare better</span>
                <span>{problemDescription.length} chars</span>
              </div>
            </div>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              fullWidthOnMobile
              disabled={!problemDescription.trim()}
              onClick={() => {
                if (!problemDescription.trim()) {
                  setFormError('Please enter a brief description of what you want to solve.');
                  return;
                }
                setFormError(null);
                setHireStep(2);
              }}
              className="min-h-[48px] shadow-subtle flex items-center justify-center gap-2"
            >
              <span>Next: Select Duration</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* ---------------- STEP 2: DURATION SELECTION ---------------- */}
        {hireStep === 2 && !activeRequest && (
          <div className="space-y-4 animate-fade-in">
            <div>
              <h3 className="text-base font-bold text-midnight">
                Select Duration
              </h3>
              <p className="text-xs text-midnight/70 mt-0.5">
                Consultations are billed strictly per minute.
              </p>
            </div>

            {/* Duration Pills */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[15, 30, 45, 60].map((mins) => {
                const isSelected = !isCustomDuration && selectedDuration === mins;
                const cost = (mins * service.price_per_minute).toFixed(2);
                return (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => {
                      setSelectedDuration(mins);
                      setIsCustomDuration(false);
                    }}
                    className={`p-3 min-h-[52px] rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center active:scale-95 ${
                      isSelected
                        ? 'bg-midnight text-aliceblue border-midnight shadow-subtle'
                        : 'border-timberwolf/70 hover:border-moonstone bg-white text-midnight'
                    }`}
                  >
                    <span className="text-sm font-extrabold">{mins}m</span>
                    <span className={`text-[11px] font-mono ${isSelected ? 'text-aliceblue/80' : 'text-midnight/60'}`}>
                      ${cost}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Custom Duration Option */}
            <div className="p-3 bg-aliceblue/40 rounded-xl border border-timberwolf/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-midnight">Need a custom duration?</span>
                <button
                  type="button"
                  onClick={() => setIsCustomDuration(!isCustomDuration)}
                  className="text-xs font-bold text-moonstone hover:underline cursor-pointer"
                >
                  {isCustomDuration ? '← Quick presets' : 'Set custom minutes'}
                </button>
              </div>

              {isCustomDuration && (
                <div className="flex items-center gap-3 pt-1">
                  <input
                    type="number"
                    min="5"
                    max="180"
                    value={customDuration}
                    onChange={(e) => setCustomDuration(Math.max(5, parseInt(e.target.value) || 5))}
                    className="w-20 px-3 py-2 bg-white border border-timberwolf/80 rounded-xl text-center font-mono font-bold text-sm text-midnight focus:outline-none focus:border-moonstone"
                  />
                  <span className="text-xs text-midnight/70 font-medium">minutes (5 – 180 mins)</span>
                </div>
              )}
            </div>

            {/* Cost Preview */}
            <div className="p-3.5 bg-aliceblue rounded-xl border border-timberwolf/60 flex items-center justify-between text-xs">
              <span className="text-midnight/70">Estimated Cost:</span>
              <span className="font-mono font-extrabold text-base text-midnight">
                ${totalPrice} <span className="text-xs font-normal text-midnight/60">({durationMinutes}m × ${service.price_per_minute.toFixed(2)})</span>
              </span>
            </div>

            {/* Step 2 Actions */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="outline"
                size="lg"
                onClick={() => setHireStep(1)}
                className="min-h-[48px] px-4"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                <span>Back</span>
              </Button>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={() => setHireStep(3)}
                className="flex-1 min-h-[48px] shadow-subtle flex items-center justify-center gap-2"
              >
                <span>Next: Review & Connect</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ---------------- STEP 3: REVIEW & SCHEDULE ---------------- */}
        {hireStep === 3 && !activeRequest && (
          <form onSubmit={handleRequestSubmit} className="space-y-4 animate-fade-in">
            <div>
              <h3 className="text-base font-bold text-midnight">
                Review & Request
              </h3>
              <p className="text-xs text-midnight/70 mt-0.5">
                Choose when to connect and review your consultation summary.
              </p>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {/* Connect Type Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-midnight block">When to Connect</label>
              <div className="space-y-2">
                <label
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    connectType === 'now'
                      ? 'bg-lightblue/20 border-midnight text-midnight font-semibold shadow-subtle'
                      : 'border-timberwolf/60 hover:border-timberwolf text-midnight/80 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="connectType"
                    checked={connectType === 'now'}
                    onChange={() => setConnectType('now')}
                    className="w-4 h-4 accent-midnight mt-0.5"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-midnight">Connect Now (On Demand)</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    </div>
                    <p className="text-[11px] text-midnight/60 font-normal mt-0.5">
                      Expert receives instant notification. 10-minute response window.
                    </p>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    connectType === 'scheduled'
                      ? 'bg-lightblue/20 border-midnight text-midnight font-semibold shadow-subtle'
                      : 'border-timberwolf/60 hover:border-timberwolf text-midnight/80 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="connectType"
                    checked={connectType === 'scheduled'}
                    onChange={() => setConnectType('scheduled')}
                    className="w-4 h-4 accent-midnight mt-0.5"
                  />
                  <div className="flex-1">
                    <span className="text-xs font-bold text-midnight block">Schedule for Later</span>
                    <p className="text-[11px] text-midnight/60 font-normal mt-0.5">
                      Reserve a time slot with the expert.
                    </p>
                    {connectType === 'scheduled' && (
                      <div className="mt-2.5">
                        <select
                          value={scheduledSlot}
                          onChange={(e) => setScheduledSlot(e.target.value)}
                          className="w-full p-2 bg-white border border-timberwolf/80 rounded-lg text-xs text-midnight font-medium focus:outline-none focus:border-moonstone"
                        >
                          <option value="in30">In 30 minutes</option>
                          <option value="in60">In 1 hour</option>
                          <option value="tomorrow">Tomorrow same time</option>
                        </select>
                      </div>
                    )}
                  </div>
                </label>
              </div>
            </div>

            {/* Itemized Cost Summary */}
            <div className="bg-aliceblue p-3.5 rounded-xl border border-timberwolf/60 space-y-2 text-xs">
              <div className="flex justify-between text-midnight/70">
                <span>{durationMinutes} minutes × ${service.price_per_minute.toFixed(2)}</span>
                <span className="font-mono font-semibold text-midnight">${totalPrice}</span>
              </div>
              <div className="flex justify-between text-midnight/70">
                <span>Platform payment protection</span>
                <span className="text-emerald-700 font-semibold font-mono">Included</span>
              </div>
              <div className="border-t border-timberwolf/40 pt-2 flex justify-between items-baseline font-bold text-midnight">
                <span className="text-xs uppercase tracking-wider">Estimated Total</span>
                <span className="text-lg font-mono">${totalPrice}</span>
              </div>
            </div>

            {/* Step 3 Actions */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="outline"
                size="lg"
                type="button"
                onClick={() => setHireStep(2)}
                className="min-h-[48px] px-4"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                <span>Back</span>
              </Button>
              <button
                type="submit"
                disabled={submitting}
                className="btn-shine flex-1 min-h-[48px] py-3 px-4 rounded-xl bg-midnight text-aliceblue font-bold text-xs sm:text-sm hover:bg-midnight-hover transition-all shadow-subtle flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Sending Request...
                  </span>
                ) : (
                  <>
                    <span>SEND REQUEST (HIRE NOW)</span>
                    <ArrowRight className="w-4 h-4 text-moonstone" />
                  </>
                )}
              </button>
            </div>

            <p className="text-[11px] text-midnight/60 text-center flex items-center justify-center gap-1.5 leading-tight pt-1">
              <ShieldCheck className="w-3.5 h-3.5 text-moonstone shrink-0" />
              <span>Request first. Pay only after the expert confirms availability.</span>
            </p>
          </form>
        )}

        {/* ---------------- STEP 4: EXPERT ACCEPTANCE (WAITING) ---------------- */}
        {activeRequest && activeRequest.status === 'PENDING_EXPERT' && (
          <div className="space-y-5 text-center animate-fade-in py-2">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 mx-auto flex items-center justify-center border border-amber-200 shadow-subtle">
              <Clock className="w-6 h-6 animate-pulse" />
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100/80 px-2.5 py-0.5 rounded-full">
                Step 4: Expert Acceptance
              </span>
              <h3 className="text-lg font-bold text-midnight">
                Waiting for {service.provider_name} to respond
              </h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                Your request will remain open for 10 minutes. Payment will only be requested if the expert accepts.
              </p>
            </div>

            {/* Server-Authoritative Response Countdown */}
            <div className={`p-4 rounded-xl border text-center transition-colors ${
              countdownSeconds > 300
                ? 'bg-aliceblue border-timberwolf/60 text-midnight'
                : countdownSeconds > 120
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}>
              <span className="text-[10px] uppercase font-bold text-midnight/60 block mb-0.5">
                Expert Response Window
              </span>
              <div className="text-2xl font-mono font-extrabold tracking-wider">
                {formatTimer(countdownSeconds)}
              </div>
              <span className="text-[10px] text-midnight/50 mt-1 block">
                Auto-expires if expert does not respond in time
              </span>
            </div>

            <div className="p-3 bg-aliceblue/40 rounded-xl border border-timberwolf/40 text-xs text-left space-y-1 text-midnight/80">
              <div className="flex justify-between">
                <span className="text-midnight/60">Duration:</span>
                <span className="font-semibold">{activeRequest.duration_minutes} minutes</span>
              </div>
              <div className="flex justify-between">
                <span className="text-midnight/60">Estimated Total:</span>
                <span className="font-semibold font-mono">${Number(activeRequest.total_price).toFixed(2)}</span>
              </div>
            </div>

            <div className="pt-1">
              <Link
                to="/client"
                className="w-full py-3 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover transition-colors block text-center min-h-[48px] flex items-center justify-center"
              >
                View in Client Dashboard
              </Link>
            </div>
          </div>
        )}

        {/* ---------------- STEP 5: SECURE PAYMENT ---------------- */}
        {activeRequest && activeRequest.status === 'ACCEPTED' && (
          <div className="space-y-5 animate-fade-in py-2">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center border border-emerald-200 shadow-subtle">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                Step 5: Secure Payment
              </span>
              <h3 className="text-lg font-bold text-midnight">
                {service.provider_name} accepted your request!
              </h3>
              <p className="text-xs text-midnight/70">
                Confirm your consultation by completing payment. Funds are held safely until session completion.
              </p>
            </div>

            {/* Itemized Payment Breakdown */}
            <div className="bg-aliceblue p-4 rounded-xl border border-timberwolf/60 space-y-2 text-xs">
              <div className="flex justify-between text-midnight/80">
                <span>{activeRequest.duration_minutes} minutes × ${service.price_per_minute.toFixed(2)}</span>
                <span className="font-mono font-semibold">${Number(activeRequest.total_price).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-midnight/80">
                <span>Platform payment protection</span>
                <span className="text-emerald-700 font-semibold">Included</span>
              </div>
              <div className="border-t border-timberwolf/40 pt-2 flex justify-between items-baseline font-bold text-midnight">
                <span className="text-sm">Total</span>
                <span className="text-xl font-mono">${Number(activeRequest.total_price).toFixed(2)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handlePayment}
              disabled={paying}
              className="btn-shine w-full min-h-[50px] py-3.5 rounded-xl bg-midnight text-aliceblue font-bold text-sm hover:bg-midnight-hover transition-all shadow-subtle flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {paying ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Processing Payment...
                </span>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 text-moonstone" />
                  <span>PAY & START SESSION</span>
                  <ArrowRight className="w-4 h-4 text-moonstone" />
                </>
              )}
            </button>
          </div>
        )}

        {/* ---------------- STEP 6: SESSION REDIRECTING ---------------- */}
        {activeRequest && activeRequest.status === 'COMPLETED' && (
          <div className="space-y-4 text-center animate-fade-in py-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center border border-emerald-200 shadow-subtle">
              <Sparkles className="w-6 h-6 animate-spin" />
            </div>
            <h3 className="text-base font-bold text-midnight">
              Payment Complete!
            </h3>
            <p className="text-xs text-midnight/70">
              Launching your secure consultation room...
            </p>
          </div>
        )}

        {/* ---------------- STATE: DECLINED OR EXPIRED ---------------- */}
        {activeRequest && (activeRequest.status === 'DECLINED' || activeRequest.status === 'EXPIRED') && (
          <div className="space-y-4 text-center animate-fade-in py-2">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 mx-auto flex items-center justify-center border border-rose-200 shadow-subtle">
              <XCircle className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-midnight">
                {activeRequest.status === 'DECLINED'
                  ? `${service.provider_name} isn't available right now`
                  : 'Consultation request timed out'}
              </h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                {activeRequest.status === 'DECLINED'
                  ? 'The expert was unable to accept this request at this time. No payment was taken.'
                  : 'The expert did not respond within the 10-minute window. No payment was taken.'}
              </p>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <Link
                to="/services"
                className="w-full py-3 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover transition-colors text-center min-h-[48px] flex items-center justify-center"
              >
                Find Another Expert
              </Link>
              <button
                type="button"
                onClick={() => {
                  setActiveRequest(null);
                  setHireStep(1);
                }}
                className="text-xs text-midnight/70 hover:text-midnight underline py-2 cursor-pointer font-semibold"
              >
                Try Requesting Again
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 text-center">
        <div className="w-10 h-10 border-2 border-moonstone border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-midnight/60">Loading expert profile...</p>
      </div>
    );
  }

  if (error || !service) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <h2 className="text-xl font-bold text-midnight mb-2">Expert profile not found</h2>
        <p className="text-sm text-midnight/70 mb-6">{error || 'This service may have been removed or paused.'}</p>
        <Link to="/services" className="px-4 py-2 rounded-lg bg-midnight text-aliceblue text-sm font-semibold">
          Return to Marketplace
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 pb-28 lg:pb-10">
      
      {/* Breadcrumb */}
      <div className="text-xs text-midnight/60 mb-6 flex items-center gap-2">
        <Link to="/services" className="hover:text-midnight">Services</Link>
        <span>/</span>
        <span className="text-midnight font-medium">{service.category_name}</span>
        <span>/</span>
        <span className="truncate max-w-xs">{service.provider_name}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-10">
        
        {/* Left Column: Expert Profile, About, Skills, Reviews */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Profile Card (Section 13: Mobile prominence) */}
          <div className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-6 sm:p-8 shadow-card">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 pb-6 border-b border-timberwolf/40">
              <div className="relative shrink-0">
                <img
                  src={service.provider_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${service.provider_name}`}
                  alt={service.provider_name}
                  className="w-20 h-20 rounded-2xl object-cover border-2 border-lightblue"
                />
                {service.availability_status === 'AVAILABLE NOW' || (!service.availability_status && service.available_now) ? (
                  <span className="absolute -bottom-1 -right-1 px-2.5 py-0.5 bg-emerald-500 text-white font-bold text-[10px] rounded-full border-2 border-white shadow-xs animate-pulse">
                    AVAILABLE NOW
                  </span>
                ) : service.availability_status === 'BUSY' ? (
                  <span className="absolute -bottom-1 -right-1 px-2.5 py-0.5 bg-amber-500 text-white font-bold text-[10px] rounded-full border-2 border-white shadow-xs">
                    IN CALL
                  </span>
                ) : (
                  <span className="absolute -bottom-1 -right-1 px-2.5 py-0.5 bg-slate-400 text-white font-medium text-[10px] rounded-full border-2 border-white shadow-xs">
                    OFFLINE
                  </span>
                )}
              </div>

              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-extrabold text-midnight">
                    {service.provider_name}
                  </h1>
                  {service.provider_verified && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-moonstone bg-moonstone/10 px-2.5 py-0.5 rounded-full border border-moonstone/20">
                      <CheckCircle className="w-3.5 h-3.5" /> Verified Expert
                    </span>
                  )}
                </div>
                <p className="text-sm text-midnight/80 font-medium">
                  {service.provider_headline || service.title}
                </p>

                {/* Rating & Stats */}
                <div className="flex items-center gap-3 text-xs text-midnight/70 pt-1 flex-wrap">
                  <span className="flex items-center gap-1 font-bold text-amber-600">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    {service.provider_rating ? service.provider_rating.toFixed(1) : '5.0'}
                    <span className="text-midnight/50 font-normal">({reviews.length} reviews)</span>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-moonstone" />
                    {service.sessions_completed || 0} sessions ({service.total_session_minutes || 0} mins)
                  </span>
                  {service.experience_years ? (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Award className="w-3.5 h-3.5 text-moonstone" />
                        {service.experience_years} yrs exp
                      </span>
                    </>
                  ) : null}
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-moonstone" />
                    {service.provider_response_time || 'Within 15 mins'} response
                  </span>
                </div>
              </div>
            </div>

            {/* Mobile Prominent Rate & CTA Top Card (Section 13: Above the fold) */}
            <div className="lg:hidden mt-5 p-4 rounded-xl bg-aliceblue/70 border border-timberwolf/60 flex items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-semibold text-midnight/60 block">Consultation Rate</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-extrabold text-midnight font-mono">
                    ${service.price_per_minute.toFixed(2)}
                  </span>
                  <span className="text-xs text-midnight/70 font-medium">/ min</span>
                </div>
              </div>
              <Button
                variant="primary"
                size="md"
                onClick={() => setMobileHireSheetOpen(true)}
                className="min-h-[48px] px-6 text-sm font-bold shadow-subtle active:scale-95"
              >
                <span>Hire Now</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>

            {/* Subcategory & Category Badge */}
            {service.subcategory && (
              <div className="pt-4">
                <span className="inline-flex items-center text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-lg bg-aliceblue text-moonstone border border-moonstone/30">
                  {service.subcategory}
                </span>
              </div>
            )}

            {/* Service Title & Detailed Description */}
            <div className="pt-4 space-y-3">
              <h2 className="text-xl font-bold text-midnight">
                {service.title}
              </h2>
              <p className="text-sm text-midnight/80 leading-relaxed whitespace-pre-line">
                {service.description}
              </p>
            </div>

            {/* Worldwide Discovery Data: Languages & Location */}
            <div className="pt-6 border-t border-timberwolf/40 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-aliceblue/30 border border-timberwolf/50 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-midnight">
                  <Globe className="w-4 h-4 text-moonstone" />
                  <span>Languages Spoken</span>
                </div>
                <p className="text-xs text-midnight/80 font-medium">
                  {service.languages && service.languages.length > 0
                    ? service.languages.join(' · ')
                    : 'Languages not specified'}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-aliceblue/30 border border-timberwolf/50 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-midnight">
                  <MapPin className="w-4 h-4 text-moonstone" />
                  <span>Location (Online Global)</span>
                </div>
                <p className="text-xs text-midnight/80 font-medium">
                  {[service.city || service.provider_city, service.state_region || service.provider_state_region, service.country || service.provider_country].filter(Boolean).join(', ') || 'Worldwide · Online'}
                </p>
              </div>
            </div>

            {/* Skills & Domain Expertise */}
            {service.skills && service.skills.length > 0 && (
              <div className="pt-6 border-t border-timberwolf/40 space-y-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-midnight">
                  Skills & Expertise
                </span>
                <div className="flex flex-wrap gap-2">
                  {service.skills.map((skill, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 rounded-lg bg-aliceblue text-midnight text-xs font-semibold border border-timberwolf/50"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Reviews Section */}
          <div className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-6 sm:p-8 shadow-card space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-midnight flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-moonstone" />
                Verified Consultation Reviews ({reviews.length})
              </h3>
            </div>

            {reviews.length === 0 ? (
              <div className="p-6 text-center bg-aliceblue/40 rounded-xl border border-timberwolf/40">
                <p className="text-xs text-midnight/60">No reviews yet. Be the first to consult with this expert!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {reviews.map((rev) => (
                  <div key={rev.id} className="p-4 rounded-xl bg-aliceblue/30 border border-timberwolf/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={rev.client_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${rev.client_name}`}
                          alt={rev.client_name}
                          className="w-8 h-8 rounded-full border border-lightblue"
                        />
                        <div>
                          <span className="font-bold text-xs text-midnight block">{rev.client_name}</span>
                          <span className="text-[10px] text-midnight/50">{new Date(rev.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center text-amber-500">
                        {Array.from({ length: rev.rating || 5 }).map((_, idx) => (
                          <Star key={idx} className="w-3.5 h-3.5 fill-amber-400" />
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-midnight/80 leading-relaxed">
                      "{rev.comment}"
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* ========================================================================= */}
        {/* DESKTOP RIGHT COLUMN: 6-STEP APPROVAL-FIRST WORKFLOW (Section 14) */}
        {/* ========================================================================= */}
        <div className="hidden lg:block lg:col-span-1">
          <div className="sticky top-24 bg-white rounded-2xl border-2 border-timberwolf/70 p-6 shadow-card space-y-5">
            {renderHireFlowContent()}
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* MOBILE BOTTOM SHEET MODAL (Section 14) */}
      {/* ========================================================================= */}
      {mobileHireSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs animate-fade-in lg:hidden">
          <div
            className="fixed inset-0"
            onClick={() => setMobileHireSheetOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-h-[90vh] bg-white rounded-t-3xl border-t border-timberwolf/60 flex flex-col shadow-2xl animate-slide-up z-10 overflow-hidden">
            {/* Drag handle */}
            <div className="w-12 h-1.5 bg-timberwolf/80 rounded-full mx-auto my-3 shrink-0" />
            
            {/* Sheet Header */}
            <div className="px-5 pb-3 border-b border-timberwolf/40 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-extrabold text-base text-midnight">
                  Hire {service.provider_name}
                </h3>
                <p className="text-xs text-midnight/60 font-mono">
                  ${service.price_per_minute.toFixed(2)}/min · Billed per minute
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileHireSheetOpen(false)}
                className="p-2 rounded-full hover:bg-aliceblue text-midnight/70 hover:text-midnight transition-colors cursor-pointer"
                aria-label="Close hire sheet"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sheet Body */}
            <div className="overflow-y-auto p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-4">
              {renderHireFlowContent()}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MOBILE STICKY BOTTOM CTA BAR (Section 13) */}
      {/* ========================================================================= */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-timberwolf/60 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden flex items-center justify-between shadow-elevated">
        {!activeRequest ? (
          <>
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-extrabold text-midnight font-mono">
                  ${service.price_per_minute.toFixed(2)}
                </span>
                <span className="text-xs text-midnight/60 font-medium">/ min</span>
              </div>
              <span className="text-[11px] text-midnight/50 block font-mono">
                Est. ${totalPrice} ({durationMinutes}m)
              </span>
            </div>
            <Button
              variant="primary"
              size="md"
              onClick={() => setMobileHireSheetOpen(true)}
              className="min-h-[48px] px-6 text-sm font-bold shadow-subtle active:scale-95"
            >
              <span>Hire Now</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </>
        ) : activeRequest.status === 'PENDING_EXPERT' ? (
          <>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600 animate-pulse" />
              <div>
                <span className="text-[10px] font-bold uppercase text-amber-800 block">Waiting Expert</span>
                <span className="text-xs font-mono font-bold text-amber-900">{formatTimer(countdownSeconds)}</span>
              </div>
            </div>
            <Button
              variant="outline"
              size="md"
              onClick={() => setMobileHireSheetOpen(true)}
              className="min-h-[48px] px-4 text-xs font-bold"
            >
              <span>View Request</span>
            </Button>
          </>
        ) : activeRequest.status === 'ACCEPTED' ? (
          <>
            <div>
              <span className="text-[10px] font-bold uppercase text-emerald-800 block">✓ Accepted</span>
              <span className="text-sm font-mono font-bold text-midnight">${Number(activeRequest.total_price).toFixed(2)}</span>
            </div>
            <button
              type="button"
              onClick={() => setMobileHireSheetOpen(true)}
              className="min-h-[48px] px-5 py-2.5 rounded-xl bg-moonstone text-white font-bold text-xs shadow-subtle active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              <CreditCard className="w-4 h-4" />
              <span>Pay & Connect</span>
            </button>
          </>
        ) : (
          <>
            <span className="text-xs text-rose-700 font-semibold">Request {activeRequest.status.toLowerCase()}</span>
            <Button
              variant="outline"
              size="md"
              onClick={() => {
                setActiveRequest(null);
                setHireStep(1);
                setMobileHireSheetOpen(true);
              }}
              className="min-h-[48px] px-4 text-xs font-bold"
            >
              <span>Try Again</span>
            </Button>
          </>
        )}
      </div>

    </div>
  );
};
export default ServiceDetailPage;
