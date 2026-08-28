import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  ShieldCheck,
  CheckCircle2,
  DollarSign,
  AlertTriangle,
  FileCheck,
  Lock,
  Mail,
  Scale
} from 'lucide-react';

export const ExpertPolicyPage: React.FC = () => {
  useEffect(() => {
    document.title = 'Expert Policy — HireByMinutes';
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-aliceblue text-midnight py-10 sm:py-14">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Header Hero */}
        <div className="space-y-3 border-b border-timberwolf/60 pb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-moonstone/10 text-moonstone-dark text-xs font-bold border border-moonstone/30">
            <Award className="w-3.5 h-3.5 text-moonstone" />
            <span>Provider Standards & Guidelines</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-midnight">
            Expert & Service Provider Policy
          </h1>
          <p className="text-xs sm:text-sm text-midnight/70">
            <strong>Last Updated:</strong> August 28, 2026
          </p>
        </div>

        {/* Highlight Box */}
        <div className="p-4 rounded-xl bg-white border border-timberwolf/70 shadow-subtle flex items-start gap-3 text-xs text-midnight/80">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            As a verified Expert or Service Provider on HireByMinutes, you represent the highest standard of professional integrity. This policy outlines mandatory quality, conduct, pricing, and confidentiality standards for all practitioners offering consultative services.
          </p>
        </div>

        {/* Policy Content */}
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 sm:p-10 shadow-card space-y-8 text-xs sm:text-sm text-midnight/85 leading-relaxed">
          
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-moonstone" />
              <span>1. Profile Accuracy & Qualification Claims</span>
            </h2>
            <p>
              Clients rely on your stated background to make fast, high-stakes decisions. Experts must maintain strictly truthful and verifiable profile information:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-midnight/80">
              <li><strong>Verifiable Credentials:</strong> Stated job titles, years of experience, technical certifications, degrees, and past client track records must be factual.</li>
              <li><strong>Accurate Categorization:</strong> Service listings must be placed in relevant categories and subcategories accurately matching your actual practice area.</li>
              <li><strong>No Misrepresentation:</strong> Claiming expertise, licensure, or credentials that you do not possess is grounds for immediate account suspension and verification revocation.</li>
            </ul>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-moonstone" />
              <span>2. Pricing Transparency & The $2 Listing Fee</span>
            </h2>
            <p>
              HireByMinutes uses transparent, per-minute billing. Providers must adhere to transparent pricing rules:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-midnight/80">
              <li><strong>Explicit Per-Minute Rates:</strong> Rates must be clearly set (e.g. $1.50/min, $3.00/min) and reflect the total cost of consultative delivery during the session.</li>
              <li><strong>No Hidden Upcharges:</strong> You may not demand off-platform payments, hidden retainers, or unauthorized follow-up fees.</li>
              <li><strong>Listing Activation Fee ($2.00):</strong> Each published service requires a $2.00 cataloging activation fee (unless waived by platform administrator exception), which is non-refundable upon activation.</li>
              <li><strong>85% Payout Economics:</strong> Providers receive 85% of total completed session fees; the platform retains 15% for signaling infrastructure, payment processing, and dispute moderation.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight">
              3. Request Responsiveness & SLA Standards
            </h2>
            <p>
              To ensure high client satisfaction, consultation requests operate under active SLAs:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-midnight/80">
              <li><strong>10-Minute SLA Window:</strong> Review pending briefs promptly. If you cannot accommodate the client's timing or scope, decline the request so the client can find another expert without delay.</li>
              <li><strong>Punctuality:</strong> Once you accept a request and the client completes payment authorization, you are expected to enter the consultation room at the agreed time. Repeated no-shows will result in listing de-ranking or suspension.</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight flex items-center gap-2">
              <Lock className="w-4 h-4 text-moonstone" />
              <span>4. Confidentiality & Intellectual Property</span>
            </h2>
            <p>
              During consultations, clients may share proprietary code, confidential business roadmaps, financial metrics, or unreleased designs:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-midnight/80">
              <li><strong>Strict Confidentiality:</strong> Experts must maintain the confidentiality of all non-public information disclosed during consultation sessions.</li>
              <li><strong>Client IP Ownership:</strong> Any custom advice, diagnostic scripts, or tailored deliverables created specifically for the client during the paid minutes belong exclusively to the client.</li>
              <li><strong>No Unauthorized Recording:</strong> Neither party may record sessions without the express prior consent of all participants.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span>5. Prohibited Services & Regulated Advice</span>
            </h2>
            <p>
              The following types of services are strictly prohibited on HireByMinutes:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-midnight/80">
              <li>Providing certified medical, diagnostic, psychiatric, or prescription treatment advice.</li>
              <li>Providing formal legal representation or binding legal opinions unless practicing under appropriate jurisdiction-specific client retainer agreements.</li>
              <li>Providing guaranteed financial, securities, investment, or get-rich-quick advice.</li>
              <li>Academic dishonesty, assisting with live graded exams, or creating malicious software/exploits.</li>
              <li>Any activity violating local, state, national, or international law.</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight">
              6. Responsibility for Advice & Legal Independence
            </h2>
            <p>
              As an independent expert, you are solely responsible for the technical accuracy, soundness, and professional quality of the guidance and recommendations you provide. HireByMinutes does not endorse, guarantee, or assume liability for the outcomes of consultative advice delivered by independent providers.
            </p>
          </section>

          {/* Section 7 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight">
              7. Enforcement & Verification Status
            </h2>
            <p>
              Platform administrators monitor marketplace reports, review scores, cancellation frequency, and audit logs. Violations of this policy may result in:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-midnight/80">
              <li>Temporary or permanent revocation of the verified expert badge.</li>
              <li>Deactivation or removal of published service listings.</li>
              <li>Temporary holding of pending payout disbursements during active dispute investigation.</li>
              <li>Permanent account suspension across the HireByMinutes platform.</li>
            </ul>
          </section>

          {/* Section 8 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight">
              8. Contact the Provider Operations Team
            </h2>
            <p>
              If you have questions about your verification status, listing requirements, or payout inquiries:
            </p>
            <div className="p-4 bg-aliceblue rounded-xl border border-timberwolf/50 space-y-1">
              <div className="font-bold text-midnight">HireByMinutes Expert Operations</div>
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
export default ExpertPolicyPage;
