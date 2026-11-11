// After School · V0 · the rider's side of the picture: the creator's Tripo scooter as the cockpit, mirrors that
// really show what is behind, Baba's arms on the grips, and the helmet he swings.
// Scooter space: metres, origin on the road under the middle of the scooter, front at +z, the rider's LEFT at +x.
(function (root) {
  'use strict';

  const LENGTH_M = 2.0;            // provisional working length; the model is 1.0 long
  const WHEELS = [0.367, -0.346];  // contact z of front and rear wheel (model units)
  const R = 0.13;                  // wheel radius (model units)
  const EYE = { y: 1.55, z: -0.42 };
  const TAN = 0xd9a57a;
  const ARM = [0.38, 0.36];        // Baba's upper arm and forearm, m

  // Which part a triangle belongs to, from its centre and normal in model units (measured 15 Oct 2026).
  function partOf(p, n) {
    const [x, y, z] = p;
    for (const zc of WHEELS) {
      const d = Math.hypot(z - zc, y - R);
      if (d > R * 0.62 && d < R * 1.18 && Math.abs(x) < 0.09) return 'tyre';
    }
    if (y > 0.42 && z > -0.43 && z < -0.17 && Math.abs(x) < 0.2 && n[1] > 0.3) return 'seat';
    if (Math.abs(x) > 0.183 && y > 0.645 && n[2] < 0) return 'mirror';
    if (Math.abs(x) > 0.16 && y > 0.47 && y < 0.6 && z > 0.05 && z < 0.32) return 'grip';
    return 'body';
  }
  const PART_COLOR = { tyre: 'ink', seat: 'ink', grip: 'ink', mirror: 'cream', body: 'red' };

  function createRider(THREE, style, source) {
    const P = style.PALETTE;
    const colors = { red: new THREE.Color(P.red), ink: new THREE.Color(P.ink), cream: new THREE.Color(P.cream) };
    const sums = { mirrorL: [], mirrorR: [], gripL: [], gripR: [] };
    const model = source.clone(true);
    model.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      const pos = g.attributes.position, nor = g.attributes.normal;
      const col = new Float32Array(pos.count * 3);
      for (let t = 0; t < pos.count; t += 3) {
        const c3 = [0, 0, 0], n3 = [0, 0, 0];
        for (let k = 0; k < 3; k++) {
          c3[0] += pos.getX(t + k) / 3; c3[1] += pos.getY(t + k) / 3; c3[2] += pos.getZ(t + k) / 3;
          n3[0] += nor.getX(t + k) / 3; n3[1] += nor.getY(t + k) / 3; n3[2] += nor.getZ(t + k) / 3;
        }
        const part = partOf(c3, n3);
        if (part === 'mirror' || part === 'grip') sums[part + (c3[0] > 0 ? 'L' : 'R')].push([c3, n3]);
        const c = colors[PART_COLOR[part]];
        for (let k = 0; k < 3; k++) { const i = t + k; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      o.geometry = g;
      o.material = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: style.gradientMap });
    });
    style.addOutline(model, 0.012);
    model.scale.setScalar(LENGTH_M);

    const axle = new THREE.Vector3(0, R * LENGTH_M, WHEELS[1] * LENGTH_M);
    const body = new THREE.Group(); // pitches about the rear axle in a wheelie
    body.position.copy(axle);
    model.position.set(0, -axle.y, -axle.z);
    body.add(model);
    const rig = new THREE.Group();  // on the road: rotation.y = heading, rotation.z = lean
    rig.rotation.order = 'YXZ';
    rig.add(body);
    const inBody = (x, y, z) => new THREE.Vector3(x, y - axle.y, z - axle.z); // scooter space -> body space
    const anchor = (x, y, z) => { const o = new THREE.Object3D(); o.position.copy(inBody(x, y, z)); body.add(o); return o; };
    const eye = anchor(0, EYE.y, EYE.z);
    const cowl = anchor(0, 0.56 * LENGTH_M, 0.17 * LENGTH_M);
    const phone = anchor(0.31, 1.27, 0.37);

    // centre, normal and reach of a measured patch, in scooter metres
    function patch(list, fallback) {
      if (!list.length) return fallback;
      const c = new THREE.Vector3(), n = new THREE.Vector3();
      for (const [p, q] of list) { c.x += p[0]; c.y += p[1]; c.z += p[2]; n.x += q[0]; n.y += q[1]; n.z += q[2]; }
      c.multiplyScalar(LENGTH_M / list.length); n.normalize();
      let r = 0;
      for (const [p] of list) r = Math.max(r, Math.hypot(p[0] * LENGTH_M - c.x, p[1] * LENGTH_M - c.y, p[2] * LENGTH_M - c.z));
      return { c, n, r };
    }
    const grips = {
      L: patch(sums.gripL, { c: new THREE.Vector3(0.4, 1.07, 0.37) }).c,
      R: patch(sums.gripR, { c: new THREE.Vector3(-0.4, 1.07, 0.37) }).c,
    };

    // --- mirrors: a small camera looks back; each glass shows its half of that picture, flipped like a mirror ---
    const LAYER_COCKPIT = 2, LAYER_MIRROR = 1;
    const rt = new THREE.WebGLRenderTarget(512, 256, { depthBuffer: true });
    const rearCam = new THREE.PerspectiveCamera(50, 2, 0.35, 150);
    rearCam.position.set(0, 1.52, -0.3);
    rearCam.rotation.x = -0.2;
    rearCam.layers.enable(LAYER_MIRROR);
    rig.add(rearCam);
    const glassMat = new THREE.MeshBasicMaterial({ map: rt.texture });
    const mirrors = [];
    for (const side of ['L', 'R']) {
      const m = patch(sums['mirror' + side], null);
      if (!m) continue;
      const g = new THREE.CircleGeometry(m.r * 0.93, 28);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, side === 'L' ? 1 - 0.5 * uv.getX(i) : 0.5 - 0.5 * uv.getX(i));
      const glass = new THREE.Mesh(g, glassMat);
      const zAxis = m.n.clone(), xAxis = new THREE.Vector3(0, 1, 0).cross(zAxis).normalize(), yAxis = zAxis.clone().cross(xAxis);
      glass.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
      glass.position.copy(inBody(m.c.x, m.c.y, m.c.z)).addScaledVector(zAxis, 0.012);
      glass.layers.set(LAYER_COCKPIT);
      body.add(glass);
      mirrors.push(glass);
    }
    // Baba's shoulders, seen only in the mirrors
    for (const sx of [1, -1]) {
      const sh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), style.toon(P.red));
      sh.position.set(sx * 0.24, 1.36, -0.62);
      sh.layers.set(LAYER_MIRROR);
      rig.add(sh);
    }
    function renderMirrors(renderer, scene) {
      if (!mirrors.length) return;
      renderer.setRenderTarget(rt);
      renderer.render(scene, rearCam);
      renderer.setRenderTarget(null);
    }

    // --- Baba's arms ---------------------------------------------------------------------------------------
    const arms = new THREE.Group();
    rig.add(arms);
    const red = style.toon(P.red), tan = style.toon(TAN);
    const up = new THREE.Vector3(0, 1, 0);
    function limb(radius, material) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.9, 1, 10), material);
      arms.add(m);
      return m;
    }
    const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), tmpD = new THREE.Vector3();
    function span(mesh, a, b) {
      tmpA.copy(b).sub(a);
      const len = Math.max(0.001, tmpA.length());
      mesh.position.copy(a).addScaledVector(tmpA, 0.5);
      mesh.quaternion.setFromUnitVectors(up, tmpA.multiplyScalar(1 / len));
      mesh.scale.set(1, len, 1);
    }
    const arm = {};
    for (const S of ['L', 'R']) {
      arm[S] = { upper: limb(0.062, red), fore: limb(0.055, red), cuff: limb(0.058, style.toon(P.cream)), hand: new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.085, 0.12), tan), elbow: new THREE.Vector3(), at: new THREE.Vector3() };
      arms.add(arm[S].hand);
    }
    style.addOutline(arms, 0.01);
    arms.traverse((o) => o.layers.set(LAYER_COCKPIT));

    // rig-space position of a body-space point (the body pitches in a wheelie)
    function toRig(v, out) { return out.copy(v).applyEuler(body.rotation).add(body.position); }
    function reach(S, target) {
      const sx = S === 'L' ? 1 : -1;
      const sh = tmpB.set(sx * 0.27, eye.position.y + axle.y - 0.31, eye.position.z + axle.z + 0.12); // shoulder, leaning toward the bars
      const d = tmpC.copy(target).sub(sh);
      const dist = Math.max(0.05, Math.min((ARM[0] + ARM[1]) * 0.999, d.length()));
      d.normalize();
      const a = (ARM[0] * ARM[0] - ARM[1] * ARM[1] + dist * dist) / (2 * dist);
      const h = Math.sqrt(Math.max(0, ARM[0] * ARM[0] - a * a));
      const bend = tmpD.set(sx * 0.7, -0.7, -0.15);
      bend.addScaledVector(d, -bend.dot(d)).normalize();
      const A = arm[S];
      A.elbow.copy(sh).addScaledVector(d, a).addScaledVector(bend, h);
      A.at.copy(sh).addScaledVector(d, dist);
      span(A.upper, sh, A.elbow);
      span(A.fore, A.elbow, A.at);
      tmpA.copy(A.at).sub(A.elbow).normalize();
      A.cuff.position.copy(A.at).addScaledVector(tmpA, -0.05);
      A.cuff.quaternion.copy(A.fore.quaternion);
      A.cuff.scale.set(1, 0.05, 1);
      A.hand.position.copy(A.at).addScaledVector(tmpA, 0.03);
      A.hand.quaternion.copy(A.fore.quaternion);
    }

    // --- the helmet -------------------------------------------------------------------------------------------
    const helmet = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 12), style.toon(P.red));
    shell.scale.set(1, 0.94, 1.12);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.156, 18, 8, Math.PI / 2 - 1.0, 2.0, 1.1, 0.72), style.toon(P.ink));
    visor.scale.copy(shell.scale);
    helmet.add(shell, visor);
    style.addOutline(helmet, 0.012);
    const crack = new THREE.Group();
    for (const [x, y, len, rot] of [[0.0, -0.02, 0.09, 0.5], [0.03, -0.055, 0.07, -0.6], [-0.03, 0.0, 0.05, -0.9], [0.05, -0.03, 0.04, 1.2]]) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.006, len, 0.004), new THREE.MeshBasicMaterial({ color: P.cream }));
      seg.position.set(x, y, 0.172 - Math.abs(x) * 0.35);
      seg.rotation.z = rot;
      crack.add(seg);
    }
    crack.visible = false;
    helmet.add(crack);
    helmet.visible = false;
    helmet.traverse((o) => o.layers.set(LAYER_COCKPIT));
    rig.add(helmet);

    const gripL = new THREE.Vector3(), gripR = new THREE.Vector3(), hand = new THREE.Vector3(), strike = new THREE.Vector3(), wind = new THREE.Vector3();
    const ease = (t) => t * t * (3 - 2 * t);
    // swing: null or { age (s), front (bool), dir (+1 = target on the rider's right) }; free: a rig-space point the left hand
    // should carry the helmet to instead (the gate scene)
    function update(time, swing, free) {
      toRig(inBody(grips.L.x, grips.L.y + 0.03, grips.L.z), gripL);
      toRig(inBody(grips.R.x, grips.R.y + 0.03, grips.R.z), gripR);
      reach('R', gripR);
      hand.copy(gripL);
      let show = false;
      if (free) { hand.copy(free); show = true; }
      else if (swing && swing.age < 0.42) {
        const t = swing.age;
        if (swing.front) strike.set(0.04, 1.36, 0.42); else strike.set(-swing.dir * 0.62, 1.22, 0.38);
        wind.set(0.5, 1.12, -0.12);
        if (t < 0.11) { const k = ease(t / 0.11); hand.copy(gripL).lerp(wind, Math.sin(k * Math.PI) * 0.8).lerp(strike, k * k); }
        else if (t < 0.2) hand.copy(strike).addScaledVector(tmpA.copy(strike).sub(wind).normalize(), (t - 0.11) * 1.4);
        else hand.copy(strike).lerp(gripL, ease((t - 0.2) / 0.22));
        show = t > 0.015 && t < 0.4;
        helmet.rotation.set(-0.6 + t * 6, swing.front ? 0.3 : -swing.dir * 0.9, 0.4 - t * 3);
      }
      reach('L', hand);
      if (helmet.parent === rig) {
        helmet.visible = show;
        if (show) { tmpA.copy(arm.L.at).sub(arm.L.elbow).normalize(); helmet.position.copy(arm.L.at).addScaledVector(tmpA, 0.12); helmet.position.y += 0.05; }
      }
    }

    return {
      rig, body, eye, cowl, phone, axle, grips, mirrors, rearCam, helmet, arm, arms,
      renderMirrors, update, toRig, inBody,
      setCracked(v) { crack.visible = !!v; },
      layers: { cockpit: LAYER_COCKPIT, mirror: LAYER_MIRROR },
    };
  }

  root.AsaRider = { createRider, LENGTH_M, EYE };
})(typeof self !== 'undefined' ? self : this);
