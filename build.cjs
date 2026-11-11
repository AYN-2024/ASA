// Builds After School V0 into one self-contained page: dist/index.html (art, cars, scooter and zombie embedded).
//   node build.cjs                 build dist/index.html
//   node build.cjs --release v1    also keep a named copy in ../../05-Builds/ (never overwrites a different file)
// Three.js 0.170.0 loads from jsDelivr through an import map, so the page needs internet. No npm packages.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const HERE = __dirname;
const ASSETS = path.join(HERE, 'assets');
const OUT = path.join(HERE, 'dist');
const CARS = ['sedan', 'suv', 'taxi', 'van', 'hatchback-sports', 'delivery', 'police', 'truck'];
const SCRIPTS = ['rules.js', 'sim.js', 'levels.js', 'bot.js', 'sprites.js', 'audio.js', 'style.js', 'world.js', 'rider.js', 'figures.js', 'hud.js', 'game.js', 'app.js'];
const THREE_VERSION = '0.170.0';

const b64 = (name) => fs.readFileSync(path.join(ASSETS, name)).toString('base64');
const png = (name) => `data:image/png;base64,${b64(name)}`;
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function build() {
  const template = fs.readFileSync(path.join(HERE, 'index.template.html'), 'utf8');
  if (!template.includes('<!--SCRIPTS-->')) throw Error('the template lost its <!--SCRIPTS--> marker');
  const art = { road: png('road.png'), facade: png('facade.png'), colormap: png('car-colormap.png') };
  const glb = { scooter: b64('scooter.glb'), bust: b64('zombie-bust.glb'), hand: b64('zombie-hand.glb'), cars: Object.fromEntries(CARS.map((n) => [n, b64(`car-${n}.glb`)])) };
  const importMap = { imports: { three: `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.min.js`, 'three/addons/': `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/` } };
  const code = SCRIPTS.map((name) => {
    const src = fs.readFileSync(path.join(HERE, 'src', name), 'utf8');
    if (src.includes('</script')) throw Error(`${name} contains a closing script tag`);
    return `// ---- ${name}\n${src}`;
  }).join('\n');
  const scripts = [
    `<script type="importmap">${JSON.stringify(importMap)}</script>`,
    `<script>window.ASA_ART=${JSON.stringify(art)};window.ASA_GLB=${JSON.stringify(glb)};</script>`,
    `<script type="module">\nimport * as THREE from 'three';\nimport { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';\nimport * as BGU from 'three/addons/utils/BufferGeometryUtils.js';\n${code}\n</script>`,
  ].join('\n');
  const page = template.replace('<!--SCRIPTS-->', () => scripts);
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, 'index.html');
  fs.writeFileSync(file, page);
  const report = { file: 'dist/index.html', bytes: Buffer.byteLength(page), sha256: sha(page) };
  if (report.bytes > 16 * 1024 * 1024) throw Error('the page is over 16 MB');

  const at = process.argv.indexOf('--release');
  if (at > 0) {
    const version = process.argv[at + 1] || 'v1';
    const builds = path.resolve(HERE, '..', '..', '05-Builds');
    if (!fs.existsSync(builds)) throw Error('no 05-Builds folder next to the game (releases are kept in the studio folder only)');
    const date = new Date().toISOString().slice(0, 10);
    const name = `after-school-apocalypse__ten-days-fpv-3d__playtest__${version}__${date}.html`;
    const target = path.join(builds, name);
    if (fs.existsSync(target) && sha(fs.readFileSync(target)) !== report.sha256) throw Error(`${name} already exists with different content: use the next version`);
    fs.copyFileSync(file, target);
    report.release = { file: `05-Builds/${name}`, bytes: fs.statSync(target).size, sha256: sha(fs.readFileSync(target)) };
  }
  return report;
}

process.stdout.write(`${JSON.stringify(build(), null, 1)}\n`);
