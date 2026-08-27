import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { Lock, Eye, EyeOff, Check, X, CheckCircle2, AlertCircle } from 'lucide-react';
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
      setError('Invalid password reset link. Please request a new one.');
      return;
    }
    if (!passwordCriteria.isValid) {
      setError('Password must be at least 8 characters long and contain both letters and numbers.');
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
      setTimeout(() => navigate('/auth'), 3000);
    } catch (err: any) {
      setError(err.message || 'Password reset failed. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      
      {/* Brand Header */}
      <div className="text-center space-y-3 mb-8 flex flex-col items-center">
        <BrandLogo size="lg" showText={false} asLink={true} />
        <h1 className="text-2xl font-extrabold text-midnight">
          Create New Password
        </h1>
        <p className="text-xs text-midnight/70 max-w-xs leading-relaxed">
          Choose a secure password for your HireByMinutes account.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 sm:p-8 shadow-card space-y-6">
        
        {success ? (
          <div className="text-center space-y-4 py-2 animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-midnight">Password reset successful!</h3>
            <p className="text-xs text-midnight/70 leading-relaxed">
              Your new password has been applied. Redirecting you to sign in...
            </p>
            <div className="pt-2">
              <Link
                to="/auth"
                className="px-5 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover transition-colors inline-block"
              >
                Sign In Now
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs p-3 rounded-xl flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {!token && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs p-3 rounded-xl">
                No reset token detected in link. Please use the exact link sent to your email.
              </div>
            )}

            {/* New Password */}
            <div className="space-y-1.5">
              <label className="font-semibold text-midnight block">New Password *</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters (letters & numbers)"
                  className="w-full pl-9 pr-10 py-2.5 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight focus:outline-none focus:border-moonstone font-sans"
                />
                <Lock className="w-4 h-4 text-midnight/40 absolute left-3 top-3 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-midnight/40 hover:text-midnight transition-colors cursor-pointer p-0.5"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {password && (
                <div className="pt-1 space-y-1">
                  <div className="flex gap-1 h-1">
                    <div className={`flex-1 rounded-full ${password.length >= 8 ? 'bg-amber-500' : 'bg-rose-400'}`} />
                    <div className={`flex-1 rounded-full ${passwordCriteria.isValid ? 'bg-emerald-500' : 'bg-timberwolf/50'}`} />
                    <div className={`flex-1 rounded-full ${passwordCriteria.strength === 'strong' ? 'bg-emerald-600' : 'bg-timberwolf/50'}`} />
                  </div>
                  <div className="flex justify-between text-[10px] text-midnight/60">
                    <span>Min 8 chars, 1 letter, 1 number</span>
                    <span className="font-semibold capitalize text-midnight/80">{passwordCriteria.strength}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <label className="font-semibold text-midnight block">Confirm New Password *</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your new password"
                  className="w-full pl-9 pr-10 py-2.5 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight focus:outline-none focus:border-moonstone font-sans"
                />
                <Lock className="w-4 h-4 text-midnight/40 absolute left-3 top-3 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-2.5 text-midnight/40 hover:text-midnight transition-colors cursor-pointer p-0.5"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {confirmPassword && (
                <div className="flex items-center gap-1 text-[11px] pt-0.5">
                  {passwordsMatch ? (
                    <span className="text-emerald-700 font-medium flex items-center gap-1">
                      <Check className="w-3 h-3 text-emerald-600" /> Passwords match
                    </span>
                  ) : (
                    <span className="text-rose-600 font-medium flex items-center gap-1">
                      <X className="w-3 h-3 text-rose-500" /> Passwords do not match
                    </span>
                  )}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !passwordCriteria.isValid || passwordsMatch === false || !token}
              className="btn-shine w-full py-3 rounded-xl bg-midnight text-aliceblue font-bold text-xs hover:bg-midnight-hover transition-all shadow-subtle cursor-pointer disabled:opacity-50 mt-2"
            >
              {loading ? 'Updating password...' : 'Update Password & Sign In'}
            </button>

          </form>
        )}

      </div>

    </div>
  );
};
export default ResetPasswordPage;
