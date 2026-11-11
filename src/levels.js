// After School · V0 · the ten school days. Each day ends at the gate and adds one new thing.
// Pure data (no DOM): the browser and the node tests read the same file.
// Lines marked "decided" are the creator's own story lines; every other line is a draft to rewrite freely.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.AsaLevels = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LANE = { L: -2.7, C: 0, R: 2.7 };
  const CRUISE = 10.5;

  // Script entries carry "trig": the rider's distance at which they appear.
  function tools(e) {
    const t = {
      car(at, x, v) { e.push({ trig: at, type: 'car', x, v }); },
      // pattern: tokens of L, C, R (a token with two letters is two cars side by side)
      traffic(from, step, pattern) { pattern.split(' ').forEach((tok, i) => { for (const ch of tok) t.car(from + i * step, LANE[ch]); }); },
      wall(at) { e.push({ trig: at, type: 'wall' }); },
      jam(z, x) { e.push({ trig: z - 170, type: 'jam', z, x }); },
      jamRows(from, step, pattern) { pattern.split(' ').forEach((tok, i) => { for (const ch of tok) t.jam(from + i * step, LANE[ch]); }); },
      bus(z, side) { e.push({ trig: z - 200, type: 'bus', z, side }); },
      zom(z, x, o) { e.push({ trig: z - 150, type: 'walker', z, x, ...(o || {}) }); },
      pair(z, x) { t.zom(z, x); t.zom(z + 2.6, x + 0.5); },
      trio(z, x) { t.zom(z, x); t.zom(z + 2.6, x + 0.5); t.zom(z + 5.2, x - 0.4); },
      lurker(z, side) { t.zom(z, side * 4.9, { ambient: true, still: true }); },
      civ(z, x, o) { e.push({ trig: z - 140, type: 'civ', z, x, ...(o || {}) }); },
      people(side, zs, xs) { zs.forEach((z, i) => t.civ(z, side * xs[i % xs.length])); },
      fleeing(from, to, step) { let i = 0; for (let z = from; z < to; z += step) t.civ(z + 140, (i++ % 2 ? 1 : -1) * 4.7, { ambient: true, v: 3.2 + (i % 3) * 0.5 }); },
      cap(at, text) { e.push({ trig: at, type: 'cap', text }); },
      wave(z, rows) {
        for (let r = 0; r < rows; r++) for (let k = -3; k <= 3; k++) t.zom(z + r * 2.4, k * 1.2 + (r % 2 ? 0.6 : 0), { still: true, wave: true });
        e.push({ trig: z - 48, type: 'thin', z });
      },
    };
    return t;
  }

  const HANGER = [['her', "Baba. There's a man on your scooter."], ['baba', 'He was just leaving.']];
  const AFTER = ['did u get her??', 'got her.']; // decided

  function day(def, build) {
    const e = [];
    build(tools(e));
    e.sort((a, b) => a.trig - b.trig);
    const buses = e.filter((x) => x.type === 'bus').map((b) => ({ z: b.z, side: b.side }));
    // par: the real seconds that count as five minutes on the clock. A clean ride lands a few seconds before 2:30.
    const par = Math.round((def.length / CRUISE + 3.6 + buses.length * 3.0 + (def.extra || 0)) * 10) / 10;
    return Object.freeze({ hanger: HANGER, after: AFTER, cfg: {}, sky: { dark: 0.4 }, ...def, par, buses, script: Object.freeze(e) });
  }

  const DAYS = [
    day({
      day: 1, name: 'Monday', tag: 'Five minutes. Easy.', length: 640,
      sky: { turn: [95, 250, 0.85] }, // the sky turns between these distances
      wife: ['school finishes in 5 mins today 🙂'], reply: 'heading there now', // decided
      late: [['her', "Baba. You're late."]], // decided
      onTime: [['her', "Baba. You're late."], ['baba', "It's 2:30."], ['her', 'Exactly.']], // decided
    }, (t) => {
      t.cap(12, 'Five minutes. Easy.');
      t.cap(112, 'Pass close. Fill the dial.');
      t.cap(190, "She's waiting.");
      t.traffic(110, 26, 'C L R C LC R L CR C L R');
      t.wall(420);
      t.traffic(470, 26, 'R L');
      t.fleeing(120, 470, 44);
      t.lurker(590, 1);
    }),
    day({
      day: 2, name: 'Tuesday', tag: 'The helmet', length: 700, sky: { dark: 0.45 },
      wife: ['weird people outside. blue ones.', "don't stop for them 🙂"], reply: 'ok',
      late: [['her', 'Baba. Your helmet is broken.'], ['baba', 'I know.']],
      onTime: [['her', 'Baba. Your helmet is broken.'], ['baba', "But I'm on time."], ['her', 'Barely.']],
    }, (t) => {
      t.traffic(40, 30, 'C R L C R');
      t.cap(236, 'Something is standing in the road.');
      t.zom(300, 3.9, { lunge: 24, sure: true, gentle: true });
      t.zom(385, -1.5); t.zom(445, 1.8); t.car(400, -2.7); t.zom(525, 0.5); t.zom(580, -2.2); t.car(520, 2.7); t.zom(632, 1.0);
      t.fleeing(40, 500, 60);
      t.lurker(660, -1);
    }),
    day({
      day: 3, name: 'Wednesday', tag: 'Mirrors', length: 760, sky: { dark: 0.5 },
      wife: ['check your mirrors today 🙂'], reply: 'why',
      late: [['her', 'Baba. Who was that man on the back?'], ['baba', 'Nobody.']],
      onTime: [['her', 'Baba. Who was that man on the back?'], ['baba', 'Nobody. Look, 2:30.'], ['her', 'Hm.']],
    }, (t) => {
      t.traffic(30, 24, 'L C R C L R CL R C');
      t.zom(330, 4.0, { lunge: 18, rear: true });
      t.traffic(300, 26, 'C L R');
      t.zom(450, -4.0, { lunge: 16, rear: true }); t.zom(505, 1.5); t.zom(548, -0.5);
      t.traffic(500, 28, 'L R');
      t.zom(612, 4.0, { lunge: 16 }); t.zom(662, -1.2); t.zom(702, 0.8);
      t.fleeing(60, 560, 70);
    }),
    day({
      day: 4, name: 'Thursday', tag: 'The bus', length: 820, sky: { dark: 0.2 },
      wife: ['the bus is stuck on our street again', 'use the sidewalk. gently 🙂'], reply: 'gently',
      late: [['her', 'Baba. You drove on the sidewalk.'], ['baba', 'Slowly.']],
      onTime: [['her', 'Baba. You drove on the sidewalk.'], ['baba', 'Slowly. And on time.'], ['her', 'The teacher saw.']],
    }, (t) => {
      t.traffic(40, 26, 'C L R C L');
      t.cap(205, 'The bus. Take the sidewalk.');
      t.bus(300, 1); t.jam(286, -2.6); t.jam(288, 0.2);
      t.people(1, [338, 350, 362, 374], [5.0, 5.9, 5.3, 6.0]);
      t.zom(410, 1); t.zom(455, -2); t.traffic(400, 28, 'L C R'); t.zom(525, 0); t.zom(565, 2.2);
      t.cap(575, 'Again.');
      t.bus(660, -1); t.jam(646, 2.6); t.jam(648, -0.2);
      t.people(-1, [698, 710, 722, 734], [5.1, 6.0, 5.4, 5.8]);
      t.zom(745, 1.5); t.zom(775, -1);
      t.fleeing(30, 200, 50);
    }),
    day({
      day: 5, name: 'Friday', tag: 'The pile', length: 860, sky: { dark: 0.8, storm: true }, cfg: { maxPile: 2, neckTimer: 9 },
      wife: ["they're climbing on each other now", "it's friday 🙂"], reply: 'almost weekend',
      late: [['her', "Baba. It's the weekend."], ['baba', 'Finally.']],
      onTime: [['her', "Baba. It's the weekend."], ['baba', 'Finally. And on time.'], ['her', 'For once.']],
    }, (t) => {
      t.traffic(30, 24, 'C L R LC R');
      t.pair(240, 0.5); t.car(250, -2.7); t.zom(292, 4.0, { lunge: 16 }); t.pair(335, -1.5); t.car(340, 2.7);
      t.pair(430, 2); t.car(440, 0); t.zom(478, -4.0, { lunge: 16 }); t.pair(522, -0.5);
      t.traffic(540, 26, 'L R C');
      t.zom(668, 4.0, { lunge: 16, rear: true }); t.pair(700, -2); t.pair(772, 0.3);
      t.fleeing(40, 300, 80);
    }),
    day({
      day: 6, name: 'Monday', tag: 'Rain', length: 880, sky: { dark: 0.6 }, rain: true, cfg: { steerAccel: 9, steerDecel: 6, maxPile: 2, neckTimer: 9 },
      wife: ['rain today. take an umbrella 🙂'], reply: "i'm on a scooter",
      late: [['her', "Baba. You're wet."], ['baba', "You're dry."]],
      onTime: [['her', "Baba. You're wet."], ['baba', 'And on time.'], ['her', 'Wet and on time.']],
    }, (t) => {
      t.cap(20, 'Wet road. The scooter slides.');
      t.traffic(30, 22, 'L R C L CR C L R C LC R');
      t.zom(350, 1); t.zom(392, -2); t.zom(440, 0.4); t.zom(500, 4.0, { lunge: 16 }); t.zom(560, -1); t.zom(602, 1.6);
      t.traffic(380, 60, 'C L R C');
      t.zom(652, -2.6); t.zom(700, 0); t.car(640, -2.7); t.car(700, 2.7); t.zom(762, 1.2); t.zom(812, -0.8);
    }),
    day({
      day: 7, name: 'Tuesday', tag: 'Everyone is leaving', length: 900, sky: { dark: 0.4 }, cfg: { maxPile: 2, neckTimer: 9 },
      wife: ['everyone is leaving the city', 'traffic 🙂'], reply: "i'm going the other way",
      late: [['her', 'Baba. Everyone left.'], ['baba', 'Not everyone.']],
      onTime: [['her', 'Baba. Everyone left.'], ['baba', 'Not everyone. 2:30.'], ['her', 'I counted.']],
    }, (t) => {
      t.traffic(30, 26, 'C L R');
      t.cap(110, 'Gridlock. Thread it.');
      t.jamRows(170, 30, 'LC L LR CR R LR LC C LR CR R L LC LR C CR');
      t.zom(215, 2.6, { still: true }); t.zom(305, -2.6, { still: true }); t.zom(395, 2.6, { still: true }); t.zom(425, 0, { still: true });
      t.zom(485, -2.6, { still: true }); t.zom(545, 2.6, { still: true }); t.zom(605, 2.6, { still: true });
      t.traffic(600, 26, 'C R L CR');
      t.zom(690, 0); t.pair(750, -1.5); t.zom(800, 2); t.zom(845, -0.5);
    }),
    day({
      day: 8, name: 'Wednesday', tag: 'Blackout', length: 880, sky: { dark: 1 }, blackout: true, cfg: { maxPile: 2, neckTimer: 9 },
      wife: ['power is out everywhere', 'lights on 🙂'], reply: 'one light',
      late: [['her', "Baba. I couldn't see you."], ['baba', 'I could see you.']],
      onTime: [['her', "Baba. I couldn't see you."], ['baba', 'I could see you.'], ['her', 'I heard you. 2:30.']],
    }, (t) => {
      t.cap(20, 'Watch for eyes.');
      t.traffic(40, 40, 'C L R C L R');
      t.zom(210, 1.5); t.zom(262, -2.2); t.zom(318, 0); t.zom(360, 4.0, { lunge: 16 }); t.zom(412, -1); t.pair(470, 1.8);
      t.traffic(430, 44, 'L C R');
      t.zom(540, -2.6); t.zom(592, 0.6); t.zom(640, -4.0, { lunge: 16, rear: true }); t.pair(700, -0.6); t.zom(760, 2.4); t.zom(805, -1.4);
      t.car(690, 2.7); t.car(735, -2.7);
      t.lurker(300, 1); t.lurker(520, -1); t.lurker(780, 1);
    }),
    day({
      day: 9, name: 'Thursday', tag: 'One more day', length: 960, sky: { dark: 0.75, storm: true }, cfg: { maxPile: 3, neckTimer: 8 },
      wife: ['one more day of school this week', "they said it's fine 🙂"], reply: 'who said',
      late: [['her', 'Baba. The teacher is blue now.'], ['baba', "Don't stare."]],
      onTime: [['her', 'Baba. The teacher is blue now.'], ['baba', "Don't stare. Get on."], ['her', 'She gave homework.']],
    }, (t) => {
      t.traffic(30, 22, 'C L R LC R CL');
      t.pair(250, 1); t.zom(290, -4.0, { lunge: 16, rear: true });
      t.cap(305, 'The bus. Again.');
      t.bus(400, 1); t.jam(386, -2.6); t.jam(388, 0.2);
      t.people(1, [438, 450, 462, 474, 486], [5.0, 5.9, 5.3, 6.0, 5.5]);
      t.trio(500, -1); t.traffic(480, 24, 'L R C');
      t.zom(585, 2.5); t.zom(625, 4.0, { lunge: 16 }); t.pair(680, 0); t.traffic(640, 24, 'C L R');
      t.trio(790, 1.2); t.zom(850, -2); t.zom(900, 0.5);
    }),
    day({
      day: 10, name: 'Friday', tag: 'The last day', length: 1000, sky: { dark: 0.9, eclipse: true, storm: true }, cfg: { maxPile: 3, neckTimer: 8 },
      wife: ['last day. bring her home 🙂'], reply: 'on my way',
      late: [['her', "Baba. You're late."], ['baba', 'There was traffic.']],
      onTime: [['her', "Baba. You're early."], ['baba', "It's 2:30."], ['her', "That's early for you."]],
      finale: [['her', "…where's YOUR helmet?"], ['baba', 'Hold on tight.']], // decided
      tomorrow: 'school finishes at 2:30 tomorrow too 🙂', // decided
    }, (t) => {
      t.traffic(30, 22, 'C R L CR L C');
      t.pair(240, -1); t.zom(285, 4.0, { lunge: 16 }); t.zom(330, 1.5); t.car(300, -2.7); t.trio(400, 0.5); t.zom(450, -4.0, { lunge: 16, rear: true });
      t.traffic(430, 24, 'R L');
      t.pair(540, 2); t.zom(590, -1.5);
      t.cap(630, 'Fill the dial. You will need it.');
      t.traffic(600, 20, 'L C R LC R C L');
      t.wave(880, 3);
    }),
  ];

  return Object.freeze({ DAYS: Object.freeze(DAYS), LANE, CRUISE });
});
