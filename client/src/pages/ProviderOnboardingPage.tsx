import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import { Category } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  Sparkles,
  Clock,
  DollarSign,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  CreditCard,
  Layers,
  HelpCircle
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { usePageSEO } from '../hooks/usePageSEO';

export const ProviderOnboardingPage: React.FC = () => {
  usePageSEO({
    title: 'Provider Onboarding — HireByMinute',
    noindex: true,
    canonicalPath: '/provider/onboard'
  });

  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();

  const [categories, setCategories] = useState<Category[]>([]);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Form states
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [headline, setHeadline] = useState(user?.headline || '');
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [pricePerMinute, setPricePerMinute] = useState<number>(1.25);
  const [skillsText, setSkillsText] = useState('Python, FastAPI, System Design');
  const [experienceYears, setExperienceYears] = useState(5);
  const [availableNow, setAvailableNow] = useState(true);

  // Listing creation state
  const [createdServiceId, setCreatedServiceId] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(false);
  const [feeInfo, setFeeInfo] = useState<{ fee: number; isPromotionActive: boolean; baseFee: number }>({
    fee: 0,
    isPromotionActive: false,
    baseFee: 2.00
  });

  useEffect(() => {
    async function loadData() {
      try {
        const [resCats, resFee] = await Promise.all([
          api.getCategories(),
          api.getRegistrationFee().catch(() => ({ fee: 0, isPromotionActive: true, baseFee: 2.00 }))
        ]);
        setCategories(resCats.categories || []);
        if (resCats.categories && resCats.categories.length > 0) {
          setCategoryId(resCats.categories[0].id);
        }
        if (resFee) {
          setFeeInfo({
            fee: resFee.fee !== undefined ? resFee.fee : 0,
            isPromotionActive: !!resFee.isPromotionActive,
            baseFee: resFee.baseFee || 2.00
          });
        }
      } catch (e) {
        console.error(e);
      }
    }
    loadData();
  }, []);

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const skillsArray = skillsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await api.createService({
        title,
        category_id: categoryId,
        description,
        price_per_minute: pricePerMinute,
        skills: skillsArray,
        languages: ['English'],
        experience_years: experienceYears,
        available_now: availableNow
      });

      setCreatedServiceId(res.service.id);
      
      // If service is already active (e.g. via $0 promo waiver), mark published immediately!
      if (res.service.listing_status === 'active' || res.is_free) {
        setIsPublished(true);
        await refreshUser();
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      } else {
        setStep(3); // Advance to listing fee payment step
      }
    } catch (err: any) {
      alert(err.message || 'Failed to create service listing');
    } finally {
      setLoading(false);
    }
  };

  const handlePayListingFee = async () => {
    if (!createdServiceId) return;
    setLoading(true);
    try {
      // 1. Initiate order creation on server
      const orderRes = await api.createListingOrder(createdServiceId);

      // If promotional $0 waiver applied by server
      if (orderRes.free_activated || orderRes.amount === 0) {
        setIsPublished(true);
        await refreshUser();
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        setLoading(false);
        return;
      }

      // Ensure Razorpay SDK is loaded
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
        description: `Service Listing Activation Fee ($${Number(orderRes.amount).toFixed(2)})`,
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
            await api.verifyListingPayment(createdServiceId, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });

            setIsPublished(true);
            await refreshUser();
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
          } catch (verifyErr: any) {
            alert(verifyErr.message || 'Payment verification failed. Please contact support.');
          } finally {
            setLoading(false);
          }
        },
        modal: {
          ondismiss: () => {
            setLoading(false);
          }
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', (failResp: any) => {
        alert(failResp.error?.description || 'Payment was cancelled or failed.');
        setLoading(false);
      });
      rzp.open();
    } catch (err: any) {
      alert(err.message || 'Listing activation failed');
      setLoading(false);
    }
  };

  const isFree = feeInfo.fee === 0;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      
      {/* Stepper Header */}
      <div className="text-center max-w-lg mx-auto mb-10 space-y-2">
        <span className="text-xs font-bold uppercase tracking-wider text-moonstone">
          Provider Onboarding
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-midnight">
          Monetize your expertise by the minute
        </h1>
        <p className="text-xs sm:text-sm text-midnight/70">
          Create a clear listing for what you can help people with and set your exact rate.
        </p>

        {isFree && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold mt-2">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>Launch Promotion: $0 Free Registration & Listing Active</span>
          </div>
        )}

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-3 pt-4">
          <div className={`flex items-center gap-1.5 text-xs font-bold ${step === 1 ? 'text-midnight' : 'text-midnight/40'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 1 ? 'bg-midnight text-aliceblue' : 'bg-timberwolf text-midnight'}`}>1</span>
            <span>Profile & Scope</span>
          </div>
          <div className="w-8 h-[1px] bg-timberwolf" />
          <div className={`flex items-center gap-1.5 text-xs font-bold ${step === 2 ? 'text-midnight' : 'text-midnight/40'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 2 ? 'bg-midnight text-aliceblue' : 'bg-timberwolf text-midnight'}`}>2</span>
            <span>Rates & Skills</span>
          </div>
          {!isFree && (
            <>
              <div className="w-8 h-[1px] bg-timberwolf" />
              <div className={`flex items-center gap-1.5 text-xs font-bold ${step === 3 ? 'text-midnight' : 'text-midnight/40'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 3 ? 'bg-midnight text-aliceblue' : 'bg-timberwolf text-midnight'}`}>3</span>
                <span>Activation</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Form Box */}
      <div className="bg-white border border-timberwolf/60 rounded-3xl p-6 sm:p-8 shadow-card">
        
        {isPublished ? (
          
          /* PUBLISHED SUCCESS STATE */
          <div className="text-center py-8 space-y-5 animate-fade-in">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-200">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xl font-extrabold text-midnight">You're officially live on HireByMinute!</h2>
              <p className="text-xs text-midnight/70 max-w-md mx-auto">
                Your service listing is published and visible to clients worldwide. Clients can request consultations directly based on your per-minute rate.
              </p>
            </div>

            <div className="bg-aliceblue p-4 rounded-2xl border border-timberwolf/40 max-w-sm mx-auto text-left text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-midnight/60">Service</span>
                <span className="font-bold text-midnight truncate max-w-[180px]">{title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-midnight/60">Rate</span>
                <span className="font-mono font-bold text-midnight">${pricePerMinute.toFixed(2)}/min</span>
              </div>
              <div className="flex justify-between">
                <span className="text-midnight/60">Listing Fee</span>
                <span className="font-bold text-emerald-600">{isFree ? '$0.00 (Promotion Waiver)' : `$${feeInfo.fee.toFixed(2)} (Paid)`}</span>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-center gap-3">
              <Link
                to="/provider"
                className="px-6 py-3 rounded-xl bg-midnight text-aliceblue font-bold text-xs hover:bg-midnight-hover transition-all shadow-subtle flex items-center gap-2 cursor-pointer"
              >
                <span>Go to Provider Dashboard</span>
                <ArrowRight className="w-4 h-4 text-moonstone" />
              </Link>
            </div>
          </div>

        ) : step === 1 ? (
          
          /* STEP 1: SCOPE & TITLE */
          <div className="space-y-6">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-midnight">Service Scope & Expertise</h3>
              <p className="text-xs text-midnight/70">
                Define the specific domain or problem area where clients can hire you for quick 1-on-1 consultations.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-midnight block">Listing Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Python & FastAPI Code Review and Live Debugging"
                  className="w-full p-3 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-xs text-midnight focus:outline-none focus:border-moonstone"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-midnight block">Primary Category</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full p-3 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-xs text-midnight focus:outline-none focus:border-moonstone"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-midnight block">Detailed Description</label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe exactly how you conduct the minute-by-minute session, what prep clients should bring (e.g. repos, Figma files), and typical outcomes..."
                  className="w-full p-3 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-xs text-midnight focus:outline-none focus:border-moonstone"
                />
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (!title || !description) {
                    alert('Please fill out the title and description.');
                    return;
                  }
                  setStep(2);
                }}
                className="px-6 py-3 rounded-xl bg-midnight text-aliceblue font-bold text-xs hover:bg-midnight-hover transition-all flex items-center gap-2 cursor-pointer shadow-subtle"
              >
                <span>Continue to Rates</span>
                <ArrowRight className="w-4 h-4 text-moonstone" />
              </button>
            </div>
          </div>
        ) : step === 2 ? (
          
          /* STEP 2: PRICE PER MINUTE, SKILLS & AVAILABILITY */
          <form onSubmit={handleCreateDraft} className="space-y-6">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-midnight">Pricing & Skills</h3>
              <p className="text-xs text-midnight/70">
                Choose your per-minute rate. Clients are billed strictly for the minutes booked.
              </p>
            </div>

            <div className="space-y-5 text-xs">
              {/* Rate selector */}
              <div className="bg-aliceblue/50 p-4 rounded-xl border border-timberwolf/50 space-y-3">
                <div className="flex justify-between items-baseline">
                  <span className="font-bold text-midnight">Price per minute</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-extrabold text-midnight font-mono">
                      ${pricePerMinute.toFixed(2)}
                    </span>
                    <span className="text-midnight/60 font-medium">/ min</span>
                  </div>
                </div>

                <input
                  type="range"
                  min="0.50"
                  max="5.00"
                  step="0.05"
                  value={pricePerMinute}
                  onChange={(e) => setPricePerMinute(parseFloat(e.target.value))}
                  className="w-full accent-moonstone cursor-pointer"
                />

                <div className="text-[11px] text-midnight/60 flex justify-between">
                  <span>30 mins = ${(pricePerMinute * 30).toFixed(2)}</span>
                  <span>60 mins = ${(pricePerMinute * 60).toFixed(2)}</span>
                </div>
              </div>

              {/* Skills Tags */}
              <div className="space-y-1.5">
                <label className="font-semibold text-midnight block">Specific Skills (comma separated)</label>
                <input
                  type="text"
                  value={skillsText}
                  onChange={(e) => setSkillsText(e.target.value)}
                  placeholder="e.g. Python, FastAPI, Docker, PostgreSQL"
                  className="w-full p-3 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-xs text-midnight focus:outline-none focus:border-moonstone"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-semibold text-midnight block">Years of Experience</label>
                  <input
                    type="number"
                    min="1"
                    max="40"
                    value={experienceYears}
                    onChange={(e) => setExperienceYears(parseInt(e.target.value) || 1)}
                    className="w-full p-3 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-xs text-midnight focus:outline-none focus:border-moonstone"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-midnight block">Immediate Availability</label>
                  <label className="flex items-center gap-2 p-3 bg-aliceblue/30 border border-timberwolf/70 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={availableNow}
                      onChange={(e) => setAvailableNow(e.target.checked)}
                      className="w-4 h-4 accent-midnight"
                    />
                    <span className="text-xs font-medium text-midnight">Available today</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs font-semibold text-midnight/60 hover:text-midnight cursor-pointer"
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 rounded-xl bg-midnight text-aliceblue font-bold text-xs hover:bg-midnight-hover transition-all flex items-center gap-2 cursor-pointer shadow-subtle disabled:opacity-50"
              >
                {loading ? 'Publishing...' : isFree ? 'Publish Service ($0.00 Free Launch Offer)' : `Review & Continue to $${feeInfo.fee.toFixed(2)} Listing Fee`}
                <ArrowRight className="w-4 h-4 text-moonstone" />
              </button>
            </div>
          </form>
        ) : (
          
          /* STEP 3: LISTING FEE PAYMENT STEP */
          <div className="space-y-6 animate-fade-in">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-midnight">Activate Your Listing (${feeInfo.fee.toFixed(2)})</h3>
              <p className="text-xs text-midnight/70">
                A nominal listing fee helps maintain a high-signal marketplace free of spam.
              </p>
            </div>

            {/* Listing Summary Preview */}
            <div className="bg-aliceblue p-5 rounded-2xl border border-timberwolf/60 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-moonstone">Listing Summary</span>
                  <h4 className="font-bold text-sm text-midnight mt-0.5">{title}</h4>
                </div>
                <span className="font-mono font-bold text-sm text-midnight">${pricePerMinute.toFixed(2)}/min</span>
              </div>
              <p className="text-xs text-midnight/70 line-clamp-2 leading-relaxed">{description}</p>
            </div>

            {/* Fee Breakdown */}
            <div className="border border-timberwolf/60 rounded-xl p-4 text-xs space-y-2">
              <div className="flex justify-between text-midnight/70">
                <span>Service Listing Activation Fee</span>
                <span className="font-mono font-semibold text-midnight">${feeInfo.fee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-midnight/70">
                <span>Listing Duration</span>
                <span className="font-medium text-emerald-600">Active indefinitely</span>
              </div>
              <div className="border-t border-timberwolf/40 pt-2 flex justify-between items-baseline font-bold text-midnight text-sm">
                <span>Total Due Now</span>
                <span className="font-mono text-base">${feeInfo.fee.toFixed(2)}</span>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-amber-900">
              <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Listing fees are distinct from client session payouts. Once activated, 100% of your listed rate is credited per minute booked.
              </span>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="text-xs font-semibold text-midnight/60 hover:text-midnight cursor-pointer"
              >
                ← Edit details
              </button>
              <button
                type="button"
                onClick={handlePayListingFee}
                disabled={loading}
                className="px-6 py-3.5 rounded-xl bg-midnight text-aliceblue font-bold text-xs hover:bg-midnight-hover transition-all flex items-center gap-2 cursor-pointer shadow-subtle disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Activating Listing...
                  </span>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 text-moonstone" />
                    <span>Pay ${feeInfo.fee.toFixed(2)} & Publish Service</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

      </div>

    </div>
  );
};
