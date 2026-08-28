import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
  ShieldCheck,
  Zap,
  TrendingUp,
  Users,
  Award,
  ArrowRight,
  CheckCircle2,
  Lock,
  Globe,
  Sparkles,
  DollarSign
} from 'lucide-react';

export const AboutPage: React.FC = () => {
  useEffect(() => {
    document.title = 'About Us — HireByMinutes';
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-aliceblue text-midnight py-10 sm:py-14">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        
        {/* Header Hero */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-moonstone/10 text-moonstone-dark text-xs font-bold border border-moonstone/30">
            <Sparkles className="w-3.5 h-3.5 text-moonstone" />
            <span>The Precision Marketplace for Expertise</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-midnight leading-tight">
            Consulting Re-engineered for the Speed of Execution
          </h1>
          <p className="text-sm sm:text-base text-midnight/70 leading-relaxed">
            HireByMinutes connects professionals, founders, developers, and creators with verified domain experts for exactly the minutes required to solve high-stakes challenges.
          </p>
        </div>

        {/* The Problem We Solve */}
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 sm:p-8 shadow-card space-y-6">
          <div className="flex items-center gap-3 border-b border-timberwolf/40 pb-4">
            <div className="w-10 h-10 rounded-xl bg-aliceblue flex items-center justify-center border border-timberwolf/60">
              <Clock className="w-5 h-5 text-moonstone" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-midnight">The Problem with Traditional Consulting</h2>
              <p className="text-xs text-midnight/60">Why modern knowledge work needs a faster exchange protocol</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs sm:text-sm text-midnight/80 leading-relaxed">
            <p>
              When engineering teams encounter complex architecture roadblocks, designers review critical launch designs, or founders assess legal trade-offs, they rarely need an expensive multi-week statement of work or a mandatory minimum retainer. What they need is 15 to 30 minutes of focused, direct clarity from someone who has navigated that exact challenge before.
            </p>
            <p>
              Traditional marketplaces force practitioners into lengthy proposal bidding cycles, arbitrary hourly minimums, and protracted onboarding. HireByMinutes eliminates that friction by introducing <strong>minute-accurate consultation rooms</strong> backed by automated payment hold and release settlement and transparent per-minute pricing.
            </p>
          </div>
        </div>

        {/* Core Pillars Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card space-y-3">
            <div className="w-9 h-9 rounded-xl bg-moonstone/10 text-moonstone-dark flex items-center justify-center border border-moonstone/30">
              <Clock className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-midnight">Minute-Based Precision</h3>
            <p className="text-xs text-midnight/70 leading-relaxed">
              Book consultations in increments tailored to your actual query. You pay strictly for the time spent, avoiding inflated hourly commitments.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card space-y-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-midnight">Verified Practitioners</h3>
            <p className="text-xs text-midnight/70 leading-relaxed">
              Profiles are authenticated by administrative verification teams. Verified expert badges indicate credential reviews and track records.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card space-y-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200">
              <Lock className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-midnight">Protected Payment Hold</h3>
            <p className="text-xs text-midnight/70 leading-relaxed">
              Payments are held securely upon client authorization and only disbursed upon successful consultation completion according to server timer logs.
            </p>
          </div>
        </div>

        {/* Two Sides of the Marketplace */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* For Clients */}
          <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 sm:p-8 shadow-card space-y-5">
            <div className="flex items-center gap-2.5">
              <Users className="w-5 h-5 text-moonstone" />
              <h3 className="text-lg font-bold text-midnight">For Clients & Teams</h3>
            </div>
            <ul className="space-y-3 text-xs sm:text-sm text-midnight/80">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Instant discovery:</strong> Search experts across technology, design, legal strategy, fitness, and data architecture.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Approval-first booking:</strong> Experts review and accept your brief within a 10-minute response window before payment.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>No long-term commitments:</strong> Solve specific bugs, conduct architectural teardowns, or get strategic feedback on demand.</span>
              </li>
            </ul>
            <div className="pt-2">
              <Link
                to="/services"
                className="btn-shine inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover transition-all"
              >
                <span>Browse Expert Marketplace</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* For Experts */}
          <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 sm:p-8 shadow-card space-y-5">
            <div className="flex items-center gap-2.5">
              <Award className="w-5 h-5 text-moonstone" />
              <h3 className="text-lg font-bold text-midnight">For Domain Experts</h3>
            </div>
            <ul className="space-y-3 text-xs sm:text-sm text-midnight/80">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Monetize spare availability:</strong> Set your own per-minute rate and accept sessions when convenient.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Direct payout economics:</strong> Receive 85% of your consultation earnings directly to your verified balance.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Zero proposal writing:</strong> Clients send consultation requests directly to your published service listings.</span>
              </li>
            </ul>
            <div className="pt-2">
              <Link
                to="/provider/onboard"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-midnight border border-timberwolf/70 text-xs font-semibold hover:bg-aliceblue transition-all"
              >
                <span>Become a Service Provider</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Transparent Economics */}
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 sm:p-8 shadow-card space-y-4">
          <h2 className="text-lg font-bold text-midnight flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-moonstone" />
            <span>Fair & Transparent Platform Economics</span>
          </h2>
          <p className="text-xs sm:text-sm text-midnight/80 leading-relaxed">
            HireByMinutes operates with complete pricing clarity. There are no hidden subscription tiers or opaque placement fees:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="p-4 bg-aliceblue rounded-xl border border-timberwolf/50 space-y-1">
              <div className="text-xs font-bold text-midnight uppercase tracking-wider">Expert Payout Share</div>
              <div className="text-xl font-extrabold text-emerald-700 font-mono">85%</div>
              <p className="text-[11px] text-midnight/70">
                85% of all consultation payments go directly to the verified expert upon session completion.
              </p>
            </div>
            <div className="p-4 bg-aliceblue rounded-xl border border-timberwolf/50 space-y-1">
              <div className="text-xs font-bold text-midnight uppercase tracking-wider">Platform Take & Cataloging</div>
              <div className="text-xl font-extrabold text-midnight font-mono">15%</div>
              <p className="text-[11px] text-midnight/70">
                15% platform commission covers live signaling infrastructure, payment hold & release processing, and support.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Footer */}
        <div className="text-center p-8 bg-white rounded-2xl border border-timberwolf/70 shadow-card space-y-4">
          <h3 className="text-xl font-bold text-midnight">Ready to get started?</h3>
          <p className="text-xs sm:text-sm text-midnight/70 max-w-md mx-auto">
            Join clients getting direct answers and experts earning from their time on HireByMinutes.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              to="/services"
              className="btn-shine px-5 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover shadow-subtle transition-all"
            >
              Explore Services
            </Link>
            <Link
              to="/how-it-works"
              className="px-5 py-2.5 rounded-xl bg-aliceblue text-midnight text-xs font-semibold border border-timberwolf/70 hover:bg-lightblue/30 transition-all"
            >
              How It Works
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
};
export default AboutPage;
