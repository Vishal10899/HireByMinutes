import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { Job, Company, Category, WorkMode, JobStatus, SalaryType } from '../../types';
import { Button } from '../common/Button';
import {
  Briefcase,
  PlusCircle,
  Search,
  ExternalLink,
  Edit3,
  Trash2,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Clock,
  Sparkles,
  IndianRupee,
  Building2,
  Archive,
  Eye,
  XCircle,
  Sliders,
  X,
  Plus
} from 'lucide-react';

export const AdminJobsControl: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);

  // Create / Edit Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [saving, setSaving] = useState(false);

  // Form Fields
  const [companyId, setCompanyId] = useState('');
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [department, setDepartment] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [workMode, setWorkMode] = useState<WorkMode>('Remote');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [locationText, setLocationText] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('Mid Level');
  const [minExperience, setMinExperience] = useState(0);
  const [salaryType, setSalaryType] = useState<SalaryType>('undisclosed');
  const [salaryMin, setSalaryMin] = useState<string>('');
  const [salaryMax, setSalaryMax] = useState<string>('');
  const [currency, setCurrency] = useState('INR');
  const [deadline, setDeadline] = useState('');
  const [status, setStatus] = useState<JobStatus>('draft');
  const [featured, setFeatured] = useState(false);
  const [description, setDescription] = useState('');

  // Bullet Lists
  const [responsibilities, setResponsibilities] = useState<string[]>([]);
  const [requirements, setRequirements] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [benefits, setBenefits] = useState<string[]>([]);

  // Input states for bullet items
  const [respInput, setRespInput] = useState('');
  const [reqInput, setReqInput] = useState('');
  const [skillInput, setSkillInput] = useState('');
  const [benefitInput, setBenefitInput] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [jobsRes, compsRes, catsRes] = await Promise.all([
        api.getAdminJobs({
          status: statusFilter !== 'all' ? statusFilter : undefined,
          company_id: companyFilter !== 'all' ? companyFilter : undefined,
          search: search.trim() || undefined,
          limit: 100
        }),
        api.getAdminCompanies(),
        api.getCategories()
      ]);
      setJobs(jobsRes.jobs || []);
      setCompanies(compsRes.companies || []);
      setCategories(catsRes?.categories || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load jobs data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, companyFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const handleOpenCreate = () => {
    setEditingJob(null);
    setCompanyId(companies[0]?.id || '');
    setTitle('');
    setSlug('');
    setDepartment('');
    setCategoryId(categories[0]?.id || '');
    setWorkMode('Remote');
    setCountry('Global');
    setCity('');
    setLocationText('Remote / Global');
    setExperienceLevel('Mid Level');
    setMinExperience(2);
    setSalaryType('undisclosed');
    setSalaryMin('');
    setSalaryMax('');
    setCurrency('INR');
    setDeadline('');
    setStatus('draft');
    setFeatured(false);
    setDescription('');
    setResponsibilities([]);
    setRequirements([]);
    setSkills([]);
    setBenefits([]);
    setModalOpen(true);
  };

  const handleOpenEdit = (job: Job) => {
    setEditingJob(job);
    setCompanyId(job.company_id || '');
    setTitle(job.title || '');
    setSlug(job.slug || '');
    setDepartment(job.department || '');
    setCategoryId(job.category_id || '');
    setWorkMode(job.work_mode || 'Remote');
    setCountry(job.country || '');
    setCity(job.city || '');
    setLocationText(job.location_text || '');
    setExperienceLevel(job.experience_level || 'Mid Level');
    setMinExperience(job.min_experience || 0);
    setSalaryType(job.salary_type || 'undisclosed');
    setSalaryMin(job.salary_min ? String(job.salary_min) : '');
    setSalaryMax(job.salary_max ? String(job.salary_max) : '');
    setCurrency(job.currency || 'INR');
    setDeadline(job.application_deadline ? job.application_deadline.slice(0, 10) : '');
    setStatus(job.status || 'draft');
    setFeatured(Boolean(job.featured));
    setDescription(job.description || '');
    setResponsibilities(Array.isArray(job.responsibilities) ? [...job.responsibilities] : []);
    setRequirements(Array.isArray(job.requirements) ? [...job.requirements] : []);
    setSkills(Array.isArray(job.skills) ? [...job.skills] : []);
    setBenefits(Array.isArray(job.benefits) ? [...job.benefits] : []);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !title.trim() || !description.trim()) {
      alert('Company, job title, and description are required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        title: title.trim(),
        slug: slug.trim() || undefined,
        department: department.trim() || null,
        category_id: categoryId || null,
        work_mode: workMode,
        country: country.trim() || null,
        city: city.trim() || null,
        location_text: locationText.trim() || null,
        experience_level: experienceLevel,
        min_experience: Number(minExperience) || 0,
        salary_type: salaryType,
        salary_min: salaryMin ? Number(salaryMin) : null,
        salary_max: salaryMax ? Number(salaryMax) : null,
        currency,
        application_deadline: deadline ? new Date(deadline).toISOString() : null,
        status,
        featured: featured ? 1 : 0,
        description: description.trim(),
        responsibilities,
        requirements,
        skills,
        benefits
      };

      if (editingJob) {
        await api.updateAdminJob(editingJob.id, payload);
      } else {
        await api.createAdminJob(payload);
      }

      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to save job position');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async (job: Job) => {
    try {
      await api.publishAdminJob(job.id);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to publish job');
    }
  };

  const handleUnpublish = async (job: Job) => {
    try {
      await api.unpublishAdminJob(job.id);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to revert to draft');
    }
  };

  const handleClose = async (job: Job) => {
    try {
      await api.closeAdminJob(job.id);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to close job');
    }
  };

  const handleArchive = async (job: Job) => {
    try {
      await api.archiveAdminJob(job.id);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to archive job');
    }
  };

  const handleToggleFeatured = async (job: Job) => {
    try {
      await api.toggleFeaturedAdminJob(job.id);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to toggle featured status');
    }
  };

  const handleDelete = async (job: Job) => {
    if (!window.confirm(`Delete job "${job.title}"? All submitted candidate applications will also be deleted.`)) {
      return;
    }
    try {
      await api.deleteAdminJob(job.id);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete job');
    }
  };

  const formatSalary = (j: Job) => {
    if (j.salary_type === 'undisclosed' || (!j.salary_min && !j.salary_max)) {
      return 'Undisclosed';
    }
    const curr = j.currency || 'INR';
    const sym = curr === 'INR' ? '₹' : `${curr} `;
    if (j.salary_type === 'starting_from' && j.salary_min) {
      return `From ${sym}${Number(j.salary_min).toLocaleString()}`;
    }
    if (j.salary_type === 'up_to' && j.salary_max) {
      return `Up to ${sym}${Number(j.salary_max).toLocaleString()}`;
    }
    if (j.salary_min && j.salary_max) {
      return `${sym}${Number(j.salary_min).toLocaleString()} - ${sym}${Number(j.salary_max).toLocaleString()}`;
    }
    if (j.salary_min) {
      return `${sym}${Number(j.salary_min).toLocaleString()}`;
    }
    return 'Competitive';
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-moonstone/10 text-moonstone-dark text-[11px] font-bold border border-moonstone/30 mb-2">
            <Briefcase className="w-3.5 h-3.5 text-moonstone" />
            <span>Careers Publishing Engine</span>
          </div>
          <h1 className="text-2xl font-extrabold text-midnight tracking-tight">
            Full-Time Job Openings
          </h1>
          <p className="text-xs text-midnight/70 mt-1">
            Create, draft, publish, and close career postings with structured requirements, compensation, and SEO indexing.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 rounded-xl border border-timberwolf/70 bg-aliceblue hover:bg-white text-midnight transition-colors cursor-pointer"
            title="Reload jobs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-moonstone' : ''}`} />
          </button>
          <Button
            onClick={handleOpenCreate}
            variant="primary"
            size="sm"
            className="shadow-subtle text-xs"
            icon={<PlusCircle className="w-4 h-4" />}
          >
            Create Job Opening
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-timberwolf/70 shadow-subtle">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-midnight/40 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search job title, company, or department..."
            className="w-full pl-9 pr-3 py-2 bg-aliceblue/60 border border-timberwolf/70 rounded-xl text-xs text-midnight placeholder:text-midnight/40 focus:outline-none focus:border-moonstone"
          />
        </form>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-1.5 text-xs font-semibold text-midnight focus:outline-none focus:border-moonstone cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="closed">Closed</option>
            <option value="archived">Archived</option>
          </select>

          {/* Company Filter */}
          {companies.length > 0 && (
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-1.5 text-xs font-semibold text-midnight focus:outline-none focus:border-moonstone cursor-pointer max-w-[160px] truncate"
            >
              <option value="all">All Companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Jobs Table */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-timberwolf/60 p-6 h-28 animate-pulse" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-12 text-center shadow-card space-y-3 max-w-md mx-auto">
          <Briefcase className="w-10 h-10 text-moonstone mx-auto" />
          <h3 className="text-base font-bold text-midnight">No jobs yet.</h3>
          <p className="text-xs text-midnight/70">
            {search || statusFilter !== 'all' || companyFilter !== 'all'
              ? 'No jobs match your current search and filter settings.'
              : 'No job postings have been created yet. Post a job to attract candidates.'}
          </p>
          <div className="pt-2">
            <Button onClick={handleOpenCreate} variant="primary" size="sm">
              Create First Job
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-timberwolf/70 overflow-x-auto shadow-subtle">
          <table className="w-full text-left text-xs">
            <thead className="bg-aliceblue/60 text-midnight/60 uppercase font-semibold border-b border-timberwolf/40">
              <tr>
                <th className="py-3.5 px-4">Position</th>
                <th className="py-3.5 px-4">Company</th>
                <th className="py-3.5 px-4">Mode / Location</th>
                <th className="py-3.5 px-4">Salary</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Apps</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-timberwolf/30 text-midnight/80">
              {jobs.map((job) => {
                const cName = job.company?.name || job.company_name || 'HireByMinute Partner';

                const getStatusColor = (st: string) => {
                  switch (st) {
                    case 'published':
                      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
                    case 'draft':
                      return 'bg-amber-50 text-amber-800 border-amber-200';
                    case 'closed':
                      return 'bg-rose-50 text-rose-800 border-rose-200';
                    case 'archived':
                      return 'bg-zinc-100 text-zinc-600 border-zinc-200';
                    default:
                      return 'bg-aliceblue text-midnight border-timberwolf/60';
                  }
                };

                return (
                  <tr key={job.id} className="hover:bg-aliceblue/30 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-midnight flex items-center gap-1.5">
                        <Link
                          to={`/jobs/${job.slug || job.id}`}
                          target="_blank"
                          className="hover:text-moonstone transition-colors"
                        >
                          {job.title}
                        </Link>
                        {Boolean(job.featured) && (
                          <span title="Featured">
                            <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-midnight/50">
                        {job.department || 'General'} • {job.experience_level}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-semibold text-midnight">
                      {cName}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-medium text-midnight block">{job.work_mode}</span>
                      <span className="text-[11px] text-midnight/60 truncate block max-w-[120px]">
                        {job.location_text || job.city || job.country || 'Global'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-semibold text-midnight">
                      {formatSalary(job)}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${getStatusColor(job.status)}`}>
                        {job.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold text-midnight">
                      {Number(job.applications_count || 0)}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleToggleFeatured(job)}
                          className={`p-1.5 rounded-lg cursor-pointer ${
                            job.featured ? 'text-amber-500 hover:bg-amber-50' : 'text-midnight/40 hover:text-midnight hover:bg-aliceblue'
                          }`}
                          title="Toggle Featured"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                        </button>

                        {job.status === 'draft' ? (
                          <button
                            onClick={() => handlePublish(job)}
                            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 cursor-pointer"
                            title="Publish Job"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        ) : job.status === 'published' ? (
                          <>
                            <button
                              onClick={() => handleUnpublish(job)}
                              className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 cursor-pointer"
                              title="Revert to Draft"
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleClose(job)}
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                              title="Close Job"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : null}

                        <button
                          onClick={() => handleOpenEdit(job)}
                          className="p-1.5 rounded-lg text-midnight/60 hover:text-moonstone hover:bg-aliceblue cursor-pointer"
                          title="Edit Job"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDelete(job)}
                          className="p-1.5 rounded-lg text-midnight/60 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                          title="Delete Job"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Job Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-midnight/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-timberwolf/70 shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-6 sm:p-8 space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-timberwolf/40">
              <h3 className="text-lg font-bold text-midnight">
                {editingJob ? 'Edit Career Position' : 'Create New Career Position'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-xl text-midnight/50 hover:text-midnight hover:bg-aliceblue cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Row 1: Company & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-midnight mb-1">
                    Company Publisher <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="w-full bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-2 text-xs text-midnight focus:outline-none focus:border-moonstone cursor-pointer"
                  >
                    <option value="">Select a company</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-midnight mb-1">
                    Position Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-2 text-xs text-midnight focus:outline-none focus:border-moonstone cursor-pointer"
                  >
                    <option value="draft">Draft (Private)</option>
                    <option value="published">Published (Public)</option>
                    <option value="closed">Closed (Applications Stopped)</option>
                    <option value="archived">Archived (Hidden)</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Title & Department */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-midnight mb-1">
                    Job Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Senior Full-Stack Engineer"
                    className="w-full bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-2 text-xs text-midnight focus:outline-none focus:border-moonstone"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-midnight mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g. Core Engineering"
                    className="w-full bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-2 text-xs text-midnight focus:outline-none focus:border-moonstone"
                  />
                </div>
              </div>

              {/* Row 3: Work Mode, Experience, Category */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-midnight mb-1">
                    Work Mode
                  </label>
                  <select
                    value={workMode}
                    onChange={(e) => setWorkMode(e.target.value as any)}
                    className="w-full bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-2 text-xs text-midnight focus:outline-none focus:border-moonstone cursor-pointer"
                  >
                    <option value="Remote">Remote</option>
                    <option value="Hybrid">Hybrid</option>
                    <option value="On-site">On-site</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-midnight mb-1">
                    Experience Level
                  </label>
                  <select
                    value={experienceLevel}
                    onChange={(e) => setExperienceLevel(e.target.value)}
                    className="w-full bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-2 text-xs text-midnight focus:outline-none focus:border-moonstone cursor-pointer"
                  >
                    <option value="Entry Level">Entry Level</option>
                    <option value="Mid Level">Mid Level</option>
                    <option value="Senior Level">Senior Level</option>
                    <option value="Lead / Principal">Lead / Principal</option>
                    <option value="Executive">Executive</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-midnight mb-1">
                    Category
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-2 text-xs text-midnight focus:outline-none focus:border-moonstone cursor-pointer"
                  >
                    <option value="">Select Category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 4: Location details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-midnight mb-1">
                    Location Label
                  </label>
                  <input
                    type="text"
                    value={locationText}
                    onChange={(e) => setLocationText(e.target.value)}
                    placeholder="e.g. Remote (US / EMEA)"
                    className="w-full bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-2 text-xs text-midnight focus:outline-none focus:border-moonstone"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-midnight mb-1">
                    Country
                  </label>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="e.g. United States"
                    className="w-full bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-2 text-xs text-midnight focus:outline-none focus:border-moonstone"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-midnight mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. San Francisco"
                    className="w-full bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-2 text-xs text-midnight focus:outline-none focus:border-moonstone"
                  />
                </div>
              </div>

              {/* Row 5: Salary Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-midnight mb-1">
                    Salary Type
                  </label>
                  <select
                    value={salaryType}
                    onChange={(e) => setSalaryType(e.target.value as any)}
                    className="w-full bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-2 text-xs text-midnight focus:outline-none focus:border-moonstone cursor-pointer"
                  >
                    <option value="range">Range (Min - Max)</option>
                    <option value="starting_from">Starting From</option>
                    <option value="up_to">Up To</option>
                    <option value="undisclosed">Undisclosed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-midnight mb-1">
                    Salary Min (₹ INR)
                  </label>
                  <input
                    type="number"
                    value={salaryMin}
                    onChange={(e) => setSalaryMin(e.target.value)}
                    placeholder="120000"
                    className="w-full bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-2 text-xs text-midnight focus:outline-none focus:border-moonstone"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-midnight mb-1">
                    Salary Max (₹ INR)
                  </label>
                  <input
                    type="number"
                    value={salaryMax}
                    onChange={(e) => setSalaryMax(e.target.value)}
                    placeholder="160000"
                    className="w-full bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-2 text-xs text-midnight focus:outline-none focus:border-moonstone"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-midnight mb-1">
                    Deadline
                  </label>
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-2 text-xs text-midnight focus:outline-none focus:border-moonstone"
                  />
                </div>
              </div>

              {/* Featured checkbox */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="featured-check"
                  checked={featured}
                  onChange={(e) => setFeatured(e.target.checked)}
                  className="rounded text-moonstone focus:ring-moonstone"
                />
                <label htmlFor="featured-check" className="text-xs font-bold text-midnight cursor-pointer">
                  Feature this position on Homepage and top of Jobs page
                </label>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-midnight mb-1">
                  Job Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Overview of the mission, role objectives, and team context..."
                  className="w-full bg-aliceblue/60 border border-timberwolf/70 rounded-xl p-3 text-xs text-midnight focus:outline-none focus:border-moonstone resize-none"
                />
              </div>

              {/* Responsibilities */}
              <div>
                <label className="block text-xs font-bold text-midnight mb-1">
                  Key Responsibilities
                </label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={respInput}
                    onChange={(e) => setRespInput(e.target.value)}
                    placeholder="Add a responsibility bullet..."
                    className="flex-1 bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-1.5 text-xs text-midnight focus:outline-none focus:border-moonstone"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (respInput.trim()) {
                          setResponsibilities([...responsibilities, respInput.trim()]);
                          setRespInput('');
                        }
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (respInput.trim()) {
                        setResponsibilities([...responsibilities, respInput.trim()]);
                        setRespInput('');
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
                {responsibilities.length > 0 && (
                  <div className="space-y-1 max-h-28 overflow-y-auto p-2 bg-aliceblue/40 rounded-xl border border-timberwolf/40 text-xs">
                    {responsibilities.map((r, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2">
                        <span className="truncate">• {r}</span>
                        <button
                          type="button"
                          onClick={() => setResponsibilities(responsibilities.filter((_, i) => i !== idx))}
                          className="text-rose-500 hover:text-rose-700 p-0.5"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Requirements */}
              <div>
                <label className="block text-xs font-bold text-midnight mb-1">
                  Requirements & Qualifications
                </label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={reqInput}
                    onChange={(e) => setReqInput(e.target.value)}
                    placeholder="Add a requirement bullet..."
                    className="flex-1 bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-1.5 text-xs text-midnight focus:outline-none focus:border-moonstone"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (reqInput.trim()) {
                          setRequirements([...requirements, reqInput.trim()]);
                          setReqInput('');
                        }
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (reqInput.trim()) {
                        setRequirements([...requirements, reqInput.trim()]);
                        setReqInput('');
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
                {requirements.length > 0 && (
                  <div className="space-y-1 max-h-28 overflow-y-auto p-2 bg-aliceblue/40 rounded-xl border border-timberwolf/40 text-xs">
                    {requirements.map((req, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2">
                        <span className="truncate">• {req}</span>
                        <button
                          type="button"
                          onClick={() => setRequirements(requirements.filter((_, i) => i !== idx))}
                          className="text-rose-500 hover:text-rose-700 p-0.5"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Skills */}
              <div>
                <label className="block text-xs font-bold text-midnight mb-1">
                  Required Skills & Tech Stack
                </label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    placeholder="e.g. React, PostgreSQL, Docker"
                    className="flex-1 bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-1.5 text-xs text-midnight focus:outline-none focus:border-moonstone"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (skillInput.trim()) {
                          setSkills([...skills, skillInput.trim()]);
                          setSkillInput('');
                        }
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (skillInput.trim()) {
                        setSkills([...skills, skillInput.trim()]);
                        setSkillInput('');
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
                {skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-2 bg-aliceblue/40 rounded-xl border border-timberwolf/40">
                    {skills.map((s, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-white border border-timberwolf/60 text-xs font-medium text-midnight"
                      >
                        <span>{s}</span>
                        <button
                          type="button"
                          onClick={() => setSkills(skills.filter((_, i) => i !== idx))}
                          className="text-midnight/40 hover:text-rose-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-timberwolf/40">
                <Button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  variant="outline"
                  size="sm"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : editingJob ? 'Update Position' : 'Create Position'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
