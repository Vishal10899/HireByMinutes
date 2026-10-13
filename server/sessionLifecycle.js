const { v4: uuidv4 } = require('uuid');
const db = require('./db');

function completeSession(sessionId, { io, completedBy = 'timer' } = {}) {
  const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId);
  if (!session) return null;
  if (session.status === 'COMPLETED' || session.status === 'EXPIRED') {
    return session;
  }

  const now = new Date().toISOString();
  const booking = db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(session.booking_id);
  const service = db.prepare(`SELECT * FROM services WHERE id = ?`).get(session.service_id);
  const client = db.prepare(`SELECT * FROM users WHERE id = ?`).get(session.client_id);
  const provider = db.prepare(`SELECT * FROM users WHERE id = ?`).get(session.provider_id);

  // 1. Mark session & booking COMPLETED
  db.prepare(`UPDATE sessions SET status = 'COMPLETED', actual_end = ? WHERE id = ?`).run(now, session.id);
  if (session.booking_id) {
    db.prepare(`UPDATE bookings SET status = 'COMPLETED' WHERE id = ?`).run(session.booking_id);
    db.prepare(`UPDATE consultation_requests SET status = 'COMPLETED' WHERE id = ?`).run(session.booking_id);
  }
  db.prepare(`UPDATE users SET sessions_completed = sessions_completed + 1 WHERE id IN (?, ?)`).run(session.provider_id, session.client_id);

  // 2. Financial Ledger calculation (authoritative integer paise)
  const payment = db.prepare(`
    SELECT * FROM payments 
    WHERE reference_id = ? AND type = 'session_payment' AND status = 'succeeded'
    ORDER BY created_at DESC LIMIT 1
  `).get(session.booking_id || session.id);

  const grossAmountInr = Number(payment?.amount || booking?.total_price || (session.duration_minutes * (service?.price_per_minute || 1)));
  const grossPaise = Math.round(grossAmountInr * 100);

  // Read platform commission setting (default 15%)
  let commPercent = 15;
  try {
    const commSetting = db.prepare(`SELECT value FROM platform_settings WHERE key = 'platform_fee_percent'`).get();
    if (commSetting && !isNaN(Number(commSetting.value))) {
      commPercent = Number(commSetting.value);
    }
  } catch (e) {
    // default 15
  }

  const commPaise = Math.round(grossPaise * (commPercent / 100));
  const netPaise = grossPaise - commPaise;

  // Insert financial ledger entries idempotently
  try {
    const existingLedger = db.prepare(`SELECT id FROM financial_ledger WHERE session_id = ? AND entry_type = 'net_earning'`).get(session.id);
    if (!existingLedger) {
      const grossLedgerId = `fin-gr-${uuidv4().slice(0, 8)}`;
      db.prepare(`
        INSERT INTO financial_ledger (id, user_id, session_id, booking_id, entry_type, amount_paise, balance_type, currency, description, metadata_json)
        VALUES (?, ?, ?, ?, 'gross_earning', ?, 'available', 'INR', ?, ?)
      `).run(
        grossLedgerId,
        session.provider_id,
        session.id,
        session.booking_id,
        grossPaise,
        `Gross consultation earnings for ${session.duration_minutes}m session`,
        JSON.stringify({ gross_inr: grossAmountInr, client_name: client?.full_name })
      );

      const commLedgerId = `fin-cm-${uuidv4().slice(0, 8)}`;
      db.prepare(`
        INSERT INTO financial_ledger (id, user_id, session_id, booking_id, entry_type, amount_paise, balance_type, currency, description, metadata_json)
        VALUES (?, ?, ?, ?, 'platform_commission', ?, 'available', 'INR', ?, ?)
      `).run(
        commLedgerId,
        session.provider_id,
        session.id,
        session.booking_id,
        commPaise,
        `Platform commission (${commPercent}%)`,
        JSON.stringify({ commission_percent: commPercent, comm_inr: commPaise / 100 })
      );

      const netLedgerId = `fin-net-${uuidv4().slice(0, 8)}`;
      db.prepare(`
        INSERT INTO financial_ledger (id, user_id, session_id, booking_id, entry_type, amount_paise, balance_type, currency, description, metadata_json)
        VALUES (?, ?, ?, ?, 'net_earning', ?, 'available', 'INR', ?, ?)
      `).run(
        netLedgerId,
        session.provider_id,
        session.id,
        session.booking_id,
        netPaise,
        `Net payout credit for completed consultation`,
        JSON.stringify({ net_inr: netPaise / 100, service_title: service?.title })
      );

      // Update provider payout balance
      db.prepare(`
        UPDATE users SET payout_balance_paise = COALESCE(payout_balance_paise, 0) + ? WHERE id = ?
      `).run(netPaise, session.provider_id);
    }
  } catch (finErr) {
    console.error('[Financial Ledger Error]:', finErr.message);
  }

  // 3. Client Loyalty Reward Points calculation (Idempotent!)
  try {
    const existingReward = db.prepare(`SELECT id FROM reward_points_ledger WHERE session_id = ? AND entry_type = 'earned_session'`).get(session.id);
    if (!existingReward && session.client_id) {
      let pointsPerMin = 20;
      try {
        const ptSetting = db.prepare(`SELECT value FROM platform_settings WHERE key = 'reward_points_per_minute'`).get();
        if (ptSetting && !isNaN(Number(ptSetting.value))) {
          pointsPerMin = Number(ptSetting.value);
        }
      } catch (e) {
        // default 20
      }

      const duration = Math.max(1, session.duration_minutes || 5);
      const pointsToAward = duration * pointsPerMin;

      const rwdId = `rwd-earn-${uuidv4().slice(0, 8)}`;
      db.prepare(`
        INSERT INTO reward_points_ledger (id, user_id, session_id, booking_id, entry_type, points, status, description)
        VALUES (?, ?, ?, ?, 'earned_session', ?, 'available', ?)
      `).run(
        rwdId,
        session.client_id,
        session.id,
        session.booking_id,
        pointsToAward,
        `Earned ${pointsToAward} points for completed ${duration}m consultation with ${provider?.full_name || 'expert'}`
      );

      db.prepare(`
        UPDATE users SET reward_points_balance = COALESCE(reward_points_balance, 0) + ? WHERE id = ?
      `).run(pointsToAward, session.client_id);
    }
  } catch (rwdErr) {
    console.error('[Reward Points Ledger Error]:', rwdErr.message);
  }

  // 4. Notifications
  try {
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, link)
      VALUES (?, ?, 'Session Completed', ?, 'success', ?)
    `).run(
      `notif-${uuidv4().slice(0, 8)}`,
      session.client_id,
      `Your consultation with ${provider?.full_name || 'expert'} has concluded. Please leave a review!`,
      `/session/${session.id}`
    );

    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, link)
      VALUES (?, ?, 'Earnings Credited', ?, 'success', ?)
    `).run(
      `notif-${uuidv4().slice(0, 8)}`,
      session.provider_id,
      `₹${(netPaise / 100).toFixed(2)} credited to your earnings balance for completed consultation.`,
      `/provider`
    );
  } catch (notifErr) {
    // Non-blocking
  }

  // 5. Socket broadcast
  if (io) {
    io.to(`session_${session.id}`).emit('session_expired', {
      sessionId: session.id,
      message: 'Session completed. Communication channels are now closed.'
    });

    io.to(`session_${session.id}`).emit('session_completed', {
      sessionId: session.id,
      bookingId: session.booking_id
    });
  }

  const completedSession = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(session.id);
  return {
    ...completedSession,
    success: true,
    grossAmountInr,
    platformFeeInr: commPaise / 100,
    netEarnedInr: netPaise / 100
  };
}

module.exports = { completeSession };
