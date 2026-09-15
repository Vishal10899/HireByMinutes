import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import {
  HelpCircle,
  Plus,
  Trash2,
  Edit3,
  Search,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  X,
  Save,
  Tag,
  ArrowUpDown
} from 'lucide-react';

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
  is_published: number | boolean;
  created_at?: string;
  updated_at?: string;
}

const FAQ_CATEGORIES = [
  'General',
  'Billing & Pricing',
  'Experts & Providers',
  'Sessions & Audio/Video',
  'Security & Trust',
  'Legal & Policies'
];

export const AdminFaqControl: React.FC = () => {
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [formData, setFormData] = useState<{
    id?: string;
    question: string;
    answer: string;
    category: string;
    sort_order: number;
    is_published: boolean;
  }>({
    question: '',
    answer: '',
    category: 'General',
    sort_order: 0,
    is_published: true
  });

  // Delete State
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadFaqs();
  }, []);

  const loadFaqs = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminFaqs();
      setFaqs(res.faqs || []);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to load FAQs.' });
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setIsEditing(false);
    setFormData({
      question: '',
      answer: '',
      category: 'General',
      sort_order: (faqs.length + 1) * 10,
      is_published: true
    });
    setModalOpen(true);
  };

  const openEditModal = (faq: FaqItem) => {
    setIsEditing(true);
    setFormData({
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
      category: faq.category || 'General',
      sort_order: faq.sort_order || 0,
      is_published: Boolean(faq.is_published)
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.question.trim() || !formData.answer.trim()) {
      setStatusMessage({ type: 'error', text: 'Question and answer are required.' });
      return;
    }

    setSaving(true);
    setStatusMessage(null);

    try {
      if (isEditing && formData.id) {
        await api.updateAdminFaq(formData.id, {
          question: formData.question.trim(),
          answer: formData.answer.trim(),
          category: formData.category,
          sort_order: formData.sort_order,
          is_published: formData.is_published ? 1 : 0
        });
        setStatusMessage({ type: 'success', text: 'FAQ updated successfully.' });
      } else {
        await api.createAdminFaq({
          question: formData.question.trim(),
          answer: formData.answer.trim(),
          category: formData.category,
          sort_order: formData.sort_order,
          is_published: formData.is_published ? 1 : 0
        });
        setStatusMessage({ type: 'success', text: 'FAQ created successfully.' });
      }

      setModalOpen(false);
      await loadFaqs();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to save FAQ.' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleVisibility = async (faq: FaqItem) => {
    try {
      const newStatus = !faq.is_published;
      await api.updateAdminFaq(faq.id, { is_published: newStatus ? 1 : 0 });
      setFaqs(prev => prev.map(f => f.id === faq.id ? { ...f, is_published: newStatus ? 1 : 0 } : f));
      setStatusMessage({
        type: 'success',
        text: `FAQ "${faq.question.slice(0, 30)}..." marked as ${newStatus ? 'Published' : 'Hidden'}.`
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to toggle visibility.' });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.deleteAdminFaq(deleteId);
      setFaqs(prev => prev.filter(f => f.id !== deleteId));
      setStatusMessage({ type: 'success', text: 'FAQ deleted successfully.' });
      setDeleteId(null);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to delete FAQ.' });
    }
  };

  const filteredFaqs = faqs.filter(faq => {
    const matchesSearch = !search ||
      faq.question.toLowerCase().includes(search.toLowerCase()) ||
      faq.answer.toLowerCase().includes(search.toLowerCase()) ||
      faq.category.toLowerCase().includes(search.toLowerCase());

    const matchesCategory = categoryFilter === 'all' || faq.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'published' && Boolean(faq.is_published)) ||
      (statusFilter === 'draft' && !Boolean(faq.is_published));

    return matchesSearch && matchesCategory && matchesStatus;
  });

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-timberwolf/60 shadow-subtle">
        <div>
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-moonstone" />
            <h2 className="text-lg font-bold text-midnight">Frequently Asked Questions (FAQ)</h2>
          </div>
          <p className="text-xs text-midnight/65 mt-0.5">
            Manage public FAQs, categorization, sorting order, and instant publishing.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="min-h-[40px] px-4 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover transition-all cursor-pointer flex items-center gap-1.5 self-start sm:self-auto shadow-subtle"
        >
          <Plus className="w-4 h-4" />
          <span>Add New FAQ</span>
        </button>
      </div>

      {/* Status Alert */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2.5 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : 'bg-rose-50 border-rose-300 text-rose-800'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-timberwolf/60 shadow-subtle">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-midnight/40 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions, answers, categories..."
            className="w-full min-h-[38px] pl-9 pr-3 py-1.5 text-xs rounded-xl border border-timberwolf/80 bg-aliceblue/30 text-midnight focus:outline-none focus:border-moonstone"
          />
        </div>

        <div className="flex items-center gap-2.5">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="min-h-[38px] px-3 py-1.5 text-xs rounded-xl border border-timberwolf/80 bg-white text-midnight cursor-pointer"
          >
            <option value="all">All Categories</option>
            {FAQ_CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-h-[38px] px-3 py-1.5 text-xs rounded-xl border border-timberwolf/80 bg-white text-midnight cursor-pointer"
          >
            <option value="all">All Visibility</option>
            <option value="published">Published</option>
            <option value="draft">Hidden / Draft</option>
          </select>
        </div>
      </div>

      {/* FAQs Table */}
      <div className="bg-white rounded-2xl border border-timberwolf/60 overflow-hidden shadow-subtle">
        {loading ? (
          <div className="p-8 text-center space-y-2">
            <div className="w-7 h-7 rounded-full border-2 border-moonstone border-t-transparent animate-spin mx-auto" />
            <p className="text-xs text-midnight/60">Loading FAQs...</p>
          </div>
        ) : filteredFaqs.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <HelpCircle className="w-8 h-8 text-midnight/30 mx-auto" />
            <p className="text-sm font-semibold text-midnight">No FAQs found</p>
            <p className="text-xs text-midnight/60 max-w-sm mx-auto">
              {search || categoryFilter !== 'all' || statusFilter !== 'all'
                ? 'No matching FAQ records for the selected filters.'
                : 'Click "Add New FAQ" to create your first question and answer.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-aliceblue/60 border-b border-timberwolf/40 text-[11px] font-bold text-midnight/60 uppercase tracking-wider">
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th className="py-3 px-4">Question & Answer</th>
                  <th className="py-3 px-4 w-40">Category</th>
                  <th className="py-3 px-4 w-28 text-center">Status</th>
                  <th className="py-3 px-4 w-28 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-timberwolf/30 text-xs">
                {filteredFaqs.map((faq, idx) => {
                  const isPublished = Boolean(faq.is_published);
                  return (
                    <tr key={faq.id} className="hover:bg-aliceblue/30 transition-colors">
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-midnight/40">
                        {faq.sort_order || idx + 1}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-midnight leading-snug">{faq.question}</div>
                        <div className="text-midnight/65 text-[11px] line-clamp-2 mt-1 leading-relaxed">
                          {faq.answer}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-aliceblue text-midnight border border-timberwolf/50">
                          <Tag className="w-3 h-3 text-moonstone" />
                          <span>{faq.category || 'General'}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleVisibility(faq)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold cursor-pointer transition-all ${
                            isPublished
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
                              : 'bg-zinc-100 text-zinc-600 border border-zinc-300 hover:bg-zinc-200'
                          }`}
                        >
                          {isPublished ? (
                            <>
                              <Eye className="w-3 h-3 text-emerald-600" />
                              <span>Published</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3 h-3 text-zinc-500" />
                              <span>Hidden</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(faq)}
                            className="p-1.5 rounded-lg text-midnight/70 hover:text-midnight hover:bg-aliceblue transition-colors cursor-pointer"
                            title="Edit FAQ"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteId(faq.id)}
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Delete FAQ"
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
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-midnight/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-timberwolf/60 shadow-modal w-full max-w-xl overflow-hidden animate-fade-in">
            <div className="p-5 border-b border-timberwolf/40 flex items-center justify-between">
              <h3 className="text-sm font-bold text-midnight">
                {isEditing ? 'Edit FAQ Item' : 'Create New FAQ Item'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-midnight/40 hover:text-midnight transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-midnight mb-1">
                  Question <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.question}
                  onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                  placeholder="e.g. How does per-minute billing work?"
                  className="w-full min-h-[40px] px-3.5 py-2 text-xs rounded-xl border border-timberwolf/80 bg-white focus:outline-none focus:border-moonstone font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-midnight mb-1">
                  Answer <span className="text-rose-600">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={formData.answer}
                  onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
                  placeholder="Provide a clear, authoritative explanation..."
                  className="w-full p-3 text-xs rounded-xl border border-timberwolf/80 bg-white focus:outline-none focus:border-moonstone"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-midnight mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full min-h-[38px] px-3 py-1.5 text-xs rounded-xl border border-timberwolf/80 bg-white"
                  >
                    {FAQ_CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-midnight mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={formData.sort_order}
                    onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value, 10) || 0 })}
                    className="w-full min-h-[38px] px-3 py-1.5 text-xs rounded-xl border border-timberwolf/80 bg-white font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="faq-pub-toggle"
                  checked={formData.is_published}
                  onChange={(e) => setFormData({ ...formData, is_published: e.target.checked })}
                  className="rounded border-timberwolf/80 text-moonstone focus:ring-0 cursor-pointer"
                />
                <label htmlFor="faq-pub-toggle" className="text-xs font-medium text-midnight cursor-pointer">
                  Publish immediately to public website
                </label>
              </div>

              <div className="pt-3 border-t border-timberwolf/30 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="min-h-[38px] px-4 py-1.5 rounded-xl border border-timberwolf/70 text-xs font-semibold text-midnight/70 hover:bg-aliceblue cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[38px] px-5 py-1.5 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Save className={`w-3.5 h-3.5 ${saving ? 'animate-spin' : ''}`} />
                  <span>{saving ? 'Saving...' : 'Save FAQ'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-midnight/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-timberwolf/60 shadow-modal w-full max-w-sm p-5 space-y-4 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-midnight">Delete FAQ?</h4>
                <p className="text-xs text-midnight/60">This question will be removed permanently from the public site.</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteId(null)}
                className="min-h-[36px] px-3.5 py-1.5 rounded-xl border border-timberwolf/70 text-xs font-semibold text-midnight/70 hover:bg-aliceblue cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="min-h-[36px] px-4 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition-all cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
