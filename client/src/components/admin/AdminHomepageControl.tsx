import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import {
  Sparkles,
  Layout,
  Eye,
  EyeOff,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  ExternalLink,
  Search,
  HelpCircle,
  Layers,
  Award,
  ArrowRight,
  Sliders,
  Compass
} from 'lucide-react';

export interface HomepageSettings {
  hero_headline: string;
  hero_subheadline: string;
  hero_badge_text: string;
  primary_cta_label: string;
  primary_cta_url: string;
  secondary_cta_label: string;
  secondary_cta_url: string;
  search_placeholder: string;
  popular_tags: string[];
  intent_client_title: string;
  intent_client_desc: string;
  intent_client_button: string;
  intent_provider_title: string;
  intent_provider_desc: string;
  intent_provider_button: string;
  how_it_works_title: string;
  how_it_works_subtitle: string;
  how_it_works_steps: Array<{ step: string; title: string; description: string }>;
  cta_title: string;
  cta_subtitle: string;
  cta_button_label: string;
  cta_button_url: string;
  visibility: {
    hero: boolean;
    intent_cards: boolean;
    search: boolean;
    popular_categories: boolean;
    featured_experts: boolean;
    how_it_works: boolean;
    cta: boolean;
  };
}

const DEFAULT_HOMEPAGE: HomepageSettings = {
  hero_headline: 'What brings you here?',
  hero_subheadline: 'Hire expertise by the minute, or turn your expertise into a service people can book.',
  hero_badge_text: '⚡ Instant 1-on-1 Consultations • Pay Per Exact Minute',
  primary_cta_label: 'Find an Expert',
  primary_cta_url: '/services',
  secondary_cta_label: 'Become a Service Provider',
  secondary_cta_url: '/provider/onboard',
  search_placeholder: 'Search experts, skills, or services...',
  popular_tags: ['Python developer', 'Figma teardown', 'RAG architect', 'B2B growth audit', 'Tax advisor', 'AI Prompt Engineer', 'Fractional CTO'],
  intent_client_title: 'Find an expert',
  intent_client_desc: 'Pay only for the exact minutes you spend with a vetted professional. No retainers or minimum commitments.',
  intent_client_button: 'Browse Experts',
  intent_provider_title: 'List your service',
  intent_provider_desc: 'Set your own per-minute rate, choose your hours, and get booked by clients who value your time.',
  intent_provider_button: 'Become a Service Provider',
  how_it_works_title: 'How HireByMinute works',
  how_it_works_subtitle: 'From finding the right person to finishing your timed consultation in four easy steps.',
  how_it_works_steps: [
    { step: '01', title: 'Find an Expert', description: 'Find someone who knows exactly what you need without wading through bloated project agencies.' },
    { step: '02', title: 'Choose Your Time', description: 'Choose exactly how many minutes or hours you need: 15m, 30m, 45m, or custom duration.' },
    { step: '03', title: 'Live Timed Session', description: 'Chat, call, video, or share files while the server-authoritative countdown clock is active.' },
    { step: '04', title: 'Session Completes', description: 'When time ends, communication closes naturally. No scope creep, surprise invoices, or billing disputes.' }
  ],
  cta_title: 'Ready to experience precision consulting?',
  cta_subtitle: 'Connect with verified specialists right now and pay strictly for the minutes you use.',
  cta_button_label: 'Get Started Today',
  cta_button_url: '/services',
  visibility: {
    hero: true,
    intent_cards: true,
    search: true,
    popular_categories: true,
    featured_experts: true,
    how_it_works: true,
    cta: true
  }
};

export const AdminHomepageControl: React.FC = () => {
  const [data, setData] = useState<HomepageSettings>(DEFAULT_HOMEPAGE);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [activeSubTab, setActiveSubTab] = useState<'hero' | 'intent' | 'search' | 'how_it_works' | 'cta' | 'visibility'>('hero');
  const [newTag, setNewTag] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await api.getHomepageSettings();
      if (res && res.homepage) {
        setData({
          ...DEFAULT_HOMEPAGE,
          ...res.homepage,
          visibility: {
            ...DEFAULT_HOMEPAGE.visibility,
            ...(res.homepage.visibility || {})
          }
        });
      }
    } catch (err: any) {
      console.warn('Failed to load homepage settings, using defaults:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setStatusMessage(null);

    try {
      const res = await api.updateHomepageSettings(data);
      if (res.success) {
        setStatusMessage({ type: 'success', text: 'Homepage settings updated and live across the platform.' });
        if (res.homepage) {
          setData({
            ...DEFAULT_HOMEPAGE,
            ...res.homepage,
            visibility: {
              ...DEFAULT_HOMEPAGE.visibility,
              ...(res.homepage.visibility || {})
            }
          });
        }
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to save homepage settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefaults = () => {
    if (window.confirm('Reset all homepage settings to factory defaults? You must click "Save Changes" to apply.')) {
      setData(DEFAULT_HOMEPAGE);
      setStatusMessage({ type: 'success', text: 'Defaults restored. Click "Save Changes" to publish.' });
    }
  };

  const handleAddTag = () => {
    if (!newTag.trim()) return;
    const tag = newTag.trim();
    if (!data.popular_tags.includes(tag)) {
      setData(prev => ({ ...prev, popular_tags: [...prev.popular_tags, tag] }));
      setNewTag('');
    }
  };

  const handleRemoveTag = (idxToRemove: number) => {
    setData(prev => ({
      ...prev,
      popular_tags: prev.popular_tags.filter((_, idx) => idx !== idxToRemove)
    }));
  };

  const updateStep = (index: number, field: 'step' | 'title' | 'description', value: string) => {
    const updated = [...data.how_it_works_steps];
    updated[index] = { ...updated[index], [field]: value };
    setData(prev => ({ ...prev, how_it_works_steps: updated }));
  };

  const toggleVisibility = (key: keyof HomepageSettings['visibility']) => {
    setData(prev => ({
      ...prev,
      visibility: {
        ...prev.visibility,
        [key]: !prev.visibility[key]
      }
    }));
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-timberwolf/60 p-8 text-center space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-moonstone border-t-transparent animate-spin mx-auto" />
        <p className="text-xs text-midnight/60 font-medium">Loading Homepage configuration...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-timberwolf/60 shadow-subtle">
        <div>
          <div className="flex items-center gap-2">
            <Layout className="w-5 h-5 text-moonstone" />
            <h2 className="text-lg font-bold text-midnight">Homepage Section Editor</h2>
          </div>
          <p className="text-xs text-midnight/65 mt-0.5">
            Customize hero headline, subtext, intent cards, search tags, how it works steps, and section visibility in real-time.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={handleResetToDefaults}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-timberwolf/70 text-xs font-semibold text-midnight/70 hover:text-midnight hover:bg-aliceblue transition-all cursor-pointer flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-timberwolf/70 text-xs font-semibold text-midnight/70 hover:text-midnight hover:bg-aliceblue transition-all cursor-pointer flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>View Live</span>
          </a>
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover transition-all cursor-pointer flex items-center gap-2 shadow-subtle disabled:opacity-50"
          >
            <Save className={`w-3.5 h-3.5 ${saving ? 'animate-spin' : ''}`} />
            <span>{saving ? 'Publishing...' : 'Save Changes'}</span>
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

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar bg-white p-1.5 rounded-2xl border border-timberwolf/60">
        {[
          { id: 'hero', label: 'Hero Section', icon: Layout },
          { id: 'intent', label: 'Intent Cards', icon: Layers },
          { id: 'search', label: 'Search & Tags', icon: Search },
          { id: 'how_it_works', label: 'How It Works', icon: HelpCircle },
          { id: 'cta', label: 'Bottom CTA', icon: Sparkles },
          { id: 'visibility', label: 'Section Visibility', icon: Sliders }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'bg-midnight text-aliceblue shadow-subtle'
                  : 'text-midnight/70 hover:text-midnight hover:bg-aliceblue'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-moonstone' : 'text-midnight/50'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div className="bg-white rounded-2xl border border-timberwolf/60 p-5 sm:p-6 shadow-subtle">
        
        {/* 1. HERO SECTION */}
        {activeSubTab === 'hero' && (
          <div className="space-y-4 max-w-3xl">
            <div className="border-b border-timberwolf/30 pb-3">
              <h3 className="text-sm font-bold text-midnight">Hero Header & Call to Action</h3>
              <p className="text-xs text-midnight/60">The primary above-the-fold value proposition on the homepage.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">Badge Text</label>
              <input
                type="text"
                value={data.hero_badge_text}
                onChange={(e) => setData({ ...data, hero_badge_text: e.target.value })}
                placeholder="e.g. ⚡ Instant 1-on-1 Consultations • Pay Per Exact Minute"
                className="w-full min-h-[42px] px-3.5 py-2 text-xs rounded-xl border border-timberwolf/80 bg-white text-midnight focus:outline-none focus:border-moonstone"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">Main Headline</label>
              <input
                type="text"
                value={data.hero_headline}
                onChange={(e) => setData({ ...data, hero_headline: e.target.value })}
                placeholder="e.g. What brings you here?"
                className="w-full min-h-[42px] px-3.5 py-2 text-xs rounded-xl border border-timberwolf/80 bg-white text-midnight font-bold focus:outline-none focus:border-moonstone"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">Subheadline / Supporting Copy</label>
              <textarea
                rows={2}
                value={data.hero_subheadline}
                onChange={(e) => setData({ ...data, hero_subheadline: e.target.value })}
                placeholder="e.g. Hire expertise by the minute, or turn your expertise into a service people can book."
                className="w-full p-3 text-xs rounded-xl border border-timberwolf/80 bg-white text-midnight focus:outline-none focus:border-moonstone"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-3.5 rounded-xl bg-aliceblue/70 border border-timberwolf/40 space-y-2.5">
                <span className="text-[11px] font-bold text-midnight uppercase tracking-wider block">Primary CTA</span>
                <div>
                  <label className="block text-[11px] font-medium text-midnight/70 mb-0.5">Button Label</label>
                  <input
                    type="text"
                    value={data.primary_cta_label}
                    onChange={(e) => setData({ ...data, primary_cta_label: e.target.value })}
                    className="w-full min-h-[38px] px-3 py-1.5 text-xs rounded-lg border border-timberwolf/80 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-midnight/70 mb-0.5">Destination URL</label>
                  <input
                    type="text"
                    value={data.primary_cta_url}
                    onChange={(e) => setData({ ...data, primary_cta_url: e.target.value })}
                    className="w-full min-h-[38px] px-3 py-1.5 text-xs rounded-lg border border-timberwolf/80 bg-white"
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-aliceblue/70 border border-timberwolf/40 space-y-2.5">
                <span className="text-[11px] font-bold text-midnight uppercase tracking-wider block">Secondary CTA</span>
                <div>
                  <label className="block text-[11px] font-medium text-midnight/70 mb-0.5">Button Label</label>
                  <input
                    type="text"
                    value={data.secondary_cta_label}
                    onChange={(e) => setData({ ...data, secondary_cta_label: e.target.value })}
                    className="w-full min-h-[38px] px-3 py-1.5 text-xs rounded-lg border border-timberwolf/80 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-midnight/70 mb-0.5">Destination URL</label>
                  <input
                    type="text"
                    value={data.secondary_cta_url}
                    onChange={(e) => setData({ ...data, secondary_cta_url: e.target.value })}
                    className="w-full min-h-[38px] px-3 py-1.5 text-xs rounded-lg border border-timberwolf/80 bg-white"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. INTENT CARDS */}
        {activeSubTab === 'intent' && (
          <div className="space-y-5 max-w-3xl">
            <div className="border-b border-timberwolf/30 pb-3">
              <h3 className="text-sm font-bold text-midnight">Dual Intent Choice Cards</h3>
              <p className="text-xs text-midnight/60">Configure the client and provider pathway cards shown on the hero section.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Client Card */}
              <div className="p-4 rounded-xl border border-timberwolf/70 bg-aliceblue/40 space-y-3">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-midnight text-white">
                  Client Intent Card
                </span>
                <div>
                  <label className="block text-xs font-semibold text-midnight mb-1">Card Title</label>
                  <input
                    type="text"
                    value={data.intent_client_title}
                    onChange={(e) => setData({ ...data, intent_client_title: e.target.value })}
                    className="w-full min-h-[38px] px-3 py-1.5 text-xs rounded-lg border border-timberwolf/80 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-midnight mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={data.intent_client_desc}
                    onChange={(e) => setData({ ...data, intent_client_desc: e.target.value })}
                    className="w-full p-2.5 text-xs rounded-lg border border-timberwolf/80 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-midnight mb-1">Button Text</label>
                  <input
                    type="text"
                    value={data.intent_client_button}
                    onChange={(e) => setData({ ...data, intent_client_button: e.target.value })}
                    className="w-full min-h-[38px] px-3 py-1.5 text-xs rounded-lg border border-timberwolf/80 bg-white"
                  />
                </div>
              </div>

              {/* Provider Card */}
              <div className="p-4 rounded-xl border border-timberwolf/70 bg-aliceblue/40 space-y-3">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-moonstone text-white">
                  Provider Intent Card
                </span>
                <div>
                  <label className="block text-xs font-semibold text-midnight mb-1">Card Title</label>
                  <input
                    type="text"
                    value={data.intent_provider_title}
                    onChange={(e) => setData({ ...data, intent_provider_title: e.target.value })}
                    className="w-full min-h-[38px] px-3 py-1.5 text-xs rounded-lg border border-timberwolf/80 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-midnight mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={data.intent_provider_desc}
                    onChange={(e) => setData({ ...data, intent_provider_desc: e.target.value })}
                    className="w-full p-2.5 text-xs rounded-lg border border-timberwolf/80 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-midnight mb-1">Button Text</label>
                  <input
                    type="text"
                    value={data.intent_provider_button}
                    onChange={(e) => setData({ ...data, intent_provider_button: e.target.value })}
                    className="w-full min-h-[38px] px-3 py-1.5 text-xs rounded-lg border border-timberwolf/80 bg-white"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. SEARCH & POPULAR TAGS */}
        {activeSubTab === 'search' && (
          <div className="space-y-4 max-w-3xl">
            <div className="border-b border-timberwolf/30 pb-3">
              <h3 className="text-sm font-bold text-midnight">Search Bar & Suggested Keywords</h3>
              <p className="text-xs text-midnight/60">Configure the search input placeholder and quick-search chips.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">Search Bar Placeholder</label>
              <input
                type="text"
                value={data.search_placeholder}
                onChange={(e) => setData({ ...data, search_placeholder: e.target.value })}
                className="w-full min-h-[42px] px-3.5 py-2 text-xs rounded-xl border border-timberwolf/80 bg-white text-midnight focus:outline-none focus:border-moonstone"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-midnight mb-1.5">Popular Search Tags</label>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {data.popular_tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-aliceblue text-midnight border border-timberwolf/60"
                  >
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(idx)}
                      className="text-midnight/40 hover:text-rose-600 transition-colors cursor-pointer"
                      title="Remove tag"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2 max-w-md">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  placeholder="Type new keyword and press Add"
                  className="flex-1 min-h-[40px] px-3 py-1.5 text-xs rounded-xl border border-timberwolf/80 bg-white"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover transition-all cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4. HOW IT WORKS */}
        {activeSubTab === 'how_it_works' && (
          <div className="space-y-4 max-w-3xl">
            <div className="border-b border-timberwolf/30 pb-3">
              <h3 className="text-sm font-bold text-midnight">How It Works Steps</h3>
              <p className="text-xs text-midnight/60">Configure the numbered process cards explaining the per-minute workflow.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-midnight mb-1">Section Title</label>
                <input
                  type="text"
                  value={data.how_it_works_title}
                  onChange={(e) => setData({ ...data, how_it_works_title: e.target.value })}
                  className="w-full min-h-[40px] px-3 py-1.5 text-xs rounded-xl border border-timberwolf/80 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-midnight mb-1">Section Subtitle</label>
                <input
                  type="text"
                  value={data.how_it_works_subtitle}
                  onChange={(e) => setData({ ...data, how_it_works_subtitle: e.target.value })}
                  className="w-full min-h-[40px] px-3 py-1.5 text-xs rounded-xl border border-timberwolf/80 bg-white"
                />
              </div>
            </div>

            <div className="space-y-3 pt-2">
              {data.how_it_works_steps.map((st, idx) => (
                <div key={idx} className="p-3.5 rounded-xl border border-timberwolf/60 bg-aliceblue/40 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={st.step}
                      onChange={(e) => updateStep(idx, 'step', e.target.value)}
                      className="w-16 min-h-[36px] px-2.5 py-1 text-xs font-mono font-bold text-center rounded-lg border border-timberwolf/80 bg-white"
                    />
                    <input
                      type="text"
                      value={st.title}
                      onChange={(e) => updateStep(idx, 'title', e.target.value)}
                      placeholder="Step Title"
                      className="flex-1 min-h-[36px] px-3 py-1 text-xs font-semibold rounded-lg border border-timberwolf/80 bg-white"
                    />
                  </div>
                  <textarea
                    rows={2}
                    value={st.description}
                    onChange={(e) => updateStep(idx, 'description', e.target.value)}
                    placeholder="Step description..."
                    className="w-full p-2.5 text-xs rounded-lg border border-timberwolf/80 bg-white"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. BOTTOM CTA */}
        {activeSubTab === 'cta' && (
          <div className="space-y-4 max-w-3xl">
            <div className="border-b border-timberwolf/30 pb-3">
              <h3 className="text-sm font-bold text-midnight">Bottom Call to Action Banner</h3>
              <p className="text-xs text-midnight/60">Configure the prominent conversion banner at the base of the homepage.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">Headline</label>
              <input
                type="text"
                value={data.cta_title}
                onChange={(e) => setData({ ...data, cta_title: e.target.value })}
                className="w-full min-h-[42px] px-3.5 py-2 text-xs rounded-xl border border-timberwolf/80 bg-white font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">Supporting Copy</label>
              <textarea
                rows={2}
                value={data.cta_subtitle}
                onChange={(e) => setData({ ...data, cta_subtitle: e.target.value })}
                className="w-full p-3 text-xs rounded-xl border border-timberwolf/80 bg-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-midnight mb-1">Button Label</label>
                <input
                  type="text"
                  value={data.cta_button_label}
                  onChange={(e) => setData({ ...data, cta_button_label: e.target.value })}
                  className="w-full min-h-[40px] px-3 py-1.5 text-xs rounded-xl border border-timberwolf/80 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-midnight mb-1">Button Destination URL</label>
                <input
                  type="text"
                  value={data.cta_button_url}
                  onChange={(e) => setData({ ...data, cta_button_url: e.target.value })}
                  className="w-full min-h-[40px] px-3 py-1.5 text-xs rounded-xl border border-timberwolf/80 bg-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* 6. SECTION VISIBILITY TOGGLES */}
        {activeSubTab === 'visibility' && (
          <div className="space-y-4 max-w-3xl">
            <div className="border-b border-timberwolf/30 pb-3">
              <h3 className="text-sm font-bold text-midnight">Section Visibility Controls</h3>
              <p className="text-xs text-midnight/60">Toggle individual sections on or off without deleting content.</p>
            </div>

            <div className="divide-y divide-timberwolf/30">
              {[
                { key: 'hero', label: 'Hero Section', desc: 'Main headline, subtext, and badge' },
                { key: 'intent_cards', label: 'Dual Intent Cards', desc: 'Find an expert vs List your service cards' },
                { key: 'search', label: 'Search Bar & Chips', desc: 'Interactive search form and popular tags' },
                { key: 'popular_categories', label: 'Popular Categories', desc: 'Category grid and link to /services' },
                { key: 'featured_experts', label: 'Featured Experts', desc: 'Verified expert cards or onboarding teaser' },
                { key: 'how_it_works', label: 'How It Works Steps', desc: '4-step procedural breakdown' },
                { key: 'cta', label: 'Bottom Call-to-Action', desc: 'Pre-footer conversion banner' }
              ].map((sec) => {
                const isVisible = data.visibility[sec.key as keyof HomepageSettings['visibility']];
                return (
                  <div key={sec.key} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-xs font-bold text-midnight">{sec.label}</div>
                      <div className="text-[11px] text-midnight/60">{sec.desc}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleVisibility(sec.key as any)}
                      className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                        isVisible
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                          : 'bg-zinc-100 text-zinc-600 border border-zinc-300'
                      }`}
                    >
                      {isVisible ? <Eye className="w-3.5 h-3.5 text-emerald-600" /> : <EyeOff className="w-3.5 h-3.5 text-zinc-500" />}
                      <span>{isVisible ? 'Visible' : 'Hidden'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
