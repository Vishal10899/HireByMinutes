import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Service, Category, Job } from '../types';
import { ExpertCard } from '../components/common/ExpertCard';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import {
  Search,
  ArrowRight,
  Clock,
  Sparkles,
  CheckCircle2,
  Code2,
  Cpu,
  Palette,
  Megaphone,
  Briefcase,
  DollarSign,
  Scale,
  GraduationCap,
  Shield,
  Zap,
  ArrowUpRight,
  X,
  MapPin
} from 'lucide-react';

import { usePageSEO } from '../hooks/usePageSEO';

export const HomePage: React.FC = () => {
  const [seoData, setSeoData] = useState<{ site_title?: string; meta_description?: string } | null>(null);

  usePageSEO({
    title: seoData?.site_title || 'HireByMinute — Hire Experts by the Minute & Discover Careers',
    description: seoData?.meta_description || 'Find the right expert by the minute, offer freelance services, or discover full-time employment opportunities with top verified companies.',
    canonicalPath: '/'
  });

  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTab, setSearchTab] = useState<'services' | 'experts' | 'jobs'>('services');
  const [featuredServices, setFeaturedServices] = useState<Service[]>([]);
  const [featuredJobs, setFeaturedJobs] = useState<Job[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cmsSettings, setCmsSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadHomeData() {
      try {
        const [servicesRes, categoriesRes, homepageRes, seoRes, jobsRes] = await Promise.all([
          api.getFeaturedServices(),
          api.getCategories(),
          api.getHomepageSettings().catch(() => null),
          api.getSeoSettings().catch(() => null),
          api.getFeaturedJobs().catch(() => ({ jobs: [] }))
        ]);
        setFeaturedServices(servicesRes?.services || []);
        setCategories(categoriesRes?.categories || []);
        setFeaturedJobs(jobsRes?.jobs || []);
        if (homepageRes && homepageRes.homepage) {
          setCmsSettings(homepageRes.homepage);
        }
        if (seoRes && seoRes.seo) {
          setSeoData(seoRes.seo);
        }
      } catch (err) {
        console.error('Failed to load homepage data', err);
      } finally {
        setLoading(false);
      }
    }
    loadHomeData();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (searchTab === 'jobs') {
      navigate(q ? `/jobs?search=${encodeURIComponent(q)}` : '/jobs');
    } else if (searchTab === 'experts') {
      navigate(q ? `/services?search=${encodeURIComponent(q)}` : '/services');
    } else {
      navigate(q ? `/services?search=${encodeURIComponent(q)}` : '/services');
    }
  };

  const getCategoryIcon = (iconName: string) => {
    switch (iconName) {
      case 'Code2': return <Code2 className="w-5 h-5" />;
      case 'Cpu': return <Cpu className="w-5 h-5" />;
      case 'Palette': return <Palette className="w-5 h-5" />;
      case 'Megaphone': return <Megaphone className="w-5 h-5" />;
      case 'Briefcase': return <Briefcase className="w-5 h-5" />;
      case 'DollarSign': return <DollarSign className="w-5 h-5" />;
      case 'Scale': return <Scale className="w-5 h-5" />;
      case 'GraduationCap': return <GraduationCap className="w-5 h-5" />;
      default: return <Sparkles className="w-5 h-5" />;
    }
  };

  return (
    <div className="space-y-20 sm:space-y-28 pb-16">
      
      {/* ========================================================================= */}
      {/* HERO SECTION — THE TWO CHOICES */}
      {/* ========================================================================= */}
      {cmsSettings?.visibility?.hero !== false && (
        <section className="pt-10 sm:pt-16 max-w-5xl mx-auto px-4 sm:px-6 text-center">
          
          {cmsSettings?.hero_badge_text && (
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-moonstone/10 border border-moonstone/30 text-moonstone-dark font-medium text-xs mb-4">
              <span>{cmsSettings.hero_badge_text}</span>
            </div>
          )}

          <h1 className="text-[32px] sm:text-5xl font-extrabold text-midnight tracking-tight max-w-2xl mx-auto leading-[1.15]">
            {cmsSettings?.hero_headline || 'What brings you here?'}
          </h1>
          
          <p className="mt-4 sm:mt-5 text-base sm:text-lg text-midnight/70 max-w-xl mx-auto leading-relaxed">
            {cmsSettings?.hero_subheadline || 'Find the right expert. Hire them by the minute. Pay only for the time you need.'}
          </p>

          {/* ========================================================================= */}
          {/* PRIMARY MARKETPLACE INTENT ACTIONS (2 CARDS) */}
          {/* ========================================================================= */}
          {cmsSettings?.visibility?.intent_cards !== false && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mt-7 sm:mt-9 text-left max-w-3xl mx-auto">
              
              {/* Card 1: Find an Expert */}
              <div className="bg-lightblue/35 border-2 border-lightblue/90 hover:border-moonstone/70 rounded-[22px] p-5 sm:p-6 shadow-subtle flex flex-col justify-between transition-all duration-150">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-white/90 border border-lightblue/80 text-midnight flex items-center justify-center mb-4 shrink-0 shadow-xs">
                    <Clock className="w-5 h-5 text-midnight" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-moonstone-dark block mb-1">
                    Pay by the Minute
                  </span>
                  <h2 className="text-lg sm:text-xl font-bold text-midnight tracking-tight mb-2">
                    {cmsSettings?.intent_expert_title || cmsSettings?.intent_client_title || 'Find an Expert'}
                  </h2>
                  <p className="text-xs sm:text-sm text-midnight/75 leading-relaxed">
                    {cmsSettings?.intent_expert_desc || cmsSettings?.intent_client_desc || 'Find verified professionals and pay strictly by the minute for precision advice and consultations.'}
                  </p>
                </div>
                <div className="mt-5 pt-1">
                  <Button
                    to={cmsSettings?.primary_cta_url || '/services'}
                    variant="primary"
                    size="sm"
                    className="w-full text-xs"
                    iconRight={<ArrowRight className="w-3.5 h-3.5 text-moonstone" />}
                  >
                    {cmsSettings?.intent_expert_button || cmsSettings?.intent_client_button || 'Find an Expert'}
                  </Button>
                </div>
              </div>

              {/* Card 2: List Your Service / Become a Service Provider */}
              <div className="bg-white border-2 border-timberwolf/80 hover:border-moonstone/70 rounded-[22px] p-5 sm:p-6 shadow-subtle flex flex-col justify-between transition-all duration-150">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-aliceblue border border-timberwolf/60 text-moonstone flex items-center justify-center mb-4 shrink-0 shadow-xs">
                    <DollarSign className="w-5 h-5 text-moonstone" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-midnight/50 block mb-1">
                    Monetize Your Time
                  </span>
                  <h2 className="text-lg sm:text-xl font-bold text-midnight tracking-tight mb-2">
                    {cmsSettings?.intent_freelance_title || cmsSettings?.intent_provider_title || 'List Your Service'}
                  </h2>
                  <p className="text-xs sm:text-sm text-midnight/75 leading-relaxed">
                    {cmsSettings?.intent_freelance_desc || cmsSettings?.intent_provider_desc || 'Share what you know, accept client bookings, and monetize your professional minutes.'}
                  </p>
                </div>
                <div className="mt-5 pt-1">
                  <Button
                    to={cmsSettings?.secondary_cta_url || '/provider/onboard'}
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    iconRight={<ArrowRight className="w-3.5 h-3.5" />}
                  >
                    {cmsSettings?.intent_freelance_button || cmsSettings?.intent_provider_button || 'Become a Service Provider'}
                  </Button>
                </div>
              </div>

            </div>
          )}

          {/* ========================================================================= */}
          {/* SEARCH BAR SECTION WITH TABS (SERVICES / EXPERTS / JOBS) */}
          {/* ========================================================================= */}
          {cmsSettings?.visibility?.search !== false && (
            <div className="mt-8 sm:mt-10 max-w-3xl mx-auto">
              {/* Search Category Tabs */}
              <div className="flex items-center justify-center gap-2 mb-3">
                {[
                  { id: 'services', label: 'Services' },
                  { id: 'experts', label: 'Experts' },
                  { id: 'jobs', label: 'Full-Time Jobs' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSearchTab(tab.id as any)}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      searchTab === tab.id
                        ? 'bg-midnight text-aliceblue shadow-xs'
                        : 'bg-white/80 text-midnight/70 hover:bg-white hover:text-midnight border border-timberwolf/60'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSearchSubmit} className="relative w-full">
                <div className="flex items-center bg-white border-2 border-timberwolf/90 rounded-2xl shadow-subtle p-1.5 sm:p-2 focus-within:border-moonstone focus-within:shadow-card transition-all">
                  <Search className="w-5 h-5 text-midnight/50 ml-3 shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={
                      searchTab === 'jobs'
                        ? 'Search full-time roles, companies, or tech stack...'
                        : searchTab === 'experts'
                        ? 'Search expert advisors by name, title, or skills...'
                        : (cmsSettings?.search_placeholder || 'Search experts, skills, or services...')
                    }
                    className="min-w-0 flex-1 px-3 py-2 text-sm sm:text-base text-midnight placeholder:text-midnight/40 placeholder:truncate bg-transparent focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="p-1.5 mr-1 text-midnight/40 hover:text-midnight transition-colors cursor-pointer rounded-lg shrink-0"
                      title="Clear search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    className="shrink-0 rounded-xl px-4 sm:px-5"
                  >
                    Search
                  </Button>
                </div>
              </form>

              {/* Popular searches as horizontally scrollable chips (no wrapping wall, no clipping) */}
              <div className="flex items-center gap-2 mt-3.5 sm:mt-4 text-xs text-midnight/70 overflow-x-auto no-scrollbar py-1.5 px-0.5 justify-start sm:justify-center">
                <span className="text-midnight/50 font-medium shrink-0 flex items-center gap-1 pl-1">
                  <Sparkles className="w-3.5 h-3.5 text-moonstone shrink-0" />
                  Popular:
                </span>
                <div className="flex items-center gap-2 shrink-0 pr-4 sm:pr-0">
                  {(cmsSettings?.popular_tags && cmsSettings.popular_tags.length > 0 ? cmsSettings.popular_tags : ['Python developer', 'Figma teardown', 'RAG architect', 'B2B growth audit', 'Tax advisor', 'AI Prompt Engineer', 'Fractional CTO']).map((tag: string) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => navigate(`/services?search=${encodeURIComponent(tag)}`)}
                      className="shrink-0 min-h-[40px] px-3.5 py-2 rounded-full bg-white border border-timberwolf/80 hover:border-moonstone hover:text-midnight active:scale-95 transition-all text-midnight/80 font-medium whitespace-nowrap shadow-xs cursor-pointer text-xs"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

        </section>
      )}

      {/* ========================================================================= */}
      {/* POPULAR CATEGORIES */}
      {/* ========================================================================= */}
      {cmsSettings?.visibility?.popular_categories !== false && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-midnight tracking-tight">
                Popular Categories
              </h2>
              <p className="text-sm text-midnight/65 mt-1">
                Browse domain experts across every online discipline.
              </p>
            </div>
            <Link
              to="/services"
              className="text-xs sm:text-sm font-semibold text-moonstone hover:text-moonstone-dark flex items-center gap-1 transition-colors"
            >
              View All Categories <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
            {categories.slice(0, 11).map((cat) => (
              <Link
                key={cat.id}
                to={`/services?category=${cat.slug}`}
                className="water-surface-card bg-white border border-timberwolf/70 hover:border-moonstone/80 rounded-[20px] p-4 sm:p-5 flex flex-col items-start justify-between min-h-[116px] sm:min-h-[122px] transition-all duration-150 shadow-subtle hover:shadow-card active:scale-[0.97] group cursor-pointer"
              >
                <div className="w-11 h-11 rounded-xl bg-aliceblue flex items-center justify-center text-midnight group-hover:bg-midnight group-hover:text-aliceblue transition-all duration-150 shrink-0">
                  {getCategoryIcon(cat.icon)}
                </div>
                <span className="font-bold text-sm sm:text-base text-midnight group-hover:text-moonstone tracking-tight line-clamp-1 mt-2">
                  {cat.name}
                </span>
              </Link>
            ))}

            <Link
              to="/services"
              className="water-surface-card bg-lightblue/25 hover:bg-lightblue/40 border-2 border-dashed border-lightblue/80 rounded-[20px] p-4 sm:p-5 flex flex-col items-center justify-center text-center min-h-[116px] sm:min-h-[122px] transition-all duration-150 active:scale-[0.97] group cursor-pointer"
            >
              <span className="font-bold text-sm sm:text-base text-midnight group-hover:text-moonstone">
                View All
              </span>
              <span className="text-xs text-midnight/60 mt-0.5 font-medium">
                {categories.length}+ Categories
              </span>
            </Link>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* FEATURED EXPERTS SECTION */}
      {/* ========================================================================= */}
      {cmsSettings?.visibility?.featured_experts !== false && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-midnight tracking-tight">
                People you can hire
              </h2>
              <p className="text-sm text-midnight/65 mt-1">
                Connect with vetted specialists and pay only for the minutes you spend together.
              </p>
            </div>
            <Link
              to="/services"
              className="text-xs sm:text-sm font-semibold text-moonstone hover:text-moonstone-dark flex items-center gap-1 transition-colors"
            >
              Browse Marketplace <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white/60 border border-timberwolf/40 rounded-xl p-6 h-64 animate-pulse" />
              ))}
            </div>
          ) : featuredServices.length === 0 ? (
            <div className="bg-white rounded-2xl border border-timberwolf/70 p-10 text-center shadow-card space-y-4 max-w-xl mx-auto">
              <div className="w-12 h-12 rounded-xl bg-aliceblue text-midnight mx-auto flex items-center justify-center border border-timberwolf/60">
                <Clock className="w-6 h-6 text-moonstone" />
              </div>
              <h3 className="text-base font-bold text-midnight">Expert Marketplace Opening</h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                New verified service providers are being onboarded across technology, design, and business strategy.
              </p>
              <div className="pt-1">
                <Link
                  to="/provider/onboard"
                  className="btn-shine inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover transition-all"
                >
                  <span>Become a Service Provider</span>
                  <ArrowRight className="w-3.5 h-3.5 text-moonstone" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredServices.map((service) => (
                <ExpertCard key={service.id} service={service} />
              ))}
            </div>
          )}
        </section>
      )}



      {/* ========================================================================= */}
      {/* HOW HIREBYMINUTES WORKS (DYNAMIC STEPS) */}
      {/* ========================================================================= */}
      {cmsSettings?.visibility?.how_it_works !== false && (
        <section id="how-it-works" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-2xl border border-timberwolf/70 p-8 sm:p-12 shadow-subtle">
            <div className="text-center max-w-xl mx-auto mb-12">
              <span className="text-xs font-bold uppercase tracking-wider text-moonstone">
                Simple & Transparent
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-midnight mt-1.5">
                {cmsSettings?.how_it_works_title || 'How HireByMinute works'}
              </h2>
              <p className="text-sm text-midnight/70 mt-2">
                {cmsSettings?.how_it_works_subtitle || 'From finding the right person to finishing your timed consultation in four easy steps.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {(cmsSettings?.how_it_works_steps && cmsSettings.how_it_works_steps.length > 0
                ? cmsSettings.how_it_works_steps
                : [
                    { step: '01', title: 'Find an Expert', description: 'Find someone who knows exactly what you need without wading through bloated project agencies.' },
                    { step: '02', title: 'Choose Your Time', description: 'Choose exactly how many minutes or hours you need: 15m, 30m, 45m, or custom duration.' },
                    { step: '03', title: 'Live Timed Session', description: 'Chat, call, video, or share files while the server-authoritative countdown clock is active.' },
                    { step: '04', title: 'Session Completes', description: 'When time ends, communication closes naturally. No scope creep, surprise invoices, or billing disputes.' }
                  ]
              ).map((st: any, idx: number) => (
                <div key={idx} className="space-y-3">
                  <span className="text-xs font-mono font-bold text-moonstone bg-aliceblue px-2.5 py-1 rounded-md border border-timberwolf/30">
                    {st.step || `0${idx + 1}`}
                  </span>
                  <h3 className="font-bold text-base text-midnight">{st.title}</h3>
                  <p className="text-xs text-midnight/70 leading-relaxed">
                    {st.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* DUAL VALUE PROPOSITIONS (CLIENT & PROVIDER) */}
      {/* ========================================================================= */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Client Value Proposition */}
          <div className="bg-lightblue/20 border border-lightblue rounded-2xl p-8 sm:p-10 flex flex-col justify-between shadow-subtle">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-midnight/60">
                For Clients & Teams
              </span>
              <h3 className="text-xl sm:text-2xl font-bold text-midnight mt-2 mb-3">
                Don’t hire for a whole project when you only need 20 minutes.
              </h3>
              <p className="text-sm text-midnight/75 leading-relaxed mb-6">
                Get direct access to someone who already knows the answer. Solve hard bugs, audit your architecture, or unblock team decisions right away.
              </p>
            </div>
            <div>
              <Link
                to="/services"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-midnight text-aliceblue font-semibold text-xs sm:text-sm hover:bg-midnight-hover transition-colors"
              >
                <span>Find an Expert</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Provider Value Proposition */}
          <div className="bg-white border border-timberwolf/80 rounded-2xl p-8 sm:p-10 flex flex-col justify-between shadow-subtle">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-moonstone">
                For People with Expertise
              </span>
              <h3 className="text-xl sm:text-2xl font-bold text-midnight mt-2 mb-3">
                Your expertise has a timer.
              </h3>
              <p className="text-sm text-midnight/75 leading-relaxed mb-6">
                Share what you know and get hired by the minute. Help people when they need you without committing to long project contracts or scope creep.
              </p>
            </div>
            <div>
              <Link
                to="/provider/onboard"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-midnight text-aliceblue font-semibold text-xs sm:text-sm hover:bg-midnight-hover transition-colors"
              >
                <span>Start Providing a Service</span>
                <ArrowRight className="w-3.5 h-3.5 text-moonstone" />
              </Link>
            </div>
          </div>

        </div>
      </section>

      {/* ========================================================================= */}
      {/* OPTIONAL SECONDARY FULL-TIME JOBS SECTION */}
      {/* ========================================================================= */}
      {cmsSettings?.visibility?.fulltime_jobs !== false && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {featuredJobs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-5 shadow-subtle">
              <div className="flex items-center gap-4 text-left">
                <div className="w-11 h-11 rounded-xl bg-moonstone/10 border border-moonstone/20 text-moonstone flex items-center justify-center shrink-0 shadow-xs">
                  <Briefcase className="w-5 h-5 text-moonstone" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-midnight">
                    Looking for a full-time role?
                  </h3>
                  <p className="text-xs sm:text-sm text-midnight/70 mt-0.5">
                    Explore current opportunities from companies hiring through HireByMinute.
                  </p>
                </div>
              </div>
              <Link
                to="/jobs"
                className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs sm:text-sm font-semibold hover:bg-midnight-hover transition-all shadow-xs"
              >
                <span>Browse Jobs</span>
                <ArrowRight className="w-3.5 h-3.5 text-moonstone" />
              </Link>
            </div>
          ) : (
            <div>
              <div className="flex items-end justify-between mb-8">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-moonstone/10 text-moonstone-dark text-xs font-bold mb-2 border border-moonstone/20">
                    <Briefcase className="w-3.5 h-3.5 text-moonstone" />
                    <span>Company Career Openings</span>
                  </div>
                  <h2 className="text-2xl font-bold text-midnight tracking-tight">
                    Full-Time Opportunities
                  </h2>
                  <p className="text-sm text-midnight/65 mt-1">
                    Explore open positions from verified companies hiring talent directly on HireByMinute.
                  </p>
                </div>
                <Link
                  to="/jobs"
                  className="text-xs sm:text-sm font-semibold text-moonstone hover:text-moonstone-dark flex items-center gap-1 transition-colors"
                >
                  Explore All Jobs <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {featuredJobs.map((job) => {
                  const cName = job.company?.name || job.company_name || 'HireByMinute Employer';
                  const cLogo = job.company?.logo_url || job.company_logo;
                  const loc = job.location_text || [job.city, job.country].filter(Boolean).join(', ') || 'Global';

                  return (
                    <div
                      key={job.id}
                      onClick={() => navigate(`/jobs/${job.slug || job.id}`)}
                      className="bg-white border border-timberwolf/70 hover:border-moonstone/80 rounded-2xl p-5 shadow-card hover:shadow-subtle transition-all duration-150 cursor-pointer group flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="w-10 h-10 rounded-xl bg-aliceblue border border-timberwolf/60 flex items-center justify-center font-bold text-xs text-midnight overflow-hidden shrink-0">
                            {cLogo ? (
                              <img src={cLogo} alt={cName} className="w-full h-full object-cover" />
                            ) : (
                              cName.slice(0, 2).toUpperCase()
                            )}
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                            job.work_mode === 'Remote'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : job.work_mode === 'Hybrid'
                              ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                              : 'bg-zinc-100 text-zinc-800 border-zinc-200'
                          }`}>
                            {job.work_mode}
                          </span>
                        </div>

                        <span className="text-xs text-midnight/60 font-medium block truncate mb-1">
                          {cName}
                        </span>
                        <h3 className="text-base font-bold text-midnight group-hover:text-moonstone transition-colors leading-snug tracking-tight line-clamp-2">
                          {job.title}
                        </h3>
                        
                        <div className="flex items-center gap-3 mt-3 text-xs text-midnight/70">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-moonstone shrink-0" />
                            <span className="truncate max-w-[120px]">{loc}</span>
                          </span>
                          <span className="flex items-center gap-1 font-semibold text-midnight truncate">
                            <DollarSign className="w-3.5 h-3.5 text-moonstone shrink-0" />
                            <span>
                              {job.salary_type === 'undisclosed' || (!job.salary_min && !job.salary_max)
                                ? 'Undisclosed'
                                : job.salary_min && job.salary_max
                                ? `$${(job.salary_min / 1000).toFixed(0)}k - $${(job.salary_max / 1000).toFixed(0)}k`
                                : job.salary_min
                                ? `From $${(job.salary_min / 1000).toFixed(0)}k`
                                : 'Competitive'}
                            </span>
                          </span>
                        </div>
                      </div>

                      <div className="pt-4 mt-4 border-t border-timberwolf/40 flex items-center justify-between">
                        <span className="text-[11px] font-medium text-midnight/50">
                          {job.experience_level}
                        </span>
                        <span className="text-xs font-bold text-moonstone group-hover:text-moonstone-dark inline-flex items-center gap-0.5">
                          <span>View Role</span>
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* BOTTOM CTA BANNER (DYNAMICALLY MANAGED BY ADMIN) */}
      {/* ========================================================================= */}
      {cmsSettings?.visibility?.cta !== false && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-r from-midnight via-midnight-light to-midnight rounded-3xl p-8 sm:p-12 text-center text-aliceblue shadow-modal space-y-5">
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight max-w-2xl mx-auto leading-tight">
              {cmsSettings?.cta_title || 'Ready to experience precision consulting?'}
            </h2>
            <p className="text-sm sm:text-base text-aliceblue/80 max-w-xl mx-auto leading-relaxed">
              {cmsSettings?.cta_subtitle || 'Connect with verified specialists right now and pay strictly for the minutes you use.'}
            </p>
            <div className="pt-2">
              <Link
                to={cmsSettings?.cta_button_url || '/services'}
                className="btn-shine inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-moonstone hover:bg-moonstone-dark text-white font-bold text-sm shadow-subtle transition-all"
              >
                <span>{cmsSettings?.cta_button_label || 'Get Started Today'}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

    </div>
  );
};
