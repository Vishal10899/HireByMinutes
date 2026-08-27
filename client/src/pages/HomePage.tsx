import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Service, Category } from '../types';
import { ExpertCard } from '../components/common/ExpertCard';
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
  ArrowUpRight
} from 'lucide-react';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [featuredServices, setFeaturedServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadHomeData() {
      try {
        const [servicesRes, categoriesRes] = await Promise.all([
          api.getFeaturedServices(),
          api.getCategories()
        ]);
        setFeaturedServices(servicesRes.services || []);
        setCategories(categoriesRes.categories || []);
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
      case 'Code2': return <Code2 className="w-4 h-4" />;
      case 'Cpu': return <Cpu className="w-4 h-4" />;
      case 'Palette': return <Palette className="w-4 h-4" />;
      case 'Megaphone': return <Megaphone className="w-4 h-4" />;
      case 'Briefcase': return <Briefcase className="w-4 h-4" />;
      case 'DollarSign': return <DollarSign className="w-4 h-4" />;
      case 'Scale': return <Scale className="w-4 h-4" />;
      case 'GraduationCap': return <GraduationCap className="w-4 h-4" />;
      default: return <Sparkles className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-20 sm:space-y-28 pb-16">
      
      {/* ========================================================================= */}
      {/* HERO SECTION — THE TWO CHOICES */}
      {/* ========================================================================= */}
      <section className="pt-10 sm:pt-16 max-w-5xl mx-auto px-4 sm:px-6 text-center">
        
        <h1 className="text-3xl sm:text-5xl font-extrabold text-midnight tracking-tight max-w-2xl mx-auto leading-tight">
          What brings you here?
        </h1>
        
        <p className="mt-4 text-base sm:text-lg text-midnight/70 max-w-xl mx-auto leading-relaxed">
          Hire expertise by the minute, or turn your expertise into a service people can book.
        </p>

        {/* The Two Distinct Intent Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-10 text-left">
          
          {/* Card 1: Need a service (Client) */}
          <div className="water-surface-card bg-lightblue/30 border border-lightblue rounded-2xl p-7 sm:p-8 flex flex-col justify-between hover:bg-lightblue/45 transition-all shadow-subtle group">
            <div>
              <div className="w-10 h-10 rounded-xl bg-lightblue/80 flex items-center justify-center text-midnight mb-5">
                <Search className="w-5 h-5 text-midnight" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-midnight mb-2">
                I need a service
              </h2>
              <p className="text-sm text-midnight/75 leading-relaxed mb-6">
                Find someone who knows exactly what you need and hire them for the precise minutes you require.
              </p>
            </div>
            <div>
              <Link
                to="/services"
                className="btn-shine inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-midnight text-aliceblue font-semibold text-sm hover:bg-midnight-hover transition-all shadow-subtle cursor-pointer"
              >
                <span>Find an Expert</span>
                <ArrowRight className="w-4 h-4 text-moonstone" />
              </Link>
            </div>
          </div>

          {/* Card 2: Provide a service (Provider) */}
          <div className="water-surface-card bg-midnight border border-midnight rounded-2xl p-7 sm:p-8 flex flex-col justify-between text-aliceblue hover:bg-midnight-light transition-all shadow-card group">
            <div>
              <div className="w-10 h-10 rounded-xl bg-midnight-light flex items-center justify-center text-moonstone mb-5">
                <Clock className="w-5 h-5 text-moonstone" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-aliceblue mb-2">
                I provide a service
              </h2>
              <p className="text-sm text-aliceblue/80 leading-relaxed mb-6">
                Share what you know and get hired on your time. No long proposals, retainers, or timesheets.
              </p>
            </div>
            <div>
              <Link
                to="/provider/onboard"
                className="btn-shine inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-moonstone text-white font-semibold text-sm hover:bg-moonstone-hover transition-all shadow-subtle cursor-pointer"
              >
                <span>Become a Service Provider</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

        </div>

        {/* ========================================================================= */}
        {/* SEARCH BAR SECTION */}
        {/* ========================================================================= */}
        <div className="mt-12 max-w-3xl mx-auto">
          <form onSubmit={handleSearchSubmit} className="relative">
            <div className="flex items-center bg-white border-2 border-timberwolf rounded-2xl shadow-subtle p-2 focus-within:border-moonstone transition-all">
              <Search className="w-5 h-5 text-midnight/40 ml-3 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for an expert, skill or service (e.g. Python, Figma, RAG, Tax, Copywriting)..."
                className="w-full px-3 py-2 text-sm text-midnight placeholder:text-midnight/40 bg-transparent focus:outline-none"
              />
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-midnight text-aliceblue text-sm font-semibold hover:bg-midnight-hover shrink-0 transition-colors cursor-pointer"
              >
                Search
              </button>
            </div>
          </form>

          {/* Search quick suggestions */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4 text-xs text-midnight/70">
            <span className="text-midnight/50 font-medium">Popular:</span>
            {['Python developer', 'Figma teardown', 'RAG architect', 'B2B growth audit', 'Tax advisor'].map((tag) => (
              <button
                key={tag}
                onClick={() => navigate(`/services?search=${encodeURIComponent(tag)}`)}
                className="px-2.5 py-1 rounded-full bg-white/80 border border-timberwolf/60 hover:border-moonstone hover:text-midnight transition-colors cursor-pointer"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

      </section>

      {/* ========================================================================= */}
      {/* POPULAR CATEGORIES */}
      {/* ========================================================================= */}
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

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {categories.slice(0, 11).map((cat) => (
            <Link
              key={cat.id}
              to={`/services?category=${cat.slug}`}
              className="water-surface-card bg-white/90 hover:bg-white border border-timberwolf/60 hover:border-moonstone/60 rounded-xl p-4 flex flex-col items-start gap-2.5 transition-all shadow-subtle group"
            >
              <div className="w-8 h-8 rounded-lg bg-aliceblue flex items-center justify-center text-midnight group-hover:text-moonstone transition-colors">
                {getCategoryIcon(cat.icon)}
              </div>
              <span className="font-semibold text-xs sm:text-sm text-midnight group-hover:text-moonstone transition-colors">
                {cat.name}
              </span>
            </Link>
          ))}

          <Link
            to="/services"
            className="water-surface-card bg-lightblue/30 hover:bg-lightblue/50 border border-lightblue rounded-xl p-4 flex flex-col items-center justify-center text-center gap-1 transition-all group"
          >
            <span className="font-bold text-xs sm:text-sm text-midnight group-hover:text-moonstone">
              View All
            </span>
            <span className="text-[11px] text-midnight/60">
              {categories.length}+ Categories
            </span>
          </Link>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* FEATURED EXPERTS SECTION */}
      {/* ========================================================================= */}
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

      {/* ========================================================================= */}
      {/* HOW HIREBYMINUTES WORKS (4 CLEAN STEPS) */}
      {/* ========================================================================= */}
      <section id="how-it-works" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-8 sm:p-12 shadow-subtle">
          <div className="text-center max-w-xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-wider text-moonstone">
              Simple & Transparent
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-midnight mt-1.5">
              How HireByMinutes works
            </h2>
            <p className="text-sm text-midnight/70 mt-2">
              From finding the right person to finishing your timed consultation in four easy steps.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            
            {/* Step 1 */}
            <div className="space-y-3">
              <span className="text-xs font-mono font-bold text-moonstone bg-aliceblue px-2.5 py-1 rounded-md border border-timberwolf/30">
                01 — Find
              </span>
              <h3 className="font-bold text-base text-midnight">Find an Expert</h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                Find someone who knows exactly what you need without wading through bloated project agencies.
              </p>
            </div>

            {/* Step 2 */}
            <div className="space-y-3">
              <span className="text-xs font-mono font-bold text-moonstone bg-aliceblue px-2.5 py-1 rounded-md border border-timberwolf/30">
                02 — Book
              </span>
              <h3 className="font-bold text-base text-midnight">Choose Your Time</h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                Choose exactly how many minutes or hours you need: 15m, 30m, 45m, or custom duration.
              </p>
            </div>

            {/* Step 3 */}
            <div className="space-y-3">
              <span className="text-xs font-mono font-bold text-moonstone bg-aliceblue px-2.5 py-1 rounded-md border border-timberwolf/30">
                03 — Connect
              </span>
              <h3 className="font-bold text-base text-midnight">Live Timed Session</h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                Chat, call, video, or share files while the server-authoritative countdown clock is active.
              </p>
            </div>

            {/* Step 4 */}
            <div className="space-y-3">
              <span className="text-xs font-mono font-bold text-moonstone bg-aliceblue px-2.5 py-1 rounded-md border border-timberwolf/30">
                04 — Done
              </span>
              <h3 className="font-bold text-base text-midnight">Session Completes</h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                When time ends, communication closes naturally. No scope creep, surprise invoices, or billing disputes.
              </p>
            </div>

          </div>
        </div>
      </section>

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

    </div>
  );
};
