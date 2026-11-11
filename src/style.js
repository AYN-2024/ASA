// After School · controls lab v3 (3D) · the graphic style as a way of rendering 3D:
// flat two-step toon shading, ink outlines (inverted hull), palette-only colours, light from the upper left.
(function (root) {
  'use strict';

  const PALETTE = Object.freeze({
    cream: 0xf6e5c7,
    ink: 0x0a1115,
    inkLift: 0x26323a,  // ink in light (two-step shade), not a new hue
    red: 0xbc2b20,
    zombie: 0x1f4b8f,
    tree: 0x3a5f9e,
  });

  function createStyle(THREE) {
    // Two flat steps: shadow and light, no gradient (C-01: "flat two-step shade").
    const steps = new Uint8Array([90, 90, 90, 255, 255, 255, 255, 255]);
    const gradientMap = new THREE.DataTexture(steps, 2, 1, THREE.RGBAFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;

    const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap, ...extra });
    const outlineMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.ink, side: THREE.BackSide });

    // Inverted hull: a slightly larger back-face copy in ink behind every mesh.
    function addOutline(object, thickness = 0.035) {
      const meshes = [];
      object.traverse((o) => { if (o.isMesh && !o.userData.isOutline) meshes.push(o); });
      for (const mesh of meshes) {
        const hull = new THREE.Mesh(mesh.geometry, outlineMaterial);
        hull.userData.isOutline = true;
        mesh.geometry.computeBoundingSphere();
        const r = mesh.geometry.boundingSphere ? mesh.geometry.boundingSphere.radius : 1;
        hull.scale.setScalar(1 + thickness / Math.max(r, 0.05));
        hull.position.copy(mesh.geometry.boundingSphere.center).multiplyScalar(-(hull.scale.x - 1));
        mesh.add(hull);
      }
      return object;
    }

    // Kenney's colormap swatches → cream (glass, white, light colours) or ink (paint, rubber, dark grey).
    function recolorPalette(image) {
      const c = document.createElement('canvas');
      c.width = image.width;
      c.height = image.height;
      const g = c.getContext('2d');
      g.drawImage(image, 0, 0);
      const px = g.getImageData(0, 0, c.width, c.height);
      const d = px.data;
      const cream = [0xf6, 0xe5, 0xc7];
      const ink = [0x0a, 0x11, 0x15];
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i] / 255;
        const gr = d[i + 1] / 255;
        const b = d[i + 2] / 255;
        const lum = 0.2126 * r + 0.7152 * gr + 0.0722 * b;
        const glass = b > r + 0.08 && lum > 0.55;
        const pick = lum > 0.8 || glass ? cream : ink;
        d[i] = pick[0]; d[i + 1] = pick[1]; d[i + 2] = pick[2];
      }
      g.putImageData(px, 0, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false; // glTF UV convention
      tex.magFilter = THREE.NearestFilter;
      return tex;
    }

    function paintKenney(model, paletteTexture) {
      const material = new THREE.MeshToonMaterial({ map: paletteTexture, gradientMap });
      model.traverse((o) => { if (o.isMesh) o.material = material; });
      return addOutline(model, 0.03);
    }

    // Paper grain overlay texture (screen space), ink specks on transparent.
    function grainCanvas(size = 256) {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const g = c.getContext('2d');
      const img = g.createImageData(size, size);
      for (let i = 0; i < img.data.length; i += 4) {
        const n = Math.random();
        img.data[i] = 10; img.data[i + 1] = 17; img.data[i + 2] = 21;
        img.data[i + 3] = n > 0.82 ? Math.floor((n - 0.82) * 380) : 0;
      }
      g.putImageData(img, 0, 0);
      return c;
    }

    return { PALETTE, gradientMap, toon, addOutline, recolorPalette, paintKenney, grainCanvas };
  }

  root.AsaStyle = { createStyle, PALETTE };
})(typeof self !== 'undefined' ? self : this);
