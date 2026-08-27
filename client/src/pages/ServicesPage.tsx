import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { Service, Category } from '../types';
import { ExpertCard } from '../components/common/ExpertCard';
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
  SlidersHorizontal
} from 'lucide-react';

export const ServicesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Filter states
  const categoryParam = searchParams.get('category') || 'all';
  const subcategoryParam = searchParams.get('subcategory') || 'all';
  const searchParam = searchParams.get('search') || '';
  const languageParam = searchParams.get('language') || 'all';
  const countryParam = searchParams.get('country') || 'all';
  const cityParam = searchParams.get('city') || '';

  const [selectedCategory, setSelectedCategory] = useState(categoryParam);
  const [selectedSubcategory, setSelectedSubcategory] = useState(subcategoryParam);
  const [searchQuery, setSearchQuery] = useState(searchParam);
  const [selectedLanguage, setSelectedLanguage] = useState(languageParam);
  const [selectedCountry, setSelectedCountry] = useState(countryParam);
  const [cityQuery, setCityQuery] = useState(cityParam);
  const [maxPrice, setMaxPrice] = useState<number>(Number(searchParams.get('maxPrice')) || 5.0);
  const [minRating, setMinRating] = useState<number>(Number(searchParams.get('rating')) || 0);
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
    setSelectedLanguage(searchParams.get('language') || 'all');
    setSelectedCountry(searchParams.get('country') || 'all');
    setCityQuery(searchParams.get('city') || '');
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
            language: selectedLanguage !== 'all' ? selectedLanguage : '',
            country: selectedCountry !== 'all' ? selectedCountry : '',
            city: cityQuery,
            maxPrice,
            rating: minRating > 0 ? minRating : '',
            verified: verifiedOnly ? 'true' : '',
            availableNow: availableNowOnly ? 'true' : ''
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
    selectedLanguage,
    selectedCountry,
    cityQuery,
    maxPrice,
    minRating,
    verifiedOnly,
    availableNowOnly
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
    setSelectedLanguage('all');
    setSelectedCountry('all');
    setCityQuery('');
    setMaxPrice(5.0);
    setMinRating(0);
    setVerifiedOnly(false);
    setAvailableNowOnly(false);
    setSearchParams({});
  };

  const activeFilterCount = [
    selectedCategory !== 'all',
    selectedSubcategory !== 'all',
    searchQuery !== '',
    selectedLanguage !== 'all',
    selectedCountry !== 'all',
    cityQuery !== '',
    minRating > 0,
    verifiedOnly,
    availableNowOnly,
    maxPrice < 5.0
  ].filter(Boolean).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-midnight tracking-tight">
            Worldwide Expert Discovery
          </h1>
          <p className="text-sm text-midnight/70 mt-1">
            Hire vetted domain experts across 40+ countries and global languages in real-time.
          </p>
        </div>

        {/* Mobile Filter Toggle Button */}
        <div className="lg:hidden flex items-center gap-2">
          <button
            onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
            className="flex-1 py-2.5 px-4 rounded-xl bg-white border border-timberwolf text-midnight text-xs font-bold flex items-center justify-center gap-2 shadow-subtle cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4 text-moonstone" />
            <span>Filters {activeFilterCount > 0 && `(${activeFilterCount})`}</span>
          </button>
          {activeFilterCount > 0 && (
            <button
              onClick={resetFilters}
              className="py-2.5 px-3 rounded-xl border border-timberwolf text-rose-600 text-xs font-semibold hover:bg-rose-50"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Top Search & Primary Category Navigation */}
      <div className="space-y-4 mb-8">
        
        {/* Search Input Bar */}
        <div className="relative max-w-3xl">
          <Search className="w-5 h-5 text-midnight/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by topic, skill, language (e.g. Hindi, Spanish), or location (e.g. India, Berlin)..."
            className="w-full pl-11 pr-4 py-3 bg-white border border-timberwolf rounded-2xl text-sm text-midnight placeholder:text-midnight/40 focus:outline-none focus:border-moonstone shadow-subtle"
          />
          {searchQuery && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-midnight/40 hover:text-midnight"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Horizontal Category Pill Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => handleCategorySelect('all')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
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
              className={`px-4 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
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
          <div className="flex items-center gap-2 overflow-x-auto pb-1 animate-fade-in">
            <span className="text-[11px] font-bold text-midnight/50 uppercase tracking-wider shrink-0 mr-1">
              Service Type:
            </span>
            <button
              onClick={() => handleSubcategorySelect('all')}
              className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer transition-all ${
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
                className={`px-3 py-1 rounded-lg text-xs whitespace-nowrap cursor-pointer transition-all ${
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
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* ========================================================================= */}
        {/* FILTERS SIDEBAR (Responsive drawer on mobile, sticky on desktop) */}
        {/* ========================================================================= */}
        <div className={`lg:col-span-1 space-y-6 bg-white p-5 sm:p-6 rounded-2xl border border-timberwolf/60 shadow-card h-fit ${
          mobileFiltersOpen ? 'block' : 'hidden lg:block'
        }`}>
          
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

          {/* 1. Language Filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-midnight flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-moonstone" />
              <span>Spoken Language</span>
            </label>
            <select
              value={selectedLanguage}
              onChange={(e) => handleLanguageSelect(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-timberwolf/70 text-xs font-medium text-midnight bg-aliceblue/30 focus:outline-none focus:border-moonstone"
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
              className="w-full p-2.5 rounded-xl border border-timberwolf/70 text-xs font-medium text-midnight bg-aliceblue/30 focus:outline-none focus:border-moonstone"
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
              className="w-full px-3 py-2 rounded-xl border border-timberwolf/70 text-xs font-medium text-midnight bg-aliceblue/30 focus:outline-none focus:border-moonstone"
            />
          </div>

          {/* 4. Max Price Per Minute Slider */}
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
              className="w-full accent-moonstone cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-midnight/50">
              <span>$0.50</span>
              <span>$5.00+</span>
            </div>
          </div>

          {/* 5. Minimum Rating */}
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
                  onClick={() => setMinRating(r.value)}
                  className={`py-1.5 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
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

          {/* 6. Toggles */}
          <div className="space-y-3 pt-2 border-t border-timberwolf/40">
            <label className="flex items-center justify-between text-xs font-medium text-midnight cursor-pointer">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-moonstone" /> Verified Experts Only
              </span>
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={(e) => setVerifiedOnly(e.target.checked)}
                className="w-4 h-4 accent-midnight rounded cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between text-xs font-medium text-midnight cursor-pointer">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-500" /> Available Now
              </span>
              <input
                type="checkbox"
                checked={availableNowOnly}
                onChange={(e) => setAvailableNowOnly(e.target.checked)}
                className="w-4 h-4 accent-midnight rounded cursor-pointer"
              />
            </label>
          </div>

        </div>

        {/* ========================================================================= */}
        {/* SERVICES RESULTS GRID */}
        {/* ========================================================================= */}
        <div className="lg:col-span-3">
          
          {/* Active Filter Summary Bar */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold text-midnight/70">
              Showing <strong className="text-midnight font-bold">{services.length}</strong> available experts
            </span>
            {activeFilterCount > 0 && (
              <span className="text-xs text-moonstone font-medium hidden sm:inline">
                Filtered by {activeFilterCount} active criteria
              </span>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white/60 border border-timberwolf/40 rounded-2xl p-6 h-64 animate-pulse" />
              ))}
            </div>
          ) : services.length === 0 ? (
            <div className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-12 text-center shadow-card space-y-4">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
