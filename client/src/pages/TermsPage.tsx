import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Shield,
  Clock,
  IndianRupee,
  AlertCircle,
  CheckCircle2,
  Mail,
  Scale
} from 'lucide-react';
import { usePageSEO } from '../hooks/usePageSEO';

export const TermsPage: React.FC = () => {
  usePageSEO({
    title: 'Terms of Service — HireByMinute',
    description: 'Read the Terms of Service governing your use of the HireByMinute consultation marketplace and per-minute billing platform.',
    canonicalPath: '/terms'
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-aliceblue text-midnight py-10 sm:py-14">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Header Hero */}
        <div className="space-y-3 border-b border-timberwolf/60 pb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-moonstone/10 text-moonstone-dark text-xs font-bold border border-moonstone/30">
            <Scale className="w-3.5 h-3.5 text-moonstone" />
            <span>Platform Agreement</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-midnight">
            Terms of Service
          </h1>
          <p className="text-xs sm:text-sm text-midnight/70">
            <strong>Last Updated:</strong> August 28, 2026
          </p>
        </div>

        {/* Legal Disclaimer Note */}
        <div className="p-4 rounded-xl bg-white border border-timberwolf/70 shadow-subtle flex items-start gap-3 text-xs text-midnight/80">
          <AlertCircle className="w-4 h-4 text-moonstone shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Please read these Terms of Service carefully before creating an account, requesting a consultation, or listing expert services on HireByMinute. By accessing or using the platform, you agree to be bound by these Terms.
          </p>
        </div>

        {/* Content Container */}
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 sm:p-10 shadow-card space-y-8 text-xs sm:text-sm text-midnight/85 leading-relaxed">
          
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight flex items-center gap-2">
              <span>1. Acceptance of Terms & Eligibility</span>
            </h2>
            <p>
              These Terms of Service ("Terms") govern your access to and use of the HireByMinute platform, including all related websites, applications, signaling services, and communication features (collectively, the "Platform").
            </p>
            <p>
              By registering an account, purchasing minute credits, or offering services, you represent and warrant that you are at least 18 years of age (or the legal age of majority in your jurisdiction) and possess the legal capacity to enter into binding contracts. If you are using the Platform on behalf of an entity, you represent that you are authorized to bind that entity to these Terms.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight">
              2. Account Registration & Security
            </h2>
            <p>
              To access core features of the Platform, you must create an account. When registering, you agree to provide accurate, current, and complete information, including a valid email address and legal name.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-midnight/80">
              <li>You are solely responsible for maintaining the confidentiality of your authentication credentials.</li>
              <li>You must immediately notify HireByMinute of any unauthorized use or suspected security breach of your account.</li>
              <li>Usernames assigned upon registration are permanent identifiers and cannot be altered or transferred to third parties.</li>
              <li>HireByMinute reserves the right to suspend or terminate accounts that contain false, misleading, or fraudulent information.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight">
              3. Marketplace Model & Roles
            </h2>
            <p>
              HireByMinute operates as a two-sided marketplace connecting clients seeking consultative advice ("Clients") with independent professionals and domain experts ("Service Providers" or "Experts").
            </p>
            <p>
              <strong>Independent Contractor Relationship:</strong> Experts are independent third parties and are not employees, agents, joint venturers, or partners of HireByMinute. HireByMinute does not supervise, direct, or control the professional opinions, technical solutions, or consultative deliverables provided during sessions.
            </p>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight">
              4. Service Listings & Pricing
            </h2>
            <p>
              Experts may create service listings specifying their domain of expertise, description of consultative scope, and a transparent per-minute rate denominated in Indian Rupees (INR ₹).
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-midnight/80">
              <li><strong>Listing Activation Fee:</strong> A one-time administrative fee of ₹2.00 applies when publishing a new service to maintain marketplace quality and cover cataloging, unless waived by administrative discretion.</li>
              <li><strong>Price per Minute:</strong> All consultations are billed strictly on a per-minute basis. Rates must be accurate and non-misleading.</li>
              <li><strong>Listing Modifications:</strong> Experts may update their service title, description, or per-minute rate through their provider dashboard. New rates apply exclusively to subsequent consultation requests.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight">
              5. Consultation Requests & Approval-First Workflow
            </h2>
            <p>
              To initiate a consultation, a Client submits a Consultation Request designating the desired service, requested duration (in minutes), and contextual project notes.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-midnight/80">
              <li><strong>10-Minute Response Window:</strong> The requested Expert has a server-authoritative 10-minute response window to review the request notes and either accept or decline the session.</li>
              <li><strong>Zero Early Charges:</strong> No payment is charged to the Client while the request remains in the pending state.</li>
              <li><strong>Expiration & Decline:</strong> If the Expert declines or the 10-minute countdown expires without response, the request is cancelled with zero financial impact to the Client.</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight">
              6. Payments, Hold & Release Workflow & Platform Economics
            </h2>
            <p>
              Upon an Expert's acceptance of a Consultation Request, the Client completes payment for the total duration price (Duration in Minutes × Price per Minute).
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-midnight/80">
              <li><strong>Payment Hold:</strong> Client funds are held securely upon authorization for the duration of the scheduled consultation.</li>
              <li><strong>Expert Payout (85%):</strong> Upon server-validated completion of the session, eighty-five percent (85%) of the consultation fee is credited to the verified Expert's payout ledger balance.</li>
              <li><strong>Platform Commission (15%):</strong> HireByMinute retains fifteen percent (15%) of the completed session amount to maintain real-time signaling servers, payment processing, fraud mitigation, and dispute handling.</li>
            </ul>
          </section>

          {/* Section 7 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight">
              7. Consultation Sessions & Timing Authority
            </h2>
            <p>
              Live consultation rooms feature real-time video, audio, messaging, and screen sharing capabilities.
            </p>
            <p>
              <strong>Server-Authoritative Clocks:</strong> Session timers, start timestamps, elapsed minutes, and expiration triggers are governed authoritatively by the platform server clock. Local device time discrepancies do not alter the duration or financial calculation of any session.
            </p>
          </section>

          {/* Section 8 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight">
              8. Cancellations, Refunds & Dispute Resolution
            </h2>
            <p>
              Cancellations and refund requests are governed by our dedicated <Link to="/refund-policy" className="text-moonstone hover:underline font-semibold">Refund & Cancellation Policy</Link>.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-midnight/80">
              <li>If an Expert fails to attend an accepted, paid session, the full payment is refunded to the Client.</li>
              <li>If an unresolvable technical malfunction prevents the session from taking place, administrative dispute logs determine proportionate refund or session re-scheduling.</li>
              <li>Completed sessions in which both parties participated for the agreed duration are non-refundable once payment is released, absent substantiated fraud.</li>
            </ul>
          </section>

          {/* Section 9 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight">
              9. Prohibited Conduct & Content
            </h2>
            <p>
              Users agree not to engage in any prohibited activity as outlined in our <Link to="/acceptable-use" className="text-moonstone hover:underline font-semibold">Acceptable Use Policy</Link>, including but not limited to:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-midnight/80">
              <li>Providing illegal, regulated, or fraudulent advice without requisite professional licenses.</li>
              <li>Circumventing platform payment protocols by arranging off-platform transactions.</li>
              <li>Harassing, threatening, defaming, or discriminating against any user.</li>
              <li>Attempting to manipulate marketplace ratings, review scores, or expert verification badges.</li>
              <li>Reverse-engineering, scraping, or launching automated attacks against the Platform infrastructure.</li>
            </ul>
          </section>

          {/* Section 10 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight">
              10. Limitation of Liability & Disclaimers
            </h2>
            <p>
              THE PLATFORM IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. HIREBYMINUTES EXPRESSLY DISCLAIMS ALL WARRANTIES, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            </p>
            <p>
              IN NO EVENT SHALL HIREBYMINUTES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE PLATFORM OR ANY CONSULTATION CONDUCTED THROUGH IT. OUR TOTAL AGGREGATE LIABILITY SHALL NOT EXCEED THE TOTAL FEES PAID OR RECEIVED BY YOU THROUGH THE PLATFORM IN THE THREE (3) MONTHS PRECEDING THE CLAIM.
            </p>
          </section>

          {/* Section 11 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight">
              11. Governing Law & Jurisdiction
            </h2>
            <p>
              These Terms are governed by and construed in accordance with the laws applicable to the jurisdiction in which HireByMinute operates, without giving effect to any conflict of law principles. Any dispute arising under these Terms shall be resolved in the competent courts of that jurisdiction.
            </p>
          </section>

          {/* Section 12 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight">
              12. Contact Information
            </h2>
            <p>
              For legal inquiries, policy questions, or formal notices regarding these Terms, please contact:
            </p>
            <div className="p-4 bg-aliceblue rounded-xl border border-timberwolf/50 space-y-1">
              <div className="font-bold text-midnight">HireByMinute Legal & Policy Team</div>
              <div className="text-xs text-midnight/70 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-moonstone" />
                <span>support@hirebyminute.com</span>
              </div>
            </div>
          </section>

        </div>

      </div>
    </div>
  );
};
export default TermsPage;
