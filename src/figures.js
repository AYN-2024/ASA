// After School · V0 · the people: zombies built on the creator's Tripo bust, fleeing adults, and the daughter.
// Each figure is one skinned mesh (plus its ink outline) on a small skeleton, so limbs animate with few draw calls.
// Figure space: metres, feet on y = 0, facing +z. Left is +x.
(function (root) {
  'use strict';

  const BLUE = 0x1f4b8f, INK = 0x0a1115, CREAM = 0xf6e5c7, TAN = 0xd9a57a, NAVY = 0x1b2a44, BROWN = 0x9a6b3f;
  const BUST_SCALE = 0.42;
  const BUST_Y = 1.42;
  const ARM = [0.29, 0.27]; // upper arm and forearm lengths, m

  const JOINT = {
    hips: [0, 0.95, 0], spine: [0, 1.08, 0], chest: [0, 1.25, 0], head: [0, 1.546, -0.01],
    upperArmL: [0.215, 1.44, 0], foreArmL: [0.215, 1.15, 0], handL: [0.215, 0.88, 0],
    upperArmR: [-0.215, 1.44, 0], foreArmR: [-0.215, 1.15, 0], handR: [-0.215, 0.88, 0],
    thighL: [0.095, 0.93, 0], shinL: [0.095, 0.49, 0], thighR: [-0.095, 0.93, 0], shinR: [-0.095, 0.49, 0],
  };
  const PARENT = {
    spine: 'hips', chest: 'spine', head: 'chest', upperArmL: 'chest', foreArmL: 'upperArmL', handL: 'foreArmL',
    upperArmR: 'chest', foreArmR: 'upperArmR', handR: 'foreArmR', thighL: 'hips', shinL: 'thighL', thighR: 'hips', shinR: 'thighR',
  };
  const ORDER = Object.keys(JOINT);
  const BONE = Object.fromEntries(ORDER.map((n, i) => [n, i]));
  const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

  // The colour rule for the creator's bust, in the bust's own units (1.0 tall, face toward +z). Tuned by eye on 11 Nov 2026.
  const HAIRLINE = [[-0.37, 0.40], [-0.16, 0.48], [-0.06, 0.70], [0.05, 0.74], [0.22, 0.80], [0.40, 0.80]];
  function hairline(z) {
    for (let i = 0; i < HAIRLINE.length - 1; i++) {
      if (z <= HAIRLINE[i + 1][0]) { const t = Math.max(0, Math.min(1, (z - HAIRLINE[i][0]) / (HAIRLINE[i + 1][0] - HAIRLINE[i][0]))); return HAIRLINE[i][1] + (HAIRLINE[i + 1][1] - HAIRLINE[i][1]) * t; }
    }
    return 0.8;
  }
  function bustColor(x, y, z, nz) {
    const ax = Math.abs(x);
    if (Math.hypot(ax - 0.095, y - 0.651) < 0.058 && z > 0.17) return INK;           // eye sockets
    if (z > 0.2 && (x / 0.055) ** 2 + ((y - 0.447) / 0.022) ** 2 < 1) return nz > 0.3 ? CREAM : INK; // teeth and the gaps between them
    if (y > hairline(z)) return INK;                                                // hair
    if (ax > 0.27 && y > 0.66) return INK;                                          // spikes at the temples
    if (y < 0.30 && (z < 0.02 || (y < 0.27 && ax > 0.105 + (0.27 - y) * 0.3))) return CREAM; // shirt and collar
    return BLUE;
  }

  function createFigures(THREE, style, assets) {
    const mainMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: style.gradientMap, side: THREE.DoubleSide });
    const lineMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff6dc });
    const inkMat = new THREE.MeshBasicMaterial({ color: INK });
    const handMat = new THREE.MeshToonMaterial({ color: BLUE, gradientMap: style.gradientMap });
    const color = new THREE.Color();
    const M = new THREE.Matrix4();

    // Collects parts as flat triangles with per-vertex colour and bone weights.
    function builder() {
      const P = [], N = [], C = [], SI = [], SW = [];
      // paint(x,y,z,nz) -> hex for a triangle (by its centre) · weigh(x,y,z) -> [boneA, boneB, weightOfB]
      function add(source, matrix, paint, weigh) {
        const g = source.index ? source.toNonIndexed() : source.clone();
        if (matrix) g.applyMatrix4(matrix);
        const p = g.attributes.position, n = g.attributes.normal;
        for (let t = 0; t < p.count; t += 3) {
          const cx = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3, cy = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3, cz = (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3;
          const hex = typeof paint === 'function' ? paint(cx, cy, cz, (n.getZ(t) + n.getZ(t + 1) + n.getZ(t + 2)) / 3) : paint;
          if (hex === null) continue;
          color.set(hex);
          for (let k = t; k < t + 3; k++) {
            const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
            P.push(x, y, z); N.push(n.getX(k), n.getY(k), n.getZ(k)); C.push(color.r, color.g, color.b);
            const w = typeof weigh === 'function' ? weigh(x, y, z) : [weigh, weigh, 0];
            SI.push(BONE[w[0]], BONE[w[1]], 0, 0); SW.push(1 - w[2], w[2], 0, 0);
          }
        }
      }
      function build(inflate) {
        const g = new THREE.BufferGeometry();
        const pos = inflate ? P.map((v, i) => v + N[i] * inflate) : P;
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
        if (!inflate) g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
        g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
        g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
        return g;
      }
      return { add, build };
    }

    const at = (x, y, z, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
    const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 3, 8);

    // A ragged hem: a ring of hanging points.
    function hem(rx, rz, y, minLen, maxLen, count) {
      const pos = [], nor = [];
      for (let i = 0; i < count; i++) {
        const a0 = (i / count) * Math.PI * 2, a1 = ((i + 1) / count) * Math.PI * 2, am = (a0 + a1) / 2;
        const len = minLen + (maxLen - minLen) * (0.5 + 0.5 * Math.sin(i * 12.9898 + 4.1));
        pos.push(Math.sin(a0) * rx, y, Math.cos(a0) * rz, Math.sin(a1) * rx, y, Math.cos(a1) * rz, Math.sin(am) * rx * 1.12, y - len, Math.cos(am) * rz * 1.12);
        for (const a of [a0, a1, am]) nor.push(Math.sin(a), 0, Math.cos(a));
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      return g;
    }

    function limbs(b, o) {
      for (const [S, sx] of [['L', 1], ['R', -1]]) {
        b.add(capsule(0.048, 0.22), at(sx * 0.215, 1.295, 0), (x, y) => (y > o.sleeveTo ? o.sleeve : o.skin), `upperArm${S}`);
        b.add(capsule(0.042, 0.2), at(sx * 0.215, 1.015, 0), o.skin, `foreArm${S}`);
        b.add(new THREE.BoxGeometry(0.075, 0.1, 0.04), at(sx * 0.215, 0.83, 0), o.skin, `hand${S}`);
        b.add(capsule(0.075, 0.3), at(sx * 0.095, 0.71, 0), o.legs, `thigh${S}`);
        b.add(capsule(0.058, 0.3), at(sx * 0.095, 0.275, 0), (x, y) => (y > o.cuff ? o.legs : o.skin), `shin${S}`);
        b.add(new THREE.BoxGeometry(0.085, 0.06, 0.23), at(sx * 0.095, 0.03, 0.065), o.feet, `shin${S}`);
      }
      b.add(capsule(0.13, 0.08), at(0, 0.93, 0, 1.15, 1, 0.8), o.legs, 'hips');
      b.add(capsule(0.16, 0.22), at(0, 1.17, 0, 1.1, 1, 0.72), o.shirt, (x, y) => ['spine', 'chest', smooth(1.1, 1.3, y)]);
    }

    // --- the zombie: the creator's bust on a ragged body ---------------------------------------------
    function zombieGeometry() {
      const b = builder();
      limbs(b, { skin: BLUE, sleeve: CREAM, sleeveTo: 1.3, legs: INK, cuff: 0.19, feet: BLUE, shirt: CREAM });
      b.add(hem(0.178, 0.122, 1.0, 0.08, 0.24, 14), null, CREAM, 'hips');
      for (const sx of [1, -1]) b.add(hem(0.064, 0.064, 0.2, 0.03, 0.09, 8), at(sx * 0.095, 0, 0), INK, sx > 0 ? 'shinL' : 'shinR');
      const bust = assets.bust;
      const toFigure = at(0, BUST_Y, 0, BUST_SCALE, BUST_SCALE, BUST_SCALE);
      const inv = 1 / BUST_SCALE;
      // the bust's two tiny eye domes fall inside the ink sockets; the glowing eyes are separate meshes on the head bone
      b.add(bust, toFigure,
        (x, y, z, nz) => { const ux = x * inv, uy = (y - BUST_Y) * inv, uz = z * inv; return bustColor(ux, uy, uz, nz); },
        (x, y, z) => ['chest', 'head', smooth(0.24, 0.34, (y - BUST_Y) * inv + Math.max(0, z * inv - 0.1) * 0.3)]);
      return { main: b.build(0), line: b.build(0.011) };
    }

    function civGeometry(shirt) {
      const b = builder();
      limbs(b, { skin: TAN, sleeve: shirt, sleeveTo: 1.2, legs: INK, cuff: 0.1, feet: INK, shirt });
      b.add(new THREE.CylinderGeometry(0.05, 0.055, 0.12, 8), at(0, 1.5, 0), TAN, 'chest');
      b.add(new THREE.SphereGeometry(0.115, 12, 9), at(0, 1.64, 0, 1, 1.12, 1), TAN, 'head');
      b.add(new THREE.SphereGeometry(0.124, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), at(0, 1.652, -0.012, 1, 1.12, 1.05), INK, 'head');
      return { main: b.build(0), line: b.build(0.011) };
    }

    function kidGeometry() {
      const b = builder();
      limbs(b, { skin: TAN, sleeve: CREAM, sleeveTo: 1.25, legs: TAN, cuff: 9, feet: INK, shirt: NAVY });
      for (const sx of [1, -1]) b.add(capsule(0.062, 0.1), at(sx * 0.095, 0.16, 0), CREAM, sx > 0 ? 'shinL' : 'shinR'); // socks
      b.add(new THREE.CylinderGeometry(0.17, 0.33, 0.4, 14, 1, true), at(0, 0.84, 0, 1, 1, 0.8), NAVY, 'hips');   // pinafore skirt
      b.add(new THREE.BoxGeometry(0.3, 0.34, 0.14), at(0, 1.2, -0.17), BROWN, 'chest');                             // backpack
      b.add(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8), at(0, 1.5, 0), TAN, 'chest');
      b.add(new THREE.SphereGeometry(0.2, 14, 10), at(0, 1.72, 0), TAN, 'head');
      b.add(new THREE.SphereGeometry(0.214, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.5), at(0, 1.735, -0.01), INK, 'head'); // hair cap
      b.add(new THREE.BoxGeometry(0.44, 0.3, 0.3), at(0, 1.66, -0.07), (x, y, z) => (z > 0.07 ? null : INK), 'head');    // the bob at the back and sides
      b.add(new THREE.BoxGeometry(0.3, 0.07, 0.03), at(0, 1.85, 0.185), INK, 'head');                                   // fringe
      return { main: b.build(0), line: b.build(0.013) };
    }

    function zombieFarGeometry() {
      const b = builder();
      limbs(b, { skin: BLUE, sleeve: CREAM, sleeveTo: 1.3, legs: INK, cuff: 0.19, feet: BLUE, shirt: CREAM });
      b.add(hem(0.178, 0.122, 1.0, 0.08, 0.24, 14), null, CREAM, 'hips');
      b.add(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 6), at(0, 1.5, 0), BLUE, 'chest');
      b.add(new THREE.SphereGeometry(0.115, 8, 6), at(0, 1.66, 0.01, 1, 1.2, 1.05), BLUE, 'head');
      b.add(new THREE.SphereGeometry(0.13, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.5), at(0, 1.7, -0.015, 1.05, 1.1, 1.1), INK, 'head');
      return { main: b.build(0), line: b.build(0.012) };
    }

    const GEO = { zombie: zombieGeometry(), zombieFar: zombieFarGeometry(), civA: civGeometry(CREAM), civB: civGeometry(INK), kid: kidGeometry() };
    const eyeGeo = new THREE.SphereGeometry(0.017, 8, 6);
    const down = new THREE.Vector3(0, -1, 0);
    const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
    const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();

    function make(kind, seed) {
      const geo = GEO[kind];
      const group = new THREE.Group();
      group.rotation.order = 'YXZ';
      const bones = {};
      for (const name of ORDER) {
        const bone = new THREE.Bone();
        bone.name = name;
        const p = JOINT[name], q = PARENT[name] ? JOINT[PARENT[name]] : [0, 0, 0];
        bone.position.set(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
        bones[name] = bone;
        if (PARENT[name]) bones[PARENT[name]].add(bone);
      }
      group.add(bones.hips);
      bones.hips.updateMatrixWorld(true);
      const skeleton = new THREE.Skeleton(ORDER.map((n) => bones[n]));
      const identity = new THREE.Matrix4();
      const mesh = new THREE.SkinnedMesh(geo.main, mainMat);
      const line = new THREE.SkinnedMesh(geo.line, lineMat);
      for (const m of [mesh, line]) { m.bind(skeleton, identity); m.frustumCulled = false; group.add(m); }
      const f = { kind, seed: seed || 0, group, bones, mesh, line, hands: null, face: null, far: null, isFar: false };
      const onHead = (obj, x, y, z) => { obj.position.set(x - JOINT.head[0], y - JOINT.head[1], z - JOINT.head[2]); bones.head.add(obj); return obj; };
      if (kind === 'zombie') {
        f.far = [new THREE.SkinnedMesh(GEO.zombieFar.main, mainMat), new THREE.SkinnedMesh(GEO.zombieFar.line, lineMat)];
        for (const m of f.far) { m.bind(skeleton, identity); m.frustumCulled = false; m.visible = false; group.add(m); }
        for (const sx of [1, -1]) { const eye = onHead(new THREE.Mesh(eyeGeo, eyeMat), sx * 0.0399, BUST_Y + 0.651 * BUST_SCALE, 0.118); eye.scale.z = 0.5; }
      }
      if (kind === 'kid') {
        const face = { eyes: [], brows: [], frown: null, smile: null };
        for (const sx of [1, -1]) {
          const eye = onHead(new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), inkMat), sx * 0.075, 1.71, 0.182); eye.scale.z = 0.5; face.eyes.push(eye);
          const brow = onHead(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.014, 0.01), inkMat), sx * 0.075, 1.765, 0.19); brow.userData.sx = sx; face.brows.push(brow);
        }
        face.frown = onHead(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.01), inkMat), 0, 1.625, 0.19);
        face.smile = onHead(new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.007, 4, 10, Math.PI), inkMat), 0, 1.645, 0.19);
        face.smile.rotation.z = Math.PI; face.smile.visible = false;
        f.face = face;
        group.scale.setScalar(0.66);
      }
      return f;
    }

    function reset(f) {
      for (const n of ORDER) f.bones[n].rotation.set(0, 0, 0);
      f.bones.hips.position.set(0, 0.95, 0);
    }

    // --- poses: each sets bone rotations for time t (seconds) -------------------------------------------
    const POSE = {
      walk(f, t) {
        const b = f.bones, ph = t * 5.2 + f.seed * 6.28;
        b.thighL.rotation.x = -Math.sin(ph) * 0.42; b.thighR.rotation.x = Math.sin(ph) * 0.42;
        b.shinL.rotation.x = Math.max(0, Math.cos(ph)) * 0.55 + 0.08; b.shinR.rotation.x = Math.max(0, -Math.cos(ph)) * 0.55 + 0.08;
        b.hips.position.y = 0.93 + Math.abs(Math.cos(ph)) * 0.025; b.hips.rotation.z = Math.sin(ph) * 0.07;
        b.spine.rotation.x = 0.16; b.chest.rotation.x = 0.1; b.chest.rotation.z = Math.sin(ph + 1) * 0.06;
        b.head.rotation.x = -0.2 + Math.sin(ph * 0.5) * 0.07; b.head.rotation.z = 0.2 * (f.seed > 0.5 ? 1 : -1) + Math.sin(ph * 0.5 + f.seed) * 0.08;
        b.upperArmL.rotation.x = -1.35 + Math.sin(ph * 0.5) * 0.1; b.upperArmR.rotation.x = -1.02 + Math.sin(ph * 0.5 + 2) * 0.13;
        b.upperArmL.rotation.z = 0.12; b.upperArmR.rotation.z = -0.1;
        b.foreArmL.rotation.x = -0.25; b.foreArmR.rotation.x = -0.45; b.handL.rotation.x = 0.5; b.handR.rotation.x = 0.4;
      },
      stand(f, t) {
        const b = f.bones, ph = t * 1.3 + f.seed * 6.28;
        b.spine.rotation.x = 0.1; b.head.rotation.z = 0.25 + Math.sin(ph) * 0.06; b.head.rotation.x = -0.1;
        b.upperArmL.rotation.x = -0.15 + Math.sin(ph) * 0.05; b.upperArmR.rotation.x = -0.4 + Math.sin(ph + 1) * 0.06; b.foreArmR.rotation.x = -0.5;
        b.chest.rotation.z = Math.sin(ph * 0.7) * 0.04;
      },
      run(f, t) {
        const b = f.bones, ph = t * 11 + f.seed * 6.28;
        b.thighL.rotation.x = -Math.sin(ph) * 0.9; b.thighR.rotation.x = Math.sin(ph) * 0.9;
        b.shinL.rotation.x = Math.max(0, Math.cos(ph)) * 1.3 + 0.2; b.shinR.rotation.x = Math.max(0, -Math.cos(ph)) * 1.3 + 0.2;
        b.hips.position.y = 0.93 + Math.abs(Math.cos(ph)) * 0.05;
        b.spine.rotation.x = 0.28; b.head.rotation.x = -0.2;
        b.upperArmL.rotation.x = Math.sin(ph) * 0.9; b.upperArmR.rotation.x = -Math.sin(ph) * 0.9;
        b.foreArmL.rotation.x = -1.5; b.foreArmR.rotation.x = -1.5;
      },
      // tumbling through the air or sprawled on the road (amt 1 = flailing, 0 = still)
      flail(f, t, amt) {
        const b = f.bones, s = f.seed * 10, a = amt === undefined ? 1 : amt;
        b.upperArmL.rotation.set(Math.sin(t * 13 + s) * 1.2 * a - 0.4, 0, 1.2 + Math.sin(t * 9 + s) * 0.5 * a);
        b.upperArmR.rotation.set(Math.sin(t * 11 + s + 2) * 1.2 * a - 0.4, 0, -1.2 + Math.sin(t * 10 + s) * 0.5 * a);
        b.foreArmL.rotation.x = -0.6 + Math.sin(t * 15 + s) * 0.5 * a; b.foreArmR.rotation.x = -0.6 + Math.sin(t * 14 + s) * 0.5 * a;
        b.thighL.rotation.set(-0.5 + Math.sin(t * 12 + s) * 0.8 * a, 0, 0.3); b.thighR.rotation.set(-0.3 + Math.sin(t * 10 + s + 1) * 0.8 * a, 0, -0.3);
        b.shinL.rotation.x = 0.7 + Math.sin(t * 9 + s) * 0.5 * a; b.shinR.rotation.x = 0.5 + Math.sin(t * 8 + s) * 0.5 * a;
        b.head.rotation.set(-0.4 * a, Math.sin(t * 7 + s) * 0.5 * a, 0.3);
        b.spine.rotation.x = -0.25 * a;
      },
      // hugging the steering column with the legs; the arms are placed by armIK afterwards
      cling(f, t, climb) {
        const b = f.bones, wob = Math.sin(t * 7 + f.seed * 9);
        b.thighL.rotation.set(-1.25 - climb * 0.2, 0, 0.55); b.thighR.rotation.set(-1.25 - climb * 0.2, 0, -0.55);
        b.shinL.rotation.x = 1.7; b.shinR.rotation.x = 1.7;
        b.spine.rotation.x = 0.1 + climb * 0.1; b.chest.rotation.x = 0.05 + climb * 0.1; b.chest.rotation.z = wob * 0.05;
        b.head.rotation.set(-0.55 + climb * 0.2 + Math.sin(t * 11) * 0.05, wob * 0.12, wob * 0.1);
        b.handL.rotation.x = -0.5; b.handR.rotation.x = -0.5;
      },
      // dragged behind the scooter, hands on the rail (set by armIK)
      hang(f, t) {
        const b = f.bones, k = t * 9 + f.seed * 5;
        b.spine.rotation.x = -0.3; b.chest.rotation.x = -0.25; b.head.rotation.set(-0.9 + Math.sin(k) * 0.06, Math.sin(k * 0.6) * 0.2, 0);
        b.thighL.rotation.x = 0.25 + Math.sin(k) * 0.2; b.thighR.rotation.x = 0.35 + Math.sin(k + 2) * 0.2;
        b.shinL.rotation.x = 0.3 + Math.sin(k + 1) * 0.25; b.shinR.rotation.x = 0.2 + Math.sin(k + 3) * 0.25;
      },
      // the daughter waiting: arms folded, one foot tapping; mood 0 = annoyed, 1 = happy
      kid(f, t, mood) {
        const b = f.bones, m = mood || 0, tap = Math.max(0, Math.sin(t * 9)) * (1 - m);
        b.upperArmL.rotation.set(-0.5 * (1 - m), 0, -0.25 * (1 - m) + 0.1 * m); b.upperArmR.rotation.set(-0.5 * (1 - m), 0, 0.25 * (1 - m) - 0.1 * m);
        b.foreArmL.rotation.set(-1.5 * (1 - m), 0, -0.9 * (1 - m)); b.foreArmR.rotation.set(-1.4 * (1 - m), 0, 0.9 * (1 - m));
        b.thighR.rotation.x = -0.12 * tap; b.shinR.rotation.x = 0.1 * tap;
        b.hips.rotation.z = 0.06 * (1 - m); b.chest.rotation.z = -0.05 * (1 - m);
        b.head.rotation.set(-0.42, 0, 0.1 * (1 - m) + Math.sin(t * 2) * 0.03);
        b.hips.position.y = 0.95 + m * Math.abs(Math.sin(t * 7)) * 0.03;
        if (f.face) {
          for (const brow of f.face.brows) brow.rotation.z = -brow.userData.sx * 0.45 * (1 - m);
          f.face.frown.visible = m < 0.5; f.face.smile.visible = m >= 0.5;
        }
      },
    };

    function pose(f, name, t, a) { reset(f); POSE[name](f, t, a); }

    // Two-bone reach: puts the hand of one arm on a world-space target. pole is the way the elbow should point.
    function armIK(f, side, target, pole) {
      const up = f.bones[`upperArm${side}`], fo = f.bones[`foreArm${side}`], par = up.parent;
      up.updateWorldMatrix(true, false);
      const S = v1.setFromMatrixPosition(up.matrixWorld);
      par.getWorldQuaternion(q1);
      const sc = up.getWorldScale(v4).x;
      const L1 = ARM[0] * sc, L2 = ARM[1] * sc;
      const d = v2.copy(target).sub(S);
      const dist = Math.max(0.02, Math.min((L1 + L2) * 0.999, d.length()));
      d.normalize();
      const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
      const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      const bend = v3.copy(pole).addScaledVector(d, -pole.dot(d));
      if (bend.lengthSq() < 1e-6) bend.set(0, -1, 0);
      bend.normalize();
      const u = bend.multiplyScalar(h).addScaledVector(d, a); // elbow relative to the shoulder
      const fdir = v4.copy(d).multiplyScalar(dist).sub(u).normalize(); // forearm direction, world
      u.normalize();
      q2.copy(q1).invert();
      up.quaternion.setFromUnitVectors(down, u.applyQuaternion(q2));
      q2.copy(q1).multiply(up.quaternion).invert();
      fo.quaternion.setFromUnitVectors(down, fdir.applyQuaternion(q2));
    }

    // The creator's Tripo hand, as a pair to hang on a zombie's wrists while he is on the handlebar.
    function heroHands() {
      const src = assets.hand;
      const out = {};
      for (const [S, mirror] of [['R', false], ['L', true]]) {
        const g = src.clone();
        if (mirror) {
          g.scale(-1, 1, 1);
          const idx = g.index.array;
          for (let i = 0; i < idx.length; i += 3) { const k = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = k; }
        }
        const hull = g.clone();
        const p = hull.attributes.position, n = hull.attributes.normal;
        for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * 0.028, p.getY(i) + n.getY(i) * 0.028, p.getZ(i) + n.getZ(i) * 0.028);
        const hand = new THREE.Group();
        hand.add(new THREE.Mesh(g, handMat), new THREE.Mesh(hull, lineMat));
        hand.scale.setScalar(0.25);
        hand.rotation.x = Math.PI; // fingers along the arm, palm down when the arm reaches forward
        out[S] = hand;
      }
      return out;
    }
    function giveHands(f, hands) { takeHands(f); f.hands = hands; f.bones.handL.add(hands.L); f.bones.handR.add(hands.R); }
    function takeHands(f) { if (!f.hands) return; f.bones.handL.remove(f.hands.L); f.bones.handR.remove(f.hands.R); f.hands = null; }

    // far = true swaps the bust for the light head
    function lod(f, far) {
      if (!f.far || f.isFar === far) return;
      f.isFar = far;
      f.mesh.visible = f.line.visible = !far;
      f.far[0].visible = f.far[1].visible = far;
    }

    return { make, pose, reset, armIK, lod, heroHands, giveHands, takeHands, eyeMat, mainMat, JOINT, ARM };
  }

  root.AsaFigures = { createFigures };
})(typeof self !== 'undefined' ? self : this);
