import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Service, Category } from '../types';
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
  X
} from 'lucide-react';

import { usePageSEO } from '../hooks/usePageSEO';

export const HomePage: React.FC = () => {
  const [seoData, setSeoData] = useState<{ site_title?: string; meta_description?: string } | null>(null);

  usePageSEO({
    title: seoData?.site_title || 'HireByMinute — Hire Experts by the Minute',
    description: seoData?.meta_description || 'Find the right expert and hire them by the minute. Get real-time help from skilled professionals and pay only for the time you need.',
    canonicalPath: '/'
  });

  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [featuredServices, setFeaturedServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cmsSettings, setCmsSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadHomeData() {
      try {
        const [servicesRes, categoriesRes, homepageRes, seoRes] = await Promise.all([
          api.getFeaturedServices(),
          api.getCategories(),
          api.getHomepageSettings().catch(() => null),
          api.getSeoSettings().catch(() => null)
        ]);
        setFeaturedServices(servicesRes?.services || []);
        setCategories(categoriesRes?.categories || []);
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
    if (searchQuery.trim()) {
      navigate(`/services?search=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate('/services');
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
            {cmsSettings?.hero_subheadline || 'Hire expertise by the minute, or turn your expertise into a service people can book.'}
          </p>

          {/* ========================================================================= */}
          {/* THE TWO INTENT CARDS — IMMEDIATE INTENT CHOICE */}
          {/* ========================================================================= */}
          {cmsSettings?.visibility?.intent_cards !== false && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 mt-7 sm:mt-9 text-left">
              
              {/* Card 1: Need a service (Client) */}
              <div className="bg-lightblue/35 border-2 border-lightblue/90 hover:border-moonstone/70 rounded-[22px] p-6 shadow-subtle flex flex-col justify-between transition-all duration-150">
                <div>
                  <div className="w-11 h-11 rounded-xl bg-white/90 border border-lightblue/80 text-midnight flex items-center justify-center mb-5 shrink-0 shadow-xs">
                    <Search className="w-5 h-5 text-midnight" />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-midnight tracking-tight mb-2">
                    {cmsSettings?.intent_client_title || 'I need a service'}
                  </h2>
                  <p className="text-sm text-midnight/75 leading-relaxed">
                    {cmsSettings?.intent_client_desc || 'Find someone who knows exactly what you need and hire them for the precise minutes you require.'}
                  </p>
                </div>
                <div className="mt-6 pt-1">
                  <Button
                    to={cmsSettings?.primary_cta_url || '/services'}
                    variant="primary"
                    size="md"
                    className="w-auto min-w-[170px] max-w-[220px]"
                    iconRight={<ArrowRight className="w-4 h-4 text-moonstone" />}
                  >
                    {cmsSettings?.intent_client_button || cmsSettings?.primary_cta_label || 'Find an Expert'}
                  </Button>
                </div>
              </div>

              {/* Card 2: Provide a service (Provider) */}
              <div className="bg-midnight border border-midnight text-aliceblue rounded-[22px] p-6 shadow-card flex flex-col justify-between transition-all duration-150">
                <div>
                  <div className="w-11 h-11 rounded-xl bg-midnight-light border border-white/10 text-moonstone flex items-center justify-center mb-5 shrink-0">
                    <Clock className="w-5 h-5 text-moonstone" />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-aliceblue tracking-tight mb-2">
                    {cmsSettings?.intent_provider_title || 'I provide a service'}
                  </h2>
                  <p className="text-sm text-aliceblue/80 leading-relaxed">
                    {cmsSettings?.intent_provider_desc || 'Share what you know and get hired by the minute.'}
                  </p>
                </div>
                <div className="mt-6 pt-1">
                  <Button
                    to={cmsSettings?.secondary_cta_url || '/provider/onboard'}
                    variant="accent"
                    size="md"
                    className="w-auto min-w-[190px] max-w-[240px]"
                  >
                    {cmsSettings?.intent_provider_button || cmsSettings?.secondary_cta_label || 'Become a Service Provider'}
                  </Button>
                </div>
              </div>

            </div>
          )}

          {/* ========================================================================= */}
          {/* SEARCH BAR SECTION — MOVED AFTER INTENT CARDS */}
          {/* ========================================================================= */}
          {cmsSettings?.visibility?.search !== false && (
            <div className="mt-8 sm:mt-10 max-w-3xl mx-auto">
              <form onSubmit={handleSearchSubmit} className="relative w-full">
                <div className="flex items-center bg-white border-2 border-timberwolf/90 rounded-2xl shadow-subtle p-1.5 sm:p-2 focus-within:border-moonstone focus-within:shadow-card transition-all">
                  <Search className="w-5 h-5 text-midnight/50 ml-3 shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={cmsSettings?.search_placeholder || "Search experts, skills, or services..."}
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
