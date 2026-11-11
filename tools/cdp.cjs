// After School · V0 · dev tool: drive headless Chrome over the DevTools protocol with no npm packages.
// Needs Node 22+ (built-in WebSocket and fetch) and an installed Chrome or Edge.
//   const { launch } = require('./cdp.cjs');
//   const page = await launch({ url, width: 1280, height: 720 });
//   await page.eval('1 + 1'); await page.shot('out.jpg'); await page.key('KeyA', 200); await page.close();
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VK = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Space: 32, Enter: 13, Escape: 27 };

function keyInfo(code) {
  if (code.startsWith('Key')) return { key: code.slice(3).toLowerCase(), vk: code.charCodeAt(3) };
  if (code === 'Space') return { key: ' ', vk: 32 };
  return { key: code, vk: VK[code] || 0 };
}

async function launch({ url, width = 1280, height = 720, headless = true, extraArgs = [] } = {}) {
  const exe = BROWSERS.find((p) => fs.existsSync(p));
  if (!exe) throw Error('No Chrome or Edge found. Set CHROME_PATH.');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'asa-cdp-'));
  const args = [
    headless ? '--headless=new' : '', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    ...extraArgs, 'about:blank',
  ].filter(Boolean);
  const child = spawn(exe, args, { stdio: 'ignore' });
  const portFile = path.join(profile, 'DevToolsActivePort');
  let port = 0;
  for (let i = 0; i < 100 && !port; i++) {
    await sleep(100);
    if (fs.existsSync(portFile)) port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
  }
  if (!port) { child.kill(); throw Error('Chrome did not open its debugging port.'); }
  let target = null;
  for (let i = 0; i < 50 && !target; i++) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
    if (!target) await sleep(100);
  }
  if (!target) { child.kill(); throw Error('No page target.'); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(Error('WebSocket failed')); });

  let nextId = 0;
  const pending = new Map();
  const waiters = [];
  const consoleLines = [];
  const errors = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(Error(msg.error.message)); else resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type)).join(' ');
      consoleLines.push(`[${msg.params.type}] ${text}`);
      if (msg.params.type === 'error') errors.push(text);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push(`${d.text} ${d.exception && d.exception.description ? d.exception.description : ''} @${d.lineNumber}:${d.columnNumber}`);
    }
    for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i].method === msg.method) { waiters[i].resolve(msg.params); waiters.splice(i, 1); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const once = (method, ms = 30000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(`Timed out waiting for ${method}`)), ms);
    waiters.push({ method, resolve: (p) => { clearTimeout(timer); resolve(p); } });
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  const page = {
    consoleLines, errors, send,
    async goto(href) { const loaded = once('Page.loadEventFired'); await send('Page.navigate', { url: href }); await loaded; },
    // Evaluates an expression (may return a promise); returns its JSON value.
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      if (r.exceptionDetails) throw Error(`eval failed: ${r.exceptionDetails.text} ${r.exceptionDetails.exception ? r.exceptionDetails.exception.description : ''}`);
      return r.result.value;
    },
    async waitFor(expression, ms = 30000, every = 100) {
      const end = Date.now() + ms;
      while (Date.now() < end) { if (await page.eval(expression)) return true; await sleep(every); }
      throw Error(`Timed out waiting for: ${expression}`);
    },
    // Saves a JPEG (default) or PNG; scale shrinks the picture so it stays small.
    async shot(file, { scale = 1, quality = 78 } = {}) {
      const png = file.toLowerCase().endsWith('.png');
      const r = await send('Page.captureScreenshot', {
        format: png ? 'png' : 'jpeg', quality: png ? undefined : quality,
        clip: { x: 0, y: 0, width, height, scale },
      });
      fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      return file;
    },
    async keyDown(code) { const k = keyInfo(code); await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code, key: k.key, windowsVirtualKeyCode: k.vk }); },
    async keyUp(code) { const k = keyInfo(code); await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k.key, windowsVirtualKeyCode: k.vk }); },
    async key(code, holdMs = 60) { await page.keyDown(code); await sleep(holdMs); await page.keyUp(code); },
    async click(x, y) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    },
    sleep,
    async close() {
      try { ws.close(); } catch (e) { /* already closed */ }
      child.kill();
      await sleep(300);
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* Chrome may still hold a file; the temp folder is harmless */ }
    },
  };
  if (url) await page.goto(url);
  return page;
}

module.exports = { launch, sleep };
