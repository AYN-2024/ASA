// After School · V0 · boot: assets, the Three.js scene, screens, input, saving, and the frame loop.
// THREE, GLTFLoader and BufferGeometryUtils (BGU) are imported once at the top of the built module (see build.cjs).
(function (root) {
  'use strict';
  const Sim = root.AsaSim, Bot = root.AsaBot, DAYS = root.AsaLevels.DAYS;
  const SAVE_KEY = 'asa-v0';
  const TRAFFIC = ['sedan', 'suv', 'taxi', 'van', 'hatchback-sports', 'delivery', 'police', 'truck'];
  const PARKED = ['sedan', 'suv', 'van'];
  const NONE = Object.freeze({ steer: 0, wheelie: false, hit: false, skip: false });
  const $ = (sel) => document.querySelector(sel);

  let save = { best: {}, cracked: false, motion: true, muted: false };
  try { save = { ...save, ...(JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') || {}) }; } catch (e) { /* storage blocked: progress lasts for this visit */ }
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* see above */ } };

  const loadImage = (src) => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(Error('A picture could not load.')); img.src = src; });
  function buffer(b64) { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out.buffer; }
  const parse = (loader, b64) => new Promise((resolve, reject) => loader.parse(buffer(b64), '', (gltf) => resolve(gltf.scene), reject));
  function oneGeometry(sceneRoot) { // the model's first mesh as plain positions and normals
    let geo = null;
    sceneRoot.updateMatrixWorld(true);
    sceneRoot.traverse((o) => { if (o.isMesh && !geo) { geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k); } });
    return geo;
  }

  async function build() {
    const canvas = $('#world');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(1);
    renderer.setSize(canvas.width, canvas.height, false);
    const style = root.AsaStyle.createStyle(THREE);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(68, canvas.width / canvas.height, 0.1, 260);
    camera.layers.enable(2); // the cockpit layer: arms, helmet and mirror glass, which the mirrors' own camera must not see
    const images = Object.fromEntries(await Promise.all(Object.entries(root.ASA_ART).map(async ([k, src]) => [k, await loadImage(src)])));
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => (url.endsWith('colormap.png') ? root.ASA_ART.colormap : url));
    const loader = new GLTFLoader(manager);
    const palette = style.recolorPalette(images.colormap);
    const cars = {};
    for (const name of TRAFFIC) cars[name] = style.paintKenney(await parse(loader, root.ASA_GLB.cars[name]), palette);
    const assets = {
      images, traffic: TRAFFIC.map((n) => cars[n]), parked: PARKED.map((n) => cars[n]),
      bust: oneGeometry(await parse(loader, root.ASA_GLB.bust)), hand: oneGeometry(await parse(loader, root.ASA_GLB.hand)),
    };
    const world = root.AsaWorld.createWorld(THREE, BGU, scene, style, assets);
    const rider = root.AsaRider.createRider(THREE, style, await parse(loader, root.ASA_GLB.scooter));
    const figures = root.AsaFigures.createFigures(THREE, style, assets);
    const hud = root.AsaHud.createHud($('#hud'));
    $('#grain').style.backgroundImage = `url(${style.grainCanvas().toDataURL()})`;
    return { THREE, renderer, scene, camera, world, rider, figures, hud, hudCanvas: $('#hud') };
  }

  function wire(parts) {
    let mode = 'title';      // title · intro · ride · end · caught · paused
    let day = 0;             // index into DAYS
    let audio = null;
    let lastResult = null;
    const held = { left: false, right: false, wheelie: false };
    const touch = { steer: 0, id: null, x0: 0, wheelie: false };
    let hitQueued = false, skipQueued = false;

    const game = root.AsaGame.createGame({
      ...parts,
      onEvent(name, data) {
        if (name === 'cracked') { save.cracked = true; persist(); return; }
        if (mode === 'title') { if (name === 'gate-done' || name === 'caught') attract(); return; }
        if (name === 'gate-done') showEnd(data);
        if (name === 'caught') show('caught');
      },
    });
    game.opt.motion = save.motion;

    function show(next) {
      mode = next;
      for (const id of ['title', 'intro', 'end', 'caught', 'paused', 'fin']) $('#' + id).hidden = id !== next;
      $('#pause').hidden = next !== 'ride';
      if (next !== 'ride' && document.activeElement) document.activeElement.blur();
    }
    function attract() { game.start(DAYS[(Math.floor(Math.random() * 4) + 2) % DAYS.length], { quiet: true, bot: Bot.create('expert', Date.now() % 1000), cracked: save.cracked }); }

    function stampsFor(r) { return (r ? 1 : 0) + (r && r.onTime ? 1 : 0) + (r && r.clean ? 1 : 0); }
    function drawDays() {
      const box = $('#days');
      box.innerHTML = '';
      const next = DAYS.findIndex((d) => !save.best[d.day]);
      DAYS.forEach((d, i) => {
        const b = document.createElement('button');
        const best = save.best[d.day];
        b.type = 'button';
        b.className = 'day' + (best ? ' done' : '') + (i === (next < 0 ? 0 : next) ? ' next' : '');
        b.innerHTML = `<b>${d.day}</b><span>${d.name.slice(0, 3)}</span><i>${'●'.repeat(stampsFor(best))}${'○'.repeat(3 - stampsFor(best))}</i>`;
        b.title = `${d.name}: ${d.tag}${best ? ' · best ' + Sim.clockText(best.clock, true) : ''}`;
        b.addEventListener('click', () => intro(i));
        box.append(b);
      });
      $('#play').textContent = next > 0 ? `Ride · ${DAYS[next].name}` : 'Ride';
      $('#play').onclick = () => intro(next < 0 ? 0 : next);
    }

    async function sound() {
      if (audio) return;
      try { audio = root.AsaAudio.createAudio(); await audio.resume(); audio.setMuted(save.muted); game.setAudio(audio); } catch (e) { audio = null; }
    }

    function intro(i) {
      day = i;
      const d = DAYS[i];
      sound();
      game.start(d, { cracked: save.cracked });
      $('#intro-day').textContent = `${d.name} · day ${d.day} of 10`;
      $('#intro-tag').textContent = d.tag;
      $('#intro-texts').innerHTML = '';
      for (const line of d.wife) { const p = document.createElement('p'); p.className = 'bubble'; p.textContent = line; $('#intro-texts').append(p); }
      $('#go').textContent = d.reply;
      show('intro');
      if (audio) audio.buzz();
    }
    function ride() { show('ride'); held.left = held.right = held.wheelie = false; hitQueued = skipQueued = false; }

    function showEnd(r) {
      lastResult = r;
      const d = DAYS[day];
      const old = save.best[d.day];
      const better = !old || stampsFor(r) > stampsFor(old) || (stampsFor(r) === stampsFor(old) && r.clock < old.clock);
      if (better) { save.best[d.day] = { clock: r.clock, onTime: r.onTime, clean: r.clean }; persist(); }
      $('#end-day').textContent = `${d.name} · day ${d.day}`;
      $('#end-time').textContent = Sim.clockText(r.clock, true);
      $('#end-verdict').textContent = r.onTime ? 'On time.' : `${Math.ceil(r.clock - 300)} s late on the clock.`;
      $('#stamp-time').classList.toggle('earned', r.onTime);
      $('#stamp-clean').classList.toggle('earned', r.clean);
      $('#end-stats').textContent = `Close passes ${r.stats.close} · helmet hits ${r.stats.hits} · wheelies ${r.stats.wheelies} · crashes ${r.stats.crashes + r.stats.eaten}${better && old ? ' · new best' : ''}`;
      $('#next').textContent = day === DAYS.length - 1 ? 'Tomorrow' : `${DAYS[day + 1].name} →`;
      show('end');
      if (audio) { audio.stamp(); if (r.onTime) setTimeout(() => audio && audio.stamp(), 260); if (r.clean) setTimeout(() => audio && audio.stamp(), 520); }
    }

    function primary() { // Enter, or the red button of whichever card is up
      if (mode === 'title') $('#play').click();
      else if (mode === 'intro') ride();
      else if (mode === 'end') $('#next').click();
      else if (mode === 'caught') intro(day);
      else if (mode === 'paused') show('ride');
      else if (mode === 'fin') { drawDays(); show('title'); attract(); }
    }
    $('#go').addEventListener('click', ride);
    $('#next').addEventListener('click', () => { if (day === DAYS.length - 1) { $('#fin-text').textContent = DAYS[day].tomorrow; show('fin'); } else intro(day + 1); });
    $('#again').addEventListener('click', () => intro(day));
    $('#retry').addEventListener('click', () => intro(day));
    $('#resume').addEventListener('click', () => show('ride'));
    $('#restart').addEventListener('click', () => intro(day));
    for (const id of ['to-days', 'quit', 'fin-days', 'caught-days']) $('#' + id).addEventListener('click', () => { drawDays(); show('title'); attract(); });
    $('#pause').addEventListener('click', () => { if (mode === 'ride') show('paused'); });
    const muteBtn = $('#mute');
    const paintMute = () => { muteBtn.textContent = save.muted ? 'Sound off' : 'Sound on'; };
    muteBtn.addEventListener('click', () => { save.muted = !save.muted; persist(); paintMute(); if (audio) audio.setMuted(save.muted); muteBtn.blur(); });
    paintMute();
    const motion = $('#motion');
    motion.checked = save.motion;
    motion.addEventListener('change', () => { save.motion = motion.checked; game.opt.motion = save.motion; persist(); });

    // --- input: keyboard, mouse, touch --------------------------------------------------------------------
    const KEY = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'wheelie', KeyW: 'wheelie', Space: 'wheelie' };
    const HIT = ['KeyF', 'KeyJ', 'KeyK', 'ShiftLeft', 'ShiftRight'];
    root.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') { e.preventDefault(); if (mode === 'ride') skipQueued = true; else primary(); return; }
      if (e.code === 'KeyP' || e.code === 'Escape') { if (mode === 'ride') show('paused'); else if (mode === 'paused') show('ride'); return; }
      if (e.code === 'KeyM') { muteBtn.click(); return; }
      if (mode !== 'ride') return;
      if (HIT.includes(e.code)) { if (!e.repeat) hitQueued = true; e.preventDefault(); return; }
      const name = KEY[e.code];
      if (name) { held[name] = true; e.preventDefault(); }
    });
    root.addEventListener('keyup', (e) => { const name = KEY[e.code]; if (name) held[name] = false; });
    root.addEventListener('blur', () => { held.left = held.right = held.wheelie = false; touch.steer = 0; touch.wheelie = false; });
    document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'ride') show('paused'); });
    const frameEl = $('#frame');
    frameEl.addEventListener('pointerdown', (e) => {
      if (mode !== 'ride' || e.target.closest('button')) return;
      if (e.pointerType === 'touch') {
        $('#touch').hidden = false;
        if (touch.id === null) { touch.id = e.pointerId; touch.x0 = e.clientX; touch.steer = 0; }
      } else hitQueued = true;
    });
    frameEl.addEventListener('pointermove', (e) => { if (e.pointerId === touch.id) touch.steer = Math.max(-1, Math.min(1, (e.clientX - touch.x0) / 60)); });
    const lift = (e) => { if (e.pointerId === touch.id) { touch.id = null; touch.steer = 0; } };
    frameEl.addEventListener('pointerup', lift);
    frameEl.addEventListener('pointercancel', lift);
    $('#t-hit').addEventListener('pointerdown', (e) => { e.preventDefault(); if (mode === 'ride') hitQueued = true; });
    const tw = $('#t-wheelie');
    tw.addEventListener('pointerdown', (e) => { e.preventDefault(); touch.wheelie = true; });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) tw.addEventListener(type, () => { touch.wheelie = false; });

    function readInput() {
      const steer = Math.max(-1, Math.min(1, (held.right ? 1 : 0) - (held.left ? 1 : 0) + touch.steer));
      const input = { steer, wheelie: held.wheelie || touch.wheelie, hit: hitQueued, skip: skipQueued };
      hitQueued = false; skipQueued = false;
      return input;
    }

    // --- loop -----------------------------------------------------------------------------------------------
    let last = 0;
    const ms = [];
    function tick(now) {
      const dt = last ? Math.min(0.05, Math.max(0, (now - last) / 1000)) : 0;
      last = now;
      if (!root.ASA.manual) {
        if (mode === 'ride') game.frame(dt, readInput());
        else if (mode === 'title') game.frame(dt, NONE);
        else game.frame(0, NONE);
        ms.push(dt * 1000); if (ms.length > 90) ms.shift();
      }
      root.requestAnimationFrame(tick);
    }

    // --- hooks for the tests and the screenshot tool (tools/shots.cjs) ----------------------------------------
    root.ASA = {
      manual: false, game, DAYS,
      get mode() { return mode; },
      fps() { const avg = ms.reduce((a, b) => a + b, 0) / Math.max(1, ms.length); return avg ? 1000 / avg : 0; },
      info() { const i = parts.renderer.info.render; return { calls: i.calls, triangles: i.triangles }; },
      // load a day and take the frame loop over; then step it by hand
      load(i, opts) { root.ASA.manual = true; day = i; game.start(DAYS[i], { cracked: save.cracked, ...(opts || {}) }); show('ride'); },
      // seconds of play; input: 'none', 'bot', or an object. until: optional test on the sim state.
      run(seconds, input, until) {
        const bot = input === 'bot' ? Bot.create('expert', 7) : null;
        const steps = Math.round(seconds * 60);
        for (let k = 0; k < steps; k++) {
          const inp = bot ? bot(game.sim) : typeof input === 'object' && input ? { ...NONE, ...input } : NONE;
          game.frame(1 / 60, inp, k < steps - 20);
          if (until && until(game.sim.s)) break;
        }
        game.frame(0, NONE);
        const s = game.sim.s;
        return { t: s.t, d: s.d, phase: s.phase, lives: s.lives, meter: s.meter, front: s.front.length, rear: s.rear.length, mode };
      },
    };

    drawDays();
    show('title');
    attract();
    root.requestAnimationFrame(tick);
  }

  (async () => {
    const notice = $('#notice');
    try {
      const parts = await build();
      wire(parts);
      notice.hidden = true;
      $('#world').addEventListener('webglcontextlost', (e) => { e.preventDefault(); notice.hidden = false; notice.textContent = 'Graphics were interrupted. Reload the page to continue.'; });
    } catch (e) {
      notice.hidden = false;
      notice.textContent = `The game could not start: ${e.message}`;
      console.error(e);
    }
  })();
})(typeof self !== 'undefined' ? self : this);
