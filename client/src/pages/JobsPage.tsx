import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { Job, Category } from '../types';
import { Button } from '../components/common/Button';
import { usePageSEO } from '../hooks/usePageSEO';
import {
  Briefcase,
  Search,
  MapPin,
  Building2,
  IndianRupee,
  Clock,
  Filter,
  X,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Globe,
  SlidersHorizontal,
  ChevronLeft
} from 'lucide-react';

export const JobsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  usePageSEO({
    title: 'Full-Time Jobs & Careers — HireByMinute',
    description: 'Explore full-time employment opportunities and career openings from verified companies. Apply directly with your resume.',
    canonicalPath: '/jobs'
  });

  const [jobs, setJobs] = useState<Job[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Filters
  const search = searchParams.get('search') || '';
  const workMode = searchParams.get('work_mode') || '';
  const experienceLevel = searchParams.get('experience_level') || '';
  const categoryId = searchParams.get('category_id') || '';
  const sort = searchParams.get('sort') || 'newest';
  const page = parseInt(searchParams.get('page') || '1', 10);

  const [searchInput, setSearchInput] = useState(search);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    async function loadCategories() {
      try {
        const catRes = await api.getCategories();
        setCategories(catRes?.categories || []);
      } catch (err) {
        console.error('Failed to load categories', err);
      }
    }
    loadCategories();
  }, []);

  useEffect(() => {
    async function fetchJobs() {
      setLoading(true);
      try {
        const res = await api.getJobs({
          search: search || undefined,
          work_mode: workMode || undefined,
          experience_level: experienceLevel || undefined,
          category_id: categoryId || undefined,
          sort,
          page,
          limit: 12
        });
        setJobs(res.jobs || []);
        setTotal(res.pagination?.total || 0);
        setTotalPages(res.pagination?.totalPages || 1);
      } catch (err) {
        console.error('Failed to fetch jobs', err);
        setJobs([]);
      } finally {
        setLoading(false);
      }
    }
    fetchJobs();
  }, [search, workMode, experienceLevel, categoryId, sort, page]);

  const updateParam = (key: string, value: string | null) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateParam('search', searchInput.trim() || null);
  };

  const clearAllFilters = () => {
    setSearchInput('');
    setSearchParams(new URLSearchParams());
  };

  const hasActiveFilters = Boolean(search || workMode || experienceLevel || categoryId);

  const formatSalary = (job: Job) => {
    if (job.salary_type === 'undisclosed' || (!job.salary_min && !job.salary_max)) {
      return 'Salary Undisclosed';
    }
    const curr = job.currency || 'INR';
    const sym = curr === 'INR' ? '₹' : `${curr} `;
    if (job.salary_type === 'starting_from' && job.salary_min) {
      return `From ${sym}${Number(job.salary_min).toLocaleString()} / yr`;
    }
    if (job.salary_type === 'up_to' && job.salary_max) {
      return `Up to ${sym}${Number(job.salary_max).toLocaleString()} / yr`;
    }
    if (job.salary_min && job.salary_max) {
      return `${sym}${Number(job.salary_min).toLocaleString()} - ${sym}${Number(job.salary_max).toLocaleString()} / yr`;
    }
    if (job.salary_min) {
      return `${sym}${Number(job.salary_min).toLocaleString()} / yr`;
    }
    return 'Competitive';
  };

  return (
    <div className="min-h-screen bg-aliceblue text-midnight pb-20">
      {/* Hero Header */}
      <section className="bg-white border-b border-timberwolf/60 py-10 sm:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-moonstone/10 border border-moonstone/30 text-moonstone-dark font-medium text-xs mb-3">
              <Briefcase className="w-3.5 h-3.5 text-moonstone" />
              <span>Full-Time Employment Marketplace</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-midnight tracking-tight">
              Full-Time Opportunities
            </h1>
            <p className="mt-3 text-base sm:text-lg text-midnight/70 leading-relaxed">
              Find full-time opportunities from companies hiring through HireByMinute.
            </p>

            {/* Search Bar */}
            <form onSubmit={handleSearchSubmit} className="mt-6">
              <div className="flex items-center bg-aliceblue border-2 border-timberwolf/80 rounded-2xl p-1.5 shadow-subtle focus-within:border-moonstone focus-within:bg-white transition-all">
                <Search className="w-5 h-5 text-midnight/50 ml-3 shrink-0" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search job titles, skills, companies, or tech stack..."
                  className="min-w-0 flex-1 px-3 py-2 text-sm sm:text-base text-midnight placeholder:text-midnight/40 bg-transparent focus:outline-none"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput('');
                      updateParam('search', null);
                    }}
                    className="p-1.5 mr-1 text-midnight/40 hover:text-midnight transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <Button type="submit" variant="primary" size="sm" className="shrink-0 rounded-xl px-4 sm:px-6">
                  Search Jobs
                </Button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10">
        <div className="flex items-center justify-between gap-4 pb-6 border-b border-timberwolf/40">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-midnight">
              {loading ? 'Searching openings...' : `${total} ${total === 1 ? 'Job Opening' : 'Job Openings'}`}
            </span>
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="text-xs font-semibold text-moonstone hover:text-moonstone-dark underline cursor-pointer"
              >
                Reset filters
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Mobile filter toggle button */}
            <button
              onClick={() => setMobileFiltersOpen(true)}
              className="lg:hidden flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-timberwolf/70 text-xs font-semibold text-midnight hover:border-moonstone transition-colors shadow-xs"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-moonstone" />
              <span>Filters</span>
              {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-moonstone" />}
            </button>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2 text-xs">
              <span className="hidden sm:inline text-midnight/60 font-medium">Sort:</span>
              <select
                value={sort}
                onChange={(e) => updateParam('sort', e.target.value)}
                className="bg-white border border-timberwolf/70 rounded-xl px-3 py-2 font-medium text-midnight focus:outline-none focus:border-moonstone cursor-pointer shadow-xs text-xs"
              >
                <option value="newest">Newest First</option>
                <option value="featured">Featured First</option>
                <option value="salary_high">Salary: High to Low</option>
                <option value="salary_low">Salary: Low to High</option>
                <option value="oldest">Oldest First</option>
              </select>
            </div>
          </div>
        </div>

        {/* Layout Grid: Sidebar Filters + Jobs List */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 pt-8">
          
          {/* Desktop Filter Sidebar */}
          <aside className="hidden lg:block lg:col-span-1 space-y-6">
            <div className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-subtle space-y-6">
              
              {/* Work Mode */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-midnight/70 mb-2.5">
                  Work Mode
                </label>
                <div className="space-y-1.5">
                  {[
                    { label: 'All Modes', value: '' },
                    { label: 'Remote', value: 'Remote' },
                    { label: 'Hybrid', value: 'Hybrid' },
                    { label: 'On-site', value: 'On-site' }
                  ].map((mode) => (
                    <button
                      key={mode.value}
                      onClick={() => updateParam('work_mode', mode.value || null)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer flex items-center justify-between ${
                        workMode === mode.value
                          ? 'bg-moonstone text-white font-bold'
                          : 'text-midnight/80 hover:bg-aliceblue hover:text-midnight'
                      }`}
                    >
                      <span>{mode.label}</span>
                      {workMode === mode.value && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Experience Level */}
              <div className="pt-4 border-t border-timberwolf/40">
                <label className="block text-xs font-bold uppercase tracking-wider text-midnight/70 mb-2.5">
                  Experience Level
                </label>
                <div className="space-y-1.5">
                  {[
                    { label: 'All Levels', value: '' },
                    { label: 'Entry Level', value: 'Entry Level' },
                    { label: 'Mid Level', value: 'Mid Level' },
                    { label: 'Senior Level', value: 'Senior Level' },
                    { label: 'Lead / Principal', value: 'Lead / Principal' },
                    { label: 'Executive', value: 'Executive' }
                  ].map((lvl) => (
                    <button
                      key={lvl.value}
                      onClick={() => updateParam('experience_level', lvl.value || null)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer flex items-center justify-between ${
                        experienceLevel === lvl.value
                          ? 'bg-moonstone text-white font-bold'
                          : 'text-midnight/80 hover:bg-aliceblue hover:text-midnight'
                      }`}
                    >
                      <span>{lvl.label}</span>
                      {experienceLevel === lvl.value && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Categories */}
              {categories.length > 0 && (
                <div className="pt-4 border-t border-timberwolf/40">
                  <label className="block text-xs font-bold uppercase tracking-wider text-midnight/70 mb-2.5">
                    Category
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => updateParam('category_id', e.target.value || null)}
                    className="w-full bg-aliceblue border border-timberwolf/70 rounded-xl px-3 py-2 text-xs font-medium text-midnight focus:outline-none focus:border-moonstone cursor-pointer"
                  >
                    <option value="">All Categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {hasActiveFilters && (
                <Button
                  onClick={clearAllFilters}
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                >
                  Clear All Filters
                </Button>
              )}
            </div>
          </aside>

          {/* Jobs Listing Column */}
          <main className="lg:col-span-3 space-y-4">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="bg-white rounded-2xl border border-timberwolf/60 p-6 h-40 animate-pulse" />
                ))}
              </div>
            ) : jobs.length === 0 ? (
              <div className="bg-white rounded-2xl border border-timberwolf/70 p-12 text-center shadow-card space-y-4 max-w-lg mx-auto my-8">
                <div className="w-14 h-14 rounded-2xl bg-aliceblue text-moonstone mx-auto flex items-center justify-center border border-timberwolf/60">
                  <Briefcase className="w-7 h-7" />
                </div>
                {hasActiveFilters ? (
                  <>
                    <h3 className="text-lg font-bold text-midnight">No matching positions found</h3>
                    <p className="text-xs sm:text-sm text-midnight/70 leading-relaxed">
                      We couldn't find any job openings matching your current filter criteria. Try adjusting keywords or clearing specific constraints.
                    </p>
                    <div className="pt-2">
                      <Button onClick={clearAllFilters} variant="primary" size="sm">
                        Clear Filter Constraints
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-bold text-midnight">No full-time opportunities available right now.</h3>
                    <p className="text-xs sm:text-sm text-midnight/70 leading-relaxed">
                      Check back soon for new opportunities, or connect with verified specialists for on-demand consultations.
                    </p>
                    <div className="pt-2">
                      <Button to="/services" variant="primary" size="sm" iconRight={<ArrowRight className="w-4 h-4" />}>
                        Explore Per-Minute Consultations
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {jobs.map((job) => {
                  const companyName = job.company?.name || job.company_name || 'HireByMinute Partner';
                  const companyLogo = job.company?.logo_url || job.company_logo;
                  const locationDisplay = job.location_text || [job.city, job.country].filter(Boolean).join(', ') || 'Global';

                  return (
                    <div
                      key={job.id}
                      onClick={() => navigate(`/jobs/${job.slug || job.id}`)}
                      className="bg-white border border-timberwolf/70 hover:border-moonstone/80 rounded-2xl p-6 shadow-card hover:shadow-subtle transition-all duration-150 cursor-pointer group flex flex-col sm:flex-row sm:items-start justify-between gap-5"
                    >
                      <div className="flex items-start gap-4 min-w-0 flex-1">
                        {/* Company Logo or Fallback */}
                        <div className="w-12 h-12 rounded-xl bg-aliceblue border border-timberwolf/60 flex items-center justify-center font-bold text-midnight shrink-0 overflow-hidden shadow-xs">
                          {companyLogo ? (
                            <img src={companyLogo} alt={companyName} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-base text-midnight/80 font-bold">
                              {companyName.slice(0, 2).toUpperCase()}
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-midnight/70">
                              {companyName}
                            </span>
                            {Boolean(job.featured) && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold">
                                <Sparkles className="w-3 h-3 text-amber-600" />
                                <span>Featured</span>
                              </span>
                            )}
                            {job.department && (
                              <span className="text-xs text-midnight/50">
                                • {job.department}
                              </span>
                            )}
                          </div>

                          <h2 className="text-lg sm:text-xl font-bold text-midnight group-hover:text-moonstone transition-colors leading-snug tracking-tight">
                            {job.title}
                          </h2>

                          <div className="flex flex-wrap items-center gap-y-1 gap-x-4 mt-2.5 text-xs text-midnight/65">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-moonstone" />
                              <span>{locationDisplay}</span>
                            </span>
                            <span className="flex items-center gap-1 font-semibold text-midnight">
                              <IndianRupee className="w-3.5 h-3.5 text-moonstone" />
                              <span>{formatSalary(job)}</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-midnight/40" />
                              <span>{job.experience_level}</span>
                            </span>
                          </div>

                          {/* Skills Pills */}
                          {Array.isArray(job.skills) && job.skills.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 mt-3.5">
                              {job.skills.slice(0, 4).map((skill, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 rounded-md bg-aliceblue border border-timberwolf/60 text-[11px] font-medium text-midnight/80"
                                >
                                  {skill}
                                </span>
                              ))}
                              {job.skills.length > 4 && (
                                <span className="text-[11px] text-midnight/50 font-medium pl-1">
                                  +{job.skills.length - 4} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right action block */}
                      <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-timberwolf/40">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                          job.work_mode === 'Remote'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : job.work_mode === 'Hybrid'
                            ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                            : 'bg-zinc-100 text-zinc-800 border-zinc-200'
                        }`}>
                          {job.work_mode}
                        </span>

                        <span className="inline-flex items-center gap-1 text-xs font-bold text-moonstone group-hover:text-moonstone-dark transition-colors">
                          <span>View Role</span>
                          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-6 border-t border-timberwolf/40">
                <Button
                  onClick={() => updateParam('page', String(page - 1))}
                  disabled={page <= 1}
                  variant="outline"
                  size="sm"
                  icon={<ChevronLeft className="w-4 h-4" />}
                >
                  Previous
                </Button>
                <span className="text-xs font-semibold text-midnight/70">
                  Page {page} of {totalPages}
                </span>
                <Button
                  onClick={() => updateParam('page', String(page + 1))}
                  disabled={page >= totalPages}
                  variant="outline"
                  size="sm"
                  iconRight={<ChevronRight className="w-4 h-4" />}
                >
                  Next
                </Button>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Mobile Filters Drawer */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-midnight/50 backdrop-blur-xs" onClick={() => setMobileFiltersOpen(false)} />
          <div className="relative ml-auto w-full max-w-xs bg-white h-full shadow-2xl p-6 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-timberwolf/60">
                <h3 className="text-base font-bold text-midnight">Filter Openings</h3>
                <button
                  onClick={() => setMobileFiltersOpen(false)}
                  className="p-1 rounded-lg text-midnight/60 hover:text-midnight"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Work Mode */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-midnight/70 mb-2">
                  Work Mode
                </label>
                <div className="space-y-1.5">
                  {[
                    { label: 'All Modes', value: '' },
                    { label: 'Remote', value: 'Remote' },
                    { label: 'Hybrid', value: 'Hybrid' },
                    { label: 'On-site', value: 'On-site' }
                  ].map((mode) => (
                    <button
                      key={mode.value}
                      onClick={() => {
                        updateParam('work_mode', mode.value || null);
                        setMobileFiltersOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium ${
                        workMode === mode.value ? 'bg-moonstone text-white font-bold' : 'text-midnight hover:bg-aliceblue'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Experience Level */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-midnight/70 mb-2">
                  Experience Level
                </label>
                <div className="space-y-1.5">
                  {[
                    { label: 'All Levels', value: '' },
                    { label: 'Entry Level', value: 'Entry Level' },
                    { label: 'Mid Level', value: 'Mid Level' },
                    { label: 'Senior Level', value: 'Senior Level' },
                    { label: 'Lead / Principal', value: 'Lead / Principal' },
                    { label: 'Executive', value: 'Executive' }
                  ].map((lvl) => (
                    <button
                      key={lvl.value}
                      onClick={() => {
                        updateParam('experience_level', lvl.value || null);
                        setMobileFiltersOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium ${
                        experienceLevel === lvl.value ? 'bg-moonstone text-white font-bold' : 'text-midnight hover:bg-aliceblue'
                      }`}
                    >
                      {lvl.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-timberwolf/60 space-y-2">
              <Button
                onClick={() => {
                  clearAllFilters();
                  setMobileFiltersOpen(false);
                }}
                variant="outline"
                size="sm"
                className="w-full"
              >
                Clear All
              </Button>
              <Button
                onClick={() => setMobileFiltersOpen(false)}
                variant="primary"
                size="sm"
                className="w-full"
              >
                Apply Filters
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
