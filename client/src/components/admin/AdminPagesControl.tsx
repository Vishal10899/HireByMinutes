import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import {
  FileText,
  Plus,
  Trash2,
  Edit3,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Lock,
  Search,
  Eye,
  Clock,
  ShieldCheck
} from 'lucide-react';

interface CmsPage {
  id: string;
  slug: string;
  title: string;
  meta_title?: string;
  meta_description?: string;
  content: string;
  status: 'published' | 'draft';
  is_system: number;
  updated_at: string;
  updated_by?: string;
}

export const AdminPagesControl: React.FC = () => {
  const [pages, setPages] = useState<CmsPage[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<{ success?: boolean; message?: string } | null>(null);

  // Edit/Create Modal State
  const [modal, setModal] = useState<{
    isOpen: boolean;
    isEdit: boolean;
    id?: string;
    slug: string;
    title: string;
    meta_title: string;
    meta_description: string;
    content: string;
    status: 'published' | 'draft';
    is_system: boolean;
  }>({
    isOpen: false,
    isEdit: false,
    slug: '',
    title: '',
    meta_title: '',
    meta_description: '',
    content: '',
    status: 'published',
    is_system: false
  });

  const loadPages = async () => {
    setLoading(true);
    try {
      const data = await api.getAdminCmsPages();
      if (Array.isArray(data.pages)) {
        setPages(data.pages);
      }
    } catch (err: any) {
      console.error('Failed to load CMS pages:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPages();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (!modal.slug.trim() || !modal.title.trim() || !modal.content.trim()) {
      alert('Please fill out title, slug, and page content.');
      return;
    }

    try {
      const payload = {
        slug: modal.slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
        title: modal.title.trim(),
        meta_title: modal.meta_title.trim() || undefined,
        meta_description: modal.meta_description.trim() || undefined,
        content: modal.content.trim(),
        status: modal.status
      };

      if (modal.isEdit && modal.id) {
        await api.updateAdminCmsPage(modal.id, payload);
        setStatusMessage({ success: true, message: `Page "${modal.title}" updated.` });
      } else {
        await api.createAdminCmsPage(payload);
        setStatusMessage({ success: true, message: `Page "${modal.title}" created and published.` });
      }

      setModal((prev) => ({ ...prev, isOpen: false }));
      await loadPages();
    } catch (err: any) {
      setStatusMessage({ success: false, message: err.message || 'Failed to save page.' });
    }
  };

  const handleDelete = async (page: CmsPage) => {
    if (page.is_system === 1) {
      alert('PROTECTED: System legal pages cannot be deleted.');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete "${page.title}"?`)) return;

    try {
      await api.deleteAdminCmsPage(page.id);
      await loadPages();
      setStatusMessage({ success: true, message: `Page "${page.title}" removed.` });
    } catch (err: any) {
      alert(err.message || 'Failed to delete page');
    }
  };

  const filteredPages = pages.filter(
    (p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-moonstone/10 text-moonstone-dark text-xs font-bold border border-moonstone/30 mb-2">
            <FileText className="w-3.5 h-3.5 text-moonstone" />
            <span>Static Pages & Legal CMS</span>
          </div>
          <h1 className="text-2xl font-extrabold text-midnight tracking-tight">
            Pages & Policy Manager
          </h1>
          <p className="text-xs text-midnight/70 mt-1">
            Maintain authentic Terms of Service, Privacy Policy, Refund Guidelines, FAQs, and custom content. System policies are protected from accidental deletion.
          </p>
        </div>

        <button
          onClick={() =>
            setModal({
              isOpen: true,
              isEdit: false,
              slug: '',
              title: '',
              meta_title: '',
              meta_description: '',
              content: '',
              status: 'published',
              is_system: false
            })
          }
          className="btn-shine inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-midnight text-aliceblue font-semibold text-xs hover:bg-midnight-hover shadow-subtle transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4 text-moonstone" />
          <span>Create Custom Page</span>
        </button>
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

      {/* Search Input */}
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-midnight/40" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter pages by title or slug..."
          className="w-full pl-9 pr-4 py-2 bg-white border border-timberwolf/70 rounded-xl text-xs text-midnight focus:border-moonstone shadow-subtle"
        />
      </div>

      {/* Pages Table */}
      <div className="bg-white rounded-2xl border border-timberwolf/60 overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-aliceblue-surface border-b border-timberwolf/40 text-midnight/70">
                <th className="py-3 px-4 font-semibold">Page Title</th>
                <th className="py-3 px-4 font-semibold">Public Route / Slug</th>
                <th className="py-3 px-4 font-semibold">Type</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Last Modified</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-timberwolf/30">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-midnight/50">
                    Loading pages...
                  </td>
                </tr>
              ) : filteredPages.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-midnight/50">
                    No CMS pages match search query.
                  </td>
                </tr>
              ) : (
                filteredPages.map((page) => (
                  <tr key={page.id} className="hover:bg-aliceblue/50 transition-colors">
                    <td className="py-3.5 px-4 max-w-sm">
                      <div className="font-bold text-midnight truncate">{page.title}</div>
                      <div className="text-[11px] text-midnight/60 line-clamp-1">
                        {page.meta_description || 'No description provided.'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-medium text-midnight">
                      /{page.slug}
                    </td>

                    <td className="py-3.5 px-4">
                      {page.is_system === 1 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200 text-[10px] font-bold">
                          <Lock className="w-3 h-3 text-slate-500" />
                          <span>SYSTEM</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-bold">
                          CUSTOM
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          page.status === 'published'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {page.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-[11px] text-midnight/70">
                      {new Date(page.updated_at).toLocaleDateString()}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <a
                          href={`/p/${page.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Preview public page"
                          className="p-1.5 rounded-lg bg-aliceblue text-midnight/70 hover:text-midnight transition-colors cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>

                        <button
                          onClick={() =>
                            setModal({
                              isOpen: true,
                              isEdit: true,
                              id: page.id,
                              slug: page.slug,
                              title: page.title,
                              meta_title: page.meta_title || '',
                              meta_description: page.meta_description || '',
                              content: page.content,
                              status: page.status,
                              is_system: page.is_system === 1
                            })
                          }
                          title="Edit page content"
                          className="p-1.5 rounded-lg bg-aliceblue text-midnight/70 hover:text-midnight transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        {page.is_system === 0 ? (
                          <button
                            onClick={() => handleDelete(page)}
                            title="Delete custom page"
                            className="p-1.5 rounded-lg bg-aliceblue text-midnight/40 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span title="System pages are protected" className="p-1.5 opacity-20 cursor-not-allowed">
                            <Lock className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / Create Modal */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-50 bg-midnight/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSave}
            className="bg-white rounded-2xl border border-timberwolf/70 shadow-modal max-w-2xl w-full p-6 space-y-4 animate-fade-in text-midnight max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-timberwolf/40 pb-3">
              <div>
                <h3 className="text-base font-bold">
                  {modal.isEdit ? `Edit: ${modal.title}` : 'Create New Static Page'}
                </h3>
                {modal.is_system && (
                  <span className="text-[10px] text-slate-600 font-semibold flex items-center gap-1 mt-0.5">
                    <Lock className="w-3 h-3" /> System page (Protected from deletion)
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setModal({ ...modal, isOpen: false })}
                className="text-midnight/40 hover:text-midnight"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Page Title *</label>
                <input
                  type="text"
                  required
                  value={modal.title}
                  onChange={(e) => setModal({ ...modal, title: e.target.value })}
                  placeholder="e.g. Terms of Service"
                  className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs focus:border-moonstone"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">URL Slug *</label>
                <input
                  type="text"
                  required
                  disabled={modal.is_system}
                  value={modal.slug}
                  onChange={(e) => setModal({ ...modal, slug: e.target.value })}
                  placeholder="e.g. terms"
                  className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs focus:border-moonstone font-mono disabled:opacity-50"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Meta Title (Browser Tab)</label>
                <input
                  type="text"
                  value={modal.meta_title}
                  onChange={(e) => setModal({ ...modal, meta_title: e.target.value })}
                  placeholder="Terms of Service — HireByMinute"
                  className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs focus:border-moonstone"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Publication Status</label>
                <select
                  value={modal.status}
                  onChange={(e) => setModal({ ...modal, status: e.target.value as any })}
                  className="w-full bg-white border border-timberwolf/70 rounded-xl px-3 py-2 text-xs focus:border-moonstone"
                >
                  <option value="published">Published</option>
                  <option value="draft">Draft (Hidden from Public)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Meta Description (SEO)</label>
              <input
                type="text"
                value={modal.meta_description}
                onChange={(e) => setModal({ ...modal, meta_description: e.target.value })}
                placeholder="Official policy governing..."
                className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs focus:border-moonstone"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Page Body Content (Markdown supported) *</label>
              <textarea
                rows={12}
                required
                value={modal.content}
                onChange={(e) => setModal({ ...modal, content: e.target.value })}
                placeholder="# Page Title\n\n### 1. Section One\nParagraph content..."
                className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2.5 text-xs focus:border-moonstone font-mono leading-relaxed"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-timberwolf/40">
              <button
                type="button"
                onClick={() => setModal({ ...modal, isOpen: false })}
                className="px-4 py-2 rounded-xl bg-aliceblue text-midnight text-xs font-semibold border border-timberwolf/60 hover:bg-lightblue/30"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-shine px-4 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover shadow-subtle cursor-pointer"
              >
                {modal.isEdit ? 'Save Changes' : 'Create Page'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
