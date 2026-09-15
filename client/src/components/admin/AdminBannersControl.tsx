import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import {
  Megaphone,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  Calendar,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Info,
  Clock,
  Eye,
  EyeOff,
  Filter,
  ArrowRight
} from 'lucide-react';

interface Banner {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'announcement' | 'warning' | 'success' | 'promo';
  placement: 'global' | 'hero' | 'announcement' | 'services' | 'opportunities';
  start_date?: string;
  end_date?: string;
  is_active: number;
  cta_label?: string;
  cta_url?: string;
  priority: number;
  created_at?: string;
}

export const AdminBannersControl: React.FC = () => {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [placementFilter, setPlacementFilter] = useState<string>('all');
  const [statusMessage, setStatusMessage] = useState<{ success?: boolean; message?: string } | null>(null);

  // Modal State
  const [modal, setModal] = useState<{
    isOpen: boolean;
    isEdit: boolean;
    id?: string;
    title: string;
    message: string;
    type: 'info' | 'announcement' | 'warning' | 'success' | 'promo';
    placement: 'global' | 'hero' | 'announcement' | 'services' | 'opportunities';
    start_date: string;
    end_date: string;
    is_active: boolean;
    cta_label: string;
    cta_url: string;
    priority: number;
  }>({
    isOpen: false,
    isEdit: false,
    title: '',
    message: '',
    type: 'announcement',
    placement: 'global',
    start_date: '',
    end_date: '',
    is_active: true,
    cta_label: '',
    cta_url: '',
    priority: 1
  });

  const loadBanners = async () => {
    setLoading(true);
    try {
      const data = await api.getAdminBanners();
      if (Array.isArray(data.banners)) {
        setBanners(data.banners);
      }
    } catch (err: any) {
      console.error('Failed to load banners:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBanners();
  }, []);

  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (!modal.title.trim() || !modal.message.trim()) {
      alert('Please fill out both banner title and message.');
      return;
    }

    try {
      const payload = {
        title: modal.title.trim(),
        message: modal.message.trim(),
        type: modal.type,
        placement: modal.placement,
        start_date: modal.start_date ? new Date(modal.start_date).toISOString() : undefined,
        end_date: modal.end_date ? new Date(modal.end_date).toISOString() : undefined,
        is_active: modal.is_active ? 1 : 0,
        cta_label: modal.cta_label.trim() || undefined,
        cta_url: modal.cta_url.trim() || undefined,
        priority: Number(modal.priority) || 1
      };

      if (modal.isEdit && modal.id) {
        await api.updateAdminBanner(modal.id, payload);
        setStatusMessage({ success: true, message: 'Banner updated successfully.' });
      } else {
        await api.createAdminBanner(payload);
        setStatusMessage({ success: true, message: 'New banner published.' });
      }

      setModal((prev) => ({ ...prev, isOpen: false }));
      await loadBanners();
    } catch (err: any) {
      setStatusMessage({ success: false, message: err.message || 'Failed to save banner.' });
    }
  };

  const handleToggleActive = async (banner: Banner) => {
    try {
      const newStatus = banner.is_active === 1 ? false : true;
      await api.toggleAdminBanner(banner.id, newStatus);
      await loadBanners();
    } catch (err: any) {
      alert(err.message || 'Failed to toggle banner status');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this announcement banner?')) return;
    try {
      await api.deleteAdminBanner(id);
      await loadBanners();
      setStatusMessage({ success: true, message: 'Banner removed.' });
    } catch (err: any) {
      alert(err.message || 'Failed to delete banner');
    }
  };

  const filteredBanners = banners.filter(
    (b) => placementFilter === 'all' || b.placement === placementFilter
  );

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-moonstone/10 text-moonstone-dark text-xs font-bold border border-moonstone/30 mb-2">
            <Megaphone className="w-3.5 h-3.5 text-moonstone" />
            <span>Platform Broadcast System</span>
          </div>
          <h1 className="text-2xl font-extrabold text-midnight tracking-tight">
            Banners & Announcements
          </h1>
          <p className="text-xs text-midnight/70 mt-1">
            Publish time-sensitive alerts, service maintenance schedules, launch incentives, and contextual warnings.
          </p>
        </div>

        <button
          onClick={() =>
            setModal({
              isOpen: true,
              isEdit: false,
              title: '',
              message: '',
              type: 'announcement',
              placement: 'global',
              start_date: '',
              end_date: '',
              is_active: true,
              cta_label: '',
              cta_url: '',
              priority: 1
            })
          }
          className="btn-shine inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-midnight text-aliceblue font-semibold text-xs hover:bg-midnight-hover shadow-subtle transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4 text-moonstone" />
          <span>Create Announcement</span>
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

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {['all', 'global', 'hero', 'announcement', 'services', 'opportunities'].map((p) => (
          <button
            key={p}
            onClick={() => setPlacementFilter(p)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-colors cursor-pointer ${
              placementFilter === p
                ? 'bg-midnight text-aliceblue shadow-subtle'
                : 'bg-white border border-timberwolf/60 text-midnight/70 hover:text-midnight'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Banners Table */}
      <div className="bg-white rounded-2xl border border-timberwolf/60 overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-aliceblue-surface border-b border-timberwolf/40 text-midnight/70">
                <th className="py-3 px-4 font-semibold">Banner</th>
                <th className="py-3 px-4 font-semibold">Placement</th>
                <th className="py-3 px-4 font-semibold">Type</th>
                <th className="py-3 px-4 font-semibold">Priority</th>
                <th className="py-3 px-4 font-semibold">Schedule</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-timberwolf/30">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-midnight/50">
                    Loading banners...
                  </td>
                </tr>
              ) : filteredBanners.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-midnight/50">
                    No banners configured for placement "{placementFilter}".
                  </td>
                </tr>
              ) : (
                filteredBanners.map((banner) => (
                  <tr key={banner.id} className="hover:bg-aliceblue/50 transition-colors">
                    <td className="py-3.5 px-4 max-w-sm">
                      <div className="font-bold text-midnight truncate">{banner.title}</div>
                      <div className="text-[11px] text-midnight/60 line-clamp-1">{banner.message}</div>
                      {banner.cta_label && (
                        <div className="text-[10px] text-moonstone font-semibold mt-0.5 flex items-center gap-1">
                          <span>CTA: {banner.cta_label}</span>
                          <span className="font-mono text-midnight/40">({banner.cta_url})</span>
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-full bg-aliceblue border border-timberwolf/60 text-[11px] font-semibold text-midnight uppercase">
                        {banner.placement}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          banner.type === 'warning'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : banner.type === 'success'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : banner.type === 'promo'
                            ? 'bg-purple-50 text-purple-800 border border-purple-200'
                            : 'bg-blue-50 text-blue-800 border border-blue-200'
                        }`}
                      >
                        {banner.type}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold text-midnight">
                      #{banner.priority}
                    </td>

                    <td className="py-3.5 px-4 text-[11px] text-midnight/70">
                      {banner.end_date ? (
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-midnight/40" />
                          <span>Expires: {new Date(banner.end_date).toLocaleDateString()}</span>
                        </div>
                      ) : (
                        <span className="text-midnight/40">Continuous</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          banner.is_active === 1
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {banner.is_active === 1 ? 'ACTIVE' : 'PAUSED'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleToggleActive(banner)}
                          className="px-2.5 py-1 rounded-lg bg-aliceblue text-midnight font-semibold text-[11px] hover:bg-lightblue/30 transition-colors cursor-pointer"
                        >
                          {banner.is_active === 1 ? 'Pause' : 'Activate'}
                        </button>
                        <button
                          onClick={() =>
                            setModal({
                              isOpen: true,
                              isEdit: true,
                              id: banner.id,
                              title: banner.title,
                              message: banner.message,
                              type: banner.type,
                              placement: banner.placement,
                              start_date: banner.start_date ? banner.start_date.slice(0, 16) : '',
                              end_date: banner.end_date ? banner.end_date.slice(0, 16) : '',
                              is_active: banner.is_active === 1,
                              cta_label: banner.cta_label || '',
                              cta_url: banner.cta_url || '',
                              priority: banner.priority || 1
                            })
                          }
                          className="p-1.5 rounded-lg bg-aliceblue text-midnight/70 hover:text-midnight transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(banner.id)}
                          className="p-1.5 rounded-lg bg-aliceblue text-midnight/40 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-50 bg-midnight/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveBanner}
            className="bg-white rounded-2xl border border-timberwolf/70 shadow-modal max-w-lg w-full p-6 space-y-4 animate-fade-in text-midnight"
          >
            <h3 className="text-base font-bold">
              {modal.isEdit ? 'Edit Announcement Banner' : 'Create New Announcement'}
            </h3>

            <div>
              <label className="block text-xs font-semibold mb-1">Banner Title *</label>
              <input
                type="text"
                required
                value={modal.title}
                onChange={(e) => setModal({ ...modal, title: e.target.value })}
                placeholder="e.g. Scheduled Platform Maintenance"
                className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs focus:border-moonstone"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Announcement Message *</label>
              <textarea
                rows={2}
                required
                value={modal.message}
                onChange={(e) => setModal({ ...modal, message: e.target.value })}
                placeholder="Brief notice visible to visitors and providers..."
                className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs focus:border-moonstone"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Placement *</label>
                <select
                  value={modal.placement}
                  onChange={(e) => setModal({ ...modal, placement: e.target.value as any })}
                  className="w-full bg-white border border-timberwolf/70 rounded-xl px-3 py-2 text-xs focus:border-moonstone"
                >
                  <option value="global">Global (All Pages)</option>
                  <option value="hero">Home Hero</option>
                  <option value="announcement">Announcement Bar</option>
                  <option value="services">Services Catalog</option>
                  <option value="opportunities">Opportunities Hub</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Visual Type *</label>
                <select
                  value={modal.type}
                  onChange={(e) => setModal({ ...modal, type: e.target.value as any })}
                  className="w-full bg-white border border-timberwolf/70 rounded-xl px-3 py-2 text-xs focus:border-moonstone"
                >
                  <option value="announcement">Announcement (Indigo)</option>
                  <option value="info">Info (Blue)</option>
                  <option value="warning">Warning (Amber)</option>
                  <option value="success">Success (Emerald)</option>
                  <option value="promo">Promo (Purple)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Priority</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={modal.priority}
                  onChange={(e) => setModal({ ...modal, priority: parseInt(e.target.value) || 1 })}
                  className="w-full bg-white border border-timberwolf/70 rounded-xl px-3 py-2 text-xs focus:border-moonstone"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">CTA Button Label</label>
                <input
                  type="text"
                  value={modal.cta_label}
                  onChange={(e) => setModal({ ...modal, cta_label: e.target.value })}
                  placeholder="e.g. Learn More"
                  className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs focus:border-moonstone"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">CTA Destination URL</label>
                <input
                  type="text"
                  value={modal.cta_url}
                  onChange={(e) => setModal({ ...modal, cta_url: e.target.value })}
                  placeholder="/terms or https://..."
                  className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs focus:border-moonstone"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Start Date (Optional)</label>
                <input
                  type="datetime-local"
                  value={modal.start_date}
                  onChange={(e) => setModal({ ...modal, start_date: e.target.value })}
                  className="w-full bg-white border border-timberwolf/70 rounded-xl px-3 py-2 text-xs focus:border-moonstone"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Expiration Date (Optional)</label>
                <input
                  type="datetime-local"
                  value={modal.end_date}
                  onChange={(e) => setModal({ ...modal, end_date: e.target.value })}
                  className="w-full bg-white border border-timberwolf/70 rounded-xl px-3 py-2 text-xs focus:border-moonstone"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="bannerActive"
                checked={modal.is_active}
                onChange={(e) => setModal({ ...modal, is_active: e.target.checked })}
                className="w-4 h-4 text-moonstone rounded cursor-pointer"
              />
              <label htmlFor="bannerActive" className="text-xs font-semibold text-midnight cursor-pointer">
                Publish immediately (Active)
              </label>
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
                {modal.isEdit ? 'Save Changes' : 'Publish Banner'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
