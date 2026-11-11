// After School · V0 · the world: the street in merged 20 m blocks, the sky and its arc, traffic, the bus and the school gate.
// Game z runs along the route; Three.js Z = -z. Game x is metres to the rider's right of the road centre.
(function (root) {
  'use strict';

  const BLOCK = 20, AHEAD = 190, BEHIND = 60;
  const CAR_SCALE = 1.25;
  const WHEEL_R = 0.3 * CAR_SCALE;

  function roadCenter(z) { return 2.5 * Math.sin(z / 95) + 1.25 * Math.sin(z / 47 + 0.3); }
  function roadSlope(z) { return (2.5 / 95) * Math.cos(z / 95) + (1.25 / 47) * Math.cos(z / 47 + 0.3); }
  function noise(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return s - Math.floor(s); }
  const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

  function createWorld(THREE, BGU, scene, style, assets) {
    const P = style.PALETTE;
    const tex = (img) => { const t = new THREE.Texture(img); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true; return t; };
    const roadTex = tex(assets.images.road), facadeTex = tex(assets.images.facade);
    const mats = {
      road: style.toon(0xffffff, { map: roadTex }), walk: style.toon(0xe4dccb, { map: roadTex }), facade: style.toon(0xffffff, { map: facadeTex }),
      ink: style.toon(P.ink), cream: style.toon(P.cream), tree: style.toon(P.tree),
      lamp: new THREE.MeshBasicMaterial({ color: P.cream }), line: new THREE.MeshBasicMaterial({ color: P.ink, side: THREE.BackSide }),
      light: new THREE.MeshBasicMaterial({ color: 0xfff1cf }), glow: new THREE.MeshBasicMaterial({ color: 0xfff6dc, fog: false }),
    };
    const ambient = new THREE.AmbientLight(0xffffff, 1.1);
    const sun = new THREE.DirectionalLight(0xffffff, 2.4); // upper left, as in every painting
    sun.position.set(-40, 60, 25);
    scene.add(ambient, sun);
    scene.background = new THREE.Color(P.cream);
    scene.fog = new THREE.Fog(P.cream, 70, 175);

    const geo = {
      stone: new THREE.BoxGeometry(0.16, 0.12, 1.2), dash: new THREE.BoxGeometry(0.14, 0.012, 3),
      trunk: new THREE.CylinderGeometry(0.11, 0.16, 2.2, 7), crown: new THREE.IcosahedronGeometry(1, 0),
      pole: new THREE.CylinderGeometry(0.07, 0.09, 4.8, 8), arm: new THREE.BoxGeometry(0.9, 0.08, 0.08),
      head: new THREE.BoxGeometry(0.42, 0.12, 0.26), bulb: new THREE.BoxGeometry(0.36, 0.03, 0.2), box: new THREE.BoxGeometry(1, 1, 1),
    };
    const yAxis = new THREE.Vector3(0, 1, 0);
    const mat4 = (x, y, z, ry = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(yAxis, ry), new THREE.Vector3(sx, sy, sz));

    // Collects geometry per material, then makes one mesh per material.
    function buckets() {
      const b = {};
      const api = {
        add(key, g, matrix, hull) {
          const c = g.index ? g.toNonIndexed() : g.clone();
          c.applyMatrix4(matrix);
          (b[key] = b[key] || []).push(c);
          if (hull) { // inverted hull: the same shape a little bigger, drawn in ink from the inside
            g.computeBoundingSphere();
            const h = g.index ? g.toNonIndexed() : g.clone();
            const k = 1 + hull / Math.max(g.boundingSphere.radius, 0.05);
            h.applyMatrix4(new THREE.Matrix4().multiplyMatrices(matrix, new THREE.Matrix4().makeScale(k, k, k)));
            (b.line = b.line || []).push(h);
          }
        },
        box(key, x, y, z, w, h, d, ry = 0, hull) { api.add(key, geo.box, mat4(x, y, z, ry, w, h, d), hull); },
        into(group) {
          for (const key of Object.keys(b)) {
            const mesh = new THREE.Mesh(BGU.mergeGeometries(b[key], false), mats[key]);
            mesh.userData.own = true;
            group.add(mesh);
          }
          return group;
        },
      };
      return api;
    }

    function strip(z0, z1, xa, xb, y, uScale, vScale) {
      const steps = Math.ceil((z1 - z0) / 2);
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= steps; i++) {
        const z = z0 + ((z1 - z0) * i) / steps, c = roadCenter(z);
        pos.push(c + xa, y, -z, c + xb, y, -z);
        uv.push(0, z / vScale, uScale, z / vScale);
        if (i < steps) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    }
    const ID = new THREE.Matrix4();

    function tree(B, x, z, s, ry) {
      const base = mat4(x, 0.11, -z, ry, s);
      B.add('ink', geo.trunk, base.clone().multiply(mat4(0, 1.1, 0)), 0.05);
      for (const [cx, cy, cz, cs] of [[0, 2.7, 0, 1.25], [0.6, 2.35, 0.3, 0.85], [-0.55, 2.45, -0.25, 0.9]]) B.add('tree', geo.crown, base.clone().multiply(mat4(cx, cy, cz, 0, cs)), 0.05);
    }

    let level = null;
    const blocks = new Map();
    const openSide = (z, side) => !!level && level.buses.some((b) => b.side === side && z >= b.z - 60 && z < b.z + 40);

    function buildBlock(n) {
      const z0 = n * BLOCK, z1 = z0 + BLOCK;
      const group = new THREE.Group();
      const B = buckets();
      const end = level ? level.length - 4 : Infinity;
      B.add('road', strip(z0, z1, -5.5, 5.5, 0, 1.55, 7), ID);
      for (const side of [-1, 1]) {
        const open = openSide(z0, side);
        const outer = open ? 6.95 : 5.7;
        B.add('walk', strip(z0, z1, side < 0 ? -outer : 4.25, side < 0 ? -4.25 : outer, 0.11, 0.6 * (outer - 4.25) / 1.45, 5), ID);
      }
      for (let k = 0; k < BLOCK / 1.25; k++) {
        const z = z0 + k * 1.25 + 0.625, yaw = -Math.atan(roadSlope(z));
        for (const side of [-1, 1]) B.add((Math.round(z / 1.25) + (side > 0 ? 1 : 0)) % 2 ? 'ink' : 'cream', geo.stone, mat4(roadCenter(z) + side * 4.25, 0.06, -z, yaw));
      }
      for (let z = Math.ceil(z0 / 10) * 10; z < z1; z += 10) {
        for (const lx of [-1.35, 1.35]) B.add('ink', geo.dash, mat4(roadCenter(z + 1.5) + lx, 0.007, -(z + 1.5), -Math.atan(roadSlope(z + 1.5))));
      }
      for (let i = Math.floor(z0 / 15) - 1; i <= Math.ceil(z1 / 15); i++) {
        for (const side of [-1, 1]) {
          if ((i + (side === 1 ? 1 : 0)) % 7 === 0) continue;
          const z = i * 15 + (side === 1 ? 4 : 0);
          if (z < z0 || z >= z1 || z > end - 8) continue;
          const depth = 10 + noise(i + side * 13) * 3, width = 4 + noise(i * 5 + side) * 4, height = 7 + noise(i * 7 + side * 53) * 12;
          const inside = roadCenter(z + depth * 0.5) + side * (openSide(z, side) || openSide(z + depth, side) ? 7.1 : 5.85);
          const g = new THREE.BoxGeometry(width, height, depth);
          const uv = g.attributes.uv;
          const sizes = [[depth, height], [depth, height], [width, depth], [width, depth], [width, height], [width, height]];
          for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const k = f * 4 + v; uv.setXY(k, uv.getX(k) * (sizes[f][0] / 8), uv.getY(k) * (sizes[f][1] / 8)); }
          B.add('facade', g, mat4(inside + side * width * 0.5, height / 2, -(z + depth / 2)));
        }
      }
      for (let i = Math.floor(z0 / 13) - 1; i <= Math.ceil(z1 / 13); i++) {
        for (const side of [-1, 1]) {
          if ((i + side) % 3 === 0) continue;
          const z = i * 13 + (side === 1 ? 6 : 0);
          if (z < z0 || z >= z1 || z > end || openSide(z, side)) continue;
          tree(B, roadCenter(z) + side * (4.95 + noise(i + side) * 0.4), z, (3.4 + noise(i * 11 + side) * 1.7) / 3.4, noise(i * 3 + side) * 6.28);
        }
      }
      for (let i = Math.floor(z0 / 15) - 1; i <= Math.ceil(z1 / 15); i++) {
        for (const side of [-1, 1]) {
          const z = i * 15 + (side === 1 ? 7.5 : 0) + 2;
          if (z < z0 || z >= z1 || z > end || openSide(z, side)) continue;
          const base = mat4(roadCenter(z) + side * 4.5, 0.11, -z, side > 0 ? 0 : Math.PI);
          B.add('ink', geo.pole, base.clone().multiply(mat4(0, 2.4, 0)), 0.03);
          B.add('ink', geo.arm, base.clone().multiply(mat4(-0.4, 4.75, 0)), 0.03);
          B.add('ink', geo.head, base.clone().multiply(mat4(-0.8, 4.7, 0)), 0.03);
          B.add('lamp', geo.bulb, base.clone().multiply(mat4(-0.8, 4.63, 0)));
        }
      }
      B.into(group);
      for (let i = Math.floor(z0 / 41) - 1; i <= Math.ceil(z1 / 41); i++) {
        const z = i * 41 + 20, side = i % 2 === 0 ? -1 : 1;
        if (z < z0 || z >= z1 || z > end - 10 || openSide(z, side) || !assets.parked.length) continue;
        const car = assets.parked[Math.abs(i) % assets.parked.length].clone();
        car.scale.setScalar(CAR_SCALE);
        car.position.set(roadCenter(z) + side * 5.0, 0.11, -z);
        car.rotation.y = (i % 3 === 0 ? Math.PI : 0) - Math.atan(roadSlope(z));
        group.add(car);
      }
      scene.add(group);
      return group;
    }
    function dropBlock(group) { scene.remove(group); group.traverse((o) => { if (o.userData.own && o.geometry) o.geometry.dispose(); }); }

    // --- the school gate at the end of the day's street -------------------------------------------------
    let gate = null;
    const kidSpot = new THREE.Vector3();
    function buildGate(L) {
      if (gate) dropBlock(gate);
      const B = buckets();
      const z = L + 9, c = roadCenter(z);
      for (const side of [-1, 1]) {
        B.box('cream', c + side * 3.5, 1.7, -z, 0.8, 3.4, 0.8, 0, 0.05);
        B.box('ink', c + side * 3.5, 3.5, -z, 1.0, 0.22, 1.0);
        B.box('ink', c + side * 10.5, 1.1, -z, 13.2, 2.2, 0.4);
        B.box('cream', c + side * 10.5, 2.28, -z, 13.4, 0.16, 0.5);
        for (let k = 0; k < 7; k++) { // one open leaf of the iron gate, swung outward
          const r = 0.25 + k * 0.38;
          B.box('ink', c + side * (3.2 + r * 0.42), 1.35, -(z + 0.3 + r * 0.9), 0.07, 2.7, 0.07);
        }
        B.box('ink', c + side * (3.2 + 2.6 * 0.42 * 0.5), 2.6, -(z + 0.3 + 1.25), 0.07, 0.09, 2.5, side * 0.44);
        B.box('ink', c + side * (3.2 + 2.6 * 0.42 * 0.5), 0.35, -(z + 0.3 + 1.25), 0.07, 0.09, 2.5, side * 0.44);
        tree(B, c + side * 7.5, z + 6, 1.5, side);
        tree(B, c + side * 12, z + 13, 1.8, side * 2);
      }
      const sz = z + 26; // the school
      B.box('ink', c, 4.5, -sz, 26, 9, 8);
      B.box('ink', c, 10.5, -sz, 6, 4, 6);
      for (let row = 0; row < 2; row++) for (let k = -4; k <= 4; k++) if (k !== 0 || row === 1) B.box('cream', c + k * 2.7, 2.6 + row * 3.4, -(sz - 4.05), 1.5, 1.9, 0.1);
      B.box('cream', c, 1.6, -(sz - 4.05), 2.2, 3.2, 0.1);
      B.add('cream', new THREE.CylinderGeometry(1.25, 1.25, 0.1, 24), mat4(c, 10.7, -(sz - 3.05)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
      B.box('ink', c, 11.05, -(sz - 3.12), 0.12, 0.8, 0.05);
      B.box('ink', c + 0.3, 10.7, -(sz - 3.12), 0.6, 0.12, 0.05);
      gate = B.into(new THREE.Group());
      kidSpot.set(roadCenter(L + 3.4), 0, -(L + 3.4));
      const patch = new THREE.Mesh(new THREE.CircleGeometry(2.4, 40), mats.light); // the patch of light she waits in
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(kidSpot.x, 0.02, kidSpot.z);
      patch.userData.own = true;
      gate.add(patch);
      scene.add(gate);
    }

    // --- sky: sun, the disc that eats it, cloud bank and smoke, all riding along with the camera ----------
    const sky = new THREE.Group();
    const skyMat = (c) => new THREE.MeshBasicMaterial({ color: c, fog: false, depthWrite: false });
    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(9, 48), skyMat(0xfff4d8));
    const sunRing = new THREE.Mesh(new THREE.RingGeometry(9, 9.5, 48), skyMat(P.ink));
    const moon = new THREE.Mesh(new THREE.CircleGeometry(8.5, 48), skyMat(P.ink));
    sunDisc.position.set(0, 27, -200); sunRing.position.set(0, 27, -199.9); moon.position.set(30, 27, -199.5);
    const cloudMat = skyMat(0x10181d), smokeMat = skyMat(0x151d22);
    const clouds = [], smoke = [];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), cloudMat);
      m.userData = { x: (noise(i) - 0.5) * 220, z: -190 + noise(i + 9) * 60, s: 22 + noise(i + 5) * 22 };
      clouds.push(m); sky.add(m);
    }
    for (let c = 0; c < 3; c++) for (let k = 0; k < 7; k++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), smokeMat);
      m.userData = { c, k, x: [-58, 44, 86][c], z: [-185, -170, -195][c] };
      smoke.push(m); sky.add(m);
    }
    sky.add(sunDisc, sunRing, moon);
    // sky pieces do not write depth, so their order is fixed by hand: sun, its ring, the disc that eats it, then cloud and smoke
    sunDisc.renderOrder = 1; sunRing.renderOrder = 2; moon.renderOrder = 3;
    for (const m of clouds) m.renderOrder = 4;
    for (const m of smoke) m.renderOrder = 4;
    scene.add(sky);

    const CREAM = new THREE.Color(P.cream), NIGHT = new THREE.Color(0x1a242c), FLASH = new THREE.Color(0xefe3c8), WHITE = new THREE.Color(0xffffff), DIM = new THREE.Color(0xc4bcab);
    let dark = 0, flashUntil = -1, nextFlash = 6;

    // --- traffic ----------------------------------------------------------------------------------------
    const live = new Map();
    const lampGeo = new THREE.BoxGeometry(0.22, 0.14, 0.06);
    function addCar(car) {
      const model = assets.traffic[car.id % assets.traffic.length].clone();
      model.scale.setScalar(CAR_SCALE);
      const wheels = [];
      model.traverse((o) => { if (o.name && o.name.startsWith('wheel')) wheels.push(o); });
      const lamps = new THREE.Group();
      for (const sx of [-1, 1]) { const l = new THREE.Mesh(lampGeo, mats.glow); l.position.set(sx * 0.45, 0.5, 1.02); lamps.add(l); }
      model.add(lamps);
      scene.add(model);
      live.set(car.id, { model, wheels, lamps, spin: 0 });
    }
    function syncCars(cars, time, dt) {
      const seen = new Set();
      for (const car of cars) {
        if (!live.has(car.id)) addCar(car);
        seen.add(car.id);
        const e = live.get(car.id);
        let x = car.x, yaw = 0, y = 0;
        if (car.knockedAt !== undefined) {
          const k = Math.min(1, (time - car.knockedAt) / 0.9);
          x += car.knockSide * 3.2 * Math.sin((k * Math.PI) / 2); yaw = car.knockSide * 1.4 * k; y = Math.sin(k * Math.PI) * 0.35;
        }
        e.model.position.set(roadCenter(car.z) + x, y, -car.z);
        e.model.rotation.y = -Math.atan(roadSlope(car.z)) + yaw;
        e.lamps.visible = !!(level && level.blackout);
        e.spin += (car.v * dt) / WHEEL_R;
        for (const w of e.wheels) w.rotation.x = e.spin;
      }
      for (const id of [...live.keys()]) if (!seen.has(id)) { scene.remove(live.get(id).model); live.delete(id); }
    }

    const busGroups = [];
    function buildBus(b) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.7, 10.5), mats.ink); body.position.y = 1.85;
      const band = new THREE.Mesh(new THREE.BoxGeometry(2.56, 0.85, 9.4), mats.cream); band.position.y = 2.45;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.56, 0.12, 10.55), mats.cream); stripe.position.y = 1.2;
      const screen = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.1, 10.56), mats.cream); screen.position.y = 2.4;
      g.add(body, band, stripe, screen);
      for (const wz of [-3.3, 3.3]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 2.62, 12), mats.ink); w.rotation.z = Math.PI / 2; w.position.set(0, 0.52, wz); g.add(w); }
      style.addOutline(g, 0.07);
      g.position.set(roadCenter(b.z) - b.side * 1.4, 0, -b.z);
      g.rotation.y = Math.PI / 2 - 0.12 * b.side;
      scene.add(g);
      busGroups.push(g);
    }

    function setLevel(next) {
      level = next;
      for (const g of blocks.values()) dropBlock(g);
      blocks.clear();
      for (const g of busGroups) scene.remove(g);
      busGroups.length = 0;
      syncCars([], 0, 0);
      buildGate(level.length);
      for (const b of level.buses) buildBus(b);
      const night = !!level.blackout;
      scene.fog.near = night ? 5 : 70; scene.fog.far = night ? 46 : 175;
      mats.lamp.color.set(night ? P.ink : P.cream);
      flashUntil = -1; nextFlash = 5;
    }

    function update(distance, time, camera) {
      const first = Math.floor((distance - BEHIND) / BLOCK), last = Math.min(Math.floor((distance + AHEAD) / BLOCK), Math.floor((level.length + 44) / BLOCK));
      for (const [n, g] of blocks) if (n < first || n > last) { dropBlock(g); blocks.delete(n); }
      for (let n = first; n <= last; n++) if (!blocks.has(n)) blocks.set(n, buildBlock(n));

      const s = level.sky || {};
      const turn = s.turn ? smooth(s.turn[0], s.turn[1], distance) : 1;
      dark = s.turn ? s.turn[2] * turn : s.dark || 0;
      const eclipse = s.turn ? smooth(s.turn[0], s.turn[0] + (s.turn[1] - s.turn[0]) * 0.6, distance) : s.eclipse ? 1 : 0;
      let flashing = time < flashUntil;
      if (s.storm || (s.turn && turn > 0.15 && turn < 1)) {
        if (time > nextFlash) { flashUntil = time + 0.12; nextFlash = time + 5 + noise(Math.floor(time)) * 7; flashing = true; api.onThunder && api.onThunder(); }
      }
      const night = !!level.blackout;
      scene.background.copy(CREAM).lerp(NIGHT, dark);
      if (flashing) scene.background.lerp(FLASH, 0.8);
      scene.fog.color.copy(scene.background);
      ambient.intensity = (night ? 0.55 : 1.1 - 0.42 * dark) * (flashing ? 1.8 : 1);
      sun.intensity = night ? 0.5 : 2.4 - 1.0 * dark;
      mats.road.color.copy(WHITE).lerp(DIM, dark * 0.75); mats.walk.color.set(0xe4dccb).lerp(DIM, dark * 0.6); mats.facade.color.copy(WHITE).lerp(DIM, dark * 0.5);
      cloudMat.color.copy(scene.background).multiplyScalar(0.62); smokeMat.color.copy(scene.background).multiplyScalar(0.5).lerp(NIGHT, 0.5);

      sky.position.set(camera.position.x, 0, camera.position.z);
      const showSun = !night && (s.turn || s.eclipse || dark < 0.3);
      sunDisc.visible = sunRing.visible = showSun;
      moon.visible = showSun && eclipse > 0.01;
      moon.position.x = 30 * (1 - eclipse); moon.material.color.copy(scene.background).multiplyScalar(0.55);
      for (const m of clouds) {
        const u = m.userData, k = smooth(0.1, 0.9, dark);
        m.visible = k > 0.02 && !night;
        m.position.set(u.x + Math.sin(time * 0.05 + u.x) * 6, 95 - k * 38 + u.s * 0.2, u.z);
        m.scale.set(u.s * (0.4 + k) * 1.8, u.s * 0.45 * (0.4 + k), u.s);
      }
      for (const m of smoke) {
        const u = m.userData, rise = ((time * 0.06 + u.k / 7 + u.c * 0.3) % 1);
        m.visible = dark > 0.15 && !night;
        m.position.set(u.x + Math.sin(rise * 5 + u.c) * 5 + rise * 14, 10 + rise * 75, u.z);
        m.scale.setScalar(4 + rise * 13);
      }
    }

    const api = { setLevel, update, syncCars, kidSpot, mats, ambient, sun, roadCenter, roadSlope, onThunder: null, get dark() { return dark; }, flash(time) { flashUntil = time + 0.12; } };
    return api;
  }

  root.AsaWorld = { createWorld, roadCenter, roadSlope, CAR_SCALE };
})(typeof self !== 'undefined' ? self : this);
