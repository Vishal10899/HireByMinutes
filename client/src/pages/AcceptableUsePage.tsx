import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldAlert,
  Ban,
  AlertOctagon,
  EyeOff,
  UserX,
  Flag,
  Mail,
  ShieldCheck
} from 'lucide-react';

export const AcceptableUsePage: React.FC = () => {
  useEffect(() => {
    document.title = 'Acceptable Use Policy — HireByMinutes';
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-aliceblue text-midnight py-10 sm:py-14">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Header Hero */}
        <div className="space-y-3 border-b border-timberwolf/60 pb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-moonstone/10 text-moonstone-dark text-xs font-bold border border-moonstone/30">
            <ShieldAlert className="w-3.5 h-3.5 text-moonstone" />
            <span>Community Standards & Safety</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-midnight">
            Acceptable Use & Community Policy
          </h1>
          <p className="text-xs sm:text-sm text-midnight/70">
            <strong>Last Updated:</strong> August 28, 2026
          </p>
        </div>

        {/* Highlight Box */}
        <div className="p-4 rounded-xl bg-white border border-timberwolf/70 shadow-subtle flex items-start gap-3 text-xs text-midnight/80">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            HireByMinutes is dedicated to providing a safe, trustworthy, and productive marketplace for knowledge exchange. This Acceptable Use Policy defines strictly prohibited activities and outlines our reporting and enforcement mechanisms.
          </p>
        </div>

        {/* Policy Content */}
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 sm:p-10 shadow-card space-y-8 text-xs sm:text-sm text-midnight/85 leading-relaxed">
          
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight flex items-center gap-2">
              <Ban className="w-4 h-4 text-rose-600" />
              <span>1. Fraudulent Activities & Marketplace Manipulation</span>
            </h2>
            <p>
              We maintain zero tolerance for actions intended to deceive other users, falsify metrics, or manipulate platform financial systems:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-midnight/80">
              <li><strong>Impersonation:</strong> Creating accounts claiming to represent another individual, company, organization, or authority without explicit written authorization.</li>
              <li><strong>Fake Reviews & Ratings:</strong> Creating dummy accounts, engaging in review swapping, or purchasing artificial positive ratings.</li>
              <li><strong>Payment Circumvention:</strong> Soliciting or accepting off-platform payments (e.g. crypto, cash, direct bank wires) to circumvent platform protections and fees.</li>
              <li><strong>Marketplace Deception:</strong> Creating misleading service titles or inflated rates with intent to defraud consultation participants.</li>
            </ul>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight flex items-center gap-2">
              <UserX className="w-4 h-4 text-rose-600" />
              <span>2. Harassment, Discrimination & Harmful Behavior</span>
            </h2>
            <p>
              All interactions on HireByMinutes—including consultation chats, video calls, messages, and profile content—must remain professional and respectful:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-midnight/80">
              <li><strong>Harassment & Threats:</strong> Engaging in intimidation, stalking, abusive language, extortion, or threats of violence.</li>
              <li><strong>Hate Speech:</strong> Promoting discrimination, disparagement, or hatred against individuals based on race, ethnicity, nationality, religion, gender, sexual orientation, disability, or age.</li>
              <li><strong>Doxxing & Privacy Invasions:</strong> Publishing, sharing, or threatening to expose another user's personal private information (e.g. home address, personal phone number, private financial data) without consent.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-rose-600" />
              <span>3. Illegal Content & Unauthorized Services</span>
            </h2>
            <p>
              You may not use HireByMinutes to promote, offer, or facilitate:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-midnight/80">
              <li>Any activity that violates local, national, or international laws or regulations.</li>
              <li>The creation, dissemination, or utilization of malware, ransomware, exploits, or unlicensed surveillance tools.</li>
              <li>Copyright infringement, intellectual property piracy, or unauthorized distribution of proprietary trade secrets.</li>
              <li>Adult services, explicit sexual content, or unregulated gambling promotions.</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-rose-600" />
              <span>4. Technical Abuse & System Security</span>
            </h2>
            <p>
              Users are prohibited from interfering with or compromising platform technical infrastructure:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-midnight/80">
              <li>Attempting to bypass authentication mechanisms, manipulate JWT tokens, or escalate user role privileges.</li>
              <li>Launching automated scraping bots, mass registration scripts, or denial-of-service (DoS) attacks against our servers.</li>
              <li>Tampering with WebRTC session signaling or attempting to disrupt server-authoritative timer countdowns.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight flex items-center gap-2">
              <Flag className="w-4 h-4 text-moonstone" />
              <span>5. Reporting Violations & Safety Moderation</span>
            </h2>
            <p>
              If you encounter a user, profile, or service listing that violates this policy, you are encouraged to report it immediately:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-midnight/80">
              <li><strong>In-App Reporting:</strong> Use the report flag on any service detail page or session room to alert our administrative moderation team.</li>
              <li><strong>Direct Safety Email:</strong> Send evidence, screenshots, or transaction details to <span className="font-mono text-moonstone-dark font-semibold">support@hirebyminutes.com</span>.</li>
              <li><strong>Investigation SLA:</strong> Safety reports are reviewed by platform administrators within 24 hours.</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight">
              6. Enforcement Consequences
            </h2>
            <p>
              When a violation of this policy is confirmed, HireByMinutes may take disciplinary actions commensurate with the severity of the infraction:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-midnight/80">
              <li>Formal warning and required remediation of profile content.</li>
              <li>Immediate deactivation or permanent removal of offending service listings.</li>
              <li>Freezing of pending payment balances involved in disputed or fraudulent consultations.</li>
              <li>Permanent account suspension and IP-level network blocking.</li>
              <li>Referral to relevant law enforcement agencies in cases of severe cybercrime, extortion, or physical threats.</li>
            </ul>
          </section>

          {/* Section 7 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight">
              7. Contact Our Trust & Safety Team
            </h2>
            <p>
              For urgent safety reports or questions regarding this Acceptable Use Policy:
            </p>
            <div className="p-4 bg-aliceblue rounded-xl border border-timberwolf/50 space-y-1">
              <div className="font-bold text-midnight">HireByMinutes Trust & Safety Moderation</div>
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
export default AcceptableUsePage;
