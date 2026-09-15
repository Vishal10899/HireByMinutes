import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { Mail, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { BrandLogo } from '../components/common/BrandLogo';
import { usePageSEO } from '../hooks/usePageSEO';

export const ForgotPasswordPage: React.FC = () => {
  usePageSEO({
    title: 'Forgot Password — HireByMinute',
    noindex: true,
    canonicalPath: '/forgot-password'
  });

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.forgotPassword(email.trim());
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Failed to submit password reset request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-aliceblue text-midnight selection:bg-lightblue selection:text-midnight">
      
      {/* Minimal Top Header */}
      <header className="sticky top-0 z-30 w-full bg-white/95 backdrop-blur-md border-b border-timberwolf/40 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <BrandLogo size="md" asLink={true} />
        <Link
          to="/login"
          className="text-xs font-bold text-midnight bg-aliceblue hover:bg-aliceblue-surface border border-timberwolf/70 hover:border-midnight px-3.5 py-1.5 rounded-lg transition-all shadow-subtle flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Sign In</span>
        </Link>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center py-10 sm:py-16 px-4 sm:px-6">
        <div className="w-full max-w-[460px] mx-auto">
          
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-timberwolf/70 p-6 sm:p-8 md:p-9 shadow-elevated">
            
            {/* Header text */}
            <div className="text-left mb-6">
              <h1 className="text-2xl sm:text-[26px] font-extrabold text-midnight tracking-tight">
                Reset your password
              </h1>
              <p className="text-xs sm:text-sm text-midnight/70 mt-1 leading-relaxed">
                Enter your registered email address and we will send you a secure password reset link.
              </p>
            </div>

            {submitted ? (
              <div className="text-center space-y-4 py-4 animate-fade-in">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center shadow-subtle">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-midnight">Check your inbox</h3>
                <p className="text-xs text-midnight/70 leading-relaxed max-w-sm mx-auto">
                  If an account is associated with <strong className="text-midnight">{email}</strong>, we have sent instructions to reset your password. The link will expire in 30 minutes.
                </p>
                <div className="pt-3">
                  <Link
                    to="/login"
                    className="btn-shine inline-flex items-center justify-center px-6 py-3 rounded-xl bg-midnight text-white text-xs font-bold hover:bg-midnight-hover transition-all shadow-subtle"
                  >
                    Back to Sign In
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                
                {error && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs p-3.5 rounded-xl flex items-start gap-2.5 animate-fade-in" role="alert">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <span className="leading-relaxed font-medium">{error}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="reset-email" className="block text-xs font-semibold text-midnight">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-midnight/40">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      id="reset-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="name@example.com"
                      className="w-full pl-10 pr-4 py-3 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight text-sm placeholder:text-midnight/35 transition-all focus:outline-none focus:ring-2 focus:border-moonstone focus:ring-moonstone/20 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-shine w-full py-3.5 px-4 rounded-xl bg-midnight text-white font-bold text-sm hover:bg-midnight-hover transition-all shadow-subtle cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Sending link...</span>
                      </>
                    ) : (
                      <span>Send Password Reset Link</span>
                    )}
                  </button>
                </div>

                <div className="text-center pt-3 border-t border-timberwolf/30">
                  <Link
                    to="/login"
                    className="text-xs text-midnight/70 hover:text-midnight font-medium inline-flex items-center gap-1.5 transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to Sign In</span>
                  </Link>
                </div>

              </form>
            )}

          </div>

        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="w-full border-t border-timberwolf/30 bg-aliceblue/80 py-4 px-4 sm:px-8 mt-auto">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs text-midnight/60">
          <div>
            © {new Date().getFullYear()} HireByMinute. All rights reserved.
          </div>
          <div className="flex items-center gap-4 text-xs">
            <Link to="/terms" className="hover:text-midnight transition-colors">Terms of Service</Link>
            <span className="text-timberwolf/60">•</span>
            <Link to="/privacy" className="hover:text-midnight transition-colors">Privacy Policy</Link>
            <span className="text-timberwolf/60">•</span>
            <Link to="/contact" className="hover:text-midnight transition-colors">Contact</Link>
          </div>
        </div>
      </footer>

    </div>
  );
};

export default ForgotPasswordPage;
