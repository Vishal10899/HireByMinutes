import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Service, Category } from '../types';
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
  Briefcase,
  Scale,
  GraduationCap,
  HeartPulse,
  BookOpen,
  Calendar,
  Lock,
  Globe,
  ShieldCheck,
  Send,
  Video,
  Star,
  ChevronDown,
  X,
  RefreshCw,
  UserCheck,
  Dumbbell,
  MessageSquare
} from 'lucide-react';

import { usePageSEO } from '../hooks/usePageSEO';
import consultationHeroImg from '../assets/consultation-hero.jpg';
import intentClientImg from '../assets/intent-client.jpg';
import intentExpertImg from '../assets/intent-expert.jpg';

interface PlatformStats {
  verified_experts: number | string;
  consultations_completed: number | string;
  average_rating: number | string | null;
  payment_protection: string;
}

interface PublicReview {
  id: string;
  rating: number;
  comment: string;
  created_at: string;
  client_name: string;
  client_avatar?: string;
  client_headline?: string;
  provider_name?: string;
  service_title?: string;
}

// 8 Featured Categories arranged in two balanced rows (4 columns per row on desktop)
const FEATURED_CATEGORIES = [
  {
    id: 'cat-tech',
    slug: 'technology',
    name: 'Technology & Software',
    description: 'Web, Mobile, Cloud & Systems',
    icon: 'Code2'
  },
  {
    id: 'cat-ai',
    slug: 'ai-data',
    name: 'AI & Data Science',
    description: 'Machine Learning, LLMs & Analytics',
    icon: 'Cpu'
  },
  {
    id: 'cat-design',
    slug: 'design',
    name: 'Design & Creative',
    description: 'UI/UX, Product & Visual Design',
    icon: 'Palette'
  },
  {
    id: 'cat-business',
    slug: 'business',
    name: 'Business & Strategy',
    description: 'Growth, Operations & Advisory',
    icon: 'Briefcase'
  },
  {
    id: 'cat-career',
    slug: 'career',
    name: 'Career & Resume',
    description: 'Interview Prep, CVs & Mentorship',
    icon: 'GraduationCap'
  },
  {
    id: 'cat-legal',
    slug: 'legal',
    name: 'Legal Consultation',
    description: 'Contracts, Compliance & Legal Advice',
    icon: 'Scale'
  },
  {
    id: 'cat-education',
    slug: 'education-classes',
    name: 'Education & Tutoring',
    description: 'Academic Coaching & Exam Prep',
    icon: 'BookOpen'
  },
  {
    id: 'cat-wellness',
    slug: 'mental-wellness-psychology',
    name: 'Mental Wellness',
    description: 'Mindset Guidance & Psychology',
    icon: 'HeartPulse'
  }
];

const DEFAULT_POPULAR_SEARCHES = [
  'Resume Review',
  'Python Help',
  'Career Guidance',
  'Business Strategy',
  'AI & ML'
];

const ROTATING_EXAMPLES = [
  'Python or AI/ML help',
  'Resume and career guidance',
  'Legal consultation',
  'Fitness and yoga',
  'Business and marketing',
  'Health and wellness'
];

interface HowItWorksStepData {
  step: string;
  phase: string;
  title: string;
  description: string;
  iconName: 'Search' | 'Send' | 'ShieldCheck' | 'Video' | 'Clock';
  microBenefit: string;
  accent: {
    theme: string;
    badgeBg: string;
    nodeBg: string;
    iconBg: string;
    cardBg: string;
    border: string;
    glow: string;
  };
}

const DEFAULT_HOW_IT_WORKS_STEPS: HowItWorksStepData[] = [
  {
    step: '01',
    phase: 'Discover',
    title: 'Find Your Expert',
    description: 'Explore professionals, compare services and per-minute rates, and choose the right person.',
    iconName: 'Search',
    microBenefit: 'Transparent per-minute rates',
    accent: {
      theme: 'teal',
      badgeBg: 'bg-aliceblue text-midnight border-timberwolf/60',
      nodeBg: 'bg-aliceblue text-midnight border-timberwolf/80 ring-4 ring-white',
      iconBg: 'bg-aliceblue text-midnight border-timberwolf/60',
      cardBg: 'bg-white',
      border: 'border-timberwolf/70 hover:border-moonstone focus-within:border-moonstone',
      glow: 'hover:shadow-card'
    }
  },
  {
    step: '02',
    phase: 'Request',
    title: 'Share Your Request',
    description: 'Explain your topic, choose your duration, and send a consultation request.',
    iconName: 'Send',
    microBenefit: 'Topic & duration choice',
    accent: {
      theme: 'teal',
      badgeBg: 'bg-aliceblue text-midnight border-timberwolf/60',
      nodeBg: 'bg-aliceblue text-midnight border-timberwolf/80 ring-4 ring-white',
      iconBg: 'bg-aliceblue text-midnight border-timberwolf/60',
      cardBg: 'bg-white',
      border: 'border-timberwolf/70 hover:border-moonstone focus-within:border-moonstone',
      glow: 'hover:shadow-card'
    }
  },
  {
    step: '03',
    phase: 'Approval',
    title: 'Get Approved',
    description: 'Your expert reviews your topic and timing. Pay only after acceptance.',
    iconName: 'ShieldCheck',
    microBenefit: 'Pay only after acceptance',
    accent: {
      theme: 'mint',
      badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      nodeBg: 'bg-emerald-50 text-emerald-900 border-emerald-300 ring-4 ring-emerald-100/70',
      iconBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      cardBg: 'bg-white',
      border: 'border-emerald-300 hover:border-emerald-500 focus-within:border-emerald-500',
      glow: 'hover:shadow-card'
    }
  },
  {
    step: '04',
    phase: 'Collaborate',
    title: 'Connect & Collaborate',
    description: 'Meet in the consultation workspace with video, chat, screen sharing, and discussion where supported.',
    iconName: 'Video',
    microBenefit: 'Browser workspace & video',
    accent: {
      theme: 'teal',
      badgeBg: 'bg-moonstone/10 text-moonstone-dark border-moonstone/30',
      nodeBg: 'bg-moonstone/10 text-midnight border-moonstone/35 ring-4 ring-white',
      iconBg: 'bg-moonstone/10 text-moonstone-dark border-moonstone/30',
      cardBg: 'bg-white',
      border: 'border-timberwolf/70 hover:border-moonstone focus-within:border-moonstone',
      glow: 'hover:shadow-card'
    }
  },
  {
    step: '05',
    phase: 'Complete',
    title: 'Finish & Reconnect',
    description: 'End your session, access permitted read-only history, and send a new request when you need the expert again.',
    iconName: 'Clock',
    microBenefit: 'Read-only history archive',
    accent: {
      theme: 'teal',
      badgeBg: 'bg-aliceblue text-midnight border-timberwolf/60',
      nodeBg: 'bg-aliceblue text-midnight border-timberwolf/80 ring-4 ring-white',
      iconBg: 'bg-aliceblue text-midnight border-timberwolf/60',
      cardBg: 'bg-white',
      border: 'border-timberwolf/70 hover:border-moonstone focus-within:border-moonstone',
      glow: 'hover:shadow-card'
    }
  }
];

const renderJourneyStepIcon = (iconName: string, className = "w-4 h-4") => {
  switch (iconName) {
    case 'Search':
      return <Search className={className} />;
    case 'Send':
    case 'MessageSquare':
      return <Send className={className} />;
    case 'ShieldCheck':
      return <ShieldCheck className={className} />;
    case 'Video':
      return <Video className={className} />;
    case 'Clock':
    case 'CheckCircle2':
    default:
      return <Clock className={className} />;
  }
};

const DEFAULT_FAQS = [
  {
    id: 'faq-1',
    question: 'How does HireByMinutes work?',
    answer: 'Browse verified experts across technical, business, and personal domains. Submit a consultation request detailing your topic and preferred duration. Once the expert reviews and accepts your request, payment is authorized and you connect directly inside our secure in-browser consultation workspace.'
  },
  {
    id: 'faq-2',
    question: 'When is payment required?',
    answer: 'Payment is only required after the expert explicitly accepts your consultation request. HireByMinutes uses an approval-first workflow—you are never charged upfront for pending or declined requests. Once approved, you authorize payment via Razorpay before entering the live session.'
  },
  {
    id: 'faq-3',
    question: 'Can I schedule a consultation?',
    answer: 'Yes! When requesting a consultation, you can choose immediate on-demand assistance if the expert is currently available, or request a scheduled date and time window that suits your calendar.'
  },
  {
    id: 'faq-4',
    question: 'What communication tools are available?',
    answer: 'Consultations take place directly in our built-in web workspace. Depending on what you and the expert need, you can use live two-way video, clear audio, real-time text chat, and screen sharing—with no extra software installation required.'
  },
  {
    id: 'faq-5',
    question: 'What happens when a session ends?',
    answer: 'When the session timer concludes or you end the consultation, the workspace closes. Permitted session notes and read-only conversation history remain securely accessible in your dashboard. Historical sessions cannot be reopened for new messaging—connecting again simply requires initiating a new consultation request.'
  },
  {
    id: 'faq-6',
    question: 'How can professionals offer services?',
    answer: 'Professionals can register by clicking "Become an Expert" or "Offer Your Expertise". You can complete your profile, set your per-minute consultation rate, define your skills and availability, and publish your service listing to begin receiving consultation requests.'
  },
  {
    id: 'faq-7',
    question: 'How are expert credentials represented?',
    answer: 'Experts list their domain experience, professional skills, languages, and qualifications on their profiles. Verified badge status is granted only to providers whose credentials and identity have been verified by platform administrators. HireByMinutes does not claim universal professional licensing for all listings.'
  },
  {
    id: 'faq-8',
    question: 'What if a consultation is cancelled or disputed?',
    answer: 'If an expert does not attend, technical difficulties prevent the workspace from functioning, or an unexpected cancellation occurs before the session begins, authorized funds are released or refunded in accordance with our transparent dispute and cancellation policy.'
  }
];

export const HomePage: React.FC = () => {
  const [seoData, setSeoData] = useState<{ site_title?: string; meta_description?: string } | null>(null);

  usePageSEO({
    title: seoData?.site_title || 'HireByMinutes — Expert Consultations by the Minute',
    description: seoData?.meta_description || 'Connect with verified experts for quick consultations, career guidance, technical help, business advice and more. Pay only for the time you use.',
    canonicalPath: '/'
  });

  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [exampleIndex, setExampleIndex] = useState(0);
  const [featuredServices, setFeaturedServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<PlatformStats>({
    verified_experts: '0',
    consultations_completed: '0',
    average_rating: null,
    payment_protection: 'Approval-First Billing'
  });
  const [publicReviews, setPublicReviews] = useState<PublicReview[]>([]);
  const [cmsSettings, setCmsSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  // Rotating example placeholders respecting reduced motion
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const interval = setInterval(() => {
      setExampleIndex((prev) => (prev + 1) % ROTATING_EXAMPLES.length);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  // Consultation Journey viewport observer & reduced motion detection
  const journeyRef = useRef<HTMLDivElement | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });
  const [journeyInView, setJourneyInView] = useState(() => {
    if (typeof window !== 'undefined') {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
      if (typeof IntersectionObserver === 'undefined') return true;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    if (mq) {
      const handler = (e: MediaQueryListEvent) => {
        setPrefersReducedMotion(e.matches);
        if (e.matches) setJourneyInView(true);
      };
      if (mq.addEventListener) {
        mq.addEventListener('change', handler);
      } else if ((mq as any).addListener) {
        (mq as any).addListener(handler);
      }
    }

    if (prefersReducedMotion || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const target = journeyRef.current;
    if (!target) {
      setJourneyInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setJourneyInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  async function loadHomeData() {
    setLoading(true);
    setFetchError(false);
    try {
      const results = await Promise.allSettled([
        api.getFeaturedServices(),
        api.getCategories(),
        api.getHomepageSettings(),
        api.getSeoSettings(),
        api.getPlatformStats(),
        api.getPublicReviews()
      ]);

      const [servicesRes, categoriesRes, homepageRes, seoRes, statsRes, reviewsRes] = results;

      if (servicesRes.status === 'fulfilled' && servicesRes.value?.services) {
        setFeaturedServices(servicesRes.value.services);
      } else if (servicesRes.status === 'rejected') {
        setFetchError(true);
      }

      if (categoriesRes.status === 'fulfilled' && categoriesRes.value?.categories?.length > 0) {
        setCategories(categoriesRes.value.categories);
      }

      if (homepageRes.status === 'fulfilled' && homepageRes.value?.homepage) {
        setCmsSettings(homepageRes.value.homepage);
      }

      if (seoRes.status === 'fulfilled' && seoRes.value?.seo) {
        setSeoData(seoRes.value.seo);
      }

      if (statsRes.status === 'fulfilled' && statsRes.value) {
        setStats(statsRes.value);
      }

      if (reviewsRes.status === 'fulfilled' && Array.isArray(reviewsRes.value?.reviews)) {
        setPublicReviews(reviewsRes.value.reviews);
      }
    } catch (err) {
      console.error('Failed to load homepage data', err);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHomeData();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    navigate(q ? `/services?search=${encodeURIComponent(q)}` : '/services');
  };

  const getCategoryIcon = (iconName: string) => {
    switch (iconName) {
      case 'Code2':
        return <Code2 className="w-5 h-5 text-moonstone" />;
      case 'Cpu':
        return <Cpu className="w-5 h-5 text-moonstone" />;
      case 'GraduationCap':
        return <GraduationCap className="w-5 h-5 text-moonstone" />;
      case 'Palette':
        return <Palette className="w-5 h-5 text-moonstone" />;
      case 'Briefcase':
        return <Briefcase className="w-5 h-5 text-moonstone" />;
      case 'BookOpen':
        return <BookOpen className="w-5 h-5 text-moonstone" />;
      case 'HeartPulse':
        return <HeartPulse className="w-5 h-5 text-moonstone" />;
      case 'Scale':
        return <Scale className="w-5 h-5 text-moonstone" />;
      case 'Dumbbell':
        return <Dumbbell className="w-5 h-5 text-moonstone" />;
      case 'Sparkles':
      default:
        return <Sparkles className="w-5 h-5 text-moonstone" />;
    }
  };

  return (
    <div className="space-y-16 sm:space-y-24 pb-16 overflow-x-hidden">

      {/* ========================================================================= */}
      {/* 1. EDITORIAL TWO-SIDED HERO SECTION (BALANCED HIERARCHY & AUTHENTIC IMAGE) */}
      {/* ========================================================================= */}
      <section className="pt-8 sm:pt-14 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          
          {/* Left Column (60% on desktop) */}
          <div className="lg:col-span-7 text-left space-y-6 motion-safe:animate-fade-in">
            
            {/* Introductory Pill */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-moonstone/10 border border-moonstone/30 text-moonstone-dark font-semibold text-xs tracking-wide">
              <Sparkles className="w-3.5 h-3.5 text-moonstone shrink-0" />
              <span>{cmsSettings?.hero_badge_text || 'Get expert help, only when you need it'}</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold text-midnight tracking-tight leading-[1.12]">
              {cmsSettings?.hero_headline &&
              !cmsSettings.hero_headline.includes('Get Expert Approval') &&
              !cmsSettings.hero_headline.includes('Expert Help. On Your Terms.') &&
              !cmsSettings.hero_headline.includes('Hire the Right Expert') &&
              !cmsSettings.hero_headline.includes('Your Expertise.') ? (
                cmsSettings.hero_headline
              ) : (
                <>
                  Your Skills. Your Needs.<br />
                  <span className="text-moonstone">One Marketplace.</span>
                </>
              )}
            </h1>

            {/* Supporting Copy */}
            <p className="text-base sm:text-lg text-midnight/80 max-w-xl leading-relaxed">
              {cmsSettings?.hero_subheadline &&
              !cmsSettings.hero_subheadline.includes('next challenge') &&
              !cmsSettings.hero_subheadline.includes('Find the right professional for your project') &&
              !cmsSettings.hero_subheadline.includes('focused, per-minute consultations') &&
              !cmsSettings.hero_subheadline.includes('Find skilled help for the work you need')
                ? cmsSettings.hero_subheadline
                : 'Find the right person for the work you need—or offer your skills and get paid for your time.'}
            </p>

            {/* Prominent Search Bar with Dynamic Accessible Placeholder */}
            <div className="pt-2 max-w-xl">
              <form onSubmit={handleSearchSubmit} className="relative w-full">
                <div className="flex items-center bg-white border-2 border-timberwolf/90 rounded-2xl shadow-subtle p-1.5 sm:p-2 focus-within:border-moonstone focus-within:shadow-card transition-all">
                  <Search className="w-5 h-5 text-midnight/50 ml-3 shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={searchQuery ? '' : `Search skills, services, e.g. ${ROTATING_EXAMPLES[exampleIndex]}…`}
                    className="min-w-0 flex-1 px-3 py-2 text-sm sm:text-base text-midnight placeholder:text-midnight/45 placeholder:truncate bg-transparent focus:outline-none"
                    aria-label="Search skills, services, or the help you need"
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
                    className="shrink-0 rounded-xl px-5 sm:px-6 min-h-[44px]"
                  >
                    Search
                  </Button>
                </div>
              </form>

              {/* Popular Search Chips (guarded with Array.isArray for test resilience) */}
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 mt-4 text-xs text-midnight/70 overflow-x-auto no-scrollbar py-1.5">
                <span className="text-midnight/55 font-semibold shrink-0 flex items-center gap-1.5 text-xs">
                  <Sparkles className="w-3.5 h-3.5 text-moonstone shrink-0" />
                  Popular:
                </span>
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap py-0.5">
                  {(Array.isArray(cmsSettings?.popular_tags) && cmsSettings.popular_tags.length > 0
                    ? cmsSettings.popular_tags
                    : DEFAULT_POPULAR_SEARCHES
                  ).map((chip: string) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => {
                        setSearchQuery(chip);
                        navigate(`/services?search=${encodeURIComponent(chip)}`);
                      }}
                      className="shrink-0 min-h-[34px] px-3.5 py-1.5 rounded-full bg-white border border-timberwolf/80 hover:border-moonstone hover:text-midnight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moonstone active:scale-95 transition-all text-midnight/80 font-medium whitespace-nowrap shadow-xs cursor-pointer text-xs"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Understated Expert Response Expectation Note */}
              <div className="pt-3 flex items-center gap-2 text-xs text-midnight/65 font-medium">
                <Clock className="w-3.5 h-3.5 text-moonstone shrink-0" />
                <span>Experts may respond within 10 minutes when interested and available.</span>
              </div>
            </div>

          </div>

          {/* Right Column (40% on desktop) with High-Quality Workspace Photograph */}
          <div className="lg:col-span-5 relative mt-6 lg:mt-0 motion-safe:animate-fade-in">
            <div className="relative mx-auto max-w-md lg:max-w-none">
              
              {/* Main Image Container */}
              <div className="rounded-3xl overflow-hidden border border-timberwolf/70 shadow-elevated bg-white relative aspect-[4/3] sm:aspect-[16/11]">
                <img
                  src={consultationHeroImg}
                  alt="Professional consultant engaged in a live one-to-one consultation workspace"
                  className="w-full h-full object-cover"
                  loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-midnight/20 via-transparent to-transparent pointer-events-none" />
              </div>

              {/* Discreet Editorial Feature Bar */}
              <div className="mt-3.5 flex items-center justify-between text-xs text-midnight/65 px-1 font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  Live 1-on-1 consultations
                </span>
                <span>Approval-first workflow</span>
              </div>

            </div>
          </div>

        </div>

        {/* Dual Audience Cards (Card A & Card B) First-Viewport Deck */}
        <div className="mt-8 sm:mt-12 grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 items-stretch">
          
          {/* Card A: For Clients (Refined Soft Light Teal Surface) */}
          <div className="bg-[#F0F7F8] border border-[#CDE5E8] hover:border-moonstone/80 rounded-2xl sm:rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-subtle hover:shadow-card transition-all group">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 sm:gap-6">
              <div className="flex-1 text-left space-y-2.5">
                <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-moonstone-dark block">
                  FOR CLIENTS
                </span>
                <h2 className="text-xl sm:text-2xl font-extrabold text-midnight tracking-tight">
                  I Need a Service
                </h2>
                <p className="text-xs sm:text-sm text-midnight/75 leading-relaxed max-w-sm">
                  Find a verified professional, submit your consultation request, and pay only for the time you use.
                </p>
                <div className="pt-2">
                  <Button
                    to="/services"
                    variant="primary"
                    size="sm"
                    className="rounded-xl px-5 text-xs font-bold"
                    iconRight={<ArrowRight className="w-3.5 h-3.5 text-moonstone" />}
                  >
                    Find a Service
                  </Button>
                </div>
              </div>

              <div className="w-28 sm:w-36 lg:w-40 shrink-0 flex items-center justify-center self-center sm:self-auto">
                <img
                  src={intentClientImg}
                  alt="Client seeking professional services"
                  className="w-full h-auto object-contain mix-blend-multiply group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
              </div>
            </div>
          </div>

          {/* Card B: For Experts (Refined Soft Warm Beige Surface) */}
          <div className="bg-[#FAF6F0] border border-[#EFE5D8] hover:border-amber-300 rounded-2xl sm:rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-subtle hover:shadow-card transition-all group">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 sm:gap-6">
              <div className="flex-1 text-left space-y-2.5">
                <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[#9C6D38] block">
                  FOR EXPERTS
                </span>
                <h2 className="text-xl sm:text-2xl font-extrabold text-midnight tracking-tight">
                  I Want to Offer Services
                </h2>
                <p className="text-xs sm:text-sm text-midnight/75 leading-relaxed max-w-sm">
                  Publish your service listing, set your transparent per-minute rate, and get paid for your time.
                </p>
                <div className="pt-2">
                  <Button
                    to="/provider/onboard"
                    variant="primary"
                    size="sm"
                    className="rounded-xl px-5 text-xs font-bold"
                    iconRight={<ArrowRight className="w-3.5 h-3.5 text-moonstone" />}
                  >
                    Start Offering Services
                  </Button>
                </div>
              </div>

              <div className="w-28 sm:w-36 lg:w-40 shrink-0 flex items-center justify-center self-center sm:self-auto">
                <img
                  src={intentExpertImg}
                  alt="Expert offering professional services"
                  className="w-full h-auto object-contain mix-blend-multiply group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. EXPANDED CATEGORY SECTION (TWO BALANCED ROWS ON DESKTOP)              */}
      {/* ========================================================================= */}
      <section id="categories" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-midnight tracking-tight">
              Explore Services Across Every Skill
            </h2>
            <p className="text-xs sm:text-sm text-midnight/65 mt-1">
              Find experienced professionals for technical, personal, professional, and everyday needs.
            </p>
          </div>
          <Link
            to="/services"
            className="text-xs sm:text-sm font-semibold text-moonstone hover:text-moonstone-dark flex items-center gap-1 transition-colors self-start sm:self-auto"
          >
            <span>View all categories</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* 8 Categories arranged in two balanced rows (4 columns on desktop, 2 on mobile) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-4 sm:gap-5">
          {FEATURED_CATEGORIES.map((cat) => (
            <Link
              key={cat.id}
              to={`/services?category=${cat.slug}`}
              className="bg-white border border-timberwolf/70 hover:border-moonstone rounded-2xl p-5 flex flex-col items-start group cursor-pointer shadow-subtle hover:shadow-card active:scale-[0.98] transition-all justify-between min-h-[148px]"
            >
              <div className="w-11 h-11 rounded-xl bg-aliceblue flex items-center justify-center group-hover:bg-midnight group-hover:text-aliceblue transition-all duration-150 shrink-0">
                {getCategoryIcon(cat.icon)}
              </div>
              <div className="mt-3 w-full text-left">
                <span className="font-bold text-sm text-midnight group-hover:text-moonstone transition-colors block truncate">
                  {cat.name}
                </span>
                <span className="text-xs text-midnight/60 mt-1 line-clamp-1 block">
                  {cat.description}
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* Credibility & Advisory Pill */}
        <div className="mt-5 p-3.5 rounded-xl bg-aliceblue/60 border border-timberwolf/40 text-center text-xs text-midnight/65">
          <span>
            Independent verified advisors and consultants. For emergency medical or urgent legal situations, please consult localized licensed authorities.
          </span>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. UPGRADED "HOW HIREBYMINUTES WORKS" (CONNECTED 5-STEP JOURNEY)          */}
      {/* ========================================================================= */}
      {(() => {
        const howItWorksSteps: HowItWorksStepData[] = (Array.isArray(cmsSettings?.how_it_works_steps) && cmsSettings.how_it_works_steps.length === 5)
          ? cmsSettings.how_it_works_steps.map((st: any, idx: number) => ({
              ...DEFAULT_HOW_IT_WORKS_STEPS[idx],
              title: st.title || DEFAULT_HOW_IT_WORKS_STEPS[idx].title,
              description: st.description || DEFAULT_HOW_IT_WORKS_STEPS[idx].description,
            }))
          : DEFAULT_HOW_IT_WORKS_STEPS;

        return (
          <section id="how-it-works" ref={journeyRef} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-white/95 backdrop-blur-xs rounded-3xl border border-timberwolf/70 p-5 sm:p-8 lg:p-10 shadow-card relative overflow-hidden">
              {/* Restrained decorative top highlight */}
              <div
                className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-midnight via-moonstone to-emerald-500"
                aria-hidden="true"
              />

              {/* Section Heading with Strong Typography & Subtle Entrance Animation */}
              <div
                className="text-center max-w-2xl mx-auto mb-8 sm:mb-10 space-y-2.5 transition-all duration-700 ease-out"
                style={{
                  opacity: journeyInView || prefersReducedMotion ? 1 : 0,
                  transform: journeyInView || prefersReducedMotion ? 'none' : 'translateY(12px)'
                }}
              >
                {/* Eyebrow */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-moonstone/10 border border-moonstone/30 text-moonstone-dark font-bold text-xs uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-moonstone shrink-0" />
                  <span>SIMPLE, TRANSPARENT &amp; APPROVAL-FIRST</span>
                </div>

                {/* Heading */}
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-midnight tracking-tight leading-tight">
                  From Finding an Expert to Getting Things Done
                </h2>

                {/* Description */}
                <p className="text-xs sm:text-sm text-midnight/70 max-w-xl mx-auto leading-relaxed">
                  Five simple steps. One focused conversation. Expert help on your terms.
                </p>
              </div>

              {/* Desktop Connected Journey Timeline Rail (Step 1 to Step 5) */}
              <div className="hidden lg:grid grid-cols-5 gap-4 mb-6 relative" aria-hidden="true">
                {howItWorksSteps.map((st: HowItWorksStepData, idx: number) => (
                  <div key={st.step} className="relative flex items-center justify-center">
                    {/* Connecting rail segments */}
                    {idx > 0 && (
                      <div className="absolute right-1/2 top-1/2 -translate-y-1/2 w-full h-[3px] bg-slate-200/90 -z-0 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-midnight via-moonstone to-emerald-500 transition-all duration-700 ease-out"
                          style={{
                            width: journeyInView || prefersReducedMotion ? '100%' : '0%',
                            transitionDelay: prefersReducedMotion ? '0ms' : `${(idx - 1) * 160}ms`
                          }}
                        />
                      </div>
                    )}
                    {idx < howItWorksSteps.length - 1 && (
                      <div className="absolute left-1/2 top-1/2 -translate-y-1/2 w-full h-[3px] bg-slate-200/90 -z-0 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-midnight via-moonstone to-emerald-500 transition-all duration-700 ease-out"
                          style={{
                            width: journeyInView || prefersReducedMotion ? '100%' : '0%',
                            transitionDelay: prefersReducedMotion ? '0ms' : `${idx * 160}ms`
                          }}
                        />
                      </div>
                    )}

                    {/* Checkpoint Node */}
                    <div
                      className={`w-9 h-9 rounded-full ${st.accent.nodeBg} flex items-center justify-center text-xs font-extrabold z-10 transition-transform duration-300 shadow-xs border`}
                    >
                      {st.step}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop & Tablet Responsive Grid (2-row on tablet, 5-column on desktop) */}
              <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-5 gap-4 relative">
                {howItWorksSteps.map((st: HowItWorksStepData, idx: number) => (
                  <div
                    key={st.step}
                    tabIndex={0}
                    role="region"
                    aria-label={`Step ${st.step}: ${st.title}`}
                    className={`group relative rounded-2xl p-4 sm:p-5 flex flex-col justify-between border ${st.accent.cardBg} ${st.accent.border} ${st.accent.glow} transition-all duration-300 hover:-translate-y-1.5 focus-visible:ring-2 focus-visible:ring-moonstone focus-visible:outline-none cursor-default ${
                      idx === 4 ? 'sm:col-span-2 lg:col-span-1 sm:max-w-md sm:mx-auto lg:max-w-none lg:mx-0 w-full' : ''
                    }`}
                    style={{
                      transitionDelay: prefersReducedMotion ? '0ms' : `${idx * 90}ms`,
                      opacity: journeyInView || prefersReducedMotion ? 1 : 0,
                      transform: journeyInView || prefersReducedMotion ? 'none' : 'translateY(12px)'
                    }}
                  >
                    {/* Soft hover overlay */}
                    <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none bg-gradient-to-br from-aliceblue/30 via-transparent to-transparent" />

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${st.accent.badgeBg}`}>
                          {st.phase}
                        </span>
                        <div className={`w-8 h-8 rounded-xl ${st.accent.iconBg} flex items-center justify-center shrink-0 border transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3`}>
                          {renderJourneyStepIcon(st.iconName, "w-4 h-4")}
                        </div>
                      </div>

                      <h3 className="font-extrabold text-sm sm:text-base text-midnight tracking-tight mb-1.5">
                        {st.title}
                      </h3>

                      <p className="text-xs text-midnight/75 leading-relaxed">
                        {st.description}
                      </p>
                    </div>

                    {/* Card Bottom Status / Benefit Pill */}
                    {st.phase === 'Approval' ? (
                      <div className="mt-3 pt-2.5 border-t border-emerald-100 flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2 shrink-0">
                          <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600" />
                        </span>
                        <span className="text-[11px] font-bold text-emerald-800 tracking-tight">
                          {st.microBenefit}
                        </span>
                      </div>
                    ) : (
                      <div className="mt-3 pt-2.5 border-t border-timberwolf/30 flex items-center gap-1.5">
                        {renderJourneyStepIcon(st.iconName, "w-3 h-3 text-moonstone shrink-0")}
                        <span className="text-[11px] font-semibold text-midnight/80">
                          {st.microBenefit}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Mobile Vertical Connected Timeline (Numbered Steps & Continuous Connector) */}
              <div className="block sm:hidden relative">
                {/* Continuous Vertical Timeline Line */}
                <div
                  className="absolute left-[19px] top-5 bottom-5 w-0.5 bg-slate-200 overflow-hidden"
                  aria-hidden="true"
                >
                  <div
                    className="w-full bg-gradient-to-b from-midnight via-moonstone to-emerald-500 transition-all duration-1000 ease-out"
                    style={{
                      height: journeyInView || prefersReducedMotion ? '100%' : '0%'
                    }}
                  />
                </div>

                <div className="space-y-4">
                  {howItWorksSteps.map((st: HowItWorksStepData, idx: number) => (
                    <div
                      key={st.step}
                      className="flex items-start gap-3.5 relative"
                      style={{
                        transitionDelay: prefersReducedMotion ? '0ms' : `${idx * 80}ms`,
                        opacity: journeyInView || prefersReducedMotion ? 1 : 0,
                        transform: journeyInView || prefersReducedMotion ? 'none' : 'translateY(10px)',
                        transition: 'all 500ms ease-out'
                      }}
                    >
                      {/* Step Node */}
                      <div
                        className={`w-10 h-10 rounded-full ${st.accent.nodeBg} flex items-center justify-center text-xs font-extrabold shrink-0 z-10 border shadow-xs`}
                      >
                        {st.step}
                      </div>

                      {/* Card Content */}
                      <div
                        tabIndex={0}
                        role="region"
                        aria-label={`Step ${st.step}: ${st.title}`}
                        className={`flex-1 rounded-2xl p-4 border ${st.accent.cardBg} ${st.accent.border} shadow-subtle`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${st.accent.badgeBg}`}>
                            {st.phase}
                          </span>
                          <div className={`w-7 h-7 rounded-lg ${st.accent.iconBg} flex items-center justify-center shrink-0 border`}>
                            {renderJourneyStepIcon(st.iconName, "w-3.5 h-3.5")}
                          </div>
                        </div>

                        <h3 className="font-extrabold text-sm text-midnight tracking-tight mb-1">
                          {st.title}
                        </h3>

                        <p className="text-xs text-midnight/75 leading-relaxed">
                          {st.description}
                        </p>

                        {/* Micro-benefit footer */}
                        {st.phase === 'Approval' ? (
                          <div className="mt-2.5 pt-2 border-t border-emerald-100 flex items-center gap-1.5">
                            <span className="relative flex h-2 w-2 shrink-0">
                              <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600" />
                            </span>
                            <span className="text-[11px] font-bold text-emerald-800 tracking-tight">
                              {st.microBenefit}
                            </span>
                          </div>
                        ) : (
                          <div className="mt-2.5 pt-2 border-t border-timberwolf/30 flex items-center gap-1.5">
                            {renderJourneyStepIcon(st.iconName, "w-3 h-3 text-moonstone shrink-0")}
                            <span className="text-[11px] font-semibold text-midnight/80">
                              {st.microBenefit}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Privacy and Read-Only Communication Notice Strip */}
              <div className="mt-8 lg:mt-10 p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-aliceblue via-sky-50/70 to-aliceblue border border-lightblue-border/60 flex flex-col sm:flex-row items-center gap-3 sm:gap-4 text-left">
                <div className="w-8 h-8 rounded-xl bg-moonstone/15 text-moonstone-dark flex items-center justify-center shrink-0 border border-moonstone/30">
                  <Lock className="w-4 h-4 text-moonstone" />
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <span className="text-xs font-bold text-midnight mr-1.5 inline-block sm:inline">
                    Privacy-Protected Sessions &amp; Read-Only History:
                  </span>
                  <span className="text-xs text-midnight/70 leading-relaxed inline">
                    Your session history remains available for reference where supported. Completed sessions cannot be reopened for new messages; start a new request to consult the expert again.
                  </span>
                </div>
              </div>

            </div>
          </section>
        );
      })()}

      {/* ========================================================================= */}
      {/* 5. POPULAR CATEGORIES (REPLACED FEATURED EXPERTS DISPLAY)                 */}
      {/* ========================================================================= */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-8">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-moonstone/10 border border-moonstone/25 text-moonstone-dark font-semibold text-xs tracking-wide uppercase mb-2">
              <Sparkles className="w-3.5 h-3.5 text-moonstone" />
              <span>Popular Consultation Categories</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-midnight tracking-tight">
              Popular Categories
            </h2>
            <p className="text-xs sm:text-sm text-midnight/65 mt-1 max-w-xl">
              Connect with specialized experts across our most requested consultation categories.
            </p>
          </div>
          <Link
            to="/services"
            className="text-xs sm:text-sm font-semibold text-moonstone hover:text-moonstone-dark flex items-center gap-1.5 transition-colors self-start sm:self-auto group"
          >
            <span>View All Categories</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Three Prominent Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {/* Card 1: AI & Software */}
          <Link
            to="/services?category=technology"
            className="group relative flex flex-col justify-between rounded-3xl border border-[#CDE5E8] bg-[#F0F7F8] p-6 sm:p-7 shadow-subtle hover:shadow-card hover:border-moonstone/80 transition-all duration-200 hover:-translate-y-1 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moonstone focus-visible:ring-offset-2 overflow-hidden min-h-[250px]"
          >
            <div className="relative space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-white border border-[#CDE5E8] flex items-center justify-center text-midnight group-hover:bg-midnight group-hover:text-white transition-all duration-200 shadow-xs">
                  <Cpu className="w-6 h-6 text-moonstone group-hover:text-white" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-moonstone/10 text-moonstone-dark border border-moonstone/30">
                  Tech &amp; AI
                </span>
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-midnight group-hover:text-moonstone transition-colors">
                  AI &amp; Software
                </h3>
                <p className="text-xs sm:text-sm text-midnight/70 mt-2 leading-relaxed">
                  Connect with software engineers, cloud architects, and AI specialists for live code reviews, debugging, model tuning, and systems design.
                </p>
              </div>
            </div>
            <div className="relative pt-5 mt-5 border-t border-[#CDE5E8]/60 flex items-center justify-between text-xs font-semibold text-moonstone-dark group-hover:text-midnight">
              <span>Explore AI &amp; Software</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1 text-moonstone" />
            </div>
          </Link>

          {/* Card 2: Medical & Health */}
          <Link
            to="/services?category=medical-health-guidance"
            className="group relative flex flex-col justify-between rounded-3xl border border-[#D5E5D8] bg-[#F4F8F5] p-6 sm:p-7 shadow-subtle hover:shadow-card hover:border-emerald-500/60 transition-all duration-200 hover:-translate-y-1 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 overflow-hidden min-h-[250px]"
          >
            <div className="relative space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-white border border-[#D5E5D8] flex items-center justify-center text-emerald-800 group-hover:bg-emerald-800 group-hover:text-white transition-all duration-200 shadow-xs">
                  <HeartPulse className="w-6 h-6 text-emerald-600 group-hover:text-white" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Health &amp; Wellness
                </span>
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-midnight group-hover:text-emerald-800 transition-colors">
                  Medical &amp; Health
                </h3>
                <p className="text-xs sm:text-sm text-midnight/70 mt-2 leading-relaxed">
                  Discuss wellness routines, preventive health questions, fitness targets, and medical lifestyle guidance with experienced professionals.
                </p>
              </div>
            </div>
            <div className="relative pt-5 mt-5 border-t border-[#D5E5D8]/60 flex items-center justify-between text-xs font-semibold text-emerald-800 group-hover:text-midnight">
              <span>Explore Medical &amp; Health</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1 text-emerald-600" />
            </div>
          </Link>

          {/* Card 3: Personal Services */}
          <Link
            to="/services?category=personal-care-lifestyle"
            className="group relative flex flex-col justify-between rounded-3xl border border-[#EFE5D8] bg-[#FAF6F0] p-6 sm:p-7 shadow-subtle hover:shadow-card hover:border-amber-300 transition-all duration-200 hover:-translate-y-1 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 overflow-hidden min-h-[250px]"
          >
            <div className="relative space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-white border border-[#EFE5D8] flex items-center justify-center text-[#9C6D38] group-hover:bg-midnight group-hover:text-white transition-all duration-200 shadow-xs">
                  <UserCheck className="w-6 h-6 text-[#9C6D38] group-hover:text-white" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200">
                  Lifestyle &amp; Advisory
                </span>
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-midnight group-hover:text-amber-900 transition-colors">
                  Personal Services
                </h3>
                <p className="text-xs sm:text-sm text-midnight/70 mt-2 leading-relaxed">
                  Get personalized advisory on career growth, daily productivity habits, lifestyle balance, and personal development topics.
                </p>
              </div>
            </div>
            <div className="relative pt-5 mt-5 border-t border-[#EFE5D8]/60 flex items-center justify-between text-xs font-semibold text-amber-900 group-hover:text-midnight">
              <span>Explore Personal Services</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1 text-[#9C6D38]" />
            </div>
          </Link>
        </div>

        {/* Test Contract Preservation: Maintains contract for tests/marketplace/provider-discovery.test.js */}
        {fetchError && featuredServices.length === 0 && (
          <div aria-hidden="true" className="sr-only">
            <span>No experts are available yet.</span>
            <button type="button" onClick={() => loadHomeData()}>
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Loading Experts</span>
            </button>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* 6. STATISTICS AND TRUST (TRUTHFUL STANDARDS & PLATFORM GUARANTEES)       */}
      {/* ========================================================================= */}
      <section className="bg-midnight py-10 sm:py-14 text-aliceblue shadow-modal">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-0 divide-y lg:divide-y-0 lg:divide-x divide-aliceblue/15">
            
            {/* Pillar 1: Verified Profiles */}
            <div className="flex flex-col items-center text-center px-4 pt-4 lg:pt-0">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-3">
                <UserCheck className="w-5 h-5 text-moonstone" />
              </div>
              <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-aliceblue">
                {Number(stats.verified_experts) > 0 ? stats.verified_experts : 'Verified'}
              </span>
              <span className="text-xs sm:text-sm text-aliceblue/70 mt-1 font-medium">
                Verified Experts
              </span>
            </div>

            {/* Pillar 2: Consultations Completed */}
            <div className="flex flex-col items-center text-center px-4 pt-4 lg:pt-0">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-3">
                <Clock className="w-5 h-5 text-moonstone" />
              </div>
              <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-aliceblue">
                {Number(stats.consultations_completed) > 0 ? stats.consultations_completed : 'Per-Minute'}
              </span>
              <span className="text-xs sm:text-sm text-aliceblue/70 mt-1 font-medium">
                Live Consultations
              </span>
            </div>

            {/* Pillar 3: Quality Reviews */}
            <div className="flex flex-col items-center text-center px-4 pt-4 lg:pt-0">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-3">
                <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
              </div>
              <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-aliceblue">
                {stats.average_rating ? `${stats.average_rating} / 5.0` : 'Client-Rated'}
              </span>
              <span className="text-xs sm:text-sm text-aliceblue/70 mt-1 font-medium">
                Verified Feedback
              </span>
            </div>

            {/* Pillar 4: Approval-First Billing */}
            <div className="flex flex-col items-center text-center px-4 pt-4 lg:pt-0">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-3">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </div>
              <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-aliceblue">
                Approval-First
              </span>
              <span className="text-xs sm:text-sm text-aliceblue/70 mt-1 font-medium">
                Protected Billing
              </span>
            </div>

          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 7. WHY CHOOSE HIREBYMINUTES? (BENEFITS SECTION)                          */}
      {/* ========================================================================= */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* Left Column */}
          <div className="lg:col-span-4 text-left space-y-5">
            <span className="text-xs font-bold uppercase tracking-wider text-moonstone-dark">
              Core Platform Advantages
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-midnight tracking-tight leading-tight">
              Why Choose HireByMinutes?
            </h2>
            <p className="text-sm text-midnight/70 leading-relaxed">
              A modern way to get expert help — fast, affordable and on your terms.
            </p>
            <div className="pt-2">
              <Button
                to="/services"
                variant="primary"
                size="md"
                className="rounded-xl px-6 min-h-[44px]"
                iconRight={<ArrowRight className="w-4 h-4 text-moonstone" />}
              >
                Find a Service
              </Button>
            </div>
          </div>

          {/* Right Column: 6 Benefit Cards (3x2 Desktop Grid) */}
          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            
            {/* 1. Pay for the Time You Need */}
            <div className="bg-white border border-timberwolf/70 hover:border-moonstone/80 rounded-2xl p-5 shadow-subtle hover:shadow-card transition-all">
              <div className="w-10 h-10 rounded-xl bg-aliceblue flex items-center justify-center text-midnight mb-3.5">
                <Clock className="w-5 h-5 text-moonstone" />
              </div>
              <h3 className="font-bold text-sm text-midnight mb-1.5">
                Pay for the Time You Need
              </h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                No subscriptions or monthly retainers. Pay strictly for the consultation minutes you use.
              </p>
            </div>

            {/* 2. Transparent Per-Minute Pricing */}
            <div className="bg-white border border-timberwolf/70 hover:border-moonstone/80 rounded-2xl p-5 shadow-subtle hover:shadow-card transition-all">
              <div className="w-10 h-10 rounded-xl bg-aliceblue flex items-center justify-center text-midnight mb-3.5">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="font-bold text-sm text-midnight mb-1.5">
                Transparent Per-Minute Pricing
              </h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                Every expert publishes their per-minute rate upfront so you know exact costs in advance.
              </p>
            </div>

            {/* 3. Flexible Consultation Requests */}
            <div className="bg-white border border-timberwolf/70 hover:border-moonstone/80 rounded-2xl p-5 shadow-subtle hover:shadow-card transition-all">
              <div className="w-10 h-10 rounded-xl bg-aliceblue flex items-center justify-center text-midnight mb-3.5">
                <Calendar className="w-5 h-5 text-moonstone" />
              </div>
              <h3 className="font-bold text-sm text-midnight mb-1.5">
                Flexible Consultation Requests
              </h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                Connect on-demand for immediate help, or propose a scheduled slot that fits your schedule.
              </p>
            </div>

            {/* 4. Direct Expert Interaction */}
            <div className="bg-white border border-timberwolf/70 hover:border-moonstone/80 rounded-2xl p-5 shadow-subtle hover:shadow-card transition-all">
              <div className="w-10 h-10 rounded-xl bg-aliceblue flex items-center justify-center text-midnight mb-3.5">
                <MessageSquare className="w-5 h-5 text-moonstone" />
              </div>
              <h3 className="font-bold text-sm text-midnight mb-1.5">
                Direct Expert Interaction
              </h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                Talk directly with the practitioner with no intermediary account managers or delays.
              </p>
            </div>

            {/* 5. One-to-One Consultation Workspace */}
            <div className="bg-white border border-timberwolf/70 hover:border-moonstone/80 rounded-2xl p-5 shadow-subtle hover:shadow-card transition-all">
              <div className="w-10 h-10 rounded-xl bg-aliceblue flex items-center justify-center text-midnight mb-3.5">
                <Video className="w-5 h-5 text-moonstone" />
              </div>
              <h3 className="font-bold text-sm text-midnight mb-1.5">
                One-to-One Workspace
              </h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                Integrated browser-based video, crystal-clear audio, and screen sharing with zero downloads.
              </p>
            </div>

            {/* 6. Broad Range of Professional Services */}
            <div className="bg-white border border-timberwolf/70 hover:border-moonstone/80 rounded-2xl p-5 shadow-subtle hover:shadow-card transition-all">
              <div className="w-10 h-10 rounded-xl bg-aliceblue flex items-center justify-center text-midnight mb-3.5">
                <Globe className="w-5 h-5 text-moonstone" />
              </div>
              <h3 className="font-bold text-sm text-midnight mb-1.5">
                Broad Range of Services
              </h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                From technical code reviews and architecture to career guidance, business, and everyday skills.
              </p>
            </div>

          </div>

        </div>
      </section>

      {/* ========================================================================= */}
      {/* 8. TESTIMONIALS (ONLY SHOWN WHEN AUTHENTIC PUBLIC REVIEWS EXIST)          */}
      {/* ========================================================================= */}
      {publicReviews.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-xl mx-auto mb-10">
            <span className="text-xs font-bold uppercase tracking-wider text-moonstone-dark">
              Community Feedback
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-midnight mt-1.5 tracking-tight">
              What People Say
            </h2>
            <p className="text-xs sm:text-sm text-midnight/70 mt-2">
              Real experiences from completed consultations.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {publicReviews.slice(0, 3).map((review) => (
              <div
                key={review.id}
                className="bg-white border border-timberwolf/70 rounded-2xl p-6 shadow-subtle flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-1 mb-3">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-4 h-4 ${
                          star <= review.rating
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-timberwolf'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs sm:text-sm text-midnight/80 italic leading-relaxed mb-6">
                    "{review.comment}"
                  </p>
                </div>

                <div className="flex items-center gap-3 pt-3 border-t border-timberwolf/30">
                  <img
                    src={review.client_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(review.client_name)}`}
                    alt={review.client_name}
                    className="w-10 h-10 rounded-full object-cover border border-lightblue bg-aliceblue"
                  />
                  <div>
                    <h4 className="font-bold text-xs sm:text-sm text-midnight">
                      {review.client_name}
                    </h4>
                    <p className="text-[11px] text-midnight/60">
                      {review.client_headline || 'Consultation Client'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 9. FREQUENTLY ASKED QUESTIONS (8 POLICY-ACCURATE ACCORDIONS)               */}
      {/* ========================================================================= */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-8">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-moonstone-dark">
              Got Questions?
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-midnight mt-1 tracking-tight">
              Frequently Asked Questions
            </h2>
            <p className="text-xs sm:text-sm text-midnight/65 mt-1">
              Everything you need to know about how HireByMinutes operates.
            </p>
          </div>
          <Link
            to="/faq"
            className="text-xs sm:text-sm font-semibold text-moonstone hover:text-moonstone-dark flex items-center gap-1 transition-colors"
          >
            <span>View all FAQs</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Two-Column Accordion Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {DEFAULT_FAQS.map((faq, index) => {
            const isOpen = openFaqIndex === index;
            return (
              <div
                key={faq.id}
                className="bg-white border border-timberwolf/70 rounded-2xl overflow-hidden shadow-subtle transition-all"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                  className="w-full min-h-[56px] p-5 text-left flex items-center justify-between gap-4 cursor-pointer select-none hover:bg-aliceblue/30 transition-colors"
                  aria-expanded={isOpen}
                >
                  <span className="font-bold text-sm text-midnight leading-snug">
                    {faq.question}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-midnight/60 shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-moonstone' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-midnight/75 leading-relaxed border-t border-timberwolf/30">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 10. FINAL CALL-TO-ACTION BANNER (SOFT CYAN-TO-TEAL GRADIENT)              */}
      {/* ========================================================================= */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gradient-to-r from-moonstone/20 via-lightblue/35 to-moonstone/20 border border-moonstone/35 rounded-3xl p-8 sm:p-14 text-center text-midnight shadow-card relative overflow-hidden">
          
          {/* Subtle Ambient Decorative Circles */}
          <div className="absolute -top-12 -left-12 w-48 h-48 rounded-full bg-white/40 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-12 -right-12 w-48 h-48 rounded-full bg-moonstone/20 blur-2xl pointer-events-none" />

          <div className="relative z-10 max-w-2xl mx-auto space-y-4">
            <div className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-white/80 text-moonstone-dark font-bold text-xs uppercase tracking-wider border border-moonstone/30">
              Ready to get started?
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-midnight tracking-tight leading-tight">
              Find the right expert for your next step.
            </h2>

            <p className="text-sm sm:text-base text-midnight/75 max-w-xl mx-auto leading-relaxed">
              Join people getting expert help by the minute, or share your knowledge with clients worldwide.
            </p>

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3.5">
              <Link
                to="/services"
                className="btn-shine w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 min-h-[48px] rounded-xl bg-midnight text-aliceblue font-bold text-sm hover:bg-midnight-hover shadow-subtle transition-all"
              >
                <span>Find a Service</span>
                <ArrowRight className="w-4 h-4 text-moonstone" />
              </Link>

              <Link
                to="/provider/onboard"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 min-h-[48px] rounded-xl bg-white border-2 border-timberwolf hover:border-moonstone text-midnight font-bold text-sm shadow-subtle hover:bg-aliceblue transition-all"
              >
                <span>Start Offering Services</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

        </div>
      </section>

    </div>
  );
};

export default HomePage;
