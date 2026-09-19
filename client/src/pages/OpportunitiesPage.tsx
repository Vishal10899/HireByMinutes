import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Opportunity, Category } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  Briefcase,
  Clock,
  IndianRupee,
  Send,
  PlusCircle,
  X,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  UserCheck
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { usePageSEO } from '../hooks/usePageSEO';
import { formatINR, CURRENCY } from '../utils/currency';

export const OpportunitiesPage: React.FC = () => {
  usePageSEO({
    title: 'Consultation Opportunities — HireByMinute',
    description: 'Browse active consultation requests and opportunities posted by clients seeking specialized expertise.',
    canonicalPath: '/opportunities'
  });

  const { user } = useAuth();

  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Apply Modal state
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [applyMessage, setApplyMessage] = useState('');
  const [applyExperience, setApplyExperience] = useState('');
  const [applyAvailability, setApplyAvailability] = useState('Available today / within 24 hours');
  const [applyRate, setApplyRate] = useState<string>('');
  const [applyLoading, setApplyLoading] = useState(false);

  // Post Opportunity Modal state
  const [showPostModal, setShowPostModal] = useState(false);
  const [postTitle, setPostTitle] = useState('');
  const [postCategoryId, setPostCategoryId] = useState('');
  const [postDescription, setPostDescription] = useState('');
  const [postDuration, setPostDuration] = useState<number>(45);
  const [postBudget, setPostBudget] = useState<number>(75);
  const [postLoading, setPostLoading] = useState(false);

  const loadOpps = async () => {
    try {
      setLoading(true);
      const [oppRes, catRes] = await Promise.all([
        api.getOpportunities(),
        api.getCategories()
      ]);
      setOpportunities(oppRes.opportunities || []);
      setCategories(catRes.categories || []);
      if (catRes.categories && catRes.categories.length > 0) {
        setPostCategoryId(catRes.categories[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOpps();
  }, []);

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOpp) return;

    if (!user) {
      alert('Please log in as an expert provider to apply for opportunities.');
      return;
    }

    setApplyLoading(true);
    try {
      const isFree = (selectedOpp.pricing_type === 'free' || Number(selectedOpp.entry_fee_usd || 0) <= 0);

      // Direct free submission without payment gateway
      if (isFree) {
        await api.applyOpportunity(selectedOpp.id, {
          message: applyMessage,
          relevant_experience: applyExperience,
          proposed_rate: applyRate ? parseFloat(applyRate) : undefined,
          availability: applyAvailability
        });

        alert('Application submitted successfully!');
        confetti({ particleCount: 80, spread: 70 });
        setSelectedOpp(null);
        setApplyMessage('');
        setApplyExperience('');
        await loadOpps();
        setApplyLoading(false);
        return;
      }

      // 1. Create server-authoritative application fee order
      const orderRes = await api.createOpportunityApplicationOrder(selectedOpp.id);

      if (orderRes.is_free) {
        await api.applyOpportunity(selectedOpp.id, {
          message: applyMessage,
          relevant_experience: applyExperience,
          proposed_rate: applyRate ? parseFloat(applyRate) : undefined,
          availability: applyAvailability
        });
        alert('Application submitted successfully!');
        confetti({ particleCount: 80, spread: 70 });
        setSelectedOpp(null);
        setApplyMessage('');
        setApplyExperience('');
        await loadOpps();
        setApplyLoading(false);
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
        throw new Error('Failed to load Razorpay payment gateway.');
      }

      const oppFee = Number(selectedOpp.entry_fee_inr || selectedOpp.entry_fee_usd || 2).toFixed(2);

      // 2. Launch Razorpay modal
      const options = {
        key: orderRes.key_id,
        amount: orderRes.amount_paise,
        currency: orderRes.currency || CURRENCY,
        name: 'HireByMinute',
        description: `Opportunity Application Fee (${formatINR(oppFee)}) - ${selectedOpp.title.slice(0, 30)}`,
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
            await api.verifyOpportunityApplicationPayment(selectedOpp.id, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              message: applyMessage,
              relevant_experience: applyExperience,
              proposed_rate: applyRate ? parseFloat(applyRate) : undefined,
              availability: applyAvailability
            });

            alert(`Application and ${formatINR(oppFee)} entry fee verified successfully!`);
            confetti({ particleCount: 80, spread: 70 });
            setSelectedOpp(null);
            setApplyMessage('');
            setApplyExperience('');
            await loadOpps();
          } catch (verifyErr: any) {
            alert(verifyErr.message || 'Payment verification failed.');
          } finally {
            setApplyLoading(false);
          }
        },
        modal: {
          ondismiss: () => {
            setApplyLoading(false);
          }
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', (failResp: any) => {
        alert(failResp.error?.description || 'Application fee payment was cancelled or failed.');
        setApplyLoading(false);
      });
      rzp.open();
    } catch (err: any) {
      alert(err.message || 'Failed to initialize application.');
      setApplyLoading(false);
    }
  };

  const handlePostOpportunity = async (e: React.FormEvent) => {
    e.preventDefault();
    setPostLoading(true);
    try {
      await api.postOpportunity({
        title: postTitle,
        category_id: postCategoryId,
        description: postDescription,
        duration_minutes: postDuration,
        budget: postBudget
      });
      setShowPostModal(false);
      setPostTitle('');
      setPostDescription('');
      confetti({ particleCount: 80, spread: 65 });
      await loadOpps();
    } catch (err: any) {
      alert(err.message || 'Failed to post opportunity');
    } finally {
      setPostLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-midnight tracking-tight">
            Work Opportunities
          </h1>
          <p className="text-sm text-midnight/70 mt-1">
            Browse targeted consultation requests posted by clients and the HireByMinute platform.
          </p>
        </div>

        <button
          onClick={() => setShowPostModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-midnight text-aliceblue font-semibold text-xs hover:bg-midnight-hover shadow-subtle self-start sm:self-auto cursor-pointer"
        >
          <PlusCircle className="w-4 h-4 text-moonstone" />
          <span>Post an Opportunity</span>
        </button>
      </div>

      {/* Opportunities Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white/60 border border-timberwolf/40 rounded-xl p-6 h-48 animate-pulse" />
          ))}
        </div>
      ) : opportunities.length === 0 ? (
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-12 text-center shadow-subtle space-y-3">
          <Briefcase className="w-10 h-10 text-timberwolf-dark mx-auto" />
          <h3 className="text-base font-bold text-midnight">No open opportunities right now</h3>
          <p className="text-xs text-midnight/60 max-w-sm mx-auto">
            Check back soon or post a targeted opportunity for domain experts.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {opportunities.map((opp) => (
            <div
              key={opp.id}
              className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-6 flex flex-col justify-between hover:border-moonstone/50 space-y-4 shadow-subtle"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full bg-aliceblue text-midnight text-[11px] font-semibold border border-timberwolf/40">
                    {opp.category_name}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {opp.pricing_type === 'paid' && Number(opp.entry_fee_inr || opp.entry_fee_usd || 0) > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                        {formatINR(opp.entry_fee_inr || opp.entry_fee_usd || 0)} Entry Fee
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                        Free to Apply
                      </span>
                    )}
                    <span className="text-[11px] text-midnight/50 font-mono font-bold">
                      {opp.duration_minutes}m
                    </span>
                  </div>
                </div>

                <h3 className="font-bold text-base text-midnight line-clamp-2">
                  {opp.title}
                </h3>

                <p className="text-xs text-midnight/70 line-clamp-3 leading-relaxed">
                  {opp.description}
                </p>
              </div>

              <div className="pt-4 border-t border-timberwolf/40 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-midnight/50 uppercase font-semibold block">Fixed Budget</span>
                  <span className="font-extrabold text-base text-midnight font-mono">
                    {formatINR(opp.budget)}
                  </span>
                </div>

                <button
                  onClick={() => setSelectedOpp(opp)}
                  className="px-4 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover transition-colors shadow-subtle cursor-pointer"
                >
                  Apply Now
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* APPLY MODAL */}
      {selectedOpp && (
        <div className="fixed inset-0 z-50 bg-midnight/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-timberwolf max-w-lg w-full p-6 sm:p-7 shadow-elevated space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-moonstone">Application</span>
                <h3 className="text-lg font-bold text-midnight mt-0.5">{selectedOpp.title}</h3>
                <p className="text-xs text-midnight/60 font-mono mt-0.5">Budget: {formatINR(selectedOpp.budget)} • {selectedOpp.duration_minutes} mins</p>
              </div>
              <button
                onClick={() => setSelectedOpp(null)}
                className="text-midnight/40 hover:text-midnight p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleApplySubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-midnight block">Short Message / Approach *</label>
                <textarea
                  rows={3}
                  required
                  value={applyMessage}
                  onChange={(e) => setApplyMessage(e.target.value)}
                  placeholder="How will you help solve this problem during the session?"
                  className="w-full p-3 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight focus:outline-none focus:border-moonstone leading-relaxed"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-midnight block">Relevant Experience *</label>
                <input
                  type="text"
                  required
                  value={applyExperience}
                  onChange={(e) => setApplyExperience(e.target.value)}
                  placeholder="e.g. 7 years Python/FastAPI, built distributed microservices"
                  className="w-full p-3 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight focus:outline-none focus:border-moonstone"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-midnight block">Your Availability</label>
                  <input
                    type="text"
                    value={applyAvailability}
                    onChange={(e) => setApplyAvailability(e.target.value)}
                    className="w-full p-2.5 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-midnight block">Proposed Rate (Optional)</label>
                  <input
                    type="number"
                    placeholder={formatINR(selectedOpp.budget)}
                    value={applyRate}
                    onChange={(e) => setApplyRate(e.target.value)}
                    className="w-full p-2.5 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight"
                  />
                </div>
              </div>

              {/* Dynamic Application Pricing Display */}
              {selectedOpp.pricing_type === 'paid' && Number(selectedOpp.entry_fee_inr || selectedOpp.entry_fee_usd || 0) > 0 ? (
                <div className="p-3 bg-amber-50/80 border border-amber-300 rounded-xl flex items-center justify-between text-xs text-midnight">
                  <div className="flex items-center gap-2">
                    <IndianRupee className="w-4 h-4 text-amber-700" />
                    <span className="font-medium text-amber-950">Application Entry Fee (Verified via Razorpay)</span>
                  </div>
                  <span className="font-mono font-bold text-sm text-amber-900">{formatINR(selectedOpp.entry_fee_inr || selectedOpp.entry_fee_usd || 0)}</span>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50/80 border border-emerald-300 rounded-xl flex items-center justify-between text-xs text-midnight">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="font-medium text-emerald-950">Free Opportunity Application</span>
                  </div>
                  <span className="font-mono font-bold text-sm text-emerald-700">FREE ({formatINR(0)})</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedOpp(null)}
                  className="px-4 py-2.5 rounded-xl border border-timberwolf text-midnight font-semibold hover:bg-aliceblue cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={applyLoading}
                  className="btn-shine px-5 py-2.5 rounded-xl bg-midnight text-aliceblue font-bold hover:bg-midnight-hover transition-colors shadow-subtle cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {applyLoading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Submitting Application...
                    </span>
                  ) : selectedOpp.pricing_type === 'paid' && Number(selectedOpp.entry_fee_inr || selectedOpp.entry_fee_usd || 0) > 0 ? (
                    <>
                      <span>Pay {formatINR(selectedOpp.entry_fee_inr || selectedOpp.entry_fee_usd || 0)} & Submit</span>
                      <ArrowRight className="w-4 h-4 text-moonstone" />
                    </>
                  ) : (
                    <>
                      <span>Submit Application (Free)</span>
                      <ArrowRight className="w-4 h-4 text-moonstone" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POST OPPORTUNITY MODAL */}
      {showPostModal && (
        <div className="fixed inset-0 z-50 bg-midnight/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-timberwolf max-w-lg w-full p-6 sm:p-7 shadow-elevated space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-midnight">Post an Opportunity</h3>
                <p className="text-xs text-midnight/70">Find an expert for a specific problem or consultation need.</p>
              </div>
              <button onClick={() => setShowPostModal(false)} className="text-midnight/40 hover:text-midnight p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePostOpportunity} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-midnight block">Title *</label>
                <input
                  type="text"
                  required
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  placeholder="e.g. Looking for a React Performance Specialist"
                  className="w-full p-3 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight focus:outline-none focus:border-moonstone"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-midnight block">Category *</label>
                <select
                  value={postCategoryId}
                  onChange={(e) => setPostCategoryId(e.target.value)}
                  className="w-full p-3 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight focus:outline-none focus:border-moonstone"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-midnight block">Description *</label>
                <textarea
                  rows={3}
                  required
                  value={postDescription}
                  onChange={(e) => setPostDescription(e.target.value)}
                  placeholder="Explain the background and what you're looking to achieve..."
                  className="w-full p-3 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight focus:outline-none focus:border-moonstone"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-midnight block">Duration (Minutes)</label>
                  <input
                    type="number"
                    min="15"
                    max="180"
                    value={postDuration}
                    onChange={(e) => setPostDuration(parseInt(e.target.value) || 30)}
                    className="w-full p-2.5 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-midnight block">Budget (₹ INR)</label>
                  <input
                    type="number"
                    min="10"
                    value={postBudget}
                    onChange={(e) => setPostBudget(parseFloat(e.target.value) || 50)}
                    className="w-full p-2.5 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowPostModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-timberwolf text-midnight font-semibold hover:bg-aliceblue cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={postLoading}
                  className="px-5 py-2.5 rounded-xl bg-midnight text-aliceblue font-bold hover:bg-midnight-hover transition-colors shadow-subtle cursor-pointer disabled:opacity-50"
                >
                  {postLoading ? 'Posting...' : 'Publish Opportunity'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
