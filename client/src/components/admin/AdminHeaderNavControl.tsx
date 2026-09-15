import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useSiteSettings, NavItem } from '../../context/SiteSettingsContext';
import { BrandLogo } from '../common/BrandLogo';
import {
  Compass,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Check,
  RotateCcw,
  Eye,
  EyeOff,
  ExternalLink,
  Upload,
  Image as ImageIcon,
  Save,
  AlertCircle,
  CheckCircle2,
  X,
  Globe,
  Sliders
} from 'lucide-react';

interface AdminHeaderNavControlProps {
  onRefreshData?: () => Promise<void>;
}

export const AdminHeaderNavControl: React.FC<AdminHeaderNavControlProps> = ({ onRefreshData }) => {
  const { siteName: contextSiteName, logoUrl: contextLogoUrl, navItems: contextNavItems, ctaLabel: contextCtaLabel, ctaUrl: contextCtaUrl, refreshSettings, updateLocalSettings } = useSiteSettings();

  const [siteName, setSiteName] = useState<string>(contextSiteName || 'HireByMinute');
  const [logoUrl, setLogoUrl] = useState<string>(contextLogoUrl || '');
  const [navItems, setNavItems] = useState<NavItem[]>(contextNavItems || []);
  const [ctaLabel, setCtaLabel] = useState<string>(contextCtaLabel || 'Sign In / Join');
  const [ctaUrl, setCtaUrl] = useState<string>(contextCtaUrl || '/auth');
  const [saving, setSaving] = useState<boolean>(false);
  const [uploadingLogo, setUploadingLogo] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  // Add Item Modal State
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newItemLabel, setNewItemLabel] = useState<string>('');
  const [newItemUrl, setNewItemUrl] = useState<string>('');
  const [newItemExternal, setNewItemExternal] = useState<boolean>(false);
  const [newItemVisible, setNewItemVisible] = useState<boolean>(true);

  // Sync state when context updates
  useEffect(() => {
    if (contextSiteName) setSiteName(contextSiteName);
    if (contextLogoUrl !== undefined) setLogoUrl(contextLogoUrl);
    if (contextCtaLabel) setCtaLabel(contextCtaLabel);
    if (contextCtaUrl) setCtaUrl(contextCtaUrl);
    if (Array.isArray(contextNavItems) && contextNavItems.length > 0) {
      setNavItems([...contextNavItems].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)));
    }
  }, [contextSiteName, contextLogoUrl, contextCtaLabel, contextCtaUrl, contextNavItems]);

  // Reorder: Move Item Up
  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const updated = [...navItems];
    const prev = updated[index - 1];
    updated[index - 1] = updated[index];
    updated[index] = prev;
    updated.forEach((item, idx) => {
      item.order = idx + 1;
    });
    setNavItems(updated);
  };

  // Reorder: Move Item Down
  const handleMoveDown = (index: number) => {
    if (index >= navItems.length - 1) return;
    const updated = [...navItems];
    const next = updated[index + 1];
    updated[index + 1] = updated[index];
    updated[index] = next;
    updated.forEach((item, idx) => {
      item.order = idx + 1;
    });
    setNavItems(updated);
  };

  // Update Item Label
  const handleUpdateLabel = (id: string, label: string) => {
    setNavItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, label } : item))
    );
  };

  // Update Item URL
  const handleUpdateUrl = (id: string, url: string) => {
    setNavItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, url } : item))
    );
  };

  // Toggle Visibility
  const handleToggleVisibility = (id: string) => {
    setNavItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, is_visible: item.is_visible === false ? true : false } : item
      )
    );
  };

  // Toggle External Link
  const handleToggleExternal = (id: string) => {
    setNavItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, is_external: !item.is_external } : item
      )
    );
  };

  // Delete Item
  const handleDeleteItem = (id: string) => {
    setNavItems((prev) => {
      const filtered = prev.filter((item) => item.id !== id);
      filtered.forEach((item, idx) => {
        item.order = idx + 1;
      });
      return filtered;
    });
  };

  // Add Item Submission
  const handleAddNewItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemLabel.trim() || !newItemUrl.trim()) {
      setSaveStatus({ success: false, message: 'Please provide both a label and a URL for the new link.' });
      return;
    }

    const newItem: NavItem = {
      id: `nav-${Date.now()}`,
      label: newItemLabel.trim(),
      url: newItemUrl.trim(),
      order: navItems.length + 1,
      is_visible: newItemVisible,
      is_external: newItemExternal
    };

    setNavItems((prev) => [...prev, newItem]);
    setNewItemLabel('');
    setNewItemUrl('');
    setNewItemExternal(false);
    setNewItemVisible(true);
    setShowAddModal(false);
  };

  // Upload Logo File
  const handleLogoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingLogo(true);
      setSaveStatus(null);
      const res = await api.uploadLogo(file);
      if (res.url) {
        setLogoUrl(res.url);
        setSaveStatus({
          success: true,
          message: 'Logo uploaded successfully! Click "Save Header Changes" to commit.'
        });
      }
    } catch (err: any) {
      setSaveStatus({
        success: false,
        message: err.message || 'Failed to upload logo image.'
      });
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  // Reset to Defaults
  const handleResetToDefaults = async () => {
    if (!window.confirm('Reset all navigation items and site identity to system defaults?')) {
      return;
    }

    try {
      setSaving(true);
      setSaveStatus(null);
      const res = await api.resetHeaderNavigation();
      const defaultNav = res.header_navigation || [
        { id: 'services', label: 'Services', url: '/services', order: 1, is_visible: true, is_external: false },
        { id: 'opportunities', label: 'Opportunities', url: '/opportunities', order: 2, is_visible: true, is_external: false },
        { id: 'how-it-works', label: 'How It Works', url: '/#how-it-works', order: 3, is_visible: true, is_external: false }
      ];

      setNavItems(defaultNav);
      setSiteName('HireByMinute');
      setLogoUrl('');
      setCtaLabel('Sign In / Join');
      setCtaUrl('/auth');

      await api.updateAdminSettings({
        platform_name: 'HireByMinute',
        logo_url: '',
        header_navigation: defaultNav,
        header_cta_label: 'Sign In / Join',
        header_cta_url: '/auth'
      });

      updateLocalSettings({
        siteName: 'HireByMinute',
        logoUrl: '',
        navItems: defaultNav,
        ctaLabel: 'Sign In / Join',
        ctaUrl: '/auth'
      });

      await refreshSettings();
      if (onRefreshData) await onRefreshData();

      setSaveStatus({
        success: true,
        message: 'Header navigation and brand identity reset to system defaults successfully!'
      });
    } catch (err: any) {
      setSaveStatus({
        success: false,
        message: err.message || 'Failed to reset navigation to defaults.'
      });
    } finally {
      setSaving(false);
    }
  };

  // Save All Changes
  const handleSaveAll = async () => {
    try {
      setSaving(true);
      setSaveStatus(null);

      const cleanSiteName = siteName.trim();
      if (!cleanSiteName) {
        setSaveStatus({ success: false, message: 'Site name cannot be blank.' });
        return;
      }

      for (const item of navItems) {
        if (!item.label.trim()) {
          setSaveStatus({ success: false, message: `Navigation item #${item.order} must have a label.` });
          return;
        }
        if (!item.url.trim()) {
          setSaveStatus({ success: false, message: `Navigation item "${item.label}" must have a valid URL.` });
          return;
        }
      }

      const orderedItems = [...navItems].map((item, idx) => ({
        ...item,
        order: idx + 1
      }));

      await api.updateAdminSettings({
        platform_name: cleanSiteName,
        logo_url: logoUrl.trim(),
        header_navigation: orderedItems,
        header_cta_label: ctaLabel.trim(),
        header_cta_url: ctaUrl.trim()
      });

      updateLocalSettings({
        siteName: cleanSiteName,
        logoUrl: logoUrl.trim(),
        navItems: orderedItems,
        ctaLabel: ctaLabel.trim(),
        ctaUrl: ctaUrl.trim()
      });

      await refreshSettings();
      if (onRefreshData) await onRefreshData();

      setSaveStatus({
        success: true,
        message: 'Header navigation and site identity saved successfully! Changes are live.'
      });
    } catch (err: any) {
      setSaveStatus({
        success: false,
        message: err.message || 'Failed to save navigation changes.'
      });
    } finally {
      setSaving(false);
    }
  };

  const visibleNavItems = navItems.filter((i) => i.is_visible !== false);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-midnight/5 flex items-center justify-center text-midnight">
              <Compass className="w-5 h-5 text-moonstone" />
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-midnight tracking-tight">
              Header & Navigation Control
            </h1>
          </div>
          <p className="text-xs text-midnight/70 max-w-2xl leading-relaxed">
            Manage your brand logo, site name, navigation labels, and display order. Changes reflect in real-time across both desktop navigation and mobile menus.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleResetToDefaults}
            disabled={saving}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-timberwolf/70 text-xs font-semibold text-midnight hover:bg-aliceblue transition-colors cursor-pointer disabled:opacity-50"
            title="Reset to initial 3 links (Services, Opportunities, How It Works)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset Defaults</span>
          </button>

          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving}
            className="btn-shine flex items-center gap-1.5 px-5 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover shadow-subtle transition-all cursor-pointer disabled:opacity-50"
          >
            <Save className={`w-3.5 h-3.5 ${saving ? 'animate-spin' : ''}`} />
            <span>{saving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {/* Save Status Banner */}
      {saveStatus && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold border flex items-center justify-between gap-3 animate-fade-in ${
            saveStatus.success
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {saveStatus.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{saveStatus.message}</span>
          </div>
          <button
            onClick={() => setSaveStatus(null)}
            className="p-1 text-midnight/40 hover:text-midnight rounded-md cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. LIVE HEADER PREVIEW BOX */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-timberwolf/70 overflow-hidden shadow-card">
        <div className="px-5 py-3 border-b border-timberwolf/40 bg-aliceblue/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-midnight uppercase tracking-wider">
              Live Header Preview
            </span>
          </div>
          <span className="text-[11px] text-midnight/50 font-medium">
            Simulates actual visitor header
          </span>
        </div>

        {/* Mock Header Canvas */}
        <div className="p-4 sm:p-6 bg-slate-50/50">
          <div className="bg-aliceblue/95 border border-timberwolf/60 rounded-xl px-4 py-3 shadow-subtle flex items-center justify-between">
            {/* Brand Logo & Name */}
            <BrandLogo
              size="md"
              customSiteName={siteName || 'HireByMinute'}
              customLogoUrl={logoUrl}
              asLink={false}
            />

            {/* Live Navigation Links in Order */}
            <div className="hidden md:flex items-center gap-6 text-sm font-medium">
              {visibleNavItems.length === 0 ? (
                <span className="text-xs italic text-midnight/40">(No visible navigation links)</span>
              ) : (
                visibleNavItems.map((item) => (
                  <span
                    key={item.id}
                    className="text-midnight/80 hover:text-moonstone transition-colors flex items-center gap-1 cursor-default"
                  >
                    <span>{item.label}</span>
                    {item.is_external && <ExternalLink className="w-3 h-3 text-midnight/40" />}
                  </span>
                ))
              )}
            </div>

            {/* Mock Header Actions */}
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-medium text-midnight/70 px-2.5 py-1">Sign In</span>
              <span className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-midnight text-aliceblue shadow-subtle">
                {ctaLabel || 'Get Started'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. SITE IDENTITY & LOGO CONTROL */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card space-y-5">
        <div className="border-b border-timberwolf/30 pb-3">
          <h2 className="text-base font-bold text-midnight flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-moonstone" />
            <span>Site Name & Brand Logo</span>
          </h2>
          <p className="text-xs text-midnight/60 mt-0.5">
            Configure the customer-facing site name and choose between the built-in SVG vector dial mark or a custom image logo.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Site Name Field */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-midnight">
              Site Name (Platform Brand Name) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="e.g. HireByMinute"
              className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-midnight focus:outline-none focus:border-moonstone shadow-subtle"
            />
            <p className="text-[11px] text-midnight/60">
              Displayed in the header brand logo, page titles, footer, and emails.
            </p>
          </div>

          {/* Logo URL Field & File Upload */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-midnight">
              Custom Logo Image (Optional)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://... or upload below"
                className="flex-1 bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2.5 text-xs font-mono text-midnight focus:outline-none focus:border-moonstone shadow-subtle"
              />
              {logoUrl && (
                <button
                  type="button"
                  onClick={() => setLogoUrl('')}
                  title="Remove custom logo and use default vector dial"
                  className="px-2.5 py-2 rounded-xl border border-timberwolf/70 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            {/* File Upload Trigger */}
            <div className="flex items-center gap-3 pt-1">
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-timberwolf/70 bg-aliceblue/50 text-xs font-semibold text-midnight hover:bg-aliceblue transition-colors cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-moonstone" />
                <span>{uploadingLogo ? 'Uploading Logo...' : 'Upload Logo Image'}</span>
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/webp, image/svg+xml"
                  onChange={handleLogoFileUpload}
                  disabled={uploadingLogo}
                  className="hidden"
                />
              </label>
              <span className="text-[11px] text-midnight/50">PNG, SVG, JPG, WEBP (Max 5MB)</span>
            </div>
          </div>
        </div>

        {/* Current Logo Mode Preview Badge */}
        <div className="p-3.5 rounded-xl bg-aliceblue/30 border border-timberwolf/40 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <span className="text-midnight/70 font-medium">Active Logo Mode:</span>
            {logoUrl ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-moonstone/15 text-moonstone-dark border border-moonstone/30">
                <ImageIcon className="w-3 h-3" /> Custom Image Logo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-midnight/10 text-midnight border border-midnight/20">
                <Globe className="w-3 h-3 text-moonstone" /> Built-in HireByMinute SVG Dial Mark
              </span>
            )}
          </div>

          {logoUrl ? (
            <button
              type="button"
              onClick={() => setLogoUrl('')}
              className="text-[11px] text-moonstone hover:underline font-semibold cursor-pointer"
            >
              Switch to Built-in Vector Icon
            </button>
          ) : (
            <span className="text-[11px] text-midnight/50">
              Paste URL or upload image to override
            </span>
          )}
        </div>

        {/* CTA Button Controls */}
        <div className="pt-4 border-t border-timberwolf/30 space-y-3">
          <div>
            <h3 className="text-xs font-bold text-midnight uppercase tracking-wider">
              Primary Header Action Button (CTA)
            </h3>
            <p className="text-[11px] text-midnight/60">
              Customize the prominent action button displayed in the header navigation for visitors.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">CTA Button Label</label>
              <input
                type="text"
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
                placeholder="Sign In / Join"
                className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs font-semibold text-midnight focus:outline-none focus:border-moonstone shadow-subtle"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">CTA Destination URL</label>
              <input
                type="text"
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                placeholder="/auth"
                className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs font-mono text-midnight focus:outline-none focus:border-moonstone shadow-subtle"
              />
              <span className="text-[10px] text-midnight/50 mt-1 block">Default: /auth or /signup</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. NAVIGATION LABELS & ORDER MANAGEMENT */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-timberwolf/30 pb-3">
          <div>
            <h2 className="text-base font-bold text-midnight flex items-center gap-2">
              <Sliders className="w-4 h-4 text-moonstone" />
              <span>Navigation Links, Custom Labels & Order</span>
            </h2>
            <p className="text-xs text-midnight/60 mt-0.5">
              Use the Up/Down buttons to change the order. Rename labels directly in the text boxes.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover shadow-subtle transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Navigation Link</span>
          </button>
        </div>

        {/* Navigation Items List */}
        <div className="space-y-3">
          {navItems.map((item, index) => (
            <div
              key={item.id}
              className={`p-4 rounded-xl border transition-all ${
                item.is_visible === false
                  ? 'bg-zinc-50/70 border-timberwolf/50 opacity-75'
                  : 'bg-white border-timberwolf/70 shadow-subtle'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                
                {/* Left: Reorder buttons & Position Badge */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="w-8 h-8 rounded-lg bg-aliceblue text-midnight font-mono text-xs font-bold flex items-center justify-center border border-timberwolf/60">
                    #{item.order}
                  </span>

                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMoveUp(index)}
                      title="Move Up"
                      className="p-1 rounded bg-aliceblue hover:bg-timberwolf/40 text-midnight disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={index === navItems.length - 1}
                      onClick={() => handleMoveDown(index)}
                      title="Move Down"
                      className="p-1 rounded bg-aliceblue hover:bg-timberwolf/40 text-midnight disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Center: Label & URL Fields */}
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-midnight/60 mb-1">
                      Navigation Label
                    </label>
                    <input
                      type="text"
                      value={item.label}
                      onChange={(e) => handleUpdateLabel(item.id, e.target.value)}
                      placeholder="e.g. Services"
                      className="w-full bg-white border border-timberwolf/70 rounded-xl px-3 py-2 text-xs font-semibold text-midnight focus:outline-none focus:border-moonstone"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-midnight/60 mb-1">
                      Destination Path / URL
                    </label>
                    <input
                      type="text"
                      value={item.url}
                      onChange={(e) => handleUpdateUrl(item.id, e.target.value)}
                      placeholder="e.g. /services or /#how-it-works"
                      className="w-full bg-white border border-timberwolf/70 rounded-xl px-3 py-2 text-xs font-mono text-midnight focus:outline-none focus:border-moonstone"
                    />
                  </div>
                </div>

                {/* Right: Toggles & Actions */}
                <div className="flex items-center justify-between sm:justify-end gap-2.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-timberwolf/30 shrink-0">
                  {/* External Tab Toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggleExternal(item.id)}
                    title={item.is_external ? 'Opens in new tab' : 'Opens in same tab'}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                      item.is_external
                        ? 'bg-moonstone/10 border-moonstone/40 text-moonstone-dark'
                        : 'bg-aliceblue/50 border-timberwolf/50 text-midnight/60 hover:text-midnight'
                    }`}
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span className="hidden xl:inline text-[11px]">New Tab</span>
                  </button>

                  {/* Visibility Toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggleVisibility(item.id)}
                    title={item.is_visible !== false ? 'Visible on Header' : 'Hidden from Header'}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                      item.is_visible !== false
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                        : 'bg-zinc-100 border-zinc-300 text-zinc-600'
                    }`}
                  >
                    {item.is_visible !== false ? (
                      <>
                        <Eye className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-[11px]">Visible</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="text-[11px]">Hidden</span>
                      </>
                    )}
                  </button>

                  {/* Delete Button */}
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(item.id)}
                    title="Delete link"
                    className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Save Action Bar */}
      <div className="bg-white rounded-2xl border border-timberwolf/70 p-4 shadow-card flex items-center justify-between">
        <p className="text-xs text-midnight/60">
          Save your changes to broadcast updated site identity and navigation order immediately.
        </p>

        <button
          type="button"
          onClick={handleSaveAll}
          disabled={saving}
          className="btn-shine flex items-center gap-2 px-6 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover shadow-subtle transition-all cursor-pointer disabled:opacity-50"
        >
          <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
          <span>{saving ? 'Saving Changes...' : 'Save Header & Navigation'}</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* ADD NAVIGATION ITEM MODAL */}
      {/* ========================================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 bg-midnight/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl border border-timberwolf/70 shadow-modal w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-timberwolf/30 pb-3">
              <h3 className="text-base font-bold text-midnight flex items-center gap-2">
                <Plus className="w-4 h-4 text-moonstone" />
                <span>Add Navigation Link</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-midnight/50 hover:text-midnight hover:bg-aliceblue"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddNewItem} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-midnight mb-1">
                  Link Label <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newItemLabel}
                  onChange={(e) => setNewItemLabel(e.target.value)}
                  placeholder="e.g. Find Experts, Blog, FAQ"
                  className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs font-semibold text-midnight focus:border-moonstone"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-midnight mb-1">
                  Destination URL / Path <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newItemUrl}
                  onChange={(e) => setNewItemUrl(e.target.value)}
                  placeholder="e.g. /services, /#how-it-works, or https://..."
                  className="w-full bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2 text-xs font-mono text-midnight focus:border-moonstone"
                />
                <p className="text-[11px] text-midnight/50 mt-1">
                  Use relative paths (e.g. <code>/services</code>) for internal pages, section anchors (<code>/#how-it-works</code>), or full URLs for external links.
                </p>
              </div>

              <div className="flex items-center justify-between py-2 border-t border-b border-timberwolf/30 text-xs">
                <label className="flex items-center gap-2 font-semibold text-midnight cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newItemExternal}
                    onChange={(e) => setNewItemExternal(e.target.checked)}
                    className="rounded text-moonstone focus:ring-moonstone"
                  />
                  <span>Open link in new tab (external)</span>
                </label>

                <label className="flex items-center gap-2 font-semibold text-midnight cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newItemVisible}
                    onChange={(e) => setNewItemVisible(e.target.checked)}
                    className="rounded text-moonstone focus:ring-moonstone"
                  />
                  <span>Visible</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-timberwolf/70 text-xs font-semibold text-midnight hover:bg-aliceblue"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-shine px-5 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover shadow-subtle"
                >
                  Add Link
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminHeaderNavControl;
