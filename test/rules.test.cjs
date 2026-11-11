// node --test test/rules.test.cjs   (RULES_PATH can point at a sabotaged copy to prove these tests can fail)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const R = require(process.env.RULES_PATH || path.join(__dirname, '..', 'src', 'rules.js'));
const cfg = R.DEFAULTS;

test('pass kinds: touching is a hit, a little air is close, more is wide', () => {
  assert.equal(R.passKind(R.sideGap(1.0, 0, cfg), cfg), 'hit');
  assert.equal(R.passKind(R.sideGap(1.6, 0, cfg), cfg), 'close');
  assert.equal(R.passKind(R.sideGap(2.7, 0, cfg), cfg), 'wide');
});

test('only close passes charge, unless any-pass is switched on', () => {
  assert.equal(R.chargeForPass('close', cfg), 1);
  assert.equal(R.chargeForPass('wide', cfg), 0);
  assert.equal(R.chargeForPass('hit', cfg), 0);
  assert.equal(R.chargeForPass('wide', { ...cfg, anyPassCounts: true }), 1);
});

test('the dial fills to its size and no further', () => {
  let m = 0;
  for (let i = 0; i < 5; i++) m = R.addCharge(m, 1, cfg);
  assert.equal(m, cfg.meterSize);
  assert.ok(R.isFull(m, cfg));
});

test('holding a wheelie drains the dial; a full dial lasts meterSize / drainPerSec seconds', () => {
  let m = cfg.meterSize;
  let t = 0;
  const dt = 1 / 60;
  while (m > 0 && t < 10) { m = R.drainMeter(m, dt, cfg); t += dt; }
  assert.ok(Math.abs(t - cfg.meterSize / cfg.drainPerSec) < 0.05, `lasted ${t.toFixed(2)} s`);
  assert.equal(R.drainMeter(0, 1, cfg), 0, 'never below empty');
});

test('a crash costs part of the dial, never below empty', () => {
  assert.equal(R.crashMeter(3, cfg), 3 - cfg.crashDrain);
  assert.equal(R.crashMeter(0.4, cfg), 0);
});

test('lift needs minLift, and is blocked by a grab, the sidewalk or being up already', () => {
  const base = { wheelieUp: false, grabbed: false, onSidewalk: false, meter: cfg.minLift };
  assert.deepEqual(R.canLift(base, cfg), { ok: true, reason: null });
  assert.equal(R.canLift({ ...base, meter: cfg.minLift - 0.01 }, cfg).reason, 'not-charged');
  assert.equal(R.canLift({ ...base, grabbed: true }, cfg).reason, 'grabbed');
  assert.equal(R.canLift({ ...base, onSidewalk: true }, cfg).reason, 'sidewalk');
  assert.equal(R.canLift({ ...base, wheelieUp: true }, cfg).reason, 'already-up');
});

test('the front comes down on release or when the dial runs dry', () => {
  assert.equal(R.dropReason(true, 1.2), null);
  assert.equal(R.dropReason(false, 1.2), 'released');
  assert.equal(R.dropReason(true, 0), 'empty');
});

test('keyboard steering builds up to top speed and settles back to straight', () => {
  let vx = 0;
  const dt = 1 / 60;
  vx = R.steerVelocity(vx, 1, dt, cfg, 1);
  assert.ok(vx > 0 && vx < cfg.steerSpeed, 'no instant snap');
  for (let i = 0; i < 120; i++) vx = R.steerVelocity(vx, 1, dt, cfg, 1);
  assert.equal(vx, cfg.steerSpeed);
  for (let i = 0; i < 120; i++) vx = R.steerVelocity(vx, 0, dt, cfg, 1);
  assert.equal(vx, 0);
});

test('leg-out steering during a wheelie is weaker', () => {
  let up = 0;
  let normal = 0;
  for (let i = 0; i < 120; i++) {
    up = R.steerVelocity(up, -1, 1 / 60, cfg, cfg.wheelieSteer);
    normal = R.steerVelocity(normal, -1, 1 / 60, cfg, 1);
  }
  assert.ok(Math.abs(up) < Math.abs(normal));
  assert.equal(up, -cfg.steerSpeed * cfg.wheelieSteer);
});

test('a crash costs one life, then grace stops a second one', () => {
  const rider = { lives: 3, crashAt: -99, graceUntil: -99 };
  const first = R.applyCrash(rider, 10, cfg);
  assert.equal(first.rider.lives, 2);
  assert.equal(rider.lives, 3, 'input record is not mutated');
  assert.equal(R.applyCrash(first.rider, 10 + cfg.grace / 2, cfg).counted, false);
  assert.equal(R.applyCrash(first.rider, 10 + cfg.grace + 0.01, cfg).rider.lives, 1);
  assert.equal(R.applyCrash({ lives: 0, crashAt: -99, graceUntil: -99 }, 5, cfg).rider.lives, 0);
});

test('after a crash speed drops and recovers fully by crashRecover', () => {
  assert.equal(R.crashSpeedFactor(0, cfg), cfg.crashSlow);
  assert.equal(R.crashSpeedFactor(cfg.crashRecover, cfg), 1);
});

test('wheelie boosts speed and a grab slows it', () => {
  const s = { crashAt: -99, wheelieUp: true, grabbed: false };
  assert.equal(R.speedFactor(s, 0, cfg), 1 + cfg.wheelieBoost);
  assert.equal(R.speedFactor({ ...s, wheelieUp: false, grabbed: true }, 0, cfg), cfg.grabSlow);
});

test('the horizon lean follows sideways speed but never passes the cap', () => {
  assert.equal(R.leanRoll(0, cfg), 0);
  assert.ok(R.leanRoll(2, cfg) > 0 && R.leanRoll(-2, cfg) < 0);
  assert.equal(R.leanRoll(999, cfg), cfg.leanCap);
  assert.equal(R.leanRoll(5, { ...cfg, leanCap: 0 }), 0, 'cap 0 keeps the horizon level');
});

test('wind rises on a log curve: fast at first, flatter at the top', () => {
  assert.equal(R.windLevel(0), 0);
  const low = R.windLevel(5) - R.windLevel(0);
  const high = R.windLevel(20) - R.windLevel(15);
  assert.ok(low > high, 'the first 5 m/s add more wind than the last 5');
  assert.ok(R.windLevel(20) <= 1 && R.windLevel(40) === 1);
});

test('closer pass-bys are louder', () => {
  assert.ok(R.passByLevel(0.1) > R.passByLevel(1.5));
  assert.equal(R.passByLevel(5), 0);
});

test('a wall only comes with a full dial and leaves no gap', () => {
  const wallIndex = R.PATTERN.indexOf('wall');
  assert.equal(R.nextRow(wallIndex, 0, cfg, 0).kind, 'pair');
  const wall = R.nextRow(wallIndex, cfg.meterSize, cfg, 0);
  assert.equal(wall.kind, 'wall');
  for (let x = -cfg.roadHalf; x <= cfg.roadHalf; x += 0.05) {
    assert.ok(wall.xs.some((cx) => R.passKind(R.sideGap(cx, x, cfg), cfg) === 'hit'), `gap at x=${x.toFixed(2)}`);
  }
});

test('a full dial outlasts the time it takes to ride over a wall at cruise', () => {
  // the wheelie must still be up when the wall arrives if it is lifted 1 s early
  assert.ok(cfg.meterSize / cfg.drainPerSec > 1.5);
});

test('the neck timer counts down and stops at zero', () => {
  assert.equal(R.neckLeft({ at: 0 }, 4, cfg), cfg.neckTimer - 4);
  assert.equal(R.neckLeft({ at: 0 }, 99, cfg), 0);
});
