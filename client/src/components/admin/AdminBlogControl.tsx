import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import {
  BookOpen,
  Plus,
  Trash2,
  Edit3,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Search,
  Eye,
  Clock,
  Tag,
  Sparkles,
  FileText,
  Filter
} from 'lucide-react';

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt?: string;
  content: string;
  category: string;
  author_name: string;
  cover_image?: string;
  read_time_minutes: number;
  status: 'published' | 'draft';
  meta_title?: string;
  meta_description?: string;
  meta_keywords?: string;
  views_count: number;
  created_at: string;
  updated_at: string;
}

export const AdminBlogControl: React.FC = () => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [statusMessage, setStatusMessage] = useState<{ success?: boolean; message?: string } | null>(null);

  // Edit/Create Modal State
  const [modal, setModal] = useState<{
    isOpen: boolean;
    isEdit: boolean;
    id?: string;
    slug: string;
    title: string;
    excerpt: string;
    content: string;
    category: string;
    author_name: string;
    cover_image: string;
    read_time_minutes: number;
    status: 'published' | 'draft';
    meta_title: string;
    meta_description: string;
    meta_keywords: string;
  }>({
    isOpen: false,
    isEdit: false,
    slug: '',
    title: '',
    excerpt: '',
    content: '',
    category: 'Technology and Software',
    author_name: 'Editorial Team',
    cover_image: '',
    read_time_minutes: 5,
    status: 'published',
    meta_title: '',
    meta_description: '',
    meta_keywords: ''
  });

  const loadPosts = async () => {
    setLoading(true);
    try {
      const data = await api.getAdminBlogPosts();
      if (Array.isArray(data.posts)) {
        setPosts(data.posts);
      }
    } catch (err: any) {
      console.error('Failed to load blog posts:', err);
      setStatusMessage({ success: false, message: err.message || 'Failed to load blog posts' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const handleOpenAdd = () => {
    setModal({
      isOpen: true,
      isEdit: false,
      slug: '',
      title: '',
      excerpt: '',
      content: '',
      category: 'Technology and Software',
      author_name: 'Editorial Team',
      cover_image: '',
      read_time_minutes: 5,
      status: 'published',
      meta_title: '',
      meta_description: '',
      meta_keywords: ''
    });
  };

  const handleOpenEdit = (post: BlogPost) => {
    setModal({
      isOpen: true,
      isEdit: true,
      id: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt || '',
      content: post.content || '',
      category: post.category || 'General',
      author_name: post.author_name || 'Editorial Team',
      cover_image: post.cover_image || '',
      read_time_minutes: post.read_time_minutes || 5,
      status: post.status,
      meta_title: post.meta_title || '',
      meta_description: post.meta_description || '',
      meta_keywords: post.meta_keywords || ''
    });
  };

  const handleTitleChange = (val: string) => {
    if (!modal.isEdit) {
      // Auto-generate slug
      const generatedSlug = val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
      setModal(prev => ({
        ...prev,
        title: val,
        slug: generatedSlug,
        meta_title: val ? `${val} | HireByMinute Insights` : ''
      }));
    } else {
      setModal(prev => ({ ...prev, title: val }));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (!modal.title.trim() || !modal.slug.trim() || !modal.content.trim()) {
      alert('Please fill out the post title, slug, and content.');
      return;
    }

    try {
      const payload = {
        title: modal.title.trim(),
        slug: modal.slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
        excerpt: modal.excerpt.trim() || undefined,
        content: modal.content.trim(),
        category: modal.category.trim() || 'General',
        author_name: modal.author_name.trim() || 'Editorial Team',
        cover_image: modal.cover_image.trim() || undefined,
        read_time_minutes: Number(modal.read_time_minutes) || 5,
        status: modal.status,
        meta_title: modal.meta_title.trim() || undefined,
        meta_description: modal.meta_description.trim() || undefined,
        meta_keywords: modal.meta_keywords.trim() || undefined
      };

      if (modal.isEdit && modal.id) {
        await api.updateAdminBlogPost(modal.id, payload);
        setStatusMessage({ success: true, message: `Article "${modal.title}" updated successfully.` });
      } else {
        await api.createAdminBlogPost(payload);
        setStatusMessage({ success: true, message: `Article "${modal.title}" created successfully.` });
      }

      setModal(prev => ({ ...prev, isOpen: false }));
      loadPosts();
    } catch (err: any) {
      alert(err.message || 'Operation failed. Check if slug is unique.');
    }
  };

  const handleDelete = async (post: BlogPost) => {
    if (!window.confirm(`Are you sure you want to delete article "${post.title}"?`)) {
      return;
    }

    try {
      await api.deleteAdminBlogPost(post.id);
      setStatusMessage({ success: true, message: `Deleted article "${post.title}".` });
      loadPosts();
    } catch (err: any) {
      alert(err.message || 'Failed to delete article.');
    }
  };

  const handleToggleStatus = async (post: BlogPost) => {
    const newStatus = post.status === 'published' ? 'draft' : 'published';
    try {
      await api.updateAdminBlogStatus(post.id, newStatus);
      setStatusMessage({
        success: true,
        message: `Article status changed to ${newStatus}.`
      });
      setPosts(prev =>
        prev.map(p => (p.id === post.id ? { ...p, status: newStatus as 'published' | 'draft' } : p))
      );
    } catch (err: any) {
      alert(err.message || 'Failed to update status.');
    }
  };

  const filteredPosts = posts.filter(post => {
    const matchesSearch =
      post.title.toLowerCase().includes(search.toLowerCase()) ||
      post.slug.toLowerCase().includes(search.toLowerCase()) ||
      post.category.toLowerCase().includes(search.toLowerCase()) ||
      post.author_name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === 'all' || post.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const totalPublished = posts.filter(p => p.status === 'published').length;
  const totalDrafts = posts.filter(p => p.status === 'draft').length;
  const totalViews = posts.reduce((sum, p) => sum + (p.views_count || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
            <BookOpen className="w-6 h-6 text-teal-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Blog & Editorial CMS</h2>
            <p className="text-sm text-slate-500">
              Publish knowledge guides, case studies, and SEO articles indexed in dynamic sitemaps.
            </p>
          </div>
        </div>
        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>New Article</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Articles</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{posts.length}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Published</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{totalPublished}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">Drafts</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{totalDrafts}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-600">Total Views</p>
          <p className="text-2xl font-bold text-teal-700 mt-1">{totalViews.toLocaleString()}</p>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 text-sm ${
            statusMessage.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {statusMessage.success ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          )}
          <span>{statusMessage.message}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search articles by title, slug, category, author..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="all">All Statuses</option>
            <option value="published">Published</option>
            <option value="draft">Drafts Only</option>
          </select>
        </div>
      </div>

      {/* Articles Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading articles...</div>
        ) : filteredPosts.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="font-semibold text-slate-800">No blog posts found</p>
            <p className="text-sm mt-1">Create your first article or adjust filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Title & Slug</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Author</th>
                  <th className="py-3 px-4">Read Time</th>
                  <th className="py-3 px-4">Views</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPosts.map(post => (
                  <tr key={post.id} className="hover:bg-slate-50/50 transition">
                    <td className="py-3 px-4 max-w-xs">
                      <div className="font-semibold text-slate-900 truncate" title={post.title}>
                        {post.title}
                      </div>
                      <div className="text-xs text-slate-400 font-mono truncate">
                        /blog/{post.slug}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium">
                        <Tag className="w-3 h-3 text-slate-500" />
                        {post.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                      {post.author_name}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {post.read_time_minutes} min
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-slate-600 font-medium">
                      <span className="inline-flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5 text-slate-400" />
                        {post.views_count || 0}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleStatus(post)}
                        title="Click to toggle status"
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition ${
                          post.status === 'published'
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            post.status === 'published' ? 'bg-emerald-500' : 'bg-amber-500'
                          }`}
                        />
                        {post.status === 'published' ? 'Published' : 'Draft'}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                      <a
                        href={`/blog/${post.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex p-1.5 text-slate-400 hover:text-teal-600 hover:bg-slate-100 rounded-lg transition"
                        title="View Live Article"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => handleOpenEdit(post)}
                        className="inline-flex p-1.5 text-slate-400 hover:text-teal-600 hover:bg-slate-100 rounded-lg transition"
                        title="Edit Article"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(post)}
                        className="inline-flex p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        title="Delete Article"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit / Create Modal */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full my-8 p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">
                {modal.isEdit ? 'Edit Article' : 'Create New Article'}
              </h3>
              <button
                onClick={() => setModal(prev => ({ ...prev, isOpen: false }))}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={modal.title}
                    onChange={e => handleTitleChange(e.target.value)}
                    placeholder="e.g., How to Consult AI Experts by the Minute"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Slug * (URL path)
                  </label>
                  <input
                    type="text"
                    required
                    value={modal.slug}
                    onChange={e => setModal({ ...modal, slug: e.target.value })}
                    placeholder="how-to-consult-ai-experts"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    value={modal.category}
                    onChange={e => setModal({ ...modal, category: e.target.value })}
                    placeholder="Technology and Software"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Author Name
                  </label>
                  <input
                    type="text"
                    value={modal.author_name}
                    onChange={e => setModal({ ...modal, author_name: e.target.value })}
                    placeholder="Editorial Team"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Read Time (Minutes)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={modal.read_time_minutes}
                    onChange={e => setModal({ ...modal, read_time_minutes: parseInt(e.target.value) || 5 })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Excerpt (Summary / Short description)
                </label>
                <textarea
                  rows={2}
                  value={modal.excerpt}
                  onChange={e => setModal({ ...modal, excerpt: e.target.value })}
                  placeholder="A concise summary displayed on the blog card and for social sharing..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Cover Image URL (Optional)
                </label>
                <input
                  type="url"
                  value={modal.cover_image}
                  onChange={e => setModal({ ...modal, cover_image: e.target.value })}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Article Content * (Supports Markdown: # headings, **bold**, lists, &gt; quotes)
                </label>
                <textarea
                  rows={8}
                  required
                  value={modal.content}
                  onChange={e => setModal({ ...modal, content: e.target.value })}
                  placeholder="# Article Heading&#10;&#10;Write the full article content here in markdown..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* SEO metadata section */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                  SEO Metadata & OpenGraph
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Meta Title</label>
                    <input
                      type="text"
                      value={modal.meta_title}
                      onChange={e => setModal({ ...modal, meta_title: e.target.value })}
                      placeholder="Title tag for Google & Social"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Keywords</label>
                    <input
                      type="text"
                      value={modal.meta_keywords}
                      onChange={e => setModal({ ...modal, meta_keywords: e.target.value })}
                      placeholder="expert consultation, pay per minute"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Meta Description</label>
                  <textarea
                    rows={2}
                    value={modal.meta_description}
                    onChange={e => setModal({ ...modal, meta_description: e.target.value })}
                    placeholder="Search engine snippet preview..."
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Publication Status
                </label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="radio"
                      name="status"
                      checked={modal.status === 'published'}
                      onChange={() => setModal({ ...modal, status: 'published' })}
                      className="text-teal-600 focus:ring-teal-500"
                    />
                    <span>Published (Live & Indexed)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="radio"
                      name="status"
                      checked={modal.status === 'draft'}
                      onChange={() => setModal({ ...modal, status: 'draft' })}
                      className="text-teal-600 focus:ring-teal-500"
                    />
                    <span>Draft (Admin Only)</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-medium text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium text-sm shadow-sm"
                >
                  {modal.isEdit ? 'Save Changes' : 'Create Article'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
