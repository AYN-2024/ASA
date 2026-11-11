// After School · V0 · the game view: plays one day's simulation and draws it — camera, zombies on the bars and in the
// mirrors, the helmet, the gate scene with her. Rules live in sim.js; this file only shows and sounds them.
(function (root) {
  'use strict';
  const R = root.AsaRules, Sim = root.AsaSim, World = root.AsaWorld;
  const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const RIDE_OVER_S = 0.6, RIDE_OVER_LIFT = 1.25;

  function createGame({ THREE, renderer, scene, camera, world, rider, figures, hud, hudCanvas, onEvent }) {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const t1 = V(), t2 = V(), t3 = V(), pole = V();
    const look = new THREE.PerspectiveCamera(); // a camera, so lookAt aims its -z like the real one
    const qRide = new THREE.Quaternion();
    const opt = { motion: true, fov: 68, pitch: 0.1, wheelieAngle: 0.3 };
    const pool = { zombie: [], civA: [], civB: [] };
    const handPool = [figures.heroHands(), figures.heroHands(), figures.heroHands()];
    const actors = new Map();
    const kid = figures.make('kid', 0.3);
    scene.add(kid.group, rider.rig);
    let audio = null, sim = null, level = null, quiet = false, bot = null;
    let time = 0, freeze = 0, shakeUntil = -1, rideOverAt = -99, swingAt = -99, swingInfo = null, heartAt = 0, caughtAt = -1;
    let cracked = false, legP = 0, legSide = 1;
    const kick = { dip: 0, bump: 0, yaw: 0, roll: 0, fov: 0 };
    let gate = null;

    // --- actors: one figure per walker, hanger or person ---------------------------------------------------
    function actor(id, kind) {
      let a = actors.get(id);
      if (a) return a;
      const fig = pool[kind].pop() || figures.make(kind === 'zombie' ? 'zombie' : kind, 0);
      fig.seed = hash(id);
      fig.group.rotation.set(0, 0, 0); fig.group.scale.setScalar(1); fig.group.visible = true;
      scene.add(fig.group);
      a = { id, kind, fig, mode: 'new', at: time, vel: V(), spin: 1, bounced: false, hands: null, from: V() };
      actors.set(id, a);
      return a;
    }
    function dropHands(a) { if (!a.hands) return; figures.takeHands(a.fig); handPool.push(a.hands); a.hands = null; }
    function release(a) {
      dropHands(a);
      if (a.fig.group.parent) a.fig.group.parent.remove(a.fig.group);
      pool[a.kind].push(a.fig);
      actors.delete(a.id);
    }
    function launch(a, dir, vz, vy) {
      scene.attach(a.fig.group);
      dropHands(a);
      a.mode = 'fly'; a.at = time; a.bounced = false; a.spin = dir || 1;
      a.vel.set((dir || 1) * 4.6, vy === undefined ? 5 : vy, vz);
    }
    function place(fig, x, z, y) {
      fig.group.position.set(World.roadCenter(z) + x, y || (Math.abs(x) > Sim.KERB ? 0.11 : 0), -z);
    }

    // the pile: slot 0 hugs the column, the others climb over him
    const CHEST = [[[0, 0.98, 0.82, 0.15], [0, 1.22, 0.76, 0.3], [0, 1.27, 0.62, 0.55]], [[0.2, 1.22, 0.92, 0.2], [0.13, 1.5, 0.74, 0.45], [0.1, 1.55, 0.55, 0.7]], [[-0.22, 1.3, 0.95, 0.2], [-0.16, 1.66, 0.78, 0.5], [-0.12, 1.7, 0.58, 0.75]]];
    function poseFront(a, f, slot) {
      const cfg = sim.cfg, fig = a.fig, g = fig.group;
      const climb = smooth(0, 1, (f.age - cfg.lungeTime) / (cfg.climbTime * (slot ? 0.8 : 1)));
      const reach = f.reach ? smooth(0, 0.5, f.age - cfg.lungeTime - cfg.climbTime * (slot ? 0.8 : 1)) : 0;
      const c = CHEST[Math.min(slot, 2)], A = c[0], B = c[1], C = c[2];
      const mix = (i) => (A[i] + (B[i] - A[i]) * climb) * (1 - reach) + C[i] * reach;
      const tilt = mix(3), wob = Math.sin(time * 6 + fig.seed * 9) * 0.02;
      // group origin (feet) so that the chest (1.3 m up the figure) lands on the target, in body space
      const target = rider.inBody(mix(0) + wob, mix(1), mix(2));
      t1.set(target.x, target.y - 1.3 * Math.cos(tilt), target.z + 1.3 * Math.sin(tilt));
      const k = Math.min(1, f.age / cfg.lungeTime);
      g.position.copy(a.from).lerp(t1, k * k);
      g.rotation.set(tilt * k, Math.PI, 0);
      figures.pose(fig, 'cling', time, climb);
      for (const [S, sx] of [['L', -1], ['R', 1]]) { // the figure faces the rider, so its left is the rider's right
        const bar = rider.inBody(sx * (0.25 + slot * 0.04), 1.13, 0.4);
        const neck = rider.inBody(sx * 0.12 + Math.sin(time * 9 + sx) * 0.02, 1.4 + Math.sin(time * 7 + sx * 2) * 0.03, -0.12 - slot * 0.03);
        t2.copy(bar).lerp(neck, reach);
        rider.body.localToWorld(t2);
        pole.set(sx * 0.6, -0.5, 0.2).applyQuaternion(rider.rig.quaternion);
        figures.armIK(fig, S, t2, pole);
      }
    }
    function poseRear(a, r, slot) {
      const fig = a.fig, g = fig.group, age = time - a.at;
      const up = smooth(0, 6, age), tilt = 1.15 - 0.25 * up, sx = -r.side * (0.26 - slot * 0.1) + (slot === 1 ? 0.3 * r.side : 0);
      const cy = 0.74 + 0.2 * up, cz = -1.36 + 0.12 * up - slot * 0.12;
      t1.set(sx, cy - 1.3 * Math.cos(tilt), cz - 1.3 * Math.sin(tilt));
      const k = Math.min(1, age / 0.25);
      g.position.copy(a.from).lerp(t1, k);
      g.rotation.set(tilt * k, 0, 0);
      figures.pose(fig, 'hang', time);
      for (const [S, hx] of [['L', 0.13], ['R', -0.13]]) {
        t2.set(sx + hx, 0.9, -0.93);
        rider.rig.localToWorld(t2);
        pole.set(hx * 4, -0.6, 0).applyQuaternion(rider.rig.quaternion);
        figures.armIK(fig, S, t2, pole);
      }
    }

    function syncActors(dt) {
      const s = sim.s, live = new Set();
      const riderX = World.roadCenter(s.d) + s.x;
      let nearHeads = 0; // only the nearest few zombies wear the creator's full bust; the rest get the light head
      for (const w of s.walkers) {
        live.add(w.id);
        const a = actor(w.id, 'zombie');
        if (w.state === 'walk') {
          a.mode = 'walk';
          place(a.fig, w.x, w.z);
          a.fig.group.rotation.set(0, Math.max(-0.7, Math.min(0.7, Math.atan2(riderX - a.fig.group.position.x, Math.max(2, w.z - s.d)))), 0);
          figures.pose(a.fig, w.still || w.ambient ? 'stand' : 'walk', time * (w.lunge && w.z - s.d < w.lunge ? 2 : 1));
          const near = w.z - s.d < 20 && w.z - s.d > -3 && nearHeads < 6;
          if (near) nearHeads++;
          figures.lod(a.fig, !near);
        } else if (w.state === 'down' && a.mode !== 'down' && a.mode !== 'lie') { a.mode = 'down'; a.at = time; place(a.fig, w.x, w.z); }
        else if (w.state === 'fly' && a.mode !== 'fly' && a.mode !== 'lie') launch(a, w.dir, -s.speed * 0.35);
      }
      s.front.forEach((f, i) => {
        live.add(f.id);
        const a = actor(f.id, 'zombie');
        if (a.mode !== 'front') {
          rider.body.attach(a.fig.group);
          a.from.copy(a.fig.group.position);
          a.mode = 'front'; a.at = time; figures.lod(a.fig, false);
          if (handPool.length) { a.hands = handPool.pop(); figures.giveHands(a.fig, a.hands); }
        }
        poseFront(a, f, i);
      });
      s.rear.forEach((r, i) => {
        live.add(r.id);
        const a = actor(r.id, 'zombie');
        if (a.mode !== 'rear') { rider.rig.attach(a.fig.group); a.from.copy(a.fig.group.position); a.mode = 'rear'; a.at = time; figures.lod(a.fig, false); }
        poseRear(a, r, i);
      });
      for (const c of s.civs) {
        live.add(c.id);
        const a = actor(c.id, c.id % 2 ? 'civA' : 'civB');
        a.mode = 'civ';
        place(a.fig, c.x, c.z, 0.11);
        const dive = c.state === 'dive' ? Math.min(1, (s.t - c.at) / 0.35) : 0;
        a.fig.group.rotation.set(0, 0, -(Math.sign(c.x) || 1) * dive * 1.1);
        a.fig.group.position.x += (Math.sign(c.x) || 1) * dive * 0.5;
        figures.pose(a.fig, 'run', time);
      }
      for (const a of [...actors.values()]) {
        const g = a.fig.group;
        if (a.mode === 'fly') {
          a.vel.y -= 15 * dt;
          g.position.addScaledVector(a.vel, dt);
          g.rotation.x -= 7 * dt; g.rotation.z += a.spin * 5 * dt;
          figures.pose(a.fig, 'flail', time, 1);
          if (g.position.y <= 0.12 && a.vel.y < 0) {
            if (!a.bounced) { a.bounced = true; a.vel.y *= -0.35; a.vel.x *= 0.5; a.vel.z *= 0.5; }
            else { a.mode = 'lie'; g.position.y = 0.12; g.rotation.set(-Math.PI / 2, g.rotation.y, 0); figures.pose(a.fig, 'flail', a.at, 0); }
          }
        } else if (a.mode === 'down') {
          const k = Math.min(1, (time - a.at) / 0.28);
          g.rotation.x = -k * Math.PI / 2; g.position.y = 0.12 * k;
          figures.pose(a.fig, 'flail', time, 1 - k);
          if (k >= 1) a.mode = 'lie';
        }
        const loose = a.mode === 'fly' || a.mode === 'lie' || a.mode === 'down';
        if (loose ? g.position.z > camera.position.z + 55 || time - a.at > 14 : !live.has(a.id)) release(a);
      }
    }

    // --- events from the rules -------------------------------------------------------------------------------
    function sound(name, ...args) { if (audio && !quiet) audio[name](...args); }
    function handle(ev) {
      const s = sim.s;
      for (const e of ev) {
        switch (e.type) {
          case 'cap': if (!quiet) hud.caption(e.text, time); break;
          case 'sms': if (!quiet) { hud.toast(e.text, time); sound('buzz'); } break;
          case 'pass': sound('passBy', R.passByLevel(Math.max(0, e.gap)), e.side); break;
          case 'close': if (!quiet) hud.pop('close', e.side, time); break;
          case 'crash': shakeUntil = time + 0.5; kick.dip += 0.12; sound('crunch'); break;
          case 'ride-over': rideOverAt = time; sound('thump'); setTimeout(() => sound('thump'), 300); break;
          case 'wheelie-start': sound('lift'); break;
          case 'wheelie-land': kick.dip += 0.05; sound('thump'); break;
          case 'wheelie-refused': sound('blocked'); break;
          case 'dial-full': sound('ready'); break;
          case 'kerb': kick.bump += 0.09; kick.dip += 0.04; sound('thump'); break;
          case 'civ': shakeUntil = time + 0.2; kick.dip += 0.05; sound('blocked'); break;
          case 'lurch': kick.roll += e.dir * 0.07; sound('lift'); break;
          case 'near': sound('groan'); break;
          case 'ram': shakeUntil = time + 0.2; kick.bump += 0.08; sound('thump'); break;
          case 'thud': kick.bump += 0.16; kick.dip -= 0.05; sound('thump'); if (!quiet) hud.pop('thud', e.side * 0.6, time, 'THUD'); break;
          case 'grab-front': shakeUntil = time + 0.25; kick.dip += 0.1; sound('thump'); sound('groan'); break;
          case 'grab-rear': kick.dip -= 0.07; kick.bump -= 0.05; sound('thump'); setTimeout(() => sound('groan'), 200); break;
          case 'swing': swingAt = time; swingInfo = { front: e.front, dir: 1 }; sound('swing'); break;
          case 'klonk': {
            freeze = sim.cfg.hitStopMs / 1000; shakeUntil = time + 0.22; kick.yaw += e.dir * 0.04; kick.fov += 4;
            if (swingInfo) swingInfo.dir = e.dir;
            sound('klonk');
            if (!quiet) hud.pop('klonk', e.dir, time, 'KLONK!');
            const a = actors.get(e.id);
            if (a && e.where === 'front') launch(a, e.dir, -s.speed * 0.5, 4.2);
            if (!cracked && !quiet) { cracked = true; rider.setCracked(true); onEvent('cracked'); }
            break;
          }
          case 'shed-front': case 'shed-rear': {
            e.ids.forEach((id, i) => { const a = actors.get(id); if (a) launch(a, i % 2 ? 1 : -1, e.type === 'shed-rear' ? 3 : -s.speed * 0.4, e.type === 'shed-rear' ? 2.5 : 4); });
            break;
          }
          case 'eaten': if (!quiet) hud.bite(time, s.lives <= 0); sound('teeth'); shakeUntil = time + 0.5; break;
          case 'caught': caughtAt = time; if (!quiet && s.lives <= 0) hud.bite(time, true); break;
          case 'arrived': {
            [...e.frontIds, ...e.rearIds].forEach((id, i) => { const a = actors.get(id); if (a) launch(a, i % 2 ? 1 : -1, 1.5, 1.5); });
            startGate(e);
            break;
          }
          default: break;
        }
      }
    }

    // --- the gate: she waits in the light, says her line, and gets the helmet ----------------------------------
    function startGate(result) {
      const lines = result.hangers ? level.hanger : result.onTime ? level.onTime : level.late;
      const beats = [{ dur: 0.9, type: 'wait' }];
      for (const [who, text] of lines) beats.push({ dur: 1.9, type: 'say', who, text });
      beats.push({ dur: 1.1, type: 'come' }, { dur: 1.5, type: 'helmet' });
      for (const [who, text] of level.finale || []) beats.push({ dur: 2.0, type: 'say', who, text });
      beats.push({ dur: 1.6, type: 'say', who: 'wife', text: level.after[0] }, { dur: 1.4, type: 'say', who: 'baba', text: level.after[1] }, { dur: 0.3, type: 'end' });
      gate = { result, beats, i: 0, t: 0, at: time, started: -1, mood: 0, on: false, done: false, side: V(), spot: world.kidSpot.clone() };
    }
    function updateGate(dt, skip) {
      const g = gate;
      g.t += dt;
      if (skip && time - g.at > 0.8 && g.beats[g.i].type !== 'end') g.t = g.beats[g.i].dur;
      while (g.i < g.beats.length - 1 && g.t >= g.beats[g.i].dur) { g.t -= g.beats[g.i].dur; g.i++; }
      const b = g.beats[g.i], k = Math.min(1, g.t / b.dur);
      if (g.started !== g.i) {
        g.started = g.i;
        if (b.type === 'say') { hud.say(b.who, b.text, time); sound(b.who === 'her' ? 'kid' : b.who === 'wife' ? 'buzz' : 'blocked'); } else hud.say(null);
        if (b.type === 'end' && !g.done) { g.done = true; onEvent('gate-done', g.result); }
      }
      rider.rig.updateMatrixWorld(true);
      g.side.set(0.62, 0, 0.14); rider.rig.localToWorld(g.side);
      const kg = kid.group;
      const beyond = g.beats.findIndex((x) => x.type === 'come');
      const come = g.i > beyond ? 1 : g.i === beyond ? smooth(0, 1, k) : 0;
      kg.position.copy(g.spot).lerp(g.side, come);
      kg.position.y = Math.abs(Math.sin(come * Math.PI * 3)) * 0.07;
      kg.rotation.set(0, Math.atan2(camera.position.x - kg.position.x, camera.position.z - kg.position.z), 0);
      let free = null;
      if (b.type === 'helmet' && !g.on) {
        kid.bones.head.getWorldPosition(t3); t3.y += 0.16;
        rider.rig.worldToLocal(t3);
        const kk = smooth(0, 0.7, k);
        free = t2.set(0.5, 1.34, -0.02).lerp(t3, kk);
        if (k > 0.72) {
          g.on = true; g.mood = 1;
          kid.bones.head.add(rider.helmet);
          rider.helmet.position.set(0, 0.2, 0.025); rider.helmet.rotation.set(0.12, 0, 0); rider.helmet.scale.setScalar(1.62); rider.helmet.visible = true;
          sound('thump'); sound('chime');
        }
      }
      figures.pose(kid, 'kid', time, g.mood);
      return free;
    }

    // --- camera on the scooter ------------------------------------------------------------------------------
    function placeCamera(dt) {
      const s = sim.s, cfg = sim.cfg;
      const speed01 = s.speed / cfg.rideSpeed;
      const moving = opt.motion;
      for (const key of Object.keys(kick)) kick[key] *= Math.exp(-dt * (key === 'fov' ? 7 : 9));
      const ro = time - rideOverAt;
      const overLift = ro >= 0 && ro < RIDE_OVER_S ? Math.sin((Math.PI * ro) / RIDE_OVER_S) * RIDE_OVER_LIFT : 0;
      const shake = moving ? (time < shakeUntil ? 10 : 0) + cfg.roadBuzz * speed01 : 0;
      const bob = Math.sin(time * 4.1) * 0.006 + Math.sin(time * 13) * 0.004 * speed01;
      const heading = Math.atan(World.roadSlope(s.d + 14));
      const steerLook = Math.max(-0.06, Math.min(0.06, s.vx * 0.01));
      const lean = moving ? R.leanRoll(s.vx, cfg) : 0;
      rider.rig.position.set(World.roadCenter(s.d) + s.x, overLift + (s.onWalk ? 0.11 : 0) + kick.bump, -s.d);
      rider.rig.rotation.set(0, Math.PI - heading - steerLook, lean * 2 + kick.roll);
      rider.body.rotation.x = -opt.wheelieAngle * s.lift;
      rider.rig.updateMatrixWorld(true);
      rider.eye.getWorldPosition(camera.position);
      camera.position.x += (Math.random() - 0.5) * shake * 0.02;
      camera.position.y += bob + (Math.random() - 0.5) * shake * 0.02;
      camera.rotation.order = 'YXZ';
      camera.rotation.set(-(opt.pitch - opt.wheelieAngle * 0.8 * s.lift) - kick.dip, -heading - steerLook + kick.yaw, -lean - kick.roll * 0.5);
      let fov = opt.fov * (1 + cfg.fovKick * s.lift) + kick.fov;
      if (gate) {
        const w = smooth(0, 1.2, time - gate.at);
        kid.bones.head.getWorldPosition(t1);
        look.position.copy(camera.position); look.lookAt(t1);
        qRide.copy(camera.quaternion);
        camera.quaternion.copy(qRide).slerp(look.quaternion, w * 0.92);
        fov -= w * 8;
      }
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
      return speed01;
    }

    // fast: rules only, no picture (the screenshot tool uses it to reach a moment quickly)
    function frame(dt, input, fast) {
      if (!sim) return;
      time += dt;
      const s = sim.s;
      let free = null;
      if (freeze > 0) freeze -= dt;
      else {
        const inp = bot ? bot(sim) : input;
        handle(sim.update(dt, inp));
        const turning = s.wheelieUp && inp.steer !== 0;
        if (turning) legSide = Math.sign(inp.steer);
        legP = R.approach(legP, turning ? 1 : 0, 6 * dt);
      }
      if (s.phase === 'gate' && gate) free = updateGate(dt, input.hit || input.skip);
      if (s.phase === 'caught' && caughtAt > 0 && time - caughtAt > 1.2) { caughtAt = -1; onEvent('caught', { day: level.day }); }
      if (fast) return;
      if (!gate) figures.pose(kid, 'kid', time, 0);
      const speed01 = placeCamera(dt);
      world.update(s.d, time, camera);
      world.syncCars(s.cars, s.t, freeze > 0 ? 0 : dt);
      syncActors(dt);
      rider.update(time, time - swingAt < 0.42 && swingInfo ? { age: time - swingAt, front: swingInfo.front, dir: swingInfo.dir } : null, free);
      // the mirrors only need what is behind: hide everyone ahead while their picture is drawn
      for (const a of actors.values()) a.fig.group.visible = a.mode === 'rear' || (a.fig.group.parent === scene && a.fig.group.position.z > rider.rig.position.z - 2);
      rider.renderMirrors(renderer, scene);
      for (const a of actors.values()) a.fig.group.visible = true;
      renderer.render(scene, camera);

      const W = hudCanvas.width, H = hudCanvas.height;
      const f = { W, H, now: time, speed01, meter: s.meter, meterSize: sim.cfg.meterSize, canLift: s.meter >= sim.cfg.minLift, wheelieUp: s.wheelieUp, lives: s.lives, maxLives: sim.cfg.lives,
        clock: Sim.clockText(s.clock), late: s.clock > 300, progress: s.d / level.length, remaining: level.length - s.d, neck: quiet ? 0 : s.neck, rain: !!level.rain, night: !!level.blackout, leg: { side: legSide, p: legP }, dial: null, phone: null };
      if (!quiet) {
        rider.cowl.getWorldPosition(t1).project(camera);
        f.dial = { x: ((t1.x + 1) / 2) * W, y: ((1 - t1.y) / 2) * H, k: (H * 0.075) / root.AsaSprites.DIAL.r };
        rider.phone.getWorldPosition(t1).project(camera);
        if (t1.z < 1) f.phone = { x: ((t1.x + 1) / 2) * W, y: ((1 - t1.y) / 2) * H - 40, roll: camera.rotation.z * -1.5 };
      }
      hud.draw(f);
      if (audio) {
        const on = !quiet && s.phase === 'ride';
        audio.update(on ? speed01 : 0, on ? R.windLevel(s.speed) : 0, s.lift, on && legP > 0.5);
        if (on && s.neck > 0.02 && time > heartAt) { heartAt = time + 0.85 - 0.5 * Math.min(1, s.neck); audio.heart(Math.min(1, s.neck)); }
      }
    }

    function start(nextLevel, o = {}) {
      level = nextLevel;
      sim = Sim.create(level);
      quiet = !!o.quiet;
      bot = o.bot || null;
      for (const a of [...actors.values()]) release(a);
      gate = null; freeze = 0; shakeUntil = -1; rideOverAt = -99; swingAt = -99; caughtAt = -1; legP = 0;
      for (const key of Object.keys(kick)) kick[key] = 0;
      world.setLevel(level);
      figures.eyeMat.fog = !level.blackout; figures.eyeMat.needsUpdate = true;
      rider.rig.add(rider.helmet);
      rider.helmet.scale.setScalar(1); rider.helmet.visible = false;
      cracked = !!o.cracked; rider.setCracked(cracked);
      kid.group.position.copy(world.kidSpot);
      kid.group.rotation.set(0, 0, 0);
      figures.pose(kid, 'kid', 0, 0);
      hud.clear();
      if (audio) audio.rain(!!level.rain && !quiet);
      world.onThunder = () => sound('thunder');
    }

    return {
      start, frame, opt,
      setAudio(a) { audio = a; },
      get sim() { return sim; },
      get level() { return level; },
      get time() { return time; },
      actors,
    };
  }

  root.AsaGame = { createGame };
})(typeof self !== 'undefined' ? self : this);
