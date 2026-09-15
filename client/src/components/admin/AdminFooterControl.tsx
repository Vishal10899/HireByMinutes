import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useSiteSettings, FooterSettings, FooterLink, FooterSocialLink } from '../../context/SiteSettingsContext';
import {
  FileText,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Lock,
  Globe,
  Mail,
  Phone,
  MapPin,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown
} from 'lucide-react';

export const AdminFooterControl: React.FC = () => {
  const { footerSettings: contextFooter, refreshSettings } = useSiteSettings();

  const [description, setDescription] = useState<string>('');
  const [contactEmail, setContactEmail] = useState<string>('');
  const [contactPhone, setContactPhone] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [copyrightText, setCopyrightText] = useState<string>('');
  const [designerCredit, setDesignerCredit] = useState<string>('');
  const [socialLinks, setSocialLinks] = useState<FooterSocialLink[]>([]);
  const [platformLinks, setPlatformLinks] = useState<FooterLink[]>([]);
  const [policyLinks, setPolicyLinks] = useState<FooterLink[]>([]);
  const [supportLinks, setSupportLinks] = useState<FooterLink[]>([]);

  const [saving, setSaving] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  // New Link Modal State
  const [newLinkModal, setNewLinkModal] = useState<{
    isOpen: boolean;
    section: 'platform' | 'policies' | 'support';
    label: string;
    url: string;
    is_new?: boolean;
    icon?: string;
  }>({
    isOpen: false,
    section: 'platform',
    label: '',
    url: ''
  });

  const [newSocialModal, setNewSocialModal] = useState<{
    isOpen: boolean;
    platform: string;
    url: string;
  }>({
    isOpen: false,
    platform: 'twitter',
    url: ''
  });

  // Sync state from context
  useEffect(() => {
    if (contextFooter) {
      setDescription(contextFooter.company_description || '');
      setContactEmail(contextFooter.contact_email || '');
      setContactPhone(contextFooter.contact_phone || '');
      setAddress(contextFooter.address || '');
      setCopyrightText(contextFooter.copyright_text || '© {year} HireByMinute. All rights reserved.');
      setDesignerCredit(contextFooter.designer_credit || 'Designed & Developed by Vishal Chaudhary');
      setSocialLinks(Array.isArray(contextFooter.social_links) ? [...contextFooter.social_links] : []);
      setPlatformLinks(Array.isArray(contextFooter.sections?.platform) ? [...contextFooter.sections.platform] : []);
      setPolicyLinks(Array.isArray(contextFooter.sections?.policies) ? [...contextFooter.sections.policies] : []);
      setSupportLinks(Array.isArray(contextFooter.sections?.support) ? [...contextFooter.sections.support] : []);
    }
  }, [contextFooter]);

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus(null);
    try {
      // Validate all URLs: STRICT GUARD AGAINST /admin
      const allUrls = [
        ...platformLinks.map((l) => l.url),
        ...policyLinks.map((l) => l.url),
        ...supportLinks.map((l) => l.url)
      ];

      const forbidden = allUrls.find((u) => (u || '').toLowerCase().startsWith('/admin') || (u || '').toLowerCase().includes('/admin'));
      if (forbidden) {
        throw new Error('SECURITY VIOLATION: Admin Console routes (/admin) cannot be linked in public footer navigation.');
      }

      const payload: FooterSettings = {
        company_description: description.trim(),
        contact_email: contactEmail.trim(),
        contact_phone: contactPhone.trim(),
        address: address.trim(),
        copyright_text: copyrightText.trim(),
        designer_credit: designerCredit.trim(),
        social_links: socialLinks,
        sections: {
          platform: platformLinks.map((l, i) => ({ ...l, order: i + 1 })),
          policies: policyLinks.map((l, i) => ({ ...l, order: i + 1 })),
          support: supportLinks.map((l, i) => ({ ...l, order: i + 1 }))
        }
      };

      await api.updateAdminFooter(payload);
      await refreshSettings();
      setSaveStatus({ success: true, message: 'Footer configuration saved and synchronized.' });
    } catch (err: any) {
      setSaveStatus({ success: false, message: err.message || 'Failed to update footer.' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddLink = () => {
    const url = newLinkModal.url.trim();
    const label = newLinkModal.label.trim();

    if (!label || !url) {
      alert('Please provide both link label and destination URL.');
      return;
    }

    if (url.toLowerCase().startsWith('/admin') || label.toLowerCase().includes('admin console')) {
      alert('SECURITY GUARD: The Admin Console cannot be exposed in the public footer.');
      return;
    }

    const newLink: FooterLink = {
      id: `link-${Date.now()}`,
      label,
      url,
      order: 99,
      is_visible: true,
      is_new: newLinkModal.is_new,
      icon: newLinkModal.icon
    };

    if (newLinkModal.section === 'platform') {
      setPlatformLinks([...platformLinks, newLink]);
    } else if (newLinkModal.section === 'policies') {
      setPolicyLinks([...policyLinks, newLink]);
    } else {
      setSupportLinks([...supportLinks, newLink]);
    }

    setNewLinkModal({ isOpen: false, section: 'platform', label: '', url: '' });
  };

  const handleToggleVisibility = (section: 'platform' | 'policies' | 'support', id: string) => {
    const updater = (list: FooterLink[]) =>
      list.map((l) => (l.id === id ? { ...l, is_visible: !l.is_visible } : l));

    if (section === 'platform') setPlatformLinks(updater);
    else if (section === 'policies') setPolicyLinks(updater);
    else setSupportLinks(updater);
  };

  const handleDeleteLink = (section: 'platform' | 'policies' | 'support', id: string) => {
    const filterer = (list: FooterLink[]) => list.filter((l) => l.id !== id);
    if (section === 'platform') setPlatformLinks(filterer);
    else if (section === 'policies') setPolicyLinks(filterer);
    else setSupportLinks(filterer);
  };

  const handleMoveItem = (section: 'platform' | 'policies' | 'support', index: number, direction: 'up' | 'down') => {
    const list = section === 'platform' ? [...platformLinks] : section === 'policies' ? [...policyLinks] : [...supportLinks];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    const temp = list[index];
    list[index] = list[targetIdx];
    list[targetIdx] = temp;

    if (section === 'platform') setPlatformLinks(list);
    else if (section === 'policies') setPolicyLinks(list);
    else setSupportLinks(list);
  };

  const handleAddSocial = () => {
    if (!newSocialModal.url.trim()) {
      alert('Please enter a valid social URL.');
      return;
    }
    setSocialLinks([
      ...socialLinks,
      { platform: newSocialModal.platform, url: newSocialModal.url.trim(), is_visible: true }
    ]);
    setNewSocialModal({ isOpen: false, platform: 'twitter', url: '' });
  };

  const renderSectionTable = (title: string, section: 'platform' | 'policies' | 'support', items: FooterLink[]) => (
    <div className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-midnight uppercase tracking-wider">{title} Links</h3>
          <span className="text-[11px] text-midnight/60">{items.length} link{items.length === 1 ? '' : 's'} configured</span>
        </div>
        <button
          type="button"
          onClick={() => setNewLinkModal({ isOpen: true, section, label: '', url: '' })}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-aliceblue text-midnight text-xs font-semibold hover:bg-lightblue/30 border border-timberwolf/60 transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-moonstone" />
          <span>Add Link</span>
        </button>
      </div>

      <div className="divide-y divide-timberwolf/30">
        {items.map((item, idx) => (
          <div key={item.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-[10px] text-midnight/40 w-4">{idx + 1}</span>
              <span className={`font-semibold ${item.is_visible ? 'text-midnight' : 'text-midnight/40 line-through'}`}>
                {item.label}
              </span>
              <span className="text-[11px] text-midnight/50 font-mono truncate max-w-xs">{item.url}</span>
              {item.is_new && (
                <span className="text-[9px] bg-moonstone/15 text-moonstone px-1 rounded font-bold">New</span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => handleMoveItem(section, idx, 'up')}
                disabled={idx === 0}
                title="Move up"
                className="p-1 rounded text-midnight/40 hover:text-midnight disabled:opacity-20 cursor-pointer"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleMoveItem(section, idx, 'down')}
                disabled={idx === items.length - 1}
                title="Move down"
                className="p-1 rounded text-midnight/40 hover:text-midnight disabled:opacity-20 cursor-pointer"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleToggleVisibility(section, item.id)}
                title={item.is_visible ? 'Hide link' : 'Show link'}
                className="p-1 rounded text-midnight/50 hover:text-midnight cursor-pointer"
              >
                {item.is_visible ? <Eye className="w-3.5 h-3.5 text-emerald-600" /> : <EyeOff className="w-3.5 h-3.5 text-midnight/40" />}
              </button>
              <button
                type="button"
                onClick={() => handleDeleteLink(section, item.id)}
                title="Remove link"
                className="p-1 rounded text-rose-500 hover:bg-rose-50 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-moonstone/10 text-moonstone-dark text-xs font-bold border border-moonstone/30 mb-2">
            <ShieldCheck className="w-3.5 h-3.5 text-moonstone" />
            <span>Public Footer Control Center</span>
          </div>
          <h1 className="text-2xl font-extrabold text-midnight tracking-tight">Footer CMS & Navigation</h1>
          <p className="text-xs text-midnight/70 mt-1">
            Customize company description, contact metadata, social links, and navigation categories. Admin Console links are permanently blocked from public exposure.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-shine inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-midnight text-aliceblue font-semibold text-xs hover:bg-midnight-hover shadow-subtle transition-all cursor-pointer disabled:opacity-50"
        >
          <Save className="w-4 h-4 text-moonstone" />
          <span>{saving ? 'Saving...' : 'Save Footer Settings'}</span>
        </button>
      </div>

      {saveStatus && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center gap-2.5 animate-fade-in ${
            saveStatus.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {saveStatus.success ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{saveStatus.message}</span>
        </div>
      )}

      {/* Brand & Copy Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card space-y-4">
          <h3 className="text-sm font-bold text-midnight uppercase tracking-wider">Company Description & Disclaimer</h3>
          <div>
            <label className="block text-xs font-semibold text-midnight mb-1">Company Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2.5 text-xs text-midnight focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 shadow-subtle"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">Copyright Template</label>
              <input
                type="text"
                value={copyrightText}
                onChange={(e) => setCopyrightText(e.target.value)}
                placeholder="© {year} HireByMinute. All rights reserved."
                className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs text-midnight focus:border-moonstone shadow-subtle"
              />
              <span className="text-[10px] text-midnight/50 mt-1 block">Use {'{year}'} for dynamic year.</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">Designer Credit</label>
              <input
                type="text"
                value={designerCredit}
                onChange={(e) => setDesignerCredit(e.target.value)}
                placeholder="Designed & Developed by Vishal Chaudhary"
                className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs text-midnight focus:border-moonstone shadow-subtle"
              />
            </div>
          </div>
        </div>

        {/* Contact Information Cards */}
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card space-y-4">
          <h3 className="text-sm font-bold text-midnight uppercase tracking-wider">Footer Contact Summary</h3>
          <div>
            <label className="block text-xs font-semibold text-midnight mb-1">Support Email</label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="support@hirebyminute.com"
              className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs text-midnight focus:border-moonstone shadow-subtle"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">Support Phone</label>
              <input
                type="text"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+1 (800) 555-0199"
                className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs text-midnight focus:border-moonstone shadow-subtle"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">Registered Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="San Francisco, CA, United States"
                className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs text-midnight focus:border-moonstone shadow-subtle"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Social Links Manager */}
      <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-midnight uppercase tracking-wider">Social Media Links</h3>
            <span className="text-[11px] text-midnight/60">Display links to company profiles</span>
          </div>
          <button
            type="button"
            onClick={() => setNewSocialModal({ isOpen: true, platform: 'twitter', url: '' })}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-aliceblue text-midnight text-xs font-semibold hover:bg-lightblue/30 border border-timberwolf/60 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-moonstone" />
            <span>Add Social Link</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {socialLinks.map((s, idx) => (
            <div key={idx} className="p-3 bg-aliceblue rounded-xl border border-timberwolf/50 flex items-center justify-between text-xs">
              <div className="min-w-0 pr-2">
                <span className="font-bold text-midnight uppercase tracking-wide text-[10px] block">{s.platform}</span>
                <span className="font-mono text-midnight/60 truncate block text-[11px]">{s.url}</span>
              </div>
              <button
                type="button"
                onClick={() => setSocialLinks(socialLinks.filter((_, i) => i !== idx))}
                className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Navigation Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {renderSectionTable('Platform', 'platform', platformLinks)}
        {renderSectionTable('Policies', 'policies', policyLinks)}
        {renderSectionTable('Support', 'support', supportLinks)}
      </div>

      {/* Modal: Add Link */}
      {newLinkModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-midnight/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-timberwolf/70 shadow-modal max-w-md w-full p-6 space-y-4 animate-fade-in text-midnight">
            <h3 className="text-base font-bold">Add Link to {newLinkModal.section.toUpperCase()}</h3>

            <div>
              <label className="block text-xs font-semibold mb-1">Link Label *</label>
              <input
                type="text"
                required
                value={newLinkModal.label}
                onChange={(e) => setNewLinkModal({ ...newLinkModal, label: e.target.value })}
                placeholder="e.g. Terms of Service"
                className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs focus:border-moonstone"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Destination URL *</label>
              <input
                type="text"
                required
                value={newLinkModal.url}
                onChange={(e) => setNewLinkModal({ ...newLinkModal, url: e.target.value })}
                placeholder="/terms or https://..."
                className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs focus:border-moonstone"
              />
              <span className="text-[10px] text-midnight/50 mt-1 block">Routes starting with /admin are strictly blocked.</span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="linkIsNew"
                checked={newLinkModal.is_new || false}
                onChange={(e) => setNewLinkModal({ ...newLinkModal, is_new: e.target.checked })}
                className="rounded text-moonstone"
              />
              <label htmlFor="linkIsNew" className="text-xs text-midnight">
                Mark as "NEW" badge
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-timberwolf/40">
              <button
                type="button"
                onClick={() => setNewLinkModal({ ...newLinkModal, isOpen: false })}
                className="px-4 py-2 rounded-xl bg-aliceblue text-midnight text-xs font-semibold border border-timberwolf/60 hover:bg-lightblue/30"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddLink}
                className="px-4 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover"
              >
                Add Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Social Link */}
      {newSocialModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-midnight/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-timberwolf/70 shadow-modal max-w-md w-full p-6 space-y-4 animate-fade-in text-midnight">
            <h3 className="text-base font-bold">Add Social Media Profile</h3>

            <div>
              <label className="block text-xs font-semibold mb-1">Platform *</label>
              <select
                value={newSocialModal.platform}
                onChange={(e) => setNewSocialModal({ ...newSocialModal, platform: e.target.value })}
                className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs focus:border-moonstone"
              >
                <option value="twitter">X / Twitter</option>
                <option value="linkedin">LinkedIn</option>
                <option value="github">GitHub</option>
                <option value="youtube">YouTube</option>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Profile URL *</label>
              <input
                type="url"
                required
                value={newSocialModal.url}
                onChange={(e) => setNewSocialModal({ ...newSocialModal, url: e.target.value })}
                placeholder="https://..."
                className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs focus:border-moonstone"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-timberwolf/40">
              <button
                type="button"
                onClick={() => setNewSocialModal({ ...newSocialModal, isOpen: false })}
                className="px-4 py-2 rounded-xl bg-aliceblue text-midnight text-xs font-semibold border border-timberwolf/60 hover:bg-lightblue/30"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddSocial}
                className="px-4 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover"
              >
                Add Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
