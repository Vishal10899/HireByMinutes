import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

export interface NavItem {
  id: string;
  label: string;
  url: string;
  order: number;
  is_visible: boolean;
  is_external?: boolean;
}

export interface FooterLink {
  id: string;
  label: string;
  url: string;
  order: number;
  is_visible: boolean;
  is_new?: boolean;
  icon?: string;
}

export interface FooterSocialLink {
  platform: string;
  url: string;
  is_visible: boolean;
}

export interface FooterSettings {
  company_description: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  copyright_text: string;
  designer_credit: string;
  social_links: FooterSocialLink[];
  sections: {
    platform: FooterLink[];
    policies: FooterLink[];
    support: FooterLink[];
    [key: string]: FooterLink[];
  };
}

export interface ContactSettings {
  support_email: string;
  business_email: string;
  phone: string;
  support_hours: string;
  address: string;
  whatsapp_url?: string;
  contact_form_enabled: boolean;
}

interface SiteSettingsContextType {
  siteName: string;
  logoUrl: string;
  navItems: NavItem[];
  ctaLabel: string;
  ctaUrl: string;
  footerSettings: FooterSettings | null;
  contactSettings: ContactSettings | null;
  loading: boolean;
  refreshSettings: () => Promise<void>;
  updateLocalSettings: (data: {
    siteName?: string;
    logoUrl?: string;
    navItems?: NavItem[];
    ctaLabel?: string;
    ctaUrl?: string;
    footerSettings?: FooterSettings;
    contactSettings?: ContactSettings;
  }) => void;
}

const DEFAULT_NAV_ITEMS: NavItem[] = [
  { id: 'services', label: 'Services', url: '/services', order: 1, is_visible: true, is_external: false },
  { id: 'projects', label: 'Projects', url: '/projects', order: 2, is_visible: true, is_external: false },
  { id: 'opportunities', label: 'Opportunities', url: '/opportunities', order: 3, is_visible: true, is_external: false },
  { id: 'jobs', label: 'Jobs', url: '/jobs', order: 4, is_visible: true, is_external: false },
  { id: 'how-it-works', label: 'How It Works', url: '/how-it-works', order: 5, is_visible: true, is_external: false },
  { id: 'blog', label: 'Blog', url: '/blog', order: 6, is_visible: true, is_external: false }
];

const DEFAULT_FOOTER_SETTINGS: FooterSettings = {
  company_description: 'Expertise by the minute.',
  contact_email: 'support@hirebyminutes.com',
  contact_phone: '+1 (800) 555-0199',
  address: 'San Francisco, CA, United States',
  copyright_text: '© {year} HireByMinutes. All rights reserved.',
  designer_credit: 'Designed & Developed by Vishal Chaudhary',
  social_links: [
    { platform: 'twitter', url: 'https://twitter.com/hirebyminutes', is_visible: true },
    { platform: 'linkedin', url: 'https://linkedin.com/company/hirebyminutes', is_visible: true },
    { platform: 'github', url: 'https://github.com/hirebyminutes', is_visible: true }
  ],
  sections: {
    platform: [
      { id: 'find-experts', label: 'Find Experts', url: '/services', order: 1, is_visible: true },
      { id: 'how-it-works', label: 'How It Works', url: '/how-it-works', order: 2, is_visible: true },
      { id: 'pricing', label: 'Pricing', url: '/services', order: 3, is_visible: true },
      { id: 'faq', label: 'FAQ', url: '/faq', order: 4, is_visible: true }
    ],
    policies: [
      { id: 'about', label: 'About Us', url: '/about', order: 1, is_visible: true },
      { id: 'contact', label: 'Contact', url: '/contact', order: 2, is_visible: true },
      { id: 'blog', label: 'Blog', url: '/blog', order: 3, is_visible: true },
      { id: 'privacy', label: 'Privacy Policy', url: '/privacy', order: 4, is_visible: true },
      { id: 'terms', label: 'Terms of Service', url: '/terms', order: 5, is_visible: true }
    ],
    support: [
      { id: 'join-expert', label: 'Join as an Expert', url: '/provider/onboard', order: 1, is_visible: true },
      { id: 'expert-guidelines', label: 'Expert Guidelines', url: '/expert-policy', order: 2, is_visible: true },
      { id: 'earnings', label: 'Earnings', url: '/provider', order: 3, is_visible: true },
      { id: 'support', label: 'Support', url: '/contact', order: 4, is_visible: true }
    ]
  }
};

const DEFAULT_CONTACT_SETTINGS: ContactSettings = {
  support_email: 'support@hirebyminutes.com',
  business_email: 'business@hirebyminutes.com',
  phone: '+1 (800) 555-0199',
  support_hours: 'Monday – Friday: 9:00 AM – 6:00 PM EST (24/7 Escalation Desk)',
  address: 'San Francisco, CA, United States',
  whatsapp_url: '',
  contact_form_enabled: true
};

const SiteSettingsContext = createContext<SiteSettingsContextType | undefined>(undefined);

export const SiteSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [siteName, setSiteName] = useState<string>('HireByMinutes');
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [navItems, setNavItems] = useState<NavItem[]>(DEFAULT_NAV_ITEMS);
  const [ctaLabel, setCtaLabel] = useState<string>('Get Started');
  const [ctaUrl, setCtaUrl] = useState<string>('/signup');
  const [footerSettings, setFooterSettings] = useState<FooterSettings>(DEFAULT_FOOTER_SETTINGS);
  const [contactSettings, setContactSettings] = useState<ContactSettings>(DEFAULT_CONTACT_SETTINGS);
  const [loading, setLoading] = useState<boolean>(false);

  const refreshSettings = useCallback(async () => {
    try {
      const [platformData, footerData, contactData] = await Promise.allSettled([
        api.getPublicSettings(),
        api.getPublicFooter(),
        api.getPublicContact()
      ]);

      if (platformData.status === 'fulfilled' && platformData.value) {
        const data = platformData.value;
        if (data.platform_name) setSiteName(data.platform_name);
        if (data.logo_url !== undefined) setLogoUrl(data.logo_url);
        if (Array.isArray(data.header_navigation) && data.header_navigation.length > 0) {
          const sorted = [...data.header_navigation].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
          setNavItems(sorted);
        }
        if (data.header_cta_label) setCtaLabel(data.header_cta_label);
        if (data.header_cta_url) setCtaUrl(data.header_cta_url);
      }

      if (footerData.status === 'fulfilled' && footerData.value?.footer) {
        const footer = { ...footerData.value.footer };
        if (footer.company_description && (
          /\b\d{10,13}\b|timestamp\s*\d+|audit-\d+/i.test(footer.company_description) ||
          /platform\s+(?:is\s+)?verified/i.test(footer.company_description)
        )) {
          footer.company_description = 'Expertise by the minute.';
        }
        setFooterSettings(footer);
      }

      if (contactData.status === 'fulfilled' && contactData.value?.contact) {
        setContactSettings(contactData.value.contact);
      }
    } catch (err) {
      console.warn('[SiteSettings] Failed to fetch public settings, using defaults:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateLocalSettings = useCallback((data: {
    siteName?: string;
    logoUrl?: string;
    navItems?: NavItem[];
    ctaLabel?: string;
    ctaUrl?: string;
    footerSettings?: FooterSettings;
    contactSettings?: ContactSettings;
  }) => {
    if (data.siteName !== undefined) setSiteName(data.siteName);
    if (data.logoUrl !== undefined) setLogoUrl(data.logoUrl);
    if (data.navItems !== undefined) {
      const sorted = [...data.navItems].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
      setNavItems(sorted);
    }
    if (data.ctaLabel !== undefined) setCtaLabel(data.ctaLabel);
    if (data.ctaUrl !== undefined) setCtaUrl(data.ctaUrl);
    if (data.footerSettings !== undefined) setFooterSettings(data.footerSettings);
    if (data.contactSettings !== undefined) setContactSettings(data.contactSettings);
  }, []);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  return (
    <SiteSettingsContext.Provider
      value={{
        siteName,
        logoUrl,
        navItems,
        ctaLabel,
        ctaUrl,
        footerSettings,
        contactSettings,
        loading,
        refreshSettings,
        updateLocalSettings
      }}
    >
      {children}
    </SiteSettingsContext.Provider>
  );
};

export const useSiteSettings = (): SiteSettingsContextType => {
  const context = useContext(SiteSettingsContext);
  if (!context) {
    throw new Error('useSiteSettings must be used within a SiteSettingsProvider');
  }
  return context;
};
