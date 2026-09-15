import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BrandLogo } from '../common/BrandLogo';
import { useSiteSettings, FooterLink } from '../../context/SiteSettingsContext';
import {
  ShieldCheck,
  Lock,
  Mail,
  ChevronDown,
  Globe
} from 'lucide-react';

export const Footer: React.FC = () => {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const { footerSettings } = useSiteSettings();

  const toggleSection = (section: string) => {
    setOpenSection((prev) => (prev === section ? null : section));
  };

  // Safe link filter: STRICTLY EXCLUDE ANY ADMIN ROUTES OR ADMIN LABELS
  const sanitizeLinks = (links: FooterLink[] | undefined, fallback: Array<{ label: string; to: string; isNew?: boolean; icon?: boolean }>) => {
    if (Array.isArray(links) && links.length > 0) {
      const sanitized = links
        .filter((l) => {
          if (l.is_visible === false) return false;
          const url = (l.url || '').toLowerCase().trim();
          const label = (l.label || '').toLowerCase().trim();
          // STRICT SECURITY RULE: Public footer must never expose Admin Console
          if (url.startsWith('/admin') || url.includes('/admin') || label.includes('admin console') || label.includes('admin panel')) {
            return false;
          }
          return true;
        })
        .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
        .map((l) => ({
          label: l.label,
          to: l.url,
          isNew: l.is_new,
          icon: l.icon === 'mail'
        }));

      if (sanitized.length > 0) return sanitized;
    }
    return fallback;
  };

  const platformFallback = [
    { label: 'About Us', to: '/about' },
    { label: 'How It Works', to: '/how-it-works' },
    { label: 'Browse Services', to: '/services' },
    { label: 'Opportunities', to: '/opportunities', isNew: true }
  ];

  const policyFallback = [
    { label: 'Terms of Service', to: '/terms' },
    { label: 'Privacy Policy', to: '/privacy' },
    { label: 'Refund & Cancellation', to: '/refund-policy' },
    { label: 'Expert Policy', to: '/expert-policy' },
    { label: 'Acceptable Use', to: '/acceptable-use' }
  ];

  const supportFallback = [
    { label: 'Contact / Support', to: '/contact', icon: true },
    { label: 'Become a Provider', to: '/provider/onboard' },
    { label: 'Provider Dashboard', to: '/provider' }
  ];

  const platformLinks = useMemo(() => sanitizeLinks(footerSettings?.sections?.platform, platformFallback), [footerSettings]);
  const policyLinks = useMemo(() => sanitizeLinks(footerSettings?.sections?.policies, policyFallback), [footerSettings]);
  const supportLinks = useMemo(() => sanitizeLinks(footerSettings?.sections?.support, supportFallback), [footerSettings]);

  const companyDesc = footerSettings?.company_description ||
    'The precision marketplace for on-demand consultations. Hire verified experts for exactly the minutes you need, or monetize specialized knowledge with zero retainers.';

  const currentYear = new Date().getFullYear();
  const copyrightText = (footerSettings?.copyright_text || '© {year} HireByMinute. All rights reserved.')
    .replace('{year}', String(currentYear));

  const designerCredit = footerSettings?.designer_credit || 'Designed & Developed by Vishal Chaudhary';
  const socialLinks = useMemo(() => {
    if (!Array.isArray(footerSettings?.social_links)) return [];
    return footerSettings.social_links.filter((s) => s.is_visible !== false && s.url);
  }, [footerSettings]);

  return (
    <footer className="mt-auto border-t border-timberwolf/60 bg-white/80 backdrop-blur-sm pt-8 sm:pt-12 pb-8 px-4 sm:px-6 lg:px-8 text-midnight transition-colors">
      <div className="max-w-7xl mx-auto space-y-8 sm:space-y-10">
        
        {/* Brand Overview & Trust Badges */}
        <div className="space-y-3.5 max-w-lg">
          <BrandLogo size="md" showTagline />
          <p className="text-midnight/70 text-xs sm:text-sm leading-relaxed">
            {companyDesc}
          </p>
          <div className="flex items-center gap-3 text-xs text-midnight/60 pt-1">
            <span className="inline-flex items-center gap-1 bg-aliceblue px-2.5 py-1 rounded-md border border-timberwolf/50">
              <Lock className="w-3 h-3 text-moonstone" />
              <span>Payment Protected</span>
            </span>
            <span className="inline-flex items-center gap-1 bg-aliceblue px-2.5 py-1 rounded-md border border-timberwolf/50">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              <span>Verified Experts</span>
            </span>
          </div>

          {/* Social Links if configured */}
          {socialLinks.length > 0 && (
            <div className="flex items-center gap-3 pt-2">
              {socialLinks.map((s, idx) => (
                <a
                  key={idx}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-1 rounded-md bg-aliceblue border border-timberwolf/50 text-[11px] font-semibold text-midnight/70 hover:text-moonstone hover:border-moonstone/40 transition-colors uppercase tracking-wider"
                >
                  {s.platform}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* ======================================================================= */}
        {/* MOBILE COMPACT COLLAPSIBLE SECTIONS (md:hidden) */}
        {/* ======================================================================= */}
        <div className="md:hidden divide-y divide-timberwolf/40 border-t border-b border-timberwolf/40">
          
          {/* Section 1: Platform */}
          <div>
            <button
              type="button"
              onClick={() => toggleSection('platform')}
              className="w-full min-h-[48px] py-3 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-midnight cursor-pointer select-none"
            >
              <span>Platform</span>
              <ChevronDown className={`w-4 h-4 text-midnight/60 transition-transform duration-200 ${openSection === 'platform' ? 'rotate-180' : ''}`} />
            </button>
            {openSection === 'platform' && (
              <ul className="pb-4 space-y-2.5 text-xs text-midnight/75 font-medium animate-fade-in pl-1">
                {platformLinks.map((item) => (
                  <li key={item.to}>
                    <Link to={item.to} className="hover:text-moonstone transition-colors flex items-center gap-1.5 py-1">
                      <span>{item.label}</span>
                      {item.isNew && (
                        <span className="text-[10px] bg-moonstone/15 text-moonstone px-1.5 py-0.2 rounded font-bold">New</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Section 2: Policies */}
          <div>
            <button
              type="button"
              onClick={() => toggleSection('policies')}
              className="w-full min-h-[48px] py-3 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-midnight cursor-pointer select-none"
            >
              <span>Policies</span>
              <ChevronDown className={`w-4 h-4 text-midnight/60 transition-transform duration-200 ${openSection === 'policies' ? 'rotate-180' : ''}`} />
            </button>
            {openSection === 'policies' && (
              <ul className="pb-4 space-y-2.5 text-xs text-midnight/75 font-medium animate-fade-in pl-1">
                {policyLinks.map((item) => (
                  <li key={item.to}>
                    <Link to={item.to} className="hover:text-moonstone transition-colors block py-1">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Section 3: Support */}
          <div>
            <button
              type="button"
              onClick={() => toggleSection('support')}
              className="w-full min-h-[48px] py-3 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-midnight cursor-pointer select-none"
            >
              <span>Support</span>
              <ChevronDown className={`w-4 h-4 text-midnight/60 transition-transform duration-200 ${openSection === 'support' ? 'rotate-180' : ''}`} />
            </button>
            {openSection === 'support' && (
              <ul className="pb-4 space-y-2.5 text-xs text-midnight/75 font-medium animate-fade-in pl-1">
                {supportLinks.map((item) => (
                  <li key={item.to}>
                    <Link to={item.to} className="hover:text-moonstone transition-colors flex items-center gap-1.5 py-1">
                      {item.icon && <Mail className="w-3.5 h-3.5 text-moonstone" />}
                      <span>{item.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>

        {/* ======================================================================= */}
        {/* DESKTOP EXPANDED GRID (hidden on mobile, visible on md and above) */}
        {/* ======================================================================= */}
        <div className="hidden md:grid md:grid-cols-3 gap-8 pt-4 border-t border-timberwolf/40">
          
          {/* Col 1: Platform */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-midnight">Platform</h4>
            <ul className="space-y-2 text-xs sm:text-sm text-midnight/75 font-medium">
              {platformLinks.map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className="hover:text-moonstone transition-colors flex items-center gap-1">
                    <span>{item.label}</span>
                    {item.isNew && (
                      <span className="text-[10px] bg-moonstone/15 text-moonstone px-1.5 py-0.2 rounded font-bold">New</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 2: Policies */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-midnight">Policies</h4>
            <ul className="space-y-2 text-xs sm:text-sm text-midnight/75 font-medium">
              {policyLinks.map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className="hover:text-moonstone transition-colors">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3: Support */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-midnight">Support</h4>
            <ul className="space-y-2 text-xs sm:text-sm text-midnight/75 font-medium">
              {supportLinks.map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className="hover:text-moonstone transition-colors flex items-center gap-1.5">
                    {item.icon && <Mail className="w-3.5 h-3.5 text-moonstone" />}
                    <span>{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

        </div>

        {/* Bottom Strip */}
        <div className="pt-6 border-t border-timberwolf/40 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-midnight/70">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left">
            <p>{copyrightText}</p>
            <span className="hidden sm:inline text-timberwolf">•</span>
            <p className="flex items-center gap-1.5 font-medium text-midnight/80">
              <span className="font-bold text-midnight bg-moonstone/10 text-moonstone-dark px-2 py-0.5 rounded-md border border-moonstone/25">
                {designerCredit}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium">
            <Link to="/terms" className="hover:text-moonstone transition-colors">Terms</Link>
            <span>•</span>
            <Link to="/privacy" className="hover:text-moonstone transition-colors">Privacy</Link>
            <span>•</span>
            <Link to="/refund-policy" className="hover:text-moonstone transition-colors">Refunds</Link>
            <span>•</span>
            <Link to="/contact" className="hover:text-moonstone transition-colors">Help</Link>
          </div>
        </div>

      </div>
    </footer>
  );
};
export default Footer;
