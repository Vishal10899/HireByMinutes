import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { usePageSEO } from '../hooks/usePageSEO';
import { Project, ProjectProposal } from '../types';
import { formatINR } from '../utils/currency';
import { Button } from '../components/common/Button';
import {
  ChevronLeft,
  Star,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Briefcase,
  AlertCircle,
  X,
  ArrowRight,
  Filter,
  Check,
  Award
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const ProjectProposalsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [proposals, setProposals] = useState<ProjectProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Status Filter: 'all' | 'shortlisted' | 'submitted' | 'rejected'
  const [statusFilter, setStatusFilter] = useState<'all' | 'shortlisted' | 'submitted' | 'rejected'>('all');

  // Hire Confirmation Modal state
  const [hiringProposal, setHiringProposal] = useState<ProjectProposal | null>(null);
  const [hiringInProgress, setHiringInProgress] = useState(false);
  const [hireError, setHireError] = useState<string | null>(null);

  usePageSEO({
    title: project ? `Proposals for "${project.title}" — HireByMinute` : 'Project Proposals — HireByMinute',
    description: 'Compare bids, review expert profiles, and hire the right specialist for your project on HireByMinute.',
    canonicalPath: id ? `/projects/${id}/proposals` : '/projects'
  });

  const loadProposals = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getProjectProposals(id);
      setProject(res.project);
      setProposals(res.proposals || []);
    } catch (err: any) {
      console.error('Failed to load project proposals', err);
      setError(err.message || 'Unable to access proposals for this project.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProposals();
  }, [id, user?.id]);

  const handleShortlist = async (proposalId: string) => {
    try {
      await api.shortlistProposal(proposalId);
      await loadProposals();
    } catch (err: any) {
      alert(err.message || 'Failed to shortlist proposal');
    }
  };

  const handleReject = async (proposalId: string) => {
    if (!window.confirm('Are you sure you want to decline this proposal?')) return;
    try {
      await api.rejectProposal(proposalId);
      await loadProposals();
    } catch (err: any) {
      alert(err.message || 'Failed to decline proposal');
    }
  };

  const handleConfirmHire = async () => {
    if (!hiringProposal) return;
    setHireError(null);
    try {
      setHiringInProgress(true);
      const res = await api.hireProposal(hiringProposal.id);
      confetti({ particleCount: 100, spread: 70 });
      setHiringProposal(null);
      if (res?.contract?.id) {
        navigate(`/contracts/${res.contract.id}`);
      } else {
        await loadProposals();
      }
    } catch (err: any) {
      console.error('Hiring failed', err);
      setHireError(err.message || 'Failed to hire expert and establish contract.');
    } finally {
      setHiringInProgress(false);
    }
  };

  const filteredProposals = proposals.filter((p) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'shortlisted') return p.status === 'SHORTLISTED';
    if (statusFilter === 'submitted') return p.status === 'SUBMITTED';
    if (statusFilter === 'rejected') return p.status === 'REJECTED';
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] py-20 text-center space-y-3">
        <div className="w-10 h-10 border-2 border-moonstone border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs font-medium text-midnight/70">Loading submitted proposals...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] py-20 px-4">
        <div className="max-w-md mx-auto bg-white rounded-3xl border border-timberwolf/70 p-8 text-center space-y-4 shadow-subtle">
          <AlertCircle className="w-10 h-10 text-rose-600 mx-auto" />
          <h2 className="text-lg font-bold text-midnight">Access Denied or Project Not Found</h2>
          <p className="text-xs text-midnight/70">{error || 'You do not have permission to view proposals for this project.'}</p>
          <Button to="/client" variant="primary" size="sm">
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const hasHired = proposals.some(p => p.status === 'HIRED');

  return (
    <div className="min-h-screen bg-[#FAF8F5] py-8 sm:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-midnight/60">
          <Link to="/client" className="hover:text-midnight transition-colors flex items-center gap-1 font-medium">
            <ChevronLeft className="w-4 h-4" />
            <span>Dashboard</span>
          </Link>
          <span>/</span>
          <Link to={`/projects/${project.id}`} className="hover:text-midnight transition-colors truncate max-w-xs font-medium">
            {project.title}
          </Link>
          <span>/</span>
          <span className="text-midnight font-semibold">Proposals</span>
        </div>

        {/* Page Header */}
        <div className="bg-white rounded-3xl border border-timberwolf/70 p-6 sm:p-8 shadow-subtle flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-moonstone/10 text-moonstone-dark border border-moonstone/25">
                Proposals Manager
              </span>
              <span className="text-xs text-midnight/60">
                Budget: {formatINR(project.budget_min)}{project.budget_min !== project.budget_max ? ` - ${formatINR(project.budget_max)}` : ''}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-midnight tracking-tight">
              Compare Proposals for "{project.title}"
            </h1>
            <p className="text-xs sm:text-sm text-midnight/70">
              Review candidates' cover letters, proposed milestone schedules, pricing, and ratings.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              to={`/projects/${project.id}`}
              variant="outline"
              size="sm"
              className="text-xs font-bold"
            >
              View Public Page
            </Button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center justify-between gap-4 border-b border-timberwolf/40 pb-3">
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                statusFilter === 'all'
                  ? 'bg-midnight text-aliceblue shadow-xs'
                  : 'bg-white border border-timberwolf text-midnight/70 hover:text-midnight'
              }`}
            >
              All Proposals ({proposals.length})
            </button>
            <button
              onClick={() => setStatusFilter('shortlisted')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                statusFilter === 'shortlisted'
                  ? 'bg-midnight text-aliceblue shadow-xs'
                  : 'bg-white border border-timberwolf text-midnight/70 hover:text-midnight'
              }`}
            >
              Shortlisted ({proposals.filter(p => p.status === 'SHORTLISTED').length})
            </button>
            <button
              onClick={() => setStatusFilter('submitted')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                statusFilter === 'submitted'
                  ? 'bg-midnight text-aliceblue shadow-xs'
                  : 'bg-white border border-timberwolf text-midnight/70 hover:text-midnight'
              }`}
            >
              New / Submitted ({proposals.filter(p => p.status === 'SUBMITTED').length})
            </button>
          </div>

          <span className="text-xs text-midnight/60 hidden sm:inline">
            {filteredProposals.length} of {proposals.length} displayed
          </span>
        </div>

        {/* Proposals List */}
        {filteredProposals.length === 0 ? (
          <div className="bg-white rounded-3xl border border-timberwolf/70 p-12 text-center space-y-3 max-w-md mx-auto shadow-subtle">
            <Briefcase className="w-8 h-8 text-moonstone mx-auto" />
            <h3 className="font-bold text-midnight text-base">No Proposals in this View</h3>
            <p className="text-xs text-midnight/70">
              {statusFilter !== 'all'
                ? 'Try resetting the filter to view all submitted proposals.'
                : 'No experts have submitted proposals for this project yet.'}
            </p>
            {statusFilter !== 'all' && (
              <button
                onClick={() => setStatusFilter('all')}
                className="px-4 py-2 bg-midnight text-aliceblue rounded-xl text-xs font-bold"
              >
                View All Proposals
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {filteredProposals.map((proposal) => {
              const isHired = proposal.status === 'HIRED';
              const isShortlisted = proposal.status === 'SHORTLISTED';
              const isRejected = proposal.status === 'REJECTED';

              return (
                <div
                  key={proposal.id}
                  className={`bg-white rounded-3xl border p-6 sm:p-8 shadow-subtle transition-all space-y-6 ${
                    isHired
                      ? 'border-emerald-400 bg-emerald-50/20 ring-2 ring-emerald-500/20'
                      : isShortlisted
                      ? 'border-moonstone/80'
                      : 'border-timberwolf/70 hover:border-moonstone/60'
                  }`}
                >
                  
                  {/* Top Bar: Expert Profile & Bid Amount */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5 pb-5 border-b border-timberwolf/30">
                    
                    {/* Expert Identity */}
                    <div className="flex items-start gap-4">
                      <img
                        src={proposal.provider?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(proposal.provider?.full_name || 'Expert')}`}
                        alt={proposal.provider?.full_name}
                        className="w-14 h-14 rounded-2xl object-cover border border-lightblue bg-aliceblue shrink-0 shadow-xs"
                      />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-base text-midnight">
                            {proposal.provider?.full_name}
                          </h3>
                          {proposal.provider?.verified && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              <ShieldCheck className="w-3 h-3 text-emerald-600" />
                              <span>Verified</span>
                            </span>
                          )}
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isHired
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : isShortlisted
                              ? 'bg-blue-100 text-blue-800 border border-blue-300'
                              : isRejected
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}>
                            {proposal.status}
                          </span>
                        </div>

                        <p className="text-xs text-midnight/70 font-medium">
                          {proposal.provider?.headline || 'Specialist Consultant'}
                        </p>

                        <div className="flex items-center gap-3 text-xs text-midnight/60 font-medium pt-0.5">
                          {proposal.provider?.rating && (
                            <span className="flex items-center gap-1 text-amber-700 font-bold">
                              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                              <span>{proposal.provider.rating} ({proposal.provider.review_count || 0})</span>
                            </span>
                          )}
                          {proposal.provider?.experience_years ? (
                            <span>{proposal.provider.experience_years}+ yrs exp</span>
                          ) : null}
                          <span>Submitted {new Date(proposal.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Financial Terms & Turnaround */}
                    <div className="text-left sm:text-right shrink-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-midnight/50 block">
                        Proposed Bid
                      </span>
                      <span className="text-2xl font-black text-midnight font-mono tracking-tight block mt-0.5">
                        {formatINR(proposal.bid_amount)}
                      </span>
                      <span className="text-xs text-midnight/60 block mt-0.5 font-medium">
                        Delivery in {proposal.delivery_time}
                      </span>
                    </div>

                  </div>

                  {/* Middle Section: Cover Letter & Approach */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-midnight uppercase tracking-wider block">
                      Cover Letter & Strategy
                    </span>
                    <p className="text-xs sm:text-sm text-midnight/80 leading-relaxed whitespace-pre-line p-4 rounded-2xl bg-aliceblue/40 border border-timberwolf/40 font-normal">
                      {proposal.cover_letter}
                    </p>
                  </div>

                  {/* Proposed Milestones (if any) */}
                  {proposal.milestones && proposal.milestones.length > 0 && (
                    <div className="space-y-2.5 pt-2 border-t border-timberwolf/30">
                      <span className="text-xs font-bold text-midnight uppercase tracking-wider block">
                        Proposed Milestones ({proposal.milestones.length})
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {proposal.milestones.map((m, idx) => (
                          <div key={idx} className="p-3 rounded-xl bg-aliceblue/60 border border-timberwolf/50 space-y-1 text-xs">
                            <div className="flex items-center justify-between font-bold text-midnight">
                              <span className="truncate">{m.title}</span>
                              <span className="font-mono text-moonstone-dark">{formatINR(m.amount)}</span>
                            </div>
                            {m.description && (
                              <p className="text-[11px] text-midnight/70 line-clamp-2">{m.description}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Skills */}
                  {proposal.provider?.skills && proposal.provider.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {proposal.provider.skills.slice(0, 8).map((sk) => (
                        <span key={sk} className="px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-white text-midnight/80 border border-timberwolf/60">
                          {sk}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Action Bar */}
                  <div className="pt-4 border-t border-timberwolf/30 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {!isHired && !isRejected && (
                        <button
                          type="button"
                          onClick={() => handleReject(proposal.id)}
                          className="px-3.5 py-2 rounded-xl border border-timberwolf text-midnight/70 hover:text-rose-700 hover:border-rose-300 text-xs font-semibold transition-colors"
                        >
                          Decline
                        </button>
                      )}

                      {!isHired && proposal.status === 'SUBMITTED' && (
                        <button
                          type="button"
                          onClick={() => handleShortlist(proposal.id)}
                          className="px-3.5 py-2 rounded-xl border border-moonstone/40 bg-moonstone/10 text-moonstone-dark hover:bg-moonstone/20 text-xs font-bold transition-colors"
                        >
                          Shortlist Candidate
                        </button>
                      )}
                    </div>

                    {!hasHired && !isRejected && (
                      <Button
                        type="button"
                        onClick={() => setHiringProposal(proposal)}
                        variant="primary"
                        size="md"
                        className="px-6 font-bold text-xs"
                        iconRight={<Award className="w-4 h-4 text-moonstone" />}
                      >
                        Hire {proposal.provider?.full_name?.split(' ')[0] || 'Expert'}
                      </Button>
                    )}

                    {isHired && (
                      <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Hired Candidate</span>
                      </span>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        )}

        {/* Hire Confirmation Modal */}
        {hiringProposal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-midnight/60 backdrop-blur-xs animate-fade-in">
            <div className="bg-white rounded-3xl border border-timberwolf max-w-lg w-full p-6 sm:p-8 shadow-elevated space-y-6 relative">
              
              <button
                type="button"
                onClick={() => setHiringProposal(null)}
                className="absolute right-5 top-5 text-midnight/40 hover:text-midnight transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-moonstone-dark block">
                  Contract Agreement
                </span>
                <h3 className="text-xl sm:text-2xl font-extrabold text-midnight tracking-tight">
                  Confirm Hiring Specialist
                </h3>
                <p className="text-xs text-midnight/70 leading-relaxed">
                  You are about to establish an active contract with <strong>{hiringProposal.provider?.full_name}</strong> for "{project.title}".
                </p>
              </div>

              {hireError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{hireError}</span>
                </div>
              )}

              {/* Agreement Summary Box */}
              <div className="p-4 rounded-2xl bg-aliceblue/60 border border-timberwolf/60 space-y-3 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-timberwolf/40">
                  <span className="text-midnight/70">Selected Professional:</span>
                  <span className="font-bold text-midnight">{hiringProposal.provider?.full_name}</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-timberwolf/40">
                  <span className="text-midnight/70">Agreed Contract Price:</span>
                  <span className="font-mono font-bold text-base text-midnight">{formatINR(hiringProposal.bid_amount)}</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-timberwolf/40">
                  <span className="text-midnight/70">Estimated Delivery:</span>
                  <span className="font-bold text-midnight">{hiringProposal.delivery_time}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-midnight/70">Project Status Post-Hire:</span>
                  <span className="font-bold text-emerald-700">IN PROGRESS</span>
                </div>
              </div>

              <div className="text-[11px] text-midnight/60 leading-relaxed space-y-1">
                <p>• Hiring this candidate will reject other competing proposals.</p>
                <p>• You will be redirected to the dedicated contract workspace to track milestones and deliverables.</p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setHiringProposal(null)}
                  disabled={hiringInProgress}
                  className="px-4 py-2.5 rounded-xl border border-timberwolf text-midnight text-xs font-semibold hover:bg-aliceblue transition-colors"
                >
                  Cancel
                </button>

                <Button
                  type="button"
                  onClick={handleConfirmHire}
                  variant="primary"
                  size="md"
                  isLoading={hiringInProgress}
                  className="px-6 font-bold text-xs"
                  iconRight={<Check className="w-4 h-4 text-moonstone" />}
                >
                  Accept & Activate Contract
                </Button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default ProjectProposalsPage;
