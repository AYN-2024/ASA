// After School · controls lab v2 (PC) · placeholder drawings in the palette.
// These stand in until GPT art arrives. Cockpit-space shapes use the 1672 x 941 cockpit painting's pixels.
(function (root) {
  'use strict';

  const INK = '#0a1115';
  const CREAM = '#f6e5c7';
  const RED = '#bc2b20';
  const BLUE = '#1f4b8f';

  // Measured on cockpit.png (1672 x 941): speedometer centre and face radius.
  const DIAL = Object.freeze({ x: 833, y: 532, r: 105 });
  const LIGHTS = Object.freeze([{ x: 790, y: 700 }, { x: 833, y: 700 }, { x: 876, y: 700 }]);

  function grain(ctx, w, h, count, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const n = Math.sin(i * 91.7) * 43758.5453;
      const m = Math.sin(i * 17.3) * 12543.2131;
      ctx.fillRect((n - Math.floor(n)) * w, (m - Math.floor(m)) * h, 1.6, 1.6);
    }
    ctx.restore();
  }

  // Front view of a fleeing car, 256 x 210, transparent outside the body.
  function makeCarCanvas() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 210;
    const g = c.getContext('2d');
    g.fillStyle = INK;
    g.beginPath();
    g.moveTo(58, 18); g.lineTo(198, 18); g.lineTo(226, 92); g.lineTo(246, 100);
    g.lineTo(246, 186); g.lineTo(10, 186); g.lineTo(10, 100); g.lineTo(30, 92);
    g.closePath();
    g.fill();
    g.fillRect(16, 180, 46, 28);
    g.fillRect(194, 180, 46, 28);
    g.fillStyle = CREAM; // windscreen
    g.beginPath();
    g.moveTo(68, 30); g.lineTo(188, 30); g.lineTo(210, 88); g.lineTo(46, 88);
    g.closePath();
    g.fill();
    g.fillStyle = INK;
    g.beginPath();
    g.moveTo(150, 30); g.lineTo(166, 30); g.lineTo(130, 88); g.lineTo(114, 88);
    g.closePath();
    g.fill();
    g.fillStyle = CREAM; // headlights and bumper
    g.beginPath(); g.ellipse(50, 128, 20, 13, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(206, 128, 20, 13, 0, 0, Math.PI * 2); g.fill();
    g.fillRect(24, 160, 208, 6);
    g.fillRect(96, 118, 64, 4);
    g.fillRect(96, 130, 64, 4);
    grain(g, 256, 210, 260, CREAM, 0.25);
    return c;
  }

  // Street lamp post at the kerb, 64 x 440: ink pole, arm and a cream lamp.
  function makePostCanvas() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 440;
    const g = c.getContext('2d');
    g.fillStyle = INK;
    g.fillRect(27, 30, 10, 410);
    g.fillRect(14, 400, 36, 40);
    g.fillRect(8, 22, 48, 14);
    g.fillStyle = CREAM;
    g.fillRect(12, 36, 40, 7);
    return c;
  }

  // The grabber: one adult zombie hugging the column, head between the mirrors.
  // Back layer (head, shoulders) goes under the cockpit painting; front layer (arms, hands) over it.
  // Adult scale: an adult head about half a metre in front of the rider's eyes fills the gap between the mirrors.
  const GRABBER = Object.freeze({
    head: { x: 833, y: 150, r: 150 },
    shoulders: { x: 833, y: 440, rx: 430, ry: 175 },
    arms: [[[470, 360], [505, 470]], [[1196, 360], [1161, 470]]],
    hands: [{ x: 505, y: 482, r: 64 }, { x: 1161, y: 482, r: 64 }],
  });

  function drawGrabberBack(g, flash) {
    const { head, shoulders } = GRABBER;
    const r = head.r;
    g.save();
    g.lineWidth = 12;
    g.strokeStyle = INK;
    g.fillStyle = flash ? CREAM : BLUE;
    g.beginPath(); g.ellipse(shoulders.x, shoulders.y, shoulders.rx, shoulders.ry, 0, Math.PI, Math.PI * 2); g.lineTo(shoulders.x + shoulders.rx, shoulders.y + 120); g.lineTo(shoulders.x - shoulders.rx, shoulders.y + 120); g.closePath(); g.fill(); g.stroke();
    g.fillRect(head.x - r * 0.45, head.y + r * 0.6, r * 0.9, r * 1.1);
    g.beginPath(); g.ellipse(head.x, head.y, r * 0.9, r, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = INK; // hair
    g.beginPath(); g.ellipse(head.x, head.y - r * 0.08, r * 0.94, r * 1.04, 0, Math.PI * 1.06, Math.PI * 1.94); g.closePath(); g.fill();
    g.fillStyle = '#ffffff'; // white eyes (decision 183)
    for (const ex of [-0.36, 0.36]) { g.beginPath(); g.ellipse(head.x + ex * r, head.y, r * 0.2, r * 0.13, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = INK;
    for (const ex of [-0.32, 0.32]) { g.beginPath(); g.arc(head.x + ex * r, head.y + r * 0.02, r * 0.045, 0, Math.PI * 2); g.fill(); }
    g.lineWidth = 9;
    g.beginPath(); g.moveTo(head.x - r * 0.32, head.y + r * 0.5); g.lineTo(head.x + r * 0.3, head.y + r * 0.44); g.stroke();
    g.restore();
  }

  function drawGrabberFront(g, flash) {
    g.save();
    g.lineCap = 'round';
    for (const [a, b] of GRABBER.arms) {
      g.strokeStyle = INK; g.lineWidth = 112;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      g.strokeStyle = flash ? CREAM : BLUE; g.lineWidth = 92;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    }
    for (const h of GRABBER.hands) {
      g.fillStyle = flash ? CREAM : BLUE; g.strokeStyle = INK; g.lineWidth = 10;
      g.beginPath(); g.arc(h.x, h.y, h.r, 0, Math.PI * 2); g.fill(); g.stroke();
      g.lineWidth = 7;
      for (let f = -1.5; f <= 1.5; f++) { g.beginPath(); g.moveTo(h.x + f * 24, h.y + 10); g.lineTo(h.x + f * 24, h.y + 56); g.stroke(); }
    }
    g.restore();
  }

  function distToSegment(px, py, a, b) {
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(px - (a[0] + t * vx), py - (a[1] + t * vy));
  }

  // V0 rule: a hit anywhere on him counts. Returns the part touched, or null.
  function hitGrabber(x, y) {
    const { head, shoulders, arms, hands } = GRABBER;
    const slack = 24;
    if (Math.hypot(x - head.x, y - head.y) <= head.r + slack) return 'head';
    if (hands.some((h) => Math.hypot(x - h.x, y - h.y) <= h.r + slack)) return 'hand';
    if (arms.some(([a, b]) => distToSegment(x, y, a, b) <= 56 + slack)) return 'arm';
    const ex = (x - shoulders.x) / (shoulders.rx + slack);
    const ey = (y - shoulders.y) / (shoulders.ry + slack);
    if (y <= shoulders.y + 120 && ex * ex + ey * ey <= 1) return 'body';
    return null;
  }

  // A speedometer face in cockpit-painting coordinates (centre DIAL), for the 3D cockpit where the model has no gauge.
  function drawDialFace(g, speed01, time) {
    const { x, y, r } = DIAL;
    g.save();
    g.fillStyle = INK;
    g.beginPath(); g.arc(x, y, r + 34, 0, Math.PI * 2); g.fill();
    g.fillRect(x - 70, y + r, 140, 210);
    g.fillStyle = CREAM;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 8;
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI * 0.75 + (Math.PI * 1.5 * i) / 8;
      g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72); g.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9); g.stroke();
    }
    const a = Math.PI * 0.75 + Math.PI * 1.5 * Math.max(0, Math.min(1, speed01 * 0.55)) + Math.sin(time * 23) * 0.01;
    g.lineWidth = 7;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78); g.stroke();
    g.fillStyle = INK;
    g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  // Wheelie meter (Burnout-style dial) as a red arc around the real speedometer; fills and drains smoothly.
  function drawMeter(g, meter, size, ready, time, draining) {
    const start = Math.PI * 0.75;
    const sweep = Math.PI * 1.5;
    const gap = 0.07;
    const r = DIAL.r + 16;
    g.save();
    g.lineCap = 'butt';
    for (let i = 0; i < size; i++) {
      const a0 = start + (sweep * i) / size + gap;
      const a1 = start + (sweep * (i + 1)) / size - gap;
      g.lineWidth = 15;
      g.strokeStyle = 'rgba(10,17,21,.45)';
      g.beginPath(); g.arc(DIAL.x, DIAL.y, r, a0, a1); g.stroke();
      const fill = Math.max(0, Math.min(1, meter - i));
      if (fill > 0) {
        g.strokeStyle = draining && Math.sin(time * 30) > 0 ? CREAM : RED;
        g.beginPath(); g.arc(DIAL.x, DIAL.y, r, a0, a0 + (a1 - a0) * fill); g.stroke();
      }
    }
    if (ready && !draining) {
      g.globalAlpha = 0.45 + 0.4 * Math.sin(time * 9);
      g.strokeStyle = CREAM;
      g.lineWidth = 6;
      g.beginPath(); g.arc(DIAL.x, DIAL.y, r + 13, 0, Math.PI * 2); g.stroke();
    }
    g.restore();
  }

  function drawLives(g, lives, max) {
    g.save();
    LIGHTS.slice(0, max).forEach((p, i) => {
      g.fillStyle = i < lives ? RED : 'rgba(246,229,199,.18)';
      g.strokeStyle = INK;
      g.lineWidth = 5;
      g.beginPath(); g.arc(p.x, p.y, 15, 0, Math.PI * 2); g.fill(); g.stroke();
      if (i < lives) { g.fillStyle = CREAM; g.beginPath(); g.arc(p.x - 5, p.y - 5, 4, 0, Math.PI * 2); g.fill(); }
    });
    g.restore();
  }

  // Neck timer ring around the grabber's head (lab readout).
  function drawNeckRing(g, fraction) {
    const { head } = GRABBER;
    g.save();
    g.strokeStyle = RED;
    g.lineWidth = 12;
    g.beginPath(); g.arc(head.x, head.y, head.r + 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraction); g.stroke();
    g.restore();
  }

  // Dad's leg out during a wheelie turn, in screen pixels. side: -1 left, 1 right; p: 0..1 slide-in.
  function drawLeg(g, W, H, side, p, time) {
    if (p <= 0) return;
    const baseX = side > 0 ? W * 1.02 : -W * 0.02;
    const footX = side > 0 ? W * (1.06 - 0.22 * p) : W * (-0.06 + 0.22 * p);
    const footY = H * 0.94 + Math.sin(time * 40) * 1.5;
    g.save();
    g.fillStyle = INK;
    g.beginPath();
    g.moveTo(baseX, H * 0.74);
    g.lineTo(baseX, H * 0.86);
    g.lineTo(footX + side * 10, footY - 6);
    g.lineTo(footX - side * 26, footY - 30);
    g.closePath();
    g.fill();
    g.beginPath(); g.ellipse(footX, footY, 46, 17, side * -0.18, 0, Math.PI * 2); g.fill();
    g.fillStyle = CREAM;
    g.fillRect(footX - 40, footY + 9, 80, 4);
    g.globalAlpha = 0.7 * p;
    for (let i = 0; i < 9; i++) {
      const n = Math.sin((i + 1) * 12.9 + time * 31) * 0.5 + 0.5;
      g.fillRect(footX - side * (40 + n * 70), footY + 8 - n * 22, 5, 5);
    }
    g.restore();
  }

  root.AsaSprites = {
    INK, CREAM, RED, BLUE, DIAL,
    makeCarCanvas, makePostCanvas, drawDialFace, drawGrabberBack, drawGrabberFront, hitGrabber, drawMeter, drawLives, drawNeckRing, drawLeg,
  };
})(typeof self !== 'undefined' ? self : this);
