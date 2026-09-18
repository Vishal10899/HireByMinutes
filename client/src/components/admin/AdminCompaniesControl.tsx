import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Company } from '../../types';
import { Button } from '../common/Button';
import {
  Building2,
  PlusCircle,
  Search,
  ExternalLink,
  Edit3,
  Trash2,
  CheckCircle2,
  Archive,
  RefreshCw,
  AlertCircle,
  MapPin,
  Globe,
  Briefcase,
  X
} from 'lucide-react';

export const AdminCompaniesControl: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('all');
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    logo_url: '',
    website: '',
    industry: '',
    company_size: '11-50 employees',
    location: '',
    description: '',
    status: 'active' as 'active' | 'archived'
  });

  const loadCompanies = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdminCompanies();
      setCompanies(res.companies || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load companies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompanies();
  }, []);

  const handleOpenCreate = () => {
    setEditingCompany(null);
    setFormData({
      name: '',
      logo_url: '',
      website: '',
      industry: '',
      company_size: '11-50 employees',
      location: '',
      description: '',
      status: 'active'
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (comp: Company) => {
    setEditingCompany(comp);
    setFormData({
      name: comp.name || '',
      logo_url: comp.logo_url || '',
      website: comp.website || '',
      industry: comp.industry || '',
      company_size: comp.company_size || '11-50 employees',
      location: comp.location || '',
      description: comp.description || '',
      status: comp.status || 'active'
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Company name is required');
      return;
    }

    setSaving(true);
    try {
      if (editingCompany) {
        await api.updateAdminCompany(editingCompany.id, formData);
      } else {
        await api.createAdminCompany(formData);
      }
      setModalOpen(false);
      await loadCompanies();
    } catch (err: any) {
      alert(err.message || 'Failed to save company');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (comp: Company) => {
    if (!window.confirm(`Delete company "${comp.name}"? All associated job postings and candidate applications will be permanently deleted.`)) {
      return;
    }
    try {
      await api.deleteAdminCompany(comp.id);
      await loadCompanies();
    } catch (err: any) {
      alert(err.message || 'Failed to delete company');
    }
  };

  const handleToggleStatus = async (comp: Company) => {
    const newStatus = comp.status === 'active' ? 'archived' : 'active';
    try {
      await api.updateAdminCompany(comp.id, { status: newStatus });
      await loadCompanies();
    } catch (err: any) {
      alert(err.message || 'Failed to update company status');
    }
  };

  const filteredCompanies = companies.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.industry && c.industry.toLowerCase().includes(q)) ||
        (c.location && c.location.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-moonstone/10 text-moonstone-dark text-[11px] font-bold border border-moonstone/30 mb-2">
            <Building2 className="w-3.5 h-3.5 text-moonstone" />
            <span>Employer Entity Directory</span>
          </div>
          <h1 className="text-2xl font-extrabold text-midnight tracking-tight">
            Company Publishers
          </h1>
          <p className="text-xs text-midnight/70 mt-1">
            Manage hiring entities, verified company profiles, branding logos, and publisher statuses.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadCompanies}
            disabled={loading}
            className="p-2.5 rounded-xl border border-timberwolf/70 bg-aliceblue hover:bg-white text-midnight transition-colors cursor-pointer"
            title="Reload companies"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-moonstone' : ''}`} />
          </button>
          <Button
            onClick={handleOpenCreate}
            variant="primary"
            size="sm"
            className="shadow-subtle text-xs"
            icon={<PlusCircle className="w-4 h-4" />}
          >
            Create Company
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-timberwolf/70 shadow-subtle">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-midnight/40 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search companies by name, industry, or location..."
            className="w-full pl-9 pr-3 py-2 bg-aliceblue/60 border border-timberwolf/70 rounded-xl text-xs text-midnight placeholder:text-midnight/40 focus:outline-none focus:border-moonstone"
          />
        </div>

        <div className="flex items-center gap-2">
          {(['all', 'active', 'archived'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-colors cursor-pointer ${
                statusFilter === st
                  ? 'bg-midnight text-aliceblue shadow-xs'
                  : 'bg-aliceblue text-midnight/70 hover:text-midnight border border-timberwolf/60'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Companies List / Table */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-timberwolf/60 p-6 h-28 animate-pulse" />
          ))}
        </div>
      ) : filteredCompanies.length === 0 ? (
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-12 text-center shadow-card space-y-3 max-w-md mx-auto">
          <Building2 className="w-10 h-10 text-moonstone mx-auto" />
          <h3 className="text-base font-bold text-midnight">No Companies Found</h3>
          <p className="text-xs text-midnight/70">
            {search || statusFilter !== 'all'
              ? 'No companies match your current search criteria.'
              : 'No company entities have been created yet. Create a company to start publishing jobs.'}
          </p>
          {!search && statusFilter === 'all' && (
            <div className="pt-2">
              <Button onClick={handleOpenCreate} variant="primary" size="sm">
                Create First Company
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCompanies.map((comp) => (
            <div
              key={comp.id}
              className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card hover:shadow-subtle transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="w-12 h-12 rounded-xl bg-aliceblue border border-timberwolf/60 flex items-center justify-center font-bold text-midnight overflow-hidden shrink-0">
                    {comp.logo_url ? (
                      <img src={comp.logo_url} alt={comp.name} className="w-full h-full object-cover" />
                    ) : (
                      comp.name.slice(0, 2).toUpperCase()
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        comp.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-zinc-100 text-zinc-600 border border-zinc-200'
                      }`}
                    >
                      {comp.status}
                    </span>
                  </div>
                </div>

                <h3 className="text-base font-bold text-midnight truncate">{comp.name}</h3>

                <div className="space-y-1 mt-2 text-xs text-midnight/70">
                  {comp.industry && (
                    <div className="flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-moonstone shrink-0" />
                      <span className="truncate">{comp.industry} • {comp.company_size || 'N/A'}</span>
                    </div>
                  )}
                  {comp.location && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-moonstone shrink-0" />
                      <span className="truncate">{comp.location}</span>
                    </div>
                  )}
                  {comp.website && (
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <Globe className="w-3.5 h-3.5 text-moonstone shrink-0" />
                      <a
                        href={comp.website.startsWith('http') ? comp.website : `https://${comp.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-moonstone hover:underline truncate inline-flex items-center gap-1"
                      >
                        <span>{comp.website.replace(/^https?:\/\//, '')}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </div>
                  )}
                </div>

                {comp.description && (
                  <p className="text-xs text-midnight/65 mt-3 line-clamp-2 leading-relaxed">
                    {comp.description}
                  </p>
                )}
              </div>

              <div className="pt-4 mt-4 border-t border-timberwolf/40 flex items-center justify-between">
                <span className="text-xs font-semibold text-midnight/60">
                  {Number(comp.active_jobs || 0)} active jobs ({Number(comp.total_jobs || 0)} total)
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleToggleStatus(comp)}
                    className="p-1.5 rounded-lg text-midnight/60 hover:text-midnight hover:bg-aliceblue cursor-pointer"
                    title={comp.status === 'active' ? 'Archive Company' : 'Activate Company'}
                  >
                    <Archive className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleOpenEdit(comp)}
                    className="p-1.5 rounded-lg text-midnight/60 hover:text-moonstone hover:bg-aliceblue cursor-pointer"
                    title="Edit Company"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(comp)}
                    className="p-1.5 rounded-lg text-midnight/60 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                    title="Delete Company"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Company Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-midnight/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-timberwolf/70 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-timberwolf/40">
              <h3 className="text-lg font-bold text-midnight">
                {editingCompany ? 'Edit Company Entity' : 'Create Company Entity'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-xl text-midnight/50 hover:text-midnight hover:bg-aliceblue cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-midnight mb-1">
                  Company Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Acme Technologies"
                  className="w-full bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-2 text-xs text-midnight focus:outline-none focus:border-moonstone"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-midnight mb-1">
                    Industry
                  </label>
                  <input
                    type="text"
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    placeholder="e.g. Fintech, AI / ML"
                    className="w-full bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-2 text-xs text-midnight focus:outline-none focus:border-moonstone"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-midnight mb-1">
                    Company Size
                  </label>
                  <select
                    value={formData.company_size}
                    onChange={(e) => setFormData({ ...formData, company_size: e.target.value })}
                    className="w-full bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-2 text-xs text-midnight focus:outline-none focus:border-moonstone cursor-pointer"
                  >
                    <option value="1-10 employees">1-10 employees</option>
                    <option value="11-50 employees">11-50 employees</option>
                    <option value="51-200 employees">51-200 employees</option>
                    <option value="201-500 employees">201-500 employees</option>
                    <option value="501-1000 employees">501-1000 employees</option>
                    <option value="1000+ employees">1000+ employees</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-midnight mb-1">
                    Location / Headquarters
                  </label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="e.g. San Francisco, CA"
                    className="w-full bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-2 text-xs text-midnight focus:outline-none focus:border-moonstone"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-midnight mb-1">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-2 text-xs text-midnight focus:outline-none focus:border-moonstone cursor-pointer"
                  >
                    <option value="active">Active (Visible)</option>
                    <option value="archived">Archived (Hidden)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-midnight mb-1">
                  Website URL
                </label>
                <input
                  type="text"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  placeholder="e.g. https://acme.com"
                  className="w-full bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-2 text-xs text-midnight focus:outline-none focus:border-moonstone"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-midnight mb-1">
                  Logo Image URL
                </label>
                <input
                  type="text"
                  value={formData.logo_url}
                  onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
                  placeholder="https://... logo.png or svg"
                  className="w-full bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-2 text-xs text-midnight focus:outline-none focus:border-moonstone"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-midnight mb-1">
                  Company Description
                </label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief overview of company mission, culture, and products..."
                  className="w-full bg-aliceblue/60 border border-timberwolf/70 rounded-xl p-3 text-xs text-midnight focus:outline-none focus:border-moonstone resize-none"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-timberwolf/40">
                <Button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  variant="outline"
                  size="sm"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : editingCompany ? 'Update Company' : 'Create Company'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
