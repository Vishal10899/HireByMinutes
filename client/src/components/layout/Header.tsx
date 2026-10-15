import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSiteSettings, NavItem } from '../../context/SiteSettingsContext';
import { Menu, X, ChevronDown, UserCheck, PlusCircle, LogOut, LayoutDashboard, Briefcase, Clock, Sparkles } from 'lucide-react';
import { BrandLogo } from '../common/BrandLogo';

export const Header: React.FC = () => {
  const { user, logout, loading, authInitialized } = useAuth();
  const { siteName, logoUrl, navItems, ctaLabel, ctaUrl } = useSiteSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [exploreDropdownOpen, setExploreDropdownOpen] = useState(false);
  const exploreRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click or escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exploreRef.current && !exploreRef.current.contains(e.target as Node)) {
        setExploreDropdownOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExploreDropdownOpen(false);
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const getDashboardLink = () => {
    if (!user) return '/auth';
    if (user.role === 'admin') return '/admin';
    if (user.role === 'provider') return '/provider';
    return '/client';
  };

  const isCurrent = (path: string) => {
    if (path.startsWith('/#') || path.startsWith('#')) {
      const hash = path.replace(/^\/?#/, '');
      return location.pathname === '/' && location.hash === `#${hash}`;
    }
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  // Complete navigation items: Services, Projects, Opportunities, Jobs, How It Works, Blog
  const visibleNavItems = useMemo(() => {
    let items = [...navItems].filter((item) => item.is_visible !== false);

    const ensureItem = (id: string, label: string, url: string, defaultOrder: number) => {
      const exists = items.some(
        (it) => it.id === id || it.url === url || it.label?.trim().toLowerCase() === label.toLowerCase()
      );
      if (!exists) {
        items.push({
          id,
          label,
          url,
          order: defaultOrder,
          is_visible: true,
          is_external: false
        });
      }
    };

    ensureItem('services', 'Services', '/services', 1);
    ensureItem('projects', 'Projects', '/projects', 2);
    ensureItem('opportunities', 'Opportunities', '/opportunities', 3);
    ensureItem('jobs', 'Jobs', '/jobs', 4);
    ensureItem('how-it-works', 'How It Works', '/how-it-works', 5);
    ensureItem('blog', 'Blog', '/blog', 6);

    return items.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  }, [navItems]);

  const renderNavLink = (item: NavItem, isMobile = false) => {
    const isHash = item.url.startsWith('/#') || item.url.startsWith('#');
    const isExternal = item.is_external || item.url.startsWith('http://') || item.url.startsWith('https://');

    const baseClasses = isMobile
      ? `flex items-center min-h-[44px] px-3 rounded-xl text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moonstone ${
          isCurrent(item.url)
            ? 'text-moonstone font-semibold bg-lightblue/30'
            : 'text-midnight hover:bg-lightblue/30 hover:text-moonstone'
        }`
      : `transition-colors hover:text-moonstone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moonstone focus-visible:ring-offset-2 rounded-md py-0.5 px-1 ${
          isCurrent(item.url) ? 'text-moonstone font-semibold' : 'text-midnight/80'
        }`;

    if (isExternal) {
      return (
        <a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => isMobile && setMobileMenuOpen(false)}
          className={baseClasses}
        >
          {item.label}
        </a>
      );
    }

    if (isHash) {
      const hashTarget = item.url.replace(/^\/?#/, '');
      return (
        <Link
          key={item.id}
          to={item.url}
          onClick={(e) => {
            if (isMobile) setMobileMenuOpen(false);
            if (location.pathname === '/' || location.pathname === '') {
              e.preventDefault();
              document.getElementById(hashTarget)?.scrollIntoView({ behavior: 'smooth' });
            }
          }}
          className={baseClasses}
        >
          {item.label}
        </Link>
      );
    }

    return (
      <Link
        key={item.id}
        to={item.url}
        onClick={() => isMobile && setMobileMenuOpen(false)}
        className={baseClasses}
      >
        {item.label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-40 bg-[#FAF8F5]/95 backdrop-blur-md border-b border-[#E7E2DA] transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-18">
          {/* Brand Logo */}
          <BrandLogo size="md" customSiteName={siteName} customLogoUrl={logoUrl} />

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-5 lg:gap-6 xl:gap-7 text-sm font-medium">
            {/* 1. Core Primary Destinations: Services & Projects */}
            {renderNavLink({ id: 'services', label: 'Services', url: '/services', order: 1, is_visible: true })}
            {renderNavLink({ id: 'projects', label: 'Projects', url: '/projects', order: 2, is_visible: true })}

            {/* 2. On wide screens (lg+), show Opportunities & Jobs directly */}
            <div className="hidden lg:flex items-center gap-5 lg:gap-6 xl:gap-7">
              {renderNavLink({ id: 'opportunities', label: 'Opportunities', url: '/opportunities', order: 3, is_visible: true })}
              {renderNavLink({ id: 'jobs', label: 'Jobs', url: '/jobs', order: 4, is_visible: true })}
            </div>

            {/* 3. On medium screens (768px-1023px, md:flex lg:hidden) where space is limited, provide accessible Explore dropdown */}
            <div className="relative lg:hidden" ref={exploreRef}>
              <button
                type="button"
                onClick={() => setExploreDropdownOpen(!exploreDropdownOpen)}
                aria-haspopup="true"
                aria-expanded={exploreDropdownOpen}
                className={`flex items-center gap-1 transition-colors hover:text-moonstone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moonstone rounded-md py-0.5 px-1 cursor-pointer ${
                  isCurrent('/opportunities') || isCurrent('/jobs')
                    ? 'text-moonstone font-semibold'
                    : 'text-midnight/80'
                }`}
              >
                <span>Explore</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${exploreDropdownOpen ? 'rotate-180 text-moonstone' : 'text-midnight/60'}`} />
              </button>

              {exploreDropdownOpen && (
                <div className="absolute left-0 mt-2 w-56 rounded-xl bg-white border border-timberwolf/60 shadow-elevated py-2 text-sm z-50 animate-fade-in">
                  <Link
                    to="/opportunities"
                    onClick={() => setExploreDropdownOpen(false)}
                    className={`flex items-center gap-2.5 px-4 py-2 hover:bg-aliceblue transition-colors ${
                      isCurrent('/opportunities') ? 'text-moonstone font-bold bg-aliceblue/60' : 'text-midnight'
                    }`}
                  >
                    <Clock className="w-4 h-4 text-moonstone shrink-0" />
                    <div>
                      <div className="font-semibold text-xs text-midnight">Opportunities</div>
                      <div className="text-[10px] text-midnight/60">Consultation requests</div>
                    </div>
                  </Link>

                  <Link
                    to="/jobs"
                    onClick={() => setExploreDropdownOpen(false)}
                    className={`flex items-center gap-2.5 px-4 py-2 hover:bg-aliceblue transition-colors ${
                      isCurrent('/jobs') ? 'text-moonstone font-bold bg-aliceblue/60' : 'text-midnight'
                    }`}
                  >
                    <Briefcase className="w-4 h-4 text-moonstone shrink-0" />
                    <div>
                      <div className="font-semibold text-xs text-midnight">Jobs & Careers</div>
                      <div className="text-[10px] text-midnight/60">Full-time openings</div>
                    </div>
                  </Link>
                </div>
              )}
            </div>

            {/* 4. How It Works & Blog */}
            {renderNavLink({ id: 'how-it-works', label: 'How It Works', url: '/how-it-works', order: 5, is_visible: true })}
            {renderNavLink({ id: 'blog', label: 'Blog', url: '/blog', order: 6, is_visible: true })}

            {/* 5. Custom CMS Navigation Items (if configured) */}
            {visibleNavItems
              .filter(
                (item) =>
                  !['services', 'projects', 'opportunities', 'jobs', 'how-it-works', 'blog'].includes(
                    item.id.toLowerCase()
                  ) &&
                  !['/services', '/projects', '/opportunities', '/jobs', '/how-it-works', '/blog'].includes(
                    item.url.toLowerCase()
                  )
              )
              .map((item) => renderNavLink(item, false))}
          </nav>

          {/* Desktop Right CTA */}
          <div className="hidden md:flex items-center gap-3">
            {!authInitialized || loading ? (
              <div className="w-40 sm:w-44 h-9 rounded-lg bg-aliceblue/80 animate-pulse border border-timberwolf/40" />
            ) : user ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-2.5 py-1.5 px-3 rounded-lg border border-timberwolf/60 bg-white/70 hover:bg-white text-midnight text-sm font-medium transition-all shadow-subtle cursor-pointer"
                >
                  <img
                    src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.full_name || user.username || user.email || 'User')}`}
                    alt={user.full_name || user.username || 'User'}
                    className="w-7 h-7 rounded-full object-cover border border-lightblue"
                  />
                  <div className="text-left leading-tight hidden lg:block">
                    <span className="block font-semibold text-xs text-midnight">
                      {(user.full_name || user.username || user.email || 'User').replace(/\s*\(Admin\)\s*/gi, '')}{user.role === 'admin' ? ' (Admin)' : ''}
                    </span>
                    <span className="block text-[11px] text-moonstone-dark font-medium capitalize">{user.role}</span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-midnight/50" />
                </button>

                {userDropdownOpen && (
                  <div 
                    className="absolute right-0 mt-2 w-56 rounded-xl bg-white border border-timberwolf/40 shadow-card py-2 text-sm z-50 animate-fade-in"
                    onMouseLeave={() => setUserDropdownOpen(false)}
                  >
                    <div className="px-4 py-2 border-b border-timberwolf/30 mb-1">
                      <p className="font-semibold text-midnight text-xs">
                        {(user.full_name || user.username || user.email || 'User').replace(/\s*\(Admin\)\s*/gi, '')}{user.role === 'admin' ? ' (Admin)' : ''}
                      </p>
                      <p className="text-midnight/60 text-[11px] truncate">{user.email}</p>
                    </div>

                    <Link
                      to={getDashboardLink()}
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-midnight hover:bg-aliceblue transition-colors"
                    >
                      <LayoutDashboard className="w-4 h-4 text-moonstone" />
                      <span>{user.role === 'admin' ? 'Admin Panel' : user.role === 'provider' ? 'Provider Dashboard' : 'Client Dashboard'}</span>
                    </Link>

                    <Link
                      to="/profile/edit"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-midnight hover:bg-aliceblue transition-colors"
                    >
                      <UserCheck className="w-4 h-4 text-moonstone" />
                      <span>Edit Profile</span>
                    </Link>

                    {user.role === 'provider' && (
                      <Link
                        to="/provider/new-service"
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-midnight hover:bg-aliceblue transition-colors"
                      >
                        <PlusCircle className="w-4 h-4 text-moonstone" />
                        <span>Add New Service</span>
                      </Link>
                    )}

                    {user.role === 'client' && (
                      <Link
                        to="/projects/new"
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-midnight hover:bg-aliceblue transition-colors"
                      >
                        <PlusCircle className="w-4 h-4 text-moonstone" />
                        <span>Post a Project</span>
                      </Link>
                    )}

                    <Link
                      to="/projects"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-midnight hover:bg-aliceblue transition-colors"
                    >
                      <Briefcase className="w-4 h-4 text-moonstone" />
                      <span>Project Marketplace</span>
                    </Link>


                    <div className="border-t border-timberwolf/30 mt-1 pt-1">
                      <button
                        onClick={() => {
                          logout();
                          setUserDropdownOpen(false);
                          navigate('/');
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-rose-600 hover:bg-rose-50 text-left text-xs cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <Link
                  to="/login"
                  className="px-3.5 py-1.5 text-sm font-medium text-midnight hover:text-moonstone transition-colors"
                >
                  Login
                </Link>
                <Link
                  to={ctaUrl || '/signup'}
                  className="btn-shine px-4 py-2 text-sm font-semibold rounded-lg bg-midnight text-aliceblue hover:bg-midnight-hover shadow-subtle transition-all cursor-pointer"
                >
                  {ctaLabel && ctaLabel !== 'Get Started' ? ctaLabel : 'Sign In / Join'}
                </Link>
              </div>
            )}

            {/* Quick Action Button */}
            {user?.role === 'provider' ? (
              <Link
                to="/provider"
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-midnight text-aliceblue hover:bg-midnight-hover shadow-subtle transition-all"
              >
                Provider Hub
              </Link>
            ) : user?.role === 'client' ? (
              <Link
                to="/provider/onboard"
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-midnight text-midnight hover:bg-midnight hover:text-aliceblue transition-all"
              >
                Provide a Service
              </Link>
            ) : null}
          </div>

          {/* Mobile menu toggle */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-midnight hover:bg-lightblue/40 active:scale-95 transition-all cursor-pointer"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[#E7E2DA] bg-[#FAF8F5] px-4 pt-3 pb-6 space-y-2 animate-fade-in">
          {visibleNavItems.map((item) => renderNavLink(item, true))}

          <div className="border-t border-[#E7E2DA] pt-3 flex flex-col gap-2.5">
            {!authInitialized || loading ? (
              <div className="w-full h-11 rounded-xl bg-aliceblue/80 animate-pulse border border-timberwolf/40" />
            ) : user ? (
              <>
                <Link
                  to={getDashboardLink()}
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full min-h-[48px] flex items-center justify-center text-center py-2.5 rounded-xl bg-midnight text-aliceblue font-medium text-sm hover:bg-midnight-hover transition-colors"
                >
                  Go to {user.role === 'admin' ? 'Admin Panel' : user.role === 'provider' ? 'Provider Dashboard' : 'Client Dashboard'}
                </Link>
                <Link
                  to="/profile/edit"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full min-h-[44px] flex items-center justify-center text-center py-2 rounded-xl border border-timberwolf bg-white text-midnight font-medium text-sm hover:bg-aliceblue transition-colors"
                >
                  Edit Profile
                </Link>
                <button
                  onClick={() => {
                    logout();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full min-h-[44px] flex items-center justify-center text-center py-2 text-rose-600 font-medium text-sm cursor-pointer hover:bg-rose-50 rounded-xl transition-colors"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full min-h-[44px] flex items-center justify-center text-center py-2 text-midnight font-medium text-sm rounded-xl hover:bg-lightblue/30 transition-colors"
                >
                  Login
                </Link>
                <Link
                  to={ctaUrl || '/signup'}
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full min-h-[48px] flex items-center justify-center text-center py-2.5 rounded-xl bg-midnight text-aliceblue font-semibold text-sm hover:bg-midnight-hover shadow-subtle transition-colors"
                >
                  {ctaLabel && ctaLabel !== 'Get Started' ? ctaLabel : 'Sign In / Join'}
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
