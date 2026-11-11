// After School · V0 · the 2D layer over the 3D picture: the dial on the cowl, the phone on its mount (clock and
// route: the only HUD), captions, comic pops, the gate's speech lines, rain, the closing dark and the bite.
(function (root) {
  'use strict';
  const S = root.AsaSprites;
  const INK = '#0a1115', CREAM = '#f6e5c7', RED = '#bc2b20';
  const CAPTION_S = 2.8, POP_S = 0.75, TOAST_S = 3.4;

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }

  function createHud(canvas) {
    const g = canvas.getContext('2d');
    const st = { caption: null, pops: [], toast: null, speech: null, bite: null };

    function drawPhone(f) {
      const p = f.phone;
      if (!p) return;
      const w = 96, h = 176;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.roll - 0.1);
      g.strokeStyle = INK; g.lineWidth = 9; g.lineCap = 'round';
      g.beginPath(); g.moveTo(8, h / 2 - 6); g.lineTo(26, h / 2 + 46); g.stroke(); // the mount
      g.fillStyle = INK; roundRect(g, -w / 2, -h / 2, w, h, 13); g.fill();
      g.fillStyle = f.night ? '#fff6dc' : CREAM; roundRect(g, -w / 2 + 6, -h / 2 + 8, w - 12, h - 16, 8); g.fill();
      g.fillStyle = f.late ? RED : INK;
      g.textAlign = 'center';
      g.font = 'bold 31px Georgia, serif';
      g.fillText(f.clock, 0, -h / 2 + 44);
      // route: the scooter climbs toward the school
      const top = -h / 2 + 74, bottom = h / 2 - 22;
      g.strokeStyle = INK; g.lineWidth = 3; g.setLineDash([5, 5]);
      g.beginPath(); g.moveTo(0, bottom); g.lineTo(0, top + 12); g.stroke(); g.setLineDash([]);
      g.fillStyle = INK; // the school
      g.beginPath(); g.moveTo(-11, top + 10); g.lineTo(0, top - 2); g.lineTo(11, top + 10); g.closePath(); g.fill();
      g.fillRect(-8, top + 10, 16, 9);
      const y = bottom - (bottom - top - 22) * Math.max(0, Math.min(1, f.progress));
      g.fillStyle = RED; g.beginPath(); g.arc(0, y, 6.5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
      g.fillStyle = INK; g.font = '13px Georgia, serif'; g.textAlign = 'left';
      g.fillText(`${Math.max(0, Math.round(f.remaining))} m`, 10, y + 4);
      g.restore();
      if (st.toast) {
        const age = f.now - st.toast.at;
        if (age > TOAST_S) st.toast = null;
        else {
          g.save();
          g.globalAlpha = Math.min(1, age / 0.15, (TOAST_S - age) / 0.4);
          g.font = '22px Georgia, serif';
          const tw = g.measureText(st.toast.text).width + 34;
          const bx = Math.min(f.W - tw - 20, p.x + 62), by = p.y - 96 - Math.min(1, age / 0.15) * 8;
          g.fillStyle = CREAM; g.strokeStyle = INK; g.lineWidth = 3;
          roundRect(g, bx, by, tw, 44, 16); g.fill(); g.stroke();
          g.fillStyle = INK; g.textAlign = 'left'; g.fillText(st.toast.text, bx + 17, by + 29);
          g.restore();
        }
      }
    }

    function drawText(f) {
      const { W, H } = f;
      g.save();
      g.textAlign = 'center';
      if (st.caption) {
        const age = f.now - st.caption.at;
        if (age > CAPTION_S) st.caption = null;
        else {
          g.globalAlpha = Math.min(1, age / 0.2, (CAPTION_S - age) / 0.4);
          g.font = '34px Georgia, serif';
          const w = g.measureText(st.caption.text).width + 44;
          g.fillStyle = 'rgba(246,229,199,.94)'; g.fillRect((W - w) / 2, 26, w, 54);
          g.fillStyle = INK; g.fillText(st.caption.text, W / 2, 64);
        }
      }
      st.pops = st.pops.filter((p) => f.now - p.at < POP_S);
      for (const p of st.pops) {
        const age = (f.now - p.at) / POP_S;
        g.save();
        g.globalAlpha = 1 - age * age;
        if (p.kind === 'close') {
          g.font = 'italic 40px Georgia, serif'; g.fillStyle = RED;
          g.fillText('Close!', W / 2 + p.side * W * 0.3, H * 0.36 - age * 30);
        } else {
          const big = p.kind === 'klonk';
          g.translate(W / 2 + p.side * W * (big ? 0.12 : 0.16), H * (big ? 0.3 : 0.42) - age * 24);
          g.rotate(p.side * 0.12 - 0.08);
          const k = 0.7 + Math.min(1, age * 6) * 0.5;
          g.scale(k, k);
          g.font = `italic bold ${big ? 92 : 54}px Georgia, serif`;
          g.lineWidth = big ? 12 : 8; g.strokeStyle = INK; g.lineJoin = 'round';
          g.strokeText(p.text, 0, 0);
          g.fillStyle = big ? RED : CREAM; g.fillText(p.text, 0, 0);
        }
        g.restore();
      }
      if (st.speech) {
        const age = f.now - st.speech.at;
        g.globalAlpha = Math.min(1, age / 0.12);
        g.font = '40px Georgia, serif';
        const w = Math.max(260, g.measureText(st.speech.text).width + 70);
        const x = (W - w) / 2, y = st.speech.who === 'her' ? H * 0.2 : H * 0.6;
        g.fillStyle = CREAM; g.strokeStyle = INK; g.lineWidth = 4;
        roundRect(g, x, y, w, 92, 20); g.fill(); g.stroke();
        g.fillStyle = RED; g.font = '15px Georgia, serif';
        g.fillText(st.speech.who === 'her' ? 'S H E' : st.speech.who === 'wife' ? 'P H O N E' : 'B A B A', W / 2, y + 24);
        g.fillStyle = INK; g.font = '40px Georgia, serif';
        g.fillText(st.speech.text, W / 2, y + 68);
      }
      g.restore();
    }

    function drawBite(f) {
      if (!st.bite) return;
      const age = f.now - st.bite.at;
      let p = Math.min(1, age / 0.22);
      if (!st.bite.stay && age > 0.5) p = Math.max(0, 1 - (age - 0.5) / 0.35);
      if (!st.bite.stay && age > 0.9) { st.bite = null; return; }
      const { W, H } = f, n = 9, tw = W / n, jaw = (H / 2) * p * p;
      g.save();
      for (const dir of [1, -1]) {
        g.save();
        if (dir < 0) { g.translate(0, H); g.scale(1, -1); }
        g.fillStyle = '#16304f'; g.fillRect(0, -2, W, jaw - 60 * p + 2);
        g.fillStyle = CREAM; g.strokeStyle = INK; g.lineWidth = 5;
        for (let i = 0; i < n; i++) {
          const base = jaw - 64 * p, tip = jaw + (i % 2 ? 6 : 26) * p;
          g.beginPath(); g.moveTo(i * tw + 6, base); g.lineTo(i * tw + tw / 2, tip); g.lineTo((i + 1) * tw - 6, base); g.closePath(); g.fill(); g.stroke();
        }
        g.restore();
      }
      g.restore();
    }

    // f: { W, H, now, dial:{x,y,k}|null, speed01, meter, meterSize, canLift, wheelieUp, lives, maxLives, phone:{x,y,roll}|null,
    //      clock, late, progress, remaining, neck, rain, night, leg:{side,p} }
    function draw(f) {
      const { W, H } = f;
      g.clearRect(0, 0, W, H);
      if (f.rain) {
        g.save();
        g.strokeStyle = 'rgba(10,17,21,.32)'; g.lineWidth = 2;
        for (let i = 0; i < 70; i++) {
          const n = Math.sin(i * 91.7) * 43758.5453, m = Math.sin(i * 17.3) * 12543.2131;
          const x = ((n - Math.floor(n)) * (W + 200) + f.now * 380) % (W + 200) - 100, y = ((m - Math.floor(m)) * H + f.now * (1500 + (i % 5) * 160)) % H;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x - 14, y + 46); g.stroke();
        }
        g.restore();
      }
      if (f.neck > 0.01) {
        const k = Math.min(1, f.neck), pulse = 0.5 + 0.5 * Math.sin(f.now * (5 + 9 * k));
        const grad = g.createRadialGradient(W / 2, H * 0.55, H * (0.72 - 0.5 * k), W / 2, H * 0.55, H * (1.05 - 0.3 * k));
        grad.addColorStop(0, 'rgba(10,17,21,0)'); grad.addColorStop(1, `rgba(10,17,21,${0.55 + 0.4 * k})`);
        g.fillStyle = grad; g.fillRect(0, 0, W, H);
        g.strokeStyle = `rgba(188,43,32,${(0.25 + 0.6 * k) * pulse})`; g.lineWidth = 18 + 22 * k; g.strokeRect(0, 0, W, H);
      }
      if (f.dial) {
        g.save();
        g.translate(f.dial.x, f.dial.y); g.scale(f.dial.k, f.dial.k); g.translate(-S.DIAL.x, -S.DIAL.y);
        S.drawDialFace(g, f.speed01, f.now);
        S.drawMeter(g, f.meter, f.meterSize, f.canLift, f.now, f.wheelieUp);
        S.drawLives(g, f.lives, f.maxLives);
        g.restore();
      }
      drawPhone(f);
      if (f.leg && f.leg.p > 0) S.drawLeg(g, W, H, f.leg.side, f.leg.p, f.now);
      drawText(f);
      drawBite(f);
    }

    return {
      draw,
      caption(text, now) { st.caption = { text, at: now }; },
      pop(kind, side, now, text) { st.pops.push({ kind, side, at: now, text }); },
      toast(text, now) { st.toast = { text, at: now }; },
      say(who, text, now) { st.speech = text ? { who, text, at: now } : null; },
      bite(now, stay) { st.bite = { at: now, stay: !!stay }; },
      clear() { st.caption = null; st.pops = []; st.toast = null; st.speech = null; st.bite = null; },
    };
  }

  root.AsaHud = { createHud };
})(typeof self !== 'undefined' ? self : this);
