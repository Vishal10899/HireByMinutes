import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { usePageSEO } from '../hooks/usePageSEO';
import { ProjectContract, ProjectMilestone } from '../types';
import { formatINR } from '../utils/currency';
import { Button } from '../components/common/Button';
import {
  ChevronLeft,
  CheckCircle2,
  Clock,
  Briefcase,
  AlertCircle,
  X,
  Send,
  RotateCcw,
  ShieldCheck,
  FileText,
  UserCheck,
  Check,
  Layers,
  Award,
  Star
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const ProjectContractPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [contract, setContract] = useState<ProjectContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Deliverable Submission Modal (Provider)
  const [submittingMilestone, setSubmittingMilestone] = useState<ProjectMilestone | null>(null);
  const [submissionNotes, setSubmissionNotes] = useState('');
  const [submissionLoading, setSubmissionLoading] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  // Revision Request Modal (Client)
  const [revisingMilestone, setRevisingMilestone] = useState<ProjectMilestone | null>(null);
  const [revisionReason, setRevisionReason] = useState('');
  const [revisionLoading, setRevisionLoading] = useState(false);
  const [revisionError, setRevisionError] = useState<string | null>(null);

  // Review State (Client review for completed contract)
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);

  // Action states
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  usePageSEO({
    title: contract ? `Contract: ${contract.title} — HireByMinute` : 'Contract Workspace — HireByMinute',
    description: 'Track milestones, review submitted deliverables, and manage project progress on HireByMinute.',
    canonicalPath: id ? `/contracts/${id}` : '/contracts'
  });

  const loadContract = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getContract(id);
      setContract(res.contract);
    } catch (err: any) {
      console.error('Failed to load contract', err);
      setError(err.message || 'Contract not found or access denied.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContract();
  }, [id, user?.id]);

  const handleSubmitDeliverable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contract || !submittingMilestone) return;
    setSubmissionError(null);

    if (!submissionNotes.trim()) {
      setSubmissionError('Please provide work notes or a deliverable summary.');
      return;
    }

    try {
      setSubmissionLoading(true);
      await api.submitMilestone(contract.id, submittingMilestone.id, submissionNotes.trim());
      setSubmittingMilestone(null);
      setSubmissionNotes('');
      await loadContract();
    } catch (err: any) {
      console.error('Error submitting milestone deliverable', err);
      setSubmissionError(err.message || 'Failed to submit milestone deliverable.');
    } finally {
      setSubmissionLoading(false);
    }
  };

  const handleApproveMilestone = async (milestoneId: string) => {
    if (!contract) return;
    if (!window.confirm('Are you sure you want to approve this milestone deliverable?')) return;

    try {
      setActionLoadingId(milestoneId);
      const res = await api.approveMilestone(contract.id, milestoneId);
      confetti({ particleCount: 80, spread: 60 });
      await loadContract();
    } catch (err: any) {
      alert(err.message || 'Failed to approve milestone.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRequestRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contract || !revisingMilestone) return;
    setRevisionError(null);

    if (!revisionReason.trim()) {
      setRevisionError('Please explain the adjustments needed for this milestone.');
      return;
    }

    try {
      setRevisionLoading(true);
      await api.requestMilestoneRevision(contract.id, revisingMilestone.id, revisionReason.trim());
      setRevisingMilestone(null);
      setRevisionReason('');
      await loadContract();
    } catch (err: any) {
      console.error('Error requesting revision', err);
      setRevisionError(err.message || 'Failed to request milestone revision.');
    } finally {
      setRevisionLoading(false);
    }
  };

  const handleCompleteContract = async () => {
    if (!contract) return;
    if (!window.confirm('Are you sure you want to mark this contract as completed?')) return;

    try {
      setActionLoadingId('complete_all');
      await api.completeContract(contract.id);
      confetti({ particleCount: 120, spread: 80 });
      await loadContract();
    } catch (err: any) {
      alert(err.message || 'Failed to complete contract.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contract) return;
    setReviewError(null);
    setReviewSuccess(null);

    if (!reviewComment.trim() || reviewComment.trim().length < 5) {
      setReviewError('Please write a review comment (at least 5 characters).');
      return;
    }

    try {
      setSubmittingReview(true);
      await api.submitContractReview(contract.id, reviewRating, reviewComment.trim());
      confetti({ particleCount: 100, spread: 70 });
      setReviewSuccess('Thank you! Your review has been submitted.');
      await loadContract();
    } catch (err: any) {
      console.error('Failed to submit review', err);
      setReviewError(err.message || 'Failed to submit review.');
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] py-20 text-center space-y-3">
        <div className="w-10 h-10 border-2 border-moonstone border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs font-medium text-midnight/70">Loading contract workspace...</p>
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] py-20 px-4">
        <div className="max-w-md mx-auto bg-white rounded-3xl border border-timberwolf/70 p-8 text-center space-y-4 shadow-subtle">
          <AlertCircle className="w-10 h-10 text-rose-600 mx-auto" />
          <h2 className="text-lg font-bold text-midnight">Contract Unavailable</h2>
          <p className="text-xs text-midnight/70">{error || 'You do not have access to this contract.'}</p>
          <Button to="/client" variant="primary" size="sm">
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const isClient = user?.id === contract.client_id;
  const isProvider = user?.id === contract.provider_id;
  const isCompleted = contract.status === 'COMPLETED';

  const milestones = contract.milestones || [];
  const approvedMilestones = milestones.filter(m => m.status === 'APPROVED');
  const allMilestonesApproved = milestones.length > 0 && approvedMilestones.length === milestones.length;

  return (
    <div className="min-h-screen bg-[#FAF8F5] py-8 sm:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-midnight/60">
          <Link
            to={isClient ? '/client' : '/provider'}
            className="hover:text-midnight transition-colors flex items-center gap-1 font-medium"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>{isClient ? 'Client Dashboard' : 'Provider Hub'}</span>
          </Link>
          <span>/</span>
          <span className="text-midnight font-semibold truncate max-w-sm">Contract: {contract.title}</span>
        </div>

        {/* Contract Hero Banner */}
        <div className="bg-white rounded-3xl border border-timberwolf/70 p-6 sm:p-8 shadow-subtle flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                isCompleted
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : contract.status === 'SUBMITTED_FOR_REVIEW'
                  ? 'bg-blue-100 text-blue-800 border border-blue-300'
                  : contract.status === 'REVISION_REQUESTED'
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}>
                {contract.status === 'SUBMITTED_FOR_REVIEW' ? 'Review in Progress' : contract.status.replace(/_/g, ' ')}
              </span>

              <span className="text-xs text-midnight/60 font-medium">
                Contract #{contract.id.slice(0, 12)}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-midnight tracking-tight leading-snug">
              {contract.title}
            </h1>

            <p className="text-xs sm:text-sm text-midnight/70 leading-relaxed">
              Agreed scope under approval-first milestones. Deliverables are reviewed and accepted incrementally.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-aliceblue/50 p-4 rounded-2xl border border-timberwolf/60 shrink-0">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-midnight/50 block">
                Total Agreed Price
              </span>
              <span className="text-2xl font-black text-midnight font-mono tracking-tight block">
                {formatINR(contract.agreed_amount)}
              </span>
            </div>

            {isClient && !isCompleted && allMilestonesApproved && (
              <Button
                type="button"
                onClick={handleCompleteContract}
                variant="primary"
                size="sm"
                isLoading={actionLoadingId === 'complete_all'}
                className="font-bold text-xs"
                icon={<Award className="w-4 h-4 text-moonstone" />}
              >
                Mark Contract as Completed
              </Button>
            )}
          </div>
        </div>

        {/* Workspace Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Milestones Timeline (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            
            <div className="bg-white rounded-3xl border border-timberwolf/70 p-6 sm:p-8 shadow-subtle space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-timberwolf/30">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-moonstone-dark block">
                    Execution Schedule
                  </span>
                  <h2 className="text-lg sm:text-xl font-bold text-midnight tracking-tight">
                    Project Milestones ({approvedMilestones.length}/{milestones.length} Approved)
                  </h2>
                </div>

                <div className="w-24 sm:w-32 bg-aliceblue h-2.5 rounded-full overflow-hidden border border-timberwolf/40">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-300"
                    style={{ width: `${milestones.length > 0 ? (approvedMilestones.length / milestones.length) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Milestones List */}
              <div className="space-y-4">
                {milestones.map((milestone, idx) => {
                  const isMileApproved = milestone.status === 'APPROVED';
                  const isMileSubmitted = milestone.status === 'SUBMITTED';
                  const isMileRevision = milestone.status === 'REVISION_REQUESTED';

                  return (
                    <div
                      key={milestone.id}
                      className={`rounded-2xl border p-5 transition-all space-y-3.5 ${
                        isMileApproved
                          ? 'border-emerald-300 bg-emerald-50/20'
                          : isMileSubmitted
                          ? 'border-blue-300 bg-blue-50/15'
                          : isMileRevision
                          ? 'border-amber-300 bg-amber-50/15'
                          : 'border-timberwolf/70 bg-white'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                            isMileApproved
                              ? 'bg-emerald-100 text-emerald-800'
                              : isMileSubmitted
                              ? 'bg-blue-100 text-blue-800'
                              : isMileRevision
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-aliceblue text-midnight/70'
                          }`}>
                            {isMileApproved ? <Check className="w-4 h-4" /> : idx + 1}
                          </div>

                          <div>
                            <h3 className="font-bold text-sm text-midnight">{milestone.title}</h3>
                            <span className="text-xs text-midnight/60 font-mono font-semibold">
                              {formatINR(milestone.amount)}
                            </span>
                          </div>
                        </div>

                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider self-start sm:self-auto ${
                          isMileApproved
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : isMileSubmitted
                            ? 'bg-blue-100 text-blue-800 border border-blue-300'
                            : isMileRevision
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-zinc-100 text-zinc-700 border border-zinc-300'
                        }`}>
                          {milestone.status.replace(/_/g, ' ')}
                        </span>
                      </div>

                      {milestone.description && (
                        <p className="text-xs text-midnight/75 leading-relaxed pl-11">
                          {milestone.description}
                        </p>
                      )}

                      {/* Work Notes / Submission details */}
                      {milestone.submission_notes && (
                        <div className="ml-11 p-3 rounded-xl bg-white border border-timberwolf/50 space-y-1 text-xs">
                          <span className="font-bold text-midnight block">
                            {isMileRevision ? 'Revision Request Feedback:' : 'Expert Submission Notes:'}
                          </span>
                          <p className="text-midnight/80 whitespace-pre-line leading-relaxed">
                            {milestone.submission_notes}
                          </p>
                          {milestone.submitted_at && !isMileRevision && (
                            <span className="text-[10px] text-midnight/50 block pt-1">
                              Submitted on {new Date(milestone.submitted_at).toLocaleString()}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Action buttons per milestone */}
                      {!isCompleted && (
                        <div className="pt-2 pl-11 flex flex-wrap items-center gap-2.5">
                          {/* Provider Submission Button */}
                          {isProvider && (milestone.status === 'PENDING' || milestone.status === 'IN_PROGRESS' || milestone.status === 'REVISION_REQUESTED') && (
                            <Button
                              type="button"
                              onClick={() => {
                                setSubmittingMilestone(milestone);
                                setSubmissionNotes('');
                              }}
                              variant="primary"
                              size="sm"
                              className="font-bold text-xs"
                              icon={<Send className="w-3.5 h-3.5 text-moonstone" />}
                            >
                              Submit Deliverable
                            </Button>
                          )}

                          {/* Client Approval / Revision Buttons */}
                          {isClient && isMileSubmitted && (
                            <>
                              <Button
                                type="button"
                                onClick={() => handleApproveMilestone(milestone.id)}
                                variant="primary"
                                size="sm"
                                isLoading={actionLoadingId === milestone.id}
                                className="font-bold text-xs bg-emerald-600 hover:bg-emerald-700"
                                icon={<Check className="w-3.5 h-3.5 text-white" />}
                              >
                                Approve Deliverable
                              </Button>

                              <button
                                type="button"
                                onClick={() => {
                                  setRevisingMilestone(milestone);
                                  setRevisionReason('');
                                }}
                                className="px-3.5 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 text-xs font-bold transition-colors min-h-[44px]"
                              >
                                Request Adjustments
                              </button>
                            </>
                          )}
                        </div>
                      )}

                    </div>
                  );
                })}
              </div>

            </div>

            {/* Scope Reference Card */}
            {contract.project && (
              <div className="bg-white rounded-3xl border border-timberwolf/70 p-6 sm:p-8 shadow-subtle space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-midnight/60 block">
                  Original Project Scope
                </span>
                <p className="text-xs sm:text-sm text-midnight/80 leading-relaxed whitespace-pre-line">
                  {contract.project.description}
                </p>
                {contract.project.skills && contract.project.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {contract.project.skills.map((s) => (
                      <span key={s} className="px-2.5 py-0.5 rounded-md text-[11px] bg-aliceblue text-midnight/80 border border-timberwolf/60">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Completed Contract Review Section */}
            {isCompleted && (
              <div className="bg-white rounded-3xl border border-timberwolf/70 p-6 sm:p-8 shadow-subtle space-y-5 animate-fade-in">
                <div className="flex items-center justify-between pb-3 border-b border-timberwolf/30">
                  <div className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-moonstone-dark flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                      <span>Contract Feedback & Evaluation</span>
                    </span>
                    <h2 className="text-lg sm:text-xl font-bold text-midnight tracking-tight">
                      {contract.client_rating ? 'Client Review' : isClient ? 'Leave Expert Review' : 'Specialist Rating'}
                    </h2>
                  </div>
                  {contract.client_rating && (
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full">
                      <div className="flex items-center text-amber-500">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-3.5 h-3.5 ${
                              star <= Math.round(contract.client_rating || 0)
                                ? 'fill-amber-400 text-amber-500'
                                : 'text-zinc-300'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-xs font-bold text-midnight">
                        {contract.client_rating.toFixed(1)}
                      </span>
                    </div>
                  )}
                </div>

                {contract.client_rating ? (
                  <div className="space-y-3">
                    <div className="p-4 rounded-2xl bg-aliceblue/40 border border-timberwolf/50 space-y-2">
                      <p className="text-xs sm:text-sm text-midnight/90 italic leading-relaxed">
                        "{contract.client_review}"
                      </p>
                      {contract.client_reviewed_at && (
                        <span className="text-[11px] text-midnight/50 block font-medium">
                          Submitted by {contract.client?.name || 'Client'} on {new Date(contract.client_reviewed_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>
                ) : isClient ? (
                  <form onSubmit={handleSubmitReview} className="space-y-4">
                    <p className="text-xs text-midnight/70">
                      Rate your experience working with <strong>{contract.provider?.name || 'this specialist'}</strong>. Your evaluation updates their profile rating and helps future clients.
                    </p>

                    {reviewError && (
                      <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-xs font-medium">
                        {reviewError}
                      </div>
                    )}
                    {reviewSuccess && (
                      <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-xs font-medium">
                        {reviewSuccess}
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-midnight uppercase tracking-wider mb-2">
                        Rating Score
                      </label>
                      <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setReviewRating(val)}
                            className="p-1 hover:scale-110 transition-transform cursor-pointer focus:outline-none"
                            title={`${val} out of 5 stars`}
                          >
                            <Star
                              className={`w-6 h-6 transition-colors ${
                                val <= reviewRating
                                  ? 'fill-amber-400 text-amber-500'
                                  : 'text-zinc-300 hover:text-amber-300'
                              }`}
                            />
                          </button>
                        ))}
                        <span className="text-xs font-bold text-midnight ml-2">
                          {reviewRating} of 5 Stars
                        </span>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="review-feedback" className="block text-xs font-bold text-midnight uppercase tracking-wider mb-1.5">
                        Written Feedback <span className="text-rose-500">*</span>
                      </label>
                      <textarea
                        id="review-feedback"
                        rows={4}
                        value={reviewComment}
                        onChange={(e) => setReviewComment(e.target.value)}
                        placeholder="Share your experience regarding code quality, communication, punctuality, and milestone delivery..."
                        className="w-full px-4 py-3 rounded-xl border border-timberwolf focus:border-moonstone text-xs text-midnight outline-none leading-relaxed"
                        required
                        minLength={5}
                      />
                    </div>

                    <div className="flex items-center justify-end">
                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        isLoading={submittingReview}
                        className="font-bold text-xs"
                        icon={<Star className="w-3.5 h-3.5 text-moonstone" />}
                      >
                        Submit Expert Review
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="p-4 rounded-2xl bg-aliceblue/40 border border-timberwolf/50 text-xs text-midnight/70">
                    This contract has completed successfully. Awaiting feedback from the client.
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Right Column: Counterparty & Overview (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Counterparty Profile */}
            <div className="bg-white rounded-3xl border border-timberwolf/70 p-6 shadow-subtle space-y-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-midnight/50 block">
                {isClient ? 'Hired Specialist' : 'Contract Client'}
              </span>

              {isClient ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={contract.provider?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(contract.provider?.name || 'Expert')}`}
                      alt={contract.provider?.name}
                      className="w-12 h-12 rounded-2xl object-cover border border-lightblue bg-aliceblue"
                    />
                    <div>
                      <h4 className="font-bold text-sm text-midnight">{contract.provider?.name}</h4>
                      <p className="text-[11px] text-midnight/60">{contract.provider?.headline || 'Expert Specialist'}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={contract.client?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(contract.client?.name || 'Client')}`}
                      alt={contract.client?.name}
                      className="w-12 h-12 rounded-2xl object-cover border border-lightblue bg-aliceblue"
                    />
                    <div>
                      <h4 className="font-bold text-sm text-midnight">{contract.client?.name}</h4>
                      <p className="text-[11px] text-midnight/60">Client Organization</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2 pt-2 border-t border-timberwolf/30 text-xs text-midnight/70 font-medium">
                <div className="flex items-center justify-between">
                  <span>Contract Created:</span>
                  <span className="font-bold text-midnight">
                    {new Date(contract.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Type:</span>
                  <span className="font-bold text-midnight capitalize">{contract.project_type} Price</span>
                </div>
              </div>
            </div>

            {/* Approval-First Policy Note */}
            <div className="bg-white rounded-3xl border border-timberwolf/70 p-6 shadow-subtle space-y-3 text-xs text-midnight/75 leading-relaxed">
              <div className="flex items-center gap-2 font-bold text-midnight">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Approval-First Workflow</span>
              </div>
              <p>
                Milestones are submitted by the expert with deliverable documentation. The client inspects the deliverables and authorizes completion or requests adjustments.
              </p>
            </div>

          </div>

        </div>

        {/* Deliverable Submission Modal (Provider) */}
        {submittingMilestone && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-midnight/60 backdrop-blur-xs animate-fade-in">
            <div className="bg-white rounded-3xl border border-timberwolf max-w-lg w-full p-6 sm:p-8 shadow-elevated space-y-5 relative">
              <button
                type="button"
                onClick={() => setSubmittingMilestone(null)}
                className="absolute right-5 top-5 text-midnight/40 hover:text-midnight"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-moonstone-dark block">
                  Submit Deliverable
                </span>
                <h3 className="text-xl font-extrabold text-midnight">
                  {submittingMilestone.title} ({formatINR(submittingMilestone.amount)})
                </h3>
                <p className="text-xs text-midnight/70">
                  Provide notes, download links, PR references, or instructions for the client to review your work.
                </p>
              </div>

              {submissionError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-xs">
                  {submissionError}
                </div>
              )}

              <form onSubmit={handleSubmitDeliverable} className="space-y-4">
                <div>
                  <label htmlFor="submission-notes" className="block text-xs font-bold text-midnight uppercase tracking-wider mb-1.5">
                    Deliverable Details & References <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    id="submission-notes"
                    rows={6}
                    value={submissionNotes}
                    onChange={(e) => setSubmissionNotes(e.target.value)}
                    placeholder="Describe the deliverable completed, include repository or file links, deployment URLs, or testing notes..."
                    className="w-full px-4 py-3 rounded-xl border border-timberwolf focus:border-moonstone text-xs text-midnight outline-none leading-relaxed"
                    required
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setSubmittingMilestone(null)}
                    disabled={submissionLoading}
                    className="px-4 py-2 rounded-xl border border-timberwolf text-xs font-semibold text-midnight hover:bg-aliceblue"
                  >
                    Cancel
                  </button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    isLoading={submissionLoading}
                    className="px-5 font-bold text-xs"
                    icon={<Send className="w-3.5 h-3.5 text-moonstone" />}
                  >
                    Send for Review
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Revision Request Modal (Client) */}
        {revisingMilestone && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-midnight/60 backdrop-blur-xs animate-fade-in">
            <div className="bg-white rounded-3xl border border-timberwolf max-w-lg w-full p-6 sm:p-8 shadow-elevated space-y-5 relative">
              <button
                type="button"
                onClick={() => setRevisingMilestone(null)}
                className="absolute right-5 top-5 text-midnight/40 hover:text-midnight"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 block">
                  Request Adjustments
                </span>
                <h3 className="text-xl font-extrabold text-midnight">
                  Revision on {revisingMilestone.title}
                </h3>
                <p className="text-xs text-midnight/70">
                  Clearly explain what needs modification or clarification before this milestone can be approved.
                </p>
              </div>

              {revisionError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-xs">
                  {revisionError}
                </div>
              )}

              <form onSubmit={handleRequestRevision} className="space-y-4">
                <div>
                  <label htmlFor="revision-reason" className="block text-xs font-bold text-midnight uppercase tracking-wider mb-1.5">
                    Feedback & Required Changes <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    id="revision-reason"
                    rows={5}
                    value={revisionReason}
                    onChange={(e) => setRevisionReason(e.target.value)}
                    placeholder="State the specific changes required..."
                    className="w-full px-4 py-3 rounded-xl border border-timberwolf focus:border-amber-400 text-xs text-midnight outline-none leading-relaxed"
                    required
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setRevisingMilestone(null)}
                    disabled={revisionLoading}
                    className="px-4 py-2 rounded-xl border border-timberwolf text-xs font-semibold text-midnight hover:bg-aliceblue"
                  >
                    Cancel
                  </button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    isLoading={revisionLoading}
                    className="px-5 font-bold text-xs bg-amber-600 hover:bg-amber-700"
                    icon={<RotateCcw className="w-3.5 h-3.5 text-white" />}
                  >
                    Submit Revision Request
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default ProjectContractPage;
