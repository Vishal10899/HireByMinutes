import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import {
  Star,
  Eye,
  EyeOff,
  Search,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  MessageSquare,
  Clock,
  User,
  ExternalLink
} from 'lucide-react';

interface ReviewItem {
  id: string;
  service_id: string;
  service_title?: string;
  reviewer_id: string;
  reviewer_name?: string;
  reviewer_avatar?: string;
  provider_id: string;
  provider_name?: string;
  rating: number;
  comment?: string;
  is_hidden: number;
  moderation_note?: string;
  moderated_by?: string;
  moderated_at?: string;
  created_at: string;
}

export const AdminReviewsControl: React.FC = () => {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [filterHidden, setFilterHidden] = useState<'all' | 'visible' | 'hidden'>('all');
  const [statusMessage, setStatusMessage] = useState<{ success?: boolean; message?: string } | null>(null);

  // Moderation Note Modal State
  const [moderationModal, setModerationModal] = useState<{
    isOpen: boolean;
    reviewId: string;
    isHiding: boolean;
    note: string;
  }>({
    isOpen: false,
    reviewId: '',
    isHiding: true,
    note: ''
  });

  const loadReviews = async () => {
    setLoading(true);
    try {
      const data = await api.getAdminReviews({ search });
      if (Array.isArray(data.reviews)) {
        setReviews(data.reviews);
      }
    } catch (err: any) {
      console.error('Failed to load reviews:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, [search]);

  const handleToggleVisibilityConfirm = async () => {
    if (!moderationModal.reviewId) return;
    setStatusMessage(null);

    try {
      await api.toggleAdminReviewVisibility(
        moderationModal.reviewId,
        moderationModal.isHiding,
        moderationModal.note.trim() || undefined
      );

      setStatusMessage({
        success: true,
        message: moderationModal.isHiding
          ? 'Review hidden from public consultation catalog.'
          : 'Review restored to public visibility.'
      });

      setModerationModal({ isOpen: false, reviewId: '', isHiding: true, note: '' });
      await loadReviews();
    } catch (err: any) {
      setStatusMessage({ success: false, message: err.message || 'Failed to update review status.' });
    }
  };

  const filteredReviews = reviews.filter((r) => {
    if (filterHidden === 'visible') return r.is_hidden !== 1;
    if (filterHidden === 'hidden') return r.is_hidden === 1;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-moonstone/10 text-moonstone-dark text-xs font-bold border border-moonstone/30 mb-2">
            <Star className="w-3.5 h-3.5 text-moonstone" />
            <span>Marketplace Quality Assurance</span>
          </div>
          <h1 className="text-2xl font-extrabold text-midnight tracking-tight">
            Reviews Moderation
          </h1>
          <p className="text-xs text-midnight/70 mt-1">
            Audit client ratings and feedback. Hide fraudulent, abusive, or spam reviews while preserving verified audit trails.
          </p>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center gap-2.5 animate-fade-in ${
            statusMessage.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {statusMessage.success ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{statusMessage.message}</span>
        </div>
      )}

      {/* Controls Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative max-w-sm w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-midnight/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reviews by provider, client, or comment..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-timberwolf/70 rounded-xl text-xs text-midnight focus:border-moonstone shadow-subtle"
          />
        </div>

        <div className="flex items-center gap-2">
          {(['all', 'visible', 'hidden'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterHidden(f)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-colors cursor-pointer ${
                filterHidden === f
                  ? 'bg-midnight text-aliceblue shadow-subtle'
                  : 'bg-white border border-timberwolf/60 text-midnight/70 hover:text-midnight'
              }`}
            >
              {f} ({reviews.filter((r) => (f === 'all' ? true : f === 'visible' ? r.is_hidden !== 1 : r.is_hidden === 1)).length})
            </button>
          ))}
        </div>
      </div>

      {/* Reviews Table */}
      <div className="bg-white rounded-2xl border border-timberwolf/60 overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-aliceblue-surface border-b border-timberwolf/40 text-midnight/70">
                <th className="py-3 px-4 font-semibold">Service Listing</th>
                <th className="py-3 px-4 font-semibold">Client / Reviewer</th>
                <th className="py-3 px-4 font-semibold">Provider</th>
                <th className="py-3 px-4 font-semibold">Rating & Feedback</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Moderation Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-timberwolf/30">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-midnight/50">
                    Loading reviews...
                  </td>
                </tr>
              ) : filteredReviews.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-midnight/50">
                    No reviews found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredReviews.map((r) => (
                  <tr key={r.id} className="hover:bg-aliceblue/50 transition-colors">
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="font-bold text-midnight truncate">{r.service_title || 'Consultation Session'}</div>
                      <div className="text-[11px] text-midnight/50 font-mono">ID: {r.id.slice(0, 8)}...</div>
                    </td>

                    <td className="py-3.5 px-4 font-medium text-midnight">
                      {r.reviewer_name || 'Client'}
                    </td>

                    <td className="py-3.5 px-4 font-medium text-midnight">
                      {r.provider_name || 'Provider'}
                    </td>

                    <td className="py-3.5 px-4 max-w-md">
                      <div className="flex items-center gap-1 text-amber-500 mb-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-3.5 h-3.5 ${
                              star <= r.rating ? 'fill-current text-amber-400' : 'text-slate-200'
                            }`}
                          />
                        ))}
                        <span className="text-[11px] font-bold text-midnight ml-1">({r.rating}/5)</span>
                      </div>
                      <p className="text-midnight/80 italic text-[11px] line-clamp-2">
                        "{r.comment || 'No written feedback provided.'}"
                      </p>
                      {r.moderation_note && (
                        <div className="mt-1 text-[10px] text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded inline-block">
                          Note: {r.moderation_note}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {r.is_hidden === 1 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold">
                          <EyeOff className="w-3 h-3" />
                          <span>HIDDEN</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                          <Eye className="w-3 h-3" />
                          <span>VISIBLE</span>
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      {r.is_hidden === 1 ? (
                        <button
                          onClick={() =>
                            setModerationModal({
                              isOpen: true,
                              reviewId: r.id,
                              isHiding: false,
                              note: ''
                            })
                          }
                          className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-semibold text-[11px] transition-colors cursor-pointer"
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          onClick={() =>
                            setModerationModal({
                              isOpen: true,
                              reviewId: r.id,
                              isHiding: true,
                              note: ''
                            })
                          }
                          className="px-3 py-1 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 font-semibold text-[11px] transition-colors cursor-pointer"
                        >
                          Hide Review
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Moderation Confirmation Modal */}
      {moderationModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-midnight/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-timberwolf/70 shadow-modal max-w-md w-full p-6 space-y-4 animate-fade-in text-midnight">
            <h3 className="text-base font-bold">
              {moderationModal.isHiding ? 'Hide Review from Public Catalog' : 'Restore Review to Public Catalog'}
            </h3>

            <p className="text-xs text-midnight/70 leading-relaxed">
              {moderationModal.isHiding
                ? 'Hiding this review will remove it immediately from the public service listing and expert aggregate rating calculation.'
                : 'Restoring this review will make it publicly visible again.'}
            </p>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Moderation Reason / Note (Optional)
              </label>
              <textarea
                rows={2}
                value={moderationModal.note}
                onChange={(e) => setModerationModal({ ...moderationModal, note: e.target.value })}
                placeholder="e.g. Inappropriate language, off-topic, or verified spam."
                className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs focus:border-moonstone"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-timberwolf/40">
              <button
                type="button"
                onClick={() => setModerationModal({ ...moderationModal, isOpen: false })}
                className="px-4 py-2 rounded-xl bg-aliceblue text-midnight text-xs font-semibold border border-timberwolf/60 hover:bg-lightblue/30"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleToggleVisibilityConfirm}
                className={`px-4 py-2 rounded-xl text-xs font-semibold text-white cursor-pointer ${
                  moderationModal.isHiding
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {moderationModal.isHiding ? 'Confirm Hide' : 'Confirm Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
