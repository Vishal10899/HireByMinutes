import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Clock,
  CreditCard,
  Video,
  CheckCircle2,
  Star,
  ShieldCheck,
  Award,
  DollarSign,
  ArrowRight,
  PlusCircle,
  FileText,
  Radio,
  Sparkles
} from 'lucide-react';

export const HowItWorksPage: React.FC = () => {
  useEffect(() => {
    document.title = 'How It Works — HireByMinutes';
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-aliceblue text-midnight py-10 sm:py-14">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        
        {/* Header Hero */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-moonstone/10 text-moonstone-dark text-xs font-bold border border-moonstone/30">
            <Sparkles className="w-3.5 h-3.5 text-moonstone" />
            <span>Platform Guide</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-midnight leading-tight">
            How HireByMinutes Works
          </h1>
          <p className="text-sm sm:text-base text-midnight/70 leading-relaxed">
            A step-by-step walkthrough of the consultation lifecycle for both clients seeking clarity and experts monetizing their time.
          </p>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 1: FOR CLIENTS */}
        {/* ========================================================================= */}
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-timberwolf/60 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-midnight text-aliceblue flex items-center justify-center font-bold text-sm">
                01
              </div>
              <div>
                <h2 className="text-2xl font-extrabold text-midnight">For Clients: Getting Expert Clarity</h2>
                <p className="text-xs text-midnight/60">From initial search to live synchronized session and feedback</p>
              </div>
            </div>
            <Link
              to="/services"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-moonstone hover:text-moonstone-dark transition-colors"
            >
              <span>Explore Marketplace</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Step 1 */}
            <div className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card space-y-3">
              <div className="w-8 h-8 rounded-lg bg-aliceblue text-moonstone flex items-center justify-center font-bold text-xs border border-timberwolf/60">
                1
              </div>
              <h3 className="text-sm font-bold text-midnight flex items-center gap-2">
                <Search className="w-4 h-4 text-moonstone" />
                <span>Find an Expert</span>
              </h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                Filter experts across categories, languages, countries, experience levels, and hourly or per-minute rate ranges.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card space-y-3">
              <div className="w-8 h-8 rounded-lg bg-aliceblue text-moonstone flex items-center justify-center font-bold text-xs border border-timberwolf/60">
                2
              </div>
              <h3 className="text-sm font-bold text-midnight flex items-center gap-2">
                <FileText className="w-4 h-4 text-moonstone" />
                <span>Review Services & Rates</span>
              </h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                Inspect the expert’s verified credentials, published service descriptions, client reviews, and transparent per-minute rate.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card space-y-3">
              <div className="w-8 h-8 rounded-lg bg-aliceblue text-moonstone flex items-center justify-center font-bold text-xs border border-timberwolf/60">
                3
              </div>
              <h3 className="text-sm font-bold text-midnight flex items-center gap-2">
                <Clock className="w-4 h-4 text-moonstone" />
                <span>Choose Minutes & Request</span>
              </h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                Specify duration (e.g. 15, 30, or 60 minutes) and send your brief. The expert has a 10-minute SLA window to review and accept.
              </p>
            </div>

            {/* Step 4 */}
            <div className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card space-y-3">
              <div className="w-8 h-8 rounded-lg bg-aliceblue text-moonstone flex items-center justify-center font-bold text-xs border border-timberwolf/60">
                4
              </div>
              <h3 className="text-sm font-bold text-midnight flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-moonstone" />
                <span>Complete Escrow Payment</span>
              </h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                Once the expert accepts, pay securely. Funds are held in escrow and your private consultation room is generated immediately.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            {/* Step 5 */}
            <div className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card space-y-3">
              <div className="w-8 h-8 rounded-lg bg-aliceblue text-moonstone flex items-center justify-center font-bold text-xs border border-timberwolf/60">
                5
              </div>
              <h3 className="text-sm font-bold text-midnight flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-600" />
                <span>Live Synchronized Room</span>
              </h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                Enter the session room with synchronized clock countdowns, real-time messaging, screen sharing, and audio/video controls.
              </p>
            </div>

            {/* Step 6 */}
            <div className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card space-y-3">
              <div className="w-8 h-8 rounded-lg bg-aliceblue text-moonstone flex items-center justify-center font-bold text-xs border border-timberwolf/60">
                6
              </div>
              <h3 className="text-sm font-bold text-midnight flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Session Completion</span>
              </h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                The session concludes when the timer completes or participants end the meeting. Escrow funds settle authoritatively.
              </p>
            </div>

            {/* Step 7 */}
            <div className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card space-y-3">
              <div className="w-8 h-8 rounded-lg bg-aliceblue text-moonstone flex items-center justify-center font-bold text-xs border border-timberwolf/60">
                7
              </div>
              <h3 className="text-sm font-bold text-midnight flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" />
                <span>Ratings & Feedback</span>
              </h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                Leave a star rating and verified feedback that updates the expert’s public credibility across the marketplace.
              </p>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 2: FOR EXPERTS */}
        {/* ========================================================================= */}
        <div className="space-y-6 pt-4">
          <div className="flex items-center justify-between border-b border-timberwolf/60 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-moonstone text-white flex items-center justify-center font-bold text-sm">
                02
              </div>
              <div>
                <h2 className="text-2xl font-extrabold text-midnight">For Experts: Monetizing Specialized Knowledge</h2>
                <p className="text-xs text-midnight/60">How domain authorities create services and receive direct payouts</p>
              </div>
            </div>
            <Link
              to="/provider/onboard"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-moonstone hover:text-moonstone-dark transition-colors"
            >
              <span>Onboard as Expert</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Expert Step 1 */}
            <div className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card space-y-3">
              <div className="w-8 h-8 rounded-lg bg-aliceblue text-moonstone flex items-center justify-center font-bold text-xs border border-timberwolf/60">
                1
              </div>
              <h3 className="text-sm font-bold text-midnight flex items-center gap-2">
                <Award className="w-4 h-4 text-moonstone" />
                <span>Create Expert Profile</span>
              </h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                Register, select your provider role, and populate your headline, bio, experience years, skills, languages, and country.
              </p>
            </div>

            {/* Expert Step 2 */}
            <div className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card space-y-3">
              <div className="w-8 h-8 rounded-lg bg-aliceblue text-moonstone flex items-center justify-center font-bold text-xs border border-timberwolf/60">
                2
              </div>
              <h3 className="text-sm font-bold text-midnight flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-moonstone" />
                <span>Publish Service Listing</span>
              </h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                Define the scope of your consultation (e.g. Code Review, System Design, UX Teardown) and set your custom price per minute.
              </p>
            </div>

            {/* Expert Step 3 */}
            <div className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card space-y-3">
              <div className="w-8 h-8 rounded-lg bg-aliceblue text-moonstone flex items-center justify-center font-bold text-xs border border-timberwolf/60">
                3
              </div>
              <h3 className="text-sm font-bold text-midnight flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-moonstone" />
                <span>Administrative Review</span>
              </h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                Platform administrators review your listing and profile for accuracy and marketplace quality standards.
              </p>
            </div>

            {/* Expert Step 4 */}
            <div className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card space-y-3">
              <div className="w-8 h-8 rounded-lg bg-aliceblue text-moonstone flex items-center justify-center font-bold text-xs border border-timberwolf/60">
                4
              </div>
              <h3 className="text-sm font-bold text-midnight flex items-center gap-2">
                <Clock className="w-4 h-4 text-moonstone" />
                <span>Receive & Accept Briefs</span>
              </h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                Clients send consultation briefs with requested durations. Review the context and accept requests that fit your schedule.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {/* Expert Step 5 */}
            <div className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card space-y-3">
              <div className="w-8 h-8 rounded-lg bg-aliceblue text-moonstone flex items-center justify-center font-bold text-xs border border-timberwolf/60">
                5
              </div>
              <h3 className="text-sm font-bold text-midnight flex items-center gap-2">
                <Video className="w-4 h-4 text-moonstone" />
                <span>Host Focused Sessions</span>
              </h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                Meet in dedicated live consultation rooms. Provide direct analysis, technical diagnosis, or strategic recommendations.
              </p>
            </div>

            {/* Expert Step 6 */}
            <div className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card space-y-3">
              <div className="w-8 h-8 rounded-lg bg-aliceblue text-moonstone flex items-center justify-center font-bold text-xs border border-timberwolf/60">
                6
              </div>
              <h3 className="text-sm font-bold text-midnight flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                <span>Direct 85% Payout Share</span>
              </h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                Upon session conclusion, 85% of the total session price is automatically credited to your provider ledger balance.
              </p>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* KEY PLATFORM PROTOCOLS */}
        {/* ========================================================================= */}
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 sm:p-8 shadow-card space-y-6">
          <h2 className="text-xl font-bold text-midnight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-moonstone" />
            <span>Key Platform Principles & Protocols</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs sm:text-sm text-midnight/80">
            <div className="space-y-1.5">
              <h4 className="font-bold text-midnight">Approval-First Safeguards</h4>
              <p className="text-midnight/70 leading-relaxed">
                Clients are never charged until an expert reviews the inquiry and explicitly accepts. If an expert declines or the 10-minute SLA expires, no payment is collected.
              </p>
            </div>

            <div className="space-y-1.5">
              <h4 className="font-bold text-midnight">Server-Authoritative Timing</h4>
              <p className="text-midnight/70 leading-relaxed">
                Session durations and expirations are enforced server-side. Neither party’s local device clock can prematurely end or extend billed time.
              </p>
            </div>

            <div className="space-y-1.5">
              <h4 className="font-bold text-midnight">Listing Activation Fee</h4>
              <p className="text-midnight/70 leading-relaxed">
                A one-time $2.00 listing fee applies when publishing new services to protect marketplace quality and prevent spam catalog indexing.
              </p>
            </div>

            <div className="space-y-1.5">
              <h4 className="font-bold text-midnight">Dispute & Escrow Protection</h4>
              <p className="text-midnight/70 leading-relaxed">
                If a technical interruption or non-attendance occurs, administrative logs provide objective audit records for full or partial escrow refunds.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Banner */}
        <div className="text-center p-8 bg-white rounded-2xl border border-timberwolf/70 shadow-card space-y-4">
          <h3 className="text-xl font-bold text-midnight">Start Your First Consultation</h3>
          <p className="text-xs sm:text-sm text-midnight/70 max-w-md mx-auto">
            Browse verified listings across technology, design, wellness, and business strategy.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              to="/services"
              className="btn-shine px-5 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover shadow-subtle transition-all"
            >
              Browse Services
            </Link>
            <Link
              to="/provider/onboard"
              className="px-5 py-2.5 rounded-xl bg-aliceblue text-midnight text-xs font-semibold border border-timberwolf/70 hover:bg-lightblue/30 transition-all"
            >
              Become an Expert
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
};
export default HowItWorksPage;
