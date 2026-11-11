// After School · controls lab v2 (PC) · pure rules (no DOM, no WebGL).
// Shared by the browser build and the node tests in ../test/rules.test.cjs.
// Proven patterns from 03-Council-Research/ride-feel-and-controls-research__v1__2026-10-15.md:
// Burnout-style dial (close passes fill it, the wheelie drains it, crashes cost part of it),
// hold-to-wheelie (wheelie games), one button hits the nearest grabber (Road Rash).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AsaRules = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Starting values to tune in the lab, not measured facts.
  const DEFAULTS = Object.freeze({
    rideSpeed: 10,         // m/s cruise (36 km/h)
    steerSpeed: 5.5,       // top sideways speed, m/s
    steerAccel: 18,        // m/s² while a steer key is held
    steerDecel: 24,        // m/s² back to straight when released
    roadHalf: 4.0,         // drivable half-width of the road, m
    carSpeed: 8,           // oncoming car speed, m/s
    carGap: 2.0,           // s between rows of cars
    carHalfWidth: 0.95,    // m
    riderHalfWidth: 0.4,   // m
    closePass: 0.6,        // m of air that still counts as close
    anyPassCounts: false,
    meterSize: 3,          // dial units
    minLift: 1,            // units needed to lift the front
    drainPerSec: 1.25,     // units per second while up (full dial = 2.4 s)
    crashDrain: 1,         // units lost in a crash
    wheelieBoost: 0.3,     // +30 % speed while up
    wheelieSteer: 0.4,     // steering strength while up (leg out)
    lives: 3,
    crashSlow: 0.4,
    crashRecover: 2,
    grace: 1.5,
    neckTimer: 10,
    grabSlow: 0.75,
    leanGain: 0.012,       // horizon roll in radians per m/s of sideways speed
    leanCap: 0.07,         // max roll, radians (about 4°); 0 keeps the horizon level
    fovKick: 0.14,         // view widens by 14 % at full lift
    roadBuzz: 1,           // speed-scaled camera buzz, 0 = off
    hitStopMs: 80,         // freeze on a helmet hit
  });

  function sideGap(carX, riderX, cfg) {
    return Math.abs(carX - riderX) - (cfg.carHalfWidth + cfg.riderHalfWidth);
  }

  function passKind(gap, cfg) {
    if (gap < 0) return 'hit';
    if (gap <= cfg.closePass) return 'close';
    return 'wide';
  }

  function chargeForPass(kind, cfg) {
    if (kind === 'close') return 1;
    if (kind === 'wide' && cfg.anyPassCounts) return 1;
    return 0;
  }

  function clampMeter(m, cfg) { return Math.max(0, Math.min(cfg.meterSize, m)); }
  function addCharge(meter, amount, cfg) { return clampMeter(meter + amount, cfg); }
  function drainMeter(meter, dt, cfg) { return clampMeter(meter - cfg.drainPerSec * dt, cfg); }
  function crashMeter(meter, cfg) { return clampMeter(meter - cfg.crashDrain, cfg); }
  function isFull(meter, cfg) { return meter >= cfg.meterSize; }

  // Returns { ok, reason }. A held front explains itself before an empty dial.
  function canLift(s, cfg) {
    if (s.wheelieUp) return { ok: false, reason: 'already-up' };
    if (s.grabbed) return { ok: false, reason: 'grabbed' };
    if (s.onSidewalk) return { ok: false, reason: 'sidewalk' };
    if (s.meter < cfg.minLift) return { ok: false, reason: 'not-charged' };
    return { ok: true, reason: null };
  }

  // While up: the front comes down when the key is released or the dial runs dry.
  function dropReason(held, meter) {
    if (!held) return 'released';
    if (meter <= 0) return 'empty';
    return null;
  }

  function approach(x, target, maxStep) {
    if (Math.abs(target - x) <= maxStep) return target;
    return x + Math.sign(target - x) * maxStep;
  }

  // Keyboard steering builds up and settles instead of snapping. input: -1, 0 or 1.
  function steerVelocity(vx, input, dt, cfg, strength) {
    if (input === 0) return approach(vx, 0, cfg.steerDecel * dt);
    return approach(vx, input * cfg.steerSpeed * strength, cfg.steerAccel * dt);
  }

  function clampX(x, cfg) { return Math.max(-cfg.roadHalf, Math.min(cfg.roadHalf, x)); }

  function crashSpeedFactor(sinceCrash, cfg) {
    if (!(sinceCrash >= 0) || sinceCrash >= cfg.crashRecover) return 1;
    return cfg.crashSlow + (1 - cfg.crashSlow) * (sinceCrash / cfg.crashRecover);
  }

  // Returns a new rider record; never mutates the input.
  function applyCrash(rider, now, cfg) {
    if (now < rider.graceUntil) return { rider, counted: false };
    return {
      rider: { ...rider, lives: Math.max(0, rider.lives - 1), crashAt: now, graceUntil: now + cfg.grace },
      counted: true,
    };
  }

  function speedFactor(s, now, cfg) {
    const crash = crashSpeedFactor(now - s.crashAt, cfg);
    const boost = s.wheelieUp ? 1 + cfg.wheelieBoost : 1;
    const grab = s.grabbed ? cfg.grabSlow : 1;
    return crash * boost * grab;
  }

  // Riders keep the horizon near level: lean follows sideways speed, capped (MotoGP-style tilt cap).
  function leanRoll(vx, cfg) {
    return Math.max(-cfg.leanCap, Math.min(cfg.leanCap, vx * cfg.leanGain));
  }

  // Wind loudness 0..1 on a log curve of speed (helmet wind rises with log of speed).
  function windLevel(speed) {
    if (!(speed > 0)) return 0;
    return Math.min(1, Math.log1p(speed / 4) / Math.log1p(20 / 4));
  }

  // Pass-by loudness 0..1: the closer the car, the louder its whoosh.
  function passByLevel(gap) {
    return Math.max(0, Math.min(1, 1 - gap / 2.5));
  }

  const ROWS = Object.freeze({
    single: (pick) => [[-2.7, 0, 2.7][pick % 3]],
    pair: (pick) => [[-2.7, 0], [0, 2.7], [-2.7, 2.7]][pick % 3],
    wall: () => [-3, -1, 1, 3],
  });
  const PATTERN = Object.freeze(['single', 'single', 'single', 'pair', 'single', 'wall']);

  // A wall spans the road; it only comes when the dial is full, so a wheelie can clear it.
  function nextRow(index, meter, cfg, pick) {
    let kind = PATTERN[index % PATTERN.length];
    if (kind === 'wall' && !isFull(meter, cfg)) kind = 'pair';
    return { kind, xs: ROWS[kind](pick) };
  }

  function neckLeft(grab, now, cfg) {
    return Math.max(0, cfg.neckTimer - (now - grab.at));
  }

  return Object.freeze({
    DEFAULTS, PATTERN, sideGap, passKind, chargeForPass, addCharge, drainMeter, crashMeter, isFull,
    canLift, dropReason, approach, steerVelocity, clampX, crashSpeedFactor, applyCrash, speedFactor,
    leanRoll, windLevel, passByLevel, nextRow, neckLeft,
  });
});
