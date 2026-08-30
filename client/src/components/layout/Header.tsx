import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Clock, Menu, X, ChevronDown, UserCheck, Shield, PlusCircle, LogOut, LayoutDashboard } from 'lucide-react';
import { BrandLogo } from '../common/BrandLogo';

export const Header: React.FC = () => {
  const { user, logout, loading, authInitialized } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const getDashboardLink = () => {
    if (!user) return '/auth';
    if (user.role === 'admin') return '/admin';
    if (user.role === 'provider') return '/provider';
    return '/client';
  };

  const isCurrent = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-40 bg-aliceblue/95 backdrop-blur-sm border-b border-timberwolf/40 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-18">
          {/* Brand Logo */}
          <BrandLogo size="md" />

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
            <Link
              to="/services"
              className={`transition-colors hover:text-moonstone ${
                isCurrent('/services') ? 'text-moonstone font-semibold' : 'text-midnight/80'
              }`}
            >
              Services
            </Link>
            <Link
              to="/opportunities"
              className={`transition-colors hover:text-moonstone ${
                isCurrent('/opportunities') ? 'text-moonstone font-semibold' : 'text-midnight/80'
              }`}
            >
              Opportunities
            </Link>
            <Link
              to="/#how-it-works"
              onClick={(e) => {
                if (location.pathname === '/') {
                  e.preventDefault();
                  document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              className="text-midnight/80 hover:text-moonstone transition-colors"
            >
              How It Works
            </Link>
          </nav>

          {/* Desktop Right CTA */}
          <div className="hidden md:flex items-center gap-3">
            {!authInitialized || loading ? (
              <div className="w-28 h-8 rounded-lg bg-aliceblue/80 animate-pulse border border-timberwolf/40" />
            ) : user ? (
              <div className="relative">
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-2.5 py-1.5 px-3 rounded-lg border border-timberwolf/60 bg-white/70 hover:bg-white text-midnight text-sm font-medium transition-all shadow-subtle cursor-pointer"
                >
                  <img
                    src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.full_name}`}
                    alt={user.full_name}
                    className="w-7 h-7 rounded-full object-cover border border-lightblue"
                  />
                  <div className="text-left leading-tight hidden lg:block">
                    <span className="block font-semibold text-xs text-midnight">
                      {user.full_name.replace(/\s*\(Admin\)\s*/gi, '')}{user.role === 'admin' ? ' (Admin)' : ''}
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
                        {user.full_name.replace(/\s*\(Admin\)\s*/gi, '')}{user.role === 'admin' ? ' (Admin)' : ''}
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
                  to="/auth"
                  className="px-3.5 py-1.5 text-sm font-medium text-midnight hover:text-moonstone transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  to="/auth?tab=register"
                  className="btn-shine px-4 py-2 text-sm font-semibold rounded-lg bg-midnight text-aliceblue hover:bg-midnight-hover shadow-subtle transition-all cursor-pointer"
                >
                  Get Started
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
              className="p-2 rounded-lg text-midnight hover:bg-lightblue/40 transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-timberwolf/40 bg-aliceblue px-4 pt-3 pb-6 space-y-3 animate-fade-in">
          <Link
            to="/services"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-base font-medium text-midnight hover:text-moonstone"
          >
            Services
          </Link>
          <Link
            to="/opportunities"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-base font-medium text-midnight hover:text-moonstone"
          >
            Opportunities
          </Link>
          <Link
            to="/#how-it-works"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-base font-medium text-midnight hover:text-moonstone"
          >
            How It Works
          </Link>

          <div className="border-t border-timberwolf/40 pt-3 flex flex-col gap-2">
            {!authInitialized || loading ? (
              <div className="w-full h-10 rounded-lg bg-aliceblue/80 animate-pulse border border-timberwolf/40" />
            ) : user ? (
              <>
                <Link
                  to={getDashboardLink()}
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full text-center py-2.5 rounded-lg bg-midnight text-aliceblue font-medium text-sm"
                >
                  Go to {user.role === 'admin' ? 'Admin Panel' : user.role === 'provider' ? 'Provider Dashboard' : 'Client Dashboard'}
                </Link>
                <Link
                  to="/profile/edit"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full text-center py-2 rounded-lg border border-timberwolf bg-white text-midnight font-medium text-sm"
                >
                  Edit Profile
                </Link>
                <button
                  onClick={() => {
                    logout();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-center py-2 text-rose-600 font-medium text-sm cursor-pointer"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/auth"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full text-center py-2 text-midnight font-medium text-sm"
                >
                  Sign In
                </Link>
                <Link
                  to="/auth?tab=register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full text-center py-2.5 rounded-lg bg-midnight text-aliceblue font-semibold text-sm"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
