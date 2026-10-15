import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { backendStatus } from '../services/backendStatus';
import { Opportunity, Category, Project, Job } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  Briefcase,
  Clock,
  Send,
  PlusCircle,
  X,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  UserCheck,
  RefreshCw,
  AlertCircle,
  Layers,
  Search,
  Filter,
  Shield,
  Check,
  Calendar,
  ChevronRight,
  ChevronLeft,
  DollarSign,
  Building2,
  MapPin,
  ExternalLink
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { usePageSEO } from '../hooks/usePageSEO';
import { formatINR, CURRENCY } from '../utils/currency';

export type PageState = 'loading' | 'connecting' | 'success_with_data' | 'success_empty' | 'error';
export type ListingFilterType = 'all' | 'client_project' | 'platform_opportunity';

export interface UnifiedListing {
  id: string;
  sourceType: 'client_project' | 'platform_opportunity';
  typeLabel: 'Client Project' | 'Platform Opportunity';
  title: string;
  description: string;
  categoryId?: string | null;
  categoryName: string;
  skills: string[];
  budgetFormatted: string;
  budgetNumeric: number;
  budgetSubtitle: string;
  pricingBadge: string;
  pricingBadgeVariant: 'emerald' | 'amber' | 'blue';
  durationOrDeadline: string;
  createdAt: string;
  status: string;
  isOpen: boolean;
  proposalsOrApplicantsCount: number;
  activityLabel: string;
  authorName: string;
  authorLocation?: string | null;
  authorAvatar?: string | null;
  experienceLevel?: string | null;
  actionType: 'proposal' | 'apply' | 'job_detail';
  actionLabel: string;
  detailUrl: string;
  rawProject?: Project;
  rawOpportunity?: Opportunity;
  rawJob?: Job;
}

export const OpportunitiesPage: React.FC = () => {
  usePageSEO({
    title: 'Opportunities & Projects Marketplace — HireByMinute',
    description: 'Explore verified client freelance projects and platform opportunities. Apply for consultations or submit proposals for milestone deliverables.',
    canonicalPath: '/opportunities'
  });

  const { user } = useAuth();
  const navigate = useNavigate();

  // Raw Data State
  const [categories, setCategories] = useState<Category[]>([]);
  const [rawOpportunities, setRawOpportunities] = useState<Opportunity[]>([]);
  const [rawProjects, setRawProjects] = useState<Project[]>([]);
  const [rawJobs, setRawJobs] = useState<Job[]>([]);

  // Page Lifecycle State
  const [pageState, setPageState] = useState<PageState>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Filter & Search Controls
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<ListingFilterType>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedBudget, setSelectedBudget] = useState<string>('all');
  const [selectedSort, setSelectedSort] = useState<'newest' | 'budget_high' | 'budget_low'>('newest');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 9;

  // Apply Modal state (for platform consultation opportunities)
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [applyMessage, setApplyMessage] = useState('');
  const [applyExperience, setApplyExperience] = useState('');
  const [applyAvailability, setApplyAvailability] = useState('Available today / within 24 hours');
  const [applyRate, setApplyRate] = useState<string>('');
  const [applyLoading, setApplyLoading] = useState(false);

  // Post Opportunity Modal state (quick consultation brief for clients/admins)
  const [showPostModal, setShowPostModal] = useState(false);
  const [postTitle, setPostTitle] = useState('');
  const [postCategoryId, setPostCategoryId] = useState('');
  const [postDescription, setPostDescription] = useState('');
  const [postDuration, setPostDuration] = useState<number>(45);
  const [postBudget, setPostBudget] = useState<number>(75);
  const [postLoading, setPostLoading] = useState(false);

  const loadAllOpportunities = async (_isManualRefresh = false) => {
    setPageState('loading');
    setErrorMessage('');

    let isRequestActive = true;
    const unsubscribe = backendStatus.subscribe((status) => {
      if (isRequestActive && (status.state === 'waking_up' || status.isSleeping)) {
        setPageState('connecting');
      }
    });

    try {
      const results = await Promise.allSettled([
        api.getOpportunities(),
        api.getProjects({ limit: 50 }),
        api.getJobs({ limit: 50 }).catch(() => ({ jobs: [] })),
        api.getCategories()
      ]);

      isRequestActive = false;
      unsubscribe();

      const [oppRes, projRes, jobRes, catRes] = results;

      if (catRes.status === 'fulfilled' && catRes.value?.categories) {
        setCategories(catRes.value.categories);
        if (catRes.value.categories.length > 0 && !postCategoryId) {
          setPostCategoryId(catRes.value.categories[0].id);
        }
      }

      let oppsList: Opportunity[] = [];
      if (oppRes.status === 'fulfilled') {
        const val = oppRes.value;
        oppsList = Array.isArray(val?.opportunities)
          ? val.opportunities
          : Array.isArray(val?.data)
          ? val.data
          : Array.isArray(val)
          ? val
          : [];
        setRawOpportunities(oppsList);
      }

      let projectsList: Project[] = [];
      if (projRes.status === 'fulfilled') {
        const pVal = projRes.value;
        projectsList = Array.isArray(pVal?.projects) ? pVal.projects : [];
        setRawProjects(projectsList);
      }

      let jobsList: Job[] = [];
      if (jobRes.status === 'fulfilled') {
        const jVal = jobRes.value;
        jobsList = Array.isArray(jVal?.jobs) ? jVal.jobs : [];
        setRawJobs(jobsList);
      }

      const totalItems = oppsList.length + projectsList.length + jobsList.length;
      if (totalItems > 0) {
        setPageState('success_with_data');
      } else {
        setPageState('success_empty');
      }
    } catch (err: any) {
      isRequestActive = false;
      unsubscribe();
      console.error('[OpportunitiesPage] Error loading opportunities and projects:', err);
      const statusObj = backendStatus.getStatus();
      if (statusObj.isSleeping || statusObj.state === 'waking_up') {
        setPageState('connecting');
      } else {
        setPageState('error');
        setErrorMessage(err?.message || 'Unable to load opportunities right now.');
      }
    }
  };

  useEffect(() => {
    loadAllOpportunities();
  }, []);

  // Transform and normalize Client Projects & Platform Opportunities into unified listings
  const unifiedListings = useMemo<UnifiedListing[]>(() => {
    const list: UnifiedListing[] = [];

    // 1. Client Projects
    rawProjects.forEach((proj) => {
      // Only include eligible, published/open projects
      if (!['OPEN', 'REVIEWING_PROPOSALS'].includes(proj.status)) return;

      let budgetDisplay = '₹0';
      let budgetVal = 0;
      let budgetSub = 'Total Budget';

      if (proj.project_type === 'hourly') {
        budgetDisplay = `${formatINR(proj.budget_min || 0)} - ${formatINR(proj.budget_max || 0)}/hr`;
        budgetVal = proj.budget_max || proj.budget_min || 0;
        budgetSub = 'Hourly Rate';
      } else if (proj.budget_type === 'range') {
        budgetDisplay = `${formatINR(proj.budget_min || 0)} - ${formatINR(proj.budget_max || 0)}`;
        budgetVal = proj.budget_max || proj.budget_min || 0;
        budgetSub = 'Estimated Range';
      } else {
        const fixedVal = proj.budget_min || proj.budget_max || 0;
        budgetDisplay = formatINR(fixedVal);
        budgetVal = fixedVal;
        budgetSub = 'Fixed Budget';
      }

      list.push({
        id: proj.id,
        sourceType: 'client_project',
        typeLabel: 'Client Project',
        title: proj.title,
        description: proj.description,
        categoryId: proj.category_id,
        categoryName: proj.category_name || 'General Projects',
        skills: Array.isArray(proj.skills) ? proj.skills : [],
        budgetFormatted: budgetDisplay,
        budgetNumeric: budgetVal,
        budgetSubtitle: budgetSub,
        pricingBadge: proj.project_type === 'fixed' ? 'Fixed Price' : 'Hourly Rate',
        pricingBadgeVariant: 'blue',
        durationOrDeadline: proj.estimated_duration || (proj.deadline ? `Deadline: ${new Date(proj.deadline).toLocaleDateString()}` : 'Flexible Duration'),
        createdAt: proj.created_at || new Date().toISOString(),
        status: proj.status,
        isOpen: true,
        proposalsOrApplicantsCount: proj.proposals_count || 0,
        activityLabel: `${proj.proposals_count || 0} proposal${proj.proposals_count === 1 ? '' : 's'}`,
        authorName: proj.client?.name || 'Verified Client',
        authorLocation: proj.client?.city ? `${proj.client.city}, ${proj.client.country || ''}` : proj.client?.country || 'Remote',
        authorAvatar: proj.client?.avatar_url || null,
        experienceLevel: proj.experience_level,
        actionType: 'proposal',
        actionLabel: 'Submit Proposal',
        detailUrl: `/projects/${proj.id}`,
        rawProject: proj
      });
    });

    // 2. Platform Consultation Opportunities
    rawOpportunities.forEach((opp) => {
      const isOpen = !opp.status || opp.status.toLowerCase() === 'open';
      if (!isOpen) return; // Hide non-open

      const isPaid = opp.pricing_type === 'paid' && Number(opp.entry_fee_inr || opp.entry_fee_usd || 0) > 0;
      const feeVal = Number(opp.entry_fee_inr || opp.entry_fee_usd || 0);

      list.push({
        id: opp.id,
        sourceType: 'platform_opportunity',
        typeLabel: 'Platform Opportunity',
        title: opp.title,
        description: opp.description,
        categoryId: opp.category_id,
        categoryName: opp.category_name || 'Expert Consultation',
        skills: Array.isArray(opp.skills) ? opp.skills : [],
        budgetFormatted: formatINR(opp.budget || 0),
        budgetNumeric: Number(opp.budget || 0),
        budgetSubtitle: 'Consultation Fee',
        pricingBadge: isPaid ? `${formatINR(feeVal)} Entry Fee` : 'Free to Apply',
        pricingBadgeVariant: isPaid ? 'amber' : 'emerald',
        durationOrDeadline: `${opp.duration_minutes || 45} mins 1-on-1`,
        createdAt: opp.created_at || new Date().toISOString(),
        status: opp.status || 'open',
        isOpen: true,
        proposalsOrApplicantsCount: opp.applications_count || 0,
        activityLabel: `${opp.applications_count || 0} applicant${opp.applications_count === 1 ? '' : 's'}`,
        authorName: opp.creator_name || 'HireByMinute Platform',
        authorLocation: opp.location || 'Remote Consultation',
        authorAvatar: opp.creator_avatar || null,
        actionType: 'apply',
        actionLabel: 'Apply Now',
        detailUrl: '#apply',
        rawOpportunity: opp
      });
    });

    // 3. Platform Jobs & Career Openings (if published)
    rawJobs.forEach((job) => {
      if (job.status !== 'published') return;

      const salMin = job.salary_min || 0;
      const salMax = job.salary_max || salMin;
      const salDisplay = salMin > 0 ? (salMax > salMin ? `${formatINR(salMin)} - ${formatINR(salMax)}` : formatINR(salMin)) : 'Competitive';

      list.push({
        id: job.id,
        sourceType: 'platform_opportunity',
        typeLabel: 'Platform Opportunity',
        title: job.title,
        description: job.description,
        categoryId: job.category_id,
        categoryName: job.category_name || job.department || 'Full-Time Position',
        skills: Array.isArray(job.skills) ? job.skills : [],
        budgetFormatted: salDisplay,
        budgetNumeric: salMax || salMin || 0,
        budgetSubtitle: job.employment_type || 'Annual Salary',
        pricingBadge: job.employment_type || 'Direct Hire',
        pricingBadgeVariant: 'emerald',
        durationOrDeadline: job.work_mode || 'Remote',
        createdAt: job.published_at || job.created_at || new Date().toISOString(),
        status: job.status,
        isOpen: true,
        proposalsOrApplicantsCount: job.applications_count || 0,
        activityLabel: `${job.applications_count || 0} applicant${job.applications_count === 1 ? '' : 's'}`,
        authorName: job.company_name || 'HireByMinute Partner',
        authorLocation: job.city ? `${job.city}, ${job.country || ''}` : 'Remote',
        authorAvatar: job.company_logo || null,
        experienceLevel: job.experience_level,
        actionType: 'job_detail',
        actionLabel: 'View Opening',
        detailUrl: `/jobs/${job.slug || job.id}`,
        rawJob: job
      });
    });

    return list;
  }, [rawProjects, rawOpportunities, rawJobs]);

  // Counts for filter pills
  const counts = useMemo(() => {
    let clientProjects = 0;
    let platformOpps = 0;
    unifiedListings.forEach((item) => {
      if (item.sourceType === 'client_project') clientProjects++;
      if (item.sourceType === 'platform_opportunity') platformOpps++;
    });
    return {
      all: unifiedListings.length,
      client_project: clientProjects,
      platform_opportunity: platformOpps
    };
  }, [unifiedListings]);

  // Filtered & Sorted listings
  const filteredListings = useMemo(() => {
    let result = [...unifiedListings];

    // 1. Source Type Filter
    if (selectedType !== 'all') {
      result = result.filter((item) => item.sourceType === selectedType);
    }

    // 2. Search Query (Title, Description, Skills, Category, Author)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((item) => {
        return (
          item.title.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.categoryName.toLowerCase().includes(q) ||
          item.authorName.toLowerCase().includes(q) ||
          item.skills.some((s) => s.toLowerCase().includes(q))
        );
      });
    }

    // 3. Category Filter
    if (selectedCategory !== 'all') {
      result = result.filter((item) => item.categoryId === selectedCategory || item.categoryName.toLowerCase() === selectedCategory.toLowerCase());
    }

    // 4. Budget Filter
    if (selectedBudget === 'under_5k') {
      result = result.filter((item) => item.budgetNumeric > 0 && item.budgetNumeric < 5000);
    } else if (selectedBudget === '5k_20k') {
      result = result.filter((item) => item.budgetNumeric >= 5000 && item.budgetNumeric <= 20000);
    } else if (selectedBudget === 'above_20k') {
      result = result.filter((item) => item.budgetNumeric > 20000);
    }

    // 5. Sorting
    if (selectedSort === 'newest') {
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (selectedSort === 'budget_high') {
      result.sort((a, b) => b.budgetNumeric - a.budgetNumeric);
    } else if (selectedSort === 'budget_low') {
      result.sort((a, b) => a.budgetNumeric - b.budgetNumeric);
    }

    return result;
  }, [unifiedListings, selectedType, searchQuery, selectedCategory, selectedBudget, selectedSort]);

  // Pagination slice
  const totalPages = Math.ceil(filteredListings.length / itemsPerPage) || 1;
  const paginatedListings = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredListings.slice(start, start + itemsPerPage);
  }, [filteredListings, currentPage]);

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOpp) return;

    if (!user) {
      alert('Please log in as an expert provider to apply for opportunities.');
      navigate(`/login?returnTo=${encodeURIComponent('/opportunities')}`);
      return;
    }

    setApplyLoading(true);
    try {
      const isFree = selectedOpp.pricing_type === 'free' || Number(selectedOpp.entry_fee_usd || selectedOpp.entry_fee_inr || 0) <= 0;

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
        await loadAllOpportunities();
        setApplyLoading(false);
        return;
      }

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
        await loadAllOpportunities();
        setApplyLoading(false);
        return;
      }

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
            await loadAllOpportunities();
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
      rzp.open();
    } catch (err: any) {
      alert(err.message || 'Application initiation failed. Please try again.');
      setApplyLoading(false);
    }
  };

  const handlePostOpportunitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert('Please log in to post an opportunity.');
      navigate('/login?returnTo=/opportunities');
      return;
    }

    setPostLoading(true);
    try {
      await api.createOpportunity({
        title: postTitle,
        category_id: postCategoryId,
        description: postDescription,
        duration_minutes: postDuration,
        budget: postBudget
      });

      alert('Opportunity created successfully!');
      confetti({ particleCount: 70, spread: 60 });
      setShowPostModal(false);
      setPostTitle('');
      setPostDescription('');
      await loadAllOpportunities();
    } catch (err: any) {
      alert(err.message || 'Failed to post opportunity.');
    } finally {
      setPostLoading(false);
    }
  };

  const handleListingAction = (listing: UnifiedListing) => {
    if (listing.actionType === 'proposal') {
      navigate(listing.detailUrl);
    } else if (listing.actionType === 'job_detail') {
      navigate(listing.detailUrl);
    } else if (listing.actionType === 'apply' && listing.rawOpportunity) {
      setSelectedOpp(listing.rawOpportunity);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] py-8 sm:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Marketplace Header Banner */}
        <div className="bg-white rounded-3xl border border-timberwolf/70 p-6 sm:p-10 shadow-subtle flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative overflow-hidden">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-moonstone/10 border border-moonstone/30 text-moonstone-dark text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-moonstone" />
              <span>Unified Discovery Marketplace</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-midnight tracking-tight">
              Work Opportunities & Client Projects
            </h1>
            <p className="text-xs sm:text-sm text-midnight/70 leading-relaxed">
              Explore legitimate client freelance projects and verified platform opportunities. Specialists can review requirements, submit competitive proposals, and apply for structured consultations through one consistent marketplace.
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <Link
              to="/projects/new"
              className="btn-shine inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-midnight text-aliceblue font-bold text-xs hover:bg-midnight-hover shadow-subtle transition-all cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 text-moonstone" />
              <span>Post a Project</span>
            </Link>

            <button
              type="button"
              onClick={() => setShowPostModal(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-timberwolf/80 bg-white text-midnight font-semibold text-xs hover:bg-aliceblue transition-colors cursor-pointer"
            >
              <Clock className="w-4 h-4 text-moonstone" />
              <span>Post Consultation Brief</span>
            </button>

            {user?.role === 'admin' && (
              <Link
                to="/admin/opportunities"
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 font-semibold text-xs hover:bg-amber-100 transition-colors"
              >
                <Shield className="w-3.5 h-3.5 text-amber-700" />
                <span>Admin Hub</span>
              </Link>
            )}
          </div>
        </div>

        {/* Discovery Filter & Search Bar */}
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-4 sm:p-5 shadow-subtle space-y-4">
          
          {/* Top Row: Type Pills & Search Bar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Listing Source Type Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              <button
                type="button"
                onClick={() => { setSelectedType('all'); setCurrentPage(1); }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  selectedType === 'all'
                    ? 'bg-midnight text-aliceblue shadow-xs'
                    : 'bg-aliceblue/70 text-midnight/80 hover:bg-aliceblue'
                }`}
              >
                All Opportunities ({counts.all})
              </button>

              <button
                type="button"
                onClick={() => { setSelectedType('client_project'); setCurrentPage(1); }}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  selectedType === 'client_project'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-aliceblue/70 text-indigo-900 hover:bg-indigo-50 border border-indigo-100'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Client Projects ({counts.client_project})</span>
              </button>

              <button
                type="button"
                onClick={() => { setSelectedType('platform_opportunity'); setCurrentPage(1); }}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  selectedType === 'platform_opportunity'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'bg-aliceblue/70 text-emerald-900 hover:bg-emerald-50 border border-emerald-100'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Platform Opportunities ({counts.platform_opportunity})</span>
              </button>
            </div>

            {/* Keyword Search Input */}
            <div className="relative min-w-[240px] md:w-72">
              <Search className="w-4 h-4 text-midnight/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="Search skills, titles, briefs..."
                className="w-full pl-9 pr-8 py-2 rounded-xl border border-timberwolf text-xs text-midnight focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 outline-none transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-midnight/40 hover:text-midnight cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Bottom Row: Granular Filters & Sorting */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-timberwolf/30 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              {/* Category Dropdown */}
              <div className="flex items-center gap-1.5">
                <span className="text-midnight/60 font-medium">Category:</span>
                <select
                  value={selectedCategory}
                  onChange={(e) => { setSelectedCategory(e.target.value); setCurrentPage(1); }}
                  className="px-2.5 py-1.5 rounded-lg border border-timberwolf bg-white text-midnight font-medium focus:border-moonstone outline-none"
                >
                  <option value="all">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Budget Range Dropdown */}
              <div className="flex items-center gap-1.5">
                <span className="text-midnight/60 font-medium">Budget:</span>
                <select
                  value={selectedBudget}
                  onChange={(e) => { setSelectedBudget(e.target.value); setCurrentPage(1); }}
                  className="px-2.5 py-1.5 rounded-lg border border-timberwolf bg-white text-midnight font-medium focus:border-moonstone outline-none"
                >
                  <option value="all">All Budgets</option>
                  <option value="under_5k">Under ₹5,000</option>
                  <option value="5k_20k">₹5,000 - ₹20,000</option>
                  <option value="above_20k">₹20,000+</option>
                </select>
              </div>

              {(searchQuery || selectedCategory !== 'all' || selectedBudget !== 'all' || selectedType !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('all');
                    setSelectedBudget('all');
                    setSelectedType('all');
                    setCurrentPage(1);
                  }}
                  className="text-rose-600 hover:text-rose-800 font-semibold cursor-pointer underline"
                >
                  Reset filters
                </button>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-midnight/60 font-medium">Sort by:</span>
              <select
                value={selectedSort}
                onChange={(e) => setSelectedSort(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-lg border border-timberwolf bg-white text-midnight font-medium focus:border-moonstone outline-none"
              >
                <option value="newest">Newest First</option>
                <option value="budget_high">Highest Budget</option>
                <option value="budget_low">Lowest Budget</option>
              </select>
            </div>
          </div>

        </div>

        {/* Content Area Based on Explicit State */}
        {pageState === 'loading' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white/80 border border-timberwolf/50 rounded-2xl p-6 h-64 animate-pulse space-y-4">
                <div className="flex justify-between items-center">
                  <div className="h-5 w-24 bg-timberwolf/30 rounded-full" />
                  <div className="h-5 w-20 bg-timberwolf/20 rounded-full" />
                </div>
                <div className="h-6 w-3/4 bg-timberwolf/30 rounded-md" />
                <div className="h-4 w-full bg-timberwolf/20 rounded-md" />
                <div className="h-4 w-2/3 bg-timberwolf/20 rounded-md" />
                <div className="pt-4 border-t border-timberwolf/20 flex justify-between items-center">
                  <div className="h-6 w-20 bg-timberwolf/30 rounded-md" />
                  <div className="h-8 w-24 bg-timberwolf/30 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        )}

        {pageState === 'connecting' && (
          <div className="bg-white rounded-2xl border border-amber-200/80 bg-amber-50/20 p-10 text-center shadow-subtle space-y-4 max-w-md mx-auto my-6">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600">
              <Clock className="w-6 h-6 animate-pulse" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-midnight">Backend Server Connecting</h3>
              <p className="text-xs text-midnight/70 max-w-sm mx-auto leading-relaxed">
                The database server on Render is waking up (~30s). Active opportunities and projects will sync automatically.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => loadAllOpportunities(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover transition-all cursor-pointer shadow-subtle"
              >
                <RefreshCw className="w-3.5 h-3.5 text-moonstone" />
                <span>Retry Connecting</span>
              </button>
            </div>
          </div>
        )}

        {pageState === 'error' && (
          <div className="bg-white rounded-2xl border border-rose-200 bg-rose-50/20 p-10 text-center shadow-subtle space-y-4 max-w-md mx-auto my-6">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto text-rose-600">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-midnight">Unable to load opportunities</h3>
              <p className="text-xs text-midnight/70 max-w-sm mx-auto leading-relaxed">
                {errorMessage || "We couldn't connect to the opportunities marketplace. Please check your network and try again."}
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => loadAllOpportunities(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover transition-all cursor-pointer shadow-subtle"
              >
                <RefreshCw className="w-3.5 h-3.5 text-moonstone" />
                <span>Try Again</span>
              </button>
            </div>
          </div>
        )}

        {pageState === 'success_empty' && (
          <div className="bg-white rounded-3xl border border-timberwolf/70 p-10 sm:p-14 text-center shadow-subtle space-y-4 max-w-lg mx-auto my-6">
            <div className="w-14 h-14 rounded-2xl bg-aliceblue border border-timberwolf/40 flex items-center justify-center mx-auto text-moonstone">
              <Briefcase className="w-7 h-7 text-midnight" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-midnight tracking-tight">
                No active listings published yet
              </h3>
              <p className="text-xs sm:text-sm text-midnight/70 max-w-sm mx-auto leading-relaxed">
                Be the first to publish a work opportunity or project requirement. Verified specialists across our network will be notified.
              </p>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/projects/new"
                className="btn-shine inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover transition-all cursor-pointer shadow-subtle w-full sm:w-auto"
              >
                <PlusCircle className="w-3.5 h-3.5 text-moonstone" />
                <span>Post a Project</span>
              </Link>
              <button
                type="button"
                onClick={() => loadAllOpportunities(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-aliceblue text-midnight text-xs font-semibold hover:bg-timberwolf/30 border border-timberwolf/60 transition-all cursor-pointer w-full sm:w-auto"
              >
                <RefreshCw className="w-3.5 h-3.5 text-moonstone" />
                <span>Refresh Marketplace</span>
              </button>
            </div>
          </div>
        )}

        {pageState === 'success_with_data' && filteredListings.length === 0 && (
          <div className="bg-white rounded-2xl border border-timberwolf/70 p-10 text-center shadow-subtle space-y-3 max-w-md mx-auto my-6">
            <div className="w-12 h-12 rounded-xl bg-aliceblue flex items-center justify-center mx-auto text-midnight/60">
              <Filter className="w-5 h-5 text-moonstone" />
            </div>
            <h3 className="text-base font-bold text-midnight">No matching listings found</h3>
            <p className="text-xs text-midnight/70 leading-relaxed">
              No opportunities or projects matched your current search filters. Try adjusting your query or resetting filters.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                  setSelectedBudget('all');
                  setSelectedType('all');
                }}
                className="px-4 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover transition-colors cursor-pointer"
              >
                Clear All Filters
              </button>
            </div>
          </div>
        )}

        {pageState === 'success_with_data' && filteredListings.length > 0 && (
          <div className="space-y-6">
            {/* Listing Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedListings.map((item) => (
                <div
                  key={`${item.sourceType}-${item.id}`}
                  className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-6 flex flex-col justify-between hover:border-moonstone/60 space-y-4 shadow-subtle transition-all group"
                >
                  <div className="space-y-3">
                    
                    {/* Top Badges Row */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.sourceType === 'client_project' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-200/80">
                            <Layers className="w-3 h-3 text-indigo-600" />
                            <span>Client Project</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-200/80">
                            <Sparkles className="w-3 h-3 text-emerald-600" />
                            <span>Platform Opportunity</span>
                          </span>
                        )}

                        <span className="px-2 py-0.5 rounded-full bg-aliceblue text-midnight text-[10px] font-medium border border-timberwolf/40">
                          {item.categoryName}
                        </span>
                      </div>

                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        item.pricingBadgeVariant === 'amber'
                          ? 'bg-amber-50 text-amber-800 border-amber-300'
                          : item.pricingBadgeVariant === 'blue'
                          ? 'bg-blue-50 text-blue-800 border-blue-200'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      }`}>
                        {item.pricingBadge}
                      </span>
                    </div>

                    {/* Title */}
                    <h3
                      onClick={() => handleListingAction(item)}
                      className="font-bold text-base text-midnight line-clamp-2 group-hover:text-moonstone transition-colors cursor-pointer"
                    >
                      {item.title}
                    </h3>

                    {/* Publisher / Client Info */}
                    <div className="flex items-center gap-2 text-xs text-midnight/60">
                      {item.sourceType === 'client_project' ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-midnight/80">{item.authorName}</span>
                          {item.authorLocation && (
                            <>
                              <span>•</span>
                              <span>{item.authorLocation}</span>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-moonstone font-semibold text-[11px]">
                          <Shield className="w-3.5 h-3.5 shrink-0" />
                          <span>HireByMinute Verified Platform</span>
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    <p className="text-xs text-midnight/70 line-clamp-3 leading-relaxed">
                      {item.description}
                    </p>

                    {/* Skills Pills */}
                    {item.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {item.skills.slice(0, 4).map((skill) => (
                          <span
                            key={skill}
                            className="px-2 py-0.5 rounded-md bg-[#FAF8F5] text-midnight/80 text-[10px] font-medium border border-timberwolf/60"
                          >
                            {skill}
                          </span>
                        ))}
                        {item.skills.length > 4 && (
                          <span className="text-[10px] text-midnight/40 self-center">
                            +{item.skills.length - 4} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Card Bottom: Budget & Action */}
                  <div className="pt-4 border-t border-timberwolf/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-midnight/50 uppercase font-semibold block">
                          {item.budgetSubtitle}
                        </span>
                        <span className="font-extrabold text-base text-midnight font-mono">
                          {item.budgetFormatted}
                        </span>
                      </div>

                      <div className="text-right text-[11px] text-midnight/60 space-y-0.5">
                        <div className="flex items-center gap-1 justify-end">
                          <Clock className="w-3.5 h-3.5 text-midnight/40" />
                          <span>{item.durationOrDeadline}</span>
                        </div>
                        <div className="flex items-center gap-1 justify-end font-medium">
                          <UserCheck className="w-3.5 h-3.5 text-moonstone" />
                          <span>{item.activityLabel}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleListingAction(item)}
                      className="w-full py-2.5 px-4 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover transition-colors shadow-subtle cursor-pointer flex items-center justify-center gap-1.5 group-hover:bg-midnight-hover"
                    >
                      <span>{item.actionLabel}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-moonstone transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </div>

                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-timberwolf/40 text-xs">
                <span className="text-midnight/60 font-medium">
                  Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredListings.length)} of {filteredListings.length} listings
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="p-2 rounded-lg border border-timberwolf bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-aliceblue cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4 text-midnight" />
                  </button>

                  {Array.from({ length: totalPages }).map((_, idx) => {
                    const pageNum = idx + 1;
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-8 h-8 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                          currentPage === pageNum
                            ? 'bg-midnight text-aliceblue'
                            : 'border border-timberwolf bg-white text-midnight hover:bg-aliceblue'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="p-2 rounded-lg border border-timberwolf bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-aliceblue cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4 text-midnight" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* APPLY MODAL (for platform consultation opportunities) */}
      {selectedOpp && (
        <div className="fixed inset-0 z-50 bg-midnight/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-timberwolf max-w-lg w-full p-6 sm:p-7 shadow-elevated space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-moonstone">Application</span>
                <h3 className="text-lg font-bold text-midnight mt-0.5">{selectedOpp.title}</h3>
                <p className="text-xs text-midnight/60 font-mono mt-0.5">
                  Budget: {formatINR(selectedOpp.budget)} • {selectedOpp.duration_minutes} mins
                </p>
              </div>
              <button
                onClick={() => setSelectedOpp(null)}
                className="text-midnight/40 hover:text-midnight p-1 cursor-pointer"
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
                  placeholder="How will you help solve this problem during the consultation?"
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
                  placeholder="e.g. 7 years experience in this domain, solved similar client challenges"
                  className="w-full p-3 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight focus:outline-none focus:border-moonstone"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-midnight block">Your Availability</label>
                  <select
                    value={applyAvailability}
                    onChange={(e) => setApplyAvailability(e.target.value)}
                    className="w-full p-2.5 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight focus:outline-none focus:border-moonstone"
                  >
                    <option value="Available today / within 24 hours">Within 24 hours</option>
                    <option value="Within 2-3 days">Within 2-3 days</option>
                    <option value="This weekend">This weekend</option>
                    <option value="Next week">Next week</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-midnight block">Proposed Rate (Optional)</label>
                  <input
                    type="number"
                    value={applyRate}
                    onChange={(e) => setApplyRate(e.target.value)}
                    placeholder={`e.g. ${selectedOpp.budget}`}
                    className="w-full p-2.5 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight focus:outline-none focus:border-moonstone"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-timberwolf/40 flex items-center justify-between">
                <div className="text-[11px] text-midnight/70">
                  {selectedOpp.pricing_type === 'paid' && Number(selectedOpp.entry_fee_inr || selectedOpp.entry_fee_usd || 0) > 0 ? (
                    <span className="font-bold text-amber-700">
                      Entry Fee: {formatINR(selectedOpp.entry_fee_inr || selectedOpp.entry_fee_usd || 0)}
                    </span>
                  ) : (
                    <span className="font-bold text-emerald-700">Free Submission</span>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedOpp(null)}
                    className="px-3.5 py-2 rounded-xl border border-timberwolf text-midnight font-medium hover:bg-aliceblue cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={applyLoading}
                    className="px-4 py-2 rounded-xl bg-midnight text-aliceblue font-bold hover:bg-midnight-hover shadow-subtle flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5 text-moonstone" />
                    <span>{applyLoading ? 'Submitting...' : 'Submit Application'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POST OPPORTUNITY MODAL (quick consultation brief) */}
      {showPostModal && (
        <div className="fixed inset-0 z-50 bg-midnight/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-timberwolf max-w-lg w-full p-6 sm:p-7 shadow-elevated space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-moonstone">Post Brief</span>
                <h3 className="text-lg font-bold text-midnight mt-0.5">Post a Consultation Brief</h3>
                <p className="text-xs text-midnight/60">
                  Request specialized consultation help from verified experts on the platform.
                </p>
              </div>
              <button
                onClick={() => setShowPostModal(false)}
                className="text-midnight/40 hover:text-midnight p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePostOpportunitySubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-midnight block">Brief Title *</label>
                <input
                  type="text"
                  required
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  placeholder="e.g. Need quick architecture review of multi-tenant PostgreSQL schema"
                  className="w-full p-3 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight focus:outline-none focus:border-moonstone"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-midnight block">Category *</label>
                <select
                  value={postCategoryId}
                  onChange={(e) => setPostCategoryId(e.target.value)}
                  className="w-full p-2.5 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight focus:outline-none focus:border-moonstone"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-midnight block">Description of Assistance Needed *</label>
                <textarea
                  rows={3}
                  required
                  value={postDescription}
                  onChange={(e) => setPostDescription(e.target.value)}
                  placeholder="Explain what specific questions or challenges you need guidance with..."
                  className="w-full p-3 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight focus:outline-none focus:border-moonstone leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-midnight block">Duration (Mins) *</label>
                  <select
                    value={postDuration}
                    onChange={(e) => setPostDuration(Number(e.target.value))}
                    className="w-full p-2.5 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight focus:outline-none focus:border-moonstone"
                  >
                    <option value={15}>15 Minutes</option>
                    <option value={30}>30 Minutes</option>
                    <option value={45}>45 Minutes</option>
                    <option value={60}>60 Minutes</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-midnight block">Budget (INR) *</label>
                  <input
                    type="number"
                    min={100}
                    step={50}
                    required
                    value={postBudget}
                    onChange={(e) => setPostBudget(Number(e.target.value))}
                    placeholder="e.g. 1500"
                    className="w-full p-2.5 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight focus:outline-none focus:border-moonstone"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-timberwolf/40 flex items-center justify-between">
                <Link
                  to="/projects/new"
                  onClick={() => setShowPostModal(false)}
                  className="text-moonstone hover:underline font-medium text-[11px]"
                >
                  Need a full milestone project instead?
                </Link>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPostModal(false)}
                    className="px-3.5 py-2 rounded-xl border border-timberwolf text-midnight font-medium hover:bg-aliceblue cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={postLoading}
                    className="px-4 py-2 rounded-xl bg-midnight text-aliceblue font-bold hover:bg-midnight-hover shadow-subtle flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <PlusCircle className="w-3.5 h-3.5 text-moonstone" />
                    <span>{postLoading ? 'Publishing...' : 'Publish Brief'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default OpportunitiesPage;
