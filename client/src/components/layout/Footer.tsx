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

const CLIENTS_FALLBACK = [
  { label: 'Find Experts', to: '/services' },
  { label: 'How It Works', to: '/how-it-works' },
  { label: 'Pricing', to: '/services' },
  { label: 'FAQ', to: '/faq' }
];

const EXPERTS_FALLBACK = [
  { label: 'Join as an Expert', to: '/provider/onboard' },
  { label: 'Expert Guidelines', to: '/expert-policy' },
  { label: 'Earnings', to: '/provider' },
  { label: 'Support', to: '/contact' }
];

const COMPANY_FALLBACK = [
  { label: 'About Us', to: '/about' },
  { label: 'Contact', to: '/contact' },
  { label: 'Blog', to: '/blog' },
  { label: 'Privacy Policy', to: '/privacy' },
  { label: 'Terms of Service', to: '/terms' }
];

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

  const clientLinks = useMemo(() => sanitizeLinks(footerSettings?.sections?.forClients || footerSettings?.sections?.platform, CLIENTS_FALLBACK), [footerSettings]);
  const expertLinks = useMemo(() => sanitizeLinks(footerSettings?.sections?.forExperts || footerSettings?.sections?.support, EXPERTS_FALLBACK), [footerSettings]);
  const companyLinks = useMemo(() => sanitizeLinks(footerSettings?.sections?.company || footerSettings?.sections?.policies, COMPANY_FALLBACK), [footerSettings]);

  // Clean and sanitize company description: strictly filter out raw timestamps, debug metadata, or ungrounded verification claims
  const cleanCompanyDescription = (rawDesc?: string): string => {
    if (!rawDesc || typeof rawDesc !== 'string') {
      return 'Expertise by the minute.';
    }
    const trimmed = rawDesc.trim();
    // Detect raw epoch timestamps (10-13 digits), "timestamp <digits>", "audit-<digits>", or unsubstantiated "platform verified" debug claims
    const hasRawTimestamp = /\b\d{10,13}\b|timestamp\s*\d+|audit-\d+/i.test(trimmed);
    const hasUnsubstantiatedPlatformClaim = /platform\s+(?:is\s+)?verified/i.test(trimmed);
    if (hasRawTimestamp || hasUnsubstantiatedPlatformClaim) {
      return 'Expertise by the minute.';
    }
    return trimmed;
  };

  const companyDesc = useMemo(
    () => cleanCompanyDescription(footerSettings?.company_description),
    [footerSettings?.company_description]
  );

  const currentYear = new Date().getFullYear();
  const copyrightText = (footerSettings?.copyright_text || '© {year} HireByMinutes. All rights reserved.')
    .replace('{year}', String(currentYear));

  const designerCredit = footerSettings?.designer_credit || 'Designed & Developed by Vishal Chaudhary';
  const renderSocialIcon = (platform: string) => {
    const key = (platform || '').toLowerCase().trim();
    if (key === 'twitter' || key === 'x') {
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    }
    if (key === 'linkedin') {
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
        </svg>
      );
    }
    if (key === 'instagram') {
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
        </svg>
      );
    }
    if (key === 'github') {
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
        </svg>
      );
    }
    return <Globe className="w-4 h-4" />;
  };

  const getSocialAriaLabel = (platform: string) => {
    const key = (platform || '').toLowerCase().trim();
    if (key === 'twitter' || key === 'x') return 'HireByMinutes on X (formerly Twitter)';
    if (key === 'linkedin') return 'HireByMinutes on LinkedIn';
    if (key === 'instagram') return 'HireByMinutes on Instagram';
    if (key === 'github') return 'HireByMinutes on GitHub';
    return `HireByMinutes on ${platform}`;
  };

  const socialLinks = useMemo(() => {
    if (!Array.isArray(footerSettings?.social_links)) return [];
    return footerSettings.social_links.filter((s) => {
      if (s.is_visible === false) return false;
      const url = (s.url || '').trim();
      return url.length > 0 && (url.startsWith('https://') || url.startsWith('http://'));
    });
  }, [footerSettings]);

  return (
    <footer className="mt-auto border-t border-timberwolf/60 bg-white/90 backdrop-blur-sm pt-10 sm:pt-14 pb-8 px-4 sm:px-6 lg:px-8 text-midnight transition-colors">
      <div className="max-w-7xl mx-auto space-y-10">
        
        {/* Main Grid: Brand Column + 3 Link Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12">
          
          {/* Brand Column (spans 2 on desktop) */}
          <div className="lg:col-span-2 space-y-4">
            <BrandLogo size="md" showTagline />
            <p className="text-midnight/70 text-xs sm:text-sm leading-relaxed max-w-sm">
              {companyDesc}
            </p>

            <div className="flex items-center gap-2.5 text-xs text-midnight/65 pt-1">
              <span className="inline-flex items-center gap-1.5 bg-aliceblue px-2.5 py-1 rounded-md border border-timberwolf/40 font-medium">
                <Lock className="w-3.5 h-3.5 text-moonstone" />
                <span>Payment Protected</span>
              </span>
            </div>

            {/* Social Links */}
            {socialLinks.length > 0 && (
              <div className="flex items-center gap-2 pt-2">
                {socialLinks.map((s, idx) => (
                  <a
                    key={idx}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={getSocialAriaLabel(s.platform)}
                    title={getSocialAriaLabel(s.platform)}
                    className="w-8 h-8 rounded-lg bg-aliceblue border border-timberwolf/60 flex items-center justify-center text-midnight/70 hover:text-white hover:bg-midnight hover:border-midnight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moonstone transition-all duration-150 shadow-xs"
                  >
                    {renderSocialIcon(s.platform)}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Col: For Clients */}
          <div className="space-y-3.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-midnight">For Clients</h4>
            <ul className="space-y-2.5 text-xs sm:text-sm text-midnight/75 font-medium">
              {clientLinks.map((item) => (
                <li key={item.to + item.label}>
                  <Link to={item.to} className="hover:text-moonstone transition-colors block">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col: For Experts */}
          <div className="space-y-3.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-midnight">For Experts</h4>
            <ul className="space-y-2.5 text-xs sm:text-sm text-midnight/75 font-medium">
              {expertLinks.map((item) => (
                <li key={item.to + item.label}>
                  <Link to={item.to} className="hover:text-moonstone transition-colors block">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col: Company */}
          <div className="space-y-3.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-midnight">Company</h4>
            <ul className="space-y-2.5 text-xs sm:text-sm text-midnight/75 font-medium">
              {companyLinks.map((item) => (
                <li key={item.to + item.label}>
                  <Link to={item.to} className="hover:text-moonstone transition-colors block">
                    {item.label}
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
