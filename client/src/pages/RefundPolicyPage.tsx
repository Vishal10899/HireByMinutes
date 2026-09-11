import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  CreditCard,
  Mail,
  DollarSign
} from 'lucide-react';

export const RefundPolicyPage: React.FC = () => {
  useEffect(() => {
    document.title = 'Refund & Cancellation Policy — HireByMinute';
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-aliceblue text-midnight py-10 sm:py-14">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Header Hero */}
        <div className="space-y-3 border-b border-timberwolf/60 pb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-moonstone/10 text-moonstone-dark text-xs font-bold border border-moonstone/30">
            <RotateCcw className="w-3.5 h-3.5 text-moonstone" />
            <span>Payment & Cancellation Protections</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-midnight">
            Refund & Cancellation Policy
          </h1>
          <p className="text-xs sm:text-sm text-midnight/70">
            <strong>Last Updated:</strong> August 28, 2026
          </p>
        </div>

        {/* Protection Summary Box */}
        <div className="p-4 rounded-xl bg-white border border-timberwolf/70 shadow-subtle flex items-start gap-3 text-xs text-midnight/80">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            All consultation payments on HireByMinute follow a server-authoritative hold and release workflow. Funds are held securely upon client payment authorization and are only disbursed to the provider once the agreed consultation minutes have successfully concluded.
          </p>
        </div>

        {/* Policy Content */}
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-6 sm:p-10 shadow-card space-y-8 text-xs sm:text-sm text-midnight/85 leading-relaxed">
          
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight flex items-center gap-2">
              <Clock className="w-4 h-4 text-moonstone" />
              <span>1. Pre-Payment Request Cancellation</span>
            </h2>
            <p>
              When a Client submits a Consultation Request, the request enters the <code>PENDING_EXPERT</code> status with a 10-minute server-authoritative response countdown.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-midnight/80">
              <li><strong>Zero Upfront Charge:</strong> The Client is not billed while a request is pending expert review.</li>
              <li><strong>Automatic Expiration:</strong> If the Expert does not accept within the 10-minute SLA window, the request automatically expires with zero financial impact.</li>
              <li><strong>Expert Decline:</strong> If an Expert declines the brief, the request is immediately terminated with zero fees charged.</li>
            </ul>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-moonstone" />
              <span>2. Post-Payment Hold & Refund Eligibility</span>
            </h2>
            <p>
              Once an Expert accepts a request and the Client completes payment, the session enters the <code>ACTIVE</code> status and funds are held securely.
            </p>
            
            <div className="space-y-3 pt-2">
              <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200/80 space-y-1">
                <h4 className="font-bold text-emerald-900 text-xs flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Full 100% Refund Scenarios</span>
                </h4>
                <ul className="list-disc pl-4 text-xs text-emerald-950 space-y-1 pt-1">
                  <li><strong>Expert Non-Attendance:</strong> If the Expert fails to enter or participate in the scheduled consultation room.</li>
                  <li><strong>Technical Infrastructure Failure:</strong> If severe platform WebRTC or server signaling errors prevent the consultation from taking place.</li>
                  <li><strong>Duplicate Transaction:</strong> In the rare event of duplicate payment processing due to network latency, duplicate charges are immediately refunded.</li>
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-aliceblue border border-timberwolf/50 space-y-1">
                <h4 className="font-bold text-midnight text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-moonstone" />
                  <span>Non-Refundable Scenarios</span>
                </h4>
                <ul className="list-disc pl-4 text-xs text-midnight/75 space-y-1 pt-1">
                  <li><strong>Completed Consultations:</strong> Sessions that have fully concluded with both parties present for the booked duration are settled irrevocably to the Expert (85%) and Platform (15%).</li>
                  <li><strong>Client No-Show:</strong> If a Client fails to join the consultation room after the Expert has joined and made themselves available for the agreed duration.</li>
                  <li><strong>Subjective Satisfaction Disputes:</strong> Dissatisfaction with consultative feedback that was delivered professionally and within the agreed scope is not grounds for an automatic refund.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-moonstone" />
              <span>3. Service Listing Activation Fee Policy</span>
            </h2>
            <p>
              The $2.00 listing fee is a one-time administrative cataloging fee charged when an Expert publishes a new service.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-midnight/80">
              <li>Listing fees cover catalog indexing, database hosting, and spam mitigation.</li>
              <li>Once a service listing is activated and published to the public marketplace, the $2.00 listing fee is non-refundable.</li>
              <li>Administrative exceptions ($0 fee waivers) applied by platform administrators carry no fee balance and are non-convertible.</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight">
              4. Dispute Resolution Process
            </h2>
            <p>
              If an unexpected issue arises during a live consultation (e.g. abrupt disconnection or scope misalignment), follow these steps:
            </p>
            <ol className="list-decimal pl-5 space-y-1.5 text-midnight/80">
              <li><strong>In-Room Communication:</strong> Communicate immediately via in-room messaging to attempt reconnection.</li>
              <li><strong>Submit a Support Ticket:</strong> If the issue cannot be resolved, contact our support team within 24 hours of session conclusion at <span className="font-mono text-moonstone-dark font-semibold">support@hirebyminute.com</span>.</li>
              <li><strong>Audit Log Review:</strong> Our administrative team reviews the session duration logs, connection timestamps, and chat transcripts to issue an objective ruling (e.g. full refund, partial credit, or payment release).</li>
            </ol>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight">
              5. Refund Processing Timeline
            </h2>
            <p>
              Approved refunds are credited back to the original payment method used during checkout. Refund processing typically reflects in your financial institution within 3 to 7 business days, depending on your bank's settlement cycle.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-midnight">
              6. Contact Support for Payment Inquiries
            </h2>
            <p>
              To report a duplicate charge, request a payment dispute review, or ask a billing question:
            </p>
            <div className="p-4 bg-aliceblue rounded-xl border border-timberwolf/50 space-y-1">
              <div className="font-bold text-midnight">HireByMinute Billing & Payment Support</div>
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
export default RefundPolicyPage;
