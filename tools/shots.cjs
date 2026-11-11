// After School · V0 · dev tool: plays set moments of the built game in headless Chrome and saves two contact sheets
// (shots/sheet-a.jpg, shots/sheet-b.jpg) plus a few numbers. Run after `node build.cjs`:  node tools/shots.cjs
// Needs Node 22+, Chrome or Edge, and internet (Three.js comes from jsDelivr).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { launch } = require('./cdp.cjs');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file:///' + path.join(ROOT, 'dist', 'index.html').replace(/\\/g, '/').replace(/ /g, '%20');
const OUT = path.join(ROOT, 'shots');

// [label, code to run in the page before the picture]
const SCENES = [
  ['title', null],
  ['day 1 · quiet ride', `ASA.load(0); ASA.run(6, 'bot')`],
  ['day 1 · the sky turns', `ASA.run(60, 'bot', (s) => s.d >= 215)`],
  ['day 1 · the gate, her line', `ASA.run(140, 'bot', (s) => s.phase === 'gate'); ASA.run(1.6, 'none')`],
  ['day 1 · helmet on her head', `ASA.run(7.8, 'none')`],
  ['day 1 · end card', `ASA.run(5, 'none')`],
  ['day 2 · he grabs the front', `ASA.load(1); ASA.run(40, 'bot', (s) => s.d >= 270); ASA.run(8, 'none', (s) => s.front.length > 0); ASA.run(1.4, 'none')`],
  ['day 2 · reaching for the neck', `ASA.run(2.6, 'none')`],
  ['day 2 · KLONK', `ASA.run(0.2, { hit: true })`],
  ['day 3 · in the mirror', `ASA.load(2); ASA.run(60, 'bot', (s) => s.d >= 310); ASA.run(6, 'none', (s) => s.rear.length > 0); ASA.run(3, 'none')`],
  ['day 4 · the bus', `ASA.load(3); ASA.run(60, 'bot', (s) => s.d >= 262)`],
  ['day 4 · the sidewalk', `ASA.run(20, 'bot', (s) => s.d >= 300)`],
  ['day 5 · the pile', `ASA.load(4); ASA.run(60, 'bot', (s) => s.d >= 226); ASA.run(8, 'none', (s) => s.front.length >= 2); ASA.run(2.6, 'none')`],
  ['day 6 · rain', `ASA.load(5); ASA.run(31, 'bot')`],
  ['day 8 · blackout', `ASA.load(7); ASA.run(60, 'bot', (s) => s.d >= 196)`],
  ['day 10 · the wave', `ASA.load(9); ASA.run(140, 'bot', (s) => s.d >= 866)`],
];

(async () => {
  const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
  const page = await launch({ url: URL });
  const frames = [];
  const notes = [];
  try {
    await page.waitFor('!!window.ASA || !document.querySelector("#notice").hidden && document.querySelector("#notice").textContent.includes("could not")', 90000);
    const failed = await page.eval('window.ASA ? "" : document.querySelector("#notice").textContent');
    if (failed) throw Error(failed);
    await page.sleep(3000);
    notes.push('title fps ' + (await page.eval('ASA.fps().toFixed(0)')) + ' · ' + JSON.stringify(await page.eval('ASA.info()')));
    for (let i = 0; i < SCENES.length; i++) {
      if (only && !only.includes(i)) continue;
      const [label, code] = SCENES[i];
      const t0 = Date.now();
      const info = code ? await page.eval(`JSON.stringify((() => { ${code.split('; ').map((c, k, a) => (k === a.length - 1 ? 'return ' + c : c)).join('; ')} })())`) : '';
      if (code) await page.sleep(120);
      const r = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 1280, height: 720, scale: 0.5 } });
      frames.push({ label, data: r.data });
      notes.push(`${i} ${label}: ${info} (${Date.now() - t0} ms) ${code ? JSON.stringify(await page.eval('ASA.info()')) : ''}`);
    }
    // measured frame rate while a real day runs on its own (day 5, bot riding, 4 s)
    await page.eval(`ASA.manual = false; ASA.game.start(ASA.DAYS[4], { quiet: true, bot: null }); 1`);
    await page.sleep(4000);
    notes.push('ride fps ' + (await page.eval('ASA.fps().toFixed(0)')) + ' · ' + JSON.stringify(await page.eval('ASA.info()')));
    notes.push('errors ' + JSON.stringify(page.errors.slice(0, 8)));
    fs.mkdirSync(OUT, { recursive: true });
    for (let n = 0; n * 8 < frames.length; n++) {
      const part = frames.slice(n * 8, n * 8 + 8);
      const rows = Math.ceil(part.length / 2);
      const html = part.map((f) => `<figure style="margin:0;position:relative;width:640px;height:360px"><img src="data:image/jpeg;base64,${f.data}" style="display:block"><figcaption style="position:absolute;left:0;top:0;background:#0a1115;color:#f6e5c7;font:15px Georgia;padding:3px 8px">${f.label}</figcaption></figure>`).join('');
      await page.goto('about:blank');
      await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: rows * 360, deviceScaleFactor: 1, mobile: false });
      await page.eval(`document.body.style.cssText = 'margin:0;display:grid;grid-template-columns:640px 640px;background:#0a1115'; document.body.innerHTML = ${JSON.stringify(html)}; 1`);
      await page.sleep(400);
      const r = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 80, clip: { x: 0, y: 0, width: 1280, height: rows * 360, scale: 1 } });
      const file = path.join(OUT, `sheet-${'abcdef'[n]}.jpg`);
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      notes.push(`${path.basename(file)} ${fs.statSync(file).size} bytes`);
    }
  } catch (e) {
    notes.push('FAILED ' + e.message);
    notes.push('errors ' + JSON.stringify(page.errors.slice(0, 8)));
    notes.push('console ' + JSON.stringify(page.consoleLines.slice(-6)));
    process.exitCode = 1;
  } finally {
    await page.close();
    console.log(notes.join('\n'));
  }
})();
