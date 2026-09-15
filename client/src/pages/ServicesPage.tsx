import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { Service, Category } from '../types';
import { ExpertCard } from '../components/common/ExpertCard';
import { Button } from '../components/common/Button';
import { COUNTRIES, LANGUAGES, CATEGORY_SUBCATEGORIES } from '../data/geoData';
import {
  Search,
  Filter,
  CheckCircle2,
  Star,
  Clock,
  RotateCcw,
  Globe,
  MapPin,
  ChevronDown,
  X,
  SlidersHorizontal,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { usePageSEO } from '../hooks/usePageSEO';

export const ServicesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Filter states
  const categoryParam = searchParams.get('category') || 'all';

  const categoryName = useMemo(() => {
    if (!categoryParam || categoryParam === 'all') return null;
    return categories.find(c => c.slug === categoryParam)?.name || null;
  }, [categoryParam, categories]);

  usePageSEO({
    title: categoryName ? `${categoryName} Experts — HireByMinute` : 'Browse Expert Services — HireByMinute',
    description: categoryName 
      ? `Hire verified ${categoryName} specialists by the minute. Get direct 1-on-1 consultations with real-time minute billing.`
      : 'Discover vetted specialists across tech, design, marketing, and business. Pay only for the minutes you use.',
    canonicalPath: '/services'
  });
  const subcategoryParam = searchParams.get('subcategory') || 'all';
  const searchParam = searchParams.get('search') || '';
  const skillParam = searchParams.get('skill') || '';
  const languageParam = searchParams.get('language') || 'all';
  const countryParam = searchParams.get('country') || 'all';
  const cityParam = searchParams.get('city') || '';
  const sortParam = searchParams.get('sort') || 'best_match';

  const [selectedCategory, setSelectedCategory] = useState(categoryParam);
  const [selectedSubcategory, setSelectedSubcategory] = useState(subcategoryParam);
  const [searchQuery, setSearchQuery] = useState(searchParam);
  const [skillQuery, setSkillQuery] = useState(skillParam);
  const [selectedLanguage, setSelectedLanguage] = useState(languageParam);
  const [selectedCountry, setSelectedCountry] = useState(countryParam);
  const [cityQuery, setCityQuery] = useState(cityParam);
  const [sortBy, setSortBy] = useState(sortParam);
  const [maxPrice, setMaxPrice] = useState<number>(Number(searchParams.get('maxPrice')) || 5.0);
  const [minRating, setMinRating] = useState<number>(Number(searchParams.get('rating')) || 0);
  const [minExperience, setMinExperience] = useState<number>(Number(searchParams.get('experience')) || 0);
  const [minSessions, setMinSessions] = useState<number>(Number(searchParams.get('minCompletedSessions')) || 0);
  const [verifiedOnly, setVerifiedOnly] = useState<boolean>(searchParams.get('verified') === 'true');
  const [availableNowOnly, setAvailableNowOnly] = useState<boolean>(searchParams.get('availableNow') === 'true');

  // Subcategories for currently selected category
  const availableSubcategories = useMemo(() => {
    if (!selectedCategory || selectedCategory === 'all') return [];
    return CATEGORY_SUBCATEGORIES[selectedCategory] || [];
  }, [selectedCategory]);

  useEffect(() => {
    setSelectedCategory(searchParams.get('category') || 'all');
    setSelectedSubcategory(searchParams.get('subcategory') || 'all');
    setSearchQuery(searchParams.get('search') || '');
    setSkillQuery(searchParams.get('skill') || '');
    setSelectedLanguage(searchParams.get('language') || 'all');
    setSelectedCountry(searchParams.get('country') || 'all');
    setCityQuery(searchParams.get('city') || '');
    setSortBy(searchParams.get('sort') || 'best_match');
  }, [searchParams]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [catsRes, servRes] = await Promise.all([
          api.getCategories(),
          api.getServices({
            category: selectedCategory !== 'all' ? selectedCategory : '',
            subcategory: selectedSubcategory !== 'all' ? selectedSubcategory : '',
            search: searchQuery,
            skill: skillQuery,
            language: selectedLanguage !== 'all' ? selectedLanguage : '',
            country: selectedCountry !== 'all' ? selectedCountry : '',
            city: cityQuery,
            maxPrice,
            rating: minRating > 0 ? minRating : '',
            experience: minExperience > 0 ? minExperience : '',
            minCompletedSessions: minSessions > 0 ? minSessions : '',
            verified: verifiedOnly ? 'true' : '',
            availableNow: availableNowOnly ? 'true' : '',
            sort: sortBy
          })
        ]);
        setCategories(catsRes.categories || []);
        setServices(servRes.services || []);
      } catch (err) {
        console.error('Error fetching marketplace services', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [
    selectedCategory,
    selectedSubcategory,
    searchQuery,
    skillQuery,
    selectedLanguage,
    selectedCountry,
    cityQuery,
    maxPrice,
    minRating,
    minExperience,
    minSessions,
    verifiedOnly,
    availableNowOnly,
    sortBy
  ]);

  const updateParam = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (!value || value === 'all') {
      newParams.delete(key);
    } else {
      newParams.set(key, value);
    }
    setSearchParams(newParams);
  };

  const handleCategorySelect = (slug: string) => {
    setSelectedCategory(slug);
    setSelectedSubcategory('all');
    const newParams = new URLSearchParams(searchParams);
    if (slug === 'all') {
      newParams.delete('category');
    } else {
      newParams.set('category', slug);
    }
    newParams.delete('subcategory');
    setSearchParams(newParams);
  };

  const handleSubcategorySelect = (sub: string) => {
    setSelectedSubcategory(sub);
    updateParam('subcategory', sub);
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    updateParam('search', val);
  };

  const handleSkillChange = (val: string) => {
    setSkillQuery(val);
    updateParam('skill', val);
  };

  const handleSortChange = (val: string) => {
    setSortBy(val);
    updateParam('sort', val);
  };

  const handleLanguageSelect = (lang: string) => {
    setSelectedLanguage(lang);
    updateParam('language', lang);
  };

  const handleCountrySelect = (country: string) => {
    setSelectedCountry(country);
    updateParam('country', country);
  };

  const handleCityChange = (city: string) => {
    setCityQuery(city);
    updateParam('city', city);
  };

  const resetFilters = () => {
    setSelectedCategory('all');
    setSelectedSubcategory('all');
    setSearchQuery('');
    setSkillQuery('');
    setSelectedLanguage('all');
    setSelectedCountry('all');
    setCityQuery('');
    setMaxPrice(5.0);
    setMinRating(0);
    setMinExperience(0);
    setMinSessions(0);
    setVerifiedOnly(false);
    setAvailableNowOnly(false);
    setSortBy('best_match');
    setSearchParams({});
  };

  const activeFilterCount = [
    selectedCategory !== 'all',
    selectedSubcategory !== 'all',
    searchQuery !== '',
    skillQuery !== '',
    selectedLanguage !== 'all',
    selectedCountry !== 'all',
    cityQuery !== '',
    minRating > 0,
    minExperience > 0,
    minSessions > 0,
    verifiedOnly,
    availableNowOnly,
    maxPrice < 5.0,
    sortBy !== 'best_match'
  ].filter(Boolean).length;

  const renderFilterControls = () => (
    <>
      {/* 1. Language Filter */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-midnight flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5 text-moonstone" />
          <span>Spoken Language</span>
        </label>
        <select
          value={selectedLanguage}
          onChange={(e) => handleLanguageSelect(e.target.value)}
          className="w-full p-2.5 rounded-xl border border-timberwolf/70 text-xs font-medium text-midnight bg-aliceblue/30 focus:outline-none focus:border-moonstone min-h-[44px]"
        >
          <option value="all">All Languages (Global)</option>
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
      </div>

      {/* 2. Country Filter */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-midnight flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-moonstone" />
          <span>Country</span>
        </label>
        <select
          value={selectedCountry}
          onChange={(e) => handleCountrySelect(e.target.value)}
          className="w-full p-2.5 rounded-xl border border-timberwolf/70 text-xs font-medium text-midnight bg-aliceblue/30 focus:outline-none focus:border-moonstone min-h-[44px]"
        >
          <option value="all">All Countries (Worldwide)</option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* 3. City / Area Search */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-midnight block">
          City / Metro Area
        </label>
        <input
          type="text"
          value={cityQuery}
          onChange={(e) => handleCityChange(e.target.value)}
          placeholder="e.g. Gurugram, Berlin, London..."
          className="w-full px-3 py-2.5 rounded-xl border border-timberwolf/70 text-xs font-medium text-midnight bg-aliceblue/30 focus:outline-none focus:border-moonstone min-h-[44px]"
        />
      </div>

      {/* 4. Specific Skill Filter */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-midnight block">
          Specific Skill or Keyword
        </label>
        <input
          type="text"
          value={skillQuery}
          onChange={(e) => handleSkillChange(e.target.value)}
          placeholder="e.g. React, Python, Law, SEO..."
          className="w-full px-3 py-2.5 rounded-xl border border-timberwolf/70 text-xs font-medium text-midnight bg-aliceblue/30 focus:outline-none focus:border-moonstone min-h-[44px]"
        />
      </div>

      {/* 5. Max Price Per Minute Slider */}
      <div className="space-y-2 pt-2 border-t border-timberwolf/30">
        <div className="flex justify-between text-xs font-semibold text-midnight">
          <span>Max Rate / Minute</span>
          <span className="text-moonstone font-mono font-bold">${maxPrice.toFixed(2)}/min</span>
        </div>
        <input
          type="range"
          min="0.50"
          max="5.00"
          step="0.10"
          value={maxPrice}
          onChange={(e) => setMaxPrice(parseFloat(e.target.value))}
          className="w-full accent-moonstone cursor-pointer h-6"
        />
        <div className="flex justify-between text-[10px] text-midnight/50">
          <span>$0.50</span>
          <span>$5.00+</span>
        </div>
      </div>

      {/* 6. Minimum Rating */}
      <div className="space-y-2 pt-2 border-t border-timberwolf/30">
        <span className="text-xs font-semibold text-midnight block">Minimum Rating</span>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { label: 'Any', value: 0 },
            { label: '4.8★+', value: 4.8 },
            { label: '4.9★+', value: 4.9 },
          ].map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setMinRating(r.value)}
              className={`py-2 text-xs font-medium rounded-xl border min-h-[44px] transition-all cursor-pointer ${
                minRating === r.value
                  ? 'bg-midnight text-aliceblue border-midnight font-semibold shadow-subtle'
                  : 'border-timberwolf/70 hover:border-moonstone text-midnight bg-aliceblue/20'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* 7. Experience Filter */}
      <div className="space-y-2 pt-2 border-t border-timberwolf/30">
        <span className="text-xs font-semibold text-midnight block">Experience</span>
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { label: 'Any', value: 0 },
            { label: '2+ yrs', value: 2 },
            { label: '5+ yrs', value: 5 },
            { label: '8+ yrs', value: 8 },
          ].map((exp) => (
            <button
              key={exp.label}
              type="button"
              onClick={() => setMinExperience(exp.value)}
              className={`py-2 text-xs font-medium rounded-xl border min-h-[44px] transition-all cursor-pointer ${
                minExperience === exp.value
                  ? 'bg-midnight text-aliceblue border-midnight font-semibold shadow-subtle'
                  : 'border-timberwolf/70 hover:border-moonstone text-midnight bg-aliceblue/20'
              }`}
            >
              {exp.label}
            </button>
          ))}
        </div>
      </div>

      {/* 8. Minimum Sessions Filter */}
      <div className="space-y-2 pt-2 border-t border-timberwolf/30">
        <span className="text-xs font-semibold text-midnight block">Consultations Done</span>
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { label: 'Any', value: 0 },
            { label: '5+', value: 5 },
            { label: '10+', value: 10 },
            { label: '25+', value: 25 },
          ].map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setMinSessions(s.value)}
              className={`py-2 text-xs font-medium rounded-xl border min-h-[44px] transition-all cursor-pointer ${
                minSessions === s.value
                  ? 'bg-midnight text-aliceblue border-midnight font-semibold shadow-subtle'
                  : 'border-timberwolf/70 hover:border-moonstone text-midnight bg-aliceblue/20'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* 9. Toggles */}
      <div className="space-y-3 pt-2 border-t border-timberwolf/40">
        <label className="flex items-center justify-between text-xs font-medium text-midnight cursor-pointer py-1">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-moonstone" /> Verified Experts Only
          </span>
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(e) => setVerifiedOnly(e.target.checked)}
            className="w-4 h-4 accent-midnight rounded cursor-pointer"
          />
        </label>

        <label className="flex items-center justify-between text-xs font-medium text-midnight cursor-pointer py-1">
          <span className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-emerald-500" /> Available Now
          </span>
          <input
            type="checkbox"
            checked={availableNowOnly}
            onChange={(e) => setAvailableNowOnly(e.target.checked)}
            className="w-4 h-4 accent-midnight rounded cursor-pointer"
          />
        </label>
      </div>
    </>
  );

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 min-w-0">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6 sm:mb-8 w-full min-w-0">
        <div className="w-full min-w-0 max-w-full">
          <h1 className="text-[28px] sm:text-3xl lg:text-4xl font-extrabold text-midnight tracking-tight leading-[1.15] max-w-full break-normal [overflow-wrap:anywhere]">
            Worldwide Expert Discovery
          </h1>
          <p className="text-sm sm:text-base text-midnight/70 mt-2 max-w-xl break-words leading-relaxed">
            Hire vetted domain experts across 40+ countries and global languages in real-time.
          </p>
        </div>

        {/* Mobile Filter Toggle Button */}
        <div className="lg:hidden flex items-center gap-2 w-full min-w-0">
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(true)}
            className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-white border border-timberwolf text-midnight text-xs font-bold flex items-center justify-center gap-2 shadow-subtle active:scale-[0.98] transition-all cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4 text-moonstone shrink-0" />
            <span>Filters {activeFilterCount > 0 && `(${activeFilterCount})`}</span>
          </button>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className="min-h-[44px] py-2.5 px-3 rounded-xl border border-timberwolf text-rose-600 text-xs font-semibold hover:bg-rose-50 cursor-pointer shrink-0"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Top Search & Primary Category Navigation */}
      <div className="w-full max-w-full min-w-0 space-y-4 mb-6 sm:mb-8">
        
        {/* Search Input Bar */}
        <div className="relative w-full max-w-3xl min-w-0">
          <Search className="w-5 h-5 text-midnight/45 absolute left-3.5 top-1/2 -translate-y-1/2 shrink-0 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search experts, skills, or services..."
            className="w-full min-w-0 pl-11 pr-10 py-3 min-h-[48px] bg-white border-2 border-timberwolf/80 rounded-2xl text-sm sm:text-base text-midnight placeholder:text-midnight/40 placeholder:truncate focus:outline-none focus:border-moonstone shadow-subtle focus:shadow-card transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => handleSearchChange('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-midnight/40 hover:text-midnight transition-colors cursor-pointer rounded-lg shrink-0"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Horizontal Category Pill Bar */}
        <div className="w-full max-w-full min-w-0 flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
          <button
            onClick={() => handleCategorySelect('all')}
            className={`shrink-0 min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-midnight text-aliceblue shadow-subtle'
                : 'bg-white border border-timberwolf/70 text-midnight hover:border-moonstone'
            }`}
          >
            All Categories
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategorySelect(cat.slug)}
              className={`shrink-0 min-h-[40px] px-4 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === cat.slug
                  ? 'bg-midnight text-aliceblue font-semibold shadow-subtle'
                  : 'bg-white border border-timberwolf/70 text-midnight/80 hover:border-moonstone hover:text-midnight'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Subcategory Pills (when a category is selected) */}
        {availableSubcategories.length > 0 && (
          <div className="w-full max-w-full min-w-0 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 animate-fade-in">
            <span className="text-[11px] font-bold text-midnight/50 uppercase tracking-wider shrink-0 mr-1">
              Service Type:
            </span>
            <button
              onClick={() => handleSubcategorySelect('all')}
              className={`shrink-0 min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer transition-all ${
                selectedSubcategory === 'all'
                  ? 'bg-moonstone text-white font-semibold shadow-subtle'
                  : 'bg-aliceblue/80 text-midnight hover:bg-aliceblue border border-timberwolf/40'
              }`}
            >
              All {categories.find(c => c.slug === selectedCategory)?.name}
            </button>
            {availableSubcategories.map((sub) => (
              <button
                key={sub}
                onClick={() => handleSubcategorySelect(sub)}
                className={`shrink-0 min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs whitespace-nowrap cursor-pointer transition-all ${
                  selectedSubcategory === sub
                    ? 'bg-moonstone text-white font-semibold shadow-subtle'
                    : 'bg-aliceblue/80 text-midnight hover:bg-aliceblue border border-timberwolf/40'
                }`}
              >
                {sub}
              </button>
            ))}
          </div>
        )}

      </div>

      {/* Main Layout: Filter Sidebar + Services Grid */}
      <div className="w-full max-w-full min-w-0 grid grid-cols-1 lg:grid-cols-4 gap-6 lg:gap-8">
        
        {/* ========================================================================= */}
        {/* DESKTOP FILTERS SIDEBAR (Sticky on desktop, hidden on mobile) */}
        {/* ========================================================================= */}
        <aside className="hidden lg:block lg:col-span-1 space-y-6 bg-white p-5 sm:p-6 rounded-2xl border border-timberwolf/60 shadow-card h-fit sticky top-24">
          <div className="flex items-center justify-between pb-3 border-b border-timberwolf/40">
            <span className="font-bold text-sm text-midnight flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-moonstone" />
              <span>Worldwide Filters</span>
            </span>
            {activeFilterCount > 0 && (
              <button
                onClick={resetFilters}
                className="text-xs text-moonstone hover:text-moonstone-dark flex items-center gap-1 font-medium cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" /> Reset ({activeFilterCount})
              </button>
            )}
          </div>
          {renderFilterControls()}
        </aside>

        {/* ========================================================================= */}
        {/* MOBILE-FRIENDLY BOTTOM SHEET FILTER MODAL (Does not squeeze columns) */}
        {/* ========================================================================= */}
        {mobileFiltersOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            {/* Dark Backdrop with subtle blur */}
            <div
              className="fixed inset-0 bg-midnight/60 backdrop-blur-xs transition-opacity animate-fade-in"
              onClick={() => setMobileFiltersOpen(false)}
            />

            {/* Bottom Sheet Container */}
            <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl animate-slide-up border-t border-timberwolf/40">
              {/* Sheet Drag Indicator & Header */}
              <div className="pt-3 pb-3 px-6 border-b border-timberwolf/30 shrink-0">
                <div className="w-12 h-1 bg-timberwolf/70 rounded-full mx-auto mb-3" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-moonstone" />
                    <h2 className="font-bold text-base text-midnight">Filters</h2>
                    {activeFilterCount > 0 && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-moonstone/15 text-moonstone">
                        {activeFilterCount} active
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen(false)}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-midnight/60 hover:text-midnight hover:bg-aliceblue cursor-pointer"
                    title="Close filters"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Scrollable Filter Options */}
              <div className="overflow-y-auto px-6 py-5 space-y-6 flex-1 overscroll-contain">
                {renderFilterControls()}
              </div>

              {/* Sticky Action Footer */}
              <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-timberwolf/30 bg-white shrink-0 flex items-center gap-3">
                {activeFilterCount > 0 && (
                  <Button
                    variant="outline"
                    size="md"
                    onClick={resetFilters}
                    className="flex-1"
                  >
                    Reset All
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => setMobileFiltersOpen(false)}
                  className="flex-1"
                >
                  Show {services.length} Result{services.length === 1 ? '' : 's'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SERVICES RESULTS GRID */}
        {/* ========================================================================= */}
        <div className="w-full max-w-full min-w-0 lg:col-span-3">
          
          {/* Active Filter Summary & Sorting Bar */}
          <div className="w-full min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 p-3.5 bg-white rounded-xl border border-timberwolf/60 shadow-subtle">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-semibold text-midnight truncate">
                Showing <strong className="font-bold text-moonstone">{services.length}</strong> available experts
              </span>
              {activeFilterCount > 0 && (
                <span className="text-xs text-midnight/50 hidden sm:inline shrink-0">
                  • {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
                </span>
              )}
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto shrink-0">
              <span className="text-xs text-midnight/60 font-medium">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => handleSortChange(e.target.value)}
                aria-label="Sort experts by"
                className="p-1.5 px-3 rounded-lg border border-timberwolf/70 text-xs font-semibold text-midnight bg-aliceblue/20 focus:outline-none focus:border-moonstone cursor-pointer"
              >
                <option value="best_match">Best Match</option>
                <option value="rating">Highest Rating</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="experience">Experience: High to Low</option>
                <option value="available_now">Available Now First</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="w-full min-w-0 grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="w-full bg-white/60 border border-timberwolf/40 rounded-2xl p-6 h-64 animate-pulse" />
              ))}
            </div>
          ) : services.length === 0 ? (
            activeFilterCount > 0 ? (
              <div className="w-full water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-8 sm:p-12 text-center shadow-card space-y-4">
                <div className="w-14 h-14 rounded-full bg-aliceblue text-midnight mx-auto flex items-center justify-center">
                  <Globe className="w-6 h-6 text-moonstone" />
                </div>
                <h3 className="text-lg font-bold text-midnight">No experts match your filters</h3>
                <p className="text-xs text-midnight/70 max-w-md mx-auto leading-relaxed">
                  Try selecting "All Languages" or "All Countries", adjusting your price range, or searching for broader skills. All online experts remain globally hireable.
                </p>
                <button
                  onClick={resetFilters}
                  className="px-5 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover transition-colors shadow-subtle cursor-pointer"
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              <div className="w-full water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-8 sm:p-12 text-center shadow-card space-y-4">
                <div className="w-14 h-14 rounded-full bg-aliceblue text-midnight mx-auto flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-moonstone" />
                </div>
                <h3 className="text-lg font-bold text-midnight">Expert Marketplace Opening Soon</h3>
                <p className="text-xs text-midnight/70 max-w-md mx-auto leading-relaxed">
                  Verified domain experts will appear here as they complete onboarding and listing verification. Are you an expert ready to offer pay-per-minute consultations?
                </p>
                <div className="pt-2">
                  <Link
                    to="/provider/onboard"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-moonstone hover:bg-moonstone-hover text-white text-xs font-bold transition-all shadow-subtle cursor-pointer"
                  >
                    <span>Become a Service Provider</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            )
          ) : (
            <div className="w-full min-w-0 grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
              {services.map((service) => (
                <ExpertCard key={service.id} service={service} />
              ))}
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
export default ServicesPage;
