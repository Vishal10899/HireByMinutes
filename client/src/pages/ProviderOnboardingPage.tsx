import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import { Category } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  Sparkles,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { usePageSEO } from '../hooks/usePageSEO';
import { formatINR } from '../utils/currency';

export const ProviderOnboardingPage: React.FC = () => {
  usePageSEO({
    title: 'Provider Onboarding — HireByMinute',
    noindex: true,
    canonicalPath: '/provider/onboard'
  });

  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();

  const [categories, setCategories] = useState<Category[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [pricePerMinute, setPricePerMinute] = useState<number>(50.00);
  const [skillsText, setSkillsText] = useState('Python, FastAPI, System Design');
  const [experienceYears, setExperienceYears] = useState(5);
  const [availableNow, setAvailableNow] = useState(true);

  // Listing creation state
  const [createdServiceId, setCreatedServiceId] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const resCats = await api.getCategories();
        setCategories(resCats.categories || []);
        if (resCats.categories && resCats.categories.length > 0) {
          setCategoryId(resCats.categories[0].id);
        }
      } catch (e) {
        console.error('Failed to load categories', e);
      }
    }
    loadData();
  }, []);

  const selectedCategoryName = categories.find((c) => c.id === categoryId)?.name || 'General';

  const handlePublishService = async () => {
    if (!title.trim() || !categoryId || !description.trim() || !pricePerMinute) {
      setError('Please fill out all required service fields before publishing.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const skillsArray = skillsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await api.createService({
        title: title.trim(),
        category_id: categoryId,
        description: description.trim(),
        price_per_minute: pricePerMinute,
        skills: skillsArray,
        languages: ['English'],
        experience_years: experienceYears,
        available_now: availableNow
      });

      setCreatedServiceId(res.service.id);
      setIsPublished(true);
      await refreshUser();
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } catch (err: any) {
      setError(err.message || 'Failed to publish service listing. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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
          Create your professional listing and set your per-minute consultation rate.
        </p>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-3 pt-4">
          <div className={`flex items-center gap-1.5 text-xs font-bold ${step === 1 ? 'text-midnight' : 'text-midnight/40'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 1 ? 'bg-midnight text-aliceblue' : 'bg-timberwolf text-midnight'}`}>1</span>
            <span>Profile & Scope</span>
          </div>
          <div className="w-8 h-[1px] bg-timberwolf" />
          <div className={`flex items-center gap-1.5 text-xs font-bold ${step === 2 ? 'text-midnight' : 'text-midnight/40'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 2 ? 'bg-midnight text-aliceblue' : 'bg-timberwolf text-midnight'}`}>2</span>
            <span>Pricing & Skills</span>
          </div>
          <div className="w-8 h-[1px] bg-timberwolf" />
          <div className={`flex items-center gap-1.5 text-xs font-bold ${step === 3 ? 'text-midnight' : 'text-midnight/40'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 3 ? 'bg-midnight text-aliceblue' : 'bg-timberwolf text-midnight'}`}>3</span>
            <span>Review & Publish</span>
          </div>
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
              <h2 className="text-xl font-extrabold text-midnight">Your service is now live.</h2>
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
                <span className="text-midnight/60">Category</span>
                <span className="font-medium text-midnight">{selectedCategoryName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-midnight/60">Rate</span>
                <span className="font-mono font-bold text-midnight">{formatINR(pricePerMinute)}/min</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-timberwolf/30">
                <span className="text-midnight/60">Status</span>
                <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                  Active & Live
                </span>
              </div>
            </div>

            <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/provider"
                className="px-6 py-3 rounded-xl bg-midnight text-aliceblue font-bold text-xs hover:bg-midnight-hover transition-all shadow-subtle flex items-center gap-2 cursor-pointer"
              >
                <span>Go to Provider Dashboard</span>
                <ArrowRight className="w-4 h-4 text-moonstone" />
              </Link>
              {createdServiceId && (
                <Link
                  to={`/services/${createdServiceId}`}
                  className="px-5 py-3 rounded-xl bg-white border border-timberwolf/70 text-midnight font-bold text-xs hover:bg-aliceblue transition-all cursor-pointer"
                >
                  View Live Service
                </Link>
              )}
            </div>
          </div>
        ) : step === 1 ? (
          /* STEP 1: SCOPE & TITLE */
          <div className="space-y-6">
            {error && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-midnight">Service Scope & Expertise</h3>
              <p className="text-xs text-midnight/70">
                Define the specific domain or problem area where clients can hire you for quick 1-on-1 consultations.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-midnight block">Listing Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Python & FastAPI Code Review and Live Debugging"
                  className="w-full p-3 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-xs text-midnight focus:outline-none focus:border-moonstone"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-midnight block">Primary Category *</label>
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
                <label className="font-semibold text-midnight block">Detailed Description *</label>
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
                  if (!title.trim() || !description.trim()) {
                    setError('Please fill out the listing title and description.');
                    return;
                  }
                  setError(null);
                  setStep(2);
                }}
                className="px-6 py-3 rounded-xl bg-midnight text-aliceblue font-bold text-xs hover:bg-midnight-hover transition-all flex items-center gap-2 cursor-pointer shadow-subtle"
              >
                <span>Continue to Pricing & Skills</span>
                <ArrowRight className="w-4 h-4 text-moonstone" />
              </button>
            </div>
          </div>
        ) : step === 2 ? (
          /* STEP 2: PRICE PER MINUTE, SKILLS & AVAILABILITY */
          <div className="space-y-6">
            {error && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

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
                      {formatINR(pricePerMinute)}
                    </span>
                    <span className="text-midnight/60 font-medium">/ min</span>
                  </div>
                </div>

                <input
                  type="range"
                  min="5.00"
                  max="500.00"
                  step="1.00"
                  value={pricePerMinute}
                  onChange={(e) => setPricePerMinute(parseFloat(e.target.value))}
                  className="w-full accent-moonstone cursor-pointer"
                />

                <div className="text-[11px] text-midnight/60 flex justify-between">
                  <span>30 mins = {formatINR(pricePerMinute * 30)}</span>
                  <span>60 mins = {formatINR(pricePerMinute * 60)}</span>
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
                onClick={() => {
                  setError(null);
                  setStep(1);
                }}
                className="text-xs font-semibold text-midnight/60 hover:text-midnight cursor-pointer"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pricePerMinute < 1) {
                    setError('Price per minute must be at least ₹1.00');
                    return;
                  }
                  setError(null);
                  setStep(3);
                }}
                className="px-6 py-3 rounded-xl bg-midnight text-aliceblue font-bold text-xs hover:bg-midnight-hover transition-all flex items-center gap-2 cursor-pointer shadow-subtle"
              >
                <span>Review & Publish</span>
                <ArrowRight className="w-4 h-4 text-moonstone" />
              </button>
            </div>
          </div>
        ) : (
          /* STEP 3: REVIEW & PUBLISH STEP */
          <div className="space-y-6 animate-fade-in">
            {error && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-midnight">Review & Publish Service</h3>
              <p className="text-xs text-midnight/70">
                Review your consultation details before publishing to the marketplace.
              </p>
            </div>

            {/* Service Summary Card */}
            <div className="bg-aliceblue p-5 rounded-2xl border border-timberwolf/60 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-moonstone">
                    {selectedCategoryName}
                  </span>
                  <h4 className="font-bold text-base text-midnight mt-0.5">{title}</h4>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-mono font-extrabold text-base text-midnight">
                    {formatINR(pricePerMinute)}
                  </span>
                  <span className="text-[11px] text-midnight/60 block">/ minute</span>
                </div>
              </div>

              <p className="text-xs text-midnight/70 leading-relaxed whitespace-pre-line">
                {description}
              </p>

              <div className="pt-2 border-t border-timberwolf/40 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase text-midnight/50 block">Experience</span>
                  <span className="font-semibold text-midnight">{experienceYears} years</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-midnight/50 block">Availability</span>
                  <span className="font-semibold text-midnight">
                    {availableNow ? 'Available today' : 'By appointment'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-midnight/50 block">Skills</span>
                  <span className="font-medium text-midnight/80 truncate block">{skillsText}</span>
                </div>
              </div>
            </div>

            {/* Free Publishing Highlight Banner */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3 text-xs text-emerald-900">
              <Sparkles className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="space-y-0.5">
                <span className="font-bold block text-emerald-950">
                  Publishing is free. Clients pay only when they book a paid session.
                </span>
                <span className="text-[11px] text-emerald-800/80 block">
                  You are never charged an upfront listing, creation, or activation fee.
                </span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep(2);
                }}
                disabled={loading}
                className="text-xs font-semibold text-midnight/60 hover:text-midnight cursor-pointer disabled:opacity-50"
              >
                ← Back to Edit
              </button>
              <button
                type="button"
                onClick={handlePublishService}
                disabled={loading}
                className="px-7 py-3.5 rounded-xl bg-midnight text-aliceblue font-bold text-xs hover:bg-midnight-hover transition-all flex items-center gap-2 cursor-pointer shadow-subtle disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Publishing Service...
                  </span>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-moonstone" />
                    <span>Publish Service</span>
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
