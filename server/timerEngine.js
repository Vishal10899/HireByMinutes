const db = require('./db');

class TimerEngine {
  constructor(io) {
    this.io = io;
    this.timerInterval = null;
    this.notifiedWarnings = new Set(); // track warnings per session
  }

  start() {
    if (this.timerInterval) return;
    this.timerInterval = setInterval(() => this.tick(), 1000);
  }

  stop() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  async tick() {
    try {
      const now = new Date().toISOString();
      
      // Check all ACTIVE sessions non-blockingly
      const activeSessionsQuery = `
        SELECT s.*, b.total_price, b.duration_minutes as booked_duration,
               c.full_name as client_name, p.full_name as provider_name
        FROM sessions s
        JOIN bookings b ON s.booking_id = b.id
        JOIN users c ON s.client_id = c.id
        JOIN users p ON s.provider_id = p.id
        WHERE s.status = 'ACTIVE'
      `;

      const activeSessions = typeof db.allAsync === 'function'
        ? await db.allAsync(activeSessionsQuery)
        : db.prepare(activeSessionsQuery).all();

      for (const session of activeSessions) {
        const nowMs = Date.now();
        const endMs = new Date(session.actual_end).getTime();
        const remainingSeconds = Math.max(0, Math.floor((endMs - nowMs) / 1000));

        // Broadcast timer tick to session room
        this.io.to(`session_${session.id}`).emit('session_tick', {
          sessionId: session.id,
          remainingSeconds,
          status: session.status,
          actualStart: session.actual_start,
          actualEnd: session.actual_end
        });

        // Warning at 5 minutes (300s)
        const warn5Key = `${session.id}_300`;
        if (remainingSeconds <= 300 && remainingSeconds > 290 && !this.notifiedWarnings.has(warn5Key)) {
          this.notifiedWarnings.add(warn5Key);
          this.io.to(`session_${session.id}`).emit('session_warning', {
            sessionId: session.id,
            message: '5 minutes remaining in this session.',
            secondsLeft: remainingSeconds
          });
        }

        // Warning at 1 minute (60s)
        const warn1Key = `${session.id}_60`;
        if (remainingSeconds <= 60 && remainingSeconds > 50 && !this.notifiedWarnings.has(warn1Key)) {
          this.notifiedWarnings.add(warn1Key);
          this.io.to(`session_${session.id}`).emit('session_warning', {
            sessionId: session.id,
            message: '1 minute remaining! Your session will conclude shortly.',
            secondsLeft: remainingSeconds
          });
        }

        // Session Expired
        if (remainingSeconds <= 0) {
          if (typeof db.runAsync === 'function') {
            await db.runAsync(`UPDATE sessions SET status = 'COMPLETED', actual_end = ? WHERE id = ?`, now, session.id);
            await db.runAsync(`UPDATE bookings SET status = 'COMPLETED' WHERE id = ?`, session.booking_id);
            await db.runAsync(`UPDATE users SET sessions_completed = sessions_completed + 1 WHERE id IN (?, ?)`, session.provider_id, session.client_id);
          } else {
            db.prepare(`UPDATE sessions SET status = 'COMPLETED', actual_end = ? WHERE id = ?`).run(now, session.id);
            db.prepare(`UPDATE bookings SET status = 'COMPLETED' WHERE id = ?`).run(session.booking_id);
            db.prepare(`UPDATE users SET sessions_completed = sessions_completed + 1 WHERE id IN (?, ?)`).run(session.provider_id, session.client_id);
          }

          this.io.to(`session_${session.id}`).emit('session_expired', {
            sessionId: session.id,
            message: 'Session completed. Communication channels are now closed.'
          });

          this.io.to(`session_${session.id}`).emit('session_completed', {
            sessionId: session.id,
            bookingId: session.booking_id
          });
        }
      }
    } catch (tickErr) {
      console.error('[TimerEngine Tick Error]:', tickErr.message);
    }
  }

  startSessionNow(sessionId, userId) {
    const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId);
    if (!session) throw new Error('Session not found');
    if (session.client_id !== userId && session.provider_id !== userId) {
      throw new Error('Unauthorized for this session');
    }
    if (session.status === 'COMPLETED' || session.status === 'EXPIRED') {
      throw new Error('This session has already ended.');
    }

    if (session.status === 'SCHEDULED') {
      const nowMs = Date.now();
      const actualStart = new Date(nowMs).toISOString();
      const actualEnd = new Date(nowMs + session.duration_minutes * 60 * 1000).toISOString();

      db.prepare(`
        UPDATE sessions 
        SET status = 'ACTIVE', actual_start = ?, actual_end = ? 
        WHERE id = ?
      `).run(actualStart, actualEnd, sessionId);

      this.io.to(`session_${sessionId}`).emit('session_started', {
        sessionId,
        status: 'ACTIVE',
        actualStart,
        actualEnd,
        durationMinutes: session.duration_minutes
      });
    }

    return this.getSessionDetails(sessionId);
  }

  getSessionDetails(sessionId) {
    const session = db.prepare(`
      SELECT s.*, 
             b.total_price, b.notes, b.duration_minutes as booked_duration,
             srv.title as service_title, srv.price_per_minute,
             c.id as client_id, c.full_name as client_name, c.avatar_url as client_avatar,
             p.id as provider_id, p.full_name as provider_name, p.avatar_url as provider_avatar, p.headline as provider_headline
      FROM sessions s
      JOIN bookings b ON s.booking_id = b.id
      JOIN services srv ON s.service_id = srv.id
      JOIN users c ON s.client_id = c.id
      JOIN users p ON s.provider_id = p.id
      WHERE s.id = ?
    `).get(sessionId);

    if (!session) return null;

    let remainingSeconds = 0;
    if (session.status === 'ACTIVE' && session.actual_end) {
      const nowMs = Date.now();
      const endMs = new Date(session.actual_end).getTime();
      remainingSeconds = Math.max(0, Math.floor((endMs - nowMs) / 1000));
    } else if (session.status === 'SCHEDULED') {
      remainingSeconds = session.duration_minutes * 60;
    }

    return {
      ...session,
      remainingSeconds,
      canCommunicate: session.status === 'ACTIVE' && remainingSeconds > 0
    };
  }

  isCommunicationAllowed(sessionId, userId) {
    const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId);
    if (!session) return false;
    if (session.client_id !== userId && session.provider_id !== userId) return false;
    if (session.status !== 'ACTIVE') return false;
    
    const nowMs = Date.now();
    const endTarget = session.actual_end || session.scheduled_end;
    if (!endTarget) return false;
    const endMs = new Date(endTarget).getTime();
    return nowMs < endMs;
  }

  clearSessionWarnings(sessionId) {
    this.notifiedWarnings.delete(`${sessionId}_300`);
    this.notifiedWarnings.delete(`${sessionId}_60`);
  }

  extendSession(sessionId, additionalMinutes) {
    const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId);
    if (!session) throw new Error('Session not found');
    if (session.status !== 'ACTIVE') throw new Error('Only active sessions can be extended');

    const addMins = parseInt(additionalMinutes, 10);
    const currentEndMs = session.actual_end ? new Date(session.actual_end).getTime() : Date.now();
    const newEndMs = Math.max(Date.now(), currentEndMs) + addMins * 60 * 1000;
    const newActualEnd = new Date(newEndMs).toISOString();
    const newDuration = session.duration_minutes + addMins;

    db.prepare(`
      UPDATE sessions 
      SET duration_minutes = ?, actual_end = ?, scheduled_end = ? 
      WHERE id = ?
    `).run(newDuration, newActualEnd, newActualEnd, sessionId);

    this.clearSessionWarnings(sessionId);

    return this.getSessionDetails(sessionId);
  }
}

module.exports = TimerEngine;
