import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Lock,
  Shield,
  Eye,
  Database,
  UserCheck,
  Mail,
  AlertCircle,
  FileText,
  Server
} from 'lucide-react';

export const PrivacyPage: React.FC = () => {
  useEffect(() => {
    document.title = 'Privacy Policy — HireByMinutes';
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-aliceblue text-midnight py-10 sm:py-14">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Header Hero */}
        <div className="space-y-3 border-b border-timberwolf/60 pb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-moonstone/10 text-moonstone-dark text-xs font-bold border border-moonstone/30">
            <Lock className="w-3.5 h-3.5 text-moonstone" />
            <span>Data Protection & Privacy</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-midnight">
            Privacy Policy
          </h1>
          <p className="text-xs sm:text-sm text-midnight/70">
            <strong>Last Updated:</strong> August 28, 2026
          </p>
        </div>

        {/* Highlight Box */}
        <div className="p-4 rounded-xl bg-white border border-timberwolf/70 shadow-subtle flex items-start gap-3 text-xs text-midnight/80">
          <Shield className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            HireByMinutes is designed with data minimization as a core architecture principle. We collect and process only the information necessary to authenticate users, facilitate minute-based consultations, process secure payment transactions, and maintain marketplace integrity.
          </p>
        </div>

        {/* Content Container */}
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 sm:p-10 shadow-card space-y-8 text-xs sm:text-sm text-midnight/85 leading-relaxed">
          
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight flex items-center gap-2">
              <Database className="w-4 h-4 text-moonstone" />
              <span>1. Information We Collect</span>
            </h2>
            <p>
              We collect information you directly provide when registering, creating a profile, listing services, or conducting consultations on the Platform:
            </p>
            <div className="space-y-3 pt-1">
              <div className="p-3.5 bg-aliceblue rounded-xl border border-timberwolf/50 space-y-1">
                <h4 className="font-bold text-midnight text-xs">Account & Authentication Data</h4>
                <p className="text-xs text-midnight/75">
                  Full name, email address, password hash (encrypted with one-way bcrypt hashing; plaintext passwords are never stored or accessible), and permanent system username.
                </p>
              </div>

              <div className="p-3.5 bg-aliceblue rounded-xl border border-timberwolf/50 space-y-1">
                <h4 className="font-bold text-midnight text-xs">Profile & Professional Information</h4>
                <p className="text-xs text-midnight/75">
                  Headline, biography, professional skills, languages spoken, country, city, years of experience, and profile avatar URL or uploaded image.
                </p>
              </div>

              <div className="p-3.5 bg-aliceblue rounded-xl border border-timberwolf/50 space-y-1">
                <h4 className="font-bold text-midnight text-xs">Service Listing & Consultation Briefs</h4>
                <p className="text-xs text-midnight/75">
                  Service titles, category assignments, per-minute pricing, consultation request notes, duration in minutes, and session scheduling metadata.
                </p>
              </div>

              <div className="p-3.5 bg-aliceblue rounded-xl border border-timberwolf/50 space-y-1">
                <h4 className="font-bold text-midnight text-xs">Transaction & Ledger Data</h4>
                <p className="text-xs text-midnight/75">
                  Records of listing activation payments ($2.00 fee), consultation payments, expert payout credits (85%), platform commission entries (15%), and refund transactions. We do not store raw credit card numbers on our servers.
                </p>
              </div>

              <div className="p-3.5 bg-aliceblue rounded-xl border border-timberwolf/50 space-y-1">
                <h4 className="font-bold text-midnight text-xs">Communications & Verification Records</h4>
                <p className="text-xs text-midnight/75">
                  Transactional email delivery logs (OTP verification codes, password reset hashes, session receipts), in-app notifications, and review/rating feedback.
                </p>
              </div>
            </div>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight flex items-center gap-2">
              <Server className="w-4 h-4 text-moonstone" />
              <span>2. Technical & Device Information</span>
            </h2>
            <p>
              When you interact with the Platform, our servers automatically log technical metadata necessary to operate live WebRTC signaling and enforce security boundaries:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-midnight/80">
              <li><strong>Session Signaling:</strong> IP addresses and WebRTC room identifiers during active consultation calls to establish peer connections.</li>
              <li><strong>Authentication Tokens:</strong> Secure JSON Web Tokens (JWT) stored in your browser’s local storage to maintain session persistence.</li>
              <li><strong>Server Clock Timestamps:</strong> Precise server-side timestamps used to authoritatively track 10-minute SLA windows and live consultation duration.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight">
              3. How We Use Your Information
            </h2>
            <p>We process collected information strictly for the following purposes:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-midnight/80">
              <li>To provide, operate, and maintain the HireByMinutes marketplace.</li>
              <li>To verify email addresses via secure 6-digit one-time password (OTP) codes.</li>
              <li>To match clients with relevant expert service listings across worldwide categories.</li>
              <li>To calculate authoritative session fees, hold and release payments upon session completion, and credit expert payouts.</li>
              <li>To authenticate administrator actions and maintain immutable audit trails.</li>
              <li>To detect and prevent fraudulent account creation, spam listings, or platform abuse.</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight">
              4. How Information Is Shared
            </h2>
            <p>
              We do not sell, rent, or trade your personal information to third-party advertisers. Information is disclosed only in the following scenarios:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-midnight/80">
              <li><strong>Public Marketplace Profile:</strong> Your full name, username, headline, bio, country, languages, skills, rating, and published services are visible to other marketplace users. Your email address and password hash are strictly private.</li>
              <li><strong>Consultation Participants:</strong> When a consultation is booked, the client and expert receive necessary session identifiers and brief notes to conduct the meeting.</li>
              <li><strong>Legal & Compliance:</strong> When required by valid legal process, subpoena, or applicable regulatory authority.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight">
              5. Data Security & Storage
            </h2>
            <p>
              We implement industry-standard cryptographic and administrative protections:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-midnight/80">
              <li><strong>Password Hashing:</strong> Passwords are encrypted using salted bcrypt hashing. Plaintext passwords never touch database disk storage.</li>
              <li><strong>OTP Token Hashing:</strong> Email verification codes and password reset tokens are stored as cryptographic SHA-256 hashes with strict 10-minute and 30-minute expirations.</li>
              <li><strong>Role-Based Access Control (RBAC):</strong> Administrative endpoints and user database tables are guarded by server-side authorization middleware.</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight">
              6. Your Rights & Data Retention
            </h2>
            <p>
              You maintain control over your personal data on HireByMinutes:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-midnight/80">
              <li><strong>Access & Correction:</strong> You can review and update your profile details, bio, skills, and rates at any time via <Link to="/profile/edit" className="text-moonstone hover:underline font-semibold">Edit Profile</Link>.</li>
              <li><strong>Account Deletion:</strong> You may request account closure. Data is purged from active directories except where retention is required for legal tax records or financial audit trails.</li>
              <li><strong>Data Portability:</strong> You may request a structured export of your consultation history and ledger transactions.</li>
            </ul>
          </section>

          {/* Section 7 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight">
              7. Children's Privacy
            </h2>
            <p>
              The Platform is not directed to individuals under the age of 18. We do not knowingly collect personal information from minors. If we learn that a minor has registered an account, we will take immediate steps to remove the account and associated data.
            </p>
          </section>

          {/* Section 8 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight">
              8. Contact Our Privacy Team
            </h2>
            <p>
              If you have questions regarding this Privacy Policy or wish to exercise your data protection rights, please reach out to:
            </p>
            <div className="p-4 bg-aliceblue rounded-xl border border-timberwolf/50 space-y-1">
              <div className="font-bold text-midnight">HireByMinutes Privacy & Data Protection</div>
              <div className="text-xs text-midnight/70 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-moonstone" />
                <span>support@hirebyminutes.com</span>
              </div>
            </div>
          </section>

        </div>

      </div>
    </div>
  );
};
export default PrivacyPage;
