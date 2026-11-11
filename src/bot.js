// After School · V0 · a bot that plays a day. Used by the node tests (is every day fair and finishable?)
// and by the title screen, where it rides behind the menu. Pure logic: reads the sim, returns an input.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.AsaBot = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // react: seconds before the first helmet hit · look: seconds it looks ahead · greedy: appetite for close passes
  // drive: hits walkers on the way past · noise: chance per second of a careless swerve
  const SKILL = Object.freeze({
    novice: { react: 1.1, look: 1.3, greedy: 0, drive: false, noise: 0.22 },
    average: { react: 0.6, look: 2.0, greedy: 0.6, drive: false, noise: 0.07 },
    expert: { react: 0.25, look: 2.4, greedy: 1, drive: true, noise: 0 },
  });

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function create(skillName, seed) {
    const k = SKILL[skillName] || SKILL.average;
    const rand = rng(seed || 1);
    const b = { holdUntil: -1, grabbed: false, nextHit: 0, swerveUntil: -1, swerve: 0, nextRoll: 1 };

    return function decide(sim) {
      const s = sim.s;
      const cfg = sim.cfg;
      const out = { steer: 0, wheelie: false, hit: false };
      if (s.phase !== 'ride') return out;
      const v = Math.max(3, s.speed);
      const bus = s.buses.find((q) => !q.passed && q.z - s.d < 75) || null;
      const zone = s.buses.find((q) => s.d >= q.z - cfg.zoneBefore && s.d <= q.z + cfg.zoneAfter) || null;
      const cands = [];
      for (let x = -3.6; x <= 3.61; x += 0.6) cands.push(x);
      if (zone) for (const x of [4.9, 5.5, 6.1]) cands.push(zone.side * x);

      let best = null;
      for (const c of cands) {
        let cost = Math.abs(c - s.x) * 0.25 + Math.abs(c) * 0.04;
        let worst = null;
        const at = (tm) => s.x + clamp(c - s.x, -cfg.steerSpeed * 0.8 * tm, cfg.steerSpeed * 0.8 * tm);
        for (const car of s.cars) {
          if (car.passed) continue;
          const tm = (car.z - s.d) / (v + car.v);
          if (tm > k.look || tm < 0) continue;
          const gap = Math.abs(car.x - at(tm)) - 1.35;
          if (gap < 0.12) { cost += 1000 / (tm + 0.25); if (!worst || tm < worst.tm) worst = { tm }; }
          else if (gap < 0.55 && car.kind === 'car') cost -= 2.5 * k.greedy;
        }
        for (const w of s.walkers) {
          if (w.state !== 'walk' || w.done || w.ambient) continue;
          const tm = (w.z - s.d) / v;
          if (tm > k.look || tm < 0) continue;
          if (Math.abs(w.x - at(tm)) - 0.7 < 0.75) { cost += 400 / (tm + 0.25); if (!worst || tm < worst.tm) worst = { tm }; }
        }
        if (bus && bus.side * c < 4.7) { const tm = (bus.z - 1.8 - s.d) / v; if (tm < 4.5) cost += 3000 / (tm + 0.3); }
        for (const p of s.civs) {
          if (p.ambient || p.done || p.state !== 'run') continue;
          const tm = (p.z - s.d) / (v + p.v);
          if (tm > 1.6 || tm < 0) continue;
          if (Math.abs(p.x - at(tm)) < 0.95) cost += 150 / (tm + 0.25);
        }
        if (!best || cost < best.cost) best = { c, cost, worst };
      }

      // a careless swerve now and then (novices mostly)
      if (s.t >= b.nextRoll) { b.nextRoll = s.t + 1; if (rand() < k.noise) { b.swerveUntil = s.t + 0.45; b.swerve = rand() < 0.5 ? -1 : 1; } }
      const dx = best.c - s.x;
      if (s.t < b.swerveUntil) out.steer = b.swerve;
      else if (Math.abs(dx) > 0.12) out.steer = Math.sign(dx) * Math.min(1, Math.abs(dx) / 0.5);

      // wheelie: to shake the back clean, or when nothing else gets through
      const canLift = s.meter >= cfg.minLift && !s.front.length && !s.onWalk && !s.arriving;
      if (s.t < b.holdUntil) out.wheelie = true;
      else if (canLift) {
        if (s.rear.length) { b.holdUntil = s.t + 0.5; out.wheelie = true; }
        else if (best.worst && best.worst.tm < 0.75 && best.cost >= 300) { b.holdUntil = s.t + best.worst.tm + 0.45; out.wheelie = true; }
      }

      // helmet
      if (s.front.length) {
        if (!b.grabbed) { b.grabbed = true; b.nextHit = s.t + k.react; }
        if (s.t >= b.nextHit) { out.hit = true; b.nextHit = s.t + 0.5; }
      } else {
        b.grabbed = false;
        if (k.drive && !out.wheelie && (!s.swing || s.t - s.swing.at >= cfg.swingCool)) {
          const near = s.walkers.some((w) => w.state === 'walk' && !w.done && !w.ambient && w.z - s.d > 0.2 && w.z - s.d < 1.9 && Math.abs(w.x - s.x) <= 1.6);
          if (near) out.hit = true;
        }
      }
      return out;
    };
  }

  // Plays one whole day at a fixed step; returns the result and what happened.
  function play(Sim, level, skillName, seed, maxSeconds) {
    const sim = Sim.create(level);
    const decide = create(skillName, seed);
    const dt = 1 / 60;
    const limit = maxSeconds || 400;
    while (sim.s.phase === 'ride' && sim.s.t < limit) sim.update(dt, decide(sim));
    return { phase: sim.s.phase, time: sim.s.t, clock: sim.s.clock, lives: sim.s.lives, result: sim.s.result, stats: sim.s.stats, d: sim.s.d };
  }

  return Object.freeze({ SKILL, create, play, rng });
});
