import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import {
  Globe,
  Search,
  Share2,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Image as ImageIcon
} from 'lucide-react';

export interface SeoSettings {
  site_title: string;
  meta_description: string;
  canonical_url: string;
  og_title: string;
  og_description: string;
  og_image: string;
  twitter_card: 'summary' | 'summary_large_image';
  twitter_site: string;
}

const DEFAULT_SEO: SeoSettings = {
  site_title: 'HireByMinute — Instant 1-on-1 Consultations by the Minute',
  meta_description: 'Connect with verified experts instantly for 1-on-1 audio/video consultations. Pay only for the exact minutes you use with zero upfront retainers.',
  canonical_url: 'https://hirebyminute.com',
  og_title: 'HireByMinute — Instant 1-on-1 Consultations by the Minute',
  og_description: 'Pay strictly for the minutes you consult. Real-time audio/video consultations with verified experts.',
  og_image: 'https://hirebyminute.com/og-image.png',
  twitter_card: 'summary_large_image',
  twitter_site: '@hirebyminute'
};

export const AdminSeoControl: React.FC = () => {
  const [data, setData] = useState<SeoSettings>(DEFAULT_SEO);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await api.getSeoSettings();
      if (res && res.seo) {
        setData({
          ...DEFAULT_SEO,
          ...res.seo
        });
      }
    } catch (err: any) {
      console.warn('Failed to load SEO settings, using defaults:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setStatusMessage(null);

    try {
      const res = await api.updateSeoSettings(data);
      if (res.success) {
        setStatusMessage({ type: 'success', text: 'SEO and social sharing meta tags saved and updated across search indexes.' });
        if (res.seo) {
          setData({
            ...DEFAULT_SEO,
            ...res.seo
          });
        }
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to save SEO settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (window.confirm('Reset SEO settings to recommended defaults? You must click "Save Changes" to apply.')) {
      setData(DEFAULT_SEO);
      setStatusMessage({ type: 'success', text: 'Default SEO values restored. Click "Save Changes" to publish.' });
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-timberwolf/60 p-8 text-center space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-moonstone border-t-transparent animate-spin mx-auto" />
        <p className="text-xs text-midnight/60 font-medium">Loading SEO configuration...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-timberwolf/60 shadow-subtle">
        <div>
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-moonstone" />
            <h2 className="text-lg font-bold text-midnight">SEO & Social Meta Tags Control</h2>
          </div>
          <p className="text-xs text-midnight/65 mt-0.5">
            Configure search engine meta tags, OpenGraph sharing cards, canonical domain, and Twitter cards.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={handleReset}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-timberwolf/70 text-xs font-semibold text-midnight/70 hover:text-midnight hover:bg-aliceblue transition-all cursor-pointer flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
          <a
            href="/sitemap.xml"
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-timberwolf/70 text-xs font-semibold text-midnight/70 hover:text-midnight hover:bg-aliceblue transition-all cursor-pointer flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Sitemap</span>
          </a>
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover transition-all cursor-pointer flex items-center gap-2 shadow-subtle disabled:opacity-50"
          >
            <Save className={`w-3.5 h-3.5 ${saving ? 'animate-spin' : ''}`} />
            <span>{saving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {/* Status Alert */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2.5 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : 'bg-rose-50 border-rose-300 text-rose-800'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Grid: Form on Left, Live SERP & Social Previews on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Settings Form (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-timberwolf/60 p-5 sm:p-6 shadow-subtle space-y-4">
          <div className="border-b border-timberwolf/30 pb-3">
            <h3 className="text-sm font-bold text-midnight">Metadata Configuration</h3>
            <p className="text-xs text-midnight/60">Configure authoritative meta title and description for search engines.</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-midnight">Primary Site Title</label>
              <span className={`text-[11px] font-mono ${data.site_title.length > 60 ? 'text-amber-600 font-bold' : 'text-midnight/50'}`}>
                {data.site_title.length}/60 chars
              </span>
            </div>
            <input
              type="text"
              value={data.site_title}
              onChange={(e) => setData({ ...data, site_title: e.target.value })}
              className="w-full min-h-[40px] px-3.5 py-2 text-xs rounded-xl border border-timberwolf/80 bg-white font-medium"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-midnight">Meta Description</label>
              <span className={`text-[11px] font-mono ${data.meta_description.length > 160 ? 'text-amber-600 font-bold' : 'text-midnight/50'}`}>
                {data.meta_description.length}/160 chars
              </span>
            </div>
            <textarea
              rows={3}
              value={data.meta_description}
              onChange={(e) => setData({ ...data, meta_description: e.target.value })}
              className="w-full p-3 text-xs rounded-xl border border-timberwolf/80 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-midnight mb-1">Canonical Base URL</label>
            <input
              type="text"
              value={data.canonical_url}
              onChange={(e) => setData({ ...data, canonical_url: e.target.value })}
              className="w-full min-h-[40px] px-3.5 py-2 text-xs font-mono rounded-xl border border-timberwolf/80 bg-white"
            />
          </div>

          <div className="border-t border-timberwolf/30 pt-3">
            <h4 className="text-xs font-bold text-midnight uppercase tracking-wider mb-2">
              Social Sharing (OpenGraph & Twitter Card)
            </h4>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-midnight/70 mb-1">OG Title</label>
                <input
                  type="text"
                  value={data.og_title}
                  onChange={(e) => setData({ ...data, og_title: e.target.value })}
                  className="w-full min-h-[38px] px-3 py-1.5 text-xs rounded-xl border border-timberwolf/80 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-midnight/70 mb-1">OG Description</label>
                <textarea
                  rows={2}
                  value={data.og_description}
                  onChange={(e) => setData({ ...data, og_description: e.target.value })}
                  className="w-full p-2.5 text-xs rounded-xl border border-timberwolf/80 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-midnight/70 mb-1">OG Image URL (1200×630)</label>
                <input
                  type="text"
                  value={data.og_image}
                  onChange={(e) => setData({ ...data, og_image: e.target.value })}
                  className="w-full min-h-[38px] px-3 py-1.5 text-xs font-mono rounded-xl border border-timberwolf/80 bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-medium text-midnight/70 mb-1">Twitter Card Type</label>
                  <select
                    value={data.twitter_card}
                    onChange={(e) => setData({ ...data, twitter_card: e.target.value as any })}
                    className="w-full min-h-[38px] px-3 py-1.5 text-xs rounded-xl border border-timberwolf/80 bg-white"
                  >
                    <option value="summary_large_image">summary_large_image</option>
                    <option value="summary">summary</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-midnight/70 mb-1">Twitter Handle / Site</label>
                  <input
                    type="text"
                    value={data.twitter_site}
                    onChange={(e) => setData({ ...data, twitter_site: e.target.value })}
                    className="w-full min-h-[38px] px-3 py-1.5 text-xs rounded-xl border border-timberwolf/80 bg-white"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Previews (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          
          {/* 1. Google SERP Snippet Preview */}
          <div className="bg-white rounded-2xl border border-timberwolf/60 p-5 shadow-subtle space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-timberwolf/30">
              <Search className="w-4 h-4 text-moonstone" />
              <h3 className="text-xs font-bold text-midnight uppercase tracking-wider">Google Search Result Preview</h3>
            </div>

            <div className="p-3.5 rounded-xl bg-aliceblue/40 border border-timberwolf/40 space-y-1 font-sans">
              <div className="flex items-center gap-2 text-xs text-midnight/70">
                <div className="w-4 h-4 rounded-full bg-moonstone/20 flex items-center justify-center text-[9px] font-bold text-moonstone">
                  H
                </div>
                <div className="truncate text-[11px] text-zinc-600">
                  {data.canonical_url.replace(/^https?:\/\//, '')}
                </div>
              </div>
              <div className="text-[#1a0dab] hover:underline text-sm font-medium leading-snug line-clamp-1 cursor-pointer">
                {data.site_title || 'HireByMinute'}
              </div>
              <div className="text-[12px] text-zinc-600 leading-relaxed line-clamp-2">
                {data.meta_description || 'No description provided.'}
              </div>
            </div>
          </div>

          {/* 2. Social Media Share Card Preview */}
          <div className="bg-white rounded-2xl border border-timberwolf/60 p-5 shadow-subtle space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-timberwolf/30">
              <Share2 className="w-4 h-4 text-moonstone" />
              <h3 className="text-xs font-bold text-midnight uppercase tracking-wider">Social Share Card Preview</h3>
            </div>

            <div className="rounded-xl border border-timberwolf/60 overflow-hidden bg-white shadow-xs">
              {data.og_image ? (
                <div className="aspect-[1200/630] bg-zinc-100 relative overflow-hidden flex items-center justify-center">
                  <img
                    src={data.og_image}
                    alt="Social Preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as any).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 400 200"><rect fill="%23f4f4f5" width="400" height="200"/><text fill="%2371717a" font-size="12" x="50%" y="50%" text-anchor="middle">OG Image Preview</text></svg>';
                    }}
                  />
                </div>
              ) : (
                <div className="aspect-[1200/630] bg-zinc-100 flex items-center justify-center text-zinc-400 text-xs">
                  No image provided
                </div>
              )}
              <div className="p-3 bg-aliceblue/30 space-y-1">
                <div className="text-[10px] text-midnight/50 uppercase font-mono truncate">
                  {data.canonical_url.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}
                </div>
                <div className="text-xs font-bold text-midnight line-clamp-1">
                  {data.og_title || data.site_title}
                </div>
                <div className="text-[11px] text-midnight/65 line-clamp-2 leading-relaxed">
                  {data.og_description || data.meta_description}
                </div>
              </div>
            </div>
          </div>

          {/* Indexing Status Box */}
          <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-300 text-emerald-900 space-y-1 text-xs">
            <div className="flex items-center gap-1.5 font-bold">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Public Indexing Active</span>
            </div>
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              Googlebot and other public crawlers have full access to public services, categories, opportunities, and CMS pages. Admin and private user dashboards remain strictly protected with <code className="font-mono bg-white/70 px-1 py-0.5 rounded text-[10px]">X-Robots-Tag: noindex</code>.
            </p>
          </div>

        </div>

      </div>
    </div>
  );
};
