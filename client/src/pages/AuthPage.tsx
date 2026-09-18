import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
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
  Camera,
  RotateCcw,
  ArrowRight,
  ArrowLeft,
  Edit3,
  Clock
} from 'lucide-react';
import { BrandLogo } from '../components/common/BrandLogo';
import confetti from 'canvas-confetti';
import { usePageSEO } from '../hooks/usePageSEO';

interface AuthPageProps {
  initialMode?: 'login' | 'register';
}

interface FieldErrors {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export const AuthPage: React.FC<AuthPageProps> = ({ initialMode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  usePageSEO({
    title: location.pathname.includes('signup') || location.pathname.includes('register')
      ? 'Create an Account — HireByMinute'
      : 'Sign In — HireByMinute',
    noindex: true,
    canonicalPath: location.pathname
  });

  const { user, login, updateUser, setAuthSession } = useAuth();

  const [isVerifyingOtp, setIsVerifyingOtp] = useState(() => searchParams.get('tab') === 'verify_otp');

  // Active tab derived directly from route/state (idiomatic React without cascading effects)
  const queryTab = searchParams.get('tab');
  const tab: 'login' | 'register' | 'verify_otp' = (isVerifyingOtp || queryTab === 'verify_otp')
    ? 'verify_otp'
    : (initialMode === 'register' || location.pathname === '/signup' || location.pathname === '/register' || queryTab === 'register')
    ? 'register'
    : 'login';

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'client' | 'provider'>('client');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Password visibility
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // OTP Verification States
  const [verificationEmail, setVerificationEmail] = useState(() => searchParams.get('email') || '');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState('');
  const otpInputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const isSubmittingRef = useRef(false);

  // Status & Validation States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Auto-redirect only if user is fully authenticated & email-verified, and not in the middle of OTP verification
  useEffect(() => {
    if (user && tab !== 'verify_otp' && (user.email_verified === 1 || user.email_verified === true || user.role === 'admin')) {
      const redirectParam = searchParams.get('redirect');
      if (redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('/auth') && !redirectParam.startsWith('/login') && !redirectParam.startsWith('/signup')) {
        navigate(redirectParam, { replace: true });
      } else if (user.role === 'admin') {
        navigate('/admin', { replace: true });
      } else if (user.role === 'provider') {
        navigate('/provider', { replace: true });
      } else {
        navigate('/services', { replace: true });
      }
    }
  }, [user, tab, searchParams, navigate]);

  // Countdown timer for resend code
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [resendCooldown]);

  // Smooth Tab Switcher
  const handleTabSwitch = (newTab: 'login' | 'register') => {
    setIsVerifyingOtp(false);
    setError(null);
    setFieldErrors({});
    setSuccessMessage(null);
    const redirectParam = searchParams.get('redirect');
    const redirectQuery = redirectParam ? `?redirect=${encodeURIComponent(redirectParam)}` : '';
    if (newTab === 'register') {
      navigate(`/signup${redirectQuery}`, { replace: true });
    } else {
      navigate(`/login${redirectQuery}`, { replace: true });
    }
  };

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

  // Form Handlers
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || isSubmittingRef.current) return;

    const errors: FieldErrors = {};
    if (!email.trim()) {
      errors.email = 'Please enter your email address.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Enter a valid email address.';
    }

    if (!password) {
      errors.password = 'Please enter your password.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    setError(null);
    setFieldErrors({});

    try {
      const cleanEmail = email.trim().toLowerCase();
      const loggedInUser = await login(cleanEmail, password);
      // If user requires email verification, transition smoothly to OTP tab
      if (loggedInUser.email_verified === 0 || loggedInUser.email_verified === false) {
        if (loggedInUser.role !== 'admin') {
          setVerificationEmail(loggedInUser.email || cleanEmail);
          setIsVerifyingOtp(true);
          setResendCooldown(60);
          setSuccessMessage('Please enter your 6-digit verification code to complete sign-in.');
          return;
        }
      }

      const redirectParam = searchParams.get('redirect');
      if (redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('/auth') && !redirectParam.startsWith('/login') && !redirectParam.startsWith('/signup')) {
        navigate(redirectParam, { replace: true });
      } else if (loggedInUser.role === 'admin') {
        navigate('/admin', { replace: true });
      } else if (loggedInUser.role === 'provider') {
        navigate('/provider', { replace: true });
      } else {
        navigate('/services', { replace: true });
      }
    } catch (err: any) {
      const cleanEmail = email.trim().toLowerCase();
      if (err.requires_verification || (err.message && err.message.toLowerCase().includes('verify your email'))) {
        const target = (err.email || cleanEmail).trim().toLowerCase();
        setVerificationEmail(target);
        setIsVerifyingOtp(true);
        setResendCooldown(60);
        setSuccessMessage('Please enter your 6-digit verification code to complete sign-in.');
        return;
      }

      const msg = err.message || 'Login failed. Please check your credentials.';
      const lower = msg.toLowerCase();
      if (lower.includes('suspended')) {
        setError('This account has been suspended by administration.');
      } else if (
        lower.includes('password') ||
        lower.includes('invalid email or password') ||
        lower.includes('invalid credential') ||
        lower.includes('incorrect') ||
        lower.includes('unauthorized')
      ) {
        setFieldErrors({ password: 'Incorrect email or password. Please try again.' });
      } else if (
        lower.includes('user account not found') ||
        lower.includes('no account found') ||
        lower.includes('user not found') ||
        lower.includes('user does not exist')
      ) {
        setFieldErrors({ email: 'No account found with this email address.' });
      } else {
        setError(msg);
      }
    } finally {
      isSubmittingRef.current = false;
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
    if (loading || isSubmittingRef.current) return;
    setError(null);

    const errors: FieldErrors = {};
    if (!fullName.trim()) {
      errors.fullName = 'Please enter your full name.';
    }

    if (!email.trim()) {
      errors.email = 'Please enter your email address.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Enter a valid email address.';
    }

    if (!password) {
      errors.password = 'Please enter a password.';
    } else if (!passwordCriteria.isValid) {
      errors.password = 'Password must contain at least 8 characters with letters and numbers.';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your password.';
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    setFieldErrors({});

    try {
      const cleanEmail = email.trim().toLowerCase();
      await api.register({
        email: cleanEmail,
        password,
        full_name: fullName.trim(),
        role,
        avatar_url: avatarUrl || undefined,
        headline: ''
      });

      // Never store token or set user session before email OTP verification
      setVerificationEmail(cleanEmail);
      setResendCooldown(60);
      setIsVerifyingOtp(true);
      setSuccessMessage('We sent a 6-digit verification code to your email.');
    } catch (err: any) {
      const cleanEmail = email.trim().toLowerCase();
      if (err.requires_verification) {
        setVerificationEmail(cleanEmail);
        setIsVerifyingOtp(true);
        setResendCooldown(60);
        setSuccessMessage('An account with this email is pending verification. Please enter your 6-digit verification code or request a new code.');
        return;
      }
      const msg = err.message || 'Registration failed.';
      const lower = msg.toLowerCase();
      if (lower.includes('already exists') || lower.includes('duplicate') || lower.includes('in use')) {
        setFieldErrors({ email: 'An account with this email already exists. Please sign in or verify your email.' });
      } else {
        setError(msg);
      }
    } finally {
      isSubmittingRef.current = false;
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
    if (loading || isSubmittingRef.current) return;
    const code = otpDigits.join('');
    if (code.length !== 6) {
      setError('Please enter the full 6-digit code.');
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await api.verifyEmailOtp(verificationEmail, code);
      // Authenticate and issue verified session upon successful OTP confirmation
      if (res.user && res.token) {
        setAuthSession(res.user, res.token);
      } else if (res.user) {
        updateUser(res.user);
      }
      confetti({ particleCount: 70, spread: 60 });
      setSuccessMessage('Email verified successfully! Redirecting to your dashboard...');
      setTimeout(() => {
        const redirectParam = searchParams.get('redirect');
        if (redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('/auth') && !redirectParam.startsWith('/login') && !redirectParam.startsWith('/signup')) {
          navigate(redirectParam, { replace: true });
        } else if (role === 'provider' || res.user?.role === 'provider') {
          navigate('/provider');
        } else {
          navigate('/services');
        }
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Invalid verification code. Please check and try again.');
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || loading || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await api.resendVerificationOtp(verificationEmail);
      setResendCooldown(60);
      setSuccessMessage('A fresh 6-digit code has been dispatched to your email.');
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification code.');
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  const handleChangeEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmailInput.trim() || loading || isSubmittingRef.current) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmailInput.trim())) {
      setError('Please enter a valid email address.');
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await api.changeUnverifiedEmail(verificationEmail, newEmailInput.trim());
      setVerificationEmail(res.new_email || newEmailInput.trim());
      setIsChangingEmail(false);
      setResendCooldown(60);
      setOtpDigits(['', '', '', '', '', '']);
      setSuccessMessage('Email address updated. A new 6-digit code has been dispatched.');
    } catch (err: any) {
      setError(err.message || 'Failed to update email address.');
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-aliceblue text-midnight selection:bg-lightblue selection:text-midnight">
      
      {/* ========================================================================= */}
      {/* MINIMAL TOP HEADER */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-30 w-full bg-white/95 backdrop-blur-md border-b border-timberwolf/40 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <BrandLogo size="md" asLink={true} />
        <div className="flex items-center gap-3">
          {tab === 'login' ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="hidden sm:inline text-xs text-midnight/70 font-medium">
                Don't have an account?
              </span>
              <button
                type="button"
                onClick={() => handleTabSwitch('register')}
                className="text-xs font-bold text-midnight bg-aliceblue hover:bg-aliceblue-surface border border-timberwolf/70 hover:border-midnight px-3.5 py-1.5 rounded-lg transition-all cursor-pointer shadow-subtle"
              >
                Create Account
              </button>
            </div>
          ) : tab === 'register' ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="hidden sm:inline text-xs text-midnight/70 font-medium">
                Already have an account?
              </span>
              <button
                type="button"
                onClick={() => handleTabSwitch('login')}
                className="text-xs font-bold text-midnight bg-aliceblue hover:bg-aliceblue-surface border border-timberwolf/70 hover:border-midnight px-3.5 py-1.5 rounded-lg transition-all cursor-pointer shadow-subtle"
              >
                Sign In
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => handleTabSwitch('login')}
              className="text-xs font-bold text-midnight/80 hover:text-midnight flex items-center gap-1.5 cursor-pointer py-1.5 px-3 rounded-lg hover:bg-aliceblue transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Sign In</span>
            </button>
          )}
        </div>
      </header>

      {/* ========================================================================= */}
      {/* MAIN AUTH CONTAINER: TWO-COLUMN ASYMMETRIC DESKTOP / CENTERED MOBILE */}
      {/* ========================================================================= */}
      <main className="flex-1 flex items-center justify-center py-8 sm:py-12 lg:py-14 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">

          {/* ----------------------------------------------------------------------- */}
          {/* LEFT COLUMN: BRAND PROPOSITION & TRUST REASSURANCE (DESKTOP) */}
          {/* ----------------------------------------------------------------------- */}
          <section aria-label="HireByMinute Overview" className="hidden lg:flex flex-col justify-center lg:col-span-5 xl:col-span-6 pr-2 xl:pr-8">
            
            {/* Live Indicator Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-moonstone/10 border border-moonstone/25 text-midnight text-xs font-semibold mb-5 w-fit shadow-subtle">
              <span className="w-2 h-2 rounded-full bg-moonstone animate-pulse" />
              <span>Verified On-Demand Marketplace</span>
            </div>

            {/* Authoritative Headline */}
            <h1 className="text-3xl xl:text-4xl font-extrabold text-midnight tracking-tight leading-[1.2]">
              Expertise, exactly when you need it.
            </h1>

            <p className="mt-3.5 text-sm xl:text-base text-midnight/75 leading-relaxed max-w-lg">
              Find the right expert. Hire them by the minute. Pay only for the time you need.
            </p>

            {/* Core Feature Value Cards */}
            <div className="mt-8 space-y-3.5 max-w-lg">
              <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-white/70 border border-timberwolf/50 backdrop-blur-xs shadow-subtle">
                <div className="w-9 h-9 rounded-xl bg-midnight text-white flex items-center justify-center shrink-0 mt-0.5 shadow-subtle">
                  <Clock className="w-4 h-4 text-lightblue" />
                </div>
                <div>
                  <h2 className="text-xs font-bold text-midnight tracking-wide">Per-Minute Precision Billing</h2>
                  <p className="text-xs text-midnight/70 leading-relaxed mt-0.5">
                    No monthly retainers or bloated contracts. Pay strictly for elapsed consultation time down to the exact second.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-white/70 border border-timberwolf/50 backdrop-blur-xs shadow-subtle">
                <div className="w-9 h-9 rounded-xl bg-midnight text-white flex items-center justify-center shrink-0 mt-0.5 shadow-subtle">
                  <Shield className="w-4 h-4 text-lightblue" />
                </div>
                <div>
                  <h2 className="text-xs font-bold text-midnight tracking-wide">Vetted Domain Specialists</h2>
                  <p className="text-xs text-midnight/70 leading-relaxed mt-0.5">
                    Connect directly with vetted senior developers, system architects, startup founders, and consultants ready to assist.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-white/70 border border-timberwolf/50 backdrop-blur-xs shadow-subtle">
                <div className="w-9 h-9 rounded-xl bg-midnight text-white flex items-center justify-center shrink-0 mt-0.5 shadow-subtle">
                  <Sparkles className="w-4 h-4 text-lightblue" />
                </div>
                <div>
                  <h2 className="text-xs font-bold text-midnight tracking-wide">Instant In-Browser Collaboration</h2>
                  <p className="text-xs text-midnight/70 leading-relaxed mt-0.5">
                    High-definition video, crystal-clear audio, and real-time screen sharing straight from your browser.
                  </p>
                </div>
              </div>
            </div>

            {/* Trust Reassurance Badges */}
            <div className="mt-8 pt-6 border-t border-timberwolf/40 flex items-center gap-6 text-[11px] text-midnight/65 font-medium">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-moonstone" />
                <span>256-bit TLS Encrypted</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-moonstone" />
                <span>Verified Profiles</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-moonstone" />
                <span>Zero Platform Lock-in</span>
              </div>
            </div>
          </section>

          {/* ----------------------------------------------------------------------- */}
          {/* RIGHT COLUMN: AUTHENTICATION CARD */}
          {/* ----------------------------------------------------------------------- */}
          <div className="w-full lg:col-span-7 xl:col-span-6 flex justify-center">
            <div className={`w-full ${tab === 'register' ? 'max-w-[530px]' : tab === 'login' ? 'max-w-[460px]' : 'max-w-[480px]'} transition-all duration-200`}>
              
              <div className="bg-white rounded-2xl sm:rounded-3xl border border-timberwolf/70 p-6 sm:p-8 md:p-9 shadow-elevated">
                
                {/* Tab Switcher (Visible in Login and Register modes) */}
                {tab !== 'verify_otp' && (
                  <div className="flex bg-aliceblue/80 p-1 rounded-xl border border-timberwolf/40 mb-6" role="tablist">
                    <button
                      role="tab"
                      aria-selected={tab === 'login'}
                      type="button"
                      onClick={() => handleTabSwitch('login')}
                      className={`flex-1 py-2.5 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer ${
                        tab === 'login'
                          ? 'bg-midnight text-white shadow-subtle'
                          : 'text-midnight/70 hover:text-midnight hover:bg-white/50'
                      }`}
                    >
                      Sign In
                    </button>
                    <button
                      role="tab"
                      aria-selected={tab === 'register'}
                      type="button"
                      onClick={() => handleTabSwitch('register')}
                      className={`flex-1 py-2.5 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer ${
                        tab === 'register'
                          ? 'bg-midnight text-white shadow-subtle'
                          : 'text-midnight/70 hover:text-midnight hover:bg-white/50'
                      }`}
                    >
                      Create Account
                    </button>
                  </div>
                )}

                {/* Form Header */}
                <div className="mb-6 text-left">
                  <h1 className="text-2xl sm:text-[26px] font-extrabold text-midnight tracking-tight">
                    {tab === 'verify_otp'
                      ? 'Verify your email'
                      : tab === 'login'
                      ? 'Welcome back'
                      : 'Create your account'}
                  </h1>
                  <p className="text-xs sm:text-sm text-midnight/70 mt-1 leading-relaxed">
                    {tab === 'verify_otp'
                      ? `We sent a 6-digit verification code to ${maskedEmail || 'your email'}.`
                      : tab === 'login'
                      ? 'Sign in to your HireByMinute account to continue'
                      : 'Join HireByMinute to hire experts or monetize your expertise'}
                  </p>
                </div>

                {/* Global Status Notifications */}
                {successMessage && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3.5 rounded-xl flex items-start gap-2.5 mb-5 animate-fade-in" role="status">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span className="leading-relaxed font-medium">{successMessage}</span>
                  </div>
                )}

                {error && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs p-3.5 rounded-xl flex items-start gap-2.5 mb-5 animate-fade-in" role="alert">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <span className="leading-relaxed font-medium">{error}</span>
                  </div>
                )}

                {/* ========================================================================= */}
                {/* 1. LOGIN FORM */}
                {/* ========================================================================= */}
                {tab === 'login' && (
                  <form onSubmit={handleLoginSubmit} className="space-y-4" noValidate>
                    
                    {/* Email Input */}
                    <div className="space-y-1.5">
                      <label htmlFor="login-email" className="block text-xs font-semibold text-midnight">
                        Email Address <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-midnight/40">
                          <Mail className="w-4 h-4" />
                        </div>
                        <input
                          id="login-email"
                          type="email"
                          autoComplete="email"
                          required
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                            if (error) setError(null);
                          }}
                          placeholder="name@example.com"
                          className={`w-full pl-10 pr-4 py-3 bg-aliceblue/30 border rounded-xl text-midnight text-sm placeholder:text-midnight/35 transition-all focus:outline-none focus:ring-2 ${
                            fieldErrors.email
                              ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                              : 'border-timberwolf/70 focus:border-moonstone focus:ring-moonstone/20 focus:bg-white'
                          }`}
                        />
                      </div>
                      {fieldErrors.email && (
                        <p className="text-xs text-rose-600 flex items-center gap-1 mt-1" role="alert">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{fieldErrors.email}</span>
                        </p>
                      )}
                    </div>

                    {/* Password Input */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label htmlFor="login-password" className="block text-xs font-semibold text-midnight">
                          Password <span className="text-rose-500">*</span>
                        </label>
                        <Link
                          to="/forgot-password"
                          className="text-xs text-moonstone hover:text-moonstone-dark font-medium transition-colors"
                        >
                          Forgot password?
                        </Link>
                      </div>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-midnight/40">
                          <Lock className="w-4 h-4" />
                        </div>
                        <input
                          id="login-password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          required
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                            if (error) setError(null);
                          }}
                          placeholder="Enter your account password"
                          className={`w-full pl-10 pr-11 py-3 bg-aliceblue/30 border rounded-xl text-midnight text-sm placeholder:text-midnight/35 transition-all focus:outline-none focus:ring-2 font-sans ${
                            fieldErrors.password
                              ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                              : 'border-timberwolf/70 focus:border-moonstone focus:ring-moonstone/20 focus:bg-white'
                          }`}
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
                      {fieldErrors.password && (
                        <p className="text-xs text-rose-600 flex items-center gap-1 mt-1" role="alert">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{fieldErrors.password}</span>
                        </p>
                      )}
                    </div>

                    {/* Submit Button */}
                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={loading}
                        className="btn-shine w-full py-3.5 px-4 rounded-xl bg-midnight text-white font-bold text-sm hover:bg-midnight-hover transition-all shadow-subtle cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {loading ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Signing in...</span>
                          </>
                        ) : (
                          <>
                            <span>Sign In</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </div>

                    {/* Security Footnote */}
                    <div className="pt-3 border-t border-timberwolf/30 flex items-center justify-center gap-1.5 text-[11px] text-midnight/60">
                      <Shield className="w-3.5 h-3.5 text-moonstone shrink-0" />
                      <span>Protected by 256-bit TLS encrypted session security</span>
                    </div>

                    {/* Alternate Mobile Link */}
                    <div className="text-center pt-1 sm:hidden">
                      <span className="text-xs text-midnight/70">Don't have an account? </span>
                      <button
                        type="button"
                        onClick={() => handleTabSwitch('register')}
                        className="text-xs font-bold text-midnight underline hover:text-moonstone transition-colors cursor-pointer"
                      >
                        Create an account
                      </button>
                    </div>
                  </form>
                )}

                {/* ========================================================================= */}
                {/* 2. REGISTER FORM */}
                {/* ========================================================================= */}
                {tab === 'register' && (
                  <form onSubmit={handleRegisterSubmit} className="space-y-4" noValidate>
                    
                    {/* Role Selection Cards */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-midnight">
                        I want to...
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" role="radiogroup" aria-label="Select account intent">
                        
                        {/* Client Option */}
                        <button
                          type="button"
                          role="radio"
                          aria-checked={role === 'client'}
                          onClick={() => setRole('client')}
                          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                            role === 'client'
                              ? 'bg-aliceblue-surface border-2 border-midnight shadow-subtle'
                              : 'bg-white border border-timberwolf/70 hover:border-moonstone/80 hover:bg-aliceblue/30'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full mb-1">
                            <span className={`text-xs sm:text-sm font-bold ${role === 'client' ? 'text-midnight' : 'text-midnight/80'}`}>
                              Hire Experts
                            </span>
                            <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
                              role === 'client' ? 'bg-midnight text-white' : 'border border-timberwolf/70 text-transparent'
                            }`}>
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                            </div>
                          </div>
                          <p className="text-[11px] text-midnight/65 leading-tight">
                            Pay by the minute for on-demand consulting
                          </p>
                        </button>

                        {/* Provider Option */}
                        <button
                          type="button"
                          role="radio"
                          aria-checked={role === 'provider'}
                          onClick={() => setRole('provider')}
                          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                            role === 'provider'
                              ? 'bg-aliceblue-surface border-2 border-midnight shadow-subtle'
                              : 'bg-white border border-timberwolf/70 hover:border-moonstone/80 hover:bg-aliceblue/30'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full mb-1">
                            <span className={`text-xs sm:text-sm font-bold ${role === 'provider' ? 'text-midnight' : 'text-midnight/80'}`}>
                              Offer Expertise
                            </span>
                            <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
                              role === 'provider' ? 'bg-midnight text-white' : 'border border-timberwolf/70 text-transparent'
                            }`}>
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                            </div>
                          </div>
                          <p className="text-[11px] text-midnight/65 leading-tight">
                            Monetize your knowledge on your own terms
                          </p>
                        </button>
                      </div>
                    </div>

                    {/* Optional Profile Photo Upload */}
                    <div className="space-y-1.5 pt-0.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-semibold text-midnight">Profile Photo</label>
                        <span className="text-[11px] font-medium text-midnight/50 bg-aliceblue px-2 py-0.5 rounded-md border border-timberwolf/40">
                          Optional
                        </span>
                      </div>
                      <div className="flex items-center gap-3.5 p-2.5 rounded-xl bg-aliceblue/30 border border-timberwolf/50">
                        <div className="relative shrink-0">
                          {avatarPreview ? (
                            <img
                              src={avatarPreview}
                              alt="Profile preview"
                              className="w-12 h-12 rounded-full object-cover border-2 border-moonstone/50 shadow-subtle"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-white border border-timberwolf/70 flex items-center justify-center text-midnight/40 shadow-subtle">
                              <UserIcon className="w-5 h-5 stroke-[1.6]" />
                            </div>
                          )}
                          {uploadingAvatar && (
                            <div className="absolute inset-0 bg-midnight/60 rounded-full flex items-center justify-center text-white">
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 flex flex-wrap items-center gap-2">
                          <label className="px-3 py-1.5 rounded-lg border border-timberwolf/80 bg-white hover:border-midnight hover:bg-aliceblue text-midnight text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 shadow-subtle">
                            <Camera className="w-3.5 h-3.5 text-moonstone" />
                            <span>{avatarUrl ? 'Change Photo' : 'Upload Photo'}</span>
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
                              className="text-xs text-rose-600 hover:text-rose-700 font-medium px-2 py-1 cursor-pointer transition-colors"
                            >
                              Remove
                            </button>
                          )}
                          <span className="text-[11px] text-midnight/50 w-full">
                            JPG, PNG, or WEBP under 5MB
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Full Name */}
                    <div className="space-y-1.5">
                      <label htmlFor="signup-fullname" className="block text-xs font-semibold text-midnight">
                        Full Name <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-midnight/40">
                          <UserIcon className="w-4 h-4" />
                        </div>
                        <input
                          id="signup-fullname"
                          type="text"
                          autoComplete="name"
                          required
                          value={fullName}
                          onChange={(e) => {
                            setFullName(e.target.value);
                            if (fieldErrors.fullName) setFieldErrors((prev) => ({ ...prev, fullName: undefined }));
                            if (error) setError(null);
                          }}
                          placeholder="e.g. Sarah Chen"
                          className={`w-full pl-10 pr-4 py-3 bg-aliceblue/30 border rounded-xl text-midnight text-sm placeholder:text-midnight/35 transition-all focus:outline-none focus:ring-2 ${
                            fieldErrors.fullName
                              ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                              : 'border-timberwolf/70 focus:border-moonstone focus:ring-moonstone/20 focus:bg-white'
                          }`}
                        />
                      </div>
                      {fieldErrors.fullName && (
                        <p className="text-xs text-rose-600 flex items-center gap-1 mt-1" role="alert">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{fieldErrors.fullName}</span>
                        </p>
                      )}
                    </div>

                    {/* Email Address */}
                    <div className="space-y-1.5">
                      <label htmlFor="signup-email" className="block text-xs font-semibold text-midnight">
                        Email Address <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-midnight/40">
                          <Mail className="w-4 h-4" />
                        </div>
                        <input
                          id="signup-email"
                          type="email"
                          autoComplete="email"
                          required
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                            if (error) setError(null);
                          }}
                          placeholder="name@example.com"
                          className={`w-full pl-10 pr-4 py-3 bg-aliceblue/30 border rounded-xl text-midnight text-sm placeholder:text-midnight/35 transition-all focus:outline-none focus:ring-2 ${
                            fieldErrors.email
                              ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                              : 'border-timberwolf/70 focus:border-moonstone focus:ring-moonstone/20 focus:bg-white'
                          }`}
                        />
                      </div>
                      {fieldErrors.email && (
                        <p className="text-xs text-rose-600 flex items-center gap-1 mt-1" role="alert">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{fieldErrors.email}</span>
                        </p>
                      )}
                    </div>

                    {/* Password */}
                    <div className="space-y-1.5">
                      <label htmlFor="signup-password" className="block text-xs font-semibold text-midnight">
                        Password <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-midnight/40">
                          <Lock className="w-4 h-4" />
                        </div>
                        <input
                          id="signup-password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          required
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                            if (error) setError(null);
                          }}
                          placeholder="Create a strong password"
                          className={`w-full pl-10 pr-11 py-3 bg-aliceblue/30 border rounded-xl text-midnight text-sm placeholder:text-midnight/35 transition-all focus:outline-none focus:ring-2 font-sans ${
                            fieldErrors.password
                              ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                              : 'border-timberwolf/70 focus:border-moonstone focus:ring-moonstone/20 focus:bg-white'
                          }`}
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

                      {/* Password Requirements Guidance & Live Meter */}
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

                      {fieldErrors.password && (
                        <p className="text-xs text-rose-600 flex items-center gap-1 mt-1" role="alert">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{fieldErrors.password}</span>
                        </p>
                      )}
                    </div>

                    {/* Confirm Password */}
                    <div className="space-y-1.5">
                      <label htmlFor="signup-confirm-password" className="block text-xs font-semibold text-midnight">
                        Confirm Password <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-midnight/40">
                          <Lock className="w-4 h-4" />
                        </div>
                        <input
                          id="signup-confirm-password"
                          type={showConfirmPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          required
                          value={confirmPassword}
                          onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            if (fieldErrors.confirmPassword) setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                            if (error) setError(null);
                          }}
                          placeholder="Re-enter your password"
                          className={`w-full pl-10 pr-11 py-3 bg-aliceblue/30 border rounded-xl text-midnight text-sm placeholder:text-midnight/35 transition-all focus:outline-none focus:ring-2 font-sans ${
                            fieldErrors.confirmPassword
                              ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                              : 'border-timberwolf/70 focus:border-moonstone focus:ring-moonstone/20 focus:bg-white'
                          }`}
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

                      {fieldErrors.confirmPassword && (
                        <p className="text-xs text-rose-600 flex items-center gap-1 mt-1" role="alert">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{fieldErrors.confirmPassword}</span>
                        </p>
                      )}
                    </div>

                    {/* Submit Button */}
                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={loading}
                        className="btn-shine w-full py-3.5 px-4 rounded-xl bg-midnight text-white font-bold text-sm hover:bg-midnight-hover transition-all shadow-subtle cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {loading ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Creating account...</span>
                          </>
                        ) : (
                          <>
                            <span>Create Account & Continue</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </div>

                    {/* Terms & Privacy Note */}
                    <p className="text-[11px] text-midnight/60 text-center leading-relaxed pt-1">
                      By creating an account, you agree to our{' '}
                      <Link to="/terms" className="underline hover:text-midnight font-medium">
                        Terms of Service
                      </Link>{' '}
                      and acknowledge our{' '}
                      <Link to="/privacy" className="underline hover:text-midnight font-medium">
                        Privacy Policy
                      </Link>.
                    </p>

                    {/* Alternate Mobile Link */}
                    <div className="text-center pt-1 sm:hidden">
                      <span className="text-xs text-midnight/70">Already have an account? </span>
                      <button
                        type="button"
                        onClick={() => handleTabSwitch('login')}
                        className="text-xs font-bold text-midnight underline hover:text-moonstone transition-colors cursor-pointer"
                      >
                        Sign in
                      </button>
                    </div>
                  </form>
                )}

                {/* ========================================================================= */}
                {/* 3. OTP VERIFICATION SCREEN */}
                {/* ========================================================================= */}
                {tab === 'verify_otp' && (
                  <div className="space-y-6 text-left">
                    {!isChangingEmail ? (
                      <form onSubmit={handleVerifyOtpSubmit} className="space-y-6">
                        
                        {/* 6-Digit Verification Inputs */}
                        <div className="space-y-2.5">
                          <label className="text-xs font-semibold text-midnight block text-center">
                            Enter 6-Digit Security Code
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
                                aria-label={`Digit ${idx + 1}`}
                                className="w-11 h-13 sm:w-13 sm:h-14 text-center text-xl sm:text-2xl font-mono font-extrabold bg-aliceblue/40 border border-timberwolf/70 rounded-xl text-midnight focus:outline-none focus:border-moonstone focus:ring-2 focus:ring-moonstone/25 focus:bg-white shadow-subtle transition-all"
                              />
                            ))}
                          </div>
                          <span className="text-[11px] text-midnight/50 block text-center pt-0.5">
                            Code expires in 10 minutes.
                          </span>
                        </div>

                        {/* Submit Verification */}
                        <button
                          type="submit"
                          disabled={loading || otpDigits.join('').length !== 6}
                          className="btn-shine w-full py-3.5 px-4 rounded-xl bg-midnight text-white font-bold text-sm hover:bg-midnight-hover transition-all shadow-subtle cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {loading ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              <span>Verifying code...</span>
                            </>
                          ) : (
                            <span>Verify Email Address</span>
                          )}
                        </button>

                        {/* Resend & Change Email Actions */}
                        <div className="pt-4 border-t border-timberwolf/40 flex flex-col items-center gap-2.5 text-xs">
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
                              {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend verification code'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => { setIsChangingEmail(true); setNewEmailInput(verificationEmail); }}
                            className="text-midnight/60 hover:text-midnight font-medium text-xs flex items-center gap-1.5 cursor-pointer py-1"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-midnight/50" />
                            <span>Entered the wrong email? Change email address</span>
                          </button>
                        </div>
                      </form>
                    ) : (
                      /* Change Email Inline Form */
                      <form onSubmit={handleChangeEmailSubmit} className="space-y-4 animate-fade-in">
                        <div className="space-y-1.5">
                          <label htmlFor="change-email-input" className="block text-xs font-semibold text-midnight">
                            Update Email Address
                          </label>
                          <input
                            id="change-email-input"
                            type="email"
                            required
                            value={newEmailInput}
                            onChange={(e) => setNewEmailInput(e.target.value)}
                            className="w-full px-4 py-3 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-midnight text-sm focus:outline-none focus:border-moonstone focus:ring-2 focus:ring-moonstone/20"
                          />
                        </div>
                        <div className="flex gap-3 pt-1">
                          <button
                            type="button"
                            onClick={() => setIsChangingEmail(false)}
                            className="flex-1 py-2.5 rounded-xl border border-timberwolf text-midnight/70 text-xs font-semibold hover:bg-aliceblue transition-all cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 py-2.5 rounded-xl bg-midnight text-white text-xs font-bold hover:bg-midnight-hover shadow-subtle transition-all cursor-pointer"
                          >
                            {loading ? 'Updating...' : 'Save & Send Code'}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}

              </div>
            </div>
          </div>

        </div>
      </main>

      {/* ========================================================================= */}
      {/* MINIMAL AUTH FOOTER */}
      {/* ========================================================================= */}
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
            <Link to="/how-it-works" className="hover:text-midnight transition-colors">How It Works</Link>
            <span className="text-timberwolf/60">•</span>
            <Link to="/contact" className="hover:text-midnight transition-colors">Contact</Link>
          </div>
        </div>
      </footer>

    </div>
  );
};

export default AuthPage;
