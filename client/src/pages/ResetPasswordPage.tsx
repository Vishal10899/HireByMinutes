import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { Lock, Eye, EyeOff, Check, AlertCircle, CheckCircle2, ArrowLeft, ArrowRight } from 'lucide-react';
import { BrandLogo } from '../components/common/BrandLogo';

export const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordCriteria = useMemo(() => {
    const minLength = password.length >= 8;
    const hasLetter = /[A-Za-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecialOrUpper = /[^A-Za-z0-9]/.test(password) || /[A-Z]/.test(password);

    let strength: 'empty' | 'weak' | 'good' | 'strong' = 'empty';
    if (!password) {
      strength = 'empty';
    } else if (minLength && hasLetter && hasNumber && hasSpecialOrUpper) {
      strength = 'strong';
    } else if (minLength && hasLetter && hasNumber) {
      strength = 'good';
    } else {
      strength = 'weak';
    }

    return {
      minLength,
      hasLetter,
      hasNumber,
      hasSpecialOrUpper,
      isValid: minLength && hasLetter && hasNumber,
      strength
    };
  }, [password]);

  const passwordsMatch = useMemo(() => {
    if (!confirmPassword) return null;
    return password === confirmPassword;
  }, [password, confirmPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError('Invalid or expired password reset link. Please request a new one.');
      return;
    }
    if (!passwordCriteria.isValid) {
      setError('Password must contain at least 8 characters with letters and numbers.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.resetPassword({
        email,
        token,
        new_password: password
      });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err: any) {
      setError(err.message || 'Password reset failed. The link may have expired.');
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
                Create New Password
              </h1>
              <p className="text-xs sm:text-sm text-midnight/70 mt-1 leading-relaxed">
                Choose a strong, secure password for your HireByMinute account.
              </p>
            </div>

            {success ? (
              <div className="text-center space-y-4 py-4 animate-fade-in">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center shadow-subtle">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-midnight">Password reset successful!</h3>
                <p className="text-xs text-midnight/70 leading-relaxed max-w-sm mx-auto">
                  Your new password has been applied. Redirecting you to sign in...
                </p>
                <div className="pt-3">
                  <Link
                    to="/login"
                    className="btn-shine inline-flex items-center justify-center px-6 py-3 rounded-xl bg-midnight text-white text-xs font-bold hover:bg-midnight-hover transition-all shadow-subtle"
                  >
                    Sign In Now
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

                {/* Password Input */}
                <div className="space-y-1.5">
                  <label htmlFor="reset-new-password" className="block text-xs font-semibold text-midnight">
                    New Password <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-midnight/40">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      id="reset-new-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="Create a strong password"
                      className="w-full pl-10 pr-11 py-3 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight text-sm placeholder:text-midnight/35 transition-all focus:outline-none focus:ring-2 focus:border-moonstone focus:ring-moonstone/20 focus:bg-white font-sans"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-midnight/40 hover:text-midnight transition-colors p-1 cursor-pointer focus:outline-none"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Password requirement & strength meter */}
                  <p className="text-[11px] text-midnight/60 pt-0.5">
                    At least 8 characters with letters and numbers.
                  </p>

                  {password && (
                    <div className="pt-1 space-y-1.5 animate-fade-in">
                      <div className="flex gap-1.5 h-1.5">
                        <div className={`flex-1 rounded-full transition-colors ${
                          password.length >= 8 ? 'bg-emerald-500' : 'bg-rose-400'
                        }`} />
                        <div className={`flex-1 rounded-full transition-colors ${
                          passwordCriteria.isValid ? 'bg-emerald-500' : 'bg-timberwolf/50'
                        }`} />
                        <div className={`flex-1 rounded-full transition-colors ${
                          passwordCriteria.strength === 'strong' ? 'bg-emerald-600' : 'bg-timberwolf/50'
                        }`} />
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-2.5">
                          <span className={`inline-flex items-center gap-1 ${password.length >= 8 ? 'text-emerald-700 font-semibold' : 'text-midnight/45'}`}>
                            <Check className={`w-3 h-3 ${password.length >= 8 ? 'text-emerald-600' : 'text-midnight/30'}`} /> 8+ chars
                          </span>
                          <span className={`inline-flex items-center gap-1 ${passwordCriteria.hasLetter ? 'text-emerald-700 font-semibold' : 'text-midnight/45'}`}>
                            <Check className={`w-3 h-3 ${passwordCriteria.hasLetter ? 'text-emerald-600' : 'text-midnight/30'}`} /> Letters
                          </span>
                          <span className={`inline-flex items-center gap-1 ${passwordCriteria.hasNumber ? 'text-emerald-700 font-semibold' : 'text-midnight/45'}`}>
                            <Check className={`w-3 h-3 ${passwordCriteria.hasNumber ? 'text-emerald-600' : 'text-midnight/30'}`} /> Numbers
                          </span>
                        </div>
                        <span className={`font-semibold capitalize text-xs ${
                          passwordCriteria.strength === 'strong'
                            ? 'text-emerald-700'
                            : passwordCriteria.strength === 'good'
                            ? 'text-moonstone-dark'
                            : 'text-amber-600'
                        }`}>
                          {passwordCriteria.strength}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm Password Input */}
                <div className="space-y-1.5">
                  <label htmlFor="reset-confirm-password" className="block text-xs font-semibold text-midnight">
                    Confirm Password <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-midnight/40">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      id="reset-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="Re-enter your password"
                      className="w-full pl-10 pr-11 py-3 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight text-sm placeholder:text-midnight/35 transition-all focus:outline-none focus:ring-2 focus:border-moonstone focus:ring-moonstone/20 focus:bg-white font-sans"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-midnight/40 hover:text-midnight transition-colors p-1 cursor-pointer focus:outline-none"
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {confirmPassword && (
                    <div className="flex items-center gap-1.5 text-xs pt-0.5 animate-fade-in">
                      {passwordsMatch ? (
                        <span className="text-emerald-700 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Passwords match
                        </span>
                      ) : (
                        <span className="text-rose-600 font-medium flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-500" /> Passwords do not match
                        </span>
                      )}
                    </div>
                  )}
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
                        <span>Updating password...</span>
                      </>
                    ) : (
                      <>
                        <span>Reset Password</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
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

export default ResetPasswordPage;
