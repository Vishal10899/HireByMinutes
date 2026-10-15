import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { usePageSEO } from '../hooks/usePageSEO';
import { Button } from '../components/common/Button';
import { Category } from '../types';
import { formatINR } from '../utils/currency';
import {
  FileText,
  Sparkles,
  ArrowRight,
  AlertCircle,
  HelpCircle,
  X,
  Plus,
  Clock,
  Layers,
  ChevronLeft,
  Calendar,
  CheckCircle2,
  Bookmark,
  Eye,
  Check,
  Briefcase,
  IndianRupee,
  ListChecks,
  HelpCircle as QuestionIcon
} from 'lucide-react';

export const ProjectCreatePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const editProjectId = searchParams.get('edit');
  const isEdit = Boolean(editProjectId);

  usePageSEO({
    title: isEdit ? 'Edit Project — HireByMinute' : 'Post a New Project — HireByMinute',
    description: 'Post a project requirement, specify your budget and timeline, and receive competitive proposals from verified experts.',
    canonicalPath: isEdit ? `/projects/new?edit=${editProjectId}` : '/projects/new'
  });

  const { user } = useAuth();
  const navigate = useNavigate();
  const isSubmittingRef = useRef(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingEdit, setLoadingEdit] = useState(Boolean(editProjectId));

  // Tab View: 'edit' or 'preview'
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  // Section A: Basics
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [projectType, setProjectType] = useState<'fixed' | 'hourly'>('fixed');

  // Section B: Budget
  const [budgetType, setBudgetType] = useState<'fixed' | 'range'>('fixed');
  const [budgetFixed, setBudgetFixed] = useState<number | ''>(5000);
  const [budgetMin, setBudgetMin] = useState<number | ''>(2000);
  const [budgetMax, setBudgetMax] = useState<number | ''>(8000);
  const [hourlyMin, setHourlyMin] = useState<number | ''>(500);
  const [hourlyMax, setHourlyMax] = useState<number | ''>(1500);

  // Section C: Timeline & Duration
  const [expectedStartDate, setExpectedStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState('1 to 3 months');
  const [workloadCommitment, setWorkloadCommitment] = useState('Less than 30 hrs/week');

  // Section D: Requirements & Deliverables
  const [experienceLevel, setExperienceLevel] = useState<'entry' | 'intermediate' | 'expert'>('intermediate');
  const [deliverables, setDeliverables] = useState<string[]>([]);
  const [deliverableInput, setDeliverableInput] = useState('');
  const [questions, setQuestions] = useState<string[]>([]);
  const [questionInput, setQuestionInput] = useState('');
  const [additionalInstructions, setAdditionalInstructions] = useState('');

  // Status & Feedback
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    api.getCategories()
      .then(res => {
        if (isMounted && res?.categories) {
          setCategories(res.categories);
          if (res.categories.length > 0 && !categoryId) {
            setCategoryId(res.categories[0].id);
          }
        }
      })
      .catch(err => console.error('Failed to load categories', err))
      .finally(() => {
        if (isMounted) setLoadingCategories(false);
      });

    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (!editProjectId) return;
    let isMounted = true;
    api.getProject(editProjectId)
      .then(res => {
        if (!isMounted) return;
        const p = res?.project;
        if (p) {
          setTitle(p.title || '');
          setDescription(p.description || '');
          if (p.category_id) setCategoryId(p.category_id);
          if (Array.isArray(p.skills)) setSkills(p.skills);
          if (p.project_type) setProjectType(p.project_type);
          if (p.budget_type) setBudgetType(p.budget_type);
          if (p.budget_min !== undefined && p.budget_min !== null) {
            setBudgetMin(p.budget_min);
            if (p.budget_type === 'fixed') setBudgetFixed(p.budget_min);
            if (p.project_type === 'hourly') setHourlyMin(p.budget_min);
          }
          if (p.budget_max !== undefined && p.budget_max !== null) {
            setBudgetMax(p.budget_max);
            if (p.project_type === 'hourly') setHourlyMax(p.budget_max);
          }
          if (p.expected_start_date) setExpectedStartDate(p.expected_start_date);
          if (p.deadline) setDeadline(p.deadline.slice(0, 10));
          if (p.estimated_duration) setEstimatedDuration(p.estimated_duration);
          if (p.workload_commitment) setWorkloadCommitment(p.workload_commitment);
          if (Array.isArray(p.deliverables)) setDeliverables(p.deliverables);
          if (Array.isArray(p.screening_questions)) setQuestions(p.screening_questions);
          if (p.additional_instructions) setAdditionalInstructions(p.additional_instructions);
          if (p.experience_level) setExperienceLevel(p.experience_level);
        }
      })
      .catch(err => {
        console.error('Failed to load project for editing', err);
        setFormError('Failed to load project details for editing.');
      })
      .finally(() => {
        if (isMounted) setLoadingEdit(false);
      });

    return () => { isMounted = false; };
  }, [editProjectId]);

  // Skill management
  const handleAddSkill = (e?: React.KeyboardEvent | React.MouseEvent) => {
    if (e && 'key' in e && e.key !== 'Enter') return;
    if (e) e.preventDefault();
    const clean = skillInput.trim();
    if (clean && !skills.includes(clean) && skills.length < 15) {
      setSkills(prev => [...prev, clean]);
      setSkillInput('');
    }
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setSkills(prev => prev.filter(s => s !== skillToRemove));
  };

  // Deliverable management
  const handleAddDeliverable = (e?: React.KeyboardEvent | React.MouseEvent) => {
    if (e && 'key' in e && e.key !== 'Enter') return;
    if (e) e.preventDefault();
    const clean = deliverableInput.trim();
    if (clean && !deliverables.includes(clean) && deliverables.length < 10) {
      setDeliverables(prev => [...prev, clean]);
      setDeliverableInput('');
    }
  };

  const handleRemoveDeliverable = (idx: number) => {
    setDeliverables(prev => prev.filter((_, i) => i !== idx));
  };

  // Screening questions management
  const handleAddQuestion = (e?: React.KeyboardEvent | React.MouseEvent) => {
    if (e && 'key' in e && e.key !== 'Enter') return;
    if (e) e.preventDefault();
    const clean = questionInput.trim();
    if (clean && questions.length < 5) {
      setQuestions(prev => [...prev, clean]);
      setQuestionInput('');
    }
  };

  const handleRemoveQuestion = (idx: number) => {
    setQuestions(prev => prev.filter((_, i) => i !== idx));
  };

  const selectedCategoryName = useMemo(() => {
    return categories.find(c => c.id === categoryId)?.name || 'General Projects';
  }, [categories, categoryId]);

  const validateForm = (): boolean => {
    if (!title.trim() || title.trim().length < 5) {
      setFormError('Please enter a clear project title (at least 5 characters).');
      return false;
    }
    if (title.trim().length > 200) {
      setFormError('Project title cannot exceed 200 characters.');
      return false;
    }
    if (!description.trim() || description.trim().length < 20) {
      setFormError('Please provide a detailed description of your project requirements (at least 20 characters).');
      return false;
    }

    if (projectType === 'fixed') {
      if (budgetType === 'fixed') {
        const val = Number(budgetFixed);
        if (isNaN(val) || val <= 0) {
          setFormError('Please enter a valid positive fixed budget amount.');
          return false;
        }
      } else {
        const minVal = Number(budgetMin);
        const maxVal = Number(budgetMax);
        if (isNaN(minVal) || isNaN(maxVal) || minVal <= 0 || maxVal <= 0 || maxVal < minVal) {
          setFormError('Please specify a valid budget range where maximum is greater than or equal to minimum.');
          return false;
        }
      }
    } else {
      const minRate = Number(hourlyMin);
      const maxRate = Number(hourlyMax);
      if (isNaN(minRate) || isNaN(maxRate) || minRate <= 0 || maxRate <= 0 || maxRate < minRate) {
        setFormError('Please specify a valid hourly rate range where maximum rate is greater than or equal to minimum rate.');
        return false;
      }
    }

    if (expectedStartDate && deadline) {
      const start = new Date(expectedStartDate).getTime();
      const end = new Date(deadline).getTime();
      if (end < start) {
        setFormError('Target deadline cannot precede the expected start date.');
        return false;
      }
    }

    return true;
  };

  const executeSubmission = async (targetStatus: 'OPEN' | 'DRAFT') => {
    setFormError(null);
    setSuccessBanner(null);

    if (!user) {
      setFormError('Please sign in or create an account to post a project.');
      navigate('/login?redirect=/projects/new');
      return;
    }

    if (!validateForm()) {
      return;
    }

    if (submitting || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSubmitting(true);

    let min = 0;
    let max = 0;
    if (projectType === 'fixed') {
      if (budgetType === 'fixed') {
        const val = Number(budgetFixed);
        min = val;
        max = val;
      } else {
        min = Number(budgetMin);
        max = Number(budgetMax);
      }
    } else {
      min = Number(hourlyMin);
      max = Number(hourlyMax);
    }

    const projectPayload = {
      title: title.trim(),
      description: description.trim(),
      category_id: categoryId || undefined,
      skills,
      project_type: projectType,
      budget_type: budgetType,
      budget_min: min,
      budget_max: max,
      currency: 'INR',
      deadline: deadline || undefined,
      estimated_duration: estimatedDuration,
      expected_start_date: expectedStartDate || undefined,
      workload_commitment: workloadCommitment,
      experience_level: experienceLevel,
      deliverables,
      screening_questions: questions,
      additional_instructions: additionalInstructions.trim() || undefined,
      status: targetStatus
    };

    try {
      let resProject: any = null;
      if (isEdit && editProjectId) {
        const updateRes = await api.updateProject(editProjectId, projectPayload);
        resProject = updateRes?.project || { id: editProjectId };
      } else {
        const createRes = await api.createProject(projectPayload);
        resProject = createRes?.project;
      }

      if (targetStatus === 'DRAFT') {
        setSuccessBanner(isEdit ? 'Project draft updated successfully!' : 'Project draft saved successfully!');
        setTimeout(() => {
          navigate('/client');
        }, 1200);
      } else if (resProject?.id) {
        navigate(`/projects/${resProject.id}`, { state: { justPublished: true } });
      } else {
        navigate('/client');
      }
    } catch (err: any) {
      console.error('Project save failed', err);
      setFormError(err.message || 'Failed to save project. Please verify all inputs and try again.');
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] py-8 sm:py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        
        {/* Navigation Breadcrumbs */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-midnight/60">
            <Link to="/client" className="hover:text-midnight transition-colors flex items-center gap-1 font-medium">
              <ChevronLeft className="w-4 h-4" />
              <span>Client Dashboard</span>
            </Link>
            <span>/</span>
            <Link to="/opportunities" className="hover:text-midnight transition-colors font-medium">
              Opportunities
            </Link>
            <span>/</span>
            <span className="text-midnight font-semibold">Post a Project</span>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center bg-white border border-timberwolf/60 rounded-xl p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => setActiveTab('edit')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'edit'
                  ? 'bg-midnight text-aliceblue shadow-xs'
                  : 'text-midnight/70 hover:text-midnight'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Form Editor</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (validateForm()) {
                  setActiveTab('preview');
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'preview'
                  ? 'bg-midnight text-aliceblue shadow-xs'
                  : 'text-midnight/70 hover:text-midnight'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Live Summary</span>
            </button>
          </div>
        </div>

        {/* Page Banner */}
        <div className="bg-white rounded-3xl border border-timberwolf/70 p-6 sm:p-8 shadow-subtle relative overflow-hidden">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-moonstone/10 border border-moonstone/30 text-moonstone-dark text-xs font-bold uppercase tracking-wider mb-2.5">
            <Sparkles className="w-3.5 h-3.5 text-moonstone" />
            <span>Structured Project Publishing</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-midnight tracking-tight">
            {isEdit ? 'Edit Project Requirement' : 'Publish a Project Requirement'}
          </h1>
          <p className="text-xs sm:text-sm text-midnight/70 mt-1.5 max-w-2xl leading-relaxed">
            {isEdit
              ? 'Update your project scope, budget, timeline, and requirements. Changes will update your active listing on the platform.'
              : 'Specify your project goals, required skills, timeline, and budget. Once published, your listing appears on the unified Opportunities marketplace, and verified experts can submit competitive proposals.'}
          </p>
        </div>

        {formError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-4 flex items-start gap-3 text-xs sm:text-sm animate-fade-in" role="alert">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{formError}</div>
            <button
              type="button"
              onClick={() => setFormError(null)}
              className="text-rose-500 hover:text-rose-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {successBanner && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-4 flex items-start gap-3 text-xs sm:text-sm animate-fade-in" role="status">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{successBanner}</div>
          </div>
        )}

        {activeTab === 'edit' ? (
          <form onSubmit={(e) => { e.preventDefault(); executeSubmission('OPEN'); }} className="bg-white rounded-3xl border border-timberwolf/70 p-6 sm:p-10 shadow-subtle space-y-8">
            
            {/* Section A: Project Basics */}
            <div className="space-y-5">
              <div className="pb-2 border-b border-timberwolf/30 flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-bold text-midnight tracking-tight flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-moonstone/15 text-moonstone-dark text-xs flex items-center justify-center font-bold">A</span>
                  <span>Project Basics</span>
                </h2>
                <span className="text-[11px] font-semibold text-midnight/50 uppercase">Step 1 of 5</span>
              </div>

              {/* Title */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="project-title" className="block text-xs font-bold text-midnight uppercase tracking-wider">
                    Project Title <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] text-midnight/50 font-mono">
                    {title.length}/200
                  </span>
                </div>
                <input
                  id="project-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Build a responsive business website with React & Node"
                  className="w-full px-4 py-3 rounded-xl border border-timberwolf focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm text-midnight outline-none transition-all"
                  maxLength={200}
                  required
                />
                <span className="text-[11px] text-midnight/60 mt-1 block">
                  Write a clear, concise title summarizing the core deliverable.
                </span>
              </div>

              {/* Category & Experience Level */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="project-category" className="block text-xs font-bold text-midnight uppercase tracking-wider mb-1.5">
                    Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="project-category"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-3.5 py-3 rounded-xl border border-timberwolf bg-white focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm text-midnight outline-none transition-all"
                    disabled={loadingCategories}
                    required
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="experience-level" className="block text-xs font-bold text-midnight uppercase tracking-wider mb-1.5">
                    Required Experience Level
                  </label>
                  <select
                    id="experience-level"
                    value={experienceLevel}
                    onChange={(e) => setExperienceLevel(e.target.value as any)}
                    className="w-full px-3.5 py-3 rounded-xl border border-timberwolf bg-white focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm text-midnight outline-none transition-all"
                  >
                    <option value="entry">Entry Level — Basic execution, cost-effective</option>
                    <option value="intermediate">Intermediate — Independent professional delivery</option>
                    <option value="expert">Expert — Senior technical leadership & complex scope</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label htmlFor="project-desc" className="block text-xs font-bold text-midnight uppercase tracking-wider mb-1.5">
                  Detailed Description & Scope <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="project-desc"
                  rows={6}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Explain the background problem, expected outcomes, scope of work, technical requirements, and any existing systems or references..."
                  className="w-full px-4 py-3 rounded-xl border border-timberwolf focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm text-midnight outline-none transition-all leading-relaxed"
                  required
                />
                <span className="text-[11px] text-midnight/50 mt-1 block">
                  Minimum 20 characters ({description.length} entered). Detailed specifications yield higher-quality, accurate proposals.
                </span>
              </div>

              {/* Skills Input */}
              <div>
                <label className="block text-xs font-bold text-midnight uppercase tracking-wider mb-1.5">
                  Required Skills & Tech Stack (Up to 15)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={handleAddSkill}
                    placeholder="e.g. React, PostgreSQL, Tailwind, Docker (Press Enter to add)"
                    className="flex-1 px-4 py-2.5 rounded-xl border border-timberwolf focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm text-midnight outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddSkill()}
                    className="px-4 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover transition-colors min-h-[44px] shrink-0 cursor-pointer"
                  >
                    Add Skill
                  </button>
                </div>

                {skills.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {skills.map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-aliceblue border border-timberwolf/80 text-xs font-medium text-midnight"
                      >
                        <span>{s}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveSkill(s)}
                          className="text-midnight/40 hover:text-rose-600 transition-colors cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Section B: Budget & Contract Model */}
            <div className="space-y-5">
              <div className="pb-2 border-b border-timberwolf/30 flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-bold text-midnight tracking-tight flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-moonstone/15 text-moonstone-dark text-xs flex items-center justify-center font-bold">B</span>
                  <span>Budget & Contract Model</span>
                </h2>
                <span className="text-[11px] font-semibold text-midnight/50 uppercase">Step 2 of 5</span>
              </div>

              {/* Project Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div
                  onClick={() => setProjectType('fixed')}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    projectType === 'fixed'
                      ? 'border-moonstone bg-moonstone/5 shadow-xs'
                      : 'border-timberwolf hover:border-moonstone/60 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-midnight">Fixed Price Project</span>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${projectType === 'fixed' ? 'border-moonstone bg-moonstone' : 'border-timberwolf'}`}>
                      {projectType === 'fixed' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </div>
                  <p className="text-xs text-midnight/70 mt-1 leading-relaxed">
                    Set a total budget and milestone terms. Recommended for well-defined deliverables.
                  </p>
                </div>

                <div
                  onClick={() => setProjectType('hourly')}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    projectType === 'hourly'
                      ? 'border-moonstone bg-moonstone/5 shadow-xs'
                      : 'border-timberwolf hover:border-moonstone/60 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-midnight">Hourly Rate Contract</span>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${projectType === 'hourly' ? 'border-moonstone bg-moonstone' : 'border-timberwolf'}`}>
                      {projectType === 'hourly' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </div>
                  <p className="text-xs text-midnight/70 mt-1 leading-relaxed">
                    Specify acceptable rate range. Milestones and time tracking are settled per sprint.
                  </p>
                </div>
              </div>

              {/* Fixed Price Budget Inputs */}
              {projectType === 'fixed' ? (
                <div>
                  <div className="flex items-center gap-4 mb-3">
                    <label className="text-xs font-bold text-midnight uppercase tracking-wider">
                      Budget Structure:
                    </label>
                    <div className="flex items-center gap-4 text-xs">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer font-medium text-midnight">
                        <input
                          type="radio"
                          name="budget_type"
                          checked={budgetType === 'fixed'}
                          onChange={() => setBudgetType('fixed')}
                          className="text-moonstone"
                        />
                        <span>Exact Budget</span>
                      </label>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer font-medium text-midnight">
                        <input
                          type="radio"
                          name="budget_type"
                          checked={budgetType === 'range'}
                          onChange={() => setBudgetType('range')}
                          className="text-moonstone"
                        />
                        <span>Budget Range</span>
                      </label>
                    </div>
                  </div>

                  {budgetType === 'fixed' ? (
                    <div className="max-w-xs">
                      <label htmlFor="budget-fixed" className="block text-xs font-semibold text-midnight/70 mb-1">
                        Total Project Budget (INR) <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-midnight/50">₹</span>
                        <input
                          id="budget-fixed"
                          type="number"
                          min={500}
                          step={100}
                          value={budgetFixed}
                          onChange={(e) => setBudgetFixed(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-timberwolf focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm font-mono font-bold text-midnight outline-none"
                          required
                        />
                      </div>
                      <span className="text-[11px] text-midnight/50 mt-1 block">Platform standard currency is INR (₹).</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
                      <div>
                        <label htmlFor="budget-min" className="block text-xs font-semibold text-midnight/70 mb-1">
                          Minimum (INR) <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-midnight/50">₹</span>
                          <input
                            id="budget-min"
                            type="number"
                            min={500}
                            step={100}
                            value={budgetMin}
                            onChange={(e) => setBudgetMin(e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-timberwolf focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm font-mono font-bold text-midnight outline-none"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="budget-max" className="block text-xs font-semibold text-midnight/70 mb-1">
                          Maximum (INR) <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-midnight/50">₹</span>
                          <input
                            id="budget-max"
                            type="number"
                            min={500}
                            step={100}
                            value={budgetMax}
                            onChange={(e) => setBudgetMax(e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-timberwolf focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm font-mono font-bold text-midnight outline-none"
                            required
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Hourly Rate Inputs */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
                  <div>
                    <label htmlFor="hourly-min" className="block text-xs font-semibold text-midnight/70 mb-1">
                      Min Rate (₹/hr) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-midnight/50">₹</span>
                      <input
                        id="hourly-min"
                        type="number"
                        min={100}
                        step={50}
                        value={hourlyMin}
                        onChange={(e) => setHourlyMin(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-timberwolf focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm font-mono font-bold text-midnight outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="hourly-max" className="block text-xs font-semibold text-midnight/70 mb-1">
                      Max Rate (₹/hr) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-midnight/50">₹</span>
                      <input
                        id="hourly-max"
                        type="number"
                        min={100}
                        step={50}
                        value={hourlyMax}
                        onChange={(e) => setHourlyMax(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-timberwolf focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm font-mono font-bold text-midnight outline-none"
                        required
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Section C: Timeline & Duration */}
            <div className="space-y-5">
              <div className="pb-2 border-b border-timberwolf/30 flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-bold text-midnight tracking-tight flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-moonstone/15 text-moonstone-dark text-xs flex items-center justify-center font-bold">C</span>
                  <span>Timeline & Duration</span>
                </h2>
                <span className="text-[11px] font-semibold text-midnight/50 uppercase">Step 3 of 5</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="estimated-duration" className="block text-xs font-bold text-midnight uppercase tracking-wider mb-1.5">
                    Estimated Duration <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="estimated-duration"
                    value={estimatedDuration}
                    onChange={(e) => setEstimatedDuration(e.target.value)}
                    className="w-full px-3.5 py-3 rounded-xl border border-timberwolf bg-white focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm text-midnight outline-none transition-all"
                    required
                  >
                    <option value="Less than 1 week">Less than 1 week (Sprint / Quick turnaround)</option>
                    <option value="1 to 4 weeks">1 to 4 weeks (Small to mid-size project)</option>
                    <option value="1 to 3 months">1 to 3 months (Standard project lifecycle)</option>
                    <option value="3 to 6 months">3 to 6 months (Major deliverable)</option>
                    <option value="More than 6 months">More than 6 months (Long-term engagement)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="workload-commitment" className="block text-xs font-bold text-midnight uppercase tracking-wider mb-1.5">
                    Workload Commitment
                  </label>
                  <select
                    id="workload-commitment"
                    value={workloadCommitment}
                    onChange={(e) => setWorkloadCommitment(e.target.value)}
                    className="w-full px-3.5 py-3 rounded-xl border border-timberwolf bg-white focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm text-midnight outline-none transition-all"
                  >
                    <option value="Less than 30 hrs/week">Part-time (Less than 30 hrs/week)</option>
                    <option value="30+ hrs/week">Full-time (30+ hrs/week)</option>
                    <option value="Flexible / As needed">Flexible / As needed milestone deliverables</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="expected-start" className="block text-xs font-bold text-midnight uppercase tracking-wider mb-1.5">
                    Expected Start Date (Optional)
                  </label>
                  <input
                    id="expected-start"
                    type="date"
                    value={expectedStartDate}
                    onChange={(e) => setExpectedStartDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-timberwolf focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm text-midnight outline-none transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="project-deadline" className="block text-xs font-bold text-midnight uppercase tracking-wider mb-1.5">
                    Target Completion Deadline (Optional)
                  </label>
                  <input
                    id="project-deadline"
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    min={expectedStartDate || new Date().toISOString().split('T')[0]}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-timberwolf focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm text-midnight outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Section D: Deliverables & Screening Requirements */}
            <div className="space-y-5">
              <div className="pb-2 border-b border-timberwolf/30 flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-bold text-midnight tracking-tight flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-moonstone/15 text-moonstone-dark text-xs flex items-center justify-center font-bold">D</span>
                  <span>Requirements & Deliverables</span>
                </h2>
                <span className="text-[11px] font-semibold text-midnight/50 uppercase">Step 4 of 5</span>
              </div>

              {/* Deliverables Checklist */}
              <div>
                <label className="block text-xs font-bold text-midnight uppercase tracking-wider mb-1.5">
                  Expected Deliverables (Optional, up to 10)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={deliverableInput}
                    onChange={(e) => setDeliverableInput(e.target.value)}
                    onKeyDown={handleAddDeliverable}
                    placeholder="e.g. Figma UI designs, production Node API, and deployment documentation"
                    className="flex-1 px-4 py-2.5 rounded-xl border border-timberwolf focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm text-midnight outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddDeliverable()}
                    className="px-4 py-2.5 rounded-xl border border-timberwolf bg-white text-midnight hover:bg-aliceblue text-xs font-bold transition-colors min-h-[44px] shrink-0 cursor-pointer"
                  >
                    Add Deliverable
                  </button>
                </div>

                {deliverables.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {deliverables.map((deliv, idx) => (
                      <li
                        key={idx}
                        className="flex items-center justify-between gap-3 p-3 rounded-xl bg-aliceblue/50 border border-timberwolf/60 text-xs text-midnight font-medium"
                      >
                        <span className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>{deliv}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveDeliverable(idx)}
                          className="text-midnight/40 hover:text-rose-600 transition-colors cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Candidate Screening Questions */}
              <div className="pt-2">
                <label className="block text-xs font-bold text-midnight uppercase tracking-wider mb-1.5">
                  Screening Questions for Applicants (Optional, max 5)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={questionInput}
                    onChange={(e) => setQuestionInput(e.target.value)}
                    onKeyDown={handleAddQuestion}
                    placeholder="e.g. Please share 2 live links to similar web apps you've architected"
                    className="flex-1 px-4 py-2.5 rounded-xl border border-timberwolf focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm text-midnight outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddQuestion()}
                    className="px-4 py-2.5 rounded-xl border border-timberwolf bg-white text-midnight hover:bg-aliceblue text-xs font-bold transition-colors min-h-[44px] shrink-0 cursor-pointer"
                  >
                    Add Question
                  </button>
                </div>

                {questions.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {questions.map((q, idx) => (
                      <li
                        key={idx}
                        className="flex items-center justify-between gap-3 p-3 rounded-xl bg-aliceblue/60 border border-timberwolf/60 text-xs text-midnight font-medium"
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-moonstone font-bold font-mono">Q{idx + 1}:</span>
                          <span>{q}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveQuestion(idx)}
                          className="text-midnight/40 hover:text-rose-600 transition-colors cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Additional Instructions / References */}
              <div>
                <label htmlFor="additional-instructions" className="block text-xs font-bold text-midnight uppercase tracking-wider mb-1.5">
                  Additional Instructions or Reference Links (Optional)
                </label>
                <textarea
                  id="additional-instructions"
                  rows={3}
                  value={additionalInstructions}
                  onChange={(e) => setAdditionalInstructions(e.target.value)}
                  placeholder="Include any GitHub repositories, Figma links, API documentation URLs, or confidential requirements..."
                  className="w-full px-4 py-2.5 rounded-xl border border-timberwolf focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm text-midnight outline-none transition-all leading-relaxed"
                />
              </div>
            </div>

            {/* Section E: Actions */}
            <div className="pt-6 border-t border-timberwolf/40 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => executeSubmission('DRAFT')}
                  className="px-5 py-2.5 rounded-xl border border-timberwolf bg-white text-midnight hover:bg-aliceblue font-semibold text-xs transition-colors min-h-[44px] cursor-pointer w-full sm:w-auto"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Bookmark className="w-3.5 h-3.5 text-midnight/60" />
                    <span>Save Draft</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (validateForm()) setActiveTab('preview');
                  }}
                  className="px-5 py-2.5 rounded-xl border border-timberwolf bg-aliceblue text-midnight hover:bg-timberwolf/30 font-semibold text-xs transition-colors min-h-[44px] cursor-pointer w-full sm:w-auto"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-moonstone" />
                    <span>Preview Project</span>
                  </span>
                </button>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={submitting}
                className="w-full sm:w-auto px-8"
                iconRight={<ArrowRight className="w-4 h-4 text-moonstone" />}
              >
                Publish Project & Receive Proposals
              </Button>
            </div>

          </form>
        ) : (
          /* Live Review & Summary Tab */
          <div className="space-y-6 animate-fade-in">
            <div className="bg-white rounded-3xl border border-timberwolf/70 p-6 sm:p-10 shadow-subtle space-y-6">
              
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-timberwolf/30">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                      Client Project
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-aliceblue text-midnight border border-timberwolf/40">
                      {selectedCategoryName}
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {projectType === 'fixed' ? 'Fixed Price' : 'Hourly Contract'}
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-midnight tracking-tight">
                    {title || 'Untitled Project Requirement'}
                  </h2>
                </div>

                <div className="sm:text-right bg-aliceblue/60 p-4 rounded-2xl border border-timberwolf/40 shrink-0">
                  <span className="text-[10px] font-bold text-midnight/50 uppercase tracking-wider block">Budget Specification</span>
                  <div className="text-xl font-extrabold text-midnight font-mono mt-0.5">
                    {projectType === 'fixed'
                      ? budgetType === 'fixed'
                        ? formatINR(Number(budgetFixed) || 0)
                        : `${formatINR(Number(budgetMin) || 0)} - ${formatINR(Number(budgetMax) || 0)}`
                      : `${formatINR(Number(hourlyMin) || 0)} - ${formatINR(Number(hourlyMax) || 0)}/hr`}
                  </div>
                </div>
              </div>

              {/* Specifications Overview */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 px-5 rounded-2xl bg-[#FAF8F5] border border-timberwolf/40 text-xs">
                <div>
                  <span className="text-midnight/50 font-medium block">Estimated Duration</span>
                  <span className="font-bold text-midnight mt-0.5 block">{estimatedDuration}</span>
                </div>
                <div>
                  <span className="text-midnight/50 font-medium block">Commitment</span>
                  <span className="font-bold text-midnight mt-0.5 block">{workloadCommitment}</span>
                </div>
                <div>
                  <span className="text-midnight/50 font-medium block">Experience Desired</span>
                  <span className="font-bold text-midnight capitalize mt-0.5 block">{experienceLevel}</span>
                </div>
                <div>
                  <span className="text-midnight/50 font-medium block">Target Deadline</span>
                  <span className="font-bold text-midnight mt-0.5 block">{deadline || 'Flexible'}</span>
                </div>
              </div>

              {/* Description Body */}
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-midnight uppercase tracking-wider">Project Scope & Problem</h3>
                <p className="text-sm text-midnight/80 whitespace-pre-line leading-relaxed">
                  {description || 'No description entered.'}
                </p>
              </div>

              {/* Skills */}
              {skills.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-midnight uppercase tracking-wider">Required Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    {skills.map(s => (
                      <span key={s} className="px-3 py-1 rounded-full text-xs font-medium bg-aliceblue text-midnight border border-timberwolf/60">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Deliverables */}
              {deliverables.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-midnight uppercase tracking-wider">Expected Deliverables</h3>
                  <ul className="space-y-1.5 text-xs text-midnight">
                    {deliverables.map((d, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Screening Questions */}
              {questions.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-midnight uppercase tracking-wider">Candidate Screening Questions</h3>
                  <ol className="list-decimal list-inside space-y-1 text-xs text-midnight/80">
                    {questions.map((q, i) => (
                      <li key={i} className="font-medium">{q}</li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Preview Actions */}
              <div className="pt-6 border-t border-timberwolf/40 flex flex-col sm:flex-row items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('edit')}
                  className="px-5 py-2.5 rounded-xl border border-timberwolf bg-white text-midnight hover:bg-aliceblue font-semibold text-xs transition-colors cursor-pointer w-full sm:w-auto"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <ChevronLeft className="w-4 h-4" />
                    <span>Back to Form Editor</span>
                  </span>
                </button>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => executeSubmission('DRAFT')}
                    className="px-5 py-2.5 rounded-xl border border-timberwolf bg-white text-midnight hover:bg-aliceblue font-semibold text-xs transition-colors cursor-pointer w-full sm:w-auto"
                  >
                    Save as Draft
                  </button>
                  <Button
                    type="button"
                    variant="primary"
                    size="lg"
                    isLoading={submitting}
                    onClick={() => executeSubmission('OPEN')}
                    className="w-full sm:w-auto px-8"
                    iconRight={<ArrowRight className="w-4 h-4 text-moonstone" />}
                  >
                    Publish Project Now
                  </Button>
                </div>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default ProjectCreatePage;
