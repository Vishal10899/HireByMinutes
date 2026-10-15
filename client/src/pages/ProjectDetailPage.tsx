import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { usePageSEO } from '../hooks/usePageSEO';
import { Project, ProjectProposal } from '../types';
import { formatINR } from '../utils/currency';
import { Button } from '../components/common/Button';
import {
  Clock,
  Briefcase,
  ChevronLeft,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FileText,
  UserCheck,
  Send,
  Plus,
  Trash2,
  X,
  ShieldCheck,
  ArrowRight
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [project, setProject] = useState<Project | null>(null);
  const [userProposal, setUserProposal] = useState<ProjectProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Proposal form state
  const [bidAmount, setBidAmount] = useState<number | ''>('');
  const [estimatedDays, setEstimatedDays] = useState<number | ''>(7);
  const [coverLetter, setCoverLetter] = useState('');
  const [milestones, setMilestones] = useState<Array<{ title: string; description: string; amount: number }>>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [submittingProposal, setSubmittingProposal] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

  // Banner for fresh publication
  const [showPublishedBanner, setShowPublishedBanner] = useState(Boolean(location.state?.justPublished));

  usePageSEO({
    title: project ? `${project.title} — HireByMinute Projects` : 'Project Details — HireByMinute',
    description: project?.description?.slice(0, 160) || 'View project scope, requirements, and submit a competitive proposal on HireByMinute.',
    canonicalPath: id ? `/projects/${id}` : '/projects'
  });

  const loadProject = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getProject(id);
      setProject(res.project);
      setUserProposal(res.user_proposal || null);
      if (res.project?.budget_min && !bidAmount) {
        setBidAmount(res.project.budget_min);
      }
      if (res.project?.screening_questions && answers.length === 0) {
        setAnswers(new Array(res.project.screening_questions.length).fill(''));
      }
    } catch (err: any) {
      console.error('Failed to load project details', err);
      setError(err.message || 'Project not found or unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProject();
  }, [id, user?.id]);

  const handleAddMilestone = () => {
    if (milestones.length < 5) {
      setMilestones(prev => [
        ...prev,
        { title: `Milestone ${prev.length + 1}`, description: '', amount: 1000 }
      ]);
    }
  };

  const handleRemoveMilestone = (index: number) => {
    setMilestones(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleMilestoneChange = (index: number, field: 'title' | 'description' | 'amount', value: any) => {
    setMilestones(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleAnswerChange = (index: number, val: string) => {
    setAnswers(prev => {
      const copy = [...prev];
      copy[index] = val;
      return copy;
    });
  };

  const handleSubmitProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    setProposalError(null);

    if (!user) {
      navigate(`/login?redirect=/projects/${project.id}`);
      return;
    }

    const amount = Number(bidAmount);
    if (isNaN(amount) || amount <= 0) {
      setProposalError('Please provide a valid bid amount.');
      return;
    }

    if (!coverLetter.trim() || coverLetter.trim().length < 15) {
      setProposalError('Please provide a professional cover letter explaining your approach (at least 15 characters).');
      return;
    }

    try {
      setSubmittingProposal(true);
      await api.submitProposal(project.id, {
        bid_amount: amount,
        estimated_days: Number(estimatedDays) || 7,
        cover_letter: coverLetter.trim(),
        milestones: milestones.length > 0 ? milestones : undefined,
        answers: answers.length > 0 ? answers : undefined
      });

      confetti({ particleCount: 80, spread: 60 });
      await loadProject();
    } catch (err: any) {
      console.error('Proposal submission failed', err);
      setProposalError(err.message || 'Failed to submit proposal. Please verify all fields.');
    } finally {
      setSubmittingProposal(false);
    }
  };

  const handleWithdrawProposal = async () => {
    if (!userProposal) return;
    if (!window.confirm('Are you sure you want to withdraw your proposal? This action cannot be undone.')) return;

    try {
      setWithdrawing(true);
      await api.withdrawProposal(userProposal.id);
      await loadProject();
    } catch (err: any) {
      alert(err.message || 'Failed to withdraw proposal');
    } finally {
      setWithdrawing(false);
    }
  };

  const handleCloseProject = async () => {
    if (!project) return;
    if (!window.confirm('Are you sure you want to close this project? It will no longer receive new proposals.')) return;
    try {
      await api.closeProject(project.id);
      await loadProject();
    } catch (err: any) {
      alert(err.message || 'Failed to close project');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] py-20 text-center space-y-3">
        <div className="w-10 h-10 border-2 border-moonstone border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs font-medium text-midnight/70">Loading project specification...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] py-20 px-4">
        <div className="max-w-md mx-auto bg-white rounded-3xl border border-timberwolf/70 p-8 text-center space-y-4 shadow-subtle">
          <AlertCircle className="w-10 h-10 text-rose-600 mx-auto" />
          <h2 className="text-lg font-bold text-midnight">Project Unavailable</h2>
          <p className="text-xs text-midnight/70">{error || 'This project does not exist or has been removed.'}</p>
          <Button to="/projects" variant="primary" size="sm">
            Browse All Projects
          </Button>
        </div>
      </div>
    );
  }

  const isOwner = user?.id === project.client_id;
  const isHiredExpert = user?.id === project.hired_provider_id;
  const canApply = !isOwner && project.status === 'OPEN' && !userProposal;

  return (
    <div className="min-h-screen bg-[#FAF8F5] py-8 sm:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-midnight/60">
          <Link to="/projects" className="hover:text-midnight transition-colors flex items-center gap-1 font-medium">
            <ChevronLeft className="w-4 h-4" />
            <span>Project Feed</span>
          </Link>
          <span>/</span>
          <span className="text-midnight font-semibold truncate max-w-sm">{project.title}</span>
        </div>

        {/* Just Published Success Banner */}
        {showPublishedBanner && (
          <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl p-4 flex items-center justify-between gap-4 text-xs sm:text-sm animate-fade-in">
            <div className="flex items-center gap-2.5 font-semibold">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>Your project is now published and visible to verified specialists across the marketplace!</span>
            </div>
            <button
              onClick={() => setShowPublishedBanner(false)}
              className="text-emerald-700 hover:text-emerald-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Owner Management Notification Header */}
        {isOwner && (
          <div className="bg-white rounded-3xl border border-moonstone/40 p-5 sm:p-6 shadow-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-moonstone-dark block">
                Project Owner Control Panel
              </span>
              <p className="text-sm font-bold text-midnight">
                You have received <strong>{project.proposals_count}</strong> {project.proposals_count === 1 ? 'proposal' : 'proposals'} for this project.
              </p>
              <p className="text-xs text-midnight/70">
                Compare bids, review expert profiles, and hire the winning professional.
              </p>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <Button
                to={`/projects/${project.id}/proposals`}
                variant="primary"
                size="sm"
                className="font-bold text-xs"
                iconRight={<ArrowRight className="w-4 h-4 text-moonstone" />}
              >
                Review & Compare Proposals ({project.proposals_count})
              </Button>
              {project.status === 'OPEN' && (
                <button
                  type="button"
                  onClick={handleCloseProject}
                  className="px-3.5 py-2 rounded-xl border border-timberwolf hover:border-rose-300 text-midnight/70 hover:text-rose-700 text-xs font-semibold transition-colors min-h-[44px]"
                >
                  Close Project
                </button>
              )}
            </div>
          </div>
        )}

        {/* Main Grid: 2 Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Scope, Specs, Proposal Form (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Project Details Card */}
            <div className="bg-white rounded-3xl border border-timberwolf/70 p-6 sm:p-8 shadow-subtle space-y-6">
              
              {/* Badges & Meta */}
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                  project.status === 'IN_PROGRESS'
                    ? 'bg-blue-50 text-blue-800 border border-blue-200'
                    : project.status === 'COMPLETED'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                }`}>
                  {project.status === 'IN_PROGRESS' ? 'Active Contract' : project.status === 'COMPLETED' ? 'Completed' : 'Open for Proposals'}
                </span>

                {project.category_name && (
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-aliceblue text-midnight border border-timberwolf/60">
                    {project.category_name}
                  </span>
                )}

                <span className="px-3 py-1 rounded-full text-xs font-medium capitalize bg-amber-50 text-amber-800 border border-amber-200">
                  {project.experience_level} Experience
                </span>
              </div>

              {/* Title */}
              <h1 className="text-2xl sm:text-3xl font-extrabold text-midnight tracking-tight leading-tight">
                {project.title}
              </h1>

              {/* Sub-meta */}
              <div className="flex flex-wrap items-center gap-4 text-xs text-midnight/60 pb-4 border-b border-timberwolf/30 font-medium">
                <span>Posted {new Date(project.created_at).toLocaleDateString()}</span>
                <span>•</span>
                <span>{project.proposals_count} Proposals Submitted</span>
                {project.deadline && (
                  <>
                    <span>•</span>
                    <span>Target Deadline: {new Date(project.deadline).toLocaleDateString()}</span>
                  </>
                )}
              </div>

              {/* Description Content */}
              <div className="space-y-3">
                <h2 className="text-xs font-bold text-midnight uppercase tracking-wider">
                  Project Description & Requirements
                </h2>
                <div className="text-sm text-midnight/80 leading-relaxed whitespace-pre-line font-normal">
                  {project.description}
                </div>
              </div>

              {/* Skills Required */}
              {project.skills && project.skills.length > 0 && (
                <div className="space-y-2.5 pt-4 border-t border-timberwolf/30">
                  <h3 className="text-xs font-bold text-midnight uppercase tracking-wider">
                    Skills & Tech Stack
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {project.skills.map((skill) => (
                      <span
                        key={skill}
                        className="px-3 py-1 rounded-lg text-xs font-semibold bg-aliceblue text-midnight border border-timberwolf/70"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Screening Questions (if any) */}
              {project.screening_questions && project.screening_questions.length > 0 && (
                <div className="space-y-2.5 pt-4 border-t border-timberwolf/30">
                  <h3 className="text-xs font-bold text-midnight uppercase tracking-wider">
                    Screening Questions For Candidates
                  </h3>
                  <ul className="space-y-2 text-xs text-midnight/80">
                    {project.screening_questions.map((q, idx) => (
                      <li key={idx} className="flex items-start gap-2 p-3 rounded-xl bg-aliceblue/60 border border-timberwolf/40">
                        <span className="font-bold text-moonstone shrink-0">Q{idx + 1}:</span>
                        <span>{q}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            </div>

            {/* If Expert has already submitted a proposal */}
            {userProposal && (
              <div className="bg-white rounded-3xl border border-moonstone/40 p-6 sm:p-8 shadow-subtle space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-timberwolf/30">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-moonstone-dark block">
                      Your Submission
                    </span>
                    <h3 className="text-lg font-bold text-midnight">
                      Your Submitted Proposal
                    </h3>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    userProposal.status === 'HIRED'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : userProposal.status === 'SHORTLISTED'
                      ? 'bg-blue-100 text-blue-800 border border-blue-300'
                      : userProposal.status === 'REJECTED'
                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}>
                    {userProposal.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="p-3 rounded-xl bg-aliceblue/60 border border-timberwolf/40">
                    <span className="text-midnight/60 block">Proposed Price:</span>
                    <span className="text-base font-bold text-midnight font-mono mt-0.5 block">
                      {formatINR(userProposal.bid_amount)}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-aliceblue/60 border border-timberwolf/40">
                    <span className="text-midnight/60 block">Estimated Delivery:</span>
                    <span className="text-base font-bold text-midnight mt-0.5 block">
                      {userProposal.delivery_time}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-semibold text-midnight/70 block mb-1">Your Cover Letter:</span>
                  <p className="text-xs sm:text-sm text-midnight/80 leading-relaxed whitespace-pre-line p-4 rounded-xl bg-aliceblue/40 border border-timberwolf/40">
                    {userProposal.cover_letter}
                  </p>
                </div>

                {userProposal.status !== 'HIRED' && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleWithdrawProposal}
                      disabled={withdrawing}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-800 transition-colors"
                    >
                      {withdrawing ? 'Withdrawing...' : 'Withdraw Proposal'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Proposal Submission Form (Visible to candidates when project is open) */}
            {canApply && (
              <form onSubmit={handleSubmitProposal} className="bg-white rounded-3xl border border-timberwolf/70 p-6 sm:p-8 shadow-subtle space-y-6">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-moonstone-dark block">
                    Submit Your Offer
                  </span>
                  <h3 className="text-xl font-extrabold text-midnight tracking-tight mt-0.5">
                    Submit a Proposal
                  </h3>
                  <p className="text-xs text-midnight/70 mt-1">
                    Detail your pricing, delivery timeline, and technical approach for the client.
                  </p>
                </div>

                {proposalError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-4 text-xs font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{proposalError}</span>
                  </div>
                )}

                {/* Price and Estimated Timeline */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="bid-amount" className="block text-xs font-bold text-midnight uppercase tracking-wider mb-1.5">
                      Your Proposed Price (INR) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-midnight/50">₹</span>
                      <input
                        id="bid-amount"
                        type="number"
                        min={500}
                        step={100}
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-timberwolf focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm font-mono font-bold text-midnight outline-none"
                        required
                      />
                    </div>
                    <span className="text-[11px] text-midnight/50 mt-1 block">
                      Client budget: {formatINR(project.budget_min)}{project.budget_min !== project.budget_max ? ` - ${formatINR(project.budget_max)}` : ''}
                    </span>
                  </div>

                  <div>
                    <label htmlFor="estimated-days" className="block text-xs font-bold text-midnight uppercase tracking-wider mb-1.5">
                      Estimated Turnaround (Days) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="estimated-days"
                      type="number"
                      min={1}
                      max={365}
                      value={estimatedDays}
                      onChange={(e) => setEstimatedDays(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-4 py-2.5 rounded-xl border border-timberwolf focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm font-mono font-bold text-midnight outline-none"
                      required
                    />
                    <span className="text-[11px] text-midnight/50 mt-1 block">
                      Realistic working days to complete full deliverable
                    </span>
                  </div>
                </div>

                {/* Cover Letter */}
                <div>
                  <label htmlFor="cover-letter" className="block text-xs font-bold text-midnight uppercase tracking-wider mb-1.5">
                    Cover Letter & Implementation Approach <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    id="cover-letter"
                    rows={6}
                    value={coverLetter}
                    onChange={(e) => setCoverLetter(e.target.value)}
                    placeholder="Introduce yourself, explain how you will address the project requirements, mention relevant past experience, and clarify any scope questions..."
                    className="w-full px-4 py-3 rounded-xl border border-timberwolf focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 text-sm text-midnight outline-none transition-all leading-relaxed"
                    required
                  />
                  <span className="text-[11px] text-midnight/50 mt-1 block">
                    Clients favor candidates who demonstrate technical understanding of their specific goals ({coverLetter.length} chars).
                  </span>
                </div>

                {/* Proposed Milestones (Optional) */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-midnight uppercase tracking-wider">
                        Suggested Milestone Breakdown (Optional)
                      </h4>
                      <p className="text-[11px] text-midnight/60">
                        Propose incremental milestones to make contract reviews structured.
                      </p>
                    </div>
                    {milestones.length < 5 && (
                      <button
                        type="button"
                        onClick={handleAddMilestone}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-timberwolf bg-white hover:bg-aliceblue text-midnight text-xs font-bold transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Milestone</span>
                      </button>
                    )}
                  </div>

                  {milestones.map((m, idx) => (
                    <div key={idx} className="p-3.5 rounded-2xl bg-aliceblue/60 border border-timberwolf/60 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="text"
                          value={m.title}
                          onChange={(e) => handleMilestoneChange(idx, 'title', e.target.value)}
                          placeholder="Milestone title..."
                          className="flex-1 px-3 py-1.5 text-xs font-bold text-midnight rounded-lg border border-timberwolf bg-white outline-none"
                        />
                        <div className="relative w-32 shrink-0">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-midnight/50">₹</span>
                          <input
                            type="number"
                            min={100}
                            step={50}
                            value={m.amount}
                            onChange={(e) => handleMilestoneChange(idx, 'amount', Number(e.target.value))}
                            className="w-full pl-6 pr-2 py-1.5 text-xs font-mono font-bold text-midnight rounded-lg border border-timberwolf bg-white outline-none"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveMilestone(idx)}
                          className="text-midnight/40 hover:text-rose-600 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={m.description}
                        onChange={(e) => handleMilestoneChange(idx, 'description', e.target.value)}
                        placeholder="Deliverable description for this milestone..."
                        className="w-full px-3 py-1.5 text-xs text-midnight rounded-lg border border-timberwolf bg-white outline-none"
                      />
                    </div>
                  ))}
                </div>

                {/* Screening Questions Answers */}
                {project.screening_questions && project.screening_questions.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <h4 className="text-xs font-bold text-midnight uppercase tracking-wider">
                      Answers to Client Questions
                    </h4>
                    {project.screening_questions.map((q, idx) => (
                      <div key={idx} className="space-y-1.5">
                        <label className="block text-xs font-medium text-midnight">
                          {q}
                        </label>
                        <textarea
                          rows={2}
                          value={answers[idx] || ''}
                          onChange={(e) => handleAnswerChange(idx, e.target.value)}
                          placeholder="Your answer..."
                          className="w-full px-3 py-2 text-xs text-midnight rounded-xl border border-timberwolf bg-white outline-none"
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-4 border-t border-timberwolf/40 flex items-center justify-end">
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    isLoading={submittingProposal}
                    className="w-full sm:w-auto px-6 font-bold text-xs"
                    icon={<Send className="w-4 h-4 text-moonstone" />}
                  >
                    Submit Proposal to Client
                  </Button>
                </div>
              </form>
            )}

            {!user && (
              <div className="bg-white rounded-3xl border border-timberwolf/70 p-6 text-center space-y-3 shadow-subtle">
                <h3 className="text-base font-bold text-midnight">Interested in this project?</h3>
                <p className="text-xs text-midnight/70 max-w-sm mx-auto">
                  Sign in or register as an expert to submit a proposal and connect with this client.
                </p>
                <Button to={`/login?redirect=/projects/${project.id}`} variant="primary" size="sm">
                  Sign In to Apply
                </Button>
              </div>
            )}

          </div>

          {/* Right Column: Project & Client Summary (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Financial & Delivery Card */}
            <div className="bg-white rounded-3xl border border-timberwolf/70 p-6 shadow-subtle space-y-5">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-midnight/50 block">
                  Project Budget
                </span>
                <div className="text-2xl sm:text-3xl font-black text-midnight font-mono tracking-tight mt-0.5">
                  {project.budget_min === project.budget_max
                    ? formatINR(project.budget_min)
                    : `${formatINR(project.budget_min)} - ${formatINR(project.budget_max)}`}
                </div>
                <span className="text-xs text-midnight/60 capitalize mt-0.5 block">
                  {project.project_type} price engagement
                </span>
              </div>

              <div className="space-y-3 pt-3 border-t border-timberwolf/30 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-midnight/60">Estimated Duration:</span>
                  <span className="font-bold text-midnight">{project.estimated_duration || 'Flexible'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-midnight/60">Experience Desired:</span>
                  <span className="font-bold text-midnight capitalize">{project.experience_level}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-midnight/60">Proposals Received:</span>
                  <span className="font-bold text-midnight">{project.proposals_count}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-midnight/60">Payment Protection:</span>
                  <span className="font-bold text-emerald-700 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Approval-First</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Client Profile Card */}
            <div className="bg-white rounded-3xl border border-timberwolf/70 p-6 shadow-subtle space-y-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-midnight/50 block">
                About the Client
              </span>

              <div className="flex items-center gap-3">
                <img
                  src={project.client?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(project.client?.name || 'Client')}`}
                  alt={project.client?.name}
                  className="w-12 h-12 rounded-full object-cover border border-lightblue bg-aliceblue"
                />
                <div>
                  <h4 className="font-bold text-sm text-midnight">{project.client?.name || 'Marketplace Client'}</h4>
                  <p className="text-[11px] text-midnight/60">
                    {project.client?.city ? `${project.client.city}, ` : ''}{project.client?.country || 'Verified Client'}
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-timberwolf/30 text-xs text-midnight/70 font-medium">
                <div className="flex items-center justify-between">
                  <span>Projects Posted:</span>
                  <span className="font-bold text-midnight">{project.client?.projects_count || 1}</span>
                </div>
                {project.client?.created_at && (
                  <div className="flex items-center justify-between">
                    <span>Member Since:</span>
                    <span className="font-bold text-midnight">
                      {new Date(project.client.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};

export default ProjectDetailPage;
