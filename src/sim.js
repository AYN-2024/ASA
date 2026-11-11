// After School · V0 · the simulation: one day's ride as pure rules (no DOM, no WebGL).
// The browser draws what this says; the node tests in ../test/ play it with bots.
// Game z = metres along the route; x = metres right of the road centre.
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./rules.js') : root.AsaRules);
  if (node) module.exports = api; else root.AsaSim = api;
})(typeof self !== 'undefined' ? self : this, function (R) {
  'use strict';

  const SPAWN_AHEAD = 120;
  const PASS_AT = 1.0;
  const ZOMBIE_HALF = 0.3;
  const KERB = 4.25;

  // Starting values; a day can override any of them in its cfg.
  const TUNE = Object.freeze({
    rideSpeed: 10.5,      // m/s cruise
    neckTimer: 10,        // s for one zombie to reach the neck
    climbTime: 2.0,       // s from grab to reaching
    lungeTime: 0.3,
    maxPile: 1,           // zombies allowed on the front
    maxRear: 3,           // zombies allowed on the back rail
    rearSlow: 0.12,       // speed and steering lost per rear hanger
    reach: 0.6,           // m of side air inside which a walker catches the back rail
    swingCool: 0.42,      // s between helmet swings
    swingHit: 0.11,       // s from press to contact
    swingWindow: 0.34,    // s the swing can still connect
    swingReach: 1.75,     // m sideways a swing covers
    walkSlow: 0.62,       // speed factor on the sidewalk
    civSlow: 0.3,         // speed factor right after bumping a person
    civRecover: 1.2,
    zoneBefore: 60,       // m of open sidewalk before a bus
    zoneAfter: 40,
    walkOuter: 6.3,       // furthest x on an open sidewalk
    busPass: 4.55,        // x needed to clear the bus
    arriveDist: 32,       // m of braking before the gate
    shamble: 0.7,         // walker speed toward the rider, m/s
    track: 0.5,           // walker sideways drift toward the rider, m/s
    lurchEvery: 2.7,      // s between throttle lurches while the front is held
  });

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function create(level, opts = {}) {
    const cfg = Object.freeze({ ...R.DEFAULTS, ...TUNE, ...(level.cfg || {}), ...(opts.cfg || {}) });
    const script = level.script;
    const events = [];
    const emit = (type, data) => { events.push({ type, ...(data || {}) }); };
    const s = {
      day: level.day, phase: 'ride', t: 0, d: 0, clock: 0, x: 0, vx: 0, speed: 0,
      lives: cfg.lives, meter: 0, wheelieUp: false, lift: 0, heldW: false,
      crashAt: -99, graceUntil: -99, slowAt: -99, lurchUntil: -99, onWalk: false, arriving: false,
      cars: [], buses: [], walkers: [], civs: [], front: [], rear: [], neck: 0, swing: null,
      idx: 0, nextId: 1, said: {}, result: null,
      stats: { close: 0, wide: 0, crashes: 0, over: 0, wheelies: 0, hits: 0, thuds: 0, front: 0, rear: 0, eaten: 0, people: 0 },
    };

    function say(key, text) { if (s.said[key]) return; s.said[key] = true; emit('cap', { text }); }

    function addMeter(n) {
      const before = s.meter;
      s.meter = R.addCharge(s.meter, n, cfg);
      if (before < cfg.minLift && s.meter >= cfg.minLift) say('lift', 'Hold W to wheelie.');
      if (!R.isFull(before, cfg) && R.isFull(s.meter, cfg)) emit('dial-full');
    }

    function caught() { s.phase = 'caught'; s.speed = 0; emit('caught'); }

    function crash(reason) {
      const res = R.applyCrash({ lives: s.lives, crashAt: s.crashAt, graceUntil: s.graceUntil }, s.t, cfg);
      if (!res.counted) return false;
      s.lives = res.rider.lives; s.crashAt = res.rider.crashAt; s.graceUntil = res.rider.graceUntil;
      s.meter = R.crashMeter(s.meter, cfg);
      s.stats.crashes++;
      if (s.wheelieUp) { s.wheelieUp = false; emit('wheelie-land', { why: 'crash' }); }
      emit('crash', { reason, lives: s.lives });
      if (s.lives <= 0) caught();
      return true;
    }

    function shedFront() {
      if (!s.front.length) return;
      emit('shed-front', { ids: s.front.map((f) => f.id) });
      s.front = []; s.neck = 0;
    }

    function eaten() {
      s.lives = Math.max(0, s.lives - 1);
      s.crashAt = s.t; s.graceUntil = s.t + cfg.grace;
      s.meter = R.crashMeter(s.meter, cfg);
      s.stats.eaten++;
      emit('eaten', { lives: s.lives });
      shedFront();
      if (s.lives <= 0) caught();
    }

    // --- the day's script ------------------------------------------------------------------
    function spawn(e) {
      const id = s.nextId++;
      if (e.type === 'car') s.cars.push({ id, kind: 'car', x: e.x, z: s.d + SPAWN_AHEAD, v: e.v || cfg.carSpeed, passed: false });
      else if (e.type === 'wall') {
        const full = R.isFull(s.meter, cfg);
        const xs = full ? [-3, -1, 1, 3] : [[-2.7, 0], [0, 2.7], [-2.7, 2.7]][id % 3];
        for (const x of xs) s.cars.push({ id: s.nextId++, kind: 'car', x, z: s.d + SPAWN_AHEAD, v: cfg.carSpeed, passed: false });
        if (full) say('wall', "Can't get round. Wheelie!");
      } else if (e.type === 'jam') s.cars.push({ id, kind: 'jam', x: e.x, z: e.z, v: 0, passed: false });
      else if (e.type === 'bus') s.buses.push({ id, z: e.z, side: e.side, passed: false });
      else if (e.type === 'walker') s.walkers.push({ id, x: e.x, z: e.z, state: 'walk', at: s.t, done: false, still: !!e.still, lunge: e.lunge || 0, sure: !!e.sure, rear: !!e.rear, gentle: !!e.gentle, ambient: !!e.ambient, wave: !!e.wave });
      else if (e.type === 'civ') s.civs.push({ id, x: e.x, z: e.z, v: e.v || 3.6, ambient: !!e.ambient, state: 'run', at: s.t, done: false });
      else if (e.type === 'cap') emit('cap', { text: e.text });
      else if (e.type === 'sms') emit('sms', { text: e.text });
      else if (e.type === 'thin' && s.meter >= cfg.minLift) say('wave', 'Wheelie. Straight through them.');
      else if (e.type === 'thin') {
        // Fairness: a wave only stays a wall if the dial can lift; otherwise the middle of it stumbles aside.
        const gapX = clamp(s.x, -2.6, 2.6);
        for (const w of s.walkers) if (w.wave && w.state === 'walk' && Math.abs(w.x - gapX) < 1.5) { w.state = 'down'; w.at = s.t; w.done = true; }
        emit('thin');
      }
    }

    // --- wheelie ----------------------------------------------------------------------------
    function tryLift() {
      const check = R.canLift({ wheelieUp: s.wheelieUp, grabbed: s.front.length > 0, onSidewalk: s.onWalk || s.arriving, meter: s.meter }, cfg);
      if (!check.ok) {
        if (check.reason === 'already-up') return;
        emit('wheelie-refused', { reason: check.reason });
        if (check.reason === 'not-charged') say('charge', 'Close passes and helmet hits fill the dial.');
        if (check.reason === 'grabbed') say('held', "Can't lift: he's holding the front.");
        return;
      }
      s.wheelieUp = true;
      s.stats.wheelies++;
      emit('wheelie-start');
    }

    // --- cars and the bus -----------------------------------------------------------------
    function resolveCar(car) {
      const gap = R.sideGap(car.x, s.x, cfg);
      const kind = R.passKind(gap, cfg);
      const side = car.x < s.x ? -1 : 1;
      emit('pass', { kind, side, gap, jam: car.kind === 'jam' });
      if (kind === 'hit') {
        if (s.wheelieUp || s.lift > 0.5) { s.stats.over++; emit('ride-over', { id: car.id }); return; }
        if (crash('car') && car.kind === 'car') { car.knockedAt = s.t; car.knockSide = side; }
        return;
      }
      if (car.kind === 'jam') return; // only moving cars charge the dial
      if (kind === 'close') { s.stats.close++; emit('close', { side }); } else s.stats.wide++;
      const gained = R.chargeForPass(kind, cfg);
      if (gained) addMeter(gained);
    }

    function hit(id, where, dir) {
      s.stats.hits++;
      addMeter(1);
      emit('klonk', { id, where, dir });
      if (level.day <= 2) say('klonk', 'Every hit fills the dial.');
    }

    function resolveWalker(w) {
      w.done = true;
      if (w.ambient) return;
      const gap = Math.abs(w.x - s.x) - (ZOMBIE_HALF + cfg.riderHalfWidth);
      const side = w.x < s.x ? -1 : 1;
      if (s.wheelieUp || s.lift > 0.5) {
        if (gap < 0.3) { w.state = 'down'; w.at = s.t; s.stats.thuds++; emit('thud', { id: w.id, side }); }
        return;
      }
      if (gap < 0) {
        if (s.t >= s.graceUntil && s.front.length < cfg.maxPile && !s.arriving) {
          w.state = 'front';
          s.front.push({ id: w.id, age: 0, gentle: w.gentle, reach: false, lurches: 0 });
          s.stats.front++;
          emit('grab-front', { id: w.id, slot: s.front.length - 1 });
          say('helmet', 'Hit him! F or click.');
          if (s.front.length > 1) say('pile', 'Two on the front. Hit twice.');
        } else { w.state = 'down'; w.at = s.t; s.vx -= side * 1.5; emit('ram', { id: w.id, side }); }
        return;
      }
      if ((gap <= cfg.reach || (w.rear && gap <= 1.3)) && s.t >= s.graceUntil && s.rear.length < cfg.maxRear && !s.arriving) {
        w.state = 'rear';
        s.rear.push({ id: w.id, at: s.t, side });
        s.stats.rear++;
        emit('grab-rear', { id: w.id, side, slot: s.rear.length - 1 });
        say('mirror', 'Check your mirrors.');
        if (s.meter >= cfg.minLift) say('shake', 'Wheelie shakes him off.');
        return;
      }
      if (gap < 1.4) emit('near', { id: w.id, side });
    }

    function arrive() {
      const frontIds = s.front.map((f) => f.id);
      const rearIds = s.rear.map((r) => r.id);
      s.front = []; s.rear = []; s.neck = 0; s.speed = 0; s.wheelieUp = false;
      s.phase = 'gate';
      s.result = { day: level.day, clock: s.clock, onTime: s.clock <= 300, lives: s.lives, clean: s.lives === cfg.lives, hangers: frontIds.length + rearIds.length, stats: { ...s.stats } };
      emit('arrived', { ...s.result, frontIds, rearIds });
    }

    // input: { steer: -1..1, wheelie: held, hit: pressed this frame }
    function update(dt, input) {
      events.length = 0;
      s.t += dt;
      if (s.phase !== 'ride') return events;
      s.clock = s.t * (300 / level.par);
      s.arriving = s.d >= level.length - cfg.arriveDist;
      while (s.idx < script.length && s.d >= script[s.idx].trig) spawn(script[s.idx++]);

      // steering, road edges and the open sidewalk beside a bus
      const bus = s.buses.find((b) => s.d >= b.z - cfg.zoneBefore && s.d <= b.z + cfg.zoneAfter) || null;
      let steer = clamp(input.steer || 0, -1, 1);
      if (s.arriving) steer = clamp(-s.x * 0.7, -1, 1);
      const strength = (s.wheelieUp ? cfg.wheelieSteer : 1) * (1 - cfg.rearSlow * s.rear.length);
      s.vx = R.steerVelocity(s.vx, steer, dt, cfg, strength);
      let minX = -cfg.roadHalf;
      let maxX = cfg.roadHalf;
      if (bus && bus.side > 0) maxX = cfg.walkOuter;
      if (bus && bus.side < 0) minX = -cfg.walkOuter;
      if (!bus && Math.abs(s.x) > cfg.roadHalf) { s.x = R.approach(s.x, Math.sign(s.x) * cfg.roadHalf, 4 * dt); s.vx = 0; }
      else {
        const nx = clamp(s.x + s.vx * dt, minX, maxX);
        if (nx === minX || nx === maxX) s.vx = 0;
        s.x = nx;
      }
      const walk = Math.abs(s.x) > KERB;
      if (walk !== s.onWalk) { s.onWalk = walk; emit('kerb', { up: walk }); }

      // speed
      let f = R.speedFactor({ crashAt: s.crashAt, wheelieUp: s.wheelieUp, grabbed: s.front.length > 0 }, s.t, cfg);
      f *= 1 - cfg.rearSlow * s.rear.length;
      if (s.onWalk) f *= cfg.walkSlow;
      const since = s.t - s.slowAt;
      if (since < cfg.civRecover) f *= cfg.civSlow + (1 - cfg.civSlow) * (since / cfg.civRecover);
      f *= Math.min(1, 0.25 + s.t / 1.6);
      if (s.t < s.lurchUntil) f *= 1.25;
      if (s.arriving) f = Math.min(f, Math.max(0.22, Math.sqrt(Math.max(0, level.length - s.d) / cfg.arriveDist)));
      s.speed = cfg.rideSpeed * f;
      s.d += s.speed * dt;
      if (s.d >= level.length - 0.6) { arrive(); return events; }

      // wheelie
      if (input.wheelie && !s.heldW) tryLift();
      s.heldW = !!input.wheelie;
      if (s.wheelieUp) {
        s.meter = R.drainMeter(s.meter, dt, cfg);
        const why = s.onWalk || s.arriving ? 'blocked' : R.dropReason(!!input.wheelie, s.meter);
        if (why) { s.wheelieUp = false; emit('wheelie-land', { why }); }
      }
      s.lift = R.approach(s.lift, s.wheelieUp ? 1 : 0, 4 * dt);
      if (s.lift > 0.5 && s.rear.length) { emit('shed-rear', { ids: s.rear.map((r) => r.id) }); s.rear = []; }

      // the helmet
      if (input.hit && (!s.swing || s.t - s.swing.at >= cfg.swingCool)) {
        s.swing = { at: s.t, done: false, front: s.front.length > 0, dir: s.swing ? -s.swing.dir : 1 };
        emit('swing', { front: s.swing.front });
      }
      if (s.swing && !s.swing.done) {
        const age = s.t - s.swing.at;
        if (s.front.length && age >= cfg.swingHit) {
          const top = s.front.pop();
          s.neck = s.front.length ? s.neck * 0.5 : 0;
          s.swing.done = true;
          hit(top.id, 'front', s.swing.dir);
        } else if (!s.front.length) {
          // one button hits whoever is nearest: the whole swing can connect, so the timing is generous
          const w = s.walkers.find((k) => k.state === 'walk' && !k.ambient && !k.done && k.z - s.d > -0.5 && k.z - s.d < 2.6 && Math.abs(k.x - s.x) <= cfg.swingReach);
          if (w) { w.state = 'fly'; w.at = s.t; w.done = true; w.dir = w.x < s.x ? -1 : 1; s.swing.done = true; hit(w.id, 'side', w.dir); }
        }
        if (!s.swing.done && age > cfg.swingWindow) { s.swing.done = true; emit('whiff'); }
      }

      // cars
      for (const car of s.cars) {
        car.z -= car.v * dt;
        if (!car.passed && car.z - s.d <= PASS_AT) { car.passed = true; resolveCar(car); }
      }
      s.cars = s.cars.filter((c) => c.z > s.d - 45);
      for (const b of s.buses) {
        if (b.passed || b.z - 1.8 - s.d > PASS_AT) continue;
        b.passed = true;
        if (b.side * s.x < cfg.busPass) { crash('bus'); s.x = b.side * 5.3; s.vx = 0; if (!s.onWalk) { s.onWalk = true; emit('kerb', { up: true }); } }
      }

      // walkers
      for (const w of s.walkers) {
        if (w.state !== 'walk') continue;
        const rel = w.z - s.d;
        if (!w.still && !w.ambient && !w.done) {
          if (w.lunge) {
            if (rel < w.lunge) {
              const tx = w.rear ? s.x + (w.x < s.x ? -1 : 1) : s.x;
              w.x = R.approach(w.x, clamp(tx, -3.8, 3.8), (w.sure ? 4.5 : 2.4) * dt);
            }
          } else {
            w.z -= cfg.shamble * dt;
            if (rel < 40) w.x = R.approach(w.x, clamp(s.x, -3.6, 3.6), cfg.track * dt);
          }
        }
        if (!w.done && rel <= 0.9) resolveWalker(w);
      }
      s.walkers = s.walkers.filter((w) => w.state !== 'front' && w.state !== 'rear' && w.z > s.d - 45);

      // people on the sidewalk
      for (const c of s.civs) {
        c.z -= c.v * dt;
        if (c.ambient || c.state !== 'run' || c.done) continue;
        const rel = c.z - s.d;
        if (rel < 12 && rel > 0.8) {
          const side = Math.sign(c.x) || 1;
          const away = Math.abs(c.x) + (Math.abs(c.x) < Math.abs(s.x) ? -1 : 1);
          c.x = side * R.approach(Math.abs(c.x), clamp(away, 4.7, 6.5), 0.9 * dt);
        }
        if (rel <= 0.8) {
          c.done = true;
          if (Math.abs(c.x - s.x) < 0.72) { s.slowAt = s.t; s.stats.people++; c.state = 'dive'; c.at = s.t; emit('civ', { id: c.id, side: c.x < s.x ? -1 : 1 }); say('people', 'Not them. Never them.'); }
        }
      }
      s.civs = s.civs.filter((c) => c.z > s.d - 30);

      // the pile on the front
      if (s.front.length) {
        let reaching = 0;
        s.front.forEach((fz, i) => {
          fz.age += dt;
          if (fz.age >= cfg.lungeTime + cfg.climbTime * (i ? 0.8 : 1)) { fz.reach = true; if (!fz.gentle) reaching++; }
        });
        const f0 = s.front[0];
        const k = Math.floor(f0.age / cfg.lurchEvery);
        if (k > f0.lurches) { f0.lurches = k; const dir = k % 2 ? 1 : -1; s.vx += dir * 2.4; s.lurchUntil = s.t + 0.35; emit('lurch', { dir }); }
        if (reaching) { s.neck += (dt * reaching) / cfg.neckTimer; if (s.neck >= 1) eaten(); }
      }
      return events;
    }

    return { s, cfg, level, events, update };
  }

  // 300 game seconds from 2:25:00. Returns "2:27" or "2:29:41".
  function clockText(clock, seconds) {
    const total = 145 * 60 + Math.max(0, Math.floor(clock));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    const mm = String(m).padStart(2, '0');
    return seconds ? `${h}:${mm}:${String(sec).padStart(2, '0')}` : `${h}:${mm}`;
  }

  // The three stamps on the end card.
  function stamps(result) { return { gotHer: true, onTime: !!result.onTime, clean: !!result.clean }; }

  return Object.freeze({ TUNE, create, clockText, stamps, KERB });
});
