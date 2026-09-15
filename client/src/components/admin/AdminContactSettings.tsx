import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useSiteSettings, ContactSettings } from '../../context/SiteSettingsContext';
import {
  Mail,
  Phone,
  Clock,
  MapPin,
  MessageCircle,
  Save,
  CheckCircle2,
  AlertCircle,
  Sliders,
  HelpCircle,
  ShieldCheck
} from 'lucide-react';

export const AdminContactSettings: React.FC = () => {
  const { contactSettings: contextContact, refreshSettings } = useSiteSettings();

  const [supportEmail, setSupportEmail] = useState<string>('');
  const [businessEmail, setBusinessEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [supportHours, setSupportHours] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [whatsappUrl, setWhatsappUrl] = useState<string>('');
  const [contactFormEnabled, setContactFormEnabled] = useState<boolean>(true);

  const [saving, setSaving] = useState<boolean>(false);
  const [status, setStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  useEffect(() => {
    if (contextContact) {
      setSupportEmail(contextContact.support_email || '');
      setBusinessEmail(contextContact.business_email || '');
      setPhone(contextContact.phone || '');
      setSupportHours(contextContact.support_hours || '');
      setAddress(contextContact.address || '');
      setWhatsappUrl(contextContact.whatsapp_url || '');
      setContactFormEnabled(contextContact.contact_form_enabled !== false);
    }
  }, [contextContact]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);

    try {
      const payload: ContactSettings = {
        support_email: supportEmail.trim(),
        business_email: businessEmail.trim(),
        phone: phone.trim(),
        support_hours: supportHours.trim(),
        address: address.trim(),
        whatsapp_url: whatsappUrl.trim(),
        contact_form_enabled: contactFormEnabled
      };

      await api.updateAdminContact(payload);
      await refreshSettings();
      setStatus({ success: true, message: 'Contact settings updated and active across the platform.' });
    } catch (err: any) {
      setStatus({ success: false, message: err.message || 'Failed to update contact settings.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-moonstone/10 text-moonstone-dark text-xs font-bold border border-moonstone/30 mb-2">
            <Mail className="w-3.5 h-3.5 text-moonstone" />
            <span>Support & Contact Configuration</span>
          </div>
          <h1 className="text-2xl font-extrabold text-midnight tracking-tight">Contact Settings</h1>
          <p className="text-xs text-midnight/70 mt-1">
            Centrally manage public support email, enterprise inquiry address, phone, support operating hours, and live WhatsApp routing.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-shine inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-midnight text-aliceblue font-semibold text-xs hover:bg-midnight-hover shadow-subtle transition-all cursor-pointer disabled:opacity-50"
        >
          <Save className="w-4 h-4 text-moonstone" />
          <span>{saving ? 'Saving...' : 'Save Contact Information'}</span>
        </button>
      </div>

      {status && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center gap-2.5 animate-fade-in ${
            status.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {status.success ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{status.message}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Email Addresses */}
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card space-y-4">
          <h3 className="text-sm font-bold text-midnight uppercase tracking-wider flex items-center gap-2">
            <Mail className="w-4 h-4 text-moonstone" />
            <span>Email Channels</span>
          </h3>

          <div>
            <label className="block text-xs font-semibold text-midnight mb-1">
              Primary Support Email *
            </label>
            <input
              type="email"
              required
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              placeholder="support@hirebyminute.com"
              className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs text-midnight focus:border-moonstone shadow-subtle"
            />
            <span className="text-[10px] text-midnight/50 mt-1 block">
              Displayed on Contact page, footer, error pages, and consultation receipts.
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-midnight mb-1">
              Business / Partnerships Email
            </label>
            <input
              type="email"
              value={businessEmail}
              onChange={(e) => setBusinessEmail(e.target.value)}
              placeholder="business@hirebyminute.com"
              className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs text-midnight focus:border-moonstone shadow-subtle"
            />
            <span className="text-[10px] text-midnight/50 mt-1 block">
              Used for institutional consultations, corporate accounts, and expert agency partnerships.
            </span>
          </div>
        </div>

        {/* Telephone & Messaging */}
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card space-y-4">
          <h3 className="text-sm font-bold text-midnight uppercase tracking-wider flex items-center gap-2">
            <Phone className="w-4 h-4 text-moonstone" />
            <span>Phone & Direct Messaging</span>
          </h3>

          <div>
            <label className="block text-xs font-semibold text-midnight mb-1">Support Phone</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (800) 555-0199"
              className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs text-midnight focus:border-moonstone shadow-subtle"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-midnight mb-1">
              WhatsApp Contact URL / Link
            </label>
            <input
              type="url"
              value={whatsappUrl}
              onChange={(e) => setWhatsappUrl(e.target.value)}
              placeholder="https://wa.me/18005550199"
              className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs text-midnight focus:border-moonstone shadow-subtle"
            />
            <span className="text-[10px] text-midnight/50 mt-1 block">
              Optional direct link to customer support WhatsApp concierge.
            </span>
          </div>
        </div>

        {/* Operating Hours & Physical Address */}
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card space-y-4">
          <h3 className="text-sm font-bold text-midnight uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4 text-moonstone" />
            <span>Operating Hours & Physical Address</span>
          </h3>

          <div>
            <label className="block text-xs font-semibold text-midnight mb-1">Support Desk Hours</label>
            <input
              type="text"
              value={supportHours}
              onChange={(e) => setSupportHours(e.target.value)}
              placeholder="Monday – Friday: 9:00 AM – 6:00 PM EST (24/7 Escalation Desk)"
              className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs text-midnight focus:border-moonstone shadow-subtle"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-midnight mb-1">Company Registered Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="San Francisco, CA, United States"
              className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs text-midnight focus:border-moonstone shadow-subtle"
            />
          </div>
        </div>

        {/* Form Controls */}
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card space-y-4">
          <h3 className="text-sm font-bold text-midnight uppercase tracking-wider flex items-center gap-2">
            <Sliders className="w-4 h-4 text-moonstone" />
            <span>Public Form Controls</span>
          </h3>

          <div className="flex items-center justify-between p-4 bg-aliceblue rounded-xl border border-timberwolf/50">
            <div>
              <div className="text-xs font-bold text-midnight">Enable Public Contact Form</div>
              <div className="text-[11px] text-midnight/60 mt-0.5">
                When enabled, visitors can submit support inquiries directly on the Contact page.
              </div>
            </div>
            <input
              type="checkbox"
              checked={contactFormEnabled}
              onChange={(e) => setContactFormEnabled(e.target.checked)}
              className="w-4 h-4 text-moonstone rounded cursor-pointer"
            />
          </div>

          <div className="p-4 bg-moonstone/5 border border-moonstone/20 rounded-xl text-xs text-midnight/80 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-moonstone-dark">
              <HelpCircle className="w-3.5 h-3.5 text-moonstone" />
              <span>Contact Synchronization</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Updates saved here propagate immediately across the Contact page, Footer, and customer escalation documents with audit logging.
            </p>
          </div>
        </div>
      </form>
    </div>
  );
};
