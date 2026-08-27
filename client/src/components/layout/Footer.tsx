import React from 'react';
import { Link } from 'react-router-dom';
import { BrandLogo } from '../common/BrandLogo';
import {
  ShieldCheck,
  Zap,
  Sparkles,
  Lock,
  Globe,
  Radio,
  ArrowUpRight,
  FileText,
  HelpCircle,
  Award,
  Scale,
  Mail,
  RotateCcw
} from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="mt-auto border-t border-timberwolf/60 bg-white/80 backdrop-blur-sm pt-12 pb-8 px-4 sm:px-6 lg:px-8 text-midnight transition-colors">
      <div className="max-w-7xl mx-auto space-y-10">
        
        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-8">
          
          {/* Brand Column (2 cols wide on desktop) */}
          <div className="lg:col-span-2 space-y-4">
            <BrandLogo size="md" showTagline />

            <p className="text-midnight/70 text-xs sm:text-sm leading-relaxed max-w-sm">
              The precision marketplace for on-demand consultations.
              Hire verified experts for exactly the minutes you need, or monetize specialized knowledge with zero retainers.
            </p>

            <div className="flex items-center gap-3 text-xs text-midnight/60">
              <span className="inline-flex items-center gap-1 bg-aliceblue px-2.5 py-1 rounded-md border border-timberwolf/50">
                <Lock className="w-3 h-3 text-moonstone" />
                <span>Escrow Protected</span>
              </span>
              <span className="inline-flex items-center gap-1 bg-aliceblue px-2.5 py-1 rounded-md border border-timberwolf/50">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                <span>Verified Experts</span>
              </span>
            </div>
          </div>

          {/* Col 1: Platform */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-midnight">Platform</h4>
            <ul className="space-y-2 text-xs sm:text-sm text-midnight/75 font-medium">
              <li>
                <Link to="/about" className="hover:text-moonstone transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/how-it-works" className="hover:text-moonstone transition-colors">
                  How It Works
                </Link>
              </li>
              <li>
                <Link to="/services" className="hover:text-moonstone transition-colors flex items-center gap-1">
                  <span>Browse Services</span>
                </Link>
              </li>
              <li>
                <Link to="/opportunities" className="hover:text-moonstone transition-colors flex items-center gap-1">
                  <span>Opportunities</span>
                  <span className="text-[10px] bg-moonstone/15 text-moonstone px-1.5 py-0.2 rounded font-bold">New</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 2: Policies */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-midnight">Policies</h4>
            <ul className="space-y-2 text-xs sm:text-sm text-midnight/75 font-medium">
              <li>
                <Link to="/terms" className="hover:text-moonstone transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="hover:text-moonstone transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/refund-policy" className="hover:text-moonstone transition-colors">
                  Refund & Cancellation
                </Link>
              </li>
              <li>
                <Link to="/expert-policy" className="hover:text-moonstone transition-colors">
                  Expert Policy
                </Link>
              </li>
              <li>
                <Link to="/acceptable-use" className="hover:text-moonstone transition-colors">
                  Acceptable Use
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Support & Operations */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-midnight">Support</h4>
            <ul className="space-y-2 text-xs sm:text-sm text-midnight/75 font-medium">
              <li>
                <Link to="/contact" className="hover:text-moonstone transition-colors flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-moonstone" />
                  <span>Contact / Support</span>
                </Link>
              </li>
              <li>
                <Link to="/provider/onboard" className="hover:text-moonstone transition-colors">
                  Become a Provider
                </Link>
              </li>
              <li>
                <Link to="/provider" className="hover:text-moonstone transition-colors">
                  Provider Dashboard
                </Link>
              </li>
              <li>
                <Link to="/admin" className="hover:text-moonstone transition-colors text-midnight/50">
                  Admin Console
                </Link>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom Strip */}
        <div className="pt-6 border-t border-timberwolf/40 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-midnight/70">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left">
            <p>© {new Date().getFullYear()} HireByMinutes. All rights reserved.</p>
            <span className="hidden sm:inline text-timberwolf">•</span>
            <p className="flex items-center gap-1.5 font-medium text-midnight/80">
              <span>Designed & Developed by</span>
              <span className="font-bold text-midnight bg-moonstone/10 text-moonstone-dark px-2 py-0.5 rounded-md border border-moonstone/25">
                Vishal Chaudhary
              </span>
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium">
            <Link to="/terms" className="hover:text-moonstone transition-colors">Terms</Link>
            <span>•</span>
            <Link to="/privacy" className="hover:text-moonstone transition-colors">Privacy</Link>
            <span>•</span>
            <Link to="/refund-policy" className="hover:text-moonstone transition-colors">Refunds</Link>
            <span>•</span>
            <Link to="/contact" className="hover:text-moonstone transition-colors">Help</Link>
          </div>
        </div>

      </div>
    </footer>
  );
};
export default Footer;
