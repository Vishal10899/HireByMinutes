import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { usePageSEO } from '../hooks/usePageSEO';
import { useAuth } from '../context/AuthContext';
import { Project, Category } from '../types';
import { formatINR } from '../utils/currency';
import { Button } from '../components/common/Button';
import {
  Search,
  Filter,
  Sparkles,
  Clock,
  Briefcase,
  ChevronRight,
  ChevronLeft,
  X,
  FileText,
  AlertCircle,
  PlusCircle,
  ArrowRight
} from 'lucide-react';

export const ProjectsExplorePage: React.FC = () => {
  usePageSEO({
    title: 'Find Projects & Long-Term Contracts — HireByMinute',
    description: 'Browse verified client projects, submit competitive proposals, and establish milestone contracts on HireByMinute.',
    canonicalPath: '/projects'
  });

  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [totalProjects, setTotalProjects] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters from query or state
  const searchQuery = searchParams.get('search') || '';
  const categoryFilter = searchParams.get('category') || '';
  const projectTypeFilter = searchParams.get('type') || '';
  const experienceFilter = searchParams.get('experience') || '';
  const sortOption = searchParams.get('sort') || 'newest';
  const currentPage = parseInt(searchParams.get('page') || '1', 10);

  const [localSearch, setLocalSearch] = useState(searchQuery);

  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    api.getCategories()
      .then(res => {
        if (res?.categories) setCategories(res.categories);
      })
      .catch(err => console.error('Failed to load categories', err));
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getProjects({
        search: searchQuery || undefined,
        category_id: categoryFilter || undefined,
        project_type: projectTypeFilter || undefined,
        experience_level: experienceFilter || undefined,
        sort: sortOption,
        page: currentPage,
        limit: 10
      });
      setProjects(res.projects || []);
      setTotalProjects(res.pagination?.total || 0);
      setTotalPages(res.pagination?.totalPages || 1);
    } catch (err: any) {
      console.error('Error fetching projects feed:', err);
      setError(err.message || 'Unable to load project listings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, [searchQuery, categoryFilter, projectTypeFilter, experienceFilter, sortOption, currentPage]);

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    next.set('page', '1');
    setSearchParams(next);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateParam('search', localSearch.trim());
  };

  const clearAllFilters = () => {
    setLocalSearch('');
    setSearchParams({});
  };

  const hasActiveFilters = Boolean(searchQuery || categoryFilter || projectTypeFilter || experienceFilter);

  return (
    <div className="min-h-screen bg-[#FAF8F5] py-8 sm:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Hero Section */}
        <div className="bg-white rounded-3xl border border-timberwolf/70 p-6 sm:p-10 shadow-subtle flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-moonstone/10 border border-moonstone/30 text-moonstone-dark text-xs font-bold uppercase tracking-wider">
              <Briefcase className="w-3.5 h-3.5 text-moonstone" />
              <span>Project Marketplace</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-midnight tracking-tight">
              Explore Projects & Contracts
            </h1>
            <p className="text-sm text-midnight/70 leading-relaxed">
              Find fixed-price deliverables, long-term scopes, and advisory projects posted by clients worldwide. Submit proposals and get hired directly.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            {user?.role === 'client' && (
              <Button
                to="/projects/new"
                variant="primary"
                size="md"
                className="w-full sm:w-auto font-bold text-xs"
                icon={<PlusCircle className="w-4 h-4 text-moonstone" />}
              >
                Post a Project
              </Button>
            )}
            <Button
              to="/services"
              variant="outline"
              size="md"
              className="w-full sm:w-auto font-bold text-xs"
            >
              Browse 1-on-1 Consultations
            </Button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-4 shadow-subtle space-y-4">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-midnight/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder="Search projects by keywords, skills, or deliverables..."
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-timberwolf focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm text-midnight outline-none transition-all"
              />
              {localSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setLocalSearch('');
                    updateParam('search', '');
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-midnight/40 hover:text-midnight transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover transition-colors min-h-[44px] shrink-0"
            >
              Search
            </button>
          </form>

          {/* Quick Filter Selectors */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-timberwolf/30 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-midnight/60 font-semibold flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-moonstone" />
                Filters:
              </span>

              {/* Category Filter */}
              <select
                value={categoryFilter}
                onChange={(e) => updateParam('category', e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-timberwolf/80 bg-white text-midnight font-medium text-xs outline-none focus:border-moonstone"
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              {/* Project Type Filter */}
              <select
                value={projectTypeFilter}
                onChange={(e) => updateParam('type', e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-timberwolf/80 bg-white text-midnight font-medium text-xs outline-none focus:border-moonstone"
              >
                <option value="">All Types (Fixed & Hourly)</option>
                <option value="fixed">Fixed Price Only</option>
                <option value="hourly">Hourly Only</option>
              </select>

              {/* Experience Level Filter */}
              <select
                value={experienceFilter}
                onChange={(e) => updateParam('experience', e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-timberwolf/80 bg-white text-midnight font-medium text-xs outline-none focus:border-moonstone"
              >
                <option value="">All Experience Levels</option>
                <option value="entry">Entry Level</option>
                <option value="intermediate">Intermediate</option>
                <option value="expert">Expert Level</option>
              </select>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-xs font-bold text-rose-600 hover:text-rose-800 ml-1 cursor-pointer"
                >
                  Reset Filters
                </button>
              )}
            </div>

            {/* Sorting */}
            <div className="flex items-center gap-2">
              <span className="text-midnight/60 font-semibold">Sort by:</span>
              <select
                value={sortOption}
                onChange={(e) => updateParam('sort', e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-timberwolf/80 bg-white text-midnight font-medium text-xs outline-none focus:border-moonstone"
              >
                <option value="newest">Newest First</option>
                <option value="budget_high">Highest Budget</option>
                <option value="budget_low">Lowest Budget</option>
                <option value="proposals_low">Fewest Proposals</option>
              </select>
            </div>
          </div>
        </div>

        {/* Results Header */}
        <div className="flex items-center justify-between text-xs text-midnight/70 px-1">
          <span>Showing <strong className="text-midnight">{projects.length}</strong> of <strong className="text-midnight">{totalProjects}</strong> available projects</span>
          <span>Updated continuously</span>
        </div>

        {/* Loading & Error States */}
        {loading && (
          <div className="py-20 text-center space-y-3">
            <div className="w-10 h-10 border-2 border-moonstone border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-medium text-midnight/70">Loading available projects...</p>
          </div>
        )}

        {error && !loading && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-6 text-center space-y-3 max-w-lg mx-auto">
            <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
            <h3 className="font-bold text-sm">Failed to Load Projects</h3>
            <p className="text-xs">{error}</p>
            <button
              onClick={loadProjects}
              className="px-4 py-2 bg-midnight text-aliceblue rounded-xl text-xs font-bold"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && projects.length === 0 && (
          <div className="bg-white rounded-3xl border border-timberwolf/70 p-12 text-center space-y-4 max-w-md mx-auto shadow-subtle">
            <div className="w-12 h-12 rounded-2xl bg-aliceblue flex items-center justify-center text-midnight mx-auto">
              <FileText className="w-6 h-6 text-moonstone" />
            </div>
            <h3 className="text-lg font-bold text-midnight tracking-tight">No Projects Found</h3>
            <p className="text-xs text-midnight/70 leading-relaxed">
              {hasActiveFilters
                ? 'No project postings matched your specific filters. Try expanding your search terms or clearing filters.'
                : 'There are currently no active project postings. Check back shortly or post a project yourself.'}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearAllFilters}
                className="px-4 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-bold"
              >
                Clear All Filters
              </button>
            ) : user?.role === 'client' ? (
              <Button to="/projects/new" variant="primary" size="sm">
                Post the First Project
              </Button>
            ) : null}
          </div>
        )}

        {/* Projects Listing Grid */}
        {!loading && !error && projects.length > 0 && (
          <div className="space-y-4">
            {projects.map((project) => (
              <div
                key={project.id}
                className="bg-white rounded-3xl border border-timberwolf/70 hover:border-moonstone/80 p-6 sm:p-7 shadow-subtle hover:shadow-card transition-all group"
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-5">
                  
                  {/* Left Column: Details */}
                  <div className="flex-1 space-y-3">
                    
                    {/* Header Badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {project.status === 'REVIEWING_PROPOSALS' ? 'Reviewing Offers' : 'Open for Proposals'}
                      </span>
                      {project.category_name && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-aliceblue text-midnight/80 border border-timberwolf/60">
                          {project.category_name}
                        </span>
                      )}
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium capitalize bg-amber-50 text-amber-800 border border-amber-200">
                        {project.experience_level} Level
                      </span>
                      {project.has_applied && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-moonstone/15 text-moonstone-dark border border-moonstone/30">
                          Proposal Submitted
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <Link
                      to={`/projects/${project.id}`}
                      className="block text-lg sm:text-xl font-extrabold text-midnight group-hover:text-moonstone transition-colors tracking-tight leading-snug"
                    >
                      {project.title}
                    </Link>

                    {/* Description snippet */}
                    <p className="text-xs sm:text-sm text-midnight/75 line-clamp-2 leading-relaxed">
                      {project.description}
                    </p>

                    {/* Skills Chips */}
                    {project.skills && project.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {project.skills.slice(0, 6).map((skill) => (
                          <span
                            key={skill}
                            className="px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-aliceblue text-midnight/80 border border-timberwolf/50"
                          >
                            {skill}
                          </span>
                        ))}
                        {project.skills.length > 6 && (
                          <span className="text-[11px] text-midnight/50 self-center font-medium">
                            +{project.skills.length - 6} more
                          </span>
                        )}
                      </div>
                    )}

                    {/* Meta Row */}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-midnight/60 pt-2 font-medium">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-moonstone" />
                        <span>Posted {new Date(project.created_at).toLocaleDateString()}</span>
                      </span>
                      <span>•</span>
                      <span>{project.proposals_count} {project.proposals_count === 1 ? 'proposal' : 'proposals'}</span>
                      {project.estimated_duration && (
                        <>
                          <span>•</span>
                          <span>Est: {project.estimated_duration}</span>
                        </>
                      )}
                      {project.client?.country && (
                        <>
                          <span>•</span>
                          <span>Client: {project.client.city ? `${project.client.city}, ` : ''}{project.client.country}</span>
                        </>
                      )}
                    </div>

                  </div>

                  {/* Right Column: Pricing & Action */}
                  <div className="md:w-56 shrink-0 flex flex-col justify-between items-start md:items-end border-t md:border-t-0 md:border-l border-timberwolf/40 pt-4 md:pt-0 md:pl-6 space-y-4">
                    <div className="text-left md:text-right">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-midnight/50 block">
                        {project.project_type === 'hourly' ? 'Hourly Rate' : 'Budget'}
                      </span>
                      <span className="text-xl sm:text-2xl font-black text-midnight font-mono tracking-tight block mt-0.5">
                        {project.budget_min === project.budget_max
                          ? formatINR(project.budget_min)
                          : `${formatINR(project.budget_min)} - ${formatINR(project.budget_max)}`}
                      </span>
                      <span className="text-[11px] text-midnight/55 block capitalize">
                        {project.project_type} price
                      </span>
                    </div>

                    <Link
                      to={`/projects/${project.id}`}
                      className="btn-shine w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover shadow-subtle transition-all"
                    >
                      <span>View & Apply</span>
                      <ArrowRight className="w-3.5 h-3.5 text-moonstone" />
                    </Link>
                  </div>

                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-6">
            <button
              onClick={() => updateParam('page', String(currentPage - 1))}
              disabled={currentPage <= 1}
              className="p-2 rounded-xl border border-timberwolf bg-white text-midnight disabled:opacity-40 disabled:cursor-not-allowed hover:bg-aliceblue transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-midnight px-3">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => updateParam('page', String(currentPage + 1))}
              disabled={currentPage >= totalPages}
              className="p-2 rounded-xl border border-timberwolf bg-white text-midnight disabled:opacity-40 disabled:cursor-not-allowed hover:bg-aliceblue transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

export default ProjectsExplorePage;
