import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Category } from '../types';
import { COUNTRIES, LANGUAGES, CATEGORY_SUBCATEGORIES } from '../data/geoData';
import {
  User as UserIcon,
  Camera,
  Upload,
  Trash2,
  Check,
  X,
  Plus,
  DollarSign,
  Globe,
  MapPin,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  Clock,
  Layers,
  ArrowLeft,
  Lock
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const EditProfilePage: React.FC = () => {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // General Profile State
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [languages, setLanguages] = useState<string[]>(['English']);
  const [selectedLanguageToAdd, setSelectedLanguageToAdd] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [newSkillInput, setNewSkillInput] = useState('');
  const [experienceYears, setExperienceYears] = useState<number>(5);

  // Worldwide Location State
  const [country, setCountry] = useState('United States');
  const [stateRegion, setStateRegion] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');

  // Expert / Provider Specific State
  const [isProvider, setIsProvider] = useState(false);
  const [serviceTitle, setServiceTitle] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [categoryId, setCategoryId] = useState('cat-tech');
  const [subcategory, setSubcategory] = useState('');
  const [pricePerMinute, setPricePerMinute] = useState<number>(1.5);
  const [availableNow, setAvailableNow] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);

  // Subcategories available for selected category
  const availableSubcategories = useMemo(() => {
    const matchedCategory = categories.find(c => c.id === categoryId);
    const slug = matchedCategory ? matchedCategory.slug : 'technology';
    return CATEGORY_SUBCATEGORIES[slug] || [];
  }, [categoryId, categories]);

  useEffect(() => {
    async function loadProfile() {
      if (!user) return;
      try {
        setLoading(true);
        const [profileRes, catRes] = await Promise.all([
          api.getMyProfile(),
          api.getCategories()
        ]);

        const u = profileRes.user || user;
        setFullName(u.full_name || '');
        setUsername(u.username || (u.full_name || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '_'));
        setHeadline(u.headline || '');
        setBio(u.bio || '');
        setCountry(u.country || 'United States');
        setStateRegion(u.state_region || '');
        setCity(u.city || '');
        setArea(u.area || '');
        setAvatarUrl(u.avatar_url || '');
        setAvatarPreview(u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(u.full_name)}`);
        setLanguages(u.languages && u.languages.length > 0 ? u.languages : ['English']);
        setSkills(u.skills || []);
        setExperienceYears(u.experience_years || 5);

        const isExpertUser = u.role === 'provider' || u.role === 'admin';
        setIsProvider(isExpertUser);

        if (profileRes.service) {
          const s = profileRes.service;
          setServiceTitle(s.title || '');
          setServiceDescription(s.description || '');
          setCategoryId(s.category_id || (catRes.categories[0]?.id || 'cat-tech'));
          setSubcategory(s.subcategory || '');
          setPricePerMinute(s.price_per_minute || 1.5);
          setAvailableNow(s.available_now === 1 || s.available_now === true);
        }

        setCategories(catRes.categories || []);
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [user?.id]);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Profile image size must be under 5MB.');
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      setErrorMessage('Invalid file format. Please upload a JPG, PNG, or WEBP image.');
      return;
    }

    setUploadingPhoto(true);
    setErrorMessage(null);
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setAvatarPreview(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);

      const res = await api.uploadAvatar(file);
      setAvatarUrl(res.url);
      setAvatarPreview(res.url);
    } catch (err: any) {
      setErrorMessage(err.message || 'Photo upload failed. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = () => {
    const fallback = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(fullName || 'User')}`;
    setAvatarUrl(fallback);
    setAvatarPreview(fallback);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddLanguage = (lang: string) => {
    const cleanLang = lang.trim();
    if (!cleanLang) return;
    if (!languages.includes(cleanLang)) {
      setLanguages([...languages, cleanLang]);
    }
    setSelectedLanguageToAdd('');
  };

  const handleRemoveLanguage = (langToRemove: string) => {
    setLanguages(languages.filter(l => l !== langToRemove));
  };

  const handleAddSkill = () => {
    const skill = newSkillInput.trim();
    if (!skill) return;
    if (!skills.includes(skill)) {
      setSkills([...skills, skill]);
    }
    setNewSkillInput('');
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setSkills(skills.filter(s => s !== skillToRemove));
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setErrorMessage('Full name is required.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const updatePayload: any = {
        full_name: fullName.trim(),
        avatar_url: avatarUrl,
        headline: headline.trim(),
        bio: bio.trim(),
        country: country.trim(),
        state_region: stateRegion.trim(),
        city: city.trim(),
        area: area.trim(),
        location: [city.trim(), stateRegion.trim(), country.trim()].filter(Boolean).join(', '),
        languages,
        skills,
        experience_years: experienceYears
      };

      if (isProvider) {
        updatePayload.service_title = serviceTitle.trim();
        updatePayload.service_description = serviceDescription.trim();
        updatePayload.subcategory = subcategory.trim();
        updatePayload.category_id = categoryId;
        updatePayload.price_per_minute = pricePerMinute;
        updatePayload.available_now = availableNow;
      }

      const res = await api.updateMyProfile(updatePayload);
      if (res.user) {
        updateUser(res.user);
      }

      confetti({ particleCount: 60, spread: 50 });
      setSuccessMessage('Profile updated successfully.');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="w-10 h-10 border-2 border-moonstone border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-midnight/60">Loading profile details...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8 animate-fade-in">
      
      {/* Header & Back Link */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-timberwolf/40">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              to={user?.role === 'provider' ? '/provider' : '/client'}
              className="text-xs text-midnight/60 hover:text-midnight flex items-center gap-1 font-medium transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Dashboard</span>
            </Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-midnight tracking-tight">
            Edit Profile
          </h1>
          <p className="text-xs sm:text-sm text-midnight/70 mt-1">
            Update your public profile, domain expertise, worldwide location, and consultation preferences.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-aliceblue text-midnight border border-timberwolf/60 capitalize">
            Role: {user?.role}
          </span>
          {user?.verified ? (
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Verified</span>
            </span>
          ) : null}
        </div>
      </div>

      {/* Notifications / Alerts */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium flex items-center gap-2 animate-fade-in">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium flex items-center gap-2 animate-fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSaveProfile} className="space-y-8">
        
        {/* ========================================================================= */}
        {/* 1. PROFILE PHOTO SECTION */}
        {/* ========================================================================= */}
        <div className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-6 sm:p-7 shadow-card space-y-5">
          <h2 className="text-base font-bold text-midnight flex items-center gap-2">
            <Camera className="w-4 h-4 text-moonstone" />
            <span>Profile Photo</span>
          </h2>

          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <div className="relative group">
              <img
                src={avatarPreview || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(fullName || 'User')}`}
                alt={fullName}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border-2 border-lightblue shadow-subtle bg-aliceblue"
              />
              {uploadingPhoto && (
                <div className="absolute inset-0 bg-midnight/50 rounded-2xl flex items-center justify-center text-white text-xs font-semibold">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>

            <div className="space-y-2 text-center sm:text-left flex-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handlePhotoSelect}
                  accept="image/png, image/jpeg, image/webp, image/jpg"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="px-4 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover transition-colors shadow-subtle inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5 text-moonstone" />
                  <span>{uploadingPhoto ? 'Uploading...' : 'Change Photo'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="px-3.5 py-2 rounded-xl border border-timberwolf text-midnight/70 text-xs font-semibold hover:bg-aliceblue hover:text-midnight transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                  <span>Remove Photo</span>
                </button>
              </div>

              <p className="text-[11px] text-midnight/50 leading-relaxed">
                Supported formats: JPG, PNG, WEBP. Maximum file size: 5MB.<br className="hidden sm:inline" />
                Your photo is visible to clients and experts worldwide.
              </p>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. PERSONAL INFORMATION & WORLDWIDE LOCATION */}
        {/* ========================================================================= */}
        <div className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-6 sm:p-7 shadow-card space-y-6">
          <h2 className="text-base font-bold text-midnight flex items-center gap-2">
            <UserIcon className="w-4 h-4 text-moonstone" />
            <span>Personal Information</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            
            {/* Full Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-midnight block">
                Full Name *
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Elena Rostova"
                className="w-full px-3.5 py-2.5 rounded-xl border border-timberwolf/70 text-xs font-medium text-midnight bg-aliceblue/30 focus:outline-none focus:border-moonstone"
              />
            </div>

            {/* Permanent Username (Read-Only) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-midnight flex items-center gap-1">
                  <Lock className="w-3 h-3 text-midnight/50" />
                  <span>Username</span>
                </label>
                <span className="text-[10px] text-midnight/50">Permanent</span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  disabled
                  value={`@${username}`}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-timberwolf/50 text-xs font-mono text-midnight/60 bg-zinc-100 cursor-not-allowed select-none"
                />
              </div>
              <span className="text-[11px] text-midnight/50 block">
                Username cannot be changed once created.
              </span>
            </div>

            {/* Professional Headline */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold text-midnight block">
                Headline / Professional Title
              </label>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="e.g. Principal Product Designer formerly at Linear & Stripe"
                className="w-full px-3.5 py-2.5 rounded-xl border border-timberwolf/70 text-xs font-medium text-midnight bg-aliceblue/30 focus:outline-none focus:border-moonstone"
              />
            </div>

            {/* Bio / About */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold text-midnight block">
                Bio / About Me
              </label>
              <textarea
                rows={4}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Describe your background, consultation approach, and domain experience..."
                className="w-full p-3 rounded-xl border border-timberwolf/70 text-xs font-medium text-midnight bg-aliceblue/30 focus:outline-none focus:border-moonstone leading-relaxed"
              />
            </div>

          </div>

          {/* Worldwide Location Details */}
          <div className="pt-4 border-t border-timberwolf/30 space-y-4">
            <h3 className="text-xs font-bold text-midnight uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-moonstone" />
              <span>Worldwide Location Details (Online Global)</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Country */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-midnight block">Country</label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-timberwolf/70 text-xs font-medium text-midnight bg-aliceblue/30 focus:outline-none focus:border-moonstone"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* State / Region */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-midnight block">State / Region</label>
                <input
                  type="text"
                  value={stateRegion}
                  onChange={(e) => setStateRegion(e.target.value)}
                  placeholder="e.g. Haryana / California"
                  className="w-full p-2.5 rounded-xl border border-timberwolf/70 text-xs font-medium text-midnight bg-aliceblue/30 focus:outline-none focus:border-moonstone"
                />
              </div>

              {/* City */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-midnight block">City</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Gurugram / Berlin"
                  className="w-full p-2.5 rounded-xl border border-timberwolf/70 text-xs font-medium text-midnight bg-aliceblue/30 focus:outline-none focus:border-moonstone"
                />
              </div>

              {/* Area / District */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-midnight block">Area / District (Optional)</label>
                <input
                  type="text"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="e.g. Sector 44 / Mitte"
                  className="w-full p-2.5 rounded-xl border border-timberwolf/70 text-xs font-medium text-midnight bg-aliceblue/30 focus:outline-none focus:border-moonstone"
                />
              </div>

            </div>
          </div>

          {/* Languages Management (Controlled Global List) */}
          <div className="space-y-2 pt-4 border-t border-timberwolf/30">
            <label className="text-xs font-semibold text-midnight flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-moonstone" />
              <span>Languages Spoken</span>
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {languages.map((lang) => (
                <span
                  key={lang}
                  className="px-3 py-1 rounded-lg bg-aliceblue text-midnight text-xs font-semibold border border-timberwolf/50 flex items-center gap-1.5"
                >
                  <span>{lang}</span>
                  {languages.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveLanguage(lang)}
                      className="text-midnight/40 hover:text-rose-600 transition-colors cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2 max-w-sm">
              <select
                value={selectedLanguageToAdd}
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddLanguage(e.target.value);
                  }
                }}
                className="flex-1 p-2 text-xs rounded-lg border border-timberwolf/70 bg-white focus:outline-none focus:border-moonstone"
              >
                <option value="">+ Add another language...</option>
                {LANGUAGES.filter(l => !languages.includes(l)).map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Skills Management */}
          <div className="space-y-2 pt-4 border-t border-timberwolf/30">
            <label className="text-xs font-semibold text-midnight block">
              Skills & Expertise Tags
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="px-3 py-1 rounded-lg bg-lightblue/20 text-midnight text-xs font-semibold border border-moonstone/30 flex items-center gap-1.5"
                >
                  <span>{skill}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveSkill(skill)}
                    className="text-midnight/40 hover:text-rose-600 transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2 max-w-xs">
              <input
                type="text"
                value={newSkillInput}
                onChange={(e) => setNewSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSkill();
                  }
                }}
                placeholder="Add a skill (e.g. FastAPI, Figma)..."
                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-timberwolf/70 focus:outline-none focus:border-moonstone"
              />
              <button
                type="button"
                onClick={handleAddSkill}
                className="px-3 py-1.5 rounded-lg bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover transition-colors"
              >
                Add
              </button>
            </div>
          </div>

        </div>

        {/* ========================================================================= */}
        {/* 3. EXPERT SERVICE & PRICING (For Providers/Experts) */}
        {/* ========================================================================= */}
        {isProvider && (
          <div className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-6 sm:p-7 shadow-card space-y-6">
            <div className="flex items-center justify-between pb-2 border-b border-timberwolf/40">
              <h2 className="text-base font-bold text-midnight flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-moonstone" />
                <span>Expert Consultation & Service Settings</span>
              </h2>
              <span className="text-[11px] text-midnight/50">Applies to future consultation requests</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              
              {/* Service Title */}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold text-midnight block">
                  Service Listing Title
                </label>
                <input
                  type="text"
                  value={serviceTitle}
                  onChange={(e) => setServiceTitle(e.target.value)}
                  placeholder="e.g. Figma UI/UX Teardown & Design System Review"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-timberwolf/70 text-xs font-medium text-midnight bg-aliceblue/30 focus:outline-none focus:border-moonstone"
                />
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-midnight block">
                  Category
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-timberwolf/70 text-xs font-medium text-midnight bg-aliceblue/30 focus:outline-none focus:border-moonstone"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Subcategory / Service Type */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-midnight block">
                  Subcategory / Service Type
                </label>
                {availableSubcategories.length > 0 ? (
                  <select
                    value={subcategory}
                    onChange={(e) => setSubcategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-timberwolf/70 text-xs font-medium text-midnight bg-aliceblue/30 focus:outline-none focus:border-moonstone"
                  >
                    <option value="">Select subcategory...</option>
                    {availableSubcategories.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={subcategory}
                    onChange={(e) => setSubcategory(e.target.value)}
                    placeholder="e.g. Web Development"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-timberwolf/70 text-xs font-medium text-midnight bg-aliceblue/30 focus:outline-none focus:border-moonstone"
                  />
                )}
              </div>

              {/* Service Description */}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold text-midnight block">
                  Service Listing Description
                </label>
                <textarea
                  rows={3}
                  value={serviceDescription}
                  onChange={(e) => setServiceDescription(e.target.value)}
                  placeholder="Explain what problems you will help clients solve during the consultation..."
                  className="w-full p-3 rounded-xl border border-timberwolf/70 text-xs font-medium text-midnight bg-aliceblue/30 focus:outline-none focus:border-moonstone leading-relaxed"
                />
              </div>

              {/* Rate Per Minute */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-midnight block">
                    Rate Per Minute (USD)
                  </label>
                  <span className="text-[11px] font-mono text-emerald-700 font-bold">
                    ${(pricePerMinute * 30).toFixed(2)} / 30m
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPricePerMinute((prev) => Math.max(0.20, Number((prev - 0.10).toFixed(2))))}
                    className="w-10 h-10 rounded-xl border border-timberwolf bg-aliceblue text-midnight font-bold text-sm hover:border-moonstone transition-colors flex items-center justify-center cursor-pointer"
                  >
                    -
                  </button>
                  <div className="relative flex-1">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-midnight/50 font-bold text-xs">$</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0.20"
                      max="100"
                      value={pricePerMinute}
                      onChange={(e) => setPricePerMinute(Math.max(0.20, parseFloat(e.target.value) || 0.20))}
                      className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-timberwolf/70 text-xs font-mono font-bold text-midnight bg-aliceblue/30 focus:outline-none focus:border-moonstone text-center"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setPricePerMinute((prev) => Number((prev + 0.10).toFixed(2)))}
                    className="w-10 h-10 rounded-xl border border-timberwolf bg-aliceblue text-midnight font-bold text-sm hover:border-moonstone transition-colors flex items-center justify-center cursor-pointer"
                  >
                    +
                  </button>
                </div>
                <span className="text-[10px] text-midnight/50 block">
                  Past bookings and accepted consultations retain their historical rates.
                </span>
              </div>

              {/* Live Availability Toggle */}
              <div className="pt-2">
                <label className="flex items-center gap-3 p-3 rounded-xl border border-timberwolf/60 bg-aliceblue/20 cursor-pointer hover:border-moonstone transition-all h-full">
                  <input
                    type="checkbox"
                    checked={availableNow}
                    onChange={(e) => setAvailableNow(e.target.checked)}
                    className="w-4 h-4 accent-midnight rounded"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-midnight block">Accept "Connect Now" Consultations</span>
                    <span className="text-midnight/60 text-[11px]">Allow clients to send urgent on-demand requests when active.</span>
                  </div>
                </label>
              </div>

            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SAVE & CANCEL ACTION BAR */}
        {/* ========================================================================= */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-timberwolf/40">
          <Link
            to={user?.role === 'provider' ? '/provider' : '/client'}
            className="px-5 py-2.5 rounded-xl border border-timberwolf text-xs font-semibold text-midnight hover:bg-aliceblue transition-colors cursor-pointer"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={saving || uploadingPhoto}
            className="btn-shine px-6 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover transition-all shadow-subtle inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Saving Changes...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 text-moonstone" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>

      </form>

    </div>
  );
};
export default EditProfilePage;
