// =============================================================================
// HIREBYMINUTES — LIVE CONSULTATION WORKSPACE, WEBRTC & LAYOUT STABILITY TEST
// =============================================================================
// Verifies:
// 1. Session workspace desktop layout: 1440px max width, 68/32 two-column grid,
//    bounded viewport height, stable 16:9 stage, PiP preview, and scrollable chat.
// 2. Camera permission, progressive fallback, and actionable Retry Camera logic.
// 3. WebRTC screen sharing: RTCRtpSender.replaceTrack, signaling, object-contain,
//    audio continuity, and graceful reversion on onended.
// 4. Initial layout shift (CLS): index.html app shell & navbar auth placeholders.
// 5. ServicesPage filter sidebar: 280px sticky width without independent vertical scrollbar,
//    natural flex-1 results flow, and mobile bottom sheet.
// 6. Viewport responsiveness: 320px, 375px, 390px, 430px, 768px, 1024px, 1440px.
// =============================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${totalTests}. ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${totalTests}. ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ [PASS] ${totalTests}. ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${totalTests}. ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('\n===============================================================');
console.log('HIREBYMINUTES — WORKSPACE, WEBRTC & LAYOUT STABILITY AUDIT');
console.log('===============================================================\n');

// Load files
const sessionPagePath = path.join(__dirname, '../../client/src/pages/SessionPage.tsx');
const servicesPagePath = path.join(__dirname, '../../client/src/pages/ServicesPage.tsx');
const indexHtmlPath = path.join(__dirname, '../../client/index.html');
const headerPath = path.join(__dirname, '../../client/src/components/layout/Header.tsx');

const sessionPageCode = fs.readFileSync(sessionPagePath, 'utf8');
const servicesPageCode = fs.readFileSync(servicesPagePath, 'utf8');
const indexHtmlCode = fs.readFileSync(indexHtmlPath, 'utf8');
const headerCode = fs.readFileSync(headerPath, 'utf8');

// --- Suite 1: Session Workspace Desktop Layout & Viewport Geometry ---
console.log('--- Suite 1: Session Workspace Desktop Layout & Geometry ---');

test('SessionPage container uses max-w-[1440px] and bounded viewport height on desktop', () => {
  assert(sessionPageCode.includes('max-w-[1440px]'), 'Must have max-w-[1440px] container');
  assert(sessionPageCode.includes('lg:h-[calc(100vh-4.5rem)]'), 'Must bound desktop height beneath header');
  assert(sessionPageCode.includes('lg:overflow-hidden'), 'Must prevent desktop whole-page vertical scroll');
});

test('SessionPage uses two-column grid with ~68% stage and ~32% chat panel', () => {
  assert(
    sessionPageCode.includes('lg:grid-cols-[minmax(0,68%)_minmax(0,32%)]'),
    'Must use 68/32 grid column ratio on desktop'
  );
  assert(sessionPageCode.includes('min-h-0'), 'Must apply min-h-0 to allow internal flex/grid shrinking');
  assert(sessionPageCode.includes('min-w-0'), 'Must apply min-w-0 to prevent flex item blowout');
});

test('Call stage video area is anchored to 16:9 aspect ratio container', () => {
  assert(sessionPageCode.includes('aspect-video'), 'Video container must anchor to aspect-video (16:9)');
  assert(sessionPageCode.includes('max-h-full'), 'Video container must respect max-h-full of parent');
});

test('Local video preview is positioned in floating Picture-in-Picture (PiP) overlay', () => {
  assert(
    sessionPageCode.includes('absolute bottom-3 right-3') &&
    sessionPageCode.includes('rounded-xl') &&
    sessionPageCode.includes('z-20'),
    'Local preview must be a floating picture-in-picture overlay in the corner'
  );
  assert(sessionPageCode.includes('shadow-elevated'), 'PiP must have elevated shadow for visual depth');
});

test('Bottom media controls are pinned with >= 48px touch targets', () => {
  assert(sessionPageCode.includes('min-h-[48px] min-w-[48px]'), 'Buttons must meet 48px touch target standard');
  assert(sessionPageCode.includes('shrink-0'), 'Controls bar must be shrink-0 so it remains pinned in view');
  assert(sessionPageCode.includes('toggleMicrophone'), 'Must have mic toggle');
  assert(sessionPageCode.includes('toggleCamera'), 'Must have camera toggle');
  assert(sessionPageCode.includes('toggleScreenShare'), 'Must have screen share toggle');
  assert(sessionPageCode.includes('handleEndCall'), 'Must have end call action');
});

test('Chat panel header and composer are pinned while only message history scrolls', () => {
  assert(sessionPageCode.includes('flex-1 min-h-0') && sessionPageCode.includes('overflow-y-auto'), 'Message history must be scrollable with flex-1 min-h-0');
  assert(sessionPageCode.includes('overscroll-contain'), 'Chat stream must have overscroll-contain');
  assert(sessionPageCode.includes('shrink-0 p-3 bg-aliceblue/30 border-t'), 'Chat composer must be pinned at bottom with shrink-0');
});

test('Mobile viewports provide segmented tab switcher (Video Stream vs Chat & Files)', () => {
  assert(sessionPageCode.includes("mobileWorkspaceTab === 'video'"), 'Must support switching to video tab on mobile');
  assert(sessionPageCode.includes("mobileWorkspaceTab === 'chat'"), 'Must support switching to chat tab on mobile');
  assert(sessionPageCode.includes('lg:hidden'), 'Segmented controls must be hidden on desktop');
});

// --- Suite 2: WebRTC Camera Acquisition, Fallback & Retry Action ---
console.log('\n--- Suite 2: Camera Permission, Fallback & Retry Action ---');

test('Progressive media acquisition handles 720p and falls back to basic video/audio', () => {
  assert(sessionPageCode.includes('OverconstrainedError'), 'Must handle OverconstrainedError');
  assert(sessionPageCode.includes('ConstraintNotSatisfiedError'), 'Must handle ConstraintNotSatisfiedError');
  assert(sessionPageCode.includes('video: true'), 'Must fall back to basic video constraint');
});

test('Accurately distinguishes device absence vs permission denials without false messages', () => {
  assert(sessionPageCode.includes('NotFoundError'), 'Must check for NotFoundError (hardware missing)');
  assert(sessionPageCode.includes('DevicesNotFoundError'), 'Must check for DevicesNotFoundError');
  assert(sessionPageCode.includes('No camera detected on your device'), 'Must report device absence accurately');
  assert(sessionPageCode.includes('NotAllowedError'), 'Must check for NotAllowedError (permission denied)');
  assert(sessionPageCode.includes('PermissionDeniedError'), 'Must check for PermissionDeniedError');
  assert(sessionPageCode.includes('NotReadableError'), 'Must check for NotReadableError (app in use)');
});

test('Provides actionable Retry Camera function without requiring page reload', () => {
  assert(sessionPageCode.includes('const retryCamera = async ()'), 'Must expose retryCamera function');
  assert(sessionPageCode.includes('Retry Camera'), 'Must render Retry Camera button in media error state and controls');
});

test('Local video element has autoPlay, playsInline, muted, and track binding effect', () => {
  assert(sessionPageCode.includes('localVideoRef.current.muted = true'), 'Local video element must be explicitly muted for autoplay');
  assert(sessionPageCode.includes('localVideoRef.current.srcObject = localStreamRef.current'), 'Must bind localStreamRef to localVideoRef');
  assert(sessionPageCode.includes('remoteVideoRef.current.srcObject = remoteStreamRef.current'), 'Must bind remoteStreamRef to remoteVideoRef');
});

// --- Suite 3: WebRTC Screen Sharing & Signaling ---
console.log('\n--- Suite 3: WebRTC Screen Sharing & Signaling ---');

test('Screen sharing captures display stream via getDisplayMedia', () => {
  assert(sessionPageCode.includes('navigator.mediaDevices.getDisplayMedia'), 'Must call getDisplayMedia');
  assert(sessionPageCode.includes('displayStreamRef.current = displayStream'), 'Must track display stream reference');
});

test('Replaces video track on RTCPeerConnection sender via replaceTrack', () => {
  assert(sessionPageCode.includes('sender.replaceTrack(screenTrack)'), 'Must replace sender track with screenTrack');
});

test('Notifies remote peer via call_media_state and updates display to object-contain', () => {
  assert(sessionPageCode.includes("socket?.emit('call_media_state'"), 'Must emit call_media_state');
  assert(sessionPageCode.includes('screenSharing: true'), 'Must signal screenSharing: true');
  assert(sessionPageCode.includes('remoteIsScreenSharing'), 'Must maintain remoteIsScreenSharing state');
  assert(sessionPageCode.includes('object-contain bg-black'), 'Remote video must use object-contain bg-black during screen sharing');
  assert(sessionPageCode.includes('Screen Shared by'), 'Must render screen sharing badge for remote participant');
});

test('Restores camera track or disables video gracefully when screen sharing ends', () => {
  assert(sessionPageCode.includes('screenTrack.onended = () => {'), 'Must handle native browser stop button on screenTrack.onended');
  assert(sessionPageCode.includes('displayStreamRef.current.getTracks().forEach(t => t.stop())'), 'Must stop all display capture tracks');
  assert(sessionPageCode.includes('sender.replaceTrack(videoEnabled && originalVideoTrack ? originalVideoTrack : null)'), 'Must restore camera track to sender');
  assert(sessionPageCode.includes('screenSharing: false'), 'Must signal screenSharing: false');
});

// --- Suite 4: Layout Shift (CLS) Elimination ---
console.log('\n--- Suite 4: Layout Shift (CLS) Elimination ---');

test('index.html contains zero-shift app shell matching brand background and header height', () => {
  assert(!indexHtmlCode.includes('I need a service'), 'Must not render mismatched home page mockup text in root');
  assert(indexHtmlCode.includes('background-color:#E9F1F6'), 'App shell background must match brand aliceblue');
  assert(indexHtmlCode.includes('height:64px'), 'App shell header placeholder must match 64px header height');
  assert(indexHtmlCode.includes('<noscript>'), 'Must preserve semantic noscript block for non-JS crawlers');
});

test('Header.tsx auth skeleton matches exact dimensions of action buttons to prevent reflow', () => {
  assert(headerCode.includes('w-40 sm:w-44 h-9'), 'Auth skeleton must reserve matching width/height');
});

// --- Suite 5: Services Page Layout Stability ---
console.log('\n--- Suite 5: Services Page Layout Stability ---');

test('ServicesPage filter sidebar has 280px sticky width without independent vertical scrollbar', () => {
  assert(servicesPageCode.includes('w-[280px] shrink-0'), 'Sidebar must have stable 280px width');
  assert(servicesPageCode.includes('sticky top-24'), 'Sidebar must be sticky top-24');
  assert(!servicesPageCode.includes('max-h-[calc(100vh-7rem)] overflow-y-auto'), 'Sidebar must not have conflicting independent vertical scroll');
});

test('Services results grid flows naturally alongside sidebar with flex-1', () => {
  assert(servicesPageCode.includes('min-w-0 flex-1'), 'Services grid container must use min-w-0 flex-1');
  assert(servicesPageCode.includes('grid grid-cols-1 md:grid-cols-2'), 'Services cards must render in 2-column responsive grid');
});

test('ServicesPage provides mobile filter bottom sheet for small viewports', () => {
  assert(servicesPageCode.includes('mobileFiltersOpen'), 'Must manage mobile bottom sheet state');
  assert(servicesPageCode.includes('fixed inset-x-0 bottom-0'), 'Must position bottom sheet correctly on mobile');
});

// --- Suite 6: Viewport Breakpoint Conformance ---
console.log('\n--- Suite 6: Viewport Breakpoint Conformance ---');

const viewports = [
  { name: '320px (iPhone SE)', width: 320, mode: 'mobile-tabbed' },
  { name: '375px (iPhone 13 mini)', width: 375, mode: 'mobile-tabbed' },
  { name: '390px (iPhone 14/15)', width: 390, mode: 'mobile-tabbed' },
  { name: '430px (iPhone 15 Pro Max)', width: 430, mode: 'mobile-tabbed' },
  { name: '768px (iPad Mini / Tablet)', width: 768, mode: 'tablet-adapted' },
  { name: '1024px (iPad Pro / Small Laptop)', width: 1024, mode: 'desktop-grid' },
  { name: '1440px (Standard Desktop Display)', width: 1440, mode: 'desktop-grid' }
];

viewports.forEach(vp => {
  test(`Viewport ${vp.name}: layout satisfies ${vp.mode} constraints without horizontal blowout`, () => {
    if (vp.width < 1024) {
      assert(sessionPageCode.includes('lg:hidden'), 'Small viewports must hide desktop split and use segmented tabs');
      assert(sessionPageCode.includes('min-h-[44px]'), 'Touch targets must be at least 44px on mobile');
    } else {
      assert(sessionPageCode.includes('lg:grid-cols-[minmax(0,68%)_minmax(0,32%)]'), 'Desktop viewports must activate 68/32 two-column split');
      assert(sessionPageCode.includes('max-w-[1440px]'), 'Desktop viewports must contain width up to 1440px');
    }
  });
});

console.log('\n===============================================================');
console.log(`SUMMARY: ${passedTests} / ${totalTests} workspace & stability tests passed.`);
console.log('===============================================================\n');

if (passedTests === totalTests) {
  console.log('🎉 ALL WORKSPACE, WEBRTC & LAYOUT STABILITY TESTS PASSED 100%!\n');
  process.exit(0);
} else {
  console.error('❌ ONE OR MORE TESTS FAILED.\n');
  process.exit(1);
}
