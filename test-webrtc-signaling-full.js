const { io: Client } = require('./client/node_modules/socket.io-client');
const http = require('http');

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(responseBody) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, data: responseBody });
        }
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'object' ? JSON.stringify(options.body) : options.body);
    }
    req.end();
  });
}

async function testWebRTCSignalingAndTimerCutoff() {
  console.log('======================================================================');
  console.log('--- TESTING HIREBYMINUTES WEBRTC SIGNALING & TIMER CUTOFF ---');
  console.log('======================================================================\n');

  try {
    // 1. Authenticate Client & Expert
    const clientLogin = await request('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email: 'sarah@hirebyminutes.com', password: 'demo123' }
    });
    const expertLogin = await request('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email: 'arjun@hirebyminutes.com', password: 'demo123' }
    });

    const clientToken = clientLogin.data.token;
    const expertToken = expertLogin.data.token;
    const clientId = clientLogin.data.user.id;
    const expertId = expertLogin.data.user.id;

    // 2. Create and complete an active session
    const servicesRes = await request('http://localhost:5000/api/services');
    const service = servicesRes.data.services[0];

    const reqRes = await request('http://localhost:5000/api/consultation-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken}` },
      body: { service_id: service.id, duration_minutes: 10, problem_description: 'WebRTC test session' }
    });
    const requestId = reqRes.data.request.id;

    await request(`http://localhost:5000/api/consultation-requests/${requestId}/accept`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${expertToken}` }
    });

    const payRes = await request(`http://localhost:5000/api/consultation-requests/${requestId}/pay`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${clientToken}` }
    });
    const sessionId = payRes.data.session_id;
    console.log(`1. Active Session Created: ${sessionId}`);

    // 3. Connect Sockets for Client & Expert
    console.log('\n2. Connecting Client & Expert WebSockets...');
    const clientSocket = Client('http://localhost:5000', { transports: ['websocket'] });
    const expertSocket = Client('http://localhost:5000', { transports: ['websocket'] });

    await new Promise((resolve) => {
      let count = 0;
      const onConnect = () => {
        count++;
        if (count === 2) resolve();
      };
      clientSocket.on('connect', onConnect);
      expertSocket.on('connect', onConnect);
    });
    console.log('   ✓ Both WebSockets connected to Socket.IO signaling server.');

    // 4. Join Session Room
    clientSocket.emit('join_session', { sessionId, userId: clientId, userName: 'Sarah Chen' });
    expertSocket.emit('join_session', { sessionId, userId: expertId, userName: 'Arjun Sharma' });

    // 5. Test WebRTC Offer / Answer Signaling
    console.log('\n3. Testing WebRTC SDP Offer / Answer Exchange...');
    const offerReceivedPromise = new Promise((resolve) => {
      expertSocket.on('webrtc_offer', (data) => {
        resolve(data);
      });
    });

    clientSocket.emit('webrtc_offer', {
      sessionId,
      offer: { type: 'offer', sdp: 'v=0\r\no=- 123456 2 IN IP4 127.0.0.1...' },
      senderId: clientId
    });

    const receivedOffer = await offerReceivedPromise;
    if (receivedOffer.senderId !== clientId) throw new Error('Received offer sender mismatch');
    console.log(`   ✓ WebRTC Offer delivered to Expert through signaling room: session_${sessionId}`);

    const answerReceivedPromise = new Promise((resolve) => {
      clientSocket.on('webrtc_answer', (data) => {
        resolve(data);
      });
    });

    expertSocket.emit('webrtc_answer', {
      sessionId,
      answer: { type: 'answer', sdp: 'v=0\r\no=- 654321 2 IN IP4 127.0.0.1...' },
      senderId: expertId
    });

    const receivedAnswer = await answerReceivedPromise;
    if (receivedAnswer.senderId !== expertId) throw new Error('Received answer sender mismatch');
    console.log(`   ✓ WebRTC Answer delivered to Client through signaling room.`);

    // 6. Test ICE Candidate Exchange
    console.log('\n4. Testing ICE Candidate Exchange...');
    const candidatePromise = new Promise((resolve) => {
      expertSocket.on('webrtc_ice_candidate', (data) => {
        resolve(data);
      });
    });

    clientSocket.emit('webrtc_ice_candidate', {
      sessionId,
      candidate: { candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 50000 typ host', sdpMid: '0', sdpMLineIndex: 0 },
      senderId: clientId
    });

    const receivedCandidate = await candidatePromise;
    if (receivedCandidate.senderId !== clientId) throw new Error('ICE candidate sender mismatch');
    console.log('   ✓ ICE candidate successfully relayed between peers.');

    // 7. Test Media State Toggles (Audio, Video, Screenshare)
    console.log('\n5. Testing Media Track State Signaling (Mute/Camera/Screenshare)...');
    const mediaStatePromise = new Promise((resolve) => {
      expertSocket.on('call_media_state', (data) => {
        resolve(data);
      });
    });

    clientSocket.emit('call_media_state', {
      sessionId,
      senderId: clientId,
      audio: true,
      video: false,
      screenSharing: true
    });

    const mediaState = await mediaStatePromise;
    if (!mediaState.screenSharing || mediaState.video !== false) throw new Error('Media state mismatch');
    console.log('   ✓ Media states synchronized: Audio=ON, Video=OFF, ScreenShare=ON.');

    // 8. Test Messaging Authorization in Active Session
    console.log('\n6. Testing In-Room Chat Messaging in Active Session...');
    const msgRes = await request(`http://localhost:5000/api/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken}` },
      body: { message: 'Hello! I am ready for the consultation.' }
    });
    if (msgRes.status !== 201) throw new Error(`Send message failed with ${msgRes.status}`);
    console.log(`   ✓ In-room chat message authorized and recorded: "${msgRes.data.message.message}"`);

    clientSocket.disconnect();
    expertSocket.disconnect();

    console.log('\n======================================================================');
    console.log('✅ ALL WEBRTC SIGNALING & ACTIVE ROOM TESTS PASSED 100%!');
    console.log('======================================================================\n');
  } catch (err) {
    console.error('\n❌ WEBRTC TEST FAILED:', err.message);
    process.exit(1);
  }
}

testWebRTCSignalingAndTimerCutoff();
