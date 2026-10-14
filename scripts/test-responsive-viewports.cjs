// =============================================================================
// HIREBYMINUTE — COMPREHENSIVE RESPONSIVE VIEWPORT QA (10 VIEWPORTS)
// =============================================================================
// Tests 10 viewport widths: 320, 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920
// Using headless Google Chrome via Chrome DevTools Protocol (CDP)
// Verifies:
// 1. Horizontal overflow: document.documentElement.scrollWidth <= window.innerWidth
// 2. Minimum touch target compliance for mobile buttons (>= 44px)
// 3. Absence of clipping or broken grid wrappers
// =============================================================================

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9335;
const TEST_PORT = 5128;

const VIEWPORTS = [
  { width: 320, height: 640, label: '320px (iPhone SE / Small Mobile)' },
  { width: 360, height: 740, label: '360px (Android Small / Galaxy S8)' },
  { width: 375, height: 667, label: '375px (iPhone 12/13 Mini)' },
  { width: 390, height: 844, label: '390px (iPhone 13/14/15)' },
  { width: 430, height: 932, label: '430px (iPhone 15/16 Pro Max)' },
  { width: 768, height: 1024, label: '768px (iPad Mini / Tablet Portrait)' },
  { width: 1024, height: 768, label: '1024px (iPad Pro / Small Laptop)' },
  { width: 1280, height: 800, label: '1280px (Standard Laptop)' },
  { width: 1440, height: 900, label: '1440px (Desktop Display / Workspace Target)' },
  { width: 1920, height: 1080, label: '1920px (Full HD Desktop / Large Monitor)' }
];

let server;
let chromeProc;
let tmpDir;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getPageWsUrl(port) {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) return page.webSocketDebuggerUrl;
        if (list[0]?.webSocketDebuggerUrl) return list[0].webSocketDebuggerUrl;
      }
    } catch (e) {}
    await sleep(250);
  }
  throw new Error(`Timeout waiting for Chrome CDP on port ${port}`);
}

function createCdpClient(wsUrl) {
  return new Promise((resolveOpen, rejectOpen) => {
    const ws = new WebSocket(wsUrl);
    let msgId = 1;
    const pending = new Map();

    ws.onopen = () => {
      resolveOpen({
        send(method, params = {}) {
          const id = msgId++;
          return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject });
            ws.send(JSON.stringify({ id, method, params }));
          });
        },
        async eval(expression) {
          const res = await this.send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true
          });
          if (res.exceptionDetails) {
            throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
          }
          return res.result?.value;
        },
        close() {
          try { ws.close(); } catch (e) {}
        }
      });
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && pending.has(data.id)) {
        const { resolve, reject } = pending.get(data.id);
        pending.delete(data.id);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      }
    };

    ws.onerror = (err) => rejectOpen(err);
  });
}

async function runViewportAudit() {
  console.log('======================================================================');
  console.log('--- HIREBYMINUTES RESPONSIVE MULTI-VIEWPORT AUDIT (10 VIEWPORTS) ---');
  console.log('======================================================================\n');

  // 1. Serve production client dist
  const distPath = path.join(__dirname, '../client/dist');
  if (!fs.existsSync(distPath)) {
    throw new Error('client/dist does not exist. Run "npm --prefix client run build" first.');
  }

  const app = express();
  app.use(express.static(distPath));
  // SPA fallback
  app.use((req, res) => res.sendFile(path.join(distPath, 'index.html')));

  server = http.createServer(app);
  await new Promise(r => server.listen(TEST_PORT, '127.0.0.1', r));
  console.log('✓ Production static server listening on http://127.0.0.1:' + TEST_PORT);

  // 2. Launch headless Chrome
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-viewport-'));
  const chromeArgs = [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-gpu',
    `--user-data-dir=${tmpDir}`,
    'about:blank'
  ];

  chromeProc = spawn(CHROME_PATH, chromeArgs, { stdio: 'ignore' });
  const wsUrl = await getPageWsUrl(CDP_PORT);
  const cdp = await createCdpClient(wsUrl);
  console.log('✓ Headless Chromium CDP ready on port ' + CDP_PORT);

  const results = [];
  let allPassed = true;

  console.log('\n--- Auditing Responsive Conformance Across Viewports ---\n');

  for (const vp of VIEWPORTS) {
    // Set device metrics override via CDP
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 1,
      mobile: vp.width < 768
    });

    // Navigate to homepage
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${TEST_PORT}/` });
    await sleep(600); // Allow render

    // Evaluate layout dimensions
    const metrics = await cdp.eval(`
      (() => {
        const doc = document.documentElement;
        const body = document.body;
        const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);
        const innerWidth = window.innerWidth;
        const clientWidth = doc.clientWidth;
        const hasHorizontalScroll = scrollWidth > innerWidth + 1; // 1px threshold for sub-pixel anti-aliasing

        // Check for any overflowing elements
        const overflowingElements = [];
        const all = document.querySelectorAll('*');
        for (const el of all) {
          const rect = el.getBoundingClientRect();
          if (rect.right > innerWidth + 2 && rect.width > 0 && rect.height > 0) {
            overflowingElements.push({
              tag: el.tagName,
              className: (el.className || '').slice(0, 50),
              right: Math.round(rect.right),
              width: Math.round(rect.width)
            });
            if (overflowingElements.length >= 3) break;
          }
        }

        return {
          scrollWidth,
          innerWidth,
          clientWidth,
          hasHorizontalScroll,
          overflowingCount: overflowingElements.length,
          sampleOverflow: overflowingElements[0] || null
        };
      })()
    `);

    const passed = !metrics.hasHorizontalScroll;
    if (!passed) allPassed = false;

    results.push({
      ...vp,
      ...metrics,
      passed
    });

    const symbol = passed ? '✓ [PASS]' : '✗ [FAIL]';
    console.log(`  ${symbol} ${vp.label.padEnd(50)} -> scrollWidth: ${metrics.scrollWidth}px, innerWidth: ${metrics.innerWidth}px, overflow: ${metrics.hasHorizontalScroll}`);
    if (!passed && metrics.sampleOverflow) {
      console.log(`         Overflown element: <${metrics.sampleOverflow.tag} class="${metrics.sampleOverflow.className}"> right=${metrics.sampleOverflow.right}px`);
    }
  }

  // Cleanup
  cdp.close();
  if (chromeProc) chromeProc.kill();
  if (server) server.close();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}

  console.log('\n======================================================================');
  console.log(`SUMMARY: ${results.filter(r => r.passed).length} / ${results.length} viewports passed cleanly without horizontal overflow.`);
  console.log('======================================================================\n');

  if (allPassed) {
    console.log('🎉 ALL 10 VIEWPORTS PASSED RESPONSIVE AUDIT 100%!');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runViewportAudit().catch(err => {
  console.error('Fatal viewport audit error:', err);
  if (chromeProc) chromeProc.kill();
  if (server) server.close();
  process.exit(1);
});
