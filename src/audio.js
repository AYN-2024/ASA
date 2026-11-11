// After School · controls lab v2 (PC) · synthesized placeholder sound (Web Audio).
// Layers follow the ride-feel research: engine pitch by speed, wind on a log curve of speed
// (helmet wind sits around 250–500 Hz), pass-by whooshes that drop in pitch and pan to the side.
// No recordings yet: real bike loops and pass-bys would replace these by name.
(function (root) {
  'use strict';

  function createAudio() {
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) throw Error('Sound is unavailable in this browser.');
    const ac = new AC();
    const master = ac.createGain();
    master.gain.value = 0.8;
    master.connect(ac.destination);

    const noiseBuffer = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    function loopNoise() {
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      src.start();
      return src;
    }

    // Engine: two detuned saws and a sub, through a lowpass that opens with speed.
    const engineGain = ac.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ac.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.Q.value = 2;
    const oscA = ac.createOscillator();
    const oscB = ac.createOscillator();
    const sub = ac.createOscillator();
    oscA.type = 'sawtooth';
    oscB.type = 'sawtooth';
    sub.type = 'sine';
    const subGain = ac.createGain();
    subGain.gain.value = 0.5;
    oscA.connect(engineFilter); oscB.connect(engineFilter); sub.connect(subGain); subGain.connect(engineFilter);
    engineFilter.connect(engineGain); engineGain.connect(master);
    oscA.start(); oscB.start(); sub.start();

    // Wind: a mid band (250–500 Hz) plus a thin high hiss.
    const windGain = ac.createGain();
    windGain.gain.value = 0;
    const windBand = ac.createBiquadFilter();
    windBand.type = 'bandpass';
    windBand.frequency.value = 380;
    windBand.Q.value = 0.7;
    const hiss = ac.createBiquadFilter();
    hiss.type = 'highpass';
    hiss.frequency.value = 2600;
    const hissGain = ac.createGain();
    hissGain.gain.value = 0.25;
    const windSrc = loopNoise();
    windSrc.connect(windBand); windBand.connect(windGain);
    windSrc.connect(hiss); hiss.connect(hissGain); hissGain.connect(windGain);
    windGain.connect(master);

    // Leg-out scrape.
    const scrapeGain = ac.createGain();
    scrapeGain.gain.value = 0;
    const scrapeFilter = ac.createBiquadFilter();
    scrapeFilter.type = 'bandpass';
    scrapeFilter.frequency.value = 2300;
    scrapeFilter.Q.value = 1.3;
    loopNoise().connect(scrapeFilter);
    scrapeFilter.connect(scrapeGain);
    scrapeGain.connect(master);

    function tone(type, freq, dur, peak, endFreq) {
      const t = ac.currentTime;
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.05);
    }

    function burst(type, freq, q, dur, peak, sweepTo, pan) {
      const t = ac.currentTime;
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer;
      const f = ac.createBiquadFilter();
      f.type = type;
      f.frequency.setValueAtTime(freq, t);
      if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
      f.Q.value = q;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g);
      if (pan && ac.createStereoPanner) {
        const p = ac.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, pan));
        g.connect(p); p.connect(master);
      } else {
        g.connect(master);
      }
      src.start(t); src.stop(t + dur + 0.05);
    }

    let rainGain = null;
    return {
      resume: () => ac.resume(),
      setMuted(muted) { master.gain.setTargetAtTime(muted ? 0 : 0.8, ac.currentTime, 0.05); },
      // speed01: 0..1.4 of cruise; wind: 0..1 (rules.windLevel); up: wheelie lift 0..1
      update(speed01, wind, up, scraping) {
        const t = ac.currentTime;
        const base = 46 + speed01 * 34 + up * 16;
        oscA.frequency.setTargetAtTime(base, t, 0.09);
        oscB.frequency.setTargetAtTime(base * 1.012, t, 0.09);
        sub.frequency.setTargetAtTime(base / 2, t, 0.09);
        engineFilter.frequency.setTargetAtTime(260 + speed01 * 420 + up * 500, t, 0.1);
        engineGain.gain.setTargetAtTime(speed01 > 0 ? 0.05 + up * 0.03 : 0, t, 0.1);
        windGain.gain.setTargetAtTime(wind * 0.22, t, 0.15);
        scrapeGain.gain.setTargetAtTime(scraping ? 0.07 : 0, t, 0.04);
      },
      // level 0..1 (rules.passByLevel), side -1 left / 1 right: pitch drops as the car goes by.
      passBy(level, side) { if (level > 0.02) burst('bandpass', 1500, 0.9, 0.55, 0.08 + level * 0.5, 380, side * 0.8); },
      crunch() { burst('lowpass', 900, 0.7, 0.5, 0.9, 120); tone('square', 70, 0.25, 0.25, 40); },
      klonk() { tone('triangle', 190, 0.32, 0.65, 120); burst('highpass', 2500, 0.6, 0.06, 0.4); },
      thump() { tone('sine', 72, 0.22, 0.7, 38); },
      lift() { tone('sawtooth', 90, 0.35, 0.12, 160); },
      ready() { tone('triangle', 660, 0.12, 0.22); setTimeout(() => tone('triangle', 990, 0.18, 0.22), 110); },
      blocked() { tone('square', 140, 0.12, 0.1, 110); },
      groan() { tone('sawtooth', 110, 0.6, 0.12, 70); },
      swing() { burst('bandpass', 900, 1.2, 0.18, 0.18, 300); },
      // V0 cues (still synthesized placeholders)
      thunder() { burst('lowpass', 220, 0.5, 2.2, 0.9, 60); tone('sine', 55, 1.4, 0.5, 30); },
      buzz() { tone('square', 150, 0.09, 0.08); setTimeout(() => tone('square', 150, 0.09, 0.08), 160); },
      heart(level) { tone('sine', 58, 0.16, 0.2 + level * 0.5, 40); },
      chime() { tone('triangle', 784, 0.18, 0.2); setTimeout(() => tone('triangle', 1047, 0.3, 0.2), 140); },
      teeth() { burst('highpass', 1800, 0.8, 0.09, 0.7); tone('square', 90, 0.3, 0.4, 45); },
      kid() { tone('sine', 880, 0.12, 0.16, 1100); },
      stamp() { tone('sine', 120, 0.14, 0.6, 60); burst('lowpass', 700, 0.7, 0.08, 0.5); },
      rain(on) {
        if (!rainGain) {
          rainGain = ac.createGain(); rainGain.gain.value = 0;
          const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1400;
          loopNoise().connect(f); f.connect(rainGain); rainGain.connect(master);
        }
        rainGain.gain.setTargetAtTime(on ? 0.09 : 0, ac.currentTime, 0.4);
      },
    };
  }

  root.AsaAudio = { createAudio };
})(typeof self !== 'undefined' ? self : this);
