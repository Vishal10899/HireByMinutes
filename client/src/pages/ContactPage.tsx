import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSiteSettings } from '../context/SiteSettingsContext';
import {
  Mail,
  MessageSquare,
  HelpCircle,
  Clock,
  ShieldCheck,
  CreditCard,
  Send,
  CheckCircle2,
  AlertCircle,
  FileQuestion,
  Sparkles,
  Phone,
  MapPin,
  MessageCircle
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { usePageSEO } from '../hooks/usePageSEO';

export const ContactPage: React.FC = () => {
  usePageSEO({
    title: 'Contact & Support — HireByMinute',
    description: 'Get in touch with HireByMinute platform support, client assistance, or business inquiries.',
    canonicalPath: '/contact'
  });

  const { user } = useAuth();
  const { contactSettings } = useSiteSettings();

  const [name, setName] = useState(user?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [category, setCategory] = useState('general');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (user) {
      if (!name) setName(user.full_name);
      if (!email) setEmail(user.email);
    }
  }, [user]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      alert('Please fill out all required fields.');
      return;
    }

    setSubmitting(true);
    // Simulate support ticket dispatch
    setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
      confetti({ particleCount: 60, spread: 60 });
    }, 600);
  };

  return (
    <div className="min-h-screen bg-aliceblue text-midnight py-10 sm:py-14">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        
        {/* Header Hero */}
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-moonstone/10 text-moonstone-dark text-xs font-bold border border-moonstone/30">
            <HelpCircle className="w-3.5 h-3.5 text-moonstone" />
            <span>Help Center & Support Desk</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-midnight">
            Contact & Support
          </h1>
          <p className="text-xs sm:text-sm text-midnight/70 leading-relaxed">
            Have a question about a consultation, billing inquiry, expert verification, or technical session support? We are here to help.
          </p>
        </div>

        {/* Support Categories Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card space-y-2">
            <div className="w-8 h-8 rounded-lg bg-aliceblue text-moonstone flex items-center justify-center border border-timberwolf/60">
              <CreditCard className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-midnight uppercase tracking-wider">Billing & Payments</h3>
            <p className="text-xs text-midnight/70 leading-relaxed">
              Inquiries regarding consultation receipts, payment authorizations, refunds, duplicate charge checks, and payout calculations.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card space-y-2">
            <div className="w-8 h-8 rounded-lg bg-aliceblue text-moonstone flex items-center justify-center border border-timberwolf/60">
              <Clock className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-midnight uppercase tracking-wider">Sessions & Technical</h3>
            <p className="text-xs text-midnight/70 leading-relaxed">
              WebRTC connection assistance, session room timer questions, audio/video troubleshooting, and browser compatibility.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-timberwolf/70 p-5 shadow-card space-y-2">
            <div className="w-8 h-8 rounded-lg bg-aliceblue text-moonstone flex items-center justify-center border border-timberwolf/60">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-midnight uppercase tracking-wider">Expert Verification</h3>
            <p className="text-xs text-midnight/70 leading-relaxed">
              Credential review status, provider onboarding questions, service listing updates, and category placement.
            </p>
          </div>
        </div>

        {/* Main Grid: Form + Direct Contact Information */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Contact Form (2 cols) */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-timberwolf/70 p-6 sm:p-8 shadow-card">
            {submitted ? (
              <div className="text-center py-10 space-y-4 animate-fade-in">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto border border-emerald-200">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-extrabold text-midnight">Support Inquiry Received</h3>
                <p className="text-xs sm:text-sm text-midnight/70 max-w-md mx-auto leading-relaxed">
                  Thank you for reaching out, <strong>{name}</strong>. A confirmation has been logged for <strong>{email}</strong> and our team will review your inquiry within 24 hours.
                </p>
                <div className="pt-3">
                  <button
                    onClick={() => {
                      setSubmitted(false);
                      setSubject('');
                      setMessage('');
                    }}
                    className="px-4 py-2 rounded-xl bg-aliceblue text-midnight text-xs font-semibold border border-timberwolf/60 hover:bg-lightblue/30 transition-all cursor-pointer"
                  >
                    Send Another Message
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <h3 className="text-base font-bold text-midnight flex items-center gap-2 border-b border-timberwolf/40 pb-3">
                  <MessageSquare className="w-4 h-4 text-moonstone" />
                  <span>Submit a Support Request</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-midnight mb-1">Your Name *</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your Full Name"
                      className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs text-midnight focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 shadow-subtle"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-midnight mb-1">Email Address *</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs text-midnight focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 shadow-subtle"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-midnight mb-1">Inquiry Category *</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs text-midnight focus:border-moonstone shadow-subtle cursor-pointer"
                    >
                      <option value="general">General Support</option>
                      <option value="account">Account & Authentication</option>
                      <option value="billing">Billing & Payment Inquiries</option>
                      <option value="session">Consultation & Technical Issue</option>
                      <option value="verification">Expert Verification Review</option>
                      <option value="policy">Policy & Safety Report</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-midnight mb-1">Subject</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Brief topic summary..."
                      className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs text-midnight focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 shadow-subtle"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-midnight mb-1">Message Details *</label>
                  <textarea
                    rows={4}
                    required
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Describe your question or issue with relevant session IDs or dates..."
                    className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2.5 text-xs text-midnight focus:border-moonstone focus:ring-2 focus:ring-moonstone/20 shadow-subtle"
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-shine inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover shadow-subtle transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{submitting ? 'Submitting...' : 'Send Message'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Direct Support Information & FAQ Quick Links */}
          <div className="space-y-6">
            
            {/* Direct Email Card */}
            <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-midnight flex items-center gap-2">
                <Mail className="w-4 h-4 text-moonstone" />
                <span>Support & Inquiries</span>
              </h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                For escalations, payment audits, or formal legal notices:
              </p>
              <div className="space-y-2">
                <div className="p-3 bg-aliceblue rounded-xl border border-timberwolf/50">
                  <div className="text-[10px] uppercase font-bold text-midnight/60 mb-0.5">Customer Support</div>
                  <a
                    href={`mailto:${contactSettings?.support_email || 'support@hirebyminute.com'}`}
                    className="text-xs font-bold text-moonstone hover:underline font-mono select-all"
                  >
                    {contactSettings?.support_email || 'support@hirebyminute.com'}
                  </a>
                  <div className="text-[10px] text-midnight/60 mt-0.5">Average Response Time: &lt; 24h</div>
                </div>

                {contactSettings?.business_email && (
                  <div className="p-3 bg-aliceblue rounded-xl border border-timberwolf/50">
                    <div className="text-[10px] uppercase font-bold text-midnight/60 mb-0.5">Partnerships & Enterprise</div>
                    <a
                      href={`mailto:${contactSettings.business_email}`}
                      className="text-xs font-bold text-midnight hover:text-moonstone font-mono select-all"
                    >
                      {contactSettings.business_email}
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Phone & Operating Hours */}
            {(contactSettings?.phone || contactSettings?.support_hours) && (
              <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-midnight flex items-center gap-2">
                  <Phone className="w-4 h-4 text-moonstone" />
                  <span>Phone & Operating Hours</span>
                </h3>
                {contactSettings?.phone && (
                  <div>
                    <div className="text-[10px] uppercase font-bold text-midnight/60">Direct Line</div>
                    <a href={`tel:${contactSettings.phone}`} className="text-xs font-bold text-midnight hover:text-moonstone font-mono">
                      {contactSettings.phone}
                    </a>
                  </div>
                )}
                {contactSettings?.support_hours && (
                  <div className="text-xs text-midnight/70 pt-1 border-t border-timberwolf/30">
                    <div className="text-[10px] uppercase font-bold text-midnight/60">Support Hours</div>
                    <p className="mt-0.5">{contactSettings.support_hours}</p>
                  </div>
                )}
                {contactSettings?.address && (
                  <div className="text-xs text-midnight/70 pt-2 border-t border-timberwolf/30 flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-midnight/50 shrink-0 mt-0.5" />
                    <span>{contactSettings.address}</span>
                  </div>
                )}
                {contactSettings?.whatsapp_url && (
                  <div className="pt-2">
                    <a
                      href={contactSettings.whatsapp_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 transition-colors shadow-subtle w-full justify-center"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Chat on WhatsApp</span>
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Quick Links Card */}
            <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-midnight flex items-center gap-2">
                <FileQuestion className="w-4 h-4 text-moonstone" />
                <span>Self-Service Guides</span>
              </h3>
              <ul className="space-y-2 text-xs">
                <li>
                  <Link to="/how-it-works" className="text-midnight/80 hover:text-moonstone font-medium flex items-center justify-between py-1 border-b border-timberwolf/30">
                    <span>How It Works Guide</span>
                    <span className="text-midnight/40">→</span>
                  </Link>
                </li>
                <li>
                  <Link to="/refund-policy" className="text-midnight/80 hover:text-moonstone font-medium flex items-center justify-between py-1 border-b border-timberwolf/30">
                    <span>Refund & Cancellation Policy</span>
                    <span className="text-midnight/40">→</span>
                  </Link>
                </li>
                <li>
                  <Link to="/expert-policy" className="text-midnight/80 hover:text-moonstone font-medium flex items-center justify-between py-1 border-b border-timberwolf/30">
                    <span>Expert Quality Standards</span>
                    <span className="text-midnight/40">→</span>
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="text-midnight/80 hover:text-moonstone font-medium flex items-center justify-between py-1">
                    <span>Terms of Service</span>
                    <span className="text-midnight/40">→</span>
                  </Link>
                </li>
              </ul>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
export default ContactPage;
