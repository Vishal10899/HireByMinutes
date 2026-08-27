import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { Mail, ArrowLeft, CheckCircle2, AlertCircle, Lock } from 'lucide-react';
import { BrandLogo } from '../components/common/BrandLogo';

export const ForgotPasswordPage: React.FC = () => {
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
    <div className="max-w-md mx-auto px-4 py-16">
      
      {/* Brand Header */}
      <div className="text-center space-y-3 mb-8 flex flex-col items-center">
        <BrandLogo size="lg" showText={false} asLink={true} />
        <h1 className="text-2xl font-extrabold text-midnight">
          Reset your password
        </h1>
        <p className="text-xs text-midnight/70 max-w-xs leading-relaxed">
          Enter your registered email address and we will send you a secure password reset link.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 sm:p-8 shadow-card space-y-6">
        
        {submitted ? (
          <div className="text-center space-y-4 py-2 animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-midnight">Check your inbox</h3>
            <p className="text-xs text-midnight/70 leading-relaxed">
              If an account is associated with <strong>{email}</strong>, we have sent instructions to reset your password. The link will expire in 30 minutes.
            </p>
            <div className="pt-2">
              <Link
                to="/auth"
                className="px-5 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover transition-colors inline-block"
              >
                Back to Sign In
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

            <button
              type="submit"
              disabled={loading}
              className="btn-shine w-full py-3 rounded-xl bg-midnight text-aliceblue font-bold text-xs hover:bg-midnight-hover transition-all shadow-subtle cursor-pointer disabled:opacity-50 mt-2"
            >
              {loading ? 'Sending link...' : 'Send Password Reset Link'}
            </button>

            <div className="text-center pt-3 border-t border-timberwolf/40">
              <Link
                to="/auth"
                className="text-xs text-midnight/60 hover:text-midnight font-medium inline-flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Sign In</span>
              </Link>
            </div>

          </form>
        )}

      </div>

    </div>
  );
};
export default ForgotPasswordPage;
