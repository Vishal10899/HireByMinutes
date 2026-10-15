import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { usePageSEO } from '../hooks/usePageSEO';
import { Button } from '../components/common/Button';
import { Category } from '../types';
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
  ChevronLeft
} from 'lucide-react';

export const ProjectCreatePage: React.FC = () => {
  usePageSEO({
    title: 'Post a New Project — HireByMinute',
    description: 'Post a project requirement, specify your budget and timeline, and receive competitive proposals from verified experts.',
    canonicalPath: '/projects/new'
  });

  const { user } = useAuth();
  const navigate = useNavigate();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [projectType, setProjectType] = useState<'fixed' | 'hourly'>('fixed');
  const [budgetType, setBudgetType] = useState<'fixed' | 'range'>('fixed');
  const [budgetFixed, setBudgetFixed] = useState<number | ''>(5000);
  const [budgetMin, setBudgetMin] = useState<number | ''>(2000);
  const [budgetMax, setBudgetMax] = useState<number | ''>(8000);
  const [estimatedDuration, setEstimatedDuration] = useState('1 to 3 months');
  const [deadline, setDeadline] = useState('');
  const [experienceLevel, setExperienceLevel] = useState<'entry' | 'intermediate' | 'expert'>('intermediate');
  const [questions, setQuestions] = useState<string[]>([]);
  const [questionInput, setQuestionInput] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!user) {
      setFormError('Please sign in or create an account to post a project.');
      navigate('/login?redirect=/projects/new');
      return;
    }

    if (!title.trim() || title.trim().length < 5) {
      setFormError('Please enter a clear project title (at least 5 characters).');
      return;
    }

    if (!description.trim() || description.trim().length < 20) {
      setFormError('Please provide a detailed description of your project requirements (at least 20 characters).');
      return;
    }

    let min = 0;
    let max = 0;
    if (budgetType === 'fixed') {
      const val = Number(budgetFixed);
      if (isNaN(val) || val <= 0) {
        setFormError('Please enter a valid fixed budget amount.');
        return;
      }
      min = val;
      max = val;
    } else {
      const minVal = Number(budgetMin);
      const maxVal = Number(budgetMax);
      if (isNaN(minVal) || isNaN(maxVal) || minVal <= 0 || maxVal <= 0 || maxVal < minVal) {
        setFormError('Please specify a valid budget range where maximum is greater than or equal to minimum.');
        return;
      }
      min = minVal;
      max = maxVal;
    }

    try {
      setSubmitting(true);
      const res = await api.createProject({
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
        experience_level: experienceLevel,
        screening_questions: questions
      });

      if (res?.project?.id) {
        navigate(`/projects/${res.project.id}`, { state: { justPublished: true } });
      } else {
        navigate('/client');
      }
    } catch (err: any) {
      console.error('Project creation failed', err);
      setFormError(err.message || 'Failed to publish project. Please verify all fields.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] py-8 sm:py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-midnight/60">
          <Link to="/client" className="hover:text-midnight transition-colors flex items-center gap-1 font-medium">
            <ChevronLeft className="w-4 h-4" />
            <span>Client Dashboard</span>
          </Link>
          <span>/</span>
          <span className="text-midnight font-semibold">Post a Project</span>
        </div>

        {/* Page Header */}
        <div className="bg-white rounded-3xl border border-timberwolf/70 p-6 sm:p-8 shadow-subtle relative overflow-hidden">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-moonstone/10 border border-moonstone/30 text-moonstone-dark text-xs font-bold uppercase tracking-wider mb-3">
            <Sparkles className="w-3.5 h-3.5 text-moonstone" />
            <span>Long-Term & Fixed-Scope Hiring</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-midnight tracking-tight">
            Publish a Project Requirement
          </h1>
          <p className="text-xs sm:text-sm text-midnight/70 mt-2 max-w-2xl leading-relaxed">
            Describe your project goals, required skills, and budget. Receive competitive proposals from verified specialists, compare approaches, and hire under safe milestone terms.
          </p>
        </div>

        {formError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-4 flex items-start gap-3 text-xs sm:text-sm animate-fade-in">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{formError}</div>
            <button
              type="button"
              onClick={() => setFormError(null)}
              className="text-rose-500 hover:text-rose-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-timberwolf/70 p-6 sm:p-10 shadow-subtle space-y-8">
          
          {/* Section 1: Title & Category */}
          <div className="space-y-5">
            <h2 className="text-base sm:text-lg font-bold text-midnight tracking-tight flex items-center gap-2 pb-2 border-b border-timberwolf/30">
              <span className="w-6 h-6 rounded-full bg-moonstone/15 text-moonstone-dark text-xs flex items-center justify-center font-bold">1</span>
              <span>Project Overview</span>
            </h2>

            {/* Title */}
            <div>
              <label htmlFor="project-title" className="block text-xs font-bold text-midnight uppercase tracking-wider mb-1.5">
                Project Title <span className="text-rose-500">*</span>
              </label>
              <input
                id="project-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Build a Full-Stack React & Node SaaS Platform with Payment Integration"
                className="w-full px-4 py-3 rounded-xl border border-timberwolf focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm text-midnight outline-none transition-all"
                maxLength={200}
                required
              />
              <span className="text-[11px] text-midnight/50 mt-1 block">
                Be specific. A descriptive title attracts relevant experts quickly ({title.length}/200).
              </span>
            </div>

            {/* Category */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="project-category" className="block text-xs font-bold text-midnight uppercase tracking-wider mb-1.5">
                  Category
                </label>
                <select
                  id="project-category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-xl border border-timberwolf bg-white focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm text-midnight outline-none transition-all"
                  disabled={loadingCategories}
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
                  Experience Level Desired
                </label>
                <select
                  id="experience-level"
                  value={experienceLevel}
                  onChange={(e) => setExperienceLevel(e.target.value as any)}
                  className="w-full px-3.5 py-3 rounded-xl border border-timberwolf bg-white focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm text-midnight outline-none transition-all"
                >
                  <option value="entry">Entry Level — Looking for basic task execution & affordability</option>
                  <option value="intermediate">Intermediate — Looking for experienced, independent delivery</option>
                  <option value="expert">Expert — Looking for comprehensive technical leadership & mastery</option>
                </select>
              </div>
            </div>

            {/* Skills */}
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
                  placeholder="e.g. React, PostgreSQL, Docker (Press Enter to add)"
                  className="flex-1 px-4 py-2.5 rounded-xl border border-timberwolf focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm text-midnight outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => handleAddSkill()}
                  className="px-4 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover transition-colors min-h-[44px] shrink-0"
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
                        className="text-midnight/40 hover:text-rose-600 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Scope & Description */}
          <div className="space-y-5">
            <h2 className="text-base sm:text-lg font-bold text-midnight tracking-tight flex items-center gap-2 pb-2 border-b border-timberwolf/30">
              <span className="w-6 h-6 rounded-full bg-moonstone/15 text-moonstone-dark text-xs flex items-center justify-center font-bold">2</span>
              <span>Project Description & Scope</span>
            </h2>

            <div>
              <label htmlFor="project-desc" className="block text-xs font-bold text-midnight uppercase tracking-wider mb-1.5">
                Detailed Specifications <span className="text-rose-500">*</span>
              </label>
              <textarea
                id="project-desc"
                rows={7}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your project deliverables, key milestones, requirements, existing architecture or references, and what success looks like..."
                className="w-full px-4 py-3 rounded-xl border border-timberwolf focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm text-midnight outline-none transition-all leading-relaxed"
                required
              />
              <span className="text-[11px] text-midnight/50 mt-1 block">
                Detailed requirements help professionals give realistic estimates and reduce misunderstandings ({description.length} chars).
              </span>
            </div>

            {/* Screening Questions (Optional) */}
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
                  placeholder="e.g. Please share 2 links to past applications built with React & PostgreSQL"
                  className="flex-1 px-4 py-2.5 rounded-xl border border-timberwolf focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm text-midnight outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => handleAddQuestion()}
                  className="px-4 py-2.5 rounded-xl border border-timberwolf bg-white text-midnight hover:bg-aliceblue text-xs font-bold transition-colors min-h-[44px] shrink-0"
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
                        <span className="text-moonstone font-bold">Q{idx + 1}:</span>
                        <span>{q}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveQuestion(idx)}
                        className="text-midnight/40 hover:text-rose-600 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Section 3: Budget & Timeline */}
          <div className="space-y-5">
            <h2 className="text-base sm:text-lg font-bold text-midnight tracking-tight flex items-center gap-2 pb-2 border-b border-timberwolf/30">
              <span className="w-6 h-6 rounded-full bg-moonstone/15 text-moonstone-dark text-xs flex items-center justify-center font-bold">3</span>
              <span>Budget & Timeline</span>
            </h2>

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
                  <span className="font-bold text-sm text-midnight">Fixed Price Contract</span>
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${projectType === 'fixed' ? 'border-moonstone bg-moonstone' : 'border-timberwolf'}`}>
                    {projectType === 'fixed' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </div>
                <p className="text-xs text-midnight/70 mt-1 leading-relaxed">
                  Best for defined projects with clear deliverables and milestones.
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
                  Best for ongoing advisory, flexible iteration, or evolving scope.
                </p>
              </div>
            </div>

            {/* Budget Configuration */}
            <div>
              <div className="flex items-center gap-4 mb-3">
                <label className="text-xs font-bold text-midnight uppercase tracking-wider">
                  Budget Structure:
                </label>
                <div className="flex items-center gap-3 text-xs">
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
                    <span>Budget Range (Min - Max)</span>
                  </label>
                </div>
              </div>

              {budgetType === 'fixed' ? (
                <div className="max-w-xs">
                  <label htmlFor="budget-fixed" className="block text-xs font-semibold text-midnight/70 mb-1">
                    Total Estimated Amount (INR)
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
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
                  <div>
                    <label htmlFor="budget-min" className="block text-xs font-semibold text-midnight/70 mb-1">
                      Minimum (INR)
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
                      Maximum (INR)
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

            {/* Timeline */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="estimated-duration" className="block text-xs font-bold text-midnight uppercase tracking-wider mb-1.5">
                  Estimated Project Duration
                </label>
                <select
                  id="estimated-duration"
                  value={estimatedDuration}
                  onChange={(e) => setEstimatedDuration(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-xl border border-timberwolf bg-white focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm text-midnight outline-none transition-all"
                >
                  <option value="Less than 1 week">Less than 1 week (Quick sprint)</option>
                  <option value="1 to 4 weeks">1 to 4 weeks (Standard small project)</option>
                  <option value="1 to 3 months">1 to 3 months (Comprehensive deliverable)</option>
                  <option value="3 to 6 months">3 to 6 months (Major system build)</option>
                  <option value="More than 6 months">More than 6 months (Long-term engagement)</option>
                </select>
              </div>

              <div>
                <label htmlFor="project-deadline" className="block text-xs font-bold text-midnight uppercase tracking-wider mb-1.5">
                  Target Delivery Deadline (Optional)
                </label>
                <input
                  id="project-deadline"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-timberwolf focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm text-midnight outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* Submission Action */}
          <div className="pt-6 border-t border-timberwolf/40 flex flex-col sm:flex-row items-center justify-between gap-4">
            <Link
              to="/client"
              className="text-xs font-semibold text-midnight/70 hover:text-midnight transition-colors"
            >
              Cancel & Return to Dashboard
            </Link>

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

      </div>
    </div>
  );
};

export default ProjectCreatePage;
