import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Shield,
  Lock,
  Mail,
  User as UserIcon,
  Check,
  X,
  Camera,
  RotateCcw,
  ArrowRight,
  Edit3
} from 'lucide-react';
import { BrandLogo } from '../components/common/BrandLogo';
import confetti from 'canvas-confetti';

export const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, login, register, updateUser } = useAuth();

  const initialTab = searchParams.get('tab') === 'register' ? 'register' : 'login';
  const [tab, setTab] = useState<'login' | 'register' | 'verify_otp'>(initialTab);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'client' | 'provider'>('client');
  const [headline, setHeadline] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Password UI states
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // OTP Verification States
  const [verificationEmail, setVerificationEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState('');
  const otpInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Auto-redirect if user is already authenticated
  useEffect(() => {
    if (user) {
      const redirectParam = searchParams.get('redirect');
      if (redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('/auth')) {
        navigate(redirectParam, { replace: true });
      } else if (user.role === 'admin') {
        navigate('/admin', { replace: true });
      } else if (user.role === 'provider') {
        navigate('/provider', { replace: true });
      } else {
        navigate('/services', { replace: true });
      }
    }
  }, [user, searchParams, navigate]);

  // Countdown timer for resend code
  useEffect(() => {
    let timer: any = null;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [resendCooldown]);

  // Password strength computation
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

  // Mask email for display (e.g. j***e@domain.com)
  const maskedEmail = useMemo(() => {
    if (!verificationEmail) return '';
    const [name, domain] = verificationEmail.split('@');
    if (!domain) return verificationEmail;
    const visible = name.slice(0, 1);
    return `${visible}***@${domain}`;
  }, [verificationEmail]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const loggedInUser = await login(email.trim(), password);
      const redirectParam = searchParams.get('redirect');
      if (redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('/auth')) {
        navigate(redirectParam, { replace: true });
      } else if (loggedInUser.role === 'admin') {
        navigate('/admin', { replace: true });
      } else if (loggedInUser.role === 'provider') {
        navigate('/provider', { replace: true });
      } else {
        navigate('/services', { replace: true });
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your email and password.');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('Profile photo must be smaller than 5MB.');
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      setError('Only JPG, PNG, and WEBP image formats are supported.');
      return;
    }

    setUploadingAvatar(true);
    setError(null);
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
      setError(err.message || 'Photo upload failed.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemovePhoto = () => {
    setAvatarUrl('');
    setAvatarPreview('');
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }

    if (!email.trim()) {
      setError('Please enter a valid email address.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }

    if (!passwordCriteria.isValid) {
      setError('Password must be at least 8 characters long and contain both letters and numbers.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter your confirm password.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.register({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        role,
        avatar_url: avatarUrl || undefined,
        headline: headline.trim()
      });

      if (res.token) {
        localStorage.setItem('hbm_token', res.token);
      }
      if (res.user) {
        updateUser(res.user);
      }

      // Transition to OTP verification screen
      setVerificationEmail(email.trim());
      setResendCooldown(60);
      setTab('verify_otp');
      setSuccessMessage('We sent a 6-digit verification code to your email.');
    } catch (err: any) {
      setError(err.message || 'Registration failed. An account with this email may already exist.');
    } finally {
      setLoading(false);
    }
  };

  // OTP Digits Handling
  const handleOtpChange = (index: number, val: string) => {
    const cleanVal = val.replace(/\D/g, '').slice(-1);
    const nextDigits = [...otpDigits];
    nextDigits[index] = cleanVal;
    setOtpDigits(nextDigits);

    // Auto-advance to next input
    if (cleanVal && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const nextDigits = [...otpDigits];
    for (let i = 0; i < pasted.length; i++) {
      nextDigits[i] = pasted[i];
    }
    setOtpDigits(nextDigits);
    const focusIndex = Math.min(pasted.length, 5);
    otpInputsRef.current[focusIndex]?.focus();
  };

  const handleVerifyOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otpDigits.join('');
    if (code.length !== 6) {
      setError('Please enter the full 6-digit code.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await api.verifyEmailOtp(verificationEmail, code);
      if (res.user) {
        updateUser(res.user);
      }
      confetti({ particleCount: 70, spread: 60 });
      setSuccessMessage('Email verified successfully! Redirecting...');
      setTimeout(() => {
        if (role === 'provider') {
          navigate('/provider');
        } else {
          navigate('/services');
        }
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Invalid verification code. Please check and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await api.resendVerificationOtp(verificationEmail);
      setResendCooldown(60);
      setSuccessMessage('A fresh 6-digit code has been sent to your email.');
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmailInput.trim()) return;

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await api.changeUnverifiedEmail(verificationEmail, newEmailInput.trim());
      setVerificationEmail(res.new_email || newEmailInput.trim());
      setIsChangingEmail(false);
      setResendCooldown(60);
      setOtpDigits(['', '', '', '', '', '']);
      setSuccessMessage('Email address updated. A new code was dispatched.');
    } catch (err: any) {
      setError(err.message || 'Failed to update email address.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12 sm:py-16">
      
      {/* Brand Header */}
      <div className="text-center space-y-3 mb-8 flex flex-col items-center">
        <BrandLogo size="lg" showText={false} asLink={true} />
        <h1 className="text-2xl font-extrabold text-midnight">
          {tab === 'verify_otp'
            ? 'Verify your email'
            : tab === 'login'
            ? 'Sign in to HireByMinutes'
            : 'Create your account'}
        </h1>
        <p className="text-xs text-midnight/70 max-w-xs leading-relaxed">
          {tab === 'verify_otp'
            ? `Enter the 6-digit verification code sent to ${maskedEmail || 'your email'}.`
            : 'Need help? Hire an expert for minutes. Have expertise? Sell your time.'}
        </p>
      </div>

      {/* Auth Card */}
      <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 sm:p-8 shadow-card space-y-6">
        
        {/* Tab Toggle (Hidden during OTP verification) */}
        {tab !== 'verify_otp' && (
          <div className="flex bg-aliceblue p-1 rounded-xl border border-timberwolf/40">
            <button
              type="button"
              onClick={() => { setTab('login'); setError(null); setSuccessMessage(null); }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                tab === 'login' ? 'bg-midnight text-aliceblue shadow-subtle' : 'text-midnight/70 hover:text-midnight'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setTab('register'); setError(null); setSuccessMessage(null); }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                tab === 'register' ? 'bg-midnight text-aliceblue shadow-subtle' : 'text-midnight/70 hover:text-midnight'
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        {/* Inline Alerts */}
        {successMessage && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3 rounded-xl flex items-start gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{successMessage}</span>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs p-3 rounded-xl flex items-start gap-2 animate-fade-in">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 1. OTP VERIFICATION SCREEN */}
        {/* ========================================================================= */}
        {tab === 'verify_otp' && (
          <div className="space-y-6">
            {!isChangingEmail ? (
              <form onSubmit={handleVerifyOtpSubmit} className="space-y-6">
                
                {/* 6 Digit Input Boxes */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-midnight block text-center">
                    Enter 6-Digit Code
                  </label>
                  <div className="flex justify-center gap-2 sm:gap-3" onPaste={handleOtpPaste}>
                    {otpDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => { otpInputsRef.current[idx] = el; }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(idx, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                        className="w-11 h-12 sm:w-12 sm:h-14 text-center text-lg sm:text-xl font-mono font-extrabold bg-aliceblue/40 border border-timberwolf/70 rounded-xl text-midnight focus:outline-none focus:border-moonstone focus:bg-white shadow-subtle transition-all"
                      />
                    ))}
                  </div>
                  <span className="text-[11px] text-midnight/50 block text-center pt-1">
                    Code expires in 10 minutes.
                  </span>
                </div>

                {/* Submit Verification */}
                <button
                  type="submit"
                  disabled={loading || otpDigits.join('').length !== 6}
                  className="btn-shine w-full py-3 rounded-xl bg-midnight text-aliceblue font-bold text-xs hover:bg-midnight-hover transition-all shadow-subtle cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Verify Email Address'}
                </button>

                {/* Resend & Change Email Actions */}
                <div className="pt-3 border-t border-timberwolf/40 flex flex-col items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resendCooldown > 0 || loading}
                    className={`font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                      resendCooldown > 0 ? 'text-midnight/40 cursor-not-allowed' : 'text-moonstone hover:text-moonstone-dark'
                    }`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>
                      {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setIsChangingEmail(true); setNewEmailInput(verificationEmail); }}
                    className="text-midnight/60 hover:text-midnight font-medium text-[11px] flex items-center gap-1 mt-1 cursor-pointer"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Entered wrong email? Change email</span>
                  </button>
                </div>

              </form>
            ) : (
              /* Change Email Form */
              <form onSubmit={handleChangeEmailSubmit} className="space-y-4 text-xs animate-fade-in">
                <div className="space-y-1.5">
                  <label className="font-semibold text-midnight block">Update Email Address</label>
                  <input
                    type="email"
                    required
                    value={newEmailInput}
                    onChange={(e) => setNewEmailInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight focus:outline-none focus:border-moonstone"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsChangingEmail(false)}
                    className="flex-1 py-2.5 rounded-xl border border-timberwolf text-midnight/70 font-semibold hover:bg-aliceblue"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-xl bg-midnight text-aliceblue font-bold hover:bg-midnight-hover shadow-subtle"
                  >
                    {loading ? 'Updating...' : 'Save & Send Code'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* 2. LOGIN FORM */}
        {/* ========================================================================= */}
        {tab === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
            
            {/* Email Address */}
            <div className="space-y-1.5">
              <label className="font-semibold text-midnight block">Email Address *</label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-9 pr-3 py-2.5 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight focus:outline-none focus:border-moonstone"
                />
                <Mail className="w-4 h-4 text-midnight/40 absolute left-3 top-3 pointer-events-none" />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-midnight block">Password *</label>
                <Link
                  to="/forgot-password"
                  className="text-[11px] text-moonstone hover:text-moonstone-dark font-medium"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your account password"
                  className="w-full pl-9 pr-10 py-2.5 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight focus:outline-none focus:border-moonstone font-sans"
                />
                <Lock className="w-4 h-4 text-midnight/40 absolute left-3 top-3 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-midnight/40 hover:text-midnight transition-colors cursor-pointer p-0.5"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="btn-shine w-full py-3 rounded-xl bg-midnight text-aliceblue font-bold text-xs hover:bg-midnight-hover transition-all shadow-subtle cursor-pointer disabled:opacity-50 mt-2"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        )}

        {/* ========================================================================= */}
        {/* 3. REGISTER FORM */}
        {/* ========================================================================= */}
        {tab === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-4 text-xs">
            
            {/* Account Type Selector */}
            <div className="space-y-1.5">
              <label className="font-semibold text-midnight block">I want to...</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRole('client')}
                  className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    role === 'client'
                      ? 'bg-aliceblue border-midnight text-midnight font-bold shadow-subtle'
                      : 'border-timberwolf/70 text-midnight/70 hover:border-moonstone'
                  }`}
                >
                  <span className="block font-bold">Hire Experts</span>
                  <span className="text-[10px] text-midnight/60">Pay by the minute</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRole('provider')}
                  className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    role === 'provider'
                      ? 'bg-aliceblue border-midnight text-midnight font-bold shadow-subtle'
                      : 'border-timberwolf/70 text-midnight/70 hover:border-moonstone'
                  }`}
                >
                  <span className="block font-bold">Offer Expertise</span>
                  <span className="text-[10px] text-midnight/60">Monetize your time</span>
                </button>
              </div>
            </div>

            {/* Optional Profile Photo */}
            <div className="space-y-1.5 pt-1">
              <label className="font-semibold text-midnight block">Profile Photo (Optional)</label>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img
                    src={avatarPreview || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(fullName || 'NewUser')}`}
                    alt="Preview"
                    className="w-12 h-12 rounded-xl object-cover border border-lightblue bg-aliceblue"
                  />
                  {uploadingAvatar && (
                    <div className="absolute inset-0 bg-midnight/50 rounded-xl flex items-center justify-center text-white">
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label className="px-3 py-1.5 rounded-lg border border-timberwolf/80 text-midnight/80 font-medium hover:bg-aliceblue hover:text-midnight cursor-pointer transition-colors flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-moonstone" />
                    <span>Upload Photo</span>
                    <input
                      type="file"
                      accept="image/png, image/jpeg, image/webp, image/jpg"
                      onChange={handlePhotoSelect}
                      className="hidden"
                    />
                  </label>
                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="text-midnight/40 hover:text-rose-500 text-[11px]"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Full Name */}
            <div className="space-y-1.5">
              <label className="font-semibold text-midnight block">Full Name *</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Sarah Chen"
                  className="w-full pl-9 pr-3 py-2.5 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight focus:outline-none focus:border-moonstone"
                />
                <UserIcon className="w-4 h-4 text-midnight/40 absolute left-3 top-3 pointer-events-none" />
              </div>
            </div>

            {/* Email Address */}
            <div className="space-y-1.5">
              <label className="font-semibold text-midnight block">Email Address *</label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-9 pr-3 py-2.5 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight focus:outline-none focus:border-moonstone"
                />
                <Mail className="w-4 h-4 text-midnight/40 absolute left-3 top-3 pointer-events-none" />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="font-semibold text-midnight block">Password *</label>
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
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Password Strength Indicator */}
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
              <label className="font-semibold text-midnight block">Confirm Password *</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className="w-full pl-9 pr-10 py-2.5 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight focus:outline-none focus:border-moonstone font-sans"
                />
                <Lock className="w-4 h-4 text-midnight/40 absolute left-3 top-3 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-2.5 text-midnight/40 hover:text-midnight transition-colors cursor-pointer p-0.5"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
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

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !passwordCriteria.isValid || passwordsMatch === false}
              className="btn-shine w-full py-3 rounded-xl bg-midnight text-aliceblue font-bold text-xs hover:bg-midnight-hover transition-all shadow-subtle cursor-pointer disabled:opacity-50 mt-2"
            >
              {loading ? 'Creating account...' : 'Create Account & Send Verification'}
            </button>
          </form>
        )}

      </div>

    </div>
  );
};
export default AuthPage;
