// node --test test/        (rules.test.cjs holds the 18 lab rule tests; this file plays the ten days)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const Sim = require(path.join(__dirname, '..', 'src', 'sim.js'));
const { DAYS } = require(path.join(__dirname, '..', 'src', 'levels.js'));
const Bot = require(path.join(__dirname, '..', 'src', 'bot.js'));

const RUNS = 12;
const DT = 1 / 60;
const NONE = { steer: 0, wheelie: false, hit: false };
const lab = (script, extra) => ({ day: 99, name: 'lab', length: 500, par: 60, cfg: {}, buses: [], ...extra, script: script.slice().sort((a, b) => a.trig - b.trig) });
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

function run(sim, seconds, input, seen) {
  for (let t = 0; t < seconds && sim.s.phase === 'ride'; t += DT) {
    const ev = sim.update(DT, typeof input === 'function' ? input(sim) : input || NONE);
    if (seen) for (const e of ev) seen.push(e.type);
  }
}

test('there are ten days, in order, and each script fits its street', () => {
  assert.equal(DAYS.length, 10);
  DAYS.forEach((d, i) => {
    assert.equal(d.day, i + 1);
    assert.ok(d.wife.length && d.reply && d.late.length && d.onTime.length, `day ${d.day} has its lines`);
    for (let k = 1; k < d.script.length; k++) assert.ok(d.script[k].trig >= d.script[k - 1].trig, 'sorted');
    for (const e of d.script) {
      if (e.type === 'walker' && !e.ambient) assert.ok(e.z < d.length - 32, `day ${d.day}: walker at ${e.z} is inside the braking zone`);
      if (e.type === 'bus') assert.equal(e.z % 20, 0, 'a bus sits on a street-block edge');
      if (e.type === 'car') assert.ok(e.trig + 70 < d.length - 32, `day ${d.day}: car at ${e.trig} meets the rider too late`);
    }
  });
});

test('an empty street is on time: the clock leaves room', () => {
  for (const d of DAYS) {
    const sim = Sim.create({ ...d, script: [], buses: [] });
    run(sim, 300);
    assert.equal(sim.s.phase, 'gate');
    assert.ok(sim.s.result.onTime, `day ${d.day}: empty ride arrives ${Sim.clockText(sim.s.clock, true)}`);
    assert.ok(sim.s.clock > 262, `day ${d.day}: empty ride arrives too early (${Sim.clockText(sim.s.clock, true)})`);
  }
});

test('the same bot and seed always ride the same ride', () => {
  const a = Bot.play(Sim, DAYS[4], 'average', 42);
  const b = Bot.play(Sim, DAYS[4], 'average', 42);
  assert.deepEqual(a, b);
});

test('a zombie in your path grabs the front, climbs, and eats you unless you hit him', () => {
  const level = lab([{ trig: 0, type: 'walker', z: 60, x: 0, still: true }]);
  const quiet = Sim.create(level);
  const seen = [];
  run(quiet, 7, NONE, seen);
  assert.ok(seen.includes('grab-front'));
  assert.equal(quiet.s.front.length, 1);
  assert.equal(quiet.s.lives, 3, 'not eaten yet');
  run(quiet, 12, NONE, seen);
  assert.ok(seen.includes('eaten'));
  assert.equal(quiet.s.lives, 2);
  assert.equal(quiet.s.front.length, 0, 'the crash throws him off');

  const fighter = Sim.create(level);
  const seen2 = [];
  run(fighter, 7, NONE, seen2);
  const before = fighter.s.meter;
  fighter.update(DT, { ...NONE, hit: true });
  run(fighter, 0.5, NONE, seen2);
  assert.ok(seen2.includes('klonk'));
  assert.equal(fighter.s.front.length, 0);
  assert.equal(fighter.s.meter, before + 1, 'a hit charges the dial');
  assert.equal(fighter.s.lives, 3);
});

test('the first zombie of day 2 cannot eat you', () => {
  const sim = Sim.create(lab([{ trig: 0, type: 'walker', z: 60, x: 0, still: true, gentle: true }], { length: 900, par: 90 }));
  run(sim, 40);
  assert.equal(sim.s.lives, 3);
  assert.equal(sim.s.front.length, 1, 'he just hangs there until you hit him');
});

test('you cannot wheelie while the front is held; a wheelie throws the back clean', () => {
  const held = Sim.create(lab([{ trig: 0, type: 'walker', z: 60, x: 0, still: true }], { cfg: { neckTimer: 99 } }));
  run(held, 7);
  held.s.meter = 3;
  const seen = [];
  run(held, 0.3, { ...NONE, wheelie: true }, seen);
  assert.equal(held.s.wheelieUp, false);
  assert.ok(seen.includes('wheelie-refused'));

  const back = Sim.create(lab([{ trig: 0, type: 'walker', z: 60, x: 1.1, still: true }]));
  const seen2 = [];
  run(back, 7, NONE, seen2);
  assert.ok(seen2.includes('grab-rear'), 'a brush past him and he has the back rail');
  assert.equal(back.s.rear.length, 1);
  const slow = back.s.speed;
  assert.ok(slow < back.cfg.rideSpeed * 0.9, 'he weighs the scooter down');
  back.s.meter = 2;
  run(back, 0.6, { ...NONE, wheelie: true }, seen2);
  assert.ok(seen2.includes('shed-rear'));
  assert.equal(back.s.rear.length, 0);
});

test('a wheelie rides over zombies and you feel each one', () => {
  const sim = Sim.create(lab([{ trig: 0, type: 'walker', z: 70, x: 0, still: true }, { trig: 0, type: 'walker', z: 74, x: 0.3, still: true }]));
  run(sim, 5.0);
  sim.s.meter = 3;
  const seen = [];
  run(sim, 2.2, { ...NONE, wheelie: true }, seen);
  assert.equal(seen.filter((e) => e === 'thud').length, 2);
  assert.equal(sim.s.front.length, 0);
  assert.equal(sim.s.lives, 3);
});

test('a helmet swing on the way past knocks a walker flying before he can grab', () => {
  const sim = Sim.create(lab([{ trig: 0, type: 'walker', z: 60, x: 0.9, still: true }]));
  const seen = [];
  run(sim, 30, (m) => ({ ...NONE, hit: m.s.walkers.some((w) => w.state === 'walk' && w.z - m.s.d < 1.6 && w.z - m.s.d > 0) }), seen);
  assert.ok(seen.includes('klonk'));
  assert.ok(!seen.includes('grab-rear') && !seen.includes('grab-front'));
});

test('the bus: the road costs a life, the sidewalk does not, and people never do', () => {
  const script = [{ trig: 0, type: 'bus', z: 200, side: 1 }, { trig: 0, type: 'civ', z: 215, x: 5.4, v: 0.01 }];
  const road = Sim.create(lab(script, { buses: [{ z: 200, side: 1 }] }));
  run(road, 25);
  assert.equal(road.s.lives, 2, 'riding into the bus is a crash');
  const walk = Sim.create(lab(script, { buses: [{ z: 200, side: 1 }] }));
  const seen = [];
  run(walk, 40, (m) => { const c = m.s.civs[0]; const tx = c ? c.x : 5.4; return { ...NONE, steer: m.s.d > 150 && Math.abs(tx - m.s.x) > 0.1 ? Math.sign(tx - m.s.x) : 0 }; }, seen);
  assert.equal(walk.s.lives, 3);
  assert.ok(seen.includes('kerb'));
  assert.ok(seen.includes('civ'), 'he bumped the person standing there');
  assert.equal(walk.s.stats.people, 1);
  assert.ok(Math.abs(walk.s.x) <= walk.cfg.roadHalf + 0.01 || walk.s.phase === 'gate', 'back on the road after the bus');
});

test('a wave stays a wall only if the dial can lift', () => {
  const wave = [];
  for (let k = -3; k <= 3; k++) wave.push({ trig: 0, type: 'walker', z: 150, x: k * 1.2, still: true, wave: true });
  wave.push({ trig: 102, type: 'thin', z: 150 });
  const empty = Sim.create(lab(wave));
  const seen = [];
  run(empty, 20, NONE, seen);
  assert.ok(seen.includes('thin'));
  assert.equal(empty.s.front.length + empty.s.rear.length, 0, 'the gap is wide enough to ride through');
  const charged = Sim.create(lab(wave));
  charged.s.meter = 2;
  const seen2 = [];
  run(charged, 20, NONE, seen2);
  assert.ok(!seen2.includes('thin'));
  assert.ok(charged.s.front.length + charged.s.rear.length > 0, 'without the wheelie they get you');
});

test('every day can be finished, nobody gets stuck, and on time is reachable', () => {
  const lines = ['day  name        par   skill     finished  on-time  median clock  lives lost  hits  wheelies'];
  for (const d of DAYS) {
    for (const skill of ['novice', 'average', 'expert']) {
      const runs = [];
      for (let i = 1; i <= RUNS; i++) runs.push(Bot.play(Sim, d, skill, i * 7919 + d.day));
      const done = runs.filter((r) => r.phase === 'gate');
      const onTime = done.filter((r) => r.result.onTime).length;
      for (const r of runs) assert.notEqual(r.phase, 'ride', `day ${d.day} ${skill}: a run never ended (stuck at ${r.d.toFixed(0)} m)`);
      const lost = runs.reduce((a, r) => a + (3 - r.lives), 0) / runs.length;
      const hits = runs.reduce((a, r) => a + r.stats.hits, 0) / runs.length;
      const wheelies = runs.reduce((a, r) => a + r.stats.wheelies, 0) / runs.length;
      lines.push(`${String(d.day).padStart(3)}  ${d.name.padEnd(10)}  ${String(d.par).padStart(3)}   ${skill.padEnd(8)}  ${String(done.length).padStart(2)}/${RUNS}     ${String(onTime).padStart(2)}/${RUNS}    ${done.length ? Sim.clockText(median(done.map((r) => r.clock)), true) : '   -   '}       ${lost.toFixed(1).padStart(4)}       ${hits.toFixed(1).padStart(4)}  ${wheelies.toFixed(1).padStart(4)}`);
      if (skill === 'expert') {
        assert.ok(done.length >= RUNS - 1, `day ${d.day}: the expert bot finished only ${done.length}/${RUNS}`);
        assert.ok(onTime >= 1, `day ${d.day}: the expert bot was never on time`);
      }
      if (skill === 'average') assert.ok(done.length >= RUNS / 2, `day ${d.day}: the average bot finished only ${done.length}/${RUNS}`);
    }
  }
  console.log('\n' + lines.join('\n') + '\n');
});
