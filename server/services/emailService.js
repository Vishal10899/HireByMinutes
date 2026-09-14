// HireByMinute — Production Email Service & Template Engine
// Handles transactional emails, OTP delivery, password reset, and notification workflows
// Provides safe development fallbacks and isolated provider adapters

const crypto = require('crypto');

class EmailService {
  constructor() {
    this.db = null; // Injected on startup
  }

  init(dbInstance) {
    this.db = dbInstance;
  }

  getConfig() {
    const apiKey = (process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY || '').trim();
    let provider = process.env.EMAIL_PROVIDER;
    if (!provider) {
      provider = apiKey ? 'resend' : 'development_console';
    }

    const fromEnv = process.env.EMAIL_FROM ? process.env.EMAIL_FROM.trim() : '';
    const from = fromEnv || 'HireByMinute <no-reply@hirebyminute.com>';

    return {
      enabled: process.env.EMAIL_ENABLED !== 'false',
      provider,
      from,
      fromName: process.env.EMAIL_FROM_NAME || 'HireByMinute',
      replyTo: process.env.EMAIL_REPLY_TO || 'support@hirebyminute.com',
      apiKey,
      clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173'
    };
  }

  // Base email dispatcher
  async sendMail({ to, subject, template = 'custom', html, text, userId = null }) {
    const config = this.getConfig();
    const messageId = `msg-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    let providerMessageId = messageId;
    let status = 'SENT';
    let errorMessage = null;

    if (!config.enabled) {
      console.log(`[EmailService] Email delivery disabled by configuration (EMAIL_ENABLED=false). Skipped: ${subject} -> ${to}`);
      return { success: true, messageId, status: 'SKIPPED' };
    }

    try {
      // Use real provider if apiKey is present and provider is not development_console
      if (config.apiKey && config.provider !== 'development_console') {
        if (config.provider === 'resend') {
          // Native Resend HTTP API Call
          let sendFrom = config.from;
          let response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${config.apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: sendFrom,
              to: [to],
              reply_to: config.replyTo,
              subject,
              html,
              text
            })
          });

          let resData = await response.json().catch(() => ({}));

          // Handle Resend 403 unverified custom domain by retrying with verified sandbox sender
          if (!response.ok && response.status === 403 && sendFrom !== 'HireByMinute <onboarding@resend.dev>') {
            const errStr = JSON.stringify(resData).toLowerCase();
            if (errStr.includes('domain') || errStr.includes('verify') || errStr.includes('validation')) {
              console.warn(`[EmailService] Resend unverified domain detected for "${sendFrom}". Retrying with "HireByMinute <onboarding@resend.dev>"...`);
              sendFrom = 'HireByMinute <onboarding@resend.dev>';
              response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${config.apiKey}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  from: sendFrom,
                  to: [to],
                  reply_to: config.replyTo,
                  subject,
                  html,
                  text
                })
              });
              resData = await response.json().catch(() => ({}));
            }
          }

          if (!response.ok) {
            const errDetail = resData.message || resData.error || JSON.stringify(resData);
            throw new Error(`Resend provider error (${response.status}): ${errDetail}`);
          }

          if (resData && resData.id) {
            providerMessageId = resData.id;
          }
          console.log(`[EmailService] Dispatched via Resend: ${providerMessageId} to ${to} (${subject})`);
        } else if (config.provider === 'sendgrid') {
          // Native SendGrid v3 API Call
          const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${config.apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: to }] }],
              from: { email: config.from.replace(/.*<([^>]+)>.*/, '$1') || config.from, name: config.fromName },
              reply_to: { email: config.replyTo },
              subject,
              content: [
                { type: 'text/plain', value: text },
                { type: 'text/html', value: html }
              ]
            })
          });
          if (!response.ok) {
            const errData = await response.text();
            throw new Error(`SendGrid provider error: ${errData}`);
          }
        } else {
          // Generic production dispatch log
          console.log(`[EmailService] Production dispatch via provider "${config.provider}" to ${to} (${subject})`);
        }
      } else {
        // Development console mode: display OTP and email content clearly in terminal for local testing
        console.log(`\n================== [HIREBYMINUTE EMAIL DISPATCH] ==================`);
        console.log(`TEMPLATE: ${template}`);
        console.log(`TO:       ${to}`);
        console.log(`FROM:     ${config.from}`);
        console.log(`SUBJECT:  ${subject}`);
        console.log(`--------------------------------------------------------------------`);
        console.log(text.trim());
        console.log(`====================================================================\n`);
      }
    } catch (err) {
      status = 'FAILED';
      errorMessage = err.message;
      console.error(`[EmailService Error] Failed to dispatch email to ${to}:`, err.message);
    }

    // Persist safe audit log in database (Never storing OTPs or passwords)
    if (this.db) {
      try {
        this.db.prepare(`
          INSERT INTO email_logs (id, user_id, recipient, template, subject, status, provider_message_id, error_message)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(messageId, userId, to, template, subject, status, providerMessageId, errorMessage);
      } catch (logErr) {
        // Non-blocking log error
      }
    }

    return {
      success: status === 'SENT',
      messageId: providerMessageId,
      status,
      error: errorMessage
    };
  }

  // --- BRANDED HTML TEMPLATE WRAPPER ---
  wrapHtml({ title, preheader = '', contentHtml, ctaText = null, ctaUrl = null, warningNote = null }) {
    const config = this.getConfig();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #E9F1F6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #004554; }
    .container { max-width: 580px; margin: 30px auto; background: #ffffff; border-radius: 16px; border: 1px solid #D3D0C8; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 69, 84, 0.05); }
    .header { background-color: #004554; padding: 24px 32px; text-align: left; }
    .header-logo { color: #E9F1F6; font-size: 20px; font-weight: 800; text-decoration: none; letter-spacing: -0.5px; }
    .header-tagline { color: #B2D5E2; font-size: 11px; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
    .body { padding: 32px; }
    .title { font-size: 20px; font-weight: 800; color: #004554; margin: 0 0 16px 0; }
    .paragraph { font-size: 14px; line-height: 1.6; color: #1e3a42; margin: 0 0 16px 0; }
    .code-box { background: #E9F1F6; border: 1px solid #B2D5E2; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
    .code-digits { font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #004554; font-family: monospace; }
    .info-card { background: #F4F8FA; border: 1px solid #D3D0C8; border-radius: 12px; padding: 18px; margin: 20px 0; font-size: 13px; line-height: 1.5; }
    .info-row { margin-bottom: 8px; }
    .info-row:last-child { margin-bottom: 0; }
    .cta-btn { display: inline-block; background-color: #004554; color: #E9F1F6 !important; text-decoration: none; font-size: 14px; font-weight: 700; padding: 12px 28px; border-radius: 10px; margin: 16px 0; }
    .warning { font-size: 12px; color: #667085; line-height: 1.5; margin-top: 20px; border-top: 1px solid #E9F1F6; padding-top: 16px; }
    .footer { background-color: #F8FAFC; padding: 20px 32px; font-size: 11px; color: #8898AA; text-align: center; border-top: 1px solid #E9F1F6; }
  </style>
</head>
<body>
  <div style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${preheader}
  </div>
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #E9F1F6; padding: 20px 0;">
    <tr>
      <td align="center">
        <div class="container">
          <div class="header">
            <a href="${config.clientOrigin}" class="header-logo">HireByMinute</a>
            <div class="header-tagline">Worldwide Expert Consultations by the Minute</div>
          </div>
          <div class="body">
            <h1 class="title">${title}</h1>
            ${contentHtml}
            ${ctaText && ctaUrl ? `
              <div style="text-align: left; margin: 20px 0;">
                <a href="${ctaUrl}" class="cta-btn">${ctaText} &rarr;</a>
              </div>
            ` : ''}
            ${warningNote ? `<div class="warning">${warningNote}</div>` : ''}
          </div>
          <div class="footer">
            <p style="margin: 0 0 6px 0;">© 2026 HireByMinute Inc. All rights reserved.</p>
            <p style="margin: 0;">This is an automated transactional message. Please do not reply directly.</p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  // =========================================================================
  // 1. EMAIL VERIFICATION OTP
  // =========================================================================
  async sendVerificationOtp({ email, name, otp, expiryMinutes = 10, userId = null }) {
    const subject = 'Verify your HireByMinute account';
    const preheader = `Your 6-digit verification code is ${otp}. Valid for ${expiryMinutes} minutes.`;

    const contentHtml = `
      <p class="paragraph">Hi <strong>${name || 'there'}</strong>,</p>
      <p class="paragraph">Welcome to HireByMinute. Please use the following one-time verification code to confirm your email address and activate your account:</p>
      <div class="code-box">
        <span class="code-digits">${otp}</span>
      </div>
      <p class="paragraph" style="font-size: 13px; color: #555;">⏱ This verification code will expire in <strong>${expiryMinutes} minutes</strong>.</p>
    `;

    const text = `Hi ${name || 'there'},

Welcome to HireByMinute.

Your 6-digit verification code is: ${otp}

This code expires in ${expiryMinutes} minutes.

If you did not create this account, you can safely ignore this email.

HireByMinute Team`;

    return this.sendMail({
      to: email,
      subject,
      template: 'verify_email_otp',
      html: this.wrapHtml({
        title: 'Verify Your Email Address',
        preheader,
        contentHtml,
        warningNote: 'If you did not sign up for HireByMinute, you can safely disregard this email.'
      }),
      text,
      userId
    });
  }

  // =========================================================================
  // 2. PASSWORD RESET TOKEN EMAIL
  // =========================================================================
  async sendPasswordReset({ email, name, resetToken, expiryMinutes = 30, userId = null }) {
    const config = this.getConfig();
    const resetUrl = `${config.clientOrigin}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;
    const subject = 'Reset your HireByMinute password';
    const preheader = `Follow this link to securely reset your password within ${expiryMinutes} minutes.`;

    const contentHtml = `
      <p class="paragraph">Hi <strong>${name || 'there'}</strong>,</p>
      <p class="paragraph">We received a request to reset the password for your HireByMinute account. Click the button below to choose a new password:</p>
      <p class="paragraph" style="font-size: 13px; color: #555;">⏱ This password reset link is valid for <strong>${expiryMinutes} minutes</strong> and can only be used once.</p>
    `;

    const text = `Hi ${name || 'there'},

We received a request to reset the password for your HireByMinute account.

Reset your password using the link below:
${resetUrl}

This link expires in ${expiryMinutes} minutes.

If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.

HireByMinute Team`;

    return this.sendMail({
      to: email,
      subject,
      template: 'password_reset',
      html: this.wrapHtml({
        title: 'Reset Your Password',
        preheader,
        contentHtml,
        ctaText: 'Reset Password',
        ctaUrl: resetUrl,
        warningNote: 'If you did not request this password reset, please ensure your account credentials are secure.'
      }),
      text,
      userId
    });
  }

  // =========================================================================
  // 3. CONSULTATION REQUEST CREATED -> EXPERT
  // =========================================================================
  async sendConsultationRequest({
    expertEmail,
    expertName,
    clientName,
    serviceTitle,
    durationMinutes,
    connectType,
    problemDescription,
    ratePerMinute,
    totalPrice,
    requestId,
    expertId
  }) {
    const config = this.getConfig();
    const actionUrl = `${config.clientOrigin}/provider`;
    const timeDisplay = connectType === 'now' ? '⚡ Connect Now (Immediate On-Demand)' : '📅 Scheduled Consultation';
    const subject = `New consultation request from ${clientName} on HireByMinute`;
    const preheader = `${clientName} requested a ${durationMinutes}-min consultation for "${serviceTitle}". Respond within 10 mins.`;

    const contentHtml = `
      <p class="paragraph">Hi <strong>${expertName}</strong>,</p>
      <p class="paragraph"><strong>${clientName}</strong> has sent you a new consultation request on HireByMinute:</p>
      
      <div class="info-card">
        <div class="info-row"><strong>Service:</strong> ${serviceTitle}</div>
        <div class="info-row"><strong>Requested Duration:</strong> ${durationMinutes} minutes</div>
        <div class="info-row"><strong>Rate:</strong> $${Number(ratePerMinute).toFixed(2)} / min &nbsp;•&nbsp; <strong>Estimated Total:</strong> $${Number(totalPrice).toFixed(2)}</div>
        <div class="info-row"><strong>Type:</strong> ${timeDisplay}</div>
        <div class="info-row" style="margin-top: 8px; border-top: 1px dashed #D3D0C8; padding-top: 8px;">
          <strong>Client's Problem Topic:</strong><br>
          <span style="color: #444; font-style: italic;">"${problemDescription}"</span>
        </div>
      </div>

      <div style="background: #FFF9EB; border: 1px solid #FFE4A0; padding: 12px 16px; border-radius: 8px; font-size: 13px; color: #8A6100; margin: 16px 0;">
        ⏱ <strong>10-Minute Response Window:</strong> Please accept or decline before the 10-minute timer expires.<br>
        <strong>Notice:</strong> No payment has been taken from the client yet. Payment is held in escrow upon your acceptance.
      </div>
    `;

    const text = `Hi ${expertName},

${clientName} has sent you a ${durationMinutes}-minute consultation request for "${serviceTitle}".

Details:
- Duration: ${durationMinutes} minutes
- Rate: $${Number(ratePerMinute).toFixed(2)}/min (Est Total: $${Number(totalPrice).toFixed(2)})
- Type: ${timeDisplay}
- Client Topic: "${problemDescription}"

Please review and respond within 10 minutes:
${actionUrl}

Notice: No payment has been taken from the client yet.

HireByMinute Team`;

    return this.sendMail({
      to: expertEmail,
      subject,
      template: 'consultation_request',
      html: this.wrapHtml({
        title: 'New Consultation Request',
        preheader,
        contentHtml,
        ctaText: 'Review & Accept Request',
        ctaUrl: actionUrl,
        warningNote: 'If you do not accept within 10 minutes, the request will automatically expire and the client will be notified.'
      }),
      text,
      userId: expertId
    });
  }

  // Alias for backward compatibility
  async sendNewConsultationRequest(params) {
    return this.sendConsultationRequest(params);
  }

  // =========================================================================
  // 4. CONSULTATION ACCEPTED -> CLIENT
  // =========================================================================
  async sendConsultationAccepted({
    clientEmail,
    clientName,
    expertName,
    serviceTitle,
    durationMinutes,
    totalPrice,
    requestId,
    clientId
  }) {
    const config = this.getConfig();
    const actionUrl = `${config.clientOrigin}/client`;
    const subject = `${expertName} accepted your consultation request!`;
    const preheader = `Your expert is ready. Complete payment of $${Number(totalPrice).toFixed(2)} to enter the live session.`;

    const contentHtml = `
      <p class="paragraph">Hi <strong>${clientName}</strong>,</p>
      <p class="paragraph">Great news! <strong>${expertName}</strong> has accepted your <strong>${durationMinutes}-minute</strong> consultation request for <strong>"${serviceTitle}"</strong>.</p>
      
      <div class="info-card">
        <div class="info-row"><strong>Expert:</strong> ${expertName}</div>
        <div class="info-row"><strong>Service:</strong> ${serviceTitle}</div>
        <div class="info-row"><strong>Duration:</strong> ${durationMinutes} minutes</div>
        <div class="info-row" style="font-size: 15px; color: #004554; font-weight: 800; margin-top: 6px;">
          <strong>Total Amount:</strong> $${Number(totalPrice).toFixed(2)}
        </div>
      </div>

      <p class="paragraph">
        Payment is now available. Complete payment inside the secure platform to lock in your slot and enter the live timed session workspace.
      </p>
    `;

    const text = `Hi ${clientName},

Great news! ${expertName} has accepted your consultation request for "${serviceTitle}" (${durationMinutes} minutes).

Total: $${Number(totalPrice).toFixed(2)}

Complete payment now to enter your live session workspace:
${actionUrl}

HireByMinute Team`;

    return this.sendMail({
      to: clientEmail,
      subject,
      template: 'consultation_accepted',
      html: this.wrapHtml({
        title: 'Expert Accepted Your Request ✓',
        preheader,
        contentHtml,
        ctaText: 'Pay & Confirm Session',
        ctaUrl: actionUrl,
        warningNote: 'Funds are securely held in escrow and only settled once the consultation completes.'
      }),
      text,
      userId: clientId
    });
  }

  // =========================================================================
  // 5. CONSULTATION DECLINED -> CLIENT
  // =========================================================================
  async sendConsultationDeclined({ clientEmail, clientName, expertName, serviceTitle, clientId }) {
    const config = this.getConfig();
    const browseUrl = `${config.clientOrigin}/services`;
    const subject = `Update on your consultation request for "${serviceTitle}"`;
    const preheader = `${expertName} was unable to accept this consultation. No payment was taken.`;

    const contentHtml = `
      <p class="paragraph">Hi <strong>${clientName}</strong>,</p>
      <p class="paragraph"><strong>${expertName}</strong> is currently unavailable for this consultation request.</p>
      
      <div style="background: #F0FDF4; border: 1px solid #BBF7D0; padding: 14px; border-radius: 10px; font-size: 13px; color: #166534; margin: 16px 0;">
        ✓ <strong>Zero Charge:</strong> No payment has been taken from your card or account.
      </div>

      <p class="paragraph">
        You can browse hundreds of other vetted experts across global domains on HireByMinute right now:
      </p>
    `;

    const text = `Hi ${clientName},

${expertName} is currently unavailable for your consultation request for "${serviceTitle}".

No payment was taken from your account.

Browse other available domain experts:
${browseUrl}

HireByMinute Team`;

    return this.sendMail({
      to: clientEmail,
      subject,
      template: 'consultation_declined',
      html: this.wrapHtml({
        title: 'Consultation Request Update',
        preheader,
        contentHtml,
        ctaText: 'Browse Other Experts',
        ctaUrl: browseUrl
      }),
      text,
      userId: clientId
    });
  }

  // =========================================================================
  // 6. CONSULTATION EXPIRED -> CLIENT
  // =========================================================================
  async sendConsultationExpired({ clientEmail, clientName, expertName, serviceTitle, clientId }) {
    const config = this.getConfig();
    const browseUrl = `${config.clientOrigin}/services`;
    const subject = `Your consultation request for "${serviceTitle}" has expired`;
    const preheader = `The 10-minute response window expired. No payment was taken.`;

    const contentHtml = `
      <p class="paragraph">Hi <strong>${clientName}</strong>,</p>
      <p class="paragraph">Your consultation request to <strong>${expertName}</strong> for <strong>"${serviceTitle}"</strong> has expired because the expert was unable to respond within the required 10-minute window.</p>
      
      <div style="background: #F0FDF4; border: 1px solid #BBF7D0; padding: 14px; border-radius: 10px; font-size: 13px; color: #166534; margin: 16px 0;">
        ✓ <strong>No Payment Taken:</strong> Because payment is only processed after expert acceptance, you have not been charged.
      </div>

      <p class="paragraph">
        Explore other active domain experts who are available to connect right now:
      </p>
    `;

    const text = `Hi ${clientName},

Your consultation request to ${expertName} for "${serviceTitle}" has expired after 10 minutes without an expert response.

No payment was taken.

Find another available expert on HireByMinute:
${browseUrl}

HireByMinute Team`;

    return this.sendMail({
      to: clientEmail,
      subject,
      template: 'consultation_expired',
      html: this.wrapHtml({
        title: 'Consultation Request Expired',
        preheader,
        contentHtml,
        ctaText: 'Find Another Expert',
        ctaUrl: browseUrl
      }),
      text,
      userId: clientId
    });
  }

  // =========================================================================
  // 7. PAYMENT SUCCESS & SESSION READY -> CLIENT & EXPERT
  // =========================================================================
  async sendPaymentReceipt({
    clientEmail,
    clientName,
    expertEmail,
    expertName,
    serviceTitle,
    durationMinutes,
    totalPrice,
    sessionId,
    clientId,
    expertId
  }) {
    const config = this.getConfig();
    const sessionUrl = `${config.clientOrigin}/session/${sessionId}`;
    const subjectClient = `Payment confirmed — Your HireByMinute session is ready (${serviceTitle})`;
    const subjectExpert = `Payment confirmed by ${clientName} — Session workspace active`;

    // 1. Send receipt to Client
    const clientHtml = `
      <p class="paragraph">Hi <strong>${clientName}</strong>,</p>
      <p class="paragraph">Your payment has been successfully confirmed. Your consultation workspace with <strong>${expertName}</strong> is now live!</p>
      
      <div class="info-card">
        <div class="info-row"><strong>Service:</strong> ${serviceTitle}</div>
        <div class="info-row"><strong>Expert:</strong> ${expertName}</div>
        <div class="info-row"><strong>Duration:</strong> ${durationMinutes} minutes</div>
        <div class="info-row"><strong>Amount Paid:</strong> $${Number(totalPrice).toFixed(2)} USD</div>
        <div class="info-row"><strong>Status:</strong> <span style="color: #059669; font-weight: bold;">Active Session Workspace</span></div>
      </div>
    `;

    const clientText = `Hi ${clientName},

Payment of $${Number(totalPrice).toFixed(2)} confirmed. Your session with ${expertName} for "${serviceTitle}" is ready.

Join live session:
${sessionUrl}

HireByMinute Team`;

    await this.sendMail({
      to: clientEmail,
      subject: subjectClient,
      template: 'payment_success_client',
      html: this.wrapHtml({
        title: 'Session Ready & Payment Confirmed',
        preheader: `Your session with ${expertName} is ready. Join room now.`,
        contentHtml: clientHtml,
        ctaText: 'Join Live Consultation',
        ctaUrl: sessionUrl,
        warningNote: 'Ensure your microphone and camera permissions are enabled before entering the room.'
      }),
      text: clientText,
      userId: clientId
    });

    // 2. Send notice to Expert
    const expertHtml = `
      <p class="paragraph">Hi <strong>${expertName}</strong>,</p>
      <p class="paragraph"><strong>${clientName}</strong> has completed payment for your <strong>${durationMinutes}-minute</strong> consultation for <strong>"${serviceTitle}"</strong>.</p>
      
      <div class="info-card">
        <div class="info-row"><strong>Client:</strong> ${clientName}</div>
        <div class="info-row"><strong>Service:</strong> ${serviceTitle}</div>
        <div class="info-row"><strong>Duration:</strong> ${durationMinutes} minutes</div>
        <div class="info-row"><strong>Escrow Amount:</strong> $${Number(totalPrice).toFixed(2)} USD</div>
      </div>
    `;

    const expertText = `Hi ${expertName},

${clientName} has completed payment for "${serviceTitle}" (${durationMinutes} mins). The live session workspace is now active.

Enter workspace:
${sessionUrl}

HireByMinute Team`;

    await this.sendMail({
      to: expertEmail,
      subject: subjectExpert,
      template: 'payment_success_expert',
      html: this.wrapHtml({
        title: 'Client Payment Confirmed',
        preheader: `${clientName} has paid. Enter the consultation workspace.`,
        contentHtml: expertHtml,
        ctaText: 'Enter Consultation Room',
        ctaUrl: sessionUrl
      }),
      text: expertText,
      userId: expertId
    });
  }

  // =========================================================================
  // 8. PROVIDER VERIFICATION APPROVED
  // =========================================================================
  async sendProviderVerified({ providerEmail, providerName, providerId }) {
    const config = this.getConfig();
    const profileUrl = `${config.clientOrigin}/provider`;
    const subject = 'Your HireByMinute profile has been verified!';
    const preheader = `Congratulations! You now have a verified expert badge on HireByMinute.`;

    const contentHtml = `
      <p class="paragraph">Hi <strong>${providerName}</strong>,</p>
      <p class="paragraph">Congratulations! Our administration team has reviewed and <strong>approved your verified expert status</strong> on HireByMinute.</p>
      
      <div style="background: #F0FDF4; border: 1px solid #86EFAC; padding: 16px; border-radius: 12px; margin: 18px 0;">
        <h4 style="margin: 0 0 6px 0; color: #15803D; font-size: 14px;">✓ Verified Badge Active</h4>
        <p style="margin: 0; font-size: 13px; color: #166534; line-height: 1.5;">
          Your listings now prominently display the Verified Expert checkmark, and your ranking in marketplace search results has been boosted.
        </p>
      </div>
    `;

    const text = `Hi ${providerName},

Congratulations! Your HireByMinute expert profile has been verified by platform administration.

Your profile now displays the Verified checkmark in marketplace discovery.

View your provider dashboard:
${profileUrl}

HireByMinute Team`;

    return this.sendMail({
      to: providerEmail,
      subject,
      template: 'provider_verified',
      html: this.wrapHtml({
        title: 'Expert Profile Verified ✓',
        preheader,
        contentHtml,
        ctaText: 'View Provider Dashboard',
        ctaUrl: profileUrl
      }),
      text,
      userId: providerId
    });
  }

  // =========================================================================
  // 9. ADMIN SYSTEM NOTIFICATIONS
  // =========================================================================
  async sendAdminAlert({ subject, message, meta = {} }) {
    const adminEmail = process.env.ADMIN_EMAIL || 'vishalkumar75912@gmail.com';
    const preheader = `Admin platform alert: ${subject}`;

    const contentHtml = `
      <p class="paragraph"><strong>HireByMinute Operations Alert:</strong></p>
      <p class="paragraph">${message}</p>
      ${Object.keys(meta).length > 0 ? `
        <div class="info-card">
          <pre style="margin: 0; font-family: monospace; font-size: 12px; color: #004554;">${JSON.stringify(meta, null, 2)}</pre>
        </div>
      ` : ''}
    `;

    const text = `HireByMinute Admin Alert:
${subject}

${message}

Metadata:
${JSON.stringify(meta, null, 2)}`;

    return this.sendMail({
      to: adminEmail,
      subject: `[Admin Alert] ${subject}`,
      template: 'admin_alert',
      html: this.wrapHtml({
        title: 'Platform System Alert',
        preheader,
        contentHtml
      }),
      text
    });
  }
}

module.exports = new EmailService();
